const crypto = require('node:crypto');
const { appConfig, requireSpotifyConfig } = require('./app-config');
const { getSpotifyAuth, saveSpotifyAuth, clearSpotifyAuth } = require('./db');
const { setSpotifyConnectionState } = require('./connection-status');

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PROFILE_URL = 'https://api.spotify.com/v1/me';
const SCOPES = [
  'user-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-playback-state',
  'user-modify-playback-state',
];
const QUEUE_SCOPES = ['user-read-playback-state', 'user-modify-playback-state'];

class SpotifyAuthError extends Error {
  constructor(message, { invalidGrant = false, unauthorized = false } = {}) {
    super(message);
    this.name = 'SpotifyAuthError';
    this.invalidGrant = invalidGrant;
    this.unauthorized = unauthorized;
  }
}

class SpotifyAuthService {
  constructor({
    config = appConfig,
    store = { getSpotifyAuth, saveSpotifyAuth, clearSpotifyAuth },
    updateStatus = setSpotifyConnectionState,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    reconnectDelayMs = 30000,
  } = {}) {
    this.config = config;
    this.store = store;
    this.updateStatus = updateStatus;
    this.fetch = fetchImpl;
    this.now = now;
    this.reconnectDelayMs = reconnectDelayMs;
    this.pendingStates = new Map();
    this.refreshTimer = null;
    this.retryTimer = null;
    this.stopped = false;
  }

  statusMetadata(extra = {}) {
    const authorization = this.store.getSpotifyAuth();
    return {
      configured: Boolean(this.config.spotify.clientId && this.config.spotify.clientSecret),
      playlistConfigured: Boolean(this.config.spotify.playlistId),
      authorizationStored: Boolean(authorization),
      queueEnabled: this.config.spotify.queueEnabled,
      queueAuthorized: !this.config.spotify.queueEnabled
        || QUEUE_SCOPES.every((scope) => hasScope(authorization, scope)),
      ...extra,
    };
  }

  hasScope(scope) {
    return hasScope(this.store.getSpotifyAuth(), scope);
  }

  async initialize() {
    this.stopped = false;
    if (!this.config.spotify.clientId || !this.config.spotify.clientSecret) {
      this.updateStatus({
        state: 'disconnected',
        detail: 'Spotify credentials are not configured',
        ...this.statusMetadata(),
      });
      return false;
    }

    if (!this.store.getSpotifyAuth()) {
      this.updateStatus({
        state: 'disconnected',
        detail: 'Ready to connect; Spotify authorisation is required',
        ...this.statusMetadata(),
      });
      return false;
    }

    this.updateStatus({
      state: 'connecting',
      detail: 'Restoring saved Spotify authorisation',
      ...this.statusMetadata(),
    });
    try {
      await this.ensureConnected();
      return true;
    } catch (error) {
      this.handleConnectionFailure(error);
      return false;
    }
  }

  createAuthorizationUrl() {
    requireSpotifyConfig(this.config, { requirePlaylist: false });
    this.prunePendingStates();
    const state = crypto.randomBytes(32).toString('base64url');
    this.pendingStates.set(state, this.now() + 10 * 60 * 1000);

    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.config.spotify.clientId,
      response_type: 'code',
      redirect_uri: this.config.spotify.redirectUri,
      state,
      scope: SCOPES.join(' '),
    }).toString();
    this.updateStatus({
      state: 'connecting',
      detail: 'Waiting for Spotify approval in the browser',
      ...this.statusMetadata(),
    });
    return url.toString();
  }

  async handleCallback({ code, state, error } = {}) {
    this.consumeState(state);
    if (error) {
      this.updateStatus({
        state: 'disconnected',
        detail: error === 'access_denied' ? 'Spotify authorisation was cancelled' : 'Spotify authorisation failed',
        ...this.statusMetadata(),
      });
      throw new SpotifyAuthError('Spotify authorisation was not approved');
    }
    if (!code) throw new SpotifyAuthError('Spotify callback did not include an authorization code');

    this.updateStatus({
      state: 'connecting',
      detail: 'Completing Spotify authorisation',
      ...this.statusMetadata(),
    });
    const tokenData = await this.requestToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.spotify.redirectUri,
    }));
    if (!tokenData.refresh_token) {
      throw new SpotifyAuthError('Spotify did not return a refresh token');
    }
    this.saveTokenResponse(tokenData);
    await this.validateAccessToken(tokenData.access_token);
    this.markConnected();
    this.scheduleRefresh();
    return true;
  }

  async ensureConnected() {
    const tokens = this.store.getSpotifyAuth();
    if (!tokens?.refreshToken) throw new SpotifyAuthError('Spotify authorisation is required');

    if (tokens.accessToken && Number(tokens.expiresAt) > this.now() + 60000) {
      try {
        await this.validateAccessToken(tokens.accessToken);
        this.markConnected();
        this.scheduleRefresh();
        return;
      } catch (error) {
        if (!error.unauthorized) throw error;
      }
    }
    await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    const tokens = this.store.getSpotifyAuth();
    if (!tokens?.refreshToken) throw new SpotifyAuthError('Spotify authorisation is required');

    this.updateStatus({
      state: 'connecting',
      detail: 'Refreshing Spotify access',
      ...this.statusMetadata(),
    });
    const tokenData = await this.requestToken(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }));
    this.saveTokenResponse(tokenData, tokens.refreshToken);
    await this.validateAccessToken(tokenData.access_token);
    this.markConnected();
    this.scheduleRefresh();
  }

  async getAccessToken() {
    const tokens = this.store.getSpotifyAuth();
    if (!tokens?.refreshToken) throw new SpotifyAuthError('Spotify authorisation is required');
    if (!tokens.accessToken || Number(tokens.expiresAt) <= this.now() + 60000) {
      await this.refreshAccessToken();
    }
    return this.store.getSpotifyAuth().accessToken;
  }

  async refreshAfterUnauthorized() {
    await this.refreshAccessToken();
    return this.store.getSpotifyAuth().accessToken;
  }

  async requestToken(body) {
    let response;
    try {
      response = await this.fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.config.spotify.clientId}:${this.config.spotify.clientSecret}`).toString('base64')}`,
        },
        body,
      });
    } catch (error) {
      throw new SpotifyAuthError(`Spotify token service is unreachable: ${safeMessage(error)}`);
    }

    const data = await readJson(response);
    if (!response.ok) {
      const errorCode = data?.error || `HTTP ${response.status}`;
      throw new SpotifyAuthError(`Spotify token request failed (${errorCode})`, {
        invalidGrant: errorCode === 'invalid_grant',
      });
    }
    if (!data?.access_token || !data?.expires_in) {
      throw new SpotifyAuthError('Spotify returned an incomplete token response');
    }
    return data;
  }

  saveTokenResponse(data, existingRefreshToken = null) {
    this.store.saveSpotifyAuth({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || existingRefreshToken,
      expiresAt: this.now() + Number(data.expires_in) * 1000,
      scope: data.scope || '',
      tokenType: data.token_type || 'Bearer',
    });
  }

  async validateAccessToken(accessToken) {
    let response;
    try {
      response = await this.fetch(PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      throw new SpotifyAuthError(`Spotify API is unreachable: ${safeMessage(error)}`);
    }
    if (response.status === 401) {
      throw new SpotifyAuthError('Spotify access token was rejected', { unauthorized: true });
    }
    if (!response.ok) {
      throw new SpotifyAuthError(`Spotify connection check failed (HTTP ${response.status})`);
    }
  }

  markConnected() {
    const queueNeedsApproval = this.config.spotify.queueEnabled
      && !QUEUE_SCOPES.every((scope) => this.hasScope(scope));
    this.updateStatus({
      connected: true,
      detail: queueNeedsApproval
        ? 'Spotify connected; reconnect to approve live queue access'
        : this.config.spotify.playlistId
          ? 'Spotify API connected; request playlist and live queue ready'
          : 'Spotify API connected; request playlist is not configured',
      ...this.statusMetadata({ authorizationStored: true }),
    });
  }

  handleConnectionFailure(error) {
    if (error.invalidGrant) {
      this.store.clearSpotifyAuth();
      this.updateStatus({
        state: 'disconnected',
        detail: 'Spotify authorisation expired or was revoked; reconnect required',
        ...this.statusMetadata({ authorizationStored: false }),
      });
      return;
    }

    this.updateStatus({
      state: 'disconnected',
      detail: `Spotify unavailable: ${safeMessage(error)}`,
      ...this.statusMetadata(),
    });
    if (this.store.getSpotifyAuth()) this.scheduleRetry();
  }

  scheduleRefresh() {
    this.clearTimers();
    const tokens = this.store.getSpotifyAuth();
    if (!tokens || this.stopped) return;
    const delay = Math.max(5000, Number(tokens.expiresAt) - this.now() - 60000);
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      try {
        await this.refreshAccessToken();
      } catch (error) {
        this.handleConnectionFailure(error);
      }
    }, delay);
    this.refreshTimer.unref?.();
  }

  scheduleRetry() {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      try {
        await this.ensureConnected();
      } catch (error) {
        this.handleConnectionFailure(error);
      }
    }, this.reconnectDelayMs);
    this.retryTimer.unref?.();
  }

  disconnect() {
    this.clearTimers();
    this.store.clearSpotifyAuth();
    this.updateStatus({
      state: 'disconnected',
      detail: 'Disconnected; Spotify authorisation is required',
      ...this.statusMetadata({ authorizationStored: false }),
    });
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
  }

  clearTimers() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.refreshTimer = null;
    this.retryTimer = null;
  }

  consumeState(state) {
    this.prunePendingStates();
    const expiresAt = state && this.pendingStates.get(state);
    if (!expiresAt || expiresAt < this.now()) {
      throw new SpotifyAuthError('Spotify authorization state is invalid or expired');
    }
    this.pendingStates.delete(state);
  }

  prunePendingStates() {
    for (const [state, expiresAt] of this.pendingStates) {
      if (expiresAt < this.now()) this.pendingStates.delete(state);
    }
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeMessage(error) {
  return String(error?.message || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 200);
}

function hasScope(authorization, scope) {
  return new Set(String(authorization?.scope || '').split(/\s+/).filter(Boolean)).has(scope);
}

const spotifyAuth = new SpotifyAuthService();

module.exports = {
  SpotifyAuthService,
  SpotifyAuthError,
  spotifyAuth,
  SCOPES,
  QUEUE_SCOPES,
  AUTHORIZE_URL,
  TOKEN_URL,
  PROFILE_URL,
};
