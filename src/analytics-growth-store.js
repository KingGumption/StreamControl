const {randomUUID}=require('node:crypto');
const {db,getConfigValue,setConfigValue,listStreamSessionsForRange,listFirstChats}=require('./db');
const KEY='analytics_growth_notes_v1';
const read=()=>({segments:[],welcomes:[],reviews:[],...getConfigValue(KEY,{revision:0,formats:{},experiments:[],discovery:[]})});
function text(value,max,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new Error(`Text must be ${required?'1':'0'}–${max} characters.`);return value.trim();}
function ids(value){if(!Array.isArray(value)||value.length>50)throw new Error('Select up to 50 streams per group.');return [...new Set(value.map(v=>text(v,500)))];}
function discovery(row){
 const date=text(row.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Use a valid YYYY-MM-DD date.');
 if(!['twitch','youtube','tiktok'].includes(row.platform))throw new Error('Select a supported platform.');
 const source=text(row.source,100),visits=Number(row.visits);if(!Number.isSafeInteger(visits)||visits<0||String(row.visits).trim()==='')throw new Error('Visits must be a non-negative whole number.');
 const url=text(row.url??'',1000,false);if(url){const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Use an HTTP(S) link without credentials.');}
 return {id:JSON.stringify([date,row.platform,source.toLowerCase(),url]),date,platform:row.platform,source,visits,url,provenance:text(row.provenance,200)};
}
function stamp(value){const v=text(value,40);if(!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error('Use a valid timestamp.');return new Date(v).toISOString();}
function marker(input){
 const sessionId=text(input.sessionId,500),timestamp=stamp(input.timestamp),at=Date.parse(timestamp);
 if(at>Date.now())throw new Error('Markers cannot be in the future.');
 const start=Date.parse(sessionId.replace(/^broadcast:/,''));
 const sessions=listStreamSessionsForRange().filter(s=>!s.metadata?.isTest&&!s.metadata?.testMode);
 if(!sessionId.startsWith('broadcast:')||!sessions.some(s=>Date.parse(s.started_at)===start)||at<start)throw new Error('Choose a recorded broadcast.');
 // Follow overlapping lifecycle windows, while bounding unclosed records at the next start.
 const windows=sessions.filter(s=>Date.parse(s.started_at)>=start).map(s=>{const a=Date.parse(s.started_at);const next=sessions.filter(n=>n.platform===s.platform&&Date.parse(n.started_at)>a).reduce((v,n)=>Math.min(v,Date.parse(n.started_at)),Date.now());return {start:a,end:s.ended_at?Date.parse(s.ended_at):next};}).sort((a,b)=>a.start-b.start);
 const groups=[];for(const w of windows){const last=groups.at(-1);if(last&&w.start<last.end)last.end=Math.max(last.end,w.end);else groups.push({...w});}
 const group=groups.find(w=>w.start===start);if(!group||at>=group.end)throw new Error('Marker must fall inside the recorded broadcast.');
 return {sessionId,timestamp};
}
const save=db.transaction(input=>{
 const current=read();if(input.revision!==current.revision){const e=new Error('Notes changed in another tab. Reload notes before saving.');e.status=409;throw e;}
 const next=structuredClone(current);
 if(input.type==='format'){const id=text(input.sessionId,500),value=text(input.value,80,false);if(value)next.formats[id]=value;else delete next.formats[id];if(Object.keys(next.formats).length>2000)throw new Error('Format label limit reached.');}
 else if(input.type==='experiment'){
  const item={id:input.id?text(input.id,100):randomUUID(),hypothesis:text(input.hypothesis,500),metric:text(input.metric,40),baseline:ids(input.baseline),trial:ids(input.trial),notes:text(input.notes??'',2000,false)};
  if(!['medianOpeningChange','medianFollowsPerHour','medianReturningPercent'].includes(item.metric))throw new Error('Choose a supported metric.');
  if(!item.baseline.length||!item.trial.length||item.baseline.some(id=>item.trial.includes(id)))throw new Error('Choose separate non-empty baseline and trial groups.');
  if(input.id&&!next.experiments.some(e=>e.id===input.id))throw new Error('Experiment not found.');
  next.experiments=next.experiments.filter(e=>e.id!==item.id).concat(item);if(next.experiments.length>200)throw new Error('Experiment limit reached.');
 }else if(input.type==='discovery'){
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>200)throw new Error('Import between 1 and 200 rows.');
  const items=input.rows.map(discovery),map=new Map(next.discovery.map(e=>[e.id,e]));items.forEach(e=>map.set(e.id,e));next.discovery=[...map.values()];if(next.discovery.length>5000)throw new Error('Discovery history limit reached.');
 }else if(input.type==='segment'){
  const item={id:input.id?text(input.id,100):randomUUID(),...marker(input),label:text(input.label,80)};
  if(input.id&&!next.segments.some(s=>s.id===input.id))throw new Error('Segment not found.');
  if(next.segments.some(s=>s.id!==item.id&&s.sessionId===item.sessionId&&s.timestamp===item.timestamp))throw new Error('A segment already starts at this time.');
  next.segments=next.segments.filter(s=>s.id!==item.id).concat(item);if(next.segments.length>5000)throw new Error('Segment limit reached.');
 }else if(input.type==='welcome'){
  const item={...marker(input),account:text(input.account,500)};
  const first=listFirstChats().find(e=>`${e.platform}:${e.platform_user_id?'id:'+e.platform_user_id:'name:'+String(e.username).toLowerCase()}`===item.account);
  if(!first||Date.parse(first.timestamp)>Date.parse(item.timestamp)||Date.parse(first.timestamp)<Date.parse(item.sessionId.slice(10)))throw new Error('Choose a first recorded chatter in this broadcast and a later acknowledgement.');
  const previous=next.welcomes.find(w=>w.account===item.account&&w.sessionId===item.sessionId);
  next.welcomes=next.welcomes.filter(w=>w!==previous).concat({id:previous?.id||randomUUID(),...item});if(next.welcomes.length>5000)throw new Error('Welcome limit reached.');
 }else if(input.type==='review'){
  const experimentId=text(input.experimentId,100),week=text(input.week,10),decision=text(input.decision,30);
  if(!next.experiments.some(e=>e.id===experimentId))throw new Error('Experiment not found.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(Date.parse(week))||new Date(week).toISOString().slice(0,10)!==week||Date.parse(week)>Date.now())throw new Error('Choose a valid review date.');
  if(!['keep','adjust','collect more','stop'].includes(decision))throw new Error('Choose a review decision.');
  next.reviews=next.reviews.filter(r=>r.experimentId!==experimentId||r.week!==week).concat({id:JSON.stringify([experimentId,week]),experimentId,week,decision,notes:text(input.notes,2000,false)});if(next.reviews.length>1000)throw new Error('Review limit reached.');
 }else if(input.type==='remove'){
  if(!['experiments','discovery','segments','welcomes','reviews'].includes(input.collection))throw new Error('Invalid collection.');
  next[input.collection]=next[input.collection].filter(e=>e.id!==input.id);
  if(input.collection==='experiments')next.reviews=next.reviews.filter(r=>r.experimentId!==input.id);
 }else throw new Error('Invalid growth note action.');
 next.revision++;setConfigValue(KEY,next);return next;
});
module.exports={read,save,discovery};
