const WebSocket = require('ws');
const { appConfig } = require('./app-config');

const VALID_STATES = new Set(['connected', 'connecting', 'disconnected']);

class ConnectionStatusRegistry {
  constructor() {
    this.services = new Map();
  }

  define(service, initial = {}) {
    const now = new Date().toISOString();
    this.services.set(service, {
      service,
      state: 'disconnected',
      detail: 'Not started',
      configured: false,
      lastChangedAt: now,
      lastConnectedAt: null,
      lastEventAt: null,
      reconnectAttempt: 0,
      ...initial,
    });
  }

  update(service, patch) {
    const current = this.services.get(service);
    if (!current) throw new Error(`Unknown connection service: ${service}`);
    if (patch.state && !VALID_STATES.has(patch.state)) {
      throw new Error(`Invalid connection state: ${patch.state}`);
    }

    const changed = patch.state !== undefined && patch.state !== current.state;
    const next = {
      ...current,
      ...patch,
      lastChangedAt: changed ? new Date().toISOString() : current.lastChangedAt,
    };
    this.services.set(service, next);
    return { ...next };
  }

  markConnected(service, detail = 'Connected') {
    const now = new Date().toISOString();
    return this.update(service, {
      state: 'connected',
      detail,
      lastConnectedAt: now,
      reconnectAttempt: 0,
    });
  }

  markEvent(service) {
    return this.update(service, { lastEventAt: new Date().toISOString() });
  }

  snapshot() {
    return Object.fromEntries(
      [...this.services.entries()].map(([key, value]) => [key, { ...value }]),
    );
  }
}

class WebSocketConnectionMonitor {
  constructor({
    service,
    url,
    registry,
    WebSocketImpl = WebSocket,
    reconnectDelayMs = 5000,
    onOpen = null,
    onMessage = null,
    onClose = null,
  }) {
    this.service = service;
    this.url = url;
    this.registry = registry;
    this.WebSocketImpl = WebSocketImpl;
    this.reconnectDelayMs = reconnectDelayMs;
    this.onOpen = onOpen;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.socket = null;
    this.reconnectTimer = null;
    this.started = false;
    this.reconnectAttempt = 0;
    this.lastError = null;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  connect() {
    if (!this.started || this.socket) return;

    this.registry.update(this.service, {
      state: 'connecting',
      detail: this.reconnectAttempt ? `Reconnecting (attempt ${this.reconnectAttempt})` : 'Connecting',
      reconnectAttempt: this.reconnectAttempt,
    });

    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch (error) {
      this.registry.update(this.service, {
        state: 'disconnected',
        detail: `Connection failed: ${safeError(error)}`,
      });
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.on('open', () => {
      this.lastError = null;
      this.registry.markConnected(this.service, 'WebSocket connected');
      this.reconnectAttempt = 0;
      this.invokeHook(this.onOpen, socket);
    });
    socket.on('message', (message) => {
      this.registry.markEvent(this.service);
      this.invokeHook(this.onMessage, message, socket);
    });
    socket.on('error', (error) => {
      this.lastError = safeError(error);
      this.registry.update(this.service, {
        state: 'disconnected',
        detail: `Connection error: ${this.lastError}`,
      });
    });
    socket.on('close', (code) => {
      this.socket = null;
      this.invokeHook(this.onClose, code);
      if (!this.started) return;
      this.registry.update(this.service, {
        state: 'disconnected',
        detail: this.lastError
          ? `Disconnected: ${this.lastError}`
          : (code ? `WebSocket closed (code ${code})` : 'WebSocket disconnected'),
      });
      this.scheduleReconnect();
    });
  }

  invokeHook(hook, ...args) {
    if (typeof hook !== 'function') return;
    try {
      Promise.resolve(hook(...args)).catch(() => {});
    } catch {
      // Integration handlers report their own safe status and must never take
      // down the reconnecting transport monitor.
    }
  }

  scheduleReconnect() {
    if (!this.started || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    this.registry.update(this.service, { reconnectAttempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  stop() {
    this.started = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      socket.close();
    }
    this.registry.update(this.service, {
      state: 'disconnected',
      detail: 'Monitor stopped',
      reconnectAttempt: 0,
    });
  }
}

function safeError(error) {
  const message = error && error.message ? error.message : 'Unknown error';
  return String(message).replace(/[\r\n]+/g, ' ').slice(0, 200);
}

function spotifyInitialStatus(config) {
  const missing = [];
  if (!config.spotify.clientId) missing.push('client ID');
  if (!config.spotify.clientSecret) missing.push('client secret');

  return {
    configured: missing.length === 0,
    playlistConfigured: Boolean(config.spotify.playlistId),
    authorizationStored: false,
    state: 'disconnected',
    detail: missing.length
      ? `Not configured (missing ${missing.join(', ')})`
      : 'Ready to connect; Spotify authorisation is required',
  };
}

const connectionStatus = new ConnectionStatusRegistry();
connectionStatus.define('spotify', spotifyInitialStatus(appConfig));
connectionStatus.define('tikfinity', { configured: true });
connectionStatus.define('streamerbot', { configured: true });
connectionStatus.define('connector', { configured: appConfig.mode === 'cloud', detail: appConfig.mode === 'cloud' ? 'Waiting for local connector' : 'Not used in local mode' });

let activeMonitors = null;

function startConnectionMonitors(config = appConfig) {
  if (activeMonitors) return activeMonitors;

  const monitors = [
    new WebSocketConnectionMonitor({
      service: 'tikfinity',
      url: config.tikfinity.websocketUrl,
      registry: connectionStatus,
    }),
    new WebSocketConnectionMonitor({
      service: 'streamerbot',
      url: config.streamerBot.websocketUrl,
      registry: connectionStatus,
    }),
  ];
  monitors.forEach((monitor) => monitor.start());

  activeMonitors = {
    stop() {
      monitors.forEach((monitor) => monitor.stop());
      activeMonitors = null;
    },
  };
  return activeMonitors;
}

// The future OAuth implementation should call this only after validating the
// access token with Spotify, and set disconnected again on logout/token failure.
function setSpotifyConnectionState({ state, connected, detail, lastEventAt, ...metadata } = {}) {
  const nextState = state || (connected ? 'connected' : 'disconnected');
  if (nextState === 'connected') {
    connectionStatus.markConnected('spotify', detail || 'Spotify API connected');
    connectionStatus.update('spotify', { ...metadata, lastEventAt: lastEventAt || new Date().toISOString() });
    return;
  }
  connectionStatus.update('spotify', {
    ...metadata,
    state: nextState,
    detail: detail || spotifyInitialStatus(appConfig).detail,
  });
}

function getConnectionStatuses() {
  return connectionStatus.snapshot();
}

function updateConnectionStatus(service, patch) {
  return connectionStatus.update(service, patch);
}

module.exports = {
  ConnectionStatusRegistry,
  WebSocketConnectionMonitor,
  getConnectionStatuses,
  setSpotifyConnectionState,
  startConnectionMonitors,
  updateConnectionStatus,
};
