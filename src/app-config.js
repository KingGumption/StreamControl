const path = require('node:path');
const dotenv = require('dotenv');

const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:8787/callback';
const APP_MODES = new Set(['local', 'cloud', 'connector']);

// Resolve the file relative to the project rather than the process working
// directory so `node /path/to/src/server.js` still loads the correct .env.
dotenv.config({ path: ENV_PATH, quiet: true });

function stringValue(environment, key, fallback = '') {
  const value = environment[key];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function numberValue(environment, key, fallback, { integer = false, min = 0, max = Infinity } = {}) {
  const raw = stringValue(environment, key);
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`;
    throw new Error(`Invalid environment variable ${key}: expected ${integer ? 'an integer' : 'a number'} ${range}`);
  }
  return value;
}

function booleanValue(environment, key, fallback) {
  const raw = stringValue(environment, key).toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid environment variable ${key}: expected true or false`);
}

function urlValue(environment, key, fallback, protocols) {
  const raw = stringValue(environment, key, fallback);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid environment variable ${key}: expected a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`Invalid environment variable ${key}: expected protocol ${protocols.join(' or ')}`);
  }
  return raw;
}

function appModeValue(environment) {
  const mode = stringValue(environment, 'APP_MODE', 'local').toLowerCase();
  if (!APP_MODES.has(mode)) throw new Error('Invalid environment variable APP_MODE: expected local, cloud, or connector');
  return mode;
}

function normalizedBaseUrl(value) {
  return String(value).replace(/\/+$/, '');
}

function loadAppConfig(environment = process.env) {
  const mode = appModeValue(environment);
  const port = numberValue(environment, 'PORT', 8787, { integer: true, min: 1, max: 65535 });
  const defaultBaseUrl = `http://127.0.0.1:${port}`;
  const publicBaseUrl = normalizedBaseUrl(urlValue(environment, 'PUBLIC_BASE_URL', defaultBaseUrl, ['http:', 'https:']));
  const dataDirValue = stringValue(environment, 'DATA_DIR', path.join(PROJECT_ROOT, 'data'));
  return Object.freeze({
    mode,
    port,
    bindHost: stringValue(environment, 'BIND_HOST', mode === 'cloud' ? '0.0.0.0' : '127.0.0.1'),
    publicBaseUrl,
    dataDir: path.resolve(PROJECT_ROOT, dataDirValue),
    admin: Object.freeze({
      password: stringValue(environment, 'ADMIN_PASSWORD'),
      sessionSecret: stringValue(environment, 'SESSION_SECRET'),
    }),
    bridge: Object.freeze({
      token: stringValue(environment, 'BRIDGE_TOKEN'),
      cloudUrl: urlValue(environment, 'CONNECTOR_CLOUD_URL', 'ws://127.0.0.1:8787/bridge', ['ws:', 'wss:']),
    }),
    spotify: Object.freeze({
      clientId: stringValue(environment, 'SPOTIFY_CLIENT_ID'),
      clientSecret: stringValue(environment, 'SPOTIFY_CLIENT_SECRET'),
      redirectUri: urlValue(environment, 'SPOTIFY_REDIRECT_URI', `${publicBaseUrl}/callback`, ['http:', 'https:']),
      playlistId: stringValue(environment, 'SPOTIFY_PLAYLIST_ID'),
      cleanOnly: booleanValue(environment, 'SPOTIFY_CLEAN_ONLY', true),
      queueEnabled: booleanValue(environment, 'SPOTIFY_QUEUE_ENABLED', true),
    }),
    tikfinity: Object.freeze({
      websocketUrl: urlValue(environment, 'TIKFINITY_WS_URL', 'ws://127.0.0.1:21213/', ['ws:', 'wss:']),
    }),
    streamerBot: Object.freeze({
      websocketUrl: urlValue(environment, 'STREAMERBOT_WS_URL', 'ws://127.0.0.1:8080/', ['ws:', 'wss:']),
      password: stringValue(environment, 'STREAMERBOT_WS_PASSWORD'),
      tiktokReplyActionId: stringValue(environment, 'STREAMERBOT_TIKTOK_REPLY_ACTION_ID'),
    }),
    cooldowns: Object.freeze({
      userSeconds: numberValue(environment, 'USER_COOLDOWN_SECONDS', 5, { min: 0 }),
      globalSeconds: numberValue(environment, 'GLOBAL_COOLDOWN_SECONDS', 1, { min: 0 }),
    }),
    playlistCommandPublic: booleanValue(environment, 'PLAYLIST_COMMAND_PUBLIC', true),
    dryRun: booleanValue(environment, 'DRY_RUN', false),
  });
}

function requireSpotifyConfig(config = appConfig, { requirePlaylist = true } = {}) {
  const required = [
    ['SPOTIFY_CLIENT_ID', config.spotify.clientId],
    ['SPOTIFY_CLIENT_SECRET', config.spotify.clientSecret],
  ];
  if (requirePlaylist) required.push(['SPOTIFY_PLAYLIST_ID', config.spotify.playlistId]);

  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length === 1) {
    throw new Error(`Missing required environment variable: ${missing[0]}`);
  }
  if (missing.length > 1) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const expectedRedirectUri = `${config.publicBaseUrl}/callback`;
  if (config.spotify.redirectUri !== expectedRedirectUri) {
    throw new Error(`SPOTIFY_REDIRECT_URI must be exactly ${expectedRedirectUri}`);
  }

  return config.spotify;
}

function requireDeploymentConfig(config = appConfig) {
  if (config.mode === 'cloud') {
    if (!config.publicBaseUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL must use HTTPS in cloud mode');
    if (config.admin.password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters in cloud mode');
    if (config.admin.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters in cloud mode');
    if (config.bridge.token.length < 32) throw new Error('BRIDGE_TOKEN must contain at least 32 characters in cloud mode');
  }
  if (config.mode === 'connector') {
    if (!config.bridge.token) throw new Error('BRIDGE_TOKEN is required in connector mode');
    const cloudUrl = new URL(config.bridge.cloudUrl);
    if (cloudUrl.protocol !== 'wss:' && !['127.0.0.1', 'localhost'].includes(cloudUrl.hostname)) {
      throw new Error('CONNECTOR_CLOUD_URL must use WSS unless it points to localhost');
    }
  }
  return config;
}

const appConfig = loadAppConfig();

module.exports = {
  appConfig,
  loadAppConfig,
  requireDeploymentConfig,
  requireSpotifyConfig,
  ENV_PATH,
  SPOTIFY_REDIRECT_URI,
};
