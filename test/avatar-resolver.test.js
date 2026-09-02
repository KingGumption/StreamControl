const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTwitchAvatar,
  safeTwitchCdnUrl,
  TWITCH_AVATAR_ENDPOINT,
} = require('../src/avatar-resolver');

test('resolves and validates a Twitch CDN avatar', async () => {
  const calls = [];
  const avatar = await resolveTwitchAvatar('Example_User', {
    now: () => 100,
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response('https://static-cdn.jtvnw.net/jtv_user_pictures/example.png');
    },
  });

  assert.equal(calls[0], `${TWITCH_AVATAR_ENDPOINT}example_user`);
  assert.equal(avatar, 'https://static-cdn.jtvnw.net/jtv_user_pictures/example.png');
});

test('rejects invalid usernames and non-Twitch avatar hosts', async () => {
  assert.equal(await resolveTwitchAvatar('../bad', { fetchImpl: async () => { throw new Error('must not fetch'); } }), '');
  assert.equal(safeTwitchCdnUrl('https://example.com/avatar.png'), '');
  assert.equal(safeTwitchCdnUrl('javascript:alert(1)'), '');
});
