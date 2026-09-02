const { startAdminServer } = require('./admin');
const { appConfig, requireDeploymentConfig } = require('./app-config');
const { getLiveConfig, saveConfig } = require('./config');
const { canUseCommand, normalizeRoles } = require('./permissions');
const { addAuditLog, upsertOverride, deleteOverride, listOverrides } = require('./db');
const { integrationRuntime } = require('./integration-runtime');
const { spotifyAuth } = require('./spotify-auth');
const { polaroidRuntime } = require('./polaroid/runtime');
const { bridgeHub } = require('./bridge-hub');

function resolveUserFromPlatform(platform, user) {
  const isPlatformUser = user && typeof user === 'object';
  if (!isPlatformUser) {
    return { id: '', username: '', roles: [] };
  }

  const roles = Array.isArray(user.roles) ? user.roles : [];
  return {
    id: user.id || '',
    username: user.username || '',
    roles: normalizeRoles(platform, roles),
    isBroadcaster: !!user.isBroadcaster,
    isOwner: !!user.isOwner,
  };
}

const ROLE_LIMITATIONS = {
  twitch: {
    note: 'VIP and follower role availability depends on Twitch API data; not all events expose them reliably.'
  },
  youtube: {
    note: 'Subscriber/viewer status is only available when the platform exposes a viewer or member entitlement in the event payload.'
  },
  tiktok: {
    note: 'Fan club and follower roles depend on platform visibility; if not supplied in the event payload they are not inferred.'
  }
};

function processCommand({ command, platform, user, message } = {}) {
  const config = getLiveConfig();
  const overrides = config.overrides || [];
  const normalizedUser = resolveUserFromPlatform(platform, user);
  const result = canUseCommand({
    command,
    platform,
    user: normalizedUser,
    config,
    overrides,
  });

  if (message && typeof message === 'string') {
    if (result.allowed) {
      console.log(`[${platform}] ${normalizedUser.username || 'unknown'} allowed ${command}`);
    } else {
      console.log(`[${platform}] ${normalizedUser.username || 'unknown'} denied ${command} (${result.reason})`);
    }
  }

  return result;
}

requireDeploymentConfig(appConfig);
if (appConfig.mode === 'connector') throw new Error('Connector mode must be started with npm run connector');
const httpServer = startAdminServer(appConfig.port);
if (appConfig.mode === 'cloud') bridgeHub.attach(httpServer);
polaroidRuntime.start({ streamerBot: integrationRuntime.streamerBot, port: appConfig.port });
integrationRuntime.start();
spotifyAuth.initialize();

async function shutdown() {
  integrationRuntime.stop();
  await polaroidRuntime.stop();
  bridgeHub.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

module.exports = {
  processCommand,
  getLiveConfig,
  saveConfig,
  listOverrides,
  upsertOverride,
  deleteOverride,
  addAuditLog,
  ROLE_LIMITATIONS,
};
