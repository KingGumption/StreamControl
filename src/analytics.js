const fs = require('node:fs');
const path = require('node:path');
const { appConfig } = require('./app-config');
const {
  listEngagementEventsForRange,
  listSongRequestsForRange,
  listStreamSessionsForRange,
  listViewerSnapshotsForRange,
} = require('./db');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
const SUCCESS_STATUSES = new Set(['accepted', 'partial', 'dry-run']);
const STORED_SONG_STATUSES = new Set(['accepted', 'partial', 'dry-run', 'not-found', 'duplicate', 'error']);
const capturesDir = path.join(appConfig.dataDir, 'polaroid-captures');

function loadAnalyticsReport({ range = '30d', platform = 'all', now = new Date() } = {}) {
  const safeRange = RANGE_DAYS[range] ? range : range === 'all' ? 'all' : '30d';
  const days = RANGE_DAYS[safeRange] || null;
  const nowMs = new Date(now).getTime();
  const loadSince = days ? new Date(nowMs - days * 2 * 86400000).toISOString() : null;
  return buildAnalyticsReport({
    requests: listSongRequestsForRange({ since: loadSince }),
    events: listEngagementEventsForRange({ since: loadSince }),
    streamSessions: listStreamSessionsForRange({ since: loadSince }),
    viewerSnapshots: listViewerSnapshotsForRange({ since: loadSince }),
    captures: listPolaroidCaptures(),
    range: safeRange,
    platform,
    now,
  });
}

function buildAnalyticsReport({ requests = [], events = [], captures = [], streamSessions = [], viewerSnapshots = [], range = '30d', platform = 'all', now = new Date() } = {}) {
  const safeRange = RANGE_DAYS[range] ? range : range === 'all' ? 'all' : '30d';
  const safePlatform = ['all', 'twitch', 'youtube', 'tiktok', 'admin', 'api', 'obs', 'other'].includes(platform)
    ? platform
    : 'all';
  const nowMs = new Date(now).getTime();
  const days = RANGE_DAYS[safeRange] || null;
  const sinceMs = days ? nowMs - days * 86400000 : -Infinity;
  const previousSinceMs = days ? sinceMs - days * 86400000 : -Infinity;

  const normalizedRequests = requests.map(normalizeRequest).filter((item) => item.timeMs <= nowMs);
  const allNormalizedEvents = events.map(normalizeEvent).filter((item) => item.timeMs <= nowMs);
  const testCaptureFilenames = new Set(allNormalizedEvents
    .filter((event) => isPolaroidTestEvent(event) && event.eventType === 'capture_completed')
    .map((event) => event.metadata.filename)
    .filter(Boolean));
  const normalizedEvents = allNormalizedEvents.filter((event) => !isPolaroidTestEvent(event));
  const normalizedCaptures = mergeCapturesWithEvents(captures, normalizedEvents, testCaptureFilenames)
    .filter((item) => item.timeMs <= nowMs);
  const normalizedSessions = streamSessions.map(normalizeStreamSession).filter((item) => item.startMs <= nowMs);
  const normalizedSnapshots = viewerSnapshots.map(normalizeViewerSnapshot).filter((item) => item.timeMs <= nowMs);
  const platformMatches = (item) => safePlatform === 'all' || item.platform === safePlatform;
  const currentRequests = normalizedRequests.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentEvents = normalizedEvents.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentCaptures = normalizedCaptures.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentSessions = normalizedSessions.filter((item) => (item.endMs || nowMs) >= sinceMs && platformMatches(item));
  const currentSnapshots = normalizedSnapshots.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const previousRequests = days
    ? normalizedRequests.filter((item) => item.timeMs >= previousSinceMs && item.timeMs < sinceMs && platformMatches(item))
    : [];
  const previousEvents = days
    ? normalizedEvents.filter((item) => item.timeMs >= previousSinceMs && item.timeMs < sinceMs && platformMatches(item))
    : [];
  const previousCaptures = days
    ? normalizedCaptures.filter((item) => item.timeMs >= previousSinceMs && item.timeMs < sinceMs && platformMatches(item))
    : [];

  const current = summarizePeriod(currentRequests, currentEvents, currentCaptures);
  const previous = summarizePeriod(previousRequests, previousEvents, previousCaptures);
  const sessions = currentSessions.length
    ? buildActualSessions(currentSessions, currentSnapshots, current.activity, nowMs)
    : inferSessions(current.activity);
  const timeline = buildTimeline(current.activity, currentEvents, safeRange);
  const coverageStart = earliestTimestamp([...normalizedRequests, ...normalizedEvents, ...normalizedCaptures]);

  return {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    filters: {
      range: safeRange,
      platform: safePlatform,
      since: Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : null,
    },
    coverage: {
      startsAt: coverageStart,
      songRequestsSince: earliestTimestamp(normalizedRequests),
      polaroidsSince: earliestTimestamp(normalizedCaptures),
      richEventsSince: earliestTimestamp(normalizedEvents),
      note: 'Historic song requests and archived Polaroids are included. Exact sessions, viewer levels, outcomes, roles, and cross-tool impact accumulate from the telemetry upgrade onward.',
    },
    overview: {
      interactions: current.interactions,
      uniqueParticipants: current.audience.engagedViewers,
      inferredStreams: sessions.length,
      sessionSource: currentSessions.length ? 'platform' : 'inferred',
      toolsActive: current.toolsActive,
      engagementRate: current.audience.engagementRate,
      comparisons: days ? {
        interactions: comparison(current.interactions, previous.interactions),
        uniqueParticipants: comparison(current.audience.engagedViewers, previous.audience.engagedViewers),
        songRequests: comparison(current.songRequests.total, previous.songRequests.total),
        hillVotes: comparison(current.hill.votes, previous.hill.votes),
        polaroids: comparison(current.polaroid.captures, previous.polaroid.captures),
      } : null,
    },
    tools: {
      songRequests: current.songRequests,
      kingOfTheHill: current.hill,
      polaroid: current.polaroid,
    },
    audience: current.audience,
    impact: buildImpactSummary(sessions, currentEvents, current.audience),
    platforms: breakdown(current.activity, 'platform'),
    timeline,
    sessions: sessions.slice(0, 30),
    activity: current.activity.slice(0, 250),

    // Preserve the original summary fields for existing callers.
    totalRequests: current.songRequests.total,
    acceptedRequests: current.songRequests.accepted,
    partialRequests: current.songRequests.partial,
    dryRunRequests: current.songRequests.dryRun,
    rejectedRequests: current.songRequests.rejected,
    statusBreakdown: Object.fromEntries(current.songRequests.statuses.map((item) => [item.key, item.count])),
    platformBreakdown: {
      twitch: 0,
      youtube: 0,
      tiktok: 0,
      ...Object.fromEntries(current.songRequests.platforms.map((item) => [item.key, item.count])),
    },
    recentRequests: current.songRequests.recent,
  };
}

function summarizePeriod(requests, events, captures) {
  const commandEvents = events.filter((event) => event.tool === 'song_requests' && event.eventType === 'command');
  const missingSongAttempts = commandEvents.filter((event) => {
    const command = event.metadata.command;
    const status = String(event.metadata.status || 'unknown').toLowerCase();
    return command === 'song' && !STORED_SONG_STATUSES.has(status);
  });
  const songActivity = [
    ...requests.map(songRequestActivity),
    ...missingSongAttempts.map(songCommandActivity),
    ...commandEvents.filter((event) => event.metadata.command !== 'song').map(songCommandActivity),
  ];
  const hillEvents = events.filter((event) => event.tool === 'king_of_the_hill');
  const hillVotes = hillEvents.filter((event) => event.eventType === 'vote');
  const polaroidEvents = events.filter((event) => event.tool === 'polaroid');
  const streamEvents = events.filter((event) => event.tool === 'stream');
  const captureActivity = captures.map(polaroidCaptureActivity);
  const toolActivity = [...songActivity, ...hillVotes.map(hillVoteActivity), ...captureActivity];
  const activity = [
    ...toolActivity,
    ...hillEvents.filter((event) => event.eventType !== 'vote').map(genericEventActivity),
    ...polaroidEvents.filter((event) => event.eventType !== 'capture_completed').map(genericEventActivity),
    ...streamEvents.map(genericEventActivity),
  ].sort((a, b) => b.timeMs - a.timeMs);
  const chatEvents = events.filter((event) => event.tool === 'audience' && event.eventType === 'chat_message');

  const songStatuses = countBy(requests, (item) => item.status);
  missingSongAttempts.forEach((event) => increment(songStatuses, event.metadata.status || 'unknown'));
  const totalSongAttempts = requests.length + missingSongAttempts.length;
  const accepted = Number(songStatuses.accepted || 0);
  const partial = Number(songStatuses.partial || 0);
  const dryRun = Number(songStatuses['dry-run'] || 0);
  const successful = accepted + partial + dryRun;
  const requestPeople = distinctPeople([...requests, ...missingSongAttempts]);
  const topTracks = ranked(requests.filter((item) => item.trackId || item.trackName), (item) => item.trackId || `${item.trackName}|${item.artists}`, (item) => ({
    label: item.trackName || item.query,
    detail: item.artists || '',
  }));

  const phaseEvents = hillEvents.filter((event) => event.eventType === 'phase_completed');
  const roundEvents = phaseEvents.filter((event) => event.metadata.phase === 'battle');
  const gameStarts = hillEvents.filter((event) => event.eventType === 'game_started');
  const gameCompletes = hillEvents.filter((event) => event.eventType === 'game_completed');
  const hillPeople = distinctPeople(hillVotes);
  const topTopics = ranked(
    phaseEvents.filter((event) => event.metadata.topic?.title),
    (event) => event.metadata.topic.id || event.metadata.topic.title,
    (event) => ({ label: event.metadata.topic.title }),
  );
  const champions = ranked(
    gameCompletes.filter((event) => event.metadata.champion?.title),
    (event) => event.metadata.champion.id || event.metadata.champion.title,
    (event) => ({ label: event.metadata.champion.title, detail: event.metadata.topic?.title || '' }),
  );

  const polaroidPeople = distinctPeople(captures);
  const failures = polaroidEvents.filter((event) => event.eventType === 'capture_failed');
  const deliveryFailures = polaroidEvents.filter((event) => event.eventType === 'delivery_failed');
  const topRedeemers = ranked(captures, (item) => personKey(item), (item) => ({ label: item.username || 'Unknown viewer' }));

  const participants = new Map();
  addParticipants(participants, songActivity, 'song_requests');
  addParticipants(participants, hillVotes, 'king_of_the_hill');
  addParticipants(participants, captures, 'polaroid');
  addParticipantRoles(participants, [...commandEvents, ...chatEvents]);
  const chatters = new Set(chatEvents.map(personKey).filter(Boolean));
  const engaged = new Set(participants.keys());
  const multiTool = [...participants.values()].filter((person) => person.tools.size > 1).length;
  const overlap = buildOverlap(participants);
  const topParticipants = [...participants.values()]
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
    .slice(0, 25)
    .map((person) => ({
      username: person.username,
      platform: person.platform,
      total: person.total,
      songRequests: person.counts.song_requests || 0,
      hillVotes: person.counts.king_of_the_hill || 0,
      polaroids: person.counts.polaroid || 0,
      toolsUsed: person.tools.size,
      roles: [...person.roles],
    }));

  return {
    interactions: toolActivity.length,
    toolsActive: [totalSongAttempts, hillVotes.length, captures.length].filter((value) => value > 0).length,
    activity,
    songRequests: {
      total: totalSongAttempts,
      accepted,
      partial,
      dryRun,
      successful,
      rejected: Math.max(0, totalSongAttempts - successful),
      acceptanceRate: percent(successful, totalSongAttempts),
      uniqueRequesters: requestPeople.size,
      repeatRequesters: repeatPeople([...requests, ...missingSongAttempts]),
      commands: commandEvents.length,
      statuses: breakdownFromMap(songStatuses),
      platforms: breakdown([...requests, ...missingSongAttempts], 'platform'),
      errors: breakdown(requests.filter((item) => item.errorCode), 'errorCode'),
      topTracks: topTracks.slice(0, 12),
      topRequesters: ranked([...requests, ...missingSongAttempts], personKey, (item) => ({ label: item.username || 'Unknown viewer', detail: item.platform })).slice(0, 12),
      recent: requests.slice().sort((a, b) => b.timeMs - a.timeMs).slice(0, 30).map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        platform: item.platform,
        username: item.username,
        status: item.status,
        trackName: item.trackName || item.query,
        artists: item.artists,
        response: item.response,
      })),
    },
    hill: {
      gamesStarted: gameStarts.length,
      gamesCompleted: gameCompletes.length,
      completionRate: percent(gameCompletes.length, gameStarts.length),
      votes: hillVotes.length,
      uniqueVoters: hillPeople.size,
      roundsCompleted: roundEvents.length,
      averageVotesPerRound: average(roundEvents.map((event) => Number(event.metadata.totalVotes) || 0)),
      averageVotesPerGame: average(groupCounts(hillVotes, (event) => event.correlationId).values()),
      platforms: breakdown(hillVotes, 'platform'),
      topTopics: topTopics.slice(0, 12),
      champions: champions.slice(0, 12),
      rounds: roundEvents.slice().sort((a, b) => b.timeMs - a.timeMs).slice(0, 40).map((event) => ({
        timestamp: event.timestamp,
        gameId: event.correlationId,
        round: event.metadata.round,
        topic: event.metadata.topic?.title || '',
        winner: event.metadata.winner?.title || '',
        totalVotes: event.metadata.totalVotes || 0,
        options: event.metadata.options || [],
      })),
    },
    polaroid: {
      captures: captures.length,
      uniqueRedeemers: polaroidPeople.size,
      repeatRedeemers: repeatPeople(captures),
      failures: failures.length,
      deliveryFailures: deliveryFailures.length,
      successRate: percent(captures.length, captures.length + failures.length),
      sources: breakdown(captures, 'platform'),
      topRedeemers: topRedeemers.slice(0, 12),
      recent: captures.slice().sort((a, b) => b.timeMs - a.timeMs).slice(0, 30).map((item) => ({
        timestamp: item.timestamp,
        username: item.username,
        platform: item.platform,
        imageUrl: item.imageUrl,
      })),
    },
    audience: {
      observedChatters: chatters.size,
      engagedViewers: engaged.size,
      engagementRate: chatters.size ? percent([...engaged].filter((key) => chatters.has(key)).length, chatters.size) : null,
      multiToolViewers: multiTool,
      multiToolRate: percent(multiTool, engaged.size),
      singleToolViewers: Math.max(0, engaged.size - multiTool),
      toolReach: [
        { key: 'song_requests', label: 'Song Requests', count: distinctPeople(songActivity).size },
        { key: 'king_of_the_hill', label: 'King of the Hill', count: hillPeople.size },
        { key: 'polaroid', label: 'Polaroid', count: polaroidPeople.size },
      ],
      overlap,
      topParticipants,
      roleSegments: buildRoleSegments(participants),
      roleEngagement: buildRoleEngagement(chatEvents, participants),
    },
  };
}

function normalizeRequest(row) {
  return {
    id: row.id,
    timestamp: toIso(row.timestamp),
    timeMs: toTime(row.timestamp),
    platform: normalizePlatform(row.platform),
    userId: row.platform_user_id || row.userId || '',
    username: row.username || '',
    query: row.query || '',
    trackId: row.spotify_track_id || row.trackId || '',
    trackName: row.track_name || row.trackName || '',
    artists: row.artists || '',
    status: String(row.status || 'unknown').toLowerCase(),
    response: row.response || '',
    errorCode: row.error_code || row.errorCode || '',
    roles: parseRoles(row.roles),
    sessionId: row.session_id || row.sessionId || '',
  };
}

function normalizeEvent(row) {
  return {
    id: row.id,
    timestamp: toIso(row.timestamp),
    timeMs: toTime(row.timestamp),
    tool: String(row.tool || '').toLowerCase(),
    eventType: String(row.event_type || row.eventType || '').toLowerCase(),
    platform: normalizePlatform(row.platform),
    userId: row.platform_user_id || row.userId || '',
    username: row.username || '',
    correlationId: row.correlation_id || row.correlationId || '',
    sessionId: row.session_id || row.sessionId || '',
    roles: Array.isArray(row.roles) ? row.roles.map((role) => String(role).toLowerCase()) : [],
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

function normalizeCapture(row) {
  return {
    timestamp: toIso(row.timestamp),
    timeMs: toTime(row.timestamp),
    platform: normalizePlatform(row.platform || row.source || 'other'),
    userId: row.userId || '',
    username: row.username || row.redeemerName || 'Unknown viewer',
    roles: Array.isArray(row.roles) ? row.roles : [],
    sessionId: row.sessionId || row.session_id || '',
    filename: row.filename || '',
    imageUrl: row.imageUrl || (row.filename ? `/polaroid/captures/${encodeURIComponent(row.filename)}` : ''),
  };
}

function mergeCapturesWithEvents(captures, events, excludedFilenames = new Set()) {
  const completionEvents = events.filter((event) => event.tool === 'polaroid' && event.eventType === 'capture_completed');
  const completionsByFilename = new Map(completionEvents
    .filter((event) => event.metadata.filename)
    .map((event) => [event.metadata.filename, event]));
  const files = captures.map(normalizeCapture)
    .filter((capture) => !excludedFilenames.has(capture.filename) && !isTestCaptureFilename(capture.filename))
    .map((capture) => {
      const event = completionsByFilename.get(capture.filename);
      return event ? {
        ...capture,
        platform: event.platform,
        userId: event.userId || capture.userId,
        username: event.username || capture.username,
        roles: event.roles.length ? event.roles : capture.roles,
        sessionId: event.sessionId || capture.sessionId,
      } : capture;
    });
  const filenames = new Set(files.map((capture) => capture.filename).filter(Boolean));
  const prunedCaptures = completionEvents
    .filter((event) => !event.metadata.filename || !filenames.has(event.metadata.filename))
    .map((event) => normalizeCapture({
      timestamp: event.timestamp,
      platform: event.platform,
      userId: event.userId,
      username: event.username,
      roles: event.roles,
      sessionId: event.sessionId,
      filename: event.metadata.filename,
      imageUrl: event.metadata.imageUrl,
    }));
  return [...files, ...prunedCaptures];
}

function listPolaroidCaptures() {
  try {
    return fs.readdirSync(capturesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
      .map((entry) => parseCaptureFilename(entry.name))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseCaptureFilename(filename) {
  if (isTestCaptureFilename(filename)) return null;
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_(.+)\.jpe?g$/i);
  if (!match) return null;
  return {
    timestamp: `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`,
    username: match[6].replaceAll('-', ' '),
    platform: 'other',
    filename,
  };
}

function isPolaroidTestEvent(event) {
  return event.tool === 'polaroid' && (event.platform === 'admin' || event.metadata.isTest === true);
}

function isTestCaptureFilename(filename) {
  return /^test_/i.test(String(filename || ''));
}

function songRequestActivity(item) {
  return {
    timestamp: item.timestamp, timeMs: item.timeMs, tool: 'song_requests', eventType: 'song_request',
    platform: item.platform, userId: item.userId, username: item.username,
    roles: item.roles || [], sessionId: item.sessionId || '',
    status: item.status, title: item.trackName || item.query, detail: item.artists || item.response,
  };
}

function songCommandActivity(item) {
  return {
    timestamp: item.timestamp, timeMs: item.timeMs, tool: 'song_requests', eventType: 'command',
    platform: item.platform, userId: item.userId, username: item.username,
    roles: item.roles || [], sessionId: item.sessionId || '',
    status: item.metadata.status || 'used', title: `!${item.metadata.command || 'command'}`, detail: item.metadata.response || '',
  };
}

function hillVoteActivity(item) {
  return {
    timestamp: item.timestamp, timeMs: item.timeMs, tool: 'king_of_the_hill', eventType: 'vote',
    platform: item.platform, userId: item.userId, username: item.username,
    roles: item.roles || [], sessionId: item.sessionId || '',
    status: 'counted', title: item.metadata.option?.title || 'Vote',
    detail: item.metadata.topic?.title || (item.metadata.phase === 'topic' ? 'Topic vote' : `Round ${item.metadata.round || ''}`),
    correlationId: item.correlationId,
  };
}

function polaroidCaptureActivity(item) {
  return {
    timestamp: item.timestamp, timeMs: item.timeMs, tool: 'polaroid', eventType: 'capture_completed',
    platform: item.platform, userId: item.userId, username: item.username,
    roles: item.roles || [], sessionId: item.sessionId || '',
    status: 'completed', title: 'Polaroid captured', detail: item.filename || '', imageUrl: item.imageUrl,
  };
}

function genericEventActivity(item) {
  const labels = {
    game_started: 'Game started', game_completed: 'Game completed', game_stopped: 'Game stopped',
    phase_completed: item.metadata.phase === 'battle' ? `Round ${item.metadata.round || ''} completed` : 'Topic vote completed',
    capture_failed: 'Polaroid capture failed', delivery_failed: 'Polaroid delivery failed', redemption_queued: 'Polaroid queued',
    stream_started: 'Stream started', stream_stopped: 'Stream ended', stream_updated: 'Stream details updated',
    follow: 'New follower', subscription: 'New subscription', raid_received: 'Raid received', share: 'Stream shared',
  };
  return {
    timestamp: item.timestamp, timeMs: item.timeMs, tool: item.tool, eventType: item.eventType,
    platform: item.platform, userId: item.userId, username: item.username,
    roles: item.roles || [], sessionId: item.sessionId || '',
    status: item.eventType.includes('failed') ? 'error' : 'info', title: labels[item.eventType] || humanize(item.eventType),
    detail: item.metadata.error || item.metadata.winner?.title || item.metadata.champion?.title || '',
    correlationId: item.correlationId,
  };
}

function inferSessions(activity) {
  const chronological = activity.slice().sort((a, b) => a.timeMs - b.timeMs);
  const sessions = [];
  for (const item of chronological) {
    let session = sessions.at(-1);
    if (!session || item.timeMs - session.lastMs > 4 * 60 * 60 * 1000) {
      session = { startMs: item.timeMs, lastMs: item.timeMs, activity: [] };
      sessions.push(session);
    }
    session.lastMs = item.timeMs;
    session.activity.push(item);
  }
  return sessions.reverse().map((session, index) => {
    const people = distinctPeople(session.activity);
    const toolCounts = countBy(session.activity, (item) => item.tool);
    const platforms = breakdown(session.activity, 'platform');
    return {
      id: `${new Date(session.startMs).toISOString()}-${index}`,
      startedAt: new Date(session.startMs).toISOString(),
      endedAt: new Date(session.lastMs).toISOString(),
      durationMinutes: Math.max(1, Math.round((session.lastMs - session.startMs) / 60000)),
      interactions: session.activity.filter((item) => ['song_request', 'vote', 'capture_completed'].includes(item.eventType)).length,
      uniqueParticipants: people.size,
      songRequests: toolCounts.song_requests || 0,
      hillVotes: session.activity.filter((item) => item.eventType === 'vote').length,
      polaroids: session.activity.filter((item) => item.eventType === 'capture_completed').length,
      topPlatform: platforms[0]?.key || 'other',
      standout: sessionStandout(session.activity),
      source: 'inferred',
      platforms: platforms.map((item) => item.key),
      peakViewers: null,
      averageViewers: null,
      viewerHours: null,
    };
  });
}

function normalizeStreamSession(row) {
  return {
    id: String(row.id || ''),
    platform: normalizePlatform(row.platform),
    externalId: row.external_id || row.externalId || '',
    startedAt: toIso(row.started_at || row.startedAt),
    endedAt: toIso(row.ended_at || row.endedAt),
    startMs: toTime(row.started_at || row.startedAt),
    endMs: row.ended_at || row.endedAt ? toTime(row.ended_at || row.endedAt) : null,
    title: row.title || '',
    category: row.category || '',
    source: row.source || '',
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

function normalizeViewerSnapshot(row) {
  return {
    timestamp: toIso(row.timestamp),
    timeMs: toTime(row.timestamp),
    platform: normalizePlatform(row.platform),
    sessionId: row.session_id || row.sessionId || '',
    viewerCount: Math.max(0, Number(row.viewer_count ?? row.viewerCount) || 0),
    totalViewers: Number(row.total_viewers ?? row.totalViewers) || null,
  };
}

function buildActualSessions(sessions, snapshots, activity, nowMs) {
  const groups = [];
  sessions.slice().sort((a, b) => a.startMs - b.startMs).forEach((session) => {
    const endMs = session.endMs || nowMs;
    const group = groups.find((candidate) => session.startMs <= candidate.endMs + 15 * 60000 && endMs >= candidate.startMs - 15 * 60000);
    if (group) {
      group.sessions.push(session);
      group.startMs = Math.min(group.startMs, session.startMs);
      group.endMs = Math.max(group.endMs, endMs);
    } else {
      groups.push({ sessions: [session], startMs: session.startMs, endMs });
    }
  });
  return groups.sort((a, b) => b.startMs - a.startMs).map((group) => {
    const ids = new Set(group.sessions.map((session) => session.id));
    const platforms = [...new Set(group.sessions.map((session) => session.platform).filter((platform) => platform !== 'obs'))];
    const relevantActivity = activity.filter((item) =>
      (item.sessionId && ids.has(item.sessionId))
      || (item.timeMs >= group.startMs && item.timeMs <= group.endMs && (!platforms.length || platforms.includes(item.platform) || item.platform === 'other'))
    );
    const relevantSnapshots = snapshots.filter((snapshot) =>
      (snapshot.sessionId && ids.has(snapshot.sessionId))
      || (snapshot.timeMs >= group.startMs && snapshot.timeMs <= group.endMs && (!platforms.length || platforms.includes(snapshot.platform)))
    );
    const measuredPlatforms = [...new Set(relevantSnapshots.map((snapshot) => snapshot.platform))];
    const displayPlatforms = [...new Set([...platforms, ...measuredPlatforms])];
    if (!displayPlatforms.length) displayPlatforms.push('obs');
    const platformViewerStats = measuredPlatforms.map((platform) => {
      const ordered = relevantSnapshots.filter((snapshot) => snapshot.platform === platform).sort((a, b) => a.timeMs - b.timeMs);
      const values = ordered.map((snapshot) => snapshot.viewerCount);
      return { platform, peak: values.length ? Math.max(...values) : 0, average: average(values), end: values.at(-1) || 0, samples: values.length };
    });
    const durationHours = Math.max(0, group.endMs - group.startMs) / 3600000;
    const peakViewers = platformViewerStats.reduce((sum, item) => sum + item.peak, 0);
    const averageViewers = Math.round(platformViewerStats.reduce((sum, item) => sum + item.average, 0) * 10) / 10;
    const endingViewers = platformViewerStats.reduce((sum, item) => sum + item.end, 0);
    const toolCounts = countBy(relevantActivity, (item) => item.tool);
    const people = distinctPeople(relevantActivity);
    return {
      id: group.sessions.map((session) => session.id).join('|'),
      startedAt: new Date(group.startMs).toISOString(),
      endedAt: new Date(group.endMs).toISOString(),
      durationMinutes: Math.max(1, Math.round((group.endMs - group.startMs) / 60000)),
      interactions: relevantActivity.filter((item) => ['song_request', 'vote', 'capture_completed'].includes(item.eventType)).length,
      uniqueParticipants: people.size,
      songRequests: relevantActivity.filter((item) => item.eventType === 'song_request').length,
      hillVotes: relevantActivity.filter((item) => item.eventType === 'vote').length,
      polaroids: relevantActivity.filter((item) => item.eventType === 'capture_completed').length,
      topPlatform: displayPlatforms[0],
      platforms: displayPlatforms,
      standout: sessionStandout(relevantActivity),
      source: 'platform',
      title: group.sessions.find((session) => session.title)?.title || '',
      category: group.sessions.find((session) => session.category)?.category || '',
      peakViewers: relevantSnapshots.length ? peakViewers : null,
      averageViewers: relevantSnapshots.length ? averageViewers : null,
      viewerHours: relevantSnapshots.length ? Math.round(averageViewers * durationHours * 10) / 10 : null,
      retentionPercent: relevantSnapshots.length && peakViewers ? percent(endingViewers, peakViewers) : null,
      viewerSamples: relevantSnapshots.length,
      follows: relevantActivity.filter((item) => item.eventType === 'follow').length,
      subscriptions: relevantActivity.filter((item) => item.eventType === 'subscription').length,
      raids: relevantActivity.filter((item) => item.eventType === 'raid_received').length,
      shares: relevantActivity.filter((item) => item.eventType === 'share').length,
      toolCounts,
    };
  });
}

function buildImpactSummary(sessions, events, audience) {
  const outcomes = countBy(events.filter((event) => event.tool === 'stream'), (event) => event.eventType);
  const measuredSessions = sessions.filter((session) => session.peakViewers !== null);
  return {
    measuredStreams: measuredSessions.length,
    peakViewers: measuredSessions.length ? Math.max(...measuredSessions.map((session) => session.peakViewers || 0)) : null,
    averageViewers: measuredSessions.length ? average(measuredSessions.map((session) => session.averageViewers || 0)) : null,
    estimatedViewerHours: measuredSessions.length ? Math.round(measuredSessions.reduce((sum, session) => sum + (session.viewerHours || 0), 0) * 10) / 10 : null,
    averageRetention: measuredSessions.some((session) => session.retentionPercent !== null)
      ? average(measuredSessions.filter((session) => session.retentionPercent !== null).map((session) => session.retentionPercent))
      : null,
    follows: outcomes.follow || 0,
    subscriptions: outcomes.subscription || 0,
    raids: outcomes.raid_received || 0,
    shares: outcomes.share || 0,
    outcomeRate: audience.engagedViewers ? percent((outcomes.follow || 0) + (outcomes.subscription || 0), audience.engagedViewers) : 0,
    toolComparisons: ['songRequests', 'hillVotes', 'polaroids'].map((property) => {
      const withTool = measuredSessions.filter((session) => session[property] > 0);
      const withoutTool = measuredSessions.filter((session) => session[property] === 0);
      const withAverage = average(withTool.map((session) => session.averageViewers || 0));
      const withoutAverage = average(withoutTool.map((session) => session.averageViewers || 0));
      return {
        tool: property,
        sessionsWithTool: withTool.length,
        sessionsWithoutTool: withoutTool.length,
        averageViewersWithTool: withTool.length ? withAverage : null,
        averageViewersWithoutTool: withoutTool.length ? withoutAverage : null,
        viewerLiftPercent: withTool.length && withoutTool.length && withoutAverage ? Math.round(((withAverage - withoutAverage) / withoutAverage) * 1000) / 10 : null,
      };
    }),
  };
}

function buildTimeline(activity, events, range) {
  const buckets = new Map();
  const chatByDay = new Map();
  events.filter((event) => event.tool === 'audience' && event.eventType === 'chat_message').forEach((event) => {
    const day = event.timestamp.slice(0, 10);
    if (!chatByDay.has(day)) chatByDay.set(day, new Set());
    const key = personKey(event);
    if (key) chatByDay.get(day).add(key);
  });
  activity.forEach((item) => {
    const date = item.timestamp.slice(0, 10);
    if (!buckets.has(date)) buckets.set(date, { date, songRequests: 0, hillVotes: 0, polaroids: 0, participants: new Set() });
    const bucket = buckets.get(date);
    if (item.eventType === 'song_request') bucket.songRequests += 1;
    if (item.eventType === 'vote') bucket.hillVotes += 1;
    if (item.eventType === 'capture_completed') bucket.polaroids += 1;
    const key = personKey(item);
    if (key) bucket.participants.add(key);
  });
  const limit = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 120;
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit).map((bucket) => ({
    date: bucket.date,
    songRequests: bucket.songRequests,
    hillVotes: bucket.hillVotes,
    polaroids: bucket.polaroids,
    total: bucket.songRequests + bucket.hillVotes + bucket.polaroids,
    uniqueParticipants: bucket.participants.size,
    observedChatters: chatByDay.get(bucket.date)?.size || 0,
  }));
}

function addParticipants(map, items, tool) {
  items.forEach((item) => {
    const key = personKey(item);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { username: item.username || 'Unknown viewer', platform: item.platform || 'other', tools: new Set(), roles: new Set(), counts: {}, total: 0 });
    }
    const person = map.get(key);
    person.tools.add(tool);
    person.counts[tool] = (person.counts[tool] || 0) + 1;
    person.total += 1;
    for (const role of item.roles || []) person.roles.add(role);
  });
}

function buildRoleSegments(participants) {
  const counts = {};
  for (const person of participants.values()) {
    const roles = person.roles.size ? [...person.roles] : ['unclassified'];
    for (const role of roles) increment(counts, role);
  }
  return breakdownFromMap(counts);
}

function addParticipantRoles(participants, items) {
  items.forEach((item) => {
    const person = participants.get(personKey(item));
    if (!person) return;
    for (const role of item.roles || []) person.roles.add(role);
  });
}

function buildRoleEngagement(chatEvents, participants) {
  const observed = new Map();
  chatEvents.forEach((event) => {
    const key = personKey(event);
    if (!key) return;
    if (!observed.has(key)) observed.set(key, new Set());
    const roles = event.roles?.length ? event.roles : ['unclassified'];
    roles.forEach((role) => observed.get(key).add(role));
  });
  const roleNames = new Set(['broadcaster', 'moderator', 'vip', 'subscriber', 'member', 'fan-club', 'follower', 'viewer', 'unclassified']);
  for (const roles of observed.values()) roles.forEach((role) => roleNames.add(role));
  return [...roleNames].map((role) => {
    const observedKeys = [...observed].filter(([, roles]) => roles.has(role)).map(([key]) => key);
    const engaged = observedKeys.filter((key) => participants.has(key)).length;
    return { key: role, label: humanize(role), observed: observedKeys.length, engaged, engagementRate: observedKeys.length ? percent(engaged, observedKeys.length) : null };
  }).filter((item) => item.observed > 0 || item.engaged > 0).sort((a, b) => b.observed - a.observed || b.engaged - a.engaged);
}

function buildOverlap(participants) {
  const keys = ['song_requests', 'king_of_the_hill', 'polaroid'];
  const result = [];
  for (let left = 0; left < keys.length; left += 1) {
    for (let right = left + 1; right < keys.length; right += 1) {
      result.push({
        tools: [keys[left], keys[right]],
        count: [...participants.values()].filter((person) => person.tools.has(keys[left]) && person.tools.has(keys[right])).length,
      });
    }
  }
  result.push({ tools: keys, count: [...participants.values()].filter((person) => keys.every((key) => person.tools.has(key))).length });
  return result;
}

function personKey(item) {
  const userId = String(item?.userId || '').trim().toLowerCase();
  if (userId) return `${item.platform || 'other'}:id:${userId}`;
  const username = String(item?.username || '').trim().toLowerCase();
  return username ? `${item.platform || 'other'}:name:${username}` : '';
}

function distinctPeople(items) {
  return new Set(items.map(personKey).filter(Boolean));
}

function repeatPeople(items) {
  return [...groupCounts(items, personKey).values()].filter((count) => count > 1).length;
}

function groupCounts(items, selector) {
  const counts = new Map();
  items.forEach((item) => {
    const key = selector(item);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function countBy(items, selector) {
  const result = {};
  items.forEach((item) => increment(result, selector(item) || 'unknown'));
  return result;
}

function increment(object, key) {
  const safeKey = String(key || 'unknown').toLowerCase();
  object[safeKey] = (object[safeKey] || 0) + 1;
}

function breakdown(items, property) {
  return breakdownFromMap(countBy(items, (item) => item[property] || 'other'));
}

function breakdownFromMap(counts) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, label: humanize(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function ranked(items, keySelector, valueSelector) {
  const values = new Map();
  items.forEach((item) => {
    const key = keySelector(item);
    if (!key) return;
    if (!values.has(key)) values.set(key, { ...valueSelector(item), count: 0 });
    values.get(key).count += 1;
  });
  return [...values.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function average(values) {
  const numbers = [...values].map(Number).filter(Number.isFinite);
  return numbers.length ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10 : 0;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function comparison(current, previous) {
  if (!previous) return { current, previous, percentChange: current ? 100 : 0, direction: current ? 'up' : 'flat' };
  const percentChange = Math.round(((current - previous) / previous) * 1000) / 10;
  return { current, previous, percentChange, direction: percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'flat' };
}

function earliestTimestamp(items) {
  const times = items.map((item) => item.timeMs).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function sessionStandout(activity) {
  const songs = activity.filter((item) => item.eventType === 'song_request').length;
  const votes = activity.filter((item) => item.eventType === 'vote').length;
  const polaroids = activity.filter((item) => item.eventType === 'capture_completed').length;
  const values = [
    { label: `${songs} song request${songs === 1 ? '' : 's'}`, count: songs },
    { label: `${votes} Hill vote${votes === 1 ? '' : 's'}`, count: votes },
    { label: `${polaroids} Polaroid${polaroids === 1 ? '' : 's'}`, count: polaroids },
  ].sort((a, b) => b.count - a.count);
  return values[0].count ? values[0].label : 'No tool interactions';
}

function normalizePlatform(value) {
  const platform = String(value || 'other').trim().toLowerCase();
  return ['twitch', 'youtube', 'tiktok', 'admin', 'api', 'obs'].includes(platform) ? platform : 'other';
}

function parseRoles(value) {
  if (Array.isArray(value)) return value.map((role) => String(role).toLowerCase());
  try {
    const roles = JSON.parse(value || '[]');
    return Array.isArray(roles) ? roles.map((role) => String(role).toLowerCase()) : [];
  } catch {
    return [];
  }
}

function toTime(value) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : NaN;
}

function toIso(value) {
  if (!value) return '';
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function humanize(value) {
  return String(value || 'unknown').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

module.exports = {
  buildAnalyticsReport,
  listPolaroidCaptures,
  loadAnalyticsReport,
  parseCaptureFilename,
};
