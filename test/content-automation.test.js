const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'content-automation-'));
const store=require('../src/content-automation-store');
const {comparable,allowedCover,askOpenAI,createAutomation}=require('../src/content-automation');

const now=Date.parse('2026-10-01T12:00:00Z');
function post(i,views=100,publishedAt='2026-09-20T12:00:00Z'){
  return {url:`https://www.youtube.com/watch?v=${String(i).padStart(11,'a')}`,title:`Post ${i}`,
    description:'A gaming post',hashtags:['gaming'],category:'20',coverUrl:'https://i.ytimg.com/vi/example/maxresdefault.jpg',
    publishedAt,format:'short',durationSeconds:40,metrics:{views,likes:views/10,shares:null}};
}
test('dated snapshots upsert while null metrics and advice state remain distinct',()=>{
  const first=post(1);
  store.upsertPosts('youtube',[first],'2026-09-21T12:00:00Z');
  store.upsertPosts('youtube',[{...first,metrics:{views:200,likes:null,shares:null}}],'2026-09-22T12:00:00Z');
  store.upsertPosts('youtube',[{...first,metrics:{views:210,likes:null,shares:null}}],'2026-09-22T12:00:00Z');
  const rows=store.listPosts();
  assert.equal(rows.length,1);
  assert.equal(rows[0].metrics.views,210);
  assert.equal(rows[0].metrics.likes,null);
  assert.equal(store.snapshots('youtube',first.url).length,2);
  assert.equal(store.setAdviceState('youtube',first.url,'tried'),1);
  assert.equal(store.listPosts()[0].adviceState,'tried');
  store.saveAnalysis('youtube',first.url,{summary:'A new test'},'fingerprint');
  assert.equal(store.listPosts()[0].adviceState,'tried');
});
test('age-matched comparison requires five earlier snapshots and does not use lifetime totals',()=>{
  const target=post(9,120,'2026-09-25T12:00:00Z');
  store.upsertPosts('youtube',[target],'2026-09-26T12:00:00Z');
  for(let i=2;i<=6;i++)store.upsertPosts('youtube',[post(i,i*10,'2026-09-20T12:00:00Z')],'2026-09-21T12:00:00Z');
  const rows=store.listPosts();
  const baseline=comparable(rows.find(r=>r.url===target.url),rows);
  assert.equal(baseline.sample,6);
  assert.equal(baseline.median,45);
  assert.equal(baseline.multiple,120/45);
});
test('job lease, retry and conservative AI reservation survive repeat calls',()=>{
  assert.equal(store.claimJob('daily',now),true);
  assert.equal(store.claimJob('daily',now+1000),false);
  store.finishJob('daily',now,{analyzed:1});
  assert.equal(store.claimJob('daily',now+1000),false);
  assert.equal(store.claimJob('daily',now+86400001),true);
  assert.equal(store.reserveSpend(now,0.03,0.05),true);
  assert.equal(store.reserveSpend(now,0.03,0.05),false);
});
test('covers only use known public HTTPS hosts and AI receives missing values as null',async()=>{
  assert.equal(allowedCover('http://i.ytimg.com/x','youtube'),null);
  assert.equal(allowedCover('https://i.ytimg.com.evil.test/x','youtube'),null);
  assert.equal(allowedCover('https://i.ytimg.com/x','youtube'),'https://i.ytimg.com/x');
  const item=store.listPosts().find(p=>p.metadata.title==='Post 1');
  let sent;
  const fetchImpl=async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Test',measuredFacts:['210 views'],hypotheses:['Could test a clearer title'],actions:[{field:'title',change:'Try a specific title',reason:'Hypothesis'}]})}]}]})};};
  const report=await askOpenAI(item,{sample:0,median:null},{fetchImpl,environment:{OPENAI_API_KEY:'test-key'}});
  assert.equal(report.actions[0].field,'title');
  assert.equal(sent.store,false);
  assert.equal(JSON.parse(sent.input[0].content[0].text.split('\n').at(-1)).metrics.shares,null);
});
test('daily run isolates a failed provider and syncs metrics without an AI key',async()=>{
  let synced=0;
  const automation=createAutomation({now:()=>now+3*86400000,environment:{CONTENT_COACH_AI_BUDGET_GBP:'10'},connections:{
    youtube:{status:()=>({connected:true}),sync:async()=>{throw Error('Provider unavailable');},publicExamples:async()=>[]},
    tiktok:{status:()=>({connected:true}),sync:async()=>{synced++;return {posts:1};}},
    instagram:{status:()=>({connected:false,configured:false})},
  }});
  const before=automation.status().ai.requests;
  const result=await automation.run();
  assert.equal(result.started,true);
  assert.equal(synced,1);
  assert.match(result.platforms.youtube.error,/unavailable/);
  assert.equal(result.platforms.tiktok.posts,1);
  assert.equal(automation.status().ai.requests,before);
});
