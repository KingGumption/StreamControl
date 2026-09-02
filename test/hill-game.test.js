const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { HillGame, TOPICS } = require('../src/hill-game');

function voter(id, text, platform = 'twitch') {
  return { platform, text, user: { id, username: `viewer-${id}` } };
}

test('provides seventeen topics with ten answers each', () => {
  assert.equal(TOPICS.length, 17);
  TOPICS.forEach((topic) => assert.equal(topic.entries.length, 10, topic.title));
  assert.deepEqual(TOPICS.slice(-10).map((topic) => topic.id), [
    'dessert', 'animal', 'music', 'holiday', 'transport',
    'breakfast', 'creature', 'sport', 'landmark', 'crisps',
  ]);
  const entryIds = TOPICS.flatMap((topic) => topic.entries.map((entry) => entry.id));
  assert.equal(new Set(entryIds).size, entryIds.length, 'answer IDs must remain unique');
});

test('every answer has a locally cached attributed image', () => {
  const artDirectory = path.join(__dirname, '..', 'public', 'hill-art-official');
  const manifest = JSON.parse(fs.readFileSync(path.join(artDirectory, 'manifest.json'), 'utf8'));
  TOPICS.forEach((topic) => topic.entries.forEach((entry) => {
    const asset = manifest.assets[`${topic.id}/${entry.id}`];
    assert.ok(asset, `${topic.title}: ${entry.title} is missing artwork metadata`);
    assert.ok(fs.existsSync(path.join(artDirectory, asset.file)), `${entry.title} artwork file is missing`);
    assert.match(asset.sourceUrl, /^https:\/\//);
    assert.ok(asset.sourceOwner, `${entry.title} is missing source ownership metadata`);
    assert.ok(asset.sourceType, `${entry.title} is missing source type metadata`);
  }));
});

test('runs topic voting followed by five one-vote-per-viewer hill rounds', () => {
  const timers = [];
  let now = 1000;
  const game = new HillGame({
    random: () => 0,
    now: () => now,
    schedule: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    cancel: () => {},
  });

  let state = game.start();
  assert.equal(state.phase, 'topic');
  assert.equal(state.options.length, 2);
  assert.equal(timers.at(-1).delay, 30000);

  assert.equal(game.handleChatEvent(voter('a', '1')), true);
  assert.equal(game.handleChatEvent(voter('a', '2')), true);
  assert.equal(game.handleChatEvent(voter('b', '2')), true);
  assert.equal(game.handleChatEvent(voter('a', '1', 'youtube')), true);
  assert.equal(game.handleChatEvent(voter('c', '2', 'tiktok')), true);
  state = game.getState();
  assert.deepEqual(state.options.map((option) => option.votes), [2, 2]);
  assert.deepEqual(state.options.map((option) => option.percent), [50, 50]);
  assert.deepEqual(state.options.map((option) => option.platformVotes), [
    { twitch: 1, youtube: 1 },
    { twitch: 1, tiktok: 1 },
  ]);
  assert.equal(game.handleChatEvent(voter('c', 'pick 1')), false);

  game.finishPhase();
  assert.equal(game.getState().phase, 'battle');
  assert.equal(game.getState().round, 1);
  assert.match(game.getState().options[0].imageUrl, /^\/assets\/hill-art-official\//);
  for (let round = 1; round <= 5; round += 1) {
    game.handleChatEvent(voter(`round-${round}`, '1'));
    state = game.finishPhase();
    if (round < 5) assert.equal(state.round, round + 1);
  }
  assert.equal(state.phase, 'champion');
  assert.equal(state.options.length, 1);

  now += 8000;
  state = game.finishPhase();
  assert.equal(state.phase, 'topic');
  assert.equal(state.running, true);
});

test('stopping hides the game and artwork is only returned for known entries', () => {
  const game = new HillGame({ schedule: () => ({ unref() {} }), cancel: () => {} });
  game.start();
  const state = game.stop();
  assert.equal(state.phase, 'idle');
  assert.equal(state.running, false);
  assert.match(game.artwork('topics', TOPICS[0].id), /^<svg/);
  assert.equal(game.artwork('missing', 'missing'), null);
});

test('updated timings apply from the next game stage', () => {
  const delays = [];
  const game = new HillGame({
    random: () => 0,
    schedule: (callback, delay) => {
      delays.push(delay);
      return { callback, unref() {} };
    },
    cancel: () => {},
  });

  game.start();
  assert.equal(delays.at(-1), 30000);
  const state = game.setTimings({ topicSeconds: 12, roundSeconds: 14, championSeconds: 4 });
  assert.deepEqual(state.timings, { topicSeconds: 12, roundSeconds: 14, championSeconds: 4 });
  assert.equal(delays.at(-1), 30000);
  game.finishPhase();
  assert.equal(delays.at(-1), 14000);
  game.stop();
});

test('configured round count controls the next selected topic', () => {
  const game = new HillGame({
    roundCount: 5,
    random: () => 0,
    schedule: () => ({ unref() {} }),
    cancel: () => {},
  });
  game.start();
  game.setRoundCount(3);
  let state = game.finishPhase();
  assert.equal(state.totalRounds, 3);
  for (let round = 1; round <= 3; round += 1) state = game.finishPhase();
  assert.equal(state.phase, 'champion');
  assert.throws(() => game.setRoundCount(10), /1 to 9/);
  game.stop();
});

test('records granular game, phase, and voter analytics', () => {
  const events = [];
  const game = new HillGame({
    random: () => 0,
    schedule: () => ({ unref() {} }),
    cancel: () => {},
    recordEvent: (event) => events.push(event),
  });

  game.start();
  game.handleChatEvent(voter('a', '1'));
  game.finishPhase();
  game.handleChatEvent(voter('b', '2', 'youtube'));
  game.finishPhase();

  assert.equal(events[0].eventType, 'game_started');
  assert.equal(events[1].eventType, 'vote');
  assert.equal(events[1].username, 'viewer-a');
  assert.equal(events[2].eventType, 'phase_completed');
  assert.equal(events[2].metadata.totalVotes, 1);
  assert.equal(events[3].platform, 'youtube');
  assert.equal(events[4].metadata.phase, 'battle');
  assert.ok(events.every((event) => event.correlationId === events[0].correlationId));
  game.stop();
});
