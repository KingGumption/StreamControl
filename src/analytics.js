const fs = require('node:fs');
const { summarizeQuiz } = require('./quiz-analytics');
const { buildRoundups } = require('./analytics-sessions');
const path = require('node:path');
const { appConfig } = require('./app-config');
const {
  listEngagementEventsForRange,
  listSongRequestsForRange,
  listStreamSessionsForRange,
  listViewerSnapshotsForRange,
} = require('./db');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
const STORED_SONG_STATUSES = new Set(['accepted', 'partial', 'dry-run', 'not-found', 'duplicate', 'error']);
const capturesDir = path.join(appConfig.dataDir, 'polaroid-captures');

function loadAnalyticsReport({ range = '30d', platform = 'all', activityPage = 0, activityTool = 'all', activitySearch = '', now = new Date() } = {}) {
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
    platform, activityPage, activityTool, activitySearch,
    now,
  });
}

function buildAnalyticsReport({ requests = [], events = [], captures = [], streamSessions = [], viewerSnapshots = [], range = '30d', platform = 'all', activityPage = 0, activityTool = 'all', activitySearch = '', now = new Date() } = {}) {
  const safeRange = RANGE_DAYS[range] ? range : range === 'all' ? 'all' : '30d';
  const safePlatform = ['all', 'twitch', 'youtube', 'tiktok', 'admin', 'api', 'obs', 'other'].includes(platform)
    ? platform
    : 'all';
  const nowMs = new Date(now).getTime();
  const days = RANGE_DAYS[safeRange] || null;
  const sinceMs = days ? nowMs - days * 86400000 : -Infinity;
  const previousSinceMs = days ? sinceMs - days * 86400000 : -Infinity;

  const testSessionIds=new Set(streamSessions.filter(s=>s.metadata?.isTest || s.metadata?.testMode).map(s=>s.id));
  const normalizedRequests = requests.map(normalizeRequest).filter((item) => item.timeMs <= nowMs && !testSessionIds.has(item.sessionId));
  const allNormalizedEvents = events.map(normalizeEvent).filter((item) => item.timeMs <= nowMs);
  const testCaptureFilenames = new Set(allNormalizedEvents
    .filter((event) => (isPolaroidTestEvent(event) || testSessionIds.has(event.sessionId)) && event.eventType === 'capture_completed')
    .map((event) => event.metadata.filename)
    .filter(Boolean));
  const normalizedEvents = allNormalizedEvents.filter((event) => !isPolaroidTestEvent(event) && event.metadata.isTest !== true && event.metadata.testMode !== true && !testSessionIds.has(event.sessionId));
  const normalizedCaptures = mergeCapturesWithEvents(captures, normalizedEvents, testCaptureFilenames)
    .filter((item) => item.timeMs <= nowMs);
  reconcileKnownNames([...normalizedRequests, ...normalizedEvents, ...normalizedCaptures]);
  const normalizedSessions = streamSessions.map(normalizeStreamSession).filter((item) => item.startMs <= nowMs && !item.metadata.isTest && !item.metadata.testMode);

  const normalizedSnapshots = viewerSnapshots.filter(s=>!testSessionIds.has(s.session_id || s.sessionId) && !s.metadata?.isTest && !s.metadata?.testMode && (s.viewer_count ?? s.viewerCount) !== null && (s.viewer_count ?? s.viewerCount) !== undefined && Number.isFinite(Number(s.viewer_count ?? s.viewerCount)) && Number(s.viewer_count ?? s.viewerCount)>=0).map(normalizeViewerSnapshot).filter((item) => item.timeMs <= nowMs);
  const platformMatches = (item) => safePlatform === 'all' || item.platform === safePlatform;
  const currentRequests = normalizedRequests.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentEvents = normalizedEvents.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentCaptures = normalizedCaptures.filter((item) => item.timeMs >= sinceMs && platformMatches(item));
  const currentSessions = normalizedSessions.filter((item) => (item.endMs || nowMs) >= sinceMs && (platformMatches(item) || (item.platform === 'obs' && ['twitch','youtube','tiktok'].includes(safePlatform))));
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

  const quizIds = new Set(currentEvents.filter(e=>e.tool==='elimination_quiz').map(e=>e.correlationId).filter(Boolean));
  const hillIds = new Set(currentEvents.filter(e=>e.tool==='king_of_the_hill').map(e=>e.correlationId).filter(Boolean));
  const hillContext = normalizedEvents.filter(e=>e.tool==='king_of_the_hill' && e.timeMs>=sinceMs && (safePlatform==='all' || hillIds.has(e.correlationId) || e.platform===safePlatform));
  const quizContext = normalizedEvents.filter(e=>e.tool==='elimination_quiz' && e.timeMs>=sinceMs && (safePlatform==='all' || quizIds.has(e.correlationId) || e.platform===safePlatform));
  const current = summarizePeriod(currentRequests, currentEvents, currentCaptures, quizContext, hillContext);
  const previous = summarizePeriod(previousRequests, previousEvents, previousCaptures);
  const sessions = buildRoundups({sessions:currentSessions,snapshots:currentSnapshots,activity:current.activity,observations:currentEvents.filter(e=>e.tool==='audience'),sinceMs,nowMs,isInteraction});
  const confirmedSessions=sessions.filter(s=>s.source==='platform').length;
  const timeline = buildTimeline(current.activity, currentEvents, sinceMs, nowMs);
  const ledgerSearch=String(activitySearch||'').slice(0,200).trim().toLowerCase();
  const ledgerTool=['all','elimination_quiz','song_requests','king_of_the_hill','polaroid','stream'].includes(activityTool)?activityTool:'all';
  const ledger=current.activity.filter(e=>(ledgerTool==='all'||e.tool===ledgerTool) && (!ledgerSearch||[e.username,e.platform,e.eventType,e.title,e.detail,e.status,e.correlationId].join(' ').toLowerCase().includes(ledgerSearch)));
  const pageSize=100, ledgerPages=Math.max(1,Math.ceil(ledger.length/pageSize));
  const ledgerPage=Math.max(0,Math.min(ledgerPages-1,Math.floor(Number(activityPage)||0)));
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
      note: 'Historic song requests and archived Polaroids are included. Recorded sessions and activity estimates are combined. Coverage dates below describe the records loaded for this report, not necessarily the first-ever use.',
    },
    overview: {
      interactions: current.interactions,
      uniqueParticipants: current.audience.engagedViewers,
      inferredStreams: sessions.length,
      sessionSource: confirmedSessions===sessions.length && confirmedSessions ? 'platform' : confirmedSessions ? 'mixed' : 'inferred',
      confirmedSessions, estimatedSessions:sessions.length-confirmedSessions,
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
      eliminationQuiz: current.quiz,
      polaroid: current.polaroid,
    },
    audience: current.audience,
    impact: buildImpactSummary(sessions, currentEvents, current.audience),
    platforms: breakdown(current.activity.filter(isInteraction), 'platform'),
    limits: { activity:pageSize, activityTotal:current.activity.length, sessions:null, quizGames:30, participants:25 },
    reconciliation: { interactions:current.interactions, timeline:timeline.reduce((n,d)=>n+d.total,0), roundups:sessions.reduce((n,s)=>n+s.interactions,0), platforms:current.activity.filter(isInteraction).length },
    timeline,
    sessions,
    activity: ledger.slice(ledgerPage*pageSize,(ledgerPage+1)*pageSize),
    activityPagination:{page:ledgerPage,pages:ledgerPages,total:ledger.length,pageSize,tool:ledgerTool,search:ledgerSearch},

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

function summarizePeriod(requests, events, captures, quizContext = events.filter(e=>e.tool==='elimination_quiz'), hillContext = events.filter(e=>e.tool==='king_of_the_hill')) {
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
  const quizEvents = events.filter(e => e.tool === 'elimination_quiz');
  const quizInteractions = quizEvents.filter(e => ['player_joined', 'answer_submitted'].includes(e.eventType));

  const hillEvents = events.filter((event) => event.tool === 'king_of_the_hill');
  const hillVotes = hillEvents.filter((event) => event.eventType === 'vote');
  const polaroidEvents = events.filter((event) => event.tool === 'polaroid');
  const streamEvents = events.filter((event) => event.tool === 'stream');
  const captureActivity = captures.map(polaroidCaptureActivity);
  const toolActivity = [...quizInteractions.map(genericEventActivity), ...songActivity, ...hillVotes.map(hillVoteActivity), ...captureActivity];
  const activity = [
    ...toolActivity,
    ...quizEvents.filter(e => !['player_joined', 'answer_submitted'].includes(e.eventType)).map(genericEventActivity),
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

  const phaseEvents = hillContext.filter((event) => event.eventType === 'phase_completed');
  const roundEvents = phaseEvents.filter((event) => event.metadata.phase === 'battle');
  const gameStarts = hillContext.filter((event) => event.eventType === 'game_started');
  const gameCompletes = hillContext.filter((event) => event.eventType === 'game_completed');
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
  addParticipants(participants, quizInteractions, 'elimination_quiz');
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
      quizInteractions: person.counts.elimination_quiz || 0,
      polaroids: person.counts.polaroid || 0,
      toolsUsed: person.tools.size,
      roles: [...person.roles],
    }));

  return {
    interactions: toolActivity.length,
    toolsActive: [songActivity.length, hillVotes.length, captures.length, quizInteractions.length].filter((value) => value > 0).length,
    activity,
    songRequests: {
      total: totalSongAttempts,
      interactions:songActivity.length,
      otherCommands:commandEvents.filter(e=>e.metadata.command!=='song').length,
      accepted,
      partial,
      dryRun,
      successful,
      rejected: Math.max(0, totalSongAttempts - successful),
      acceptanceRate: totalSongAttempts ? percent(successful, totalSongAttempts) : null,
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
    quiz: { ...summarizeQuiz(quizEvents, quizContext), platforms: breakdown(quizInteractions, 'platform') },
    hill: {
      gamesStarted: gameStarts.length,
      gamesCompleted: gameCompletes.length,
      completionRate: gameStarts.length ? percent(gameStarts.filter(start=>gameCompletes.some(end=>end.correlationId===start.correlationId)).length, gameStarts.length) : null,
      votes: hillVotes.length,
      uniqueVoters: hillPeople.size,
      repeatVoters: repeatPeople(hillVotes),
      topVoters: ranked(hillVotes, personKey, e=>({label:e.username,detail:e.platform})).slice(0,12),
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
      recentFailures: [...failures,...deliveryFailures].sort((a,b)=>b.timeMs-a.timeMs).slice(0,30).map(e=>({timestamp:e.timestamp,username:e.username,platform:e.platform,eventType:e.eventType,error:String(e.metadata.error || 'No error detail recorded')})),
      successRate: captures.length+failures.length ? percent(captures.length, captures.length + failures.length) : null,
      sources: breakdown(captures, 'platform'),
      topRedeemers: topRedeemers.slice(0, 12),
      recent: captures.slice().sort((a, b) => b.timeMs - a.timeMs).slice(0, 30).map((item) => ({
        timestamp: item.timestamp,
        username: item.username,
        platform: item.platform,
        imageUrl: item.imageUrl,
        imageAvailable: item.imageAvailable,
      })),
    },
    audience: {
      observedChatters: chatters.size,
      engagedObservedChatters:[...engaged].filter(key=>chatters.has(key)).length,
      engagedViewers: engaged.size,
      engagementRate: chatters.size ? percent([...engaged].filter((key) => chatters.has(key)).length, chatters.size) : null,
      multiToolViewers: multiTool,
      multiToolRate: percent(multiTool, engaged.size),
      singleToolViewers: Math.max(0, engaged.size - multiTool),
      toolReach: [
        { key: 'song_requests', label: 'Song Requests', count: distinctPeople(songActivity).size },
        { key: 'king_of_the_hill', label: 'King of the Hill', count: hillPeople.size },
        { key: 'elimination_quiz', label: 'Elimination Quiz', count: distinctPeople(quizInteractions).size },
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
    imageAvailable: row.imageAvailable !== false,
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
      imageAvailable: false,
    }));
  const seen=new Set();
  return [...files,...prunedCaptures].filter(c=>{if(!c.filename)return true;if(seen.has(c.filename))return false;seen.add(c.filename);return true;});
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
  return event.tool === 'polaroid' && (event.platform === 'admin' || event.metadata.isTest === true || event.metadata.testMode === true);
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
    detail: item.tool === 'elimination_quiz' ? [item.metadata.round ? `Round ${item.metadata.round}` : '', item.metadata.category || '', item.eventType==='answer_result' ? (item.metadata.correct ? 'Correct' : item.metadata.missed ? 'Missed' : 'Wrong') : '', item.metadata.outcome || '', item.metadata.correctAnswers !== undefined ? `${item.metadata.correctAnswers} correct answers` : ''].filter(Boolean).join(' ? ') : item.metadata.error || item.metadata.winner?.title || item.metadata.champion?.title || '',
    correlationId: item.correlationId,
  };
}

function isInteraction(item) {
  return ['song_requests','king_of_the_hill','polaroid','elimination_quiz'].includes(item.tool) && ['song_request','command','vote','capture_completed','player_joined','answer_submitted'].includes(item.eventType);
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
    peakViewerCount: Number(row.peak_viewer_count ?? row.viewer_count ?? row.viewerCount),
    sampleCount:Math.max(1,Number(row.sample_count)||1),
    totalViewers: Number(row.total_viewers ?? row.totalViewers) || null,
  };
}

function buildImpactSummary(sessions, events, audience) {
  const outcomes = countBy(events.filter((event) => event.tool === 'stream'), (event) => event.eventType);
  const measuredSessions = sessions.filter((session) => session.peakViewers !== null);
  return {
    measuredStreams: measuredSessions.length,
    peakViewers: measuredSessions.length ? Math.max(...measuredSessions.map((session) => session.peakViewers || 0)) : null,
    averageViewers: measuredSessions.length ? average(measuredSessions.map((session) => session.averageViewers || 0)) : null,
    estimatedViewerHours: measuredSessions.some(s=>s.viewerHours!==null) ? Math.round(measuredSessions.reduce((sum, session) => sum + (session.viewerHours || 0), 0) * 10) / 10 : null,
    averageRetention: measuredSessions.some((session) => session.retentionPercent !== null)
      ? average(measuredSessions.filter((session) => session.retentionPercent !== null).map((session) => session.retentionPercent))
      : null,
    follows: outcomes.follow || 0,
    subscriptions: outcomes.subscription || 0,
    raids: outcomes.raid_received || 0,
    shares: outcomes.share || 0,
    outcomeRate: audience.engagedViewers ? percent((outcomes.follow || 0) + (outcomes.subscription || 0), audience.engagedViewers) : 0,
    toolComparisons: ['songRequests', 'hillVotes', 'polaroids', 'quizInteractions'].map((property) => {
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

function buildTimeline(activity, events, sinceMs, nowMs) {
  const buckets = new Map();
  const chatByDay = new Map();
  events.filter((event) => event.tool === 'audience' && event.eventType === 'chat_message').forEach((event) => {
    const day = event.timestamp.slice(0, 10);
    if (!chatByDay.has(day)) chatByDay.set(day, new Set());
    const key = personKey(event);
    if (key) chatByDay.get(day).add(key);
  });
  activity.filter(isInteraction).forEach((item) => {
    const date = item.timestamp.slice(0, 10);
    if (!buckets.has(date)) buckets.set(date, { date, songRequests: 0, hillVotes: 0, polaroids: 0, quiz: 0, participants: new Set() });
    const bucket = buckets.get(date);
    if (item.tool === 'song_requests') bucket.songRequests += 1;
    if (item.eventType === 'vote') bucket.hillVotes += 1;
    if (item.tool === 'elimination_quiz' && ['player_joined','answer_submitted'].includes(item.eventType)) bucket.quiz += 1;
    if (item.eventType === 'capture_completed') bucket.polaroids += 1;
    const key = personKey(item);
    if (key) bucket.participants.add(key);
  });
  if(buckets.size){
    const start=Number.isFinite(sinceMs)?sinceMs:Date.parse([...buckets.keys()].sort()[0]);
    for(let ms=Math.floor(start/86400000)*86400000;ms<=nowMs;ms+=86400000){const date=new Date(ms).toISOString().slice(0,10);if(!buckets.has(date))buckets.set(date,{date,songRequests:0,hillVotes:0,polaroids:0,quiz:0,participants:new Set()});}
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).map((bucket) => ({
    date: bucket.date,
    songRequests: bucket.songRequests,
    hillVotes: bucket.hillVotes,
    polaroids: bucket.polaroids,
    quiz: bucket.quiz,
    total: bucket.songRequests + bucket.hillVotes + bucket.polaroids + bucket.quiz,
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
    if (item.username && (!person.lastSeen || item.timeMs >= person.lastSeen)) { person.username=item.username; person.lastSeen=item.timeMs; }
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
  for (const roles of observed.values()) if(roles.size>1) roles.delete('unclassified');
  for (const roles of observed.values()) roles.forEach((role) => roleNames.add(role));
  return [...roleNames].map((role) => {
    const observedKeys = [...observed].filter(([, roles]) => roles.has(role)).map(([key]) => key);
    const engaged = observedKeys.filter((key) => participants.has(key)).length;
    return { key: role, label: humanize(role), observed: observedKeys.length, engaged, engagementRate: observedKeys.length ? percent(engaged, observedKeys.length) : null };
  }).filter((item) => item.observed > 0 || item.engaged > 0).sort((a, b) => b.observed - a.observed || b.engaged - a.engaged);
}

function buildOverlap(participants) {
  const keys = ['song_requests', 'king_of_the_hill', 'polaroid', 'elimination_quiz'];
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

function reconcileKnownNames(items) {
  const ids=new Map();
  for(const i of items){if(!i.userId || !i.username)continue;const k=`${i.platform}:${i.username.toLowerCase()}`;if(!ids.has(k))ids.set(k,new Set());ids.get(k).add(String(i.userId));}
  for(const i of items){const matches=ids.get(`${i.platform}:${i.username.toLowerCase()}`);if(!i.userId && matches?.size===1)i.userId=[...matches][0];}
}

function personKey(item) {
  const userId = String(item?.userId || '').trim();
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
  if (!previous) return { current, previous, percentChange: current ? null : 0, direction: current ? 'up' : 'flat' };
  const percentChange = Math.round(((current - previous) / previous) * 1000) / 10;
  return { current, previous, percentChange, direction: percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'flat' };
}

function earliestTimestamp(items) {
  const times = items.map((item) => item.timeMs).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
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
