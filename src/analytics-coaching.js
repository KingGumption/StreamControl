const MINUTE = 60000;
const round = n => Math.round(n * 10) / 10;
const identity = e => e.userId || e.username ? `${e.platform}:${e.userId ? 'id:' + e.userId : 'name:' + e.username.toLowerCase()}` : '';
const median = values => { const a = values.filter(Number.isFinite).sort((a,b)=>a-b); return a.length ? round((a[(a.length-1)>>1]+a[a.length>>1])/2) : null; };

function telemetry(raw, platforms, start, end) {
  const from=Math.ceil(start/MINUTE), to=Math.floor(end/MINUTE), expected=Math.max(0,to-from);
  const byMinute=new Map(raw.map(b=>[b.minute,b]));
  return platforms.map(platform=>{
    let measured=0,run=null;const gaps=[];
    for(let m=from;m<to;m++){
      if(byMinute.get(m)?.viewers[platform]!=null){measured++;if(run!==null){gaps.push({timestamp:new Date(run*MINUTE).toISOString(),minutes:m-run});run=null;}}
      else if(run===null)run=m;
    }
    if(run!==null)gaps.push({timestamp:new Date(run*MINUTE).toISOString(),minutes:to-run});
    return {platform,expected,measured,coverage:expected?round(measured/expected*100):null,missing:expected-measured,longestGap:Math.max(0,...gaps.map(g=>g.minutes)),gapCount:gaps.length,gaps:gaps.slice(0,20)};
  });
}
function breadth(events) {
  const counts=new Map();
  for(const e of events){const id=identity(e);if(id)counts.set(id,(counts.get(id)||0)+(e.aggregateCount||1));}
  const values=[...counts.values()].sort((a,b)=>b-a),total=values.reduce((a,b)=>a+b,0);
  return {participants:counts.size,actions:total,topFiveShare:total?round(values.slice(0,5).reduce((a,b)=>a+b,0)/total*100):null,singleActionParticipants:values.filter(v=>v===1).length};
}
function clips(raw,start,end){
  // Require ten preceding recorded minutes. Zero activity is a recorded zero only
  // where viewer sampling establishes that at least one connection was observed.
  const map=new Map(raw.map(b=>[b.minute,b])), candidates=[];
  for(const b of raw){
    if(b.minute*MINUTE<start|| (b.minute+1)*MINUTE>end)continue;
    const prior=Array.from({length:10},(_,i)=>map.get(b.minute-10+i));
    if(!prior.every(p=>p&&Object.keys(p.viewers).length)||!Object.keys(b.viewers).length)continue;
    for(const metric of ['chat','interactions']){
      const baseline=median(prior.map(p=>p[metric]||0)),count=b[metric]||0;
      if(count>=5&&count>=3*Math.max(1,baseline))candidates.push({timestamp:new Date(b.minute*MINUTE).toISOString(),elapsed:round((b.minute*MINUTE-start)/MINUTE),metric,count,baseline,score:count/Math.max(1,baseline),context:Object.keys(b.events||{})});
    }
  }
  const selected=[];
  for(const c of candidates.sort((a,b)=>b.score-a.score||a.elapsed-b.elapsed))if(!selected.some(p=>Math.abs(p.elapsed-c.elapsed)<3))selected.push(c);
  return selected.slice(0,5).sort((a,b)=>a.elapsed-b.elapsed);
}
function contentSegments(markers,raw,events,start,end){
  const sorted=[...markers].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  return sorted.map((m,i)=>{
    const a=Date.parse(m.timestamp),b=sorted[i+1]?Date.parse(sorted[i+1].timestamp):end;
    const from=Math.max(start,a),to=Math.min(end,b),expected=Math.max(0,Math.floor(to/MINUTE)-Math.ceil(from/MINUTE));
    const values=raw.filter(p=>p.minute>=Math.ceil(from/MINUTE)&&p.minute<Math.floor(to/MINUTE)&&p.total!=null);
    const full=expected>0&&values.length===expected;
    return {...m,elapsed:round((from-start)/MINUTE),minutes:round((to-from)/MINUTE),continues:!sorted[i+1],coverage:expected?round(values.length/expected*100):null,average:full?round(values.reduce((n,p)=>n+p.total,0)/expected):null,change:full&&expected>=2?round(values.at(-1).total-values[0].total):null,participants:breadth(events.filter(e=>e.timeMs>=from&&e.timeMs<to)).participants};
  }).filter(s=>s.minutes>0);
}
function buildCoaching({sessions,firstChats,notes,now,growth}) {
  const first=new Map();for(const e of firstChats){const id=identity(e);if(id&&(!first.has(id)||e.timeMs<first.get(id).timeMs))first.set(id,e);}
  for(const s of sessions){
    const data=s.detail._coaching;delete s.detail._coaching;if(!data)continue;
    const {raw,events}=data,start=Date.parse(s.startedAt),end=Date.parse(s.endedAt);
    const markers=(notes.segments||[]).filter(m=>m.sessionId===s.growthId&&Date.parse(m.timestamp)<end).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    // Keep the last marker before a clipped report start as segment context.
    const before=markers.filter(m=>Date.parse(m.timestamp)<start).at(-1);
    const visible=markers.filter(m=>Date.parse(m.timestamp)>=start);if(before)visible.unshift(before);
    const segments=contentSegments(visible,raw,events,start,end);
    const welcomes=[...first].filter(([,e])=>e.timeMs>=start&&e.timeMs<end&&s.detail.platforms.includes(e.platform)).map(([account,e])=>{
      const ack=(notes.welcomes||[]).find(w=>w.account===account&&w.sessionId===s.growthId&&Date.parse(w.timestamp)>=e.timeMs&&Date.parse(w.timestamp)<=end);
      return {account,username:e.username||e.userId,platform:e.platform,firstAt:new Date(e.timeMs).toISOString(),acknowledgedAt:ack?.timestamp||null,delaySeconds:ack?round((Date.parse(ack.timestamp)-e.timeMs)/1000):null,id:ack?.id||null};
    });
    const health=telemetry(raw,s.detail.platforms,start,end),participation=breadth(events),candidates=clips(raw,start,end);
    const findings=[];
    const missing=health.reduce((n,h)=>n+h.missing,0);
    if(missing)findings.push({timestamp:s.startedAt,text:`${missing} platform-minutes lack viewer samples. Check collection before interpreting audience dips.`});
    if(candidates[0])findings.push({timestamp:candidates[0].timestamp,text:`${candidates[0].count} ${candidates[0].metric==='chat'?'chat messages':'tool interactions'} in a minute, versus ${candidates[0].baseline} median in the preceding ten minutes. Review this moment for a clip.`});
    const opening=s.detail.growth.opening;
    if(opening.change!=null)findings.push({timestamp:new Date(start+10*MINUTE).toISOString(),text:`Opening audience changed by ${opening.change>0?'+':''}${opening.change} viewers between the first five minutes and minutes 10–15.`});
    if(participation.actions)findings.push({timestamp:s.startedAt,text:`${participation.participants} accounts participated; the top five supplied ${participation.topFiveShare}% of recorded chat and tool actions.`});
    const experiment=missing?'Verify sampling through one full broadcast before comparing audience changes.':participation.participants>5&&participation.topFiveShare>70?'Test one open question early in the next three comparable streams; compare the number of participating accounts.':'Test one consistent opening segment across three comparable streams, then review opening audience change in Growth.';
    const complete=s.source==='platform'&&!s.estimatedEnd;
    s.detail.coaching={complete,segments,welcomes,welcomeSummary:{eligible:welcomes.length,acknowledged:welcomes.filter(w=>w.delaySeconds!==null).length,medianSeconds:median(welcomes.map(w=>w.delaySeconds))},health,participation,candidates,findings:findings.slice(0,3),experiment};
  }
  const weekStart=now-7*86400000;
  return {weekStart:new Date(weekStart).toISOString(),weekEnd:new Date(now).toISOString(),experiments:growth.experiments.map(e=>{
    const a=e.baselineSummary.samples[e.metric],b=e.trialSummary.samples[e.metric];
    const recent=sessions.filter(s=>[...e.baseline,...e.trial].includes(s.growthId)&&Date.parse(s.endedAt)>=weekStart&&Date.parse(s.endedAt)<=now&&s.source==='platform'&&!s.estimatedEnd).length;
    return {id:e.id,hypothesis:e.hypothesis,metric:e.metric,recentStreams:recent,baselineSamples:a,trialSamples:b,difference:a&&b?round(e.trialSummary[e.metric]-e.baselineSummary[e.metric]):null,status:e.missingStreams?'Expand filters or finish incomplete streams':Math.min(a,b)<3?'Collect at least three measured streams per group':'Ready for descriptive review; this does not establish causation',reviews:(notes.reviews||[]).filter(r=>r.experimentId===e.id).sort((a,b)=>b.week.localeCompare(a.week))};
  })};
}
module.exports={buildCoaching,telemetry,breadth,clips,contentSegments,identity};
