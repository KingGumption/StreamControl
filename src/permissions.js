const PLATFORM_ROLE_ALIASES = {
  twitch: {
    broadcaster: 'broadcaster',
    moderator: 'moderator',
    vip: 'vip',
    subscriber: 'subscriber',
    follower: 'follower',
    everyone: 'everyone',
    owner: 'broadcaster',
  },
  youtube: {
    owner: 'broadcaster',
    broadcaster: 'broadcaster',
    moderator: 'moderator',
    member: 'member',
    subscriber: 'subscriber',
    viewer: 'viewer',
    everyone: 'everyone',
  },
  tiktok: {
    broadcaster: 'broadcaster',
    host: 'broadcaster',
    moderator: 'moderator',
    subscriber: 'subscriber',
    'fan club member': 'fan-club',
    'fan club': 'fan-club',
    follower: 'follower',
    everyone: 'everyone',
  },
};

const DEFAULT_PERMISSION_PRESETS = {
  owner_only: {
    twitch: ['broadcaster'],
    youtube: ['broadcaster'],
    tiktok: ['broadcaster'],
  },
  mods_plus_owner: {
    twitch: ['broadcaster', 'moderator'],
    youtube: ['broadcaster', 'moderator'],
    tiktok: ['broadcaster', 'moderator'],
  },
  trusted: {
    twitch: ['broadcaster', 'moderator', 'vip'],
    youtube: ['broadcaster', 'moderator'],
    tiktok: ['broadcaster', 'moderator'],
  },
  subscribers: {
    twitch: ['subscriber'],
    youtube: ['member', 'subscriber'],
    tiktok: ['subscriber'],
  },
  everyone: {
    twitch: ['everyone'],
    youtube: ['everyone'],
    tiktok: ['everyone'],
  },
};

function normalizeRole(platform, role) {
  if (!role || typeof role !== 'string') {
    return null;
  }

  const normalized = role.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const aliases = PLATFORM_ROLE_ALIASES[platform] || {};
  if (aliases[normalized]) {
    return aliases[normalized];
  }

  const direct = normalized.replace(/[_\s]+/g, '-');
  if (aliases[direct]) {
    return aliases[direct];
  }

  return normalized;
}

function normalizeRoles(platform, roles = []) {
  if (!Array.isArray(roles)) {
    return [];
  }

  const normalized = roles
    .map((role) => normalizeRole(platform, role))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function defaultCommandPermissions() {
  return {
    song: {
      twitch: ['broadcaster', 'moderator'],
      youtube: ['broadcaster', 'moderator'],
      tiktok: ['broadcaster', 'moderator'],
    },
    playlist: {
      twitch: ['everyone'],
      youtube: ['everyone'],
      tiktok: ['everyone'],
    },
    songremove: {
      twitch: ['broadcaster', 'moderator'],
      youtube: ['broadcaster', 'moderator'],
      tiktok: ['broadcaster', 'moderator'],
    },
    skip: {
      twitch: ['broadcaster', 'moderator'],
      youtube: ['broadcaster', 'moderator'],
      tiktok: ['broadcaster', 'moderator'],
    },
    songlast: {
      twitch: ['everyone'],
      youtube: ['everyone'],
      tiktok: ['everyone'],
    },
  };
}

function getEffectiveCommandConfig(command, config = {}) {
  const commandConfig = config.commands && config.commands[command];
  if (!commandConfig) {
    return defaultCommandPermissions()[command] || {};
  }

  return commandConfig;
}

function getUserOverride(overrides = [], platform, username, command, userId) {
  const targetUsername = String(username || '').trim().toLowerCase();
  const targetUserId = String(userId || '').trim();

  const matches = overrides.filter((override) => {
    const samePlatform = (override.platform || '').toLowerCase() === String(platform || '').toLowerCase();
    const sameCommand = (override.command || '').toLowerCase() === String(command || '').toLowerCase();
    const overrideId = String(override.user_id || override.userId || '').trim();
    const sameUser = overrideId
      ? Boolean(targetUserId && overrideId === targetUserId)
      : Boolean(targetUsername && (override.username || '').trim().toLowerCase() === targetUsername);
    return samePlatform && sameCommand && sameUser;
  });
  return matches.find((override) => override.access === 'deny')
    || matches.find((override) => override.access === 'allow')
    || null;
}

function sanitizeCommandPermissions(commands) {
  if (!commands || typeof commands !== 'object' || Array.isArray(commands)) return {};
  const allowedCommands = new Set(Object.keys(defaultCommandPermissions()));

  return Object.entries(commands).reduce((result, [command, platformConfig]) => {
    if (!allowedCommands.has(command) || !platformConfig || typeof platformConfig !== 'object') return result;
    result[command] = {};
    Object.keys(PLATFORM_ROLE_ALIASES).forEach((platform) => {
      const allowedRoles = new Set(Object.values(PLATFORM_ROLE_ALIASES[platform]));
      result[command][platform] = normalizeRoles(platform, platformConfig[platform] || [])
        .filter((role) => allowedRoles.has(role));
    });
    return result;
  }, {});
}

function canUseCommand({
  command,
  platform,
  user,
  config = {},
  overrides = [],
} = {}) {
  if (!command || !platform || !user) {
    return { allowed: false, reason: 'invalid-input' };
  }

  const commandKey = String(command).toLowerCase();
  const platformKey = String(platform).toLowerCase();
  const username = String(user.username || '').trim();
  const normalizedUserRoles = normalizeRoles(platformKey, user.roles || []);
  const commandConfig = getEffectiveCommandConfig(commandKey, config);
  const platformRoles = Array.isArray(commandConfig[platformKey]) ? commandConfig[platformKey] : [];
  const normalizedAllowedRoles = normalizeRoles(platformKey, platformRoles);

  const override = getUserOverride(overrides, platformKey, username, commandKey, user.id);
  if (override && override.access === 'deny') {
    return { allowed: false, reason: 'user-deny' };
  }
  if (override && override.access === 'allow') {
    return { allowed: true, reason: 'user-allow' };
  }

  const hasBroadcasterRole = normalizedUserRoles.includes('broadcaster') || user.isBroadcaster === true || user.isOwner === true;
  if (hasBroadcasterRole) {
    return { allowed: true, reason: 'broadcaster' };
  }

  const matchesAllowedRole = normalizedAllowedRoles.includes('everyone') || normalizedUserRoles.some((role) => normalizedAllowedRoles.includes(role));
  if (matchesAllowedRole) {
    return { allowed: true, reason: 'role' };
  }

  return { allowed: false, reason: 'role-denied' };
}

module.exports = {
  normalizeRole,
  normalizeRoles,
  DEFAULT_PERMISSION_PRESETS,
  defaultCommandPermissions,
  sanitizeCommandPermissions,
  getEffectiveCommandConfig,
  getUserOverride,
  canUseCommand,
};
