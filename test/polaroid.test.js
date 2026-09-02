const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { parseStreamerBotMessage, safeFilePart, safeRedeemerName } = require('../src/polaroid/events');
const { renderPolaroid } = require('../src/polaroid/renderer');
const { sendToDiscord } = require('../src/polaroid/discord');

const settings = {
  rewardTitle: 'Take a Polaroid',
  rewardId: '',
  customEventName: 'PolaroidRedeem',
};

test('parses matching Polaroid rewards and ignores unrelated rewards', () => {
  const matching = parseStreamerBotMessage({
    event: { source: 'Twitch', type: 'RewardRedemption' },
    data: {
      id: 'event-123',
      user: { id: 'viewer-1', displayName: 'Lovely Viewer', badges: [{ name: 'subscriber' }] },
      reward: { id: 'reward-1', title: 'Take a Polaroid' },
    },
  }, settings);
  assert.deepEqual(matching, {
    redeemerName: 'Lovely Viewer',
    profileImageUrl: '',
    userId: 'viewer-1',
    roles: ['subscriber'],
    eventId: 'event-123',
    source: 'Twitch',
  });

  const unrelated = parseStreamerBotMessage({
    event: { source: 'Twitch', type: 'RewardRedemption' },
    data: { userName: 'Viewer', reward: { title: 'Hydrate' } },
  }, settings);
  assert.equal(unrelated, null);
});

test('parses custom Polaroid events and sanitises names', () => {
  const custom = parseStreamerBotMessage({
    event: { source: 'Custom', type: 'Event' },
    data: { eventName: 'PolaroidRedeem', args: { userDisplayName: 'Custom Viewer' } },
  }, settings);
  assert.equal(custom.redeemerName, 'Custom Viewer');
  assert.equal(custom.source, 'Custom');
  assert.equal(safeRedeemerName('  Viewer\nName\u0000  '), 'Viewer Name');
  assert.equal(safeFilePart('Viewer / Name!?'), 'Viewer-Name');
});

test('renders a 1200 by 1450 Polaroid JPEG', async () => {
  const cameraFrame = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#6d3fd1' },
  }).png().toBuffer();
  const result = await renderPolaroid(cameraFrame, 'Test Viewer', {});
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1450);
});

test('Discord delivery requests a response and returns its attachment URL', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({ attachments: [{ url: 'https://cdn.example/photo.jpg' }] }),
    };
  };
  const result = await sendToDiscord(
    'https://discord.com/api/webhooks/example/token',
    Buffer.from('jpeg'),
    'photo.jpg',
    'Test Viewer',
    { enabled: true, message: 'By {redeemer}', username: 'Test' },
  );
  assert.equal(new URL(requestedUrl).searchParams.get('wait'), 'true');
  assert.equal(result.attachmentUrl, 'https://cdn.example/photo.jpg');
});
