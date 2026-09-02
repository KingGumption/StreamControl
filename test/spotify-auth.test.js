const test = require('node:test');
const assert = require('node:assert/strict');

const { loadAppConfig, SPOTIFY_REDIRECT_URI } = require('../src/app-config');
const {
  SpotifyAuthService,
  AUTHORIZE_URL,
  TOKEN_URL,
  PROFILE_URL,
} = require('../src/spotify-auth');

function createConfig() {
  return loadAppConfig({
    SPOTIFY_CLIENT_ID: 'test-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-client-secret',
    SPOTIFY_REDIRECT_URI,
    SPOTIFY_PLAYLIST_ID: 'test-playlist-id',
  });
}

function createStore(initial = null) {
  let stored = initial;
  return {
    getSpotifyAuth: () => stored && { ...stored },
    saveSpotifyAuth: (tokens) => { stored = { ...tokens }; },
    clearSpotifyAuth: () => { stored = null; },
    inspect: () => stored && { ...stored },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('authorization flow validates state, stores tokens, and verifies Spotify', async () => {
  const store = createStore();
  const updates = [];
  const requests = [];
  const service = new SpotifyAuthService({
    config: createConfig(),
    store,
    updateStatus: (status) => updates.push(status),
    now: () => 1_000_000,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === TOKEN_URL) {
        return jsonResponse({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          scope: 'user-read-private playlist-modify-public playlist-modify-private user-read-playback-state user-modify-playback-state',
          token_type: 'Bearer',
        });
      }
      if (url === PROFILE_URL) return jsonResponse({ id: 'test-user' });
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const authorizationUrl = new URL(service.createAuthorizationUrl());
  assert.equal(authorizationUrl.origin + authorizationUrl.pathname, AUTHORIZE_URL);
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'test-client-id');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), SPOTIFY_REDIRECT_URI);
  assert.ok(authorizationUrl.searchParams.get('state'));
  assert.match(authorizationUrl.searchParams.get('scope'), /playlist-modify-public/);
  assert.match(authorizationUrl.searchParams.get('scope'), /user-read-playback-state/);
  assert.match(authorizationUrl.searchParams.get('scope'), /user-modify-playback-state/);

  await service.handleCallback({
    code: 'test-authorization-code',
    state: authorizationUrl.searchParams.get('state'),
  });

  assert.equal(requests[0].url, TOKEN_URL);
  assert.equal(requests[1].url, PROFILE_URL);
  assert.equal(store.inspect().refreshToken, 'test-refresh-token');
  assert.equal(store.inspect().expiresAt, 4_600_000);
  assert.equal(updates.at(-1).connected, true);
  assert.equal(updates.at(-1).authorizationStored, true);
  assert.equal(updates.at(-1).queueAuthorized, true);
  service.stop();
});

test('startup automatically refreshes saved authorization', async () => {
  const store = createStore({
    accessToken: 'expired-access-token',
    refreshToken: 'saved-refresh-token',
    expiresAt: 1,
    scope: '',
    tokenType: 'Bearer',
  });
  const updates = [];
  const requestBodies = [];
  const service = new SpotifyAuthService({
    config: createConfig(),
    store,
    updateStatus: (status) => updates.push(status),
    now: () => 2_000_000,
    fetchImpl: async (url, options = {}) => {
      if (url === TOKEN_URL) {
        requestBodies.push(options.body.toString());
        return jsonResponse({ access_token: 'refreshed-access-token', expires_in: 3600 });
      }
      if (url === PROFILE_URL) return jsonResponse({ id: 'test-user' });
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  assert.equal(await service.initialize(), true);
  assert.match(requestBodies[0], /grant_type=refresh_token/);
  assert.match(requestBodies[0], /refresh_token=saved-refresh-token/);
  assert.equal(store.inspect().refreshToken, 'saved-refresh-token');
  assert.equal(store.inspect().accessToken, 'refreshed-access-token');
  assert.equal(updates.at(-1).connected, true);
  service.stop();
});

test('invalid callback state is rejected before any token request', async () => {
  let fetchCalled = false;
  const service = new SpotifyAuthService({
    config: createConfig(),
    store: createStore(),
    updateStatus: () => {},
    fetchImpl: async () => {
      fetchCalled = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(
    service.handleCallback({ code: 'code', state: 'untrusted-state' }),
    /state is invalid or expired/,
  );
  assert.equal(fetchCalled, false);
  service.stop();
});

test('disconnect removes saved authorization', () => {
  const store = createStore({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: 123,
  });
  const updates = [];
  const service = new SpotifyAuthService({
    config: createConfig(),
    store,
    updateStatus: (status) => updates.push(status),
  });

  service.disconnect();
  assert.equal(store.inspect(), null);
  assert.equal(updates.at(-1).authorizationStored, false);
  assert.equal(updates.at(-1).state, 'disconnected');
});
