const test = require('node:test');
const assert = require('node:assert/strict');

const { applyEnvironmentOverrides } = require('../src/polaroid/config');

function makeConfig() {
  return {
    obs: { password: '', cameraSource: 'Camera' },
    streamerBot: { avatarResolverEnabled: false, avatarResolverActionName: '' },
    twitchChat: { enabled: false, actionName: '' },
    discord: { webhookUrl: '' },
  };
}

test('Polaroid integration environment settings override persisted values', () => {
  const config = applyEnvironmentOverrides(makeConfig(), {
    POLAROID_TWITCH_CHAT_ENABLED: 'true',
    POLAROID_TWITCH_CHAT_ACTION_NAME: 'Post Polaroid Link',
    POLAROID_AVATAR_RESOLVER_ENABLED: 'TRUE',
    POLAROID_AVATAR_RESOLVER_ACTION_NAME: 'Resolve Polaroid Avatar',
  });

  assert.equal(config.twitchChat.enabled, true);
  assert.equal(config.twitchChat.actionName, 'Post Polaroid Link');
  assert.equal(config.streamerBot.avatarResolverEnabled, true);
  assert.equal(config.streamerBot.avatarResolverActionName, 'Resolve Polaroid Avatar');
});

test('Polaroid integration environment switches accept explicit false', () => {
  const config = makeConfig();
  config.twitchChat.enabled = true;
  config.streamerBot.avatarResolverEnabled = true;

  applyEnvironmentOverrides(config, {
    POLAROID_TWITCH_CHAT_ENABLED: 'false',
    POLAROID_AVATAR_RESOLVER_ENABLED: 'false',
  });

  assert.equal(config.twitchChat.enabled, false);
  assert.equal(config.streamerBot.avatarResolverEnabled, false);
});

test('blank Polaroid integration environment switches leave persisted values unchanged', () => {
  const config = makeConfig();
  config.twitchChat.enabled = true;
  config.streamerBot.avatarResolverEnabled = true;

  applyEnvironmentOverrides(config, {
    POLAROID_TWITCH_CHAT_ENABLED: '',
    POLAROID_AVATAR_RESOLVER_ENABLED: ' ',
  });

  assert.equal(config.twitchChat.enabled, true);
  assert.equal(config.streamerBot.avatarResolverEnabled, true);
});

test('Polaroid integration environment switches reject invalid values', () => {
  assert.throws(
    () => applyEnvironmentOverrides(makeConfig(), { POLAROID_TWITCH_CHAT_ENABLED: 'yes' }),
    /POLAROID_TWITCH_CHAT_ENABLED: expected true or false/,
  );
});
