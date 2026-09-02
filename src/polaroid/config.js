const fs = require('node:fs');
const path = require('node:path');
const { appConfig } = require('../app-config');

const projectDir = path.resolve(__dirname, '..', '..');
const configPath = path.join(appConfig.dataDir, 'polaroid-config.json');
const legacyProjectDir = path.resolve(projectDir, '..', 'PolaroidRedeem');
const legacyConfigPath = path.join(legacyProjectDir, 'config.json');

const defaults = {
  obs: {
    url: 'ws://127.0.0.1:4455', password: '', cameraSource: 'Camera',
    captureWidth: 1920, captureHeight: 1080, reconnectDelayMs: 5000,
  },
  streamerBot: {
    enabled: true, rewardTitle: 'Take a Polaroid', rewardId: '',
    customEventName: 'PolaroidRedeem', avatarResolverEnabled: false,
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
    enabled: false,
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

function loadPolaroidConfig() {
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else if (fs.existsSync(legacyConfigPath)) {
    userConfig = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'));
  }

  const config = merge(defaults, userConfig);
  if (process.env.POLAROID_DISCORD_WEBHOOK) config.discord.webhookUrl = process.env.POLAROID_DISCORD_WEBHOOK;
  if (process.env.POLAROID_OBS_PASSWORD) config.obs.password = process.env.POLAROID_OBS_PASSWORD;
  if (process.env.POLAROID_CAMERA_SOURCE) config.obs.cameraSource = process.env.POLAROID_CAMERA_SOURCE;
  return config;
}

module.exports = {
  configPath,
  legacyConfigPath,
  legacyProjectDir,
  loadPolaroidConfig,
  dataDir: appConfig.dataDir,
  projectDir,
};
