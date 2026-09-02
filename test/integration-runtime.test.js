const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { StreamerBotAdapter, TikfinityAdapter, IntegrationRuntime } = require('../src/integration-runtime');

function fakeSocket() {
  return {
    readyState: 1,
    sent: [],
    send(value) { this.sent.push(JSON.parse(value)); },
  };
}

test('Streamer.bot adapter subscribes to Twitch and YouTube chat after hello', () => {
  const socket = fakeSocket();
  const adapter = new StreamerBotAdapter({
    config: { password: '', tiktokReplyActionId: '' },
    onChatEvent: () => {},
  });
  adapter.onOpen(socket);
  adapter.handleMessage(JSON.stringify({ request: 'Hello', info: {} }));

  assert.equal(socket.sent[0].request, 'Subscribe');
  assert.deepEqual(socket.sent[0].events, {
    Twitch: ['ChatMessage'],
    YouTube: ['Message'],
  });
});

test('Streamer.bot adapter authenticates before subscribing when challenged', () => {
  const socket = fakeSocket();
  const adapter = new StreamerBotAdapter({
    config: { password: 'test-password', tiktokReplyActionId: '' },
    onChatEvent: () => {},
  });
  adapter.onOpen(socket);
  adapter.handleMessage(JSON.stringify({
    request: 'Hello',
    authentication: { salt: 'salt', challenge: 'challenge' },
  }));
  assert.equal(socket.sent[0].request, 'Authenticate');
  assert.ok(socket.sent[0].authentication);

  adapter.handleMessage(JSON.stringify({ id: socket.sent[0].id, status: 'ok' }));
  assert.equal(socket.sent[1].request, 'Subscribe');
});

test('Streamer.bot adapter normalizes events and sends chat responses', async () => {
  const socket = fakeSocket();
  const events = [];
  const adapter = new StreamerBotAdapter({
    config: { password: '', tiktokReplyActionId: 'action-id' },
    onChatEvent: (event) => events.push(event),
  });
  adapter.onOpen(socket);
  adapter.handleMessage(JSON.stringify({ request: 'Hello', info: {} }));
  adapter.handleMessage(JSON.stringify({
    event: { source: 'Twitch', type: 'ChatMessage' },
    data: { text: '!playlist', user: { id: 'u1', login: 'User' } },
  }));

  assert.equal(events[0].platform, 'twitch');
  assert.equal(adapter.sendChat('twitch', 'Playlist link'), true);
  assert.equal(socket.sent.at(-1).request, 'SendMessage');
  assert.equal(adapter.sendTikTokReply('Added song'), true);
  assert.equal(socket.sent.at(-1).request, 'DoAction');
  assert.deepEqual(socket.sent.at(-1).args, { message: 'Added song' });
});

test('Streamer.bot adapter can share extra event subscriptions with feature modules', () => {
  const socket = fakeSocket();
  const messages = [];
  const adapter = new StreamerBotAdapter({
    config: { password: '', tiktokReplyActionId: '' },
    onChatEvent: () => {},
  });
  adapter.addEventSubscriptions({ Twitch: ['RewardRedemption'], Custom: ['Event'] });
  adapter.onRawMessage((message) => messages.push(message));
  adapter.onOpen(socket);
  adapter.handleMessage(JSON.stringify({ request: 'Hello', info: {} }));

  assert.deepEqual(socket.sent[0].events, {
    Twitch: ['ChatMessage', 'RewardRedemption'],
    YouTube: ['Message'],
    Custom: ['Event'],
  });
  assert.equal(messages[0].request, 'Hello');
});

test('TikFinity adapter forwards only chat events', () => {
  const events = [];
  const adapter = new TikfinityAdapter({ onChatEvent: (event) => events.push(event), tiktokRepliesConfigured: false });
  adapter.handleMessage(JSON.stringify([
    { event: 'like', data: { uniqueId: 'ignored' } },
    { event: 'chat', data: { comment: '!song Test', uniqueId: 'viewer', userId: '1' } },
  ]));
  assert.equal(events.length, 1);
  assert.equal(events[0].text, '!song Test');
});

test('cloud mode routes Streamer.bot subscriptions and events through the authenticated bridge', () => {
  const bridge = new EventEmitter();
  bridge.connected = true;
  bridge.sent = [];
  bridge.getServiceStates = () => new Map();
  bridge.sendService = (service, payload) => { bridge.sent.push({ service, payload: JSON.parse(payload) }); return true; };
  const runtime = new IntegrationRuntime({
    config: {
      streamerBot: { password: '', tiktokReplyActionId: '', websocketUrl: 'ws://unused' },
      tikfinity: { websocketUrl: 'ws://unused' },
    },
    commands: { handleChatEvent: async () => ({ handled: false }) },
    game: { handleChatEvent: () => false },
    bridge,
  });

  runtime.start();
  bridge.emit('service-state', 'streamerbot', { connected: true, detail: 'Connected' });
  bridge.emit('service-message', 'streamerbot', JSON.stringify({ request: 'Hello', info: {} }));
  assert.equal(bridge.sent[0].service, 'streamerbot');
  assert.equal(bridge.sent[0].payload.request, 'Subscribe');
  assert.deepEqual(bridge.sent[0].payload.events, { Twitch: ['ChatMessage'], YouTube: ['Message'] });
  runtime.stop();
});

test('active game votes are consumed before command handling', async () => {
  let commandCalls = 0;
  const analytics = [];
  const runtime = new IntegrationRuntime({
    config: {
      streamerBot: { password: '', tiktokReplyActionId: '', websocketUrl: 'ws://127.0.0.1:1' },
      tikfinity: { websocketUrl: 'ws://127.0.0.1:2' },
    },
    commands: {
      handleChatEvent: async () => {
        commandCalls += 1;
        return { handled: false };
      },
    },
    game: { handleChatEvent: (event) => event.text === '1' },
    recordEvent: (event) => analytics.push(event),
  });

  await runtime.handleChatEvent({ platform: 'twitch', text: '1', user: { id: 'u1', username: 'viewer' } });
  await runtime.handleChatEvent({ platform: 'twitch', text: '!song Test', user: { id: 'u1', username: 'viewer' } });
  assert.equal(commandCalls, 1);
  assert.equal(analytics.filter((event) => event.tool === 'audience').length, 2);
});
