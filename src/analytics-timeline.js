const {streamSignals}=require('./analytics-growth');
// Minute means are estimates of concurrent audience, never a sum of independent peaks.
const MINUTE = 60000;
const round = n => Math.round(n * 10) / 10;
const account = e => e.userId || e.username ? `${e.platform}:${e.userId ? 'id:'+e.userId : 'name:'+e.username.toLowerCase()}` : '';
const platformNames = ['twitch', 'youtube', 'tiktok'];
function buildStreamDetail(g, rows, snapshots, observations, isInteraction) {
  const platforms = [...new Set([...g.sessions, ...snapshots].map(e => e.platform).filter(p => platformNames.includes(p)))];
  const firstMinute = Math.floor(g.startMs / MINUTE);
  const minutes = new Map();
  const bucket = time => {
    const key = Math.floor(time / MINUTE);
    if (!minutes.has(key)) minutes.set(key, { minute: key, viewers: {}, weights: {}, chat: 0, interactions: 0, events: {} });
    return minutes.get(key);
  };
  for (const s of snapshots) {
    const b = bucket(s.timeMs), weight = s.sampleCount || 1;
    b.viewers[s.platform] = (b.viewers[s.platform] || 0) + s.viewerCount * weight;
    b.weights[s.platform] = (b.weights[s.platform] || 0) + weight;
  }
  for (const e of observations) if (e.eventType === 'chat_message') bucket(e.timeMs).chat += e.aggregateCount || 1;
  const markerLabels = { game_started: 'Game started', game_completed: 'Game completed', game_stopped: 'Game stopped', song_request: 'Song requested', raid_received: 'Raid', follow: 'Follow', subscription: 'Subscription', capture_completed: 'Polaroid' };
  for (const e of rows) {
    const b = bucket(e.timeMs);
    if (isInteraction(e)) b.interactions++;
    if (markerLabels[e.eventType]) {
      const label = e.eventType.startsWith('game_') ? `${e.tool === 'elimination_quiz' ? 'Quiz' : e.tool==='chat_games'?'Arcade':'Hill'}: ${markerLabels[e.eventType]}` : markerLabels[e.eventType];
      b.events[label] = (b.events[label] || 0) + 1;
    }
  }
  const raw = [...minutes.values()].sort((a,b) => a.minute-b.minute).map(b => {
    const viewers = Object.fromEntries(Object.entries(b.viewers).map(([p,n]) => [p,round(n/b.weights[p])]));
    return { minute: b.minute, elapsed: Math.max(0, b.minute-firstMinute), viewers, total: platforms.length && platforms.every(p => viewers[p] !== undefined) ? round(platforms.reduce((n,p)=>n+viewers[p],0)) : null, chat:b.chat, interactions:b.interactions, events:b.events };
  });
  const totals = raw.filter(b => b.total !== null);
  // Bound browser payloads for very long sessions without altering the minute peak.
  const span = Math.floor(g.endMs / MINUTE)-firstMinute+1;
  const bucketMinutes = Math.max(1, Math.ceil(span/720));
  const grouped = new Map();
  for (const b of raw) {
    const k = Math.floor(b.elapsed/bucketMinutes);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(b);
  }
  const points = [...grouped].map(([k,list]) => {
    const start = firstMinute+k*bucketMinutes, count = Math.min(bucketMinutes, span-k*bucketMinutes);
    const viewers = {};
    for (const p of platforms) {
      const values=list.filter(b=>b.viewers[p] !== undefined);
      // Missing minutes stay missing even after downsampling.
      viewers[p]=values.length===count ? round(values.reduce((n,b)=>n+b.viewers[p],0)/count) : null;
    }
    const complete=list.filter(b=>b.total!==null);
    const events={};for(const b of list)for(const [label,n] of Object.entries(b.events))events[label]=(events[label]||0)+n;
    return {elapsed:k*bucketMinutes,timestamp:new Date(Math.max(g.startMs,start*MINUTE)).toISOString(),viewers,total:complete.length===count?round(complete.reduce((n,b)=>n+b.total,0)/count):null,chat:round(list.reduce((n,b)=>n+b.chat,0)/count),interactions:round(list.reduce((n,b)=>n+b.interactions,0)/count),events};
  });
  const segments=[];
  const games=new Map();
  for(const e of rows.filter(e=>['elimination_quiz','king_of_the_hill','chat_games'].includes(e.tool)&&e.correlationId).sort((a,b)=>a.timeMs-b.timeMs)){
    const key=`${e.tool}:${e.correlationId}`;
    if(e.eventType==='game_started')games.set(key,e);
    if(['game_completed','game_stopped'].includes(e.eventType)&&games.has(key)){
      const start=games.get(key);games.delete(key);
      const from=Math.ceil(start.timeMs/MINUTE),to=Math.floor(e.timeMs/MINUTE);
      const values=totals.filter(b=>b.minute>=from&&b.minute<to);
      const expected=Math.max(0,to-from);
      const full=expected>0&&values.length===expected;
      segments.push({tool:e.tool,startedAt:start.timestamp,endedAt:e.timestamp,elapsed:round((start.timeMs-g.startMs)/MINUTE),durationMinutes:round((e.timeMs-start.timeMs)/MINUTE),samples:values.length,coveragePercent:expected?round(values.length/expected*100):null,averageViewers:full?round(values.reduce((n,b)=>n+b.total,0)/values.length):null,change:full&&values.length>=2?round(values.at(-1).total-values[0].total):null});
    }
  }
  const participants=[...new Set([...rows.filter(isInteraction),...observations.filter(e=>e.eventType==='chat_message')].map(account).filter(Boolean))];
  const hours=(g.endMs-g.startMs)/3600000;
  const rate=type => g.source==='platform'&&!g.estimatedEnd&&hours>0 ? round(rows.filter(e=>e.eventType===type).length/hours) : null;
  return {_coaching:{raw,events:[...rows.filter(isInteraction),...observations.filter(e=>e.eventType==='chat_message')]},growth:streamSignals(g,raw,rows,observations),platforms,bucketMinutes,points,peakConcurrentViewers:totals.length?Math.max(...totals.map(b=>b.total)):null,coveragePercent:round(totals.length/span*100),platformCoverage:platforms.map(platform=>({platform,percent:round(raw.filter(b=>b.viewers[platform]!==undefined).length/span*100)})),segments,followsPerHour:rate('follow'),subscriptionsPerHour:rate('subscription'),observedParticipants:participants.length,_participants:participants};
}
function addReturningParticipants(sessions) {
  const seen=new Set();let recorded=0;
  for(const s of [...sessions].sort((a,b)=>a.startedAt.localeCompare(b.startedAt))){
    const d=s.detail,people=d._participants;delete d._participants;
    d.returningParticipants=s.source==='platform'&&recorded?people.filter(p=>seen.has(p)).length:null;
    d.returningPercent=d.returningParticipants!==null&&people.length?round(d.returningParticipants/people.length*100):null;
    if(s.source==='platform'){people.forEach(p=>seen.add(p));recorded++;}
  }
  return sessions;
}
module.exports={buildStreamDetail,addReturningParticipants};
