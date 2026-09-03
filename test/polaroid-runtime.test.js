const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const { PolaroidRuntime } = require('../src/polaroid/runtime');

class FakeObs extends EventEmitter {
  constructor(connectResults = []) {
    super();
    this.connectResults = [...connectResults];
    this.connectCalls = 0;
  }

  async connect() {
    this.connectCalls += 1;
    const result = this.connectResults.shift();
    if (result instanceof Error) throw result;
    return result;
  }

  async disconnect() {}
}

function makeConfig() {
  return {
    obs: { url: 'ws://127.0.0.1:4455', password: '', cameraSource: 'Camera' },
    streamerBot: { enabled: false, rewardTitle: 'Take a Polaroid' },
    discord: { enabled: false, webhookUrl: '' },
    twitchChat: { enabled: false, actionName: '' },
  };
}

async function waitFor(check, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

test('Polaroid retries OBS after an initial connection failure', async (t) => {
  const obs = new FakeObs([new Error('offline'), undefined]);
  const runtime = new PolaroidRuntime({ config: makeConfig(), obs, reconnectDelayMs: 5 });
  t.after(() => runtime.stop());

  runtime.start();
  await waitFor(() => runtime.state.obsConnected);

  assert.equal(obs.connectCalls, 2);
  assert.equal(runtime.state.lastError, '');
});

test('Polaroid reconnects when an established OBS connection closes', async (t) => {
  const obs = new FakeObs([undefined, undefined]);
  const runtime = new PolaroidRuntime({ config: makeConfig(), obs, reconnectDelayMs: 5 });
  t.after(() => runtime.stop());

  runtime.start();
  await waitFor(() => runtime.state.obsConnected);
  obs.emit('ConnectionClosed');
  await waitFor(() => obs.connectCalls === 2);

  assert.equal(runtime.state.obsConnected, true);
});

test('Polaroid cancels pending OBS retries while stopping', async () => {
  const obs = new FakeObs([new Error('offline')]);
  const runtime = new PolaroidRuntime({ config: makeConfig(), obs, reconnectDelayMs: 20 });

  runtime.start();
  await waitFor(() => obs.connectCalls === 1);
  await runtime.stop();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(obs.connectCalls, 1);
});

test('Polaroid test captures can skip Discord and Twitch delivery', async () => {
  let discordCalls = 0;
  let twitchCalls = 0;
  const runtime = new PolaroidRuntime({
    config: makeConfig(),
    obs: new FakeObs(),
    discordSender: async () => {
      discordCalls += 1;
      return { skipped: false, attachmentUrl: 'https://cdn.example/photo.jpg' };
    },
  });
  runtime.postPolaroidToTwitchChat = async () => { twitchCalls += 1; };

  const result = await runtime.deliverCapture(
    { redeemerName: 'Test Viewer', deliverToDiscord: false },
    Buffer.from('jpeg'),
    'test.jpg',
  );

  assert.equal(result.skipped, true);
  assert.equal(discordCalls, 0);
  assert.equal(twitchCalls, 0);
});

test('normal Polaroid captures continue to deliver to Discord and Twitch', async () => {
  let discordCalls = 0;
  let twitchUrl = '';
  const runtime = new PolaroidRuntime({
    config: makeConfig(),
    obs: new FakeObs(),
    discordSender: async () => {
      discordCalls += 1;
      return { skipped: false, attachmentUrl: 'https://cdn.example/photo.jpg' };
    },
  });
  runtime.postPolaroidToTwitchChat = async (_redeemerName, imageUrl) => { twitchUrl = imageUrl; };

  const result = await runtime.deliverCapture(
    { redeemerName: 'Live Viewer', deliverToDiscord: true },
    Buffer.from('jpeg'),
    'live.jpg',
  );

  assert.equal(result.skipped, false);
  assert.equal(discordCalls, 1);
  assert.equal(twitchUrl, 'https://cdn.example/photo.jpg');
});

test('Polaroid test jobs do not record analytics events', () => {
  const recorded = [];
  const runtime = new PolaroidRuntime({
    config: makeConfig(),
    obs: new FakeObs(),
    recordEvent: (item) => recorded.push(item),
  });

  runtime.track('capture_completed', { id: 'test-1', source: 'Admin', redeemerName: 'Test Viewer', isTest: true });
  runtime.track('capture_completed', { id: 'live-1', source: 'Twitch', redeemerName: 'Live Viewer', isTest: false });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].correlationId, 'live-1');
});
