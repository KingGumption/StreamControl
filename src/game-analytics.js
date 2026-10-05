const {gameNames:arcadeNames}=require('./arcade-analytics');
const gameNames={quiz:'Elimination Quiz',hill:'King of the Hill',...arcadeNames};
const MINUTE=60000;
const round=n=>Math.round(n*10)/10;
const mean=xs=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
const gameKey=e=>e.tool==='elimination_quiz'?'quiz':e.tool==='king_of_the_hill'?'hill':e.tool==='chat_games'&&arcadeNames[e.metadata?.game]?e.metadata.game:null;
const account=e=>e.userId||e.username?`${e.platform}:${e.userId?'id:'+e.userId:'name:'+e.username.toLowerCase()}`:null;
const response=e=>gameKey(e)&&['vote','answer_submitted'].includes(e.eventType);
const participant=e=>response(e)||(gameKey(e)==='quiz'&&e.eventType==='player_joined');

// Compare aligned whole minutes only. Never fill gaps or cross stream boundaries.
function enrichGameSegments(segments,raw,session,events){
 const measured=raw.filter(p=>p.total!==null),peak=measured.length?Math.max(...measured.map(p=>p.total)):null;
 const varies=measured.length>1&&measured.some(p=>p.total!==peak);
 const minuteMap=new Map(raw.map(p=>[p.minute,p]));
 function window(from,to){
  const expected=Math.max(0,to-from),inside=from>=Math.ceil(session.startMs/MINUTE)&&to<=Math.floor(session.endMs/MINUTE);
  const rows=[];for(let m=from;m<to;m++){const p=minuteMap.get(m);if(p?.total!==null&&p?.total!==undefined)rows.push(p);}
  const full=inside&&expected>0&&rows.length===expected;
  return {average:full?mean(rows.map(p=>p.total)):null,coverage:expected?round(rows.length/expected*100):null,samples:rows.length,expected,inside,rows};
 }
 return segments.map(s=>{
  const start=Date.parse(s.startedAt),end=Date.parse(s.endedAt);
  const before=window(Math.floor(start/MINUTE)-5,Math.floor(start/MINUTE));
  const during=window(Math.ceil(start/MINUTE),Math.floor(end/MINUTE));
  const after=window(Math.ceil(end/MINUTE),Math.ceil(end/MINUTE)+5);
  const nearbyRaid=events.some(e=>e.eventType==='raid_received'&&e.timeMs>=start-5*MINUTE&&e.timeMs<end+5*MINUTE);
  const overlaps=segments.some(other=>other!==s&&Date.parse(other.startedAt)<end+5*MINUTE&&Date.parse(other.endedAt)>start-5*MINUTE)||events.some(e=>e.correlationId!==s.gameId&&['game_started','game_completed','game_stopped'].includes(e.eventType)&&e.timeMs>=start-5*MINUTE&&e.timeMs<end+5*MINUTE);
  const delta=before.average!==null&&during.average!==null?round(during.average-before.average):null;
  const observedPeak=during.rows.length?Math.max(...during.rows.map(p=>p.total)):null;
  const peakMinute=during.rows.find(p=>p.total===observedPeak)?.minute;
  return {...s,beforeViewers:before.average,afterViewers:after.average,averageViewers:during.average,coveragePercent:during.coverage,beforeCoverage:before.coverage,afterCoverage:after.coverage,observedPeak,peakAt:peakMinute===undefined?null:new Date(peakMinute*MINUTE).toISOString(),viewerLift:delta,viewerLiftPercent:delta!==null&&before.average>0?round(delta/before.average*100):null,afterChange:after.average!==null&&before.average!==null?round(after.average-before.average):null,streamPeakDuring:during.average!==null&&varies?during.rows.some(p=>p.total===peak):null,recordedStream:session.source==='platform',flags:[...(session.source!=='platform'?['Activity-estimated stream']:[]),...(session.estimatedEnd?['Stream end estimated']:[]),...(!during.expected?['Too short for a whole minute']:[]),...(during.average===null?['Incomplete during-game coverage']:[]),...(before.average===null?['Five-minute baseline unavailable']:[]),...(after.average===null?['Five-minute follow-up unavailable']:[]),...(nearbyRaid?['Nearby raid']:[]),...(overlaps?['Other game in comparison window']:[])],cleanComparison:session.source==='platform'&&delta!==null&&!nearbyRaid&&!overlaps};
 });
}

function buildGamesAnalytics(context,playerEvents,sessions){
 const grouped=new Map(),playersByRun=new Map();
 for(const e of context){const key=gameKey(e);if(!key||!e.correlationId)continue;const id=key+':'+e.correlationId;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(e);}
 for(const e of playerEvents.filter(participant)){const key=gameKey(e),id=key+':'+e.correlationId;if(!playersByRun.has(id))playersByRun.set(id,[]);playersByRun.get(id).push(e);}
 const segments=sessions.flatMap(s=>(s.detail?.segments||[]).map(g=>({...g,sessionId:s.id,sessionTitle:s.title||s.startedAt,streamCoverage:s.detail.coveragePercent})));
 return {games:Object.entries(gameNames).map(([key,name])=>{
  const all=context.filter(e=>gameKey(e)===key),pEvents=playerEvents.filter(e=>gameKey(e)===key&&participant(e)),responses=pEvents.filter(response);
  const people=new Map();for(const e of pEvents){const id=account(e);if(!id)continue;if(!people.has(id))people.set(id,{username:e.username,platform:e.platform,games:new Set(),responses:0});const p=people.get(id);p.games.add(e.correlationId);if(response(e))p.responses++;}
  const runs=[...grouped].filter(([id])=>id.startsWith(key+':')).map(([id,rows])=>{
   rows.sort((a,b)=>a.timeMs-b.timeMs);const start=rows.find(e=>e.eventType==='game_started'),complete=rows.find(e=>e.eventType==='game_completed'),end=complete||rows.find(e=>e.eventType==='game_stopped'),last=end||rows.at(-1);
   const rounds=rows.filter(e=>key==='hill'?e.eventType==='phase_completed'&&e.metadata.phase==='battle':key==='quiz'?e.eventType==='round_completed':['round_completed','game_completed'].includes(e.eventType));
   const pp=playersByRun.get(id)||[],tracked=!arcadeNames[key]||rows.some(e=>e.metadata.schemaVersion===2);
   const durationSeconds=end&&Number.isFinite(end.metadata.durationMs)?round(end.metadata.durationMs/1000):start&&end?round((end.timeMs-start.timeMs)/1000):null;
   const outcome=end?.metadata.outcome||(complete&&key==='hill'?complete.metadata.champion?.title:null)||null;
   return {id,gameId:rows[0].correlationId,game:key,name,startedAt:start?.timestamp||null,timestamp:last.timestamp,status:complete?'completed':end?'stopped':'no_recorded_end',outcome,players:tracked?new Set(pp.map(account).filter(Boolean)).size:null,responses:tracked?pp.filter(response).length:null,rounds:rounds.length,durationSeconds,result:last.metadata.result||complete?.metadata.champion?.title||outcome||'',legacy:!tracked};
  });
  const started=runs.filter(r=>r.startedAt),completed=runs.filter(r=>r.status==='completed'),finishedStarts=started.filter(r=>r.status==='completed');
  const windows=segments.filter(s=>s.game===key),paired=windows.filter(s=>s.recordedStream&&s.viewerLift!==null),clean=windows.filter(s=>s.cleanComparison),peaks=windows.filter(s=>s.recordedStream&&s.streamPeakDuring!==null);
  const platformCounts=new Map();for(const e of responses)platformCounts.set(e.platform,(platformCounts.get(e.platform)||0)+1);
  const outcomeCounts=new Map();for(const r of runs){const label=r.status==='stopped'?'Stopped':r.outcome||humanStatus(r.status);outcomeCounts.set(label,(outcomeCounts.get(label)||0)+1);}
  return {outcomes:[...outcomeCounts].map(([label,count])=>({label,count})),id:key,name,plays:runs.length,started:started.length,completed:completed.length,stopped:runs.filter(r=>r.status==='stopped').length,completionRate:started.length?round(finishedStarts.length/started.length*100):null,uniquePlayers:people.size,repeatPlayers:[...people.values()].filter(p=>p.games.size>1).length,responses:responses.length,averageDuration:mean(runs.map(r=>r.durationSeconds).filter(Number.isFinite)),averageRounds:mean(completed.map(r=>r.rounds)),rounds:all.filter(e=>key==='hill'?e.eventType==='phase_completed'&&e.metadata.phase==='battle':key==='quiz'?e.eventType==='round_completed':['round_completed','game_completed'].includes(e.eventType)).length,legacyGames:runs.filter(r=>r.legacy).length,platforms:[...platformCounts].map(([label,count])=>({label,count})),players:[...people.values()].map(p=>({...p,games:p.games.size})).sort((a,b)=>b.responses-a.responses).slice(0,25),history:runs.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,50),viewership:{runs:windows.length,pairedRuns:paired.length,cleanRuns:clean.length,meanLift:mean(clean.map(s=>s.viewerLift)),meanLiftPercent:mean(clean.map(s=>s.viewerLiftPercent).filter(Number.isFinite)),meanBefore:mean(clean.map(s=>s.beforeViewers)),meanDuring:mean(clean.map(s=>s.averageViewers)),peakRuns:peaks.filter(s=>s.streamPeakDuring).length,peakEligible:peaks.length,peakRate:peaks.length?round(peaks.filter(s=>s.streamPeakDuring).length/peaks.length*100):null,history:windows.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,50)}};
 })};
}
function humanStatus(status){return status==='completed'?'Completed · outcome unavailable':'No recorded end';}
module.exports={gameNames,gameKey,enrichGameSegments,buildGamesAnalytics};
