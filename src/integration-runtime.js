const crypto = require('node:crypto');
const { appConfig } = require('./app-config');
const {
  WebSocketConnectionMonitor,
  updateConnectionStatus,
} = require('./connection-status');
const {
  normalizeStreamerBotEvent,
  normalizeTikfinityEvents,
} = require('./chat-events');
const { commandService } = require('./command-service');
const { hillGame } = require('./hill-game');
const { addEngagementEvent } = require('./db');
const {
  STREAMERBOT_TELEMETRY_SUBSCRIPTIONS,
  engagementTelemetry,
} = require('./engagement-telemetry');
const { bridgeHub } = require('./bridge-hub');

class StreamerBotAdapter {
  constructor({ config, onChatEvent }) {
    this.config = config;
    this.onChatEvent = onChatEvent;
    this.socket = null;
    this.canSendChat = false;
    this.authRequestId = null;
    this.subscribeRequestId = null;
    this.rawMessageListeners = new Set();
    this.connectionListeners = new Set();
    this.eventSubscriptions = {
      Twitch: new Set(['ChatMessage']),
      YouTube: new Set(['Message']),
    };
  }

  onOpen(socket) {
    this.socket = socket;
    this.canSendChat = false;
    updateConnectionStatus('streamerbot', {
      state: 'connecting',
      detail: 'WebSocket connected; waiting for Streamer.bot hello',
    });
    this.notifyConnection(true);
  }

  onClose() {
    this.socket = null;
    this.canSendChat = false;
    this.notifyConnection(false);
  }

  handleMessage(raw) {
    const payload = parseJson(raw);
    if (!payload) return;
    for (const listener of this.rawMessageListeners) {
      try {
        listener(payload);
      } catch {
        // Feature listeners must not interrupt chat authentication or command handling.
      }
    }

    if (payload.request === 'Hello') {
      if (payload.authentication) {
        if (!this.config.password) {
          this.subscribe();
          updateConnectionStatus('streamerbot', {
            state: 'connected',
            detail: 'Chat subscribed; replies disabled until STREAMERBOT_WS_PASSWORD is configured',
          });
          return;
        }
        this.authRequestId = requestId('auth');
        this.send({
          request: 'Authenticate',
          id: this.authRequestId,
          authentication: streamerBotAuthentication(this.config.password, payload.authentication),
        });
        updateConnectionStatus('streamerbot', { state: 'connecting', detail: 'Authenticating with Streamer.bot' });
        return;
      }
      this.canSendChat = true;
      this.subscribe();
      return;
    }

    if (payload.id === this.authRequestId) {
      if (payload.status !== 'ok') {
        updateConnectionStatus('streamerbot', {
          state: 'disconnected',
          detail: 'Streamer.bot authentication failed; check the WebSocket password',
        });
        return;
      }
      this.canSendChat = true;
      this.subscribe();
      return;
    }

    if (payload.id === this.subscribeRequestId) {
      updateConnectionStatus('streamerbot', payload.status === 'ok'
        ? { state: 'connected', detail: 'Connected; Twitch and YouTube chat subscribed' }
        : { state: 'disconnected', detail: 'Connected, but chat event subscription failed' });
      return;
    }

    const event = normalizeStreamerBotEvent(payload);
    if (event) Promise.resolve(this.onChatEvent(event)).catch(() => {});
  }

  subscribe() {
    this.subscribeRequestId = requestId('subscribe');
    this.send({
      request: 'Subscribe',
      id: this.subscribeRequestId,
      events: Object.fromEntries(
        Object.entries(this.eventSubscriptions).map(([source, events]) => [source, [...events]])
      ),
    });
  }

  addEventSubscriptions(subscriptions) {
    for (const [source, events] of Object.entries(subscriptions || {})) {
      if (!this.eventSubscriptions[source]) this.eventSubscriptions[source] = new Set();
      for (const event of events || []) this.eventSubscriptions[source].add(event);
    }
  }

  onRawMessage(listener) {
    this.rawMessageListeners.add(listener);
    return () => this.rawMessageListeners.delete(listener);
  }

  onConnectionChange(listener) {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  notifyConnection(connected) {
    for (const listener of this.connectionListeners) listener(connected);
  }

  get connected() {
    return Boolean(this.socket && this.socket.readyState === 1);
  }

  sendChat(platform, message) {
    if (!this.canSendChat || !['twitch', 'youtube'].includes(platform)) return false;
    return this.send({
      request: 'SendMessage',
      id: requestId('chat'),
      platform,
      bot: true,
      internal: false,
      message,
    });
  }

  sendTikTokReply(message) {
    if (!this.config.tiktokReplyActionId) return false;
    return this.send({
      request: 'DoAction',
      id: requestId('tiktok'),
      action: { id: this.config.tiktokReplyActionId },
      args: { message },
    });
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }
}

class TikfinityAdapter {
  constructor({ onChatEvent, onTelemetryEvent = null, tiktokRepliesConfigured }) {
    this.onChatEvent = onChatEvent;
    this.onTelemetryEvent = onTelemetryEvent;
    this.tiktokRepliesConfigured = tiktokRepliesConfigured;
  }

  onOpen() {
    updateConnectionStatus('tikfinity', {
      state: 'connected',
      detail: this.tiktokRepliesConfigured
        ? 'Connected; TikTok chat events and replies configured'
        : 'Connected; TikTok replies require an optional Streamer.bot action',
    });
  }

  handleMessage(raw) {
    const parsed = parseJson(raw);
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];
    envelopes.filter(Boolean).forEach((envelope) => this.onTelemetryEvent?.(envelope));
    normalizeTikfinityEvents(parsed).forEach((event) => {
      Promise.resolve(this.onChatEvent(event)).catch(() => {});
    });
  }
}

class IntegrationRuntime {
  constructor({ config = appConfig, commands = commandService, game = hillGame, recordEvent = null, telemetry = null, bridge = null } = {}) {
    this.config = config;
    this.commands = commands;
    this.game = game;
    this.recordEvent = recordEvent;
    this.telemetry = telemetry;
    this.bridge = bridge;
    this.monitors = [];
    this.bridgeListeners = [];
    this.recentMessageIds = new Set();

    this.streamerBot = new StreamerBotAdapter({
      config: config.streamerBot,
      onChatEvent: (event) => this.handleChatEvent(event),
    });
    if (telemetry) {
      this.streamerBot.addEventSubscriptions(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS);
      this.streamerBot.onRawMessage((payload) => telemetry.handleStreamerBot(payload));
    }
    this.tikfinity = new TikfinityAdapter({
      onChatEvent: (event) => this.handleChatEvent(event),
      onTelemetryEvent: (event) => telemetry?.handleTikfinity(event),
      tiktokRepliesConfigured: Boolean(config.streamerBot.tiktokReplyActionId),
    });
  }

  start() {
    if (this.bridge) return this.startBridge();
    if (this.monitors.length) return;
    this.monitors = [
      new WebSocketConnectionMonitor({
        service: 'streamerbot',
        url: this.config.streamerBot.websocketUrl,
        registry: registryProxy,
        onOpen: (socket) => this.streamerBot.onOpen(socket),
        onMessage: (message) => this.streamerBot.handleMessage(message),
        onClose: () => this.streamerBot.onClose(),
      }),
      new WebSocketConnectionMonitor({
        service: 'tikfinity',
        url: this.config.tikfinity.websocketUrl,
        registry: registryProxy,
        onOpen: () => this.tikfinity.onOpen(),
        onMessage: (message) => this.tikfinity.handleMessage(message),
      }),
    ];
    this.monitors.forEach((monitor) => monitor.start());
  }

  stop() {
    for (const [event, listener] of this.bridgeListeners) this.bridge?.off(event, listener);
    this.bridgeListeners = [];
    if (this.bridge && this.streamerBot.connected) this.streamerBot.onClose();
    this.monitors.forEach((monitor) => monitor.stop());
    this.monitors = [];
  }

  startBridge() {
    if (this.bridgeListeners.length) return;
    const bridgeSocket = {
      get readyState() { return bridgeSocket.bridge.connected ? 1 : 3; },
      send: (payload) => this.bridge.sendService('streamerbot', payload),
      bridge: this.bridge,
    };
    const listen = (event, listener) => {
      this.bridge.on(event, listener);
      this.bridgeListeners.push([event, listener]);
    };
    listen('connector-connected', () => {
      updateConnectionStatus('connector', { state: 'connected', detail: 'Secure local connector online', lastConnectedAt: new Date().toISOString() });
    });
    listen('connector-disconnected', () => {
      if (this.streamerBot.connected) this.streamerBot.onClose();
      updateConnectionStatus('connector', { state: 'disconnected', detail: 'Local connector offline' });
    });
    const handleServiceState = (service, state) => {
      if (!['streamerbot', 'tikfinity'].includes(service)) return;
      updateConnectionStatus(service, {
        state: state.connected ? 'connected' : 'disconnected',
        detail: state.detail || (state.connected ? 'Connected through local connector' : 'Local service disconnected'),
        ...(state.connected ? { lastConnectedAt: new Date().toISOString() } : {}),
      });
      if (service === 'streamerbot') {
        if (state.connected && !this.streamerBot.connected) this.streamerBot.onOpen(bridgeSocket);
        if (!state.connected && this.streamerBot.connected) this.streamerBot.onClose();
      }
      if (service === 'tikfinity' && state.connected) this.tikfinity.onOpen();
    };
    listen('service-state', handleServiceState);
    listen('service-message', (service, payload) => {
      if (service === 'streamerbot') this.streamerBot.handleMessage(payload);
      if (service === 'tikfinity') this.tikfinity.handleMessage(payload);
    });
    updateConnectionStatus('connector', {
      state: this.bridge.connected ? 'connected' : 'disconnected',
      detail: this.bridge.connected ? 'Secure local connector online' : 'Waiting for local connector',
    });
    for (const [service, state] of this.bridge.getServiceStates()) handleServiceState(service, state);
  }

  async handleChatEvent(event) {
    if (event.messageId && this.recentMessageIds.has(`${event.platform}:${event.messageId}`)) return;
    if (event.messageId) this.rememberMessage(`${event.platform}:${event.messageId}`);

    this.track({
      tool: 'audience',
      eventType: 'chat_message',
      platform: event.platform,
      userId: event.user?.id,
      username: event.user?.username,
      correlationId: event.messageId,
      roles: event.user?.roles,
    });

    if (this.game?.handleChatEvent(event)) return;
    const result = await this.commands.handleChatEvent(event);
    if (result.handled) {
      const command = String(event.text || '').trim().match(/^!([a-z0-9]+)/i)?.[1]?.toLowerCase();
      this.track({
        tool: 'song_requests',
        eventType: 'command',
        platform: event.platform,
        userId: event.user?.id,
        username: event.user?.username,
        correlationId: event.messageId,
        roles: event.user?.roles,
        metadata: { command, status: result.status, response: result.response },
      });
    }
    if (!result.handled || !result.response) return;
    if (event.platform === 'tiktok') {
      this.streamerBot.sendTikTokReply(result.response);
    } else {
      this.streamerBot.sendChat(event.platform, result.response);
    }
  }

  track(event) {
    try {
      this.recordEvent?.(event);
    } catch (error) {
      console.warn('[Analytics] Could not record engagement event:', error.message);
    }
  }

  rememberMessage(key) {
    this.recentMessageIds.add(key);
    if (this.recentMessageIds.size > 500) {
      this.recentMessageIds.delete(this.recentMessageIds.values().next().value);
    }
  }
}

const registryProxy = {
  update: updateConnectionStatus,
  markConnected(service, detail) {
    return updateConnectionStatus(service, {
      state: 'connected',
      detail,
      lastConnectedAt: new Date().toISOString(),
      reconnectAttempt: 0,
    });
  },
  markEvent(service) {
    return updateConnectionStatus(service, { lastEventAt: new Date().toISOString() });
  },
};

function parseJson(raw) {
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch {
    return null;
  }
}

function streamerBotAuthentication(password, authentication) {
  const secret = crypto.createHash('sha256')
    .update(`${password}${authentication.salt}`, 'utf8')
    .digest('base64');
  return crypto.createHash('sha256')
    .update(`${secret}${authentication.challenge}`, 'utf8')
    .digest('base64');
}

function requestId(prefix) {
  return `stream-control:${prefix}:${crypto.randomUUID()}`;
}

const integrationRuntime = new IntegrationRuntime({
  recordEvent: addEngagementEvent,
  telemetry: engagementTelemetry,
  bridge: appConfig.mode === 'cloud' ? bridgeHub : null,
});

module.exports = {
  StreamerBotAdapter,
  TikfinityAdapter,
  IntegrationRuntime,
  streamerBotAuthentication,
  integrationRuntime,
};
