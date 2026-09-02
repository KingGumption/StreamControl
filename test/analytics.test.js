const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAnalyticsReport, parseCaptureFilename } = require('../src/analytics');

test('builds cross-tool roundups, drill-downs, audience overlap, and sessions', () => {
  const requests = [
    {
      id: 1, timestamp: '2026-09-01T18:00:00.000Z', platform: 'twitch', platform_user_id: '1',
      username: 'Alice', query: 'Song A', spotify_track_id: 'track-a', track_name: 'Song A', artists: 'Artist', status: 'accepted',
    },
    {
      id: 2, timestamp: '2026-09-01T18:05:00.000Z', platform: 'twitch', platform_user_id: '2',
      username: 'Bob', query: 'Missing', status: 'error', error_code: 'unreachable',
    },
  ];
  const events = [
    event('audience', 'chat_message', '18:00', 'Alice', '1'),
    event('audience', 'chat_message', '18:01', 'Bob', '2'),
    event('audience', 'chat_message', '18:02', 'Cara', '3'),
    event('song_requests', 'command', '18:03', 'Cara', '3', { command: 'song', status: 'closed' }),
    event('king_of_the_hill', 'game_started', '18:10', '', '', { rounds: 2 }, 'game-1'),
    event('king_of_the_hill', 'vote', '18:11', 'Alice', '1', { option: { title: 'Cats' }, topic: { id: 'animal', title: 'Best Animal' } }, 'game-1'),
    event('king_of_the_hill', 'vote', '18:12', 'Cara', '3', { option: { title: 'Dogs' }, topic: { id: 'animal', title: 'Best Animal' } }, 'game-1'),
    event('king_of_the_hill', 'vote', '18:13', 'Alice', '1', { option: { title: 'Cats' }, topic: { id: 'animal', title: 'Best Animal' } }, 'game-1'),
    event('king_of_the_hill', 'phase_completed', '18:14', '', '', { phase: 'battle', round: 1, totalVotes: 3, topic: { id: 'animal', title: 'Best Animal' }, winner: { title: 'Cats' }, options: [] }, 'game-1'),
    event('king_of_the_hill', 'game_completed', '18:15', '', '', { topic: { title: 'Best Animal' }, champion: { id: 'cat', title: 'Cats' } }, 'game-1'),
    event('polaroid', 'capture_failed', '18:20', 'Bob', '2', { error: 'OBS offline' }),
  ];
  const captures = [
    { timestamp: '2026-09-01T18:21:00.000Z', platform: 'twitch', userId: '1', username: 'Alice', filename: 'alice.jpg' },
    { timestamp: '2026-09-01T18:22:00.000Z', platform: 'twitch', username: 'Dom', filename: 'dom.jpg' },
  ];

  const report = buildAnalyticsReport({ requests, events, captures, range: '7d', now: new Date('2026-09-02T00:00:00.000Z') });

  assert.equal(report.overview.interactions, 8);
  assert.equal(report.overview.uniqueParticipants, 4);
  assert.equal(report.overview.inferredStreams, 1);
  assert.equal(report.tools.songRequests.total, 3);
  assert.equal(report.tools.songRequests.acceptanceRate, 33.3);
  assert.equal(report.tools.kingOfTheHill.votes, 3);
  assert.equal(report.tools.kingOfTheHill.gamesCompleted, 1);
  assert.equal(report.tools.polaroid.captures, 2);
  assert.equal(report.tools.polaroid.failures, 1);
  assert.equal(report.audience.observedChatters, 3);
  assert.equal(report.audience.engagementRate, 100);
  assert.equal(report.audience.multiToolViewers, 2);
  assert.equal(report.sessions[0].standout, '3 Hill votes');
  assert.equal(report.activity[0].eventType, 'capture_completed');
});

test('parses archived Polaroid filenames into analytics records', () => {
  assert.deepEqual(parseCaptureFilename('2026-08-31T23-09-53-561Z_KenoughTho.jpg'), {
    timestamp: '2026-08-31T23:09:53.561Z',
    username: 'KenoughTho',
    platform: 'other',
    filename: '2026-08-31T23-09-53-561Z_KenoughTho.jpg',
  });
});

test('builds measured stream impact, outcomes, roles, and OBS fallback viewer curves', () => {
  const events = [
    event('audience', 'chat_message', '18:01', 'Alice', '1', {}, '', ['subscriber'], 'obs:session'),
    event('king_of_the_hill', 'vote', '18:02', 'Alice', '1', { option: { title: 'Cats' } }, 'game-2', ['subscriber'], 'obs:session'),
    event('stream', 'follow', '18:03', 'Dana', '4', {}, '', [], 'obs:session'),
    event('stream', 'subscription', '18:04', 'Alice', '1', {}, '', ['subscriber'], 'obs:session'),
    event('stream', 'raid_received', '18:05', 'Raider', '5', { viewerCount: 20 }, '', [], 'obs:session'),
  ];
  const report = buildAnalyticsReport({
    events,
    streamSessions: [{ id: 'obs:session', platform: 'obs', started_at: '2026-09-01T18:00:00.000Z', ended_at: '2026-09-01T19:00:00.000Z' }],
    viewerSnapshots: [
      { timestamp: '2026-09-01T18:00:00.000Z', platform: 'twitch', session_id: 'obs:session', viewer_count: 10 },
      { timestamp: '2026-09-01T18:30:00.000Z', platform: 'twitch', session_id: 'obs:session', viewer_count: 20 },
      { timestamp: '2026-09-01T19:00:00.000Z', platform: 'twitch', session_id: 'obs:session', viewer_count: 15 },
    ],
    range: '7d',
    now: new Date('2026-09-02T00:00:00.000Z'),
  });

  assert.equal(report.overview.sessionSource, 'platform');
  assert.equal(report.sessions[0].topPlatform, 'twitch');
  assert.equal(report.sessions[0].peakViewers, 20);
  assert.equal(report.sessions[0].averageViewers, 15);
  assert.equal(report.sessions[0].viewerHours, 15);
  assert.equal(report.sessions[0].follows, 1);
  assert.equal(report.sessions[0].subscriptions, 1);
  assert.equal(report.sessions[0].raids, 1);
  assert.equal(report.impact.measuredStreams, 1);
  assert.equal(report.impact.raids, 1);
  assert.ok(report.audience.roleEngagement.some((role) => role.key === 'subscriber' && role.engaged === 1));
});

test('analytics page contains all tool drill-downs and valid inline JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-analytics.html'), 'utf8');
  assert.match(html, /Stream roundups/);
  assert.match(html, /Song Request Analytics/);
  assert.match(html, /King of the Hill Analytics/);
  assert.match(html, /Polaroid Analytics/);
  assert.match(html, /Audience Impact/);
  assert.match(html, /Granular Activity Ledger/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

function event(tool, eventType, time, username, userId, metadata = {}, correlationId = '', roles = [], sessionId = '') {
  return {
    timestamp: `2026-09-01T${time}:00.000Z`, tool, event_type: eventType, platform: 'twitch',
    username, platform_user_id: userId, metadata, correlation_id: correlationId, roles, session_id: sessionId,
  };
}
