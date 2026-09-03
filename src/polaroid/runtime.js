const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const OBSWebSocket = require('obs-websocket-js').default;
const { sendToDiscord } = require('./discord');
const { parseStreamerBotMessage, safeFilePart, safeRedeemerName } = require('./events');
const { renderPolaroid } = require('./renderer');
const { loadPolaroidConfig, dataDir } = require('./config');
const { appConfig } = require('../app-config');
const { bridgeHub } = require('../bridge-hub');
const { RemoteObsClient } = require('../remote-obs');
const { addEngagementEvent } = require('../db');
const { engagementTelemetry } = require('../engagement-telemetry');

class PolaroidRuntime {
  constructor({
    config = loadPolaroidConfig(),
    obs = new OBSWebSocket(),
    discordSender = sendToDiscord,
    reconnectDelayMs = config.obs.reconnectDelayMs ?? 5000,
    recordEvent = null,
    telemetry = null,
  } = {}) {
    this.config = config;
    this.obs = obs;
    this.discordSender = discordSender;
    this.streamerBot = null;
    this.started = false;
    this.stopping = false;
    this.port = 8787;
    this.capturesDir = path.join(dataDir, 'polaroid-captures');
    this.state = {
      obsConnected: false,
      processing: false,
      queueLength: 0,
      lastCapture: null,
      lastError: '',
      startedAt: new Date().toISOString(),
    };
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);
    this.queue = [];
    this.recentEventIds = new Map();
    this.streamerBotRequests = new Map();
    this.avatarResolverRequests = new Map();
    this.unsubscribeRaw = null;
    this.unsubscribeConnection = null;
    this.obsConnectPromise = null;
    this.obsReconnectTimer = null;
    this.reconnectDelayMs = Math.max(1, Number(reconnectDelayMs) || 5000);
    this.recordEvent = recordEvent;
    this.telemetry = telemetry;

    this.obs.on('ConnectionClosed', () => {
      this.state.obsConnected = false;
      this.publishStatus();
      this.scheduleObsReconnect();
    });
    this.obs.on('StreamStateChanged', (state) => this.telemetry?.handleObsStreamState(state));
  }

  start({ streamerBot, port = 8787 } = {}) {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    this.port = port;
    this.streamerBot = streamerBot;
    fs.mkdir(this.capturesDir, { recursive: true }).catch((error) => this.recordError(error));

    if (this.config.streamerBot.enabled && streamerBot) {
      streamerBot.addEventSubscriptions({ Twitch: ['RewardRedemption'], Custom: ['Event'] });
      this.unsubscribeRaw = streamerBot.onRawMessage((payload) => this.handleStreamerBotMessage(payload));
      this.unsubscribeConnection = streamerBot.onConnectionChange((connected) => {
        if (!connected) this.rejectPendingStreamerBotRequests();
        this.publishStatus();
      });
    }

    this.connectObsWithRetry();
  }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.clearObsReconnectTimer();
    this.unsubscribeRaw?.();
    this.unsubscribeConnection?.();
    this.rejectPendingStreamerBotRequests();
    for (const pending of this.avatarResolverRequests.values()) {
      clearTimeout(pending.timer);
      pending.resolve('');
    }
    this.avatarResolverRequests.clear();
    try { await this.obs.disconnect(); } catch { /* Already disconnected. */ }
    this.started = false;
  }

  log(message, detail = '') {
    console.log(`[Polaroid] ${message}${detail ? ` ${detail}` : ''}`);
  }

  recordError(error) {
    this.state.lastError = error?.message || String(error);
    this.publishStatus();
  }

  async ensureObsConnected() {
    if (this.state.obsConnected) return;
    if (this.obsConnectPromise) return this.obsConnectPromise;

    this.obsConnectPromise = (async () => {
      try {
        await this.obs.connect(this.config.obs.url, this.config.obs.password || undefined, { rpcVersion: 1 });
        this.state.obsConnected = true;
        this.state.lastError = '';
        this.clearObsReconnectTimer();
        this.log('Connected to OBS at', this.config.obs.url);
        this.publishStatus();
        try {
          const streamStatus = await this.obs.call('GetStreamStatus');
          this.telemetry?.handleObsStreamState(streamStatus, { snapshot: true });
        } catch {
          // Older OBS versions may not expose stream status; lifecycle events still work.
        }
      } catch (error) {
        this.state.obsConnected = false;
        this.scheduleObsReconnect();
        throw new Error(`Could not connect to OBS at ${this.config.obs.url}: ${error.message}`);
      } finally {
        this.obsConnectPromise = null;
      }
    })();
    return this.obsConnectPromise;
  }

  connectObsWithRetry() {
    this.ensureObsConnected().catch((error) => {
      const changed = this.state.lastError !== error.message;
      this.recordError(error);
      if (changed) this.log('OBS connection waiting:', error.message);
    });
  }

  scheduleObsReconnect() {
    if (!this.started || this.stopping || this.state.obsConnected || this.obsReconnectTimer) return;
    this.obsReconnectTimer = setTimeout(() => {
      this.obsReconnectTimer = null;
      this.connectObsWithRetry();
    }, this.reconnectDelayMs);
    this.obsReconnectTimer.unref?.();
  }

  clearObsReconnectTimer() {
    if (this.obsReconnectTimer) clearTimeout(this.obsReconnectTimer);
    this.obsReconnectTimer = null;
  }

  async captureCameraSource() {
    await this.ensureObsConnected();
    try {
      const response = await this.obs.call('GetSourceScreenshot', {
        sourceName: this.config.obs.cameraSource,
        imageFormat: 'png',
        imageWidth: Number(this.config.obs.captureWidth) || 1920,
        imageHeight: Number(this.config.obs.captureHeight) || 1080,
        imageCompressionQuality: 100,
      });
      const encoded = String(response.imageData || '').replace(/^data:image\/\w+;base64,/, '');
      if (!encoded) throw new Error('OBS returned an empty image');
      return Buffer.from(encoded, 'base64');
    } catch (error) {
      if (/not connected|socket/i.test(error.message)) {
        this.state.obsConnected = false;
        this.scheduleObsReconnect();
      }
      throw new Error(`Could not screenshot OBS source “${this.config.obs.cameraSource}”: ${error.message}`);
    }
  }

  enqueueRedemption(
    redeemerName,
    source = 'API',
    eventId = '',
    profileImageUrl = '',
    userId = '',
    roles = [],
    { deliverToDiscord = true, isTest = false } = {},
  ) {
    const safeName = safeRedeemerName(redeemerName);
    if (!safeName) throw new Error('A redeemer name is required.');
    if (eventId && this.isDuplicateEvent(eventId)) return null;

    const id = eventId || crypto.randomUUID();
    const job = {
      id, redeemerName: safeName, profileImageUrl, source, userId, roles,
      deliverToDiscord: deliverToDiscord !== false,
      isTest: isTest === true,
    };
    const promise = new Promise((resolve, reject) => {
      this.queue.push(Object.assign(job, { resolve, reject }));
    });
    this.state.queueLength = this.queue.length;
    this.track('redemption_queued', job);
    this.log(`Queued ${source} redemption for`, safeName);
    this.publishStatus();
    void this.runQueue();
    return promise;
  }

  async runQueue() {
    if (this.state.processing) return;
    this.state.processing = true;
    this.publishStatus();
    while (this.queue.length) {
      const job = this.queue.shift();
      this.state.queueLength = this.queue.length;
      this.publishStatus();
      try {
        const photo = await this.processRedemption(job);
        job.resolve?.(photo);
      } catch (error) {
        this.track('capture_failed', job, { error: error.message });
        this.recordError(error);
        this.log('Capture failed:', error.message);
        job.reject?.(error);
      }
    }
    this.state.processing = false;
    this.state.queueLength = 0;
    this.publishStatus();
  }

  async processRedemption(job) {
    if (this.config.captureDelayMs > 0) await delay(this.config.captureDelayMs);
    const screenshot = await this.captureCameraSource();
    const profileImage = await this.downloadProfileImage(job.profileImageUrl);
    const rendered = await renderPolaroid(screenshot, job.redeemerName, this.config.polaroid, profileImage);
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const filename = `${job.isTest ? 'test_' : ''}${timestamp}_${safeFilePart(job.redeemerName)}.jpg`;
    await fs.mkdir(this.capturesDir, { recursive: true });
    await fs.writeFile(path.join(this.capturesDir, filename), rendered);

    const photo = {
      type: 'polaroid',
      id: job.id,
      redeemerName: job.redeemerName,
      createdAt: new Date().toISOString(),
      imageUrl: `/polaroid/captures/${encodeURIComponent(filename)}`,
      showMs: this.config.overlay.showMs,
      gapMs: this.config.overlay.gapMs,
      soundVolume: this.config.overlay.soundVolume,
    };
    this.state.lastCapture = photo;
    this.state.lastError = '';
    this.track('capture_completed', job, { filename, imageUrl: photo.imageUrl });
    this.events.emit('polaroid', photo);
    this.log('Sent capture to overlay:', filename);

    await this.deliverCapture(job, rendered, filename);

    await this.pruneCaptures();
    this.publishStatus();
    return photo;
  }

  async deliverCapture(job, rendered, filename) {
    if (job.deliverToDiscord === false) {
      this.log('Discord and Twitch delivery skipped for test capture.');
      return { skipped: true };
    }

    try {
      const result = await this.discordSender(
        this.config.discord.webhookUrl,
        rendered,
        filename,
        job.redeemerName,
        this.config.discord,
      );
      this.log(result.skipped ? 'Discord delivery skipped.' : 'Posted capture to Discord.');
      await this.postPolaroidToTwitchChat(job.redeemerName, result.attachmentUrl);
    } catch (error) {
      this.track('delivery_failed', job, { error: error.message });
      this.recordError(error);
      this.log('Discord/Twitch delivery failed:', error.message);
      return { skipped: false, error: error.message };
    }
    return { skipped: false };
  }

  async downloadProfileImage(value) {
    if (this.config.polaroid.showProfilePicture === false || !value) return null;
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported avatar URL');
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`avatar server returned ${response.status}`);
      if (!String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
        throw new Error('avatar response was not an image');
      }
      const declaredSize = Number(response.headers.get('content-length')) || 0;
      if (declaredSize > 8 * 1024 * 1024) throw new Error('avatar image was too large');
      const image = Buffer.from(await response.arrayBuffer());
      if (image.length > 8 * 1024 * 1024) throw new Error('avatar image was too large');
      return image;
    } catch (error) {
      this.log('Profile picture unavailable:', error.message);
      return null;
    }
  }

  async pruneCaptures() {
    const keepLast = Math.max(0, Number(this.config.keepLast) || 0);
    if (!keepLast) return;
    const entries = (await fs.readdir(this.capturesDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    await Promise.all(entries.slice(keepLast).map((name) => fs.unlink(path.join(this.capturesDir, name))));
  }

  isDuplicateEvent(eventId) {
    const now = Date.now();
    for (const [id, seenAt] of this.recentEventIds) {
      if (now - seenAt > 10 * 60 * 1000) this.recentEventIds.delete(id);
    }
    if (this.recentEventIds.has(eventId)) return true;
    this.recentEventIds.set(eventId, now);
    return false;
  }

  handleStreamerBotMessage(payload) {
    this.resolveStreamerBotRequest(payload);
    this.resolveAvatarProfileRequest(payload);
    const redemption = parseStreamerBotMessage(payload, this.config.streamerBot);
    if (redemption) void this.handleStreamerBotRedemption(redemption);
  }

  async handleStreamerBotRedemption(redemption) {
    try {
      let profileImageUrl = redemption.profileImageUrl;
      if (
        redemption.source === 'Twitch' &&
        this.config.polaroid.showProfilePicture !== false &&
        this.config.streamerBot.avatarResolverEnabled &&
        !profileImageUrl
      ) {
        profileImageUrl = await this.resolveTwitchProfileImage(redemption);
      }
      this.enqueueRedemption(
        redemption.redeemerName,
        redemption.source,
        redemption.eventId,
        profileImageUrl,
        redemption.userId,
        redemption.roles,
      )?.catch(() => {});
    } catch (error) {
      this.log('Ignored invalid redemption:', error.message);
    }
  }

  async resolveTwitchProfileImage(redemption) {
    const actionName = this.config.streamerBot.avatarResolverActionName;
    const eventId = redemption.eventId || crypto.randomUUID();
    if (!actionName) return '';
    const callback = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.avatarResolverRequests.delete(eventId);
        resolve('');
      }, Math.max(1000, Number(this.config.streamerBot.avatarResolverTimeoutMs) || 4000));
      this.avatarResolverRequests.set(eventId, { resolve, timer });
    });
    try {
      await this.doStreamerBotAction(actionName, {
        redeemerName: redemption.redeemerName,
        userName: redemption.redeemerName,
        eventId,
      });
      return await callback;
    } catch (error) {
      const pending = this.avatarResolverRequests.get(eventId);
      if (pending) {
        clearTimeout(pending.timer);
        this.avatarResolverRequests.delete(eventId);
        pending.resolve('');
      }
      this.log('Avatar lookup failed:', error.message);
      return '';
    }
  }

  resolveAvatarProfileRequest(message) {
    if (
      String(message.event?.source || '').toLowerCase() !== 'custom' ||
      String(message.event?.type || '').toLowerCase() !== 'event'
    ) return;
    const data = message.data || {};
    const eventName = String(data.eventName || data.name || '');
    if (eventName.toLowerCase() !== String(this.config.streamerBot.avatarResolverEventName || '').toLowerCase()) return;
    const args = data.args || data.data || data;
    const eventId = String(args.eventId || '');
    const pending = this.avatarResolverRequests.get(eventId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.avatarResolverRequests.delete(eventId);
    pending.resolve(String(
      args.profileImageUrl || args.targetUserProfileImageUrl || args.targetUserProfileImageURL || ''
    ));
  }

  resolveStreamerBotRequest(message) {
    const pending = this.streamerBotRequests.get(message.id);
    if (!pending || !message.status) return;
    clearTimeout(pending.timer);
    this.streamerBotRequests.delete(message.id);
    if (message.status === 'ok') pending.resolve(message);
    else pending.reject(new Error(message.error || message.message || 'Streamer.bot rejected the action.'));
  }

  doStreamerBotAction(actionName, args) {
    if (!this.streamerBot?.connected) return Promise.reject(new Error('Streamer.bot is not connected.'));
    const id = `polaroid-action-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.streamerBotRequests.delete(id);
        reject(new Error(`Streamer.bot did not acknowledge action “${actionName}”.`));
      }, 5000);
      this.streamerBotRequests.set(id, { resolve, reject, timer });
      if (!this.streamerBot.send({ request: 'DoAction', id, action: { name: actionName }, args })) {
        clearTimeout(timer);
        this.streamerBotRequests.delete(id);
        reject(new Error('Streamer.bot is not connected.'));
      }
    });
  }

  rejectPendingStreamerBotRequests() {
    for (const pending of this.streamerBotRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Streamer.bot disconnected before replying.'));
    }
    this.streamerBotRequests.clear();
  }

  async postPolaroidToTwitchChat(redeemerName, imageUrl) {
    const settings = this.config.twitchChat || {};
    if (!settings.enabled) return { skipped: true };
    if (!settings.actionName) throw new Error('Twitch chat is enabled but twitchChat.actionName is empty.');
    if (!imageUrl) throw new Error('Discord did not return a public image URL for Twitch chat.');
    let chatMessage = String(settings.message || '')
      .replaceAll('{redeemer}', redeemerName)
      .replaceAll('{imageUrl}', imageUrl);
    if (chatMessage.length > 500) chatMessage = `📸 ${imageUrl}`;
    if (chatMessage.length > 500) throw new Error('The public Polaroid URL is too long for Twitch chat.');
    await this.doStreamerBotAction(settings.actionName, { chatMessage, redeemerName, imageUrl });
    return { skipped: false };
  }

  getPublicState() {
    return {
      ...this.state,
      streamerBotConnected: Boolean(this.streamerBot?.connected),
      cameraSource: this.config.obs.cameraSource,
      rewardTitle: this.config.streamerBot.rewardTitle,
      discordConfigured: Boolean(this.config.discord.enabled && this.config.discord.webhookUrl),
      twitchChatConfigured: Boolean(this.config.twitchChat?.enabled && this.config.twitchChat?.actionName),
      avatarResolverConfigured: Boolean(
        this.config.streamerBot.avatarResolverEnabled && this.config.streamerBot.avatarResolverActionName
      ),
      overlayUrl: `${appConfig.publicBaseUrl}/polaroid`,
      controlUrl: `${appConfig.publicBaseUrl}/admin/polaroid`,
    };
  }

  publishStatus() {
    this.events.emit('status', this.getPublicState());
  }

  track(eventType, job, metadata = {}) {
    if (!this.recordEvent || job?.isTest) return;
    try {
      this.recordEvent({
        tool: 'polaroid',
        eventType,
        platform: job?.source,
        userId: job?.userId,
        username: job?.redeemerName,
        roles: job?.roles,
        correlationId: job?.id,
        metadata,
      });
    } catch (error) {
      console.warn('[Analytics] Could not record Polaroid event:', error.message);
    }
  }

  subscribe(listener) {
    this.events.on('polaroid', listener);
    return () => this.events.off('polaroid', listener);
  }
}

const polaroidRuntime = new PolaroidRuntime({
  recordEvent: addEngagementEvent,
  telemetry: engagementTelemetry,
  obs: appConfig.mode === 'cloud' ? new RemoteObsClient(bridgeHub) : new OBSWebSocket(),
});

module.exports = { PolaroidRuntime, polaroidRuntime };
