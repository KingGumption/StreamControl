// Receives normalized, range-filtered events. Viewer measures stay platform-filtered;
// lifecycle events provide shared game context for participating platforms.
function summarizeQuiz(events, context = events) {
  const playerKey = e => `${e.platform}:${e.userId || String(e.username).toLowerCase()}`;
  const select = type => events.filter(e => e.eventType === type);
  const lifecycle = type => context.filter(e => e.eventType === type);
  const joins = select('player_joined'), results = select('answer_result'), wins = select('player_won');
  const starts = lifecycle('game_started'), ends = lifecycle('game_completed');
  const rate = (a,b) => b ? Math.round(a / b * 1000) / 10 : null;
  const players = new Map(), categories = new Map(), games = new Map();
  for (const e of context.slice().sort((a,b)=>a.timeMs-b.timeMs)) {
    if (!e.correlationId) continue;
    if (!games.has(e.correlationId)) games.set(e.correlationId, { gameId:e.correlationId, timestamp:e.timestamp, startedAt:null, endedAt:null, players:null, rounds:0, outcome:'Unfinished / unknown', winners:[] });
    const g = games.get(e.correlationId);
    g.timestamp = e.timestamp;
    g.rounds = Math.max(g.rounds, Number(e.metadata.round)||0);
    if(e.eventType==='game_started'){g.startedAt=e.timestamp;g.players=e.metadata.players ?? null;}
    if(e.eventType==='game_completed'){g.endedAt=e.timestamp;g.outcome=e.metadata.outcome || 'Completed';g.players=e.metadata.players ?? g.players;}
    if(e.eventType==='game_stopped'){g.endedAt=e.timestamp;g.outcome='Stopped';}
    if(e.eventType==='player_won')g.winners.push(e.username);
  }
  for(const e of events.slice().sort((a,b)=>a.timeMs-b.timeMs)) {
    if(!e.userId && !e.username)continue;
    const key=playerKey(e);
    if(!players.has(key))players.set(key,{username:e.username,platform:e.platform,games:new Set(),answers:0,correct:0,missed:0,wins:0,bestRun:0});
    const p=players.get(key);p.username=e.username||p.username;
    if(e.eventType==='player_joined' && e.correlationId)p.games.add(e.correlationId);
    if(e.eventType==='answer_submitted')p.answers++;
    if(e.eventType==='player_won'){p.wins++;p.bestRun=Math.max(p.bestRun,Number(e.metadata.correctAnswers)||0);}
    if(e.eventType==='answer_result'){
      p.correct+=Number(e.metadata.correct===true);p.missed+=Number(e.metadata.missed===true);
      const key=e.metadata.category||'unknown';
      if(!categories.has(key))categories.set(key,{key,results:0,correct:0,wrong:0,missed:0});
      const c=categories.get(key);c.results++;
      if(e.metadata.correct===true)c.correct++;else if(e.metadata.missed===true)c.missed++;else c.wrong++;
    }
  }
  const joined = new Set(joins.map(playerKey));
  const repeatPlayers=[...players.values()].filter(p=>p.games.size>1).length;
  const correct=results.filter(e=>e.metadata.correct===true).length;
  const missed=results.filter(e=>e.metadata.missed===true).length;
  const startedIds=new Set(starts.map(e=>e.correlationId).filter(Boolean));
  const finishedIds=new Set(ends.map(e=>e.correlationId).filter(Boolean));
  const completedStarts=[...startedIds].filter(id=>finishedIds.has(id)).length;
  return {
    gamesStarted:starts.length,gamesCompleted:ends.length,gamesStopped:lifecycle('game_stopped').length,
    victories:ends.filter(e=>e.metadata.outcome==='victory').length,defeats:ends.filter(e=>e.metadata.outcome==='defeat').length,
    completionRate:rate(completedStarts,startedIds.size),joins:joins.length,answers:select('answer_submitted').length,
    uniquePlayers:new Set([...joins,...select('answer_submitted')].map(playerKey)).size,repeatPlayers,repeatPlayerRate:rate(repeatPlayers,joined.size),
    eliminations:select('player_eliminated').length,winners:wins.length,rounds:lifecycle('round_completed').length,
    correctAnswers:correct,wrongAnswers:results.length-correct-missed,missedAnswers:missed,
    accuracy:rate(correct,results.length-missed),responseRate:rate(results.length-missed,results.length),
    suddenDeathRounds:lifecycle('round_completed').filter(e=>e.metadata.suddenDeath===true).length,
    averagePlayers:starts.length?Math.round(starts.reduce((n,e)=>n+(Number(e.metadata.players)||0),0)/starts.length*10)/10:null,
    categories:[...categories.values()].map(c=>({...c,accuracy:rate(c.correct,c.correct+c.wrong)})).sort((a,b)=>b.results-a.results),
    leaderboard:[...players.values()].map(p=>({...p,games:p.games.size})).sort((a,b)=>b.wins-a.wins||b.correct-a.correct||a.username.localeCompare(b.username)).slice(0,25),
    recentGames:[...games.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,30),
  };
}
module.exports={summarizeQuiz};
