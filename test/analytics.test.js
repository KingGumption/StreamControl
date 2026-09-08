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
  assert.equal(report.sessions[0].standout, '3 song interactions');
  assert.equal(report.activity[0].eventType, 'capture_completed');
});

test('parses archived Polaroid filenames into analytics records', () => {
  assert.deepEqual(parseCaptureFilename('2026-08-31T23-09-53-561Z_KenoughTho.jpg'), {
    timestamp: '2026-08-31T23:09:53.561Z',
    username: 'KenoughTho',
    platform: 'other',
    filename: '2026-08-31T23-09-53-561Z_KenoughTho.jpg',
  });
  assert.equal(parseCaptureFilename('test_2026-08-31T23-09-53-561Z_Test-Viewer.jpg'), null);
});

test('excludes current and previously recorded admin test Polaroids', () => {
  const oldTestFilename = '2026-09-01T18-20-00-000Z_Test-Viewer.jpg';
  const events = [
    { ...event('polaroid', 'redemption_queued', '18:19', 'Test Viewer', ''), platform: 'admin' },
    {
      ...event('polaroid', 'capture_completed', '18:20', 'Test Viewer', '', { filename: oldTestFilename }),
      platform: 'admin',
    },
    {
      ...event('polaroid', 'capture_failed', '18:21', 'Test Viewer', '', { isTest: true }),
      platform: 'api',
    },
  ];
  const captures = [
    { timestamp: '2026-09-01T18:20:00.000Z', filename: oldTestFilename, username: 'Test Viewer' },
    { timestamp: '2026-09-01T18:22:00.000Z', filename: 'test_2026-09-01T18-22-00-000Z_Test-Viewer.jpg', username: 'Test Viewer' },
    { timestamp: '2026-09-01T18:23:00.000Z', filename: 'live.jpg', platform: 'twitch', username: 'Live Viewer' },
  ];

  const report = buildAnalyticsReport({
    events,
    captures,
    range: '7d',
    now: new Date('2026-09-02T00:00:00.000Z'),
  });

  assert.equal(report.tools.polaroid.captures, 1);
  assert.equal(report.tools.polaroid.failures, 0);
  assert.equal(report.overview.interactions, 1);
  assert.equal(report.tools.polaroid.recent[0].username, 'Live Viewer');
  assert.equal(report.activity.some((item) => item.platform === 'admin'), false);
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
  assert.equal(report.sessions[0].viewerHours, null); // Half-hour sample gaps cannot establish watch time.
  assert.equal(report.sessions[0].follows, 1);
  assert.equal(report.sessions[0].subscriptions, 1);
  assert.equal(report.sessions[0].raids, 1);
  assert.equal(report.impact.measuredStreams, 1);
  assert.equal(report.impact.raids, 1);
  assert.ok(report.audience.roleEngagement.some((role) => role.key === 'subscriber' && role.engaged === 1));
});

test('analytics page contains all tool drill-downs and valid inline JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-analytics.html'), 'utf8');
  assert.match(html, /--bg:#101418/);
  assert.match(html, /--accent:#4ecdc4/);
  assert.match(html, /\.shell\{max-width:1200px/);
  assert.match(html, /<header class="topbar"><h1>StreamEngagement<\/h1>/);
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

test('quiz drilldown keeps shared game context while filtering player results', () => {
  const q=(type,name,id,metadata={},game='q1',platform='twitch')=>({...event('elimination_quiz',type,'18:00',name,id,metadata,game),platform});
  const events=[
    q('game_started','','',{players:2},'q1','admin'),
    q('player_joined','KingGumption','1'),q('player_joined','Other','2',{},'q1','youtube'),
    q('answer_submitted','KingGumption','1'),q('answer_result','KingGumption','1',{correct:true,missed:false,category:'horror',round:1}),
    q('answer_result','Other','2',{correct:false,missed:true,category:'horror',round:1},'q1','youtube'),
    q('round_completed','','',{round:1,suddenDeath:true},'q1','admin'),
    q('player_won','KingGumption','1',{correctAnswers:5}),q('game_completed','','',{outcome:'victory',players:2},'q1','admin'),
    q('player_joined','KingGumption','1',{},'q2'),q('game_started','','',{players:1},'q2','admin'),q('game_stopped','','',{},'q2','admin'),
    q('player_joined','Test','3',{isTest:true},'test'),
  ];
  const build=platform=>buildAnalyticsReport({events,platform,range:'7d',now:'2026-09-02T00:00:00Z'});
  const report=build('twitch'), quiz=report.tools.eliminationQuiz;
  assert.equal(quiz.gamesStarted,2);assert.equal(quiz.gamesCompleted,1);assert.equal(quiz.completionRate,50);
  assert.equal(quiz.gamesStopped,1);assert.equal(quiz.repeatPlayers,1);assert.equal(quiz.repeatPlayerRate,100);
  assert.equal(quiz.accuracy,100);assert.equal(quiz.missedAnswers,0);assert.equal(quiz.suddenDeathRounds,1);
  assert.equal(quiz.leaderboard[0].username,'KingGumption');assert.equal(quiz.leaderboard[0].bestRun,5);
  assert.equal(quiz.recentGames.find(g=>g.gameId==='q1').players,2);
  assert.equal(report.overview.interactions,3);assert.equal(report.platforms.reduce((n,p)=>n+p.count,0),3);
  assert.equal(report.timeline.reduce((n,p)=>n+p.total,0),3);
  assert.equal(report.audience.topParticipants[0].quizInteractions,3);
  assert.equal(report.sessions[0].quizInteractions,3);
  assert.equal(build('all').tools.eliminationQuiz.missedAnswers,1);
  assert.equal(build('youtube').tools.eliminationQuiz.accuracy,null);
  assert.equal(build('youtube').tools.eliminationQuiz.gamesCompleted,1);
  assert.equal(build('all').tools.eliminationQuiz.uniquePlayers,2);
});

test('zero baseline is new, lifecycle events do not inflate participants, and timeline retains year data',()=>{
  const events=Array.from({length:150},(_,i)=>({...event('elimination_quiz','player_joined','18:00','Viewer','1',{},'q'+i),timestamp:new Date(Date.UTC(2026,0,1+i)).toISOString()}));
  events.push({...event('stream','follow','18:00','Follower','2'),timestamp:'2026-05-31T18:00:00Z'});
  const r=buildAnalyticsReport({events,range:'365d',now:'2026-06-01T00:00:00Z'});
  assert.equal(r.timeline.filter(d=>d.total>0).length,150);assert.ok(r.timeline.length>=365);assert.equal(r.platforms[0].count,150);
  assert.equal(r.overview.comparisons.interactions.percentChange,null);
  assert.equal(r.sessions[0].uniqueParticipants,0);
  assert.equal(r.sessions[1].uniqueParticipants,1);
});

test('completion outside the starting cohort cannot exceed 100 percent',()=>{
  const events=[event('elimination_quiz','game_completed','18:00','','',{outcome:'defeat'},'old'),event('elimination_quiz','game_started','18:01','','',{players:1},'new')];
  const r=buildAnalyticsReport({events,now:'2026-09-02T00:00:00Z'});
  assert.equal(r.tools.eliminationQuiz.completionRate,0);assert.equal(r.tools.eliminationQuiz.defeats,1);
});

test('real quiz events reconcile joins, answers, final survivor victory and report totals',()=>{
  const {QuizGame}=require('../src/quiz-game');
  const events=[];
  const game=new QuizGame({recordEvent:e=>events.push({...e,timestamp:'2026-09-01T18:00:00Z'}),schedule:()=>null,cancel:()=>{},questions:[{id:'one',text:'One?',options:['A','B','C','D'],answer:0,difficulty:1,category:'general'}]});
  game.open({questionCount:1});
  const chat=(id,text)=>game.handleChatEvent({platform:'twitch',user:{id,displayName:id},text});
  chat('KingGumption','!join');chat('Other','!join');game.next();
  chat('KingGumption',String(game.deck[0].answer+1));game.resolve();game.next();
  chat('KingGumption',String((game.deck[1].answer+1)%4+1));game.resolve();
  const r=buildAnalyticsReport({events,now:'2026-09-02T00:00:00Z'}),q=r.tools.eliminationQuiz;
  assert.equal(q.victories,1);assert.equal(q.winners,1);assert.equal(q.defeats,0);
  assert.equal(q.joins,2);assert.equal(q.answers,2);assert.equal(q.correctAnswers,1);
  assert.equal(q.wrongAnswers,1);assert.equal(q.missedAnswers,1);assert.equal(q.eliminations,1);
  assert.equal(q.accuracy,50);assert.equal(q.responseRate,66.7);assert.equal(q.rounds,2);
  assert.equal(r.overview.interactions,4);assert.equal(r.timeline.find(d=>d.date==='2026-09-01').total,4);
});

test('platform reports retain OBS fallback sessions and clip duration to the reporting window',()=>{
  const r=buildAnalyticsReport({range:'7d',platform:'twitch',now:'2026-09-02T00:00:00Z',
    events:[event('king_of_the_hill','vote','18:00','Viewer','1')],
    streamSessions:[{id:'obs',platform:'obs',started_at:'2026-08-20T00:00:00Z',ended_at:'2026-09-01T19:00:00Z'}],
    viewerSnapshots:[{timestamp:'2026-09-01T18:00:00Z',platform:'twitch',viewer_count:10,session_id:'obs'}]});
  assert.equal(r.overview.sessionSource,'platform');assert.equal(r.sessions[0].startedAt,'2026-08-26T00:00:00.000Z');
  assert.equal(r.sessions[0].averageViewers,10);assert.equal(r.sessions[0].hillVotes,1);
});
