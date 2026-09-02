const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canUseCommand,
  normalizeRole,
  DEFAULT_PERMISSION_PRESETS,
  sanitizeCommandPermissions,
} = require('../src/permissions');

// Explicit deny takes precedence.
test('explicit deny overrides role access', () => {
  const result = canUseCommand({
    command: 'song',
    platform: 'twitch',
    user: { id: 'u1', username: 'User', roles: ['moderator'] },
    overrides: [{ platform: 'twitch', username: 'user', command: 'song', access: 'deny' }],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'user-deny');
});

// Explicit allow should override a role mismatch.
test('explicit allow overrides disallowed roles', () => {
  const result = canUseCommand({
    command: 'song',
    platform: 'twitch',
    user: { id: 'u2', username: 'User2', roles: ['viewer'] },
    overrides: [{ platform: 'twitch', username: 'user2', command: 'song', access: 'allow' }],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'user-allow');
});

test('explicit deny wins when both ID and username overrides match', () => {
  const result = canUseCommand({
    command: 'song',
    platform: 'twitch',
    user: { id: 'u1', username: 'User', roles: ['moderator'] },
    overrides: [
      { platform: 'twitch', username: 'User', command: 'song', access: 'allow' },
      { platform: 'twitch', user_id: 'u1', username: 'OldName', command: 'song', access: 'deny' },
    ],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'user-deny');
});

// Broadcaster privilege is honored for all platforms.
test('broadcaster privilege passes without config', () => {
  const result = canUseCommand({
    command: 'song',
    platform: 'youtube',
    user: { id: 'u3', username: 'Owner', roles: ['broadcaster'] },
    config: { commands: { song: { youtube: ['moderator'] } } },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'broadcaster');
});

// Role normalization converts platform names to canonical values.
test('platform roles normalize to canonical roles', () => {
  assert.equal(normalizeRole('twitch', 'broadcaster'), 'broadcaster');
  assert.equal(normalizeRole('youtube', 'owner'), 'broadcaster');
  assert.equal(normalizeRole('tiktok', 'host'), 'broadcaster');
  assert.equal(normalizeRole('twitch', 'vip'), 'vip');
  assert.equal(normalizeRole('youtube', 'member'), 'member');
  assert.equal(normalizeRole('tiktok', 'fan club member'), 'fan-club');
});

// Preset definitions are exposed as configuration data.
test('default presets contain expected config', () => {
  assert.ok(DEFAULT_PERMISSION_PRESETS.owner_only.twitch.includes('broadcaster'));
  assert.ok(DEFAULT_PERMISSION_PRESETS.everyone.twitch.includes('everyone'));
});

test('permission saves discard undefined commands, platforms, and roles', () => {
  assert.deepEqual(sanitizeCommandPermissions({
    undefined: { undefined: [] },
    song: {
      twitch: ['moderator', 'made-up-role'],
      youtube: ['owner'],
      tiktok: ['fan club'],
      undefined: ['everyone'],
    },
  }), {
    song: {
      twitch: ['moderator'],
      youtube: ['broadcaster'],
      tiktok: ['fan-club'],
    },
  });
});
