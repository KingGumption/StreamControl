const WebSocket = require('ws');
const OBSWebSocket = require('obs-websocket-js').default;
const { WebSocketConnectionMonitor } = require('./connection-status');
const { loadPolaroidConfig } = require('./polaroid/config');

class ConnectorRuntime {
  constructor({ config, WebSocketImpl = WebSocket, obs = new OBSWebSocket(), reconnectDelayMs = 5000 } = {}) {
    this.config = config;
    this.WebSocketImpl = WebSocketImpl;
    this.obs = obs;
    this.reconnectDelayMs = reconnectDelayMs;
    this.cloud = null;
    this.cloudTimer = null;
    this.started = false;
    this.streamerBotSocket = null;
    this.tikfinitySocket = null;
    this.obsConnected = false;
    this.obsConnectPromise = null;
    this.localMonitors = [];
    this.outbox = [];
    this.localPolaroidConfig = loadPolaroidConfig();
    this.registry = { update() {}, markConnected() {}, markEvent() {} };
    this.obs.on('ConnectionClosed', () => {
      this.obsConnected = false;
      this.send({ type: 'service.state', service: 'obs', connected: false, detail: 'OBS disconnected' });
    });
    this.obs.on('StreamStateChanged', (data) => this.send({ type: 'obs.event', event: 'StreamStateChanged', data }));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.startLocalServices();
    this.connectCloud();
  }

  startLocalServices() {
    if (this.localMonitors.length) return;
    this.localMonitors = [
      new WebSocketConnectionMonitor({
        service: 'streamerbot', url: this.config.streamerBot.websocketUrl, registry: this.registry,
        reconnectDelayMs: this.reconnectDelayMs, WebSocketImpl: this.WebSocketImpl,
        onOpen: (socket) => { this.streamerBotSocket = socket; this.sendServiceState('streamerbot', true, 'Connected'); },
        onMessage: (payload) => this.send({ type: 'service.message', service: 'streamerbot', payload: bufferText(payload) }),
        onClose: () => { this.streamerBotSocket = null; this.sendServiceState('streamerbot', false, 'Disconnected'); },
      }),
      new WebSocketConnectionMonitor({
        service: 'tikfinity', url: this.config.tikfinity.websocketUrl, registry: this.registry,
        reconnectDelayMs: this.reconnectDelayMs, WebSocketImpl: this.WebSocketImpl,
        onOpen: (socket) => { this.tikfinitySocket = socket; this.sendServiceState('tikfinity', true, 'Connected'); },
        onMessage: (payload) => this.send({ type: 'service.message', service: 'tikfinity', payload: bufferText(payload) }),
        onClose: () => { this.tikfinitySocket = null; this.sendServiceState('tikfinity', false, 'Disconnected'); },
      }),
    ];
    this.localMonitors.forEach((monitor) => monitor.start());
  }

  reconnectLocalServices() {
    this.localMonitors.forEach((monitor) => monitor.stop());
    this.localMonitors = [];
    this.streamerBotSocket = null;
    this.tikfinitySocket = null;
    this.startLocalServices();
  }

  connectCloud() {
    if (!this.started || this.cloud) return;
    let socket;
    try {
      socket = new this.WebSocketImpl(this.config.bridge.cloudUrl, {
        headers: { Authorization: `Bearer ${this.config.bridge.token}` },
        maxPayload: 32 * 1024 * 1024,
      });
    } catch { this.scheduleCloudReconnect(); return; }
    this.cloud = socket;
    socket.on('open', () => {
      console.log(`[Connector] Connected to ${this.config.bridge.cloudUrl}`);
      this.send({ type: 'connector.hello', version: 1 });
      this.flushOutbox();
      this.reconnectLocalServices();
      this.sendServiceState('obs', this.obsConnected, this.obsConnected ? 'Connected' : 'Not connected');
    });
    socket.on('message', (raw) => this.handleCloudMessage(raw));
    socket.on('error', (error) => console.warn('[Connector] Cloud connection:', safeMessage(error)));
    socket.on('close', () => {
      if (this.cloud === socket) this.cloud = null;
      if (this.started) this.scheduleCloudReconnect();
    });
  }

  scheduleCloudReconnect() {
    if (!this.started || this.cloudTimer) return;
    this.cloudTimer = setTimeout(() => { this.cloudTimer = null; this.connectCloud(); }, this.reconnectDelayMs);
    this.cloudTimer.unref?.();
  }

  handleCloudMessage(raw) {
    let message;
    try { message = JSON.parse(bufferText(raw)); } catch { return; }
    if (message.type === 'service.send') {
      const socket = message.service === 'streamerbot' ? this.streamerBotSocket : message.service === 'tikfinity' ? this.tikfinitySocket : null;
      if (socket?.readyState === WebSocket.OPEN) socket.send(String(message.payload));
      return;
    }
    if (message.type === 'obs.request') void this.handleObsRequest(message);
  }

  async handleObsRequest(message) {
    try {
      let data;
      if (message.method === 'connect') data = await this.ensureObsConnected();
      else if (message.method === 'disconnect') {
        await this.obs.disconnect();
        this.obsConnected = false;
        data = {};
      } else {
        await this.ensureObsConnected();
        data = await this.obs.call(message.method, message.args || {});
      }
      this.send({ type: 'obs.response', id: message.id, ok: true, data: data || {} });
    } catch (error) {
      this.send({ type: 'obs.response', id: message.id, ok: false, error: safeMessage(error) });
    }
  }

  async ensureObsConnected() {
    if (this.obsConnected) return {};
    if (this.obsConnectPromise) return this.obsConnectPromise;
    this.obsConnectPromise = this.obs.connect(
      this.localPolaroidConfig.obs.url,
      this.localPolaroidConfig.obs.password || undefined,
      { rpcVersion: 1 },
    ).then((result) => {
      this.obsConnected = true;
      this.sendServiceState('obs', true, 'Connected');
      return result || {};
    }).finally(() => { this.obsConnectPromise = null; });
    return this.obsConnectPromise;
  }

  sendServiceState(service, connected, detail) {
    this.send({ type: 'service.state', service, connected, detail });
  }

  send(message) {
    if (!this.cloud || this.cloud.readyState !== WebSocket.OPEN) {
      if (['service.message', 'obs.event'].includes(message?.type)) {
        this.outbox.push(message);
        if (this.outbox.length > 1000) this.outbox.shift();
      }
      return false;
    }
    try { this.cloud.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  flushOutbox() {
    const queued = this.outbox.splice(0);
    for (const message of queued) this.send(message);
  }

  async stop() {
    this.started = false;
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = null;
    this.localMonitors.forEach((monitor) => monitor.stop());
    this.localMonitors = [];
    this.cloud?.close(1000, 'Connector stopping');
    this.cloud = null;
    try { await this.obs.disconnect(); } catch { /* Already disconnected. */ }
  }
}

function bufferText(value) { return Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
function safeMessage(error) { return String(error?.message || error || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 300); }

module.exports = { ConnectorRuntime };
