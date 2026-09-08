const test=require('node:test');
const assert=require('node:assert/strict');
const {buildAnalyticsReport}=require('../src/analytics');
const now='2026-09-08T12:00:00Z';
const ev=(day,type='vote',extra={})=>({timestamp:`2026-09-${day}T18:00:00Z`,tool:'king_of_the_hill',eventType:type,platform:'twitch',userId:'1',username:'KingGumption',metadata:{},...extra});
const session=(day,extra={})=>({id:'s'+day,platform:'twitch',started_at:`2026-09-${day}T17:00:00Z`,ended_at:`2026-09-${day}T20:00:00Z`,...extra});
const report=x=>buildAnalyticsReport({now,...x});
const balanced=r=>{assert.equal(r.reconciliation.timeline,r.overview.interactions);assert.equal(r.reconciliation.roundups,r.overview.interactions);assert.equal(r.reconciliation.platforms,r.overview.interactions);};

test('7 September activity remains in roundups when 6 September has a recorded session',()=>{
  const r=report({events:[ev('06'),ev('07')],streamSessions:[session('06')]});
  assert.equal(r.sessions.length,2);assert.equal(r.overview.sessionSource,'mixed');
  assert.equal(r.sessions[0].startedAt.slice(0,10),'2026-09-07');assert.equal(r.sessions[0].source,'inferred');
  assert.equal(r.sessions[1].source,'platform');balanced(r);
});

test('missing end plus stale session IDs cannot absorb the next day or inflate duration',()=>{
  const r=report({events:[ev('06','vote',{sessionId:'open'}),ev('07','vote',{sessionId:'open'})],streamSessions:[session('06',{id:'open',ended_at:null})]});
  assert.equal(r.sessions.length,2);assert.equal(r.sessions[0].startedAt.slice(0,10),'2026-09-07');
  assert.ok(r.sessions.every(s=>s.estimatedEnd && s.durationMinutes<181));balanced(r);
});

test('overlapping broadcasts count interactions and viewers once; back-to-back sessions stay separate',()=>{
  const r=report({events:[ev('07')],streamSessions:[session('07'),session('07',{id:'obs',platform:'obs'}),session('07',{id:'later',started_at:'2026-09-07T20:00:00Z',ended_at:'2026-09-07T21:00:00Z'})],viewerSnapshots:[{timestamp:'2026-09-07T20:00:00Z',platform:'twitch',viewer_count:10}]});
  assert.equal(r.sessions.length,2);assert.equal(r.sessions.reduce((n,s)=>n+s.viewerSamples,0),1);balanced(r);
});

test('all stream roundups remain available beyond the former 30-row limit',()=>{
  const events=Array.from({length:45},(_,i)=>({...ev('07'),timestamp:new Date(Date.UTC(2026,6,i+1,18)).toISOString()}));
  const r=report({events,range:'all'});assert.equal(r.sessions.length,45);balanced(r);
});

test('sample weights and raw bucket peaks are preserved without filling telemetry gaps',()=>{
  const r=report({streamSessions:[session('07')],viewerSnapshots:[
    {timestamp:'2026-09-07T18:00:00Z',platform:'twitch',viewer_count:10,peak_viewer_count:35,sample_count:3},
    {timestamp:'2026-09-07T18:02:00Z',platform:'twitch',viewer_count:20},
    {timestamp:'2026-09-07T19:00:00Z',platform:'twitch',viewer_count:30},
  ]});
  const s=r.sessions[0];assert.equal(s.averageViewers,16);assert.equal(s.peakViewers,35);assert.equal(s.viewerSamples,5);
  assert.equal(s.viewerHours,.5);assert.equal(s.measuredPlatformMinutes,2);assert.equal(r.impact.estimatedViewerHours,.5);
});

test('unknown, invalid and future samples are not zero viewers, and test sessions are excluded',()=>{
  const r=report({streamSessions:[session('07'),session('06',{metadata:{isTest:true}})],viewerSnapshots:[
    {timestamp:'2026-09-07T18:00:00Z',platform:'twitch',viewer_count:null},
    {timestamp:'2026-09-07T18:00:00Z',platform:'twitch',viewer_count:-1},
    {timestamp:'2026-09-09T18:00:00Z',platform:'twitch',viewer_count:50},
    {timestamp:'2026-09-06T18:00:00Z',platform:'twitch',viewer_count:50,session_id:'s06'},
  ]});assert.equal(r.sessions.length,1);assert.equal(r.sessions[0].averageViewers,null);assert.equal(r.impact.estimatedViewerHours,null);
});

test('empty report expresses unknown rates and has balanced zero totals',()=>{
  const r=report({});assert.equal(r.tools.songRequests.acceptanceRate,null);assert.equal(r.tools.polaroid.successRate,null);assert.equal(r.tools.eliminationQuiz.accuracy,null);assert.equal(r.impact.averageRetention,null);assert.deepEqual(r.sessions,[]);balanced(r);
});

test('song helper commands participate in totals and tool reach, without becoming song attempts',()=>{
  const r=report({events:[ev('07','command',{tool:'song_requests',metadata:{command:'playlist',status:'used'}})]});
  assert.equal(r.tools.songRequests.total,0);assert.equal(r.tools.songRequests.interactions,1);assert.equal(r.overview.toolsActive,1);assert.equal(r.sessions[0].songRequests,1);balanced(r);
});

test('known name-only history joins stable IDs, while case-sensitive IDs remain distinct',()=>{
  const r=report({events:[ev('07','vote',{platform:'youtube',userId:'AbC'}),ev('07','vote',{platform:'youtube',userId:'abc',username:'Other'}),ev('07','vote',{platform:'youtube',userId:'',username:'kinggumption'})]});
  assert.equal(r.audience.engagedViewers,2);assert.equal(r.tools.kingOfTheHill.uniqueVoters,2);
});

test('audience engagement only uses observed participants and roles do not double classify unknowns',()=>{
  const r=report({events:[ev('07'),ev('07','vote',{userId:'2',username:'Unobserved'}),ev('07','chat_message',{tool:'audience',roles:[]}),ev('07','chat_message',{tool:'audience',roles:['subscriber']})]});
  assert.equal(r.audience.engagedViewers,2);assert.equal(r.audience.engagedObservedChatters,1);assert.equal(r.audience.engagementRate,100);assert.ok(!r.audience.roleEngagement.some(x=>x.key==='unclassified'));
});

test('repeated capture delivery does not duplicate captures and explicit test files stay excluded',()=>{
  const r=report({captures:[{filename:'test.jpg',timestamp:'2026-09-07T18:00:00Z'}],events:[
    ev('07','capture_completed',{tool:'polaroid',metadata:{filename:'live.jpg'}}),ev('07','capture_completed',{tool:'polaroid',metadata:{filename:'live.jpg'}}),
    ev('07','capture_completed',{tool:'polaroid',metadata:{filename:'test.jpg',testMode:true}}),
    ev('07','delivery_failed',{tool:'polaroid',metadata:{error:'Unavailable'}}),
  ]});assert.equal(r.tools.polaroid.captures,1);assert.equal(r.tools.polaroid.deliveryFailures,1);assert.equal(r.tools.polaroid.successRate,100);balanced(r);
});

test('ledger search reaches old rows beyond 250, paginates, and never changes overview totals',()=>{
  const events=Array.from({length:321},(_,i)=>({...ev('07'),timestamp:new Date(Date.UTC(2026,8,7,12,0,i)).toISOString(),username:i===0?'OldestNeedle':'Viewer',id:i}));
  const r=report({events,activityPage:2});assert.equal(r.activity.length,100);assert.equal(r.activityPagination.total,321);assert.equal(r.activityPagination.pages,4);
  const found=report({events,activitySearch:'oldestneedle'});assert.equal(found.activity.length,1);assert.equal(found.overview.interactions,321);
  const last=report({events,activityPage:999});assert.equal(last.activity.length,21);assert.equal(last.activityPagination.page,3);
  assert.equal(report({events,activityTool:'polaroid'}).activity.length,0);balanced(r);
});

for(const range of ['7d','30d','90d','365d','all'])for(const platform of ['all','twitch','youtube','tiktok','admin','other'])test(`reconciles every section for ${range} / ${platform}`,()=>{
  const events=Array.from({length:50},(_,i)=>({...ev('07'),timestamp:new Date(Date.UTC(2026,6,i+1,18)).toISOString(),platform:['twitch','youtube','tiktok'][i%3]}));
  const r=report({events,range,platform,streamSessions:[session('06')]});balanced(r);
  assert.equal(r.tools.kingOfTheHill.votes,r.overview.interactions);
  assert.ok(r.activity.every(e=>platform==='all'||e.platform===platform));
});
