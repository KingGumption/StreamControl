const rate=(n,d)=>d?Math.round(n/d*1000)/10:null;
const mean=a=>a.length?Math.round(a.reduce((n,v)=>n+v,0)/a.length):null;
const person=e=>`${e.platform}:${e.userId || String(e.username).toLowerCase()}`;
const run=e=>`${e.correlationId}:${person(e)}`;
const roundKey=e=>`${e.correlationId}:${e.metadata.round}`;
const empty=()=>({correct:0,wrong:0,missed:0,eliminated:0,times:[]});
function quizDetails(events,context){
  const rounds=new Map(),questions=new Map(),difficulty=new Map(),players=new Map();
  for(const e of context){
    if(!e.correlationId || !(Number(e.metadata.round)>0))continue;
    const key=roundKey(e);
    if(!rounds.has(key))rounds.set(key,{...empty(),gameId:e.correlationId,round:Number(e.metadata.round),questionId:null,text:null,category:null,difficulty:null,startedAt:null,completedAt:null,options:[],answerCounts:[],correctAnswer:null});
    const r=rounds.get(key);
    r.questionId ||= e.metadata.questionId || null;r.category ||= e.metadata.category || null;
    if(Number.isFinite(e.metadata.difficulty))r.difficulty=e.metadata.difficulty;
    if(e.eventType==='question_started'){r.text=e.metadata.questionText || null;r.image=e.metadata.questionImage || null;r.startedAt=e.timestamp;r.options=e.metadata.options || [];}
    if(e.eventType==='round_completed'){r.completedAt=e.timestamp;r.answerCounts=e.metadata.answerCounts || [];r.correctAnswer=e.metadata.correctAnswer ?? null;}
  }
  const joined=new Set(),answeredRuns=new Set(),allTimes=[];
  for(const e of events){
    const r=rounds.get(roundKey(e));
    if(e.eventType==='player_joined' && e.correlationId)joined.add(run(e));
    if(!e.userId && !e.username)continue;
    const key=person(e);
    if(!players.has(key))players.set(key,{username:e.username,platform:e.platform,...empty(),rounds:0,wins:0,runs:new Set()});
    const p=players.get(key);
    if(e.correlationId)p.runs.add(e.correlationId);
    if(e.eventType==='player_won')p.wins++;
    if(e.eventType==='answer_submitted'){
      answeredRuns.add(run(e));const ms=e.metadata.responseMs;
      if(Number.isFinite(ms)&&ms>=0&&ms<=120000){allTimes.push(ms);p.times.push(ms);r?.times.push(ms);}
    }
    if(e.eventType==='answer_result'){
      const field=e.metadata.correct===true?'correct':e.metadata.missed===true?'missed':'wrong';
      p[field]++;p.rounds=Math.max(p.rounds,Number(e.metadata.round)||0);if(r)r[field]++;
    }
    if(e.eventType==='player_eliminated'){p.eliminated++;if(r)r.eliminated++;}
  }
  const byRound=new Map();
  for(const r of rounds.values()){
    const responses=r.correct+r.wrong+r.missed;
    if(responses || r.eliminated){
      if(!byRound.has(r.round))byRound.set(r.round,{round:r.round,...empty(),games:0});
      const row=byRound.get(r.round);row.games++;for(const f of ['correct','wrong','missed','eliminated'])row[f]+=r[f];row.times.push(...r.times);
      const d=r.difficulty ?? 'unknown';if(!difficulty.has(d))difficulty.set(d,{difficulty:d,...empty(),rounds:0});
      const level=difficulty.get(d);level.rounds++;for(const f of ['correct','wrong','missed','eliminated'])level[f]+=r[f];
    }
    if(r.questionId){
      if(!questions.has(r.questionId))questions.set(r.questionId,{questionId:r.questionId,text:r.text,image:r.image,category:r.category,difficulty:r.difficulty,...empty(),timesAsked:0});
      const q=questions.get(r.questionId);q.text ||= r.text;q.image ||= r.image;
      q.timesAsked++;for(const f of ['correct','wrong','missed','eliminated'])q[f]+=r[f];q.times.push(...r.times);
    }
  }
  const finish=o=>{const {times,...rest}=o;const responses=o.correct+o.wrong+o.missed;return {...rest,responses,accuracy:rate(o.correct,o.correct+o.wrong),responseRate:rate(o.correct+o.wrong,responses),averageResponseMs:mean(times||[]),timedAnswers:times?.length||0};};
  const sortedTimes=allTimes.slice().sort((a,b)=>a-b),mid=Math.floor(sortedTimes.length/2);
  const median=sortedTimes.length?(sortedTimes.length%2?sortedTimes[mid]:Math.round((sortedTimes[mid-1]+sortedTimes[mid])/2)):null;
  const completedIds=new Set(context.filter(e=>e.eventType==='game_completed').map(e=>e.correlationId));
  return {
    joinToAnswerRate:rate([...joined].filter(k=>answeredRuns.has(k)).length,joined.size),joinsWithAnswers:[...joined].filter(k=>answeredRuns.has(k)).length,
    averageResponseMs:mean(allTimes),medianResponseMs:median,timedAnswers:allTimes.length,
    questionCoverage:{identifiedRounds:[...rounds.values()].filter(r=>r.questionId).length,totalRounds:rounds.size,uniqueQuestions:questions.size},
    roundPerformance:[...byRound.values()].sort((a,b)=>a.round-b.round).map(r=>({...finish(r),standing:r.correct+r.wrong+r.missed>=r.eliminated?r.correct+r.wrong+r.missed-r.eliminated:null})),
    difficultyPerformance:[...difficulty.values()].sort((a,b)=>String(a.difficulty).localeCompare(String(b.difficulty),undefined,{numeric:true})).map(finish),
    questionPerformance:[...questions.values()].map(finish).sort((a,b)=>b.wrong+b.missed-a.wrong-a.missed||b.responses-a.responses),
    playerPerformance:[...players.values()].map(p=>{const {runs,...row}=p;const completedRuns=[...runs].filter(id=>completedIds.has(id)).length;return {...finish(row),completedRuns,winRate:rate(p.wins,completedRuns)};}).sort((a,b)=>b.wins-a.wins||b.correct-a.correct).slice(0,25),
    gameRounds:[...rounds.values()].map(finish),
  };
}
module.exports={quizDetails};
