const test=require('node:test');
const assert=require('node:assert/strict');
const {buildAnalyticsReport}=require('../src/analytics');
const stamp=(minute,day=20)=>new Date(Date.UTC(2026,8,day,12,minute)).toISOString();
const session=(platform='twitch',day=20)=>({id:platform+day,platform,started_at:stamp(0,day),ended_at:stamp(10,day)});
const sample=(minute,count,platform='twitch',day=20)=>({timestamp:stamp(minute,day),platform,viewer_count:count});
const event=(minute,eventType,extra={})=>({timestamp:stamp(minute),platform:'twitch',tool:'elimination_quiz',eventType,userId:'one',username:'One',...extra});
const report=x=>buildAnalyticsReport({now:'2026-09-22T00:00:00Z',...x});
test('aligned peak does not add independent platform peaks or fill missing minutes',()=>{
 const r=report({streamSessions:[session(),session('youtube')],viewerSnapshots:[sample(0,100),sample(0,10,'youtube'),sample(1,10),sample(1,100,'youtube'),sample(2,500)]});
 const d=r.sessions[0].detail;assert.equal(d.peakConcurrentViewers,110);assert.equal(r.impact.peakConcurrentViewers,110);assert.equal(d.points[2].total,null);assert.equal(d.coveragePercent,18.2);
});
test('zero is a real measurement; no samples remain unknown',()=>{
 const d=report({streamSessions:[session()],viewerSnapshots:[sample(0,0)]}).sessions[0].detail;
 assert.equal(d.peakConcurrentViewers,0);assert.equal(d.points[0].total,0);
 assert.equal(report({streamSessions:[session()]}).sessions[0].detail.peakConcurrentViewers,null);
});
test('minute grouping preserves weights, chat counts and event markers',()=>{
 const d=report({streamSessions:[session()],viewerSnapshots:[{...sample(0,10),sample_count:3},{...sample(0,30),timestamp:stamp(0).replace(':00.000',':30.000')}],events:[event(0,'chat_message',{tool:'audience',aggregate_count:9}),event(0,'song_request',{tool:'song_requests',metadata:{}}),event(1,'raid_received',{tool:'stream'})]}).sessions[0].detail;
 assert.equal(d.points[0].viewers.twitch,15);assert.equal(d.points[0].chat,9);assert.equal(d.points[1].events.Raid,1);
});
test('returning participants count people once per recorded broadcast and retain platform boundaries',()=>{
 const r=report({streamSessions:[session('twitch',19),session()],events:[event(0,'player_joined',{timestamp:stamp(0,19)}),event(0,'chat_message',{tool:'audience'}),event(1,'player_joined'),event(2,'player_joined',{userId:'two'})]});
 assert.equal(r.sessions[0].detail.returningParticipants,1);assert.equal(r.sessions[0].detail.observedParticipants,2);assert.equal(r.sessions[0].detail.returningPercent,50);assert.equal(r.sessions[1].detail.returningParticipants,null);assert.ok(!JSON.stringify(r).includes('_participants'));
});
test('outcomes per hour use known duration, not an inferred span',()=>{
 const events=[event(1,'follow',{tool:'stream'}),event(2,'subscription',{tool:'stream'})];
 const d=report({streamSessions:[session()],events}).sessions[0].detail;assert.equal(d.followsPerHour,6);assert.equal(d.subscriptionsPerHour,6);
 assert.equal(report({events}).sessions[0].detail.followsPerHour,null);
});
test('game segment changes require complete aligned interior minutes',()=>{
 const events=[event(0,'game_started',{correlationId:'game'}),event(4,'game_completed',{correlationId:'game'})];
 const snapshots=[0,1,2,3,4].map(i=>sample(i,10+i));
 const d=report({streamSessions:[session()],events,viewerSnapshots:snapshots}).sessions[0].detail;
 assert.equal(d.segments[0].change,3);assert.equal(d.segments[0].averageViewers,11.5);
 const gap=report({streamSessions:[session()],events,viewerSnapshots:snapshots.filter((_,i)=>i!==2)}).sessions[0].detail;
 assert.equal(gap.segments[0].change,null);assert.equal(gap.segments[0].coveragePercent,75);
});
test('back-to-back sessions assign boundary chat and samples once',()=>{
 const s2={...session(),id:'later',started_at:stamp(10),ended_at:stamp(20)};
 const r=report({streamSessions:[session(),s2],events:[event(10,'chat_message',{tool:'audience'})],viewerSnapshots:[sample(10,12)]});
 assert.equal(r.sessions.reduce((n,s)=>n+s.detail.points.reduce((sum,p)=>sum+p.chat,0),0),1);
 assert.equal(r.sessions[0].detail.observedParticipants,1);assert.equal(r.sessions[1].detail.observedParticipants,0);
});
test('platform filter and explicit tests cannot leak into stream details',()=>{
 const r=report({platform:'twitch',streamSessions:[session(),session('youtube')],viewerSnapshots:[sample(0,10),sample(0,500,'youtube'),{...sample(1,999),metadata:{isTest:true}}],events:[event(1,'follow',{tool:'stream',metadata:{isTest:true}})]});
 assert.deepEqual(r.sessions[0].detail.platforms,['twitch']);assert.equal(r.sessions[0].detail.peakConcurrentViewers,10);assert.equal(r.sessions[0].detail.followsPerHour,0);
});
test('long-session chart payload is bounded without changing the minute peak',()=>{
 const long={...session(),ended_at:stamp(1500)};
 const r=report({streamSessions:[long],viewerSnapshots:Array.from({length:1501},(_,i)=>sample(i,i===999?100:1))});
 assert.ok(r.sessions[0].detail.points.length<=720);assert.equal(r.sessions[0].detail.peakConcurrentViewers,100);
});

test('platform drilldowns retain shared game markers without adding other-platform participants',()=>{
 const r=report({platform:'twitch',streamSessions:[session()],viewerSnapshots:[0,1,2,3,4].map(i=>sample(i,10+i)),events:[event(0,'game_started',{platform:'other',correlationId:'shared'}),event(1,'answer_submitted',{correlationId:'shared'}),event(2,'answer_submitted',{platform:'youtube',userId:'other',correlationId:'shared'}),event(4,'game_completed',{platform:'other',correlationId:'shared'})]});
 assert.equal(r.sessions[0].detail.segments.length,1);assert.equal(r.sessions[0].detail.observedParticipants,1);assert.equal(r.sessions[0].detail.points[0].events['Quiz: Game started'],1);assert.equal(r.overview.interactions,1);
});
