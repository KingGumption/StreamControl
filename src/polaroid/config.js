const fs = require('node:fs');
const path = require('node:path');
const { appConfig } = require('../app-config');

const projectDir = path.resolve(__dirname, '..', '..');
const configPath = path.join(appConfig.dataDir, 'polaroid-config.json');
const legacyProjectDir = path.resolve(projectDir, '..', 'PolaroidRedeem');
const legacyConfigPath = path.join(legacyProjectDir, 'config.json');

const defaults = {
  obs: {
    url: 'ws://127.0.0.1:4455', password: '', cameraSource: 'camera',
    captureWidth: 1920, captureHeight: 1080, reconnectDelayMs: 5000,
  },
  streamerBot: {
    enabled: true, rewardTitle: 'Polaroid', rewardId: '',
    customEventName: 'PolaroidRedeem', avatarResolverEnabled: true,
    avatarResolverActionName: 'Resolve Polaroid Avatar',
    avatarResolverEventName: 'PolaroidAvatarResolved', avatarResolverTimeoutMs: 4000,
  },
  polaroid: {
    photoPosition: 'centre', captionPrefix: 'taken by =', showProfilePicture: true,
    brandingLabel: '', markerFont: 'Segoe Print', paperColour: '#f7f3e8',
    inkColour: '#171717', jpegQuality: 94,
  },
  overlay: { showMs: 11000, gapMs: 750, soundVolume: 0.8 },
  twitchChat: {
    enabled: true,
    actionName: 'Post Polaroid Link',
    message: "📸 @{redeemer}'s Polaroid: {imageUrl}",
  },
  discord: {
    enabled: true, webhookUrl: '',
    message: '📸 A new stream Polaroid — taken by {redeemer}!',
    username: 'Stream Polaroid Booth',
  },
  captureDelayMs: 750,
  keepLast: 250,
};

function merge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = merge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function booleanEnvironmentValue(environment, key) {
  if (!Object.prototype.hasOwnProperty.call(environment, key)) return undefined;
  const value = String(environment[key] ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid environment variable ${key}: expected true or false`);
}

function applyEnvironmentOverrides(config, environment = process.env) {
  if (environment.POLAROID_DISCORD_WEBHOOK) config.discord.webhookUrl = String(environment.POLAROID_DISCORD_WEBHOOK).trim();
  if (environment.POLAROID_OBS_PASSWORD) config.obs.password = String(environment.POLAROID_OBS_PASSWORD);
  if (environment.POLAROID_CAMERA_SOURCE) config.obs.cameraSource = String(environment.POLAROID_CAMERA_SOURCE).trim();
  if (environment.POLAROID_REWARD_TITLE) {
    config.streamerBot.rewardTitle = String(environment.POLAROID_REWARD_TITLE).trim();
  }
  if (environment.POLAROID_REWARD_ID) {
    config.streamerBot.rewardId = String(environment.POLAROID_REWARD_ID).trim();
  }

  const twitchChatEnabled = booleanEnvironmentValue(environment, 'POLAROID_TWITCH_CHAT_ENABLED');
  if (twitchChatEnabled !== undefined) config.twitchChat.enabled = twitchChatEnabled;
  if (environment.POLAROID_TWITCH_CHAT_ACTION_NAME) {
    config.twitchChat.actionName = String(environment.POLAROID_TWITCH_CHAT_ACTION_NAME).trim();
  }

  const avatarResolverEnabled = booleanEnvironmentValue(environment, 'POLAROID_AVATAR_RESOLVER_ENABLED');
  if (avatarResolverEnabled !== undefined) config.streamerBot.avatarResolverEnabled = avatarResolverEnabled;
  if (environment.POLAROID_AVATAR_RESOLVER_ACTION_NAME) {
    config.streamerBot.avatarResolverActionName = String(environment.POLAROID_AVATAR_RESOLVER_ACTION_NAME).trim();
  }

  return config;
}

function loadPolaroidConfig(environment = process.env) {
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else if (fs.existsSync(legacyConfigPath)) {
    userConfig = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'));
  }

  const config = merge(defaults, userConfig);
  return applyEnvironmentOverrides(config, environment);
}

module.exports = {
  applyEnvironmentOverrides,
  configPath,
  legacyConfigPath,
  legacyProjectDir,
  loadPolaroidConfig,
  dataDir: appConfig.dataDir,
  projectDir,
};
