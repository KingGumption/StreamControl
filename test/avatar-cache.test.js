const test = require('node:test');
const assert = require('node:assert/strict');
const { AvatarCache } = require('../src/avatar-cache');
const { resolveTwitchAvatar } = require('../src/avatar-resolver');

test('cache shares in-flight downloads and expires images', async () => {
  let now = 0, calls = 0;
  const cache = new AvatarCache({ ttlMs: 10, now: () => now });
  const load = async () => { calls++; return Buffer.from('image'); };
  const [a, b] = await Promise.all([cache.get('url', load), cache.get('url', load)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  await cache.get('url', load);
  assert.equal(calls, 1);
  now = 10;
  await cache.get('url', load);
  assert.equal(calls, 2);
});

test('cache bounds memory and retries failed or empty results', async () => {
  const cache = new AvatarCache({ maxBytes: 4, maxEntries: 2 });
  await cache.get('a', () => Buffer.from('aaa'));
  await cache.get('b', () => Buffer.from('bb'));
  assert.equal(cache.entries.has('a'), false);
  assert.equal(cache.bytes, 2);
  await cache.get('big', () => Buffer.alloc(5));
  assert.equal(cache.entries.has('big'), false);
  await assert.rejects(cache.get('bad', () => { throw Error('offline'); }));
  assert.equal(await cache.get('bad', () => 'ok'), 'ok');
  assert.equal(await cache.get('empty', () => ''), '');
  assert.equal(await cache.get('empty', () => 'ok'), 'ok');
});

test('quiz and Polaroid share normalized Twitch URLs in both directions', async () => {
  const url = 'https://static-cdn.jtvnw.net/jtv_user_pictures/shared.png';
  await resolveTwitchAvatar('cache_quiz', { fetchImpl: async () => new Response(url) });
  assert.equal(await resolveTwitchAvatar('@CACHE_QUIZ', { lookup: () => { throw Error('must use quiz cache'); } }), url);
  await resolveTwitchAvatar('cache_polaroid', { lookup: async () => url });
  assert.equal(await resolveTwitchAvatar('CACHE_POLAROID', { fetchImpl: () => { throw Error('must use Polaroid cache'); } }), url);
});
