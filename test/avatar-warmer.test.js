const test = require('node:test');
const assert = require('node:assert/strict');
const { AvatarWarmer } = require('../src/avatar-warmer');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('warming is nonblocking, throttled, bounded and retries failures', async () => {
  let now = 0, attempts = 0;
  let release;
  const warmer = new AvatarWarmer({ now: () => now, concurrency: 1, maxQueue: 1,
    resolve: async () => { attempts++; await new Promise(r => { release = r; }); throw Error('offline'); },
    download: () => { throw Error('must not download'); },
  });
  const event = name => ({ platform: 'twitch', user: { username: name } });
  assert.equal(warmer.warm(event('first')), undefined);
  warmer.warm(event('first'));
  warmer.warm(event('second'));
  warmer.warm(event('third'));
  await flush();
  assert.equal(attempts, 1);
  assert.equal(warmer.queue.length, 1);
  release(); await flush();
  assert.equal(attempts, 2);
  release(); await flush();
  warmer.warm(event('first')); await flush();
  assert.equal(attempts, 2);
  now = 60000;
  warmer.warm(event('first')); await flush();
  assert.equal(attempts, 3);
  release(); await flush();
  assert.equal(warmer.active, 0);
});

test('interaction events warm supplied images and skip tests/system events', async () => {
  const downloaded = [], resolved = [];
  const warmer = new AvatarWarmer({ resolve: async name => { resolved.push(name); return 'https://example.com/twitch.png'; }, download: async url => downloaded.push(url) });
  warmer.streamerBot({ event: { source: 'Twitch', type: 'Follow' }, data: { targetUser: { login: 'Follower' } } });
  warmer.streamerBot({ event: { source: 'YouTube', type: 'NewSponsor' }, data: { user: { id: 'yt', profileImageUrl: 'https://example.com/yt.png' } } });
  warmer.tikfinity({ event: 'like', data: { userId: 'tt', profilePictureUrl: 'https://example.com/tt.png' } });
  warmer.streamerBot({ event: { source: 'Twitch', type: 'RewardRedemption' }, data: { isTest: true, user: { login: 'test' } } });
  warmer.streamerBot({ event: { source: 'Twitch', type: 'StreamOnline' }, data: { user: { login: 'system' } } });
  warmer.tikfinity({ event: 'gift', isTest: true, data: { profilePictureUrl: 'https://example.com/test.png' } });
  warmer.warm({ platform: 'youtube', user: { username: 'no_url' } });
  await flush();
  assert.deepEqual(resolved, ['follower']);
  assert.deepEqual(downloaded.sort(), ['https://example.com/tt.png','https://example.com/twitch.png','https://example.com/yt.png'].sort());
});

test('warming fills the exact URL and image caches used by Polaroid', async t => {
  const { resolveTwitchAvatar } = require('../src/avatar-resolver');
  const { downloadAvatarImage } = require('../src/avatar-images');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; return new Response('image', { headers: { 'content-type': 'image/png' } }); };
  const url = 'https://static-cdn.jtvnw.net/jtv_user_pictures/warmed.png';
  const warmer = new AvatarWarmer();
  warmer.warm({ platform: 'twitch', user: { username: 'warmed_viewer', profileImageUrl: url } });
  await flush();
  assert.equal(await resolveTwitchAvatar('warmed_viewer', { lookup: () => { throw Error('must be cached'); } }), url);
  assert.equal((await downloadAvatarImage(url)).toString(), 'image');
  assert.equal(fetches, 1);
});

test('integration warms game interactions before the game consumes them', async () => {
  const { IntegrationRuntime } = require('../src/integration-runtime');
  const seen = [];
  const runtime = new IntegrationRuntime({ config: { streamerBot: {}, tikfinity: {} },
    avatars: { warm: e => seen.push(e), streamerBot: e => seen.push(e), tikfinity: e => seen.push(e) },
    quiz: { handleChatEvent: () => true }, commands: { handleChatEvent: () => { throw Error('quiz consumed event'); } },
  });
  const event = { platform: 'twitch', messageId: 'join', user: { username: 'player' }, text: '!join' };
  await runtime.handleChatEvent(event);
  await runtime.handleChatEvent(event);
  assert.deepEqual(seen, [event]);
  const follow = { event: { source: 'Twitch', type: 'Follow' }, data: { user: { login: 'newfollower' } } };
  runtime.streamerBot.handleMessage(JSON.stringify(follow));
  assert.deepEqual(seen[1], follow);
  const like = { event: 'like', data: { uniqueId: 'liker' } };
  runtime.tikfinity.handleMessage(JSON.stringify(like));
  assert.deepEqual(seen[2], like);
});
