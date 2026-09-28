const {randomUUID}=require('node:crypto');
const {db,getConfigValue,setConfigValue}=require('./db');
const KEY='analytics_growth_notes_v1';
const read=()=>getConfigValue(KEY,{revision:0,formats:{},experiments:[],discovery:[]});
function text(value,max,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new Error(`Text must be ${required?'1':'0'}–${max} characters.`);return value.trim();}
function ids(value){if(!Array.isArray(value)||value.length>50)throw new Error('Select up to 50 streams per group.');return [...new Set(value.map(v=>text(v,500)))];}
function discovery(row){
 const date=text(row.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Use a valid YYYY-MM-DD date.');
 if(!['twitch','youtube','tiktok'].includes(row.platform))throw new Error('Select a supported platform.');
 const source=text(row.source,100),visits=Number(row.visits);if(!Number.isSafeInteger(visits)||visits<0||String(row.visits).trim()==='')throw new Error('Visits must be a non-negative whole number.');
 const url=text(row.url??'',1000,false);if(url){const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Use an HTTP(S) link without credentials.');}
 return {id:JSON.stringify([date,row.platform,source.toLowerCase(),url]),date,platform:row.platform,source,visits,url,provenance:text(row.provenance,200)};
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
 }else if(input.type==='remove'){
  if(!['experiments','discovery'].includes(input.collection))throw new Error('Invalid collection.');
  next[input.collection]=next[input.collection].filter(e=>e.id!==input.id);
 }else throw new Error('Invalid growth note action.');
 next.revision++;setConfigValue(KEY,next);return next;
});
module.exports={read,save,discovery};
