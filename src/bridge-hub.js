const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { appConfig } = require('./app-config');

class BridgeHub extends EventEmitter {
  constructor({ token = '', requestTimeoutMs = 45000 } = {}) {
    super();
    this.token = token;
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket = null;
    this.server = null;
    this.pending = new Map();
    this.serviceStates = new Map();
    this.heartbeat = null;
  }

  attach(httpServer, { path = '/bridge' } = {}) {
    if (this.server) return this.server;
    this.server = new WebSocket.Server({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    httpServer.on('upgrade', (request, socket, head) => {
      let pathname = '';
      try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
      if (pathname !== path) { socket.destroy(); return; }
      const authorization = String(request.headers.authorization || '');
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!this.token || !safeTokenEqual(supplied, this.token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.server.handleUpgrade(request, socket, head, (webSocket) => this.accept(webSocket));
    });
    this.heartbeat = setInterval(() => this.ping(), 30000);
    this.heartbeat.unref?.();
    return this.server;
  }

  accept(socket) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close(4001, 'Replaced by a newer connector');
    this.socket = socket;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (raw) => this.handleMessage(raw));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.markAllServicesOffline();
      this.rejectPending(new Error('Local connector disconnected'));
      this.emit('connector-disconnected');
    });
    socket.on('error', () => {});
    this.emit('connector-connected');
  }

  handleMessage(raw) {
    let message;
    try { message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch { return; }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'service.state' && ['streamerbot', 'tikfinity', 'obs'].includes(message.service)) {
      const state = { connected: Boolean(message.connected), detail: String(message.detail || '') };
      this.serviceStates.set(message.service, state);
      this.emit('service-state', message.service, state);
      return;
    }
    if (message.type === 'service.message' && ['streamerbot', 'tikfinity'].includes(message.service)) {
      this.emit('service-message', message.service, message.payload);
      return;
    }
    if (message.type === 'obs.event' && typeof message.event === 'string') {
      this.emit('obs-event', message.event, message.data || {});
      return;
    }
    if (message.type === 'obs.response' && message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.data);
      else pending.reject(new Error(String(message.error || 'OBS connector request failed')));
    }
  }

  sendService(service, payload) {
    return this.send({ type: 'service.send', service, payload: String(payload) });
  }

  requestObs(method, args = {}) {
    if (!this.connected) return Promise.reject(new Error('Local connector is offline'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OBS connector request timed out: ${method}`));
      }, this.requestTimeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      if (!this.send({ type: 'obs.request', id, method, args })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Local connector is offline'));
      }
    });
  }

  send(message) {
    if (!this.connected) return false;
    try { this.socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  getServiceStates() { return new Map(this.serviceStates); }

  ping() {
    const socket = this.socket;
    if (!socket) return;
    if (!socket.isAlive) { socket.terminate(); return; }
    socket.isAlive = false;
    try { socket.ping(); } catch { socket.terminate(); }
  }

  markAllServicesOffline() {
    for (const service of ['streamerbot', 'tikfinity', 'obs']) {
      const state = { connected: false, detail: 'Local connector offline' };
      this.serviceStates.set(service, state);
      this.emit('service-state', service, state);
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.rejectPending(new Error('Bridge stopped'));
    this.socket?.close(1001, 'Server stopping');
    this.server?.close();
    this.socket = null;
    this.server = null;
  }

  get connected() { return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN); }
}

function safeTokenEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left)).digest();
  const rightHash = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

const bridgeHub = new BridgeHub({ token: appConfig.bridge.token });

module.exports = { BridgeHub, bridgeHub };
