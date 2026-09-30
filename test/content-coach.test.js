const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'content-coach-'));
const coach=require('../src/content-coach'),store=require('../src/content-coach-store'),csv=require('../public/content-coach-csv');
const row=(i,extra={})=>({platform:'youtube',format:'short',title:`Post ${i}`,url:`https://youtube.com/shorts/abcdefghi${String(i).padStart(2,'0')}`,publishedAt:new Date(Date.UTC(2026,7,i+1)).toISOString(),observedAt:new Date(Date.UTC(2026,7,i+8)).toISOString(),window:'7d',traffic:'organic',durationSeconds:30,views:100,shares:2,followers:1,averageViewSeconds:15,source:'Studio export',...extra});
const normalize=r=>coach.normalize(r,Date.UTC(2026,8,30));
test('missing metrics remain null, zero is measured and watch percent permits replays',()=>{
 const r=normalize(row(0,{views:0,shares:0,averageViewSeconds:45})),a=coach.analyze([r])[0];assert.equal(r.reach,null);assert.equal(r.shares,0);assert.equal(a.watchPercent,150);assert.equal(a.sharesPer1000,null);assert.equal(a.multiple,null);
});
test('validation rejects unknown formats, bad timestamps, future observations, negative and nonnumeric metrics',()=>{
 for(const change of [{format:'stream'},{platform:'tiktok'},{publishedAt:'2026-02-31T00:00:00Z'},{observedAt:'2040-01-01T00:00:00Z'},{views:-1},{views:1.5},{views:true},{views:' '},{durationSeconds:0},{completionPercent:101},{window:'7d',observedAt:'2026-08-01T12:00:00Z'},{source:''}])assert.throws(()=>normalize(row(0,change)));
 assert.throws(()=>normalize(row(0,Object.fromEntries(coach.METRICS.map(k=>[k,''])))),/at least one/);
});
test('links canonicalize YouTube variants and reject arbitrary, credentialed or executable URLs',()=>{
 assert.equal(normalize(row(0)).url,'https://www.youtube.com/watch?v=abcdefghi00');
 assert.equal(normalize(row(0,{url:'https://youtu.be/abcdefghi00?si=tracking'})).url,normalize(row(0)).url);
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=abcdefghi00','https://user:pass@youtube.com/watch?v=abcdefghi00','https://youtube.com/@name','https://youtube.com:8080/watch?v=abcdefghi00'])assert.throws(()=>normalize(row(0,{url})));
});
test('baseline requires five earlier posts and isolates platform, duration, traffic, format and age',()=>{
 const rows=Array.from({length:6},(_,i)=>normalize(row(i,{views:100+i*100})));
 const result=coach.analyze(rows);assert.equal(result[4].multiple,null);assert.equal(result[5].baseline.views.median,300);assert.equal(result[5].multiple,2);
 for(const change of [{traffic:'paid'},{traffic:'unknown'},{window:'lifetime'},{format:'long'},{durationSeconds:90},{platform:'instagram',url:'https://instagram.com/reel/abc'}]){
  const altered=coach.analyze([...rows.slice(0,5),normalize(row(5,change))]).at(-1);assert.equal(altered.multiple,null);
 }
 const withFuture=coach.analyze([...rows,normalize(row(7,{views:999999}))]);assert.equal(withFuture[5].baseline.views.median,300);
});
test('each metric uses its own sample and a zero median does not produce Infinity',()=>{
 const rows=Array.from({length:6},(_,i)=>normalize(row(i,{views:0,shares:i===1?null:1}))),result=coach.analyze(rows).at(-1);assert.equal(result.multiple,null);assert.equal(result.baseline.sharesPer1000.median,null);
});
test('experiment comparisons reject duplicate posts across windows and expose missing samples',()=>{
 const records=coach.analyze(Array.from({length:6},(_,i)=>normalize(row(i))));
 const item={baseline:records.slice(0,3).map(r=>r.id),trial:records.slice(3).map(r=>r.id),metric:'views'};
 let e=coach.experiments([item],records)[0];assert.equal(e.comparable,true);assert.equal(e.delta,0);assert.equal(e.preliminary,false);
 e=coach.experiments([{...item,trial:['missing']}],records)[0];assert.equal(e.comparable,false);assert.equal(e.delta,null);
 e=coach.experiments([{...item,trial:[records[0].id]}],records)[0];assert.equal(e.comparable,false);
});
test('imports are atomic, revisions protect concurrent edits and repeated snapshots upsert',()=>{
 let s=store.save({revision:0,type:'import',rows:[row(0)]});assert.equal(s.records.length,1);
 assert.throws(()=>store.save({revision:0,type:'import',rows:[row(1)]}),/another tab/);
 assert.throws(()=>store.save({revision:1,type:'import',rows:[row(1),row(2,{views:-2})]}));assert.equal(store.read().records.length,1);
 assert.throws(()=>store.save({revision:1,type:'import',rows:[row(1),row(1)]}),/Duplicate/);
 s=store.save({revision:1,type:'import',rows:[row(0,{views:250})]});assert.equal(s.records.length,1);assert.equal(s.records[0].views,250);
 assert.throws(()=>store.save({revision:s.revision,type:'import',rows:[row(0,{observedAt:'2026-08-07T23:00:00Z'})]}),/older/);
 assert.throws(()=>store.save({revision:s.revision,type:'import',rows:[row(0,{window:'24h',observedAt:'2026-08-02T00:00:00Z',durationSeconds:50})]}),/agree/);
 s=store.save({revision:s.revision,type:'import',rows:[row(0,{window:'24h',observedAt:'2026-08-02T00:00:00Z'})]});assert.equal(s.records.length,2);
});
test('research is separate from own metrics; experiments restrict group membership and deletion',()=>{
 let s=store.read();s=store.save({revision:s.revision,type:'research',platform:'instagram',format:'short',url:'https://instagram.com/reel/reference/',creator:'Peer',topic:'Topic',observation:'Starts with a question',experiment:'Test a question',source:'Public post'});
 assert.equal(store.report().records.length,2);assert.equal(s.research.length,1);
 s=store.save({revision:s.revision,type:'import',rows:[row(1)]});const records=s.records.filter(r=>r.window==='7d');
 s=store.save({revision:s.revision,type:'experiment',baseline:[records[0].id],trial:[records[1].id],metric:'views',hypothesis:'Test hook',decision:'collect more'});
 assert.throws(()=>store.save({revision:s.revision,type:'remove',collection:'records',id:records[0].id}),/experiments/);
 assert.equal(store.report().experiments[0].preliminary,true);
});
test('CSV handles commas, quotes, Unicode, newlines, BOM and empty metrics',()=>{
 const r=row(3,{title:'A, "quoted" 🎬\npost'}),text=csv.stringify([r]),parsed=csv.parse('\uFEFF'+text);assert.equal(parsed[0].title,r.title);assert.equal(parsed[0].reach,'');assert.equal(normalize(parsed[0]).views,100);
 assert.throws(()=>csv.parse('title,views\nx,1'),/template/);assert.throws(()=>csv.parse(csv.COLUMNS.join(',')+'\n"bad'),/unclosed/);
});
