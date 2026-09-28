const DAY=86400000;
const round=n=>Math.round(n*10)/10;
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?round((v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2):null;};
const key=e=>`${e.platform}:${e.userId?'id:'+e.userId:'name:'+String(e.username).toLowerCase()}`;
// Use full minute windows, never interpolate across a missing platform measurement.
function windowMean(raw,from,to,platform=null){
 const start=Math.ceil(from/60000),end=Math.floor(to/60000),expected=end-start;
 const rows=raw.filter(b=>b.minute>=start&&b.minute<end);
 const values=rows.map(b=>platform?b.viewers[platform]:b.total).filter(v=>v!==null&&v!==undefined);
 return {value:expected>0&&values.length===expected?round(values.reduce((n,v)=>n+v,0)/expected):null,coverage:expected>0?round(values.length/expected*100):null};
}
function streamSignals(g,raw,rows,observations){
 const complete=g.source==='platform'&&!g.estimatedEnd&&g.sessions.every(s=>s.startMs>=g.startMs);
 const opening=g.endMs-g.startMs>=15*60000&&complete;
 const first=opening?windowMean(raw,g.startMs,g.startMs+5*60000):{value:null};
 const last=opening?windowMean(raw,g.startMs+10*60000,g.startMs+15*60000):{value:null};
 const people=new Set(observations.filter(e=>e.eventType==='chat_message'&&e.timeMs<g.startMs+15*60000).map(key));
 const raids=rows.filter(e=>e.eventType==='raid_received').map(e=>{
  const before=e.timeMs-5*60000>=g.startMs?windowMean(raw,e.timeMs-5*60000,e.timeMs,e.platform):{value:null};
  const after=minute=>{const from=e.timeMs+(minute-5)*60000,to=e.timeMs+minute*60000;return to<=g.endMs?windowMean(raw,from,to,e.platform):{value:null};};
  const ten=after(10),thirty=after(30);
  const overlapping=rows.some(other=>other!==e&&other.eventType==='raid_received'&&other.platform===e.platform&&other.timeMs>=e.timeMs-5*60000&&other.timeMs<e.timeMs+30*60000);
  return {timestamp:e.timestamp,platform:e.platform,baseline:before.value,after10:ten.value,after30:thirty.value,lift10:before.value!==null&&ten.value!==null?round(ten.value-before.value):null,lift30:before.value!==null&&thirty.value!==null?round(thirty.value-before.value):null,overlapping};
 });
 return {fullStream:complete,opening:{first5:first.value,last5:last.value,change:first.value!==null&&last.value!==null?round(last.value-first.value):null,chatters:opening?people.size:null},raids};
}
function cohorts(history,sessions,{since,now,platform}){
 const valid=sessions.filter(s=>s.endMs&&s.endMs<=now&&!s.metadata?.isTest&&!s.metadata?.testMode);
 const windows=new Map();
 for(const p of ['twitch','youtube','tiktok']){
  const merged=[];
  for(const s of valid.filter(s=>s.platform===p||s.platform==='obs').sort((a,b)=>a.startMs-b.startMs)){
   const last=merged.at(-1);
   if(last&&s.startMs<last.endMs)last.endMs=Math.max(last.endMs,s.endMs);
   else merged.push({id:`${p}:${s.startMs}`,startMs:s.startMs,endMs:s.endMs});
  }
  windows.set(p,merged);
 }
 const groups=new Map();
 for(const e of history){if(!['twitch','youtube','tiktok'].includes(e.platform)||(platform!=='all'&&platform!==e.platform)||(!e.userId&&!e.username)||e.timeMs>now)continue;
  const candidates=windows.get(e.platform);let lo=0,hi=candidates.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(candidates[mid].startMs<=e.timeMs)lo=mid+1;else hi=mid;}
  const s=candidates[lo-1];if(!s||e.timeMs>=s.endMs)continue;
  const k=key(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push({time:e.timeMs,stream:s.id,start:s.startMs});
 }
 const eligible=[];for(const observations of groups.values()){
  observations.sort((a,b)=>a.time-b.time);const first=observations[0];if(first.time<since)continue;
  eligible.push({first,observations});
 }
 return [7,30].map(days=>{
  let matured=0,returned=0,pending=0;
  for(const {first,observations} of eligible){const deadline=(Math.floor(first.time/DAY)+days+1)*DAY;
   if(now<deadline){pending++;continue;}matured++;
   if(observations.some(o=>o.stream!==first.stream&&o.start>first.start&&o.time<deadline))returned++;
  }
  return {days,matured,returned,pending,rate:matured?round(returned/matured*100):null};
 });
}
function summarizeGroup(label,sessions){return {label,streams:sessions.length,samples:{medianOpeningChange:sessions.filter(s=>s.detail.growth.opening.change!==null).length,medianFollowsPerHour:sessions.filter(s=>s.detail.followsPerHour!==null).length,medianReturningPercent:sessions.filter(s=>s.detail.returningPercent!==null).length},measured:sessions.filter(s=>s.detail.growth.opening.change!==null).length,medianOpeningChange:median(sessions.map(s=>s.detail.growth.opening.change)),medianFollowsPerHour:median(sessions.map(s=>s.detail.followsPerHour)),medianReturningPercent:median(sessions.map(s=>s.detail.returningPercent))};}
function buildGrowth({sessions,history,streamSessions,since,now,platform,notes}){
 // Annotation IDs come from full broadcast windows, so labels survive platform/range filters.
 const broadcasts=[];
 for(const s of streamSessions.filter(s=>s.endMs&&s.endMs<=now&&!s.metadata?.isTest&&!s.metadata?.testMode).sort((a,b)=>a.startMs-b.startMs)){
  const previous=broadcasts.at(-1);
  if(previous&&s.startMs<previous.endMs)previous.endMs=Math.max(previous.endMs,s.endMs);
  else broadcasts.push({startMs:s.startMs,endMs:s.endMs});
 }
 for(const s of sessions){
  const start=Date.parse(s.startedAt),window=broadcasts.find(b=>start>=b.startMs&&start<b.endMs);
  const lifecycle=streamSessions.filter(r=>s.sessionIds?.includes(r.id)&&r.startMs<=start&&start-r.startMs<=4*3600000&&!r.metadata?.isTest&&!r.metadata?.testMode);
  s.growthId=window?'broadcast:'+new Date(window.startMs).toISOString():lifecycle.length?'broadcast:'+new Date(Math.min(...lifecycle.map(r=>r.startMs))).toISOString():s.id;
 }
 const recorded=sessions.filter(s=>s.source==='platform'&&!s.estimatedEnd&&s.detail.growth.fullStream);
 const schedule=new Map(),formats=new Map();
 for(const s of recorded){
  const d=new Date(s.startedAt),slot=`${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]} ${String(Math.floor(d.getUTCHours()/4)*4).padStart(2,'0')}:00–${String(Math.floor(d.getUTCHours()/4)*4+4).padStart(2,'0')}:00 UTC`;
  const format=notes.formats[s.growthId]||s.category||'Unlabelled';
  for(const [map,label] of [[schedule,slot],[formats,format]]){if(!map.has(label))map.set(label,[]);map.get(label).push(s);}
 }
 const group=map=>[...map].map(([label,items])=>summarizeGroup(label,items)).sort((a,b)=>b.streams-a.streams||a.label.localeCompare(b.label));
 const experiments=notes.experiments.map(e=>{const select=ids=>recorded.filter(s=>ids.includes(s.growthId));const baseline=select(e.baseline),trial=select(e.trial);return {...e,baselineSummary:summarizeGroup('Baseline',baseline),trialSummary:summarizeGroup('Trial',trial),missingStreams:e.baseline.length+e.trial.length-baseline.length-trial.length};});
 const discovery=notes.discovery.filter(e=>Date.parse(e.date+'T23:59:59Z')>=since&&Date.parse(e.date+'T00:00:00Z')<=now&&(platform==='all'||e.platform===platform));
 return {cohorts:cohorts(history,streamSessions,{since,now,platform}),schedule:group(schedule),formats:group(formats),experiments,discovery};
}
module.exports={streamSignals,buildGrowth,cohorts,windowMean};
