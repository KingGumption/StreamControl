const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadAppConfig,
  requireDeploymentConfig,
  requireSpotifyConfig,
  SPOTIFY_REDIRECT_URI,
} = require('../src/app-config');

test('loads documented defaults from a central configuration module', () => {
  const config = loadAppConfig({});

  assert.equal(config.port, 8787);
  assert.equal(config.spotify.redirectUri, SPOTIFY_REDIRECT_URI);
  assert.equal(config.spotify.cleanOnly, true);
  assert.equal(config.spotify.queueEnabled, true);
  assert.equal(config.tikfinity.websocketUrl, 'ws://127.0.0.1:21213/');
  assert.equal(config.streamerBot.websocketUrl, 'ws://127.0.0.1:8080/');
  assert.equal(config.cooldowns.userSeconds, 5);
  assert.equal(config.cooldowns.globalSeconds, 1);
  assert.equal(config.playlistCommandPublic, true);
  assert.equal(config.dryRun, false);
});

test('validates cloud and connector deployment secrets and transport security', () => {
  const renderCloud = loadAppConfig({
    APP_MODE: 'cloud',
    RENDER_EXTERNAL_URL: 'https://streamengagement.onrender.com',
    ADMIN_PASSWORD: 'a-strong-admin-password',
    SESSION_SECRET: 's'.repeat(40),
    BRIDGE_TOKEN: 'b'.repeat(40),
  });
  assert.equal(renderCloud.publicBaseUrl, 'https://streamengagement.onrender.com');
  assert.equal(renderCloud.spotify.redirectUri, 'https://streamengagement.onrender.com/callback');
  assert.equal(requireDeploymentConfig(renderCloud), renderCloud);

  const cloud = loadAppConfig({
    APP_MODE: 'cloud',
    PUBLIC_BASE_URL: 'https://streams.example.com/',
    ADMIN_PASSWORD: 'a-strong-admin-password',
    SESSION_SECRET: 's'.repeat(40),
    BRIDGE_TOKEN: 'b'.repeat(40),
  });
  assert.equal(cloud.bindHost, '0.0.0.0');
  assert.equal(cloud.publicBaseUrl, 'https://streams.example.com');
  assert.equal(cloud.spotify.redirectUri, 'https://streams.example.com/callback');
  assert.equal(requireDeploymentConfig(cloud), cloud);

  const connector = loadAppConfig({ APP_MODE: 'connector', CONNECTOR_CLOUD_URL: 'wss://streams.example.com/bridge', BRIDGE_TOKEN: 'token' });
  assert.equal(requireDeploymentConfig(connector), connector);
  assert.throws(
    () => requireDeploymentConfig(loadAppConfig({ APP_MODE: 'connector', CONNECTOR_CLOUD_URL: 'ws://streams.example.com/bridge', BRIDGE_TOKEN: 'token' })),
    /must use WSS/,
  );
});

test('parses environment values into their runtime types', () => {
  const config = loadAppConfig({
    PORT: '9000',
    SPOTIFY_REDIRECT_URI,
    TIKFINITY_WS_URL: 'wss://example.test/socket',
    STREAMERBOT_WS_URL: 'wss://streamerbot.example.test/socket',
    STREAMERBOT_WS_PASSWORD: 'test-password',
    STREAMERBOT_TIKTOK_REPLY_ACTION_ID: 'test-action-id',
    USER_COOLDOWN_SECONDS: '2.5',
    GLOBAL_COOLDOWN_SECONDS: '0',
    PLAYLIST_COMMAND_PUBLIC: 'false',
    SPOTIFY_CLEAN_ONLY: 'false',
    SPOTIFY_QUEUE_ENABLED: 'false',
    DRY_RUN: 'true',
  });

  assert.equal(config.port, 9000);
  assert.equal(config.cooldowns.userSeconds, 2.5);
  assert.equal(config.streamerBot.password, 'test-password');
  assert.equal(config.streamerBot.tiktokReplyActionId, 'test-action-id');
  assert.equal(config.playlistCommandPublic, false);
  assert.equal(config.spotify.cleanOnly, false);
  assert.equal(config.spotify.queueEnabled, false);
  assert.equal(config.dryRun, true);
});

test('reports missing Spotify settings clearly', () => {
  const config = loadAppConfig({
    SPOTIFY_CLIENT_SECRET: 'test-secret',
    SPOTIFY_PLAYLIST_ID: 'test-playlist',
  });

  assert.throws(
    () => requireSpotifyConfig(config),
    { message: 'Missing required environment variable: SPOTIFY_CLIENT_ID' },
  );
});

test('accepts complete Spotify configuration without exposing it', () => {
  const config = loadAppConfig({
    SPOTIFY_CLIENT_ID: 'test-client',
    SPOTIFY_CLIENT_SECRET: 'test-secret',
    SPOTIFY_REDIRECT_URI,
    SPOTIFY_PLAYLIST_ID: 'test-playlist',
  });

  assert.equal(requireSpotifyConfig(config), config.spotify);
});

test('rejects invalid booleans and the wrong Spotify redirect URI', () => {
  assert.throws(
    () => loadAppConfig({ PLAYLIST_COMMAND_PUBLIC: 'yes' }),
    /expected true or false/,
  );

  const config = loadAppConfig({
    SPOTIFY_CLIENT_ID: 'test-client',
    SPOTIFY_CLIENT_SECRET: 'test-secret',
    SPOTIFY_REDIRECT_URI: 'http://localhost:8787/callback',
    SPOTIFY_PLAYLIST_ID: 'test-playlist',
  });
  assert.throws(
    () => requireSpotifyConfig(config),
    { message: `SPOTIFY_REDIRECT_URI must be exactly ${SPOTIFY_REDIRECT_URI}` },
  );
});
