const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'stream-growth-'));
const {streamSignals,cohorts,buildGrowth}=require('../src/analytics-growth');
const store=require('../src/analytics-growth-store');
const db=require('../src/db');
const time=(day,hour=12,minute=0)=>Date.UTC(2026,7,day,hour,minute);
const session=(id,day)=>({id,platform:'twitch',startMs:time(day),endMs:time(day,14),metadata:{}});
const seen=(id,day,platform='twitch')=>({platform,userId:id,timeMs:time(day,13)});
test('cohorts use lifetime baseline, later broadcasts, platform separation and mature windows',()=>{
 const sessions=[session('a',1),session('b',4),session('c',8),session('d',20)];
 const history=[seen('old',1),seen('old',4),seen('new',4),seen('new',8),seen('new',8),seen('pending',20)];
 const [seven,thirty]=cohorts(history,sessions,{since:time(4,0),now:time(22,0),platform:'all'});
 assert.deepEqual(seven,{days:7,matured:1,returned:1,pending:1,rate:100});assert.equal(thirty.matured,0);assert.equal(thirty.rate,null);
 assert.equal(cohorts(history,sessions,{since:time(1,0),now:time(22,0),platform:'youtube'})[0].matured,0);
});
test('same-stream participation never counts as a return and tests/open streams are excluded',()=>{
 const sessions=[session('a',1),{...session('test',4),metadata:{isTest:true}},{...session('open',8),endMs:null}];
 const [r]=cohorts([seen('one',1),{...seen('one',1),timeMs:time(1,13,30)},seen('one',4),seen('one',8)],sessions,{since:0,now:time(25),platform:'all'});
 assert.equal(r.matured,1);assert.equal(r.returned,0);
});
const raw=Array.from({length:61},(_,i)=>({minute:time(1)/60000+i,total:100+i,viewers:{twitch:50+i}}));
const g={startMs:time(1),endMs:time(1,13),source:'platform',sessions:[session('a',1)]};
const raid={eventType:'raid_received',platform:'twitch',timeMs:time(1,12,10),timestamp:new Date(time(1,12,10)).toISOString()};
test('opening and raid windows use aligned complete means and sustained lift',()=>{
 const s=streamSignals(g,raw,[raid],[{...seen('one',1),timeMs:time(1,12,2),eventType:'chat_message'}]);
 assert.equal(s.opening.first5,102);assert.equal(s.opening.last5,112);assert.equal(s.opening.change,10);assert.equal(s.opening.chatters,1);
 assert.equal(s.raids[0].baseline,57);assert.equal(s.raids[0].after10,67);assert.equal(s.raids[0].lift30,30);
});
test('missing minutes, incomplete windows and clipped starts stay unknown',()=>{
 const s=streamSignals(g,raw.filter((_,i)=>i!==12),[raid],[]);assert.equal(s.opening.change,null);
 assert.equal(streamSignals({...g,startMs:time(1,12,2)},raw,[raid],[]).opening.first5,null);
 const short=streamSignals({...g,endMs:time(1,12,25)},raw,[raid],[]);assert.equal(short.raids[0].after30,null);
 const overlap=streamSignals(g,raw,[raid,{...raid,timeMs:time(1,12,12)}],[]);assert.equal(overlap.raids[0].overlapping,true);
});
test('growth writes validate atomically, replace duplicate import keys, and reject stale revisions',()=>{
 const row={date:'2026-08-01',platform:'twitch',source:'Clip',visits:10,url:'https://example.com/clip',provenance:'Daily link clicks'};
 let notes=store.save({revision:0,type:'discovery',rows:[row]});assert.equal(notes.discovery.length,1);
 assert.throws(()=>store.save({revision:0,type:'discovery',rows:[row]}),/another tab/);
 assert.throws(()=>store.save({revision:1,type:'discovery',rows:[row,{...row,date:'2026-02-31'}]}),/valid/);assert.equal(store.read().revision,1);
 notes=store.save({revision:1,type:'discovery',rows:[{...row,visits:20}]});assert.equal(notes.discovery.length,1);assert.equal(notes.discovery[0].visits,20);
 assert.throws(()=>store.save({revision:2,type:'discovery',rows:[{...row,url:'javascript:alert(1)'}]}),/HTTP/);
 assert.throws(()=>store.save({revision:2,type:'experiment',hypothesis:'Test',metric:'medianOpeningChange',baseline:['a'],trial:['a'],notes:''}),/separate/);
 notes=store.save({revision:2,type:'experiment',hypothesis:'Quiz opening',metric:'medianOpeningChange',baseline:['a'],trial:['b'],notes:'One change'});assert.equal(notes.experiments.length,1);
 notes=store.save({revision:3,type:'remove',collection:'experiments',id:notes.experiments[0].id});assert.equal(notes.experiments.length,0);
});
test('history query excludes tests and keeps ID and name identities separate',()=>{
 db.openStreamSession({id:'real',platform:'twitch',startedAt:new Date(time(1)).toISOString()});db.closeStreamSession({id:'real',endedAt:new Date(time(1,14)).toISOString()});
 for(const extra of [{userId:'one',username:'Old'},{userId:'one',username:'New'},{userId:'',username:'one'},{userId:'test',username:'Test',metadata:{isTest:true}}])db.addEngagementEvent({timestamp:new Date(time(1,13)).toISOString(),tool:'audience',eventType:'chat_message',platform:'twitch',sessionId:'real',...extra});
 const history=db.listGrowthHistory();assert.equal(history.length,2);assert.ok(history.every(e=>e.platform_user_id!=='test'));
});
test('format and experiment comparisons exclude incomplete streams and report missing selections',()=>{
 const make=(id,value)=>({id,source:'platform',startedAt:new Date(time(1)).toISOString(),detail:{growth:{fullStream:true,opening:{change:value}},followsPerHour:value,returningPercent:null}});
 const result=buildGrowth({sessions:[make('a',2),make('b',6),{...make('bad',999),estimatedEnd:true}],history:[],streamSessions:[],since:0,now:time(25),platform:'all',notes:{formats:{a:'Quiz',b:'Quiz'},discovery:[],experiments:[{baseline:['a'],trial:['b','missing'],metric:'medianOpeningChange'}]}});
 assert.equal(result.formats[0].streams,2);assert.equal(result.formats[0].medianOpeningChange,4);assert.equal(result.experiments[0].missingStreams,1);assert.equal(result.experiments[0].trialSummary.samples.medianOpeningChange,1);
});

test('history reconstructs two broadcasts in one day when incoming session IDs are absent',()=>{
 for(const [id,hour] of [['morning',8],['afternoon',16]]){
 db.openStreamSession({id,platform:'youtube',startedAt:new Date(time(2,hour)).toISOString()});db.closeStreamSession({id,endedAt:new Date(time(2,hour+1)).toISOString()});
 db.addEngagementEvent({timestamp:new Date(time(2,hour,10)).toISOString(),tool:'audience',eventType:'chat_message',platform:'youtube',userId:'same',username:'Same'});
 }
 const rows=db.listGrowthHistory().filter(e=>e.platform==='youtube');assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(e=>e.session_id)),new Set(['morning','afternoon']));
});

test('overlapping OBS and platform lifecycle records are one broadcast for cohort returns',()=>{
 const sessions=[session('platform',1),{...session('obs',1),platform:'obs',startMs:time(1,12,30),endMs:time(1,15)}];
 const history=[{...seen('one',1),timeMs:time(1,12,10)},{...seen('one',1),timeMs:time(1,14,30)}];
 const [r]=cohorts(history,sessions,{since:0,now:time(20),platform:'all'});assert.equal(r.matured,1);assert.equal(r.returned,0);
});

test('discovery CSV supports escaped commas, quotes and CRLF while rejecting malformed records',()=>{
 const {parse}=require('../public/analytics-growth-csv');
 const header='date,platform,source,visits,url,provenance\r\n';
 const rows=parse(header+'2026-08-01,twitch,"Clip, \"\"quiz\"\"",42,https://example.com,"Daily\nclicks"\r\n');
 assert.equal(rows[0].source,'Clip, "quiz"');assert.equal(rows[0].provenance,'Daily\nclicks');
 assert.throws(()=>parse(header+'2026-08-01,twitch,"unclosed'),/unclosed/);
 assert.throws(()=>parse(header+'2026-08-01,twitch,"clip"junk,42,,evidence'),/Unexpected/);
 assert.throws(()=>parse('date,source\n2026-08-01,clip'),/template/);
 assert.throws(()=>parse(header+'2026-08-01,twitch,clip'),/columns/);
});

test('broadcast annotation IDs remain stable when platform views have different start times',()=>{
 const lifecycle=[session('twitch',1),{...session('youtube',1),platform:'youtube',startMs:time(1,12,5)}];
 const make=(id,start)=>({id,source:'platform',startedAt:new Date(start).toISOString(),detail:{growth:{fullStream:true,opening:{change:null}},followsPerHour:0,returningPercent:null}});
 const all=make('all',time(1)),filtered=make('youtube',time(1,12,5));
 const args={history:[],streamSessions:lifecycle,since:0,now:time(25),platform:'all',notes:{formats:{['broadcast:'+new Date(time(1)).toISOString()]:'Quiz'},discovery:[],experiments:[]}};
 const a=buildGrowth({...args,sessions:[all]}),b=buildGrowth({...args,platform:'youtube',sessions:[filtered]});assert.equal(all.growthId,filtered.growthId);assert.equal(a.formats[0].label,'Quiz');assert.equal(b.formats[0].label,'Quiz');
});
