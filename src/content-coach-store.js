const {randomUUID}=require('node:crypto');
const {db,getConfigValue,setConfigValue}=require('./db');
const coach=require('./content-coach');
const KEY='content_coach_v1';
const read=()=>getConfigValue(KEY,{revision:0,records:[],research:[],experiments:[]});
const save=db.transaction(input=>{
 const current=read();if(!input||input.revision!==current.revision){const e=Error('Content changed in another tab. Reload before saving.');e.status=409;throw e;}
 const next=structuredClone(current);
 if(input.type==='import'){
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100)throw Error('Import 1–100 observations at a time.');
  const rows=input.rows.map((row,i)=>{try{return coach.normalize(row);}catch(e){throw Error(`Row ${i+1}: ${e.message}`);}}),map=new Map(next.records.map(r=>[r.id,r]));
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate post/window in this import.');
  for(const row of rows){const previous=map.get(row.id);if(previous&&Date.parse(previous.observedAt)>Date.parse(row.observedAt))throw Error('An observation is older than the saved version.');map.set(row.id,row);}
  next.records=[...map.values()];if(next.records.length>12000)throw Error('Observation limit reached (12,000). Export and remove older records first.');
  // Publication metadata must agree across a post’s observation windows.
  const posts=new Map();for(const r of next.records){const key=r.platform+r.url,signature=JSON.stringify([r.format,r.publishedAt,r.durationSeconds,r.group,r.traffic]);if(posts.has(key)&&posts.get(key)!==signature)throw Error('Format, publication time, duration, content group and traffic must agree across all windows of a post.');posts.set(key,signature);}
 }else if(input.type==='research'){
  const platform=coach.choice(input.platform,coach.PLATFORMS,'platform');
  const item={id:input.id||randomUUID(),platform,format:coach.choice(input.format,['short','long'],'format'),url:coach.link(input.url,platform),creator:coach.text(input.creator,100,true),topic:coach.text(input.topic,100,true),observation:coach.text(input.observation,2000,true),experiment:coach.text(input.experiment,1000,true),source:coach.text(input.source,300,true)};
  if(input.id&&!next.research.some(r=>r.id===input.id))throw Error('Reference not found.');next.research=next.research.filter(r=>r.id!==item.id).concat(item);if(next.research.length>300)throw Error('Reference limit reached.');
 }else if(input.type==='experiment'){
  const ids=value=>{if(!Array.isArray(value)||!value.length||value.length>30||value.some(id=>typeof id!=='string'||!next.records.some(r=>r.id===id)))throw Error('Choose 1–30 saved observations in each group.');return [...new Set(value)];};
  const item={id:input.id||randomUUID(),hypothesis:coach.text(input.hypothesis,500,true),metric:coach.choice(input.metric,['views',...coach.RATE_METRICS],'metric'),baseline:ids(input.baseline),trial:ids(input.trial),notes:coach.text(input.notes,2000),decision:coach.choice(input.decision,['collect more','keep','adjust','stop'],'decision')};
  if(item.baseline.some(id=>item.trial.includes(id)))throw Error('Baseline and trial must contain different posts.');
  if(!coach.experiments([item],coach.analyze(next.records))[0].comparable)throw Error('Use different organic posts from the same platform, format, duration band and fixed measurement window.');
  if(input.id&&!next.experiments.some(r=>r.id===input.id))throw Error('Experiment not found.');next.experiments=next.experiments.filter(e=>e.id!==item.id).concat(item);if(next.experiments.length>100)throw Error('Experiment limit reached.');
 }else if(input.type==='remove'){
  coach.choice(input.collection,['records','research','experiments'],'collection');
  if(input.collection==='records'&&next.experiments.some(e=>[...e.baseline,...e.trial].includes(input.id)))throw Error('Remove experiments using this observation first.');
  next[input.collection]=next[input.collection].filter(r=>r.id!==input.id);
 }else throw Error('Unknown Content Coach action.');
 if(Buffer.byteLength(JSON.stringify(next))>35*1024*1024)throw Error('Content storage limit reached.');
 next.revision++;setConfigValue(KEY,next);return next;
});
function report(){const state=read(),records=require('./content-coach').analyze(state.records);return {...state,records,experiments:coach.experiments(state.experiments,records)};}
module.exports={read,save,report};
