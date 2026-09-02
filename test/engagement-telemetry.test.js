const test = require('node:test');
const assert = require('node:assert/strict');

const { EngagementTelemetry, STREAMERBOT_TELEMETRY_SUBSCRIPTIONS } = require('../src/engagement-telemetry');

function harness() {
  const calls = { events: [], snapshots: [], opened: [], closed: [] };
  const store = {
    addEngagementEvent: (row) => calls.events.push(row),
    addViewerSnapshot: (row) => calls.snapshots.push(row),
    openStreamSession: (row) => { calls.opened.push(row); return row.id; },
    closeStreamSession: (row) => { calls.closed.push(row); return row.id || `${row.platform}:active`; },
  };
  return { calls, telemetry: new EngagementTelemetry({ store }) };
}

test('subscribes to platform lifecycle, viewer, and outcome events', () => {
  assert.ok(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS.Twitch.includes('StreamOnline'));
  assert.ok(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS.Twitch.includes('ViewerCountUpdate'));
  assert.ok(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS.Twitch.includes('Follow'));
  assert.ok(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS.YouTube.includes('StatisticsUpdated'));
  assert.ok(STREAMERBOT_TELEMETRY_SUBSCRIPTIONS.YouTube.includes('NewSponsor'));
});

test('captures Twitch sessions, viewer levels, stable identities, roles, and outcomes', () => {
  const { calls, telemetry } = harness();
  telemetry.handleStreamerBot({
    event: { source: 'Twitch', type: 'StreamOnline' },
    data: { id: 'stream-1', startedAt: '2026-09-01T18:00:00Z', status: 'Analytics test', game: { name: 'Science & Technology' } },
  });
  telemetry.handleStreamerBot({ event: { source: 'Twitch', type: 'ViewerCountUpdate' }, timeStamp: '2026-09-01T18:05:00Z', data: { viewerCount: 42 } });
  telemetry.handleStreamerBot({
    event: { source: 'Twitch', type: 'Sub' },
    data: { createdAt: '2026-09-01T18:06:00Z', user: { id: 'u1', login: 'alice', name: 'Alice', subscribed: true }, subTier: '1000', durationMonths: 3 },
  });
  telemetry.handleStreamerBot({
    event: { source: 'Twitch', type: 'Raid' },
    data: { createdAt: '2026-09-01T18:07:00Z', raider: { id: 'r1', login: 'raider' }, viewers: 20 },
  });
  telemetry.handleStreamerBot({ event: { source: 'Twitch', type: 'StreamOffline' }, data: { endedAt: '2026-09-01T19:00:00Z' } });

  assert.equal(calls.opened[0].id, 'twitch:stream-1');
  assert.equal(calls.opened[0].category, 'Science & Technology');
  assert.deepEqual(calls.snapshots[0], {
    timestamp: '2026-09-01T18:05:00.000Z', platform: 'twitch', sessionId: 'twitch:stream-1', viewerCount: 42, totalViewers: null, source: 'streamerbot',
  });
  const subscription = calls.events.find((row) => row.eventType === 'subscription');
  assert.equal(subscription.userId, 'u1');
  assert.equal(subscription.username, 'alice');
  assert.deepEqual(subscription.roles, ['subscriber']);
  assert.equal(subscription.metadata.months, 3);
  assert.equal(calls.events.find((row) => row.eventType === 'raid_received').metadata.viewerCount, 20);
  assert.equal(calls.closed[0].id, 'twitch:stream-1');
});

test('captures YouTube statistics, TikFinity outcomes, and OBS lifecycle fallback', () => {
  const { calls, telemetry } = harness();
  telemetry.handleStreamerBot({
    event: { source: 'YouTube', type: 'BroadcastStarted' },
    data: { broadcast: { id: 'yt-1', actualStartTime: '2026-09-01T18:00:00Z', title: 'Live' } },
  });
  telemetry.handleStreamerBot({
    event: { source: 'YouTube', type: 'StatisticsUpdated' },
    timeStamp: '2026-09-01T18:10:00Z',
    data: { statistics: { concurrentViewers: 12, viewCount: 100 } },
  });
  telemetry.handleTikfinity({ event: 'roomUser', data: { timestamp: 1788286800000, viewerCount: 30, totalViewers: 300 } });
  telemetry.handleTikfinity({ event: 'social', data: { timestamp: 1788286860000, action: 'follow', user: { userId: 'tt1', uniqueId: 'viewer' } } });
  telemetry.handleObsStreamState({ outputActive: false }, { snapshot: true });
  telemetry.handleObsStreamState({ outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
  telemetry.handleObsStreamState({ outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });

  assert.equal(calls.snapshots.find((row) => row.platform === 'youtube').viewerCount, 12);
  assert.equal(calls.snapshots.find((row) => row.platform === 'youtube').totalViewers, 100);
  assert.equal(calls.snapshots.find((row) => row.platform === 'tiktok').viewerCount, 30);
  const follow = calls.events.find((row) => row.platform === 'tiktok' && row.eventType === 'follow');
  assert.equal(follow.userId, 'tt1');
  assert.equal(follow.username, 'viewer');
  assert.ok(calls.opened.some((row) => row.platform === 'obs'));
  assert.ok(calls.closed.some((row) => row.platform === 'obs'));
});
