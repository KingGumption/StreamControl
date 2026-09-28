const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'stream-coaching-'));
const {telemetry,breadth,clips,contentSegments}=require('../src/analytics-coaching');
const {buildAnalyticsReport}=require('../src/analytics');
const store=require('../src/analytics-growth-store'),db=require('../src/db');
const start=Date.parse('2026-08-01T12:00:00Z'),stamp=m=>new Date(start+m*60000).toISOString();
const raw=Array.from({length:30},(_,i)=>({minute:start/60000+i,total:10+i,viewers:{twitch:10+i},chat:i===15?20:2,interactions:0,events:i===15?{Raid:1}:{}}));
test('telemetry excludes partial edges, distinguishes zero from missing, and counts gaps',()=>{
 const rows=raw.filter((_,i)=>![3,4,20].includes(i)).map((b,i)=>i===0?{...b,viewers:{twitch:0}}:b);
 const h=telemetry(rows,['twitch'],start,start+30*60000)[0];assert.equal(h.measured,27);assert.equal(h.missing,3);assert.equal(h.longestGap,2);assert.equal(h.gapCount,2);
 assert.equal(telemetry(raw,['twitch'],start+1000,start+29999)[0].coverage,null);
});
test('clip candidates need preceding telemetry and suppress adjacent peaks',()=>{
 const rows=raw.map((b,i)=>i===16?{...b,chat:30}:b);
 const picks=clips(rows,start,start+30*60000);assert.equal(picks.length,1);assert.equal(picks[0].elapsed,16);assert.equal(picks[0].baseline,2);
 assert.equal(clips(rows.filter((_,i)=>i!==9),start,start+30*60000).length,0);
 assert.equal(clips(raw,start,start+15.5*60000).length,0);
});
test('breadth weights aggregate chat counts, separates platform accounts and ignores anonymous events',()=>{
 const b=breadth([{platform:'twitch',userId:'a',aggregateCount:5},{platform:'twitch',userId:'a'},{platform:'youtube',userId:'a'},...Array.from({length:5},(_,i)=>({platform:'twitch',username:'x'+i})),{}]);
 assert.equal(b.participants,7);assert.equal(b.actions,12);assert.equal(b.topFiveShare,83.3);assert.equal(b.singleActionParticipants,6);
});
test('segments close at the next marker, retain clipped context and withhold incomplete means',()=>{
 const markers=[{id:'a',label:'Chat',timestamp:stamp(0)},{id:'b',label:'Quiz',timestamp:stamp(10)}];
 const result=contentSegments(markers,raw.filter((_,i)=>i!==5),[],start+2*60000,start+30*60000);
 assert.equal(result[0].minutes,8);assert.equal(result[0].average,null);assert.equal(result[1].average,29.5);assert.equal(result[1].change,19);assert.equal(result[1].continues,true);
});
const session={id:'real',platform:'twitch',started_at:stamp(0),ended_at:stamp(30)};
const chat=(id,min,extra={})=>({timestamp:stamp(min),tool:'audience',event_type:'chat_message',platform:'twitch',platform_user_id:id,username:id,...extra});
test('reports use lifetime first chats, exclude returning chatters, and remove raw working data',()=>{
 const notes={formats:{},experiments:[],discovery:[],segments:[],welcomes:[{id:'w',sessionId:'broadcast:'+stamp(0),account:'twitch:id:new',timestamp:stamp(3)}]};
 const r=buildAnalyticsReport({streamSessions:[session],viewerSnapshots:raw.map(b=>({timestamp:new Date(b.minute*60000).toISOString(),platform:'twitch',viewer_count:b.total})),events:[chat('old',1),chat('new',2)],firstChats:[chat('old',-100),chat('new',2)],growthNotes:notes,now:stamp(31),range:'all'});
 const c=r.sessions[0].detail.coaching;assert.equal(c.complete,true);assert.equal(c.welcomes.length,1);assert.equal(c.welcomes[0].delaySeconds,60);assert.equal(c.welcomeSummary.medianSeconds,60);assert.ok(!JSON.stringify(r).includes('_coaching'));assert.ok(c.findings.length<=3);
});
test('marker writes validate broadcast bounds, first chat ordering and optimistic revisions',()=>{
 db.openStreamSession({id:'real',platform:'twitch',startedAt:stamp(0)});db.closeStreamSession({id:'real',endedAt:stamp(30)});
 db.addEngagementEvent({timestamp:stamp(2),tool:'audience',eventType:'chat_message',platform:'twitch',userId:'new',username:'New'});
 const save=input=>store.save({...input,revision:store.read().revision});
 let notes=save({type:'segment',sessionId:'broadcast:'+stamp(0),timestamp:stamp(0),label:'Chat <test>'});assert.equal(notes.segments.length,1);
 assert.throws(()=>save({type:'segment',sessionId:'broadcast:'+stamp(0),timestamp:stamp(30),label:'Late'}),/inside/);
 assert.throws(()=>save({type:'segment',sessionId:'broadcast:'+stamp(0),timestamp:stamp(0),label:'Duplicate'}),/already/);
 assert.throws(()=>save({type:'welcome',sessionId:'broadcast:'+stamp(0),timestamp:stamp(1),account:'twitch:id:new'}),/later acknowledgement/);
 notes=save({type:'welcome',sessionId:'broadcast:'+stamp(0),timestamp:stamp(3),account:'twitch:id:new'});assert.equal(notes.welcomes.length,1);
 notes=save({type:'welcome',sessionId:'broadcast:'+stamp(0),timestamp:stamp(4),account:'twitch:id:new'});assert.equal(notes.welcomes.length,1);
 assert.throws(()=>store.save({revision:0,type:'remove',collection:'segments',id:notes.segments[0].id}),/another tab/);
 notes=save({type:'remove',collection:'segments',id:notes.segments[0].id});assert.equal(notes.segments.length,0);
});
test('first-chat query ignores test metadata and preserves the earliest historical observation',()=>{
 db.addEngagementEvent({timestamp:stamp(-20),tool:'audience',eventType:'chat_message',platform:'twitch',userId:'new',username:'New',metadata:{isTest:true}});
 db.addEngagementEvent({timestamp:stamp(10),tool:'audience',eventType:'chat_message',platform:'twitch',userId:'new',username:'Renamed'});
 const first=db.listFirstChats().find(c=>c.platform_user_id==='new');assert.equal(first.timestamp,stamp(2));
});
test('weekly review upserts by experiment/date and deleting experiments removes reviews',()=>{
 const save=input=>store.save({...input,revision:store.read().revision});
 let notes=save({type:'experiment',hypothesis:'Quiz opening',metric:'medianOpeningChange',baseline:['a'],trial:['b'],notes:''});const id=notes.experiments[0].id;
 notes=save({type:'review',experimentId:id,week:'2026-08-20',decision:'collect more',notes:'Two streams'});
 notes=save({type:'review',experimentId:id,week:'2026-08-20',decision:'adjust',notes:'Shorter opening'});assert.equal(notes.reviews.length,1);assert.equal(notes.reviews[0].decision,'adjust');
 assert.throws(()=>save({type:'review',experimentId:id,week:'2026-02-31',decision:'keep',notes:''}),/valid review/);
 notes=save({type:'remove',collection:'experiments',id});assert.equal(notes.reviews.length,0);
});

test('chat aggregation excludes test messages before metadata is discarded',()=>{
 const rows=db.listEngagementEventsForRange({chatResolution:'minute'}).filter(e=>e.platform_user_id==='new');
 assert.ok(rows.every(e=>Date.parse(e.timestamp)>=start));
});
test('open broadcast marker identity survives a recorded end without merging unrelated history',()=>{
 const open={...session,ended_at:null};const snapshots=[0,1,2,3].map(i=>({timestamp:stamp(i),platform:'twitch',viewer_count:10}));
 const a=buildAnalyticsReport({streamSessions:[open],viewerSnapshots:snapshots,now:stamp(4),range:'all'});
 const b=buildAnalyticsReport({streamSessions:[session],viewerSnapshots:snapshots,now:stamp(31),range:'all'});
 assert.equal(a.sessions[0].growthId,b.sessions[0].growthId);assert.equal(a.sessions[0].detail.coaching.complete,false);
});
test('weekly reviews expose missing groups instead of recommending a decision from unavailable metrics',()=>{
 const notes={formats:{},discovery:[],experiments:[{id:'test',hypothesis:'Shorter opening',metric:'medianOpeningChange',baseline:['absent'],trial:['broadcast:'+stamp(0)]}],reviews:[]};
 const r=buildAnalyticsReport({streamSessions:[session],growthNotes:notes,now:stamp(31),range:'all'});
 assert.equal(r.coaching.experiments[0].difference,null);assert.equal(r.coaching.experiments[0].recentStreams,1);assert.match(r.coaching.experiments[0].status,/Expand filters/);
});
