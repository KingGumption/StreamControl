const GAP = 4 * 60 * 60 * 1000;
const SAMPLE_GAP = 5 * 60 * 1000;
const round = n => Math.round(n * 10) / 10;
const iso = n => new Date(n).toISOString();
const person = e => e.userId || e.username ? `${e.platform}:${e.userId || e.username.toLowerCase()}` : '';

// Read-only reconstruction: missing lifecycle records never erase activity or
// cause an unclosed session to claim every subsequent broadcast.
function buildRoundups({ sessions, snapshots, activity, observations = [], sinceMs, nowMs, isInteraction }) {
  const evidence = [...activity, ...observations, ...snapshots];
  const windows = [];
  for (const s of sessions.slice().sort((a,b)=>a.startMs-b.startMs)) {
    if (s.metadata?.isTest || s.metadata?.testMode) continue;
    const next = sessions.filter(n=>n.platform===s.platform && n.startMs>s.startMs).sort((a,b)=>a.startMs-b.startMs)[0];
    const end = Math.min(s.endMs ?? next?.startMs ?? nowMs, nowMs);
    const points = evidence.filter(e=>e.timeMs>=s.startMs && e.timeMs<=(s.endMs ? end : end-1) && (e.platform===s.platform || s.platform==='obs' || e.sessionId===s.id)).sort((a,b)=>a.timeMs-b.timeMs);
    if (s.endMs) {
      if(end>=sinceMs)windows.push({startMs:Math.max(s.startMs,sinceMs),endMs:end,sessions:[s],source:'platform',status:'Ended'});
    } else {
      const clusters=[];
      for(const p of points){let c=clusters.at(-1);if(!c || p.timeMs-c.endMs>GAP){c={startMs:p.timeMs,endMs:p.timeMs};clusters.push(c);}c.endMs=p.timeMs;}
      if(!clusters.length && s.startMs>=sinceMs)clusters.push({startMs:s.startMs,endMs:s.startMs});
      clusters.forEach((c,i)=>{
        // A recent start is evidence, not proof of an ongoing broadcast.
        const last=i===clusters.length-1;
        const recent=last && !next && nowMs-c.endMs<=5*60000;
        windows.push({startMs:Math.max(i===0 && c.startMs-s.startMs<=GAP?s.startMs:c.startMs,sinceMs),endMs:c.endMs,sessions:[s],source:'platform',status:recent?'End not recorded · recent activity':'End not recorded',estimatedEnd:true});
      });
    }
  }
  // Merge overlapping platform/OBS intervals, never separate broadcasts merely
  // because they happened less than fifteen minutes apart.
  const groups=[];
  for(const w of windows.filter(w=>w.endMs>=w.startMs).sort((a,b)=>a.startMs-b.startMs)){
    const g=groups.at(-1);
    if(g && w.startMs<g.endMs){g.endMs=Math.max(g.endMs,w.endMs);g.sessions.push(...w.sessions);g.estimatedEnd ||= w.estimatedEnd;g.status=g.estimatedEnd?'End partly estimated':'Ended';}
    else groups.push({...w,sessions:[...w.sessions]});
  }
  const matches=(g,e)=>e.timeMs>=g.startMs && e.timeMs<=g.endMs && (g.sessions.some(s=>s.id===e.sessionId || s.platform===e.platform || s.platform==='obs') || ['admin','other'].includes(e.platform));
  const assigned=new Set(), assignedSamples=new Set();
  const output=groups.slice().reverse().map(g=>{
    const rows=activity.filter(e=>!assigned.has(e) && matches(g,e));rows.forEach(e=>assigned.add(e));
    const samples=snapshots.filter(e=>!assignedSamples.has(e) && matches(g,e));samples.forEach(e=>assignedSamples.add(e));
    return summarize(g,rows,samples,isInteraction);
  });
  // All uncovered activity remains visible, even with measured sessions present.
  const remaining=[...activity.filter(e=>!assigned.has(e)),...observations.filter(e=>!groups.some(g=>matches(g,e))),...snapshots.filter(e=>!groups.some(g=>matches(g,e)))].sort((a,b)=>a.timeMs-b.timeMs);
  const inferred=[], activitySet=new Set(activity), snapshotSet=new Set(snapshots);
  for(const e of remaining){let g=inferred.at(-1);if(!g || e.timeMs-g.endMs>GAP){g={startMs:e.timeMs,endMs:e.timeMs,sessions:[],source:'inferred',status:'Activity estimate',rows:[],samples:[]};inferred.push(g);}g.endMs=e.timeMs;if(activitySet.has(e))g.rows.push(e);if(snapshotSet.has(e))g.samples.push(e);}
  inferred.forEach(g=>output.push(summarize(g,g.rows,g.samples,isInteraction)));
  return output.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
}

function summarize(g, rows, snapshots, isInteraction) {
  const interactions=rows.filter(isInteraction);
  const count=tool=>interactions.filter(e=>e.tool===tool).length;
  const people=new Set(interactions.map(person).filter(Boolean));
  const platforms=[...new Set([...interactions,...snapshots].map(e=>e.platform).filter(p=>!['admin','obs','other'].includes(p)))];
  const stats=platforms.map(platform=>{
    const samples=snapshots.filter(e=>e.platform===platform).sort((a,b)=>a.timeMs-b.timeMs);
    let area=0,minutes=0;
    for(let i=1;i<samples.length;i++){const dt=samples[i].timeMs-samples[i-1].timeMs;if(dt>0 && dt<=SAMPLE_GAP){area+=(samples[i].viewerCount+samples[i-1].viewerCount)/2*dt/3600000;minutes+=dt/60000;}}
    const sampleCount=samples.reduce((n,s)=>n+(s.sampleCount||1),0);
    return {platform,samples:samples.length,average:sampleCount?samples.reduce((n,s)=>n+s.viewerCount*(s.sampleCount||1),0)/sampleCount:null,peak:samples.length?Math.max(...samples.map(s=>s.peakViewerCount ?? s.viewerCount)):null,end:samples.at(-1)?.viewerCount,area,minutes};
  }).filter(s=>s.samples);
  const measured=stats.length>0,peak=stats.reduce((n,s)=>n+s.peak,0),minutes=stats.reduce((n,s)=>n+s.minutes,0);
  const toolCounts={song_requests:count('song_requests'),king_of_the_hill:count('king_of_the_hill'),elimination_quiz:count('elimination_quiz'),polaroid:count('polaroid')};
  const labels={song_requests:'song interactions',king_of_the_hill:'Hill votes',elimination_quiz:'quiz interactions',polaroid:'Polaroids'};
  const top=Object.entries(toolCounts).sort((a,b)=>b[1]-a[1])[0];
  return {id:`${g.sessions.map(s=>s.id).join('|') || 'activity'}:${iso(g.startMs)}`,startedAt:iso(g.startMs),endedAt:iso(g.endMs),durationMinutes:round((g.endMs-g.startMs)/60000),source:g.source,status:g.status,estimatedEnd:Boolean(g.estimatedEnd),
    interactions:interactions.length,uniqueParticipants:people.size,songRequests:toolCounts.song_requests,hillVotes:toolCounts.king_of_the_hill,quizInteractions:toolCounts.elimination_quiz,polaroids:toolCounts.polaroid,toolCounts,
    platforms:platforms.length?platforms:[...new Set(g.sessions.map(s=>s.platform))],topPlatform:platforms[0]||g.sessions[0]?.platform||'other',standout:top[1]?`${top[1]} ${labels[top[0]]}`:'No tool interactions',title:g.sessions.find(s=>s.title)?.title||'',category:g.sessions.find(s=>s.category)?.category||'',
    peakViewers:measured?peak:null,averageViewers:measured?round(stats.reduce((n,s)=>n+s.average,0)):null,viewerHours:minutes?round(stats.reduce((n,s)=>n+s.area,0)):null,measuredPlatformMinutes:round(minutes),retentionPercent:measured&&peak?round(stats.reduce((n,s)=>n+s.end,0)/peak*100):null,viewerSamples:snapshots.reduce((n,s)=>n+(s.sampleCount||1),0),
    follows:rows.filter(e=>e.eventType==='follow').length,subscriptions:rows.filter(e=>e.eventType==='subscription').length,raids:rows.filter(e=>e.eventType==='raid_received').length,shares:rows.filter(e=>e.eventType==='share').length};
}
module.exports={buildRoundups};
