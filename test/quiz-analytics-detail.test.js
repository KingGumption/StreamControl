const test=require('node:test');
const assert=require('node:assert/strict');
const {buildAnalyticsReport}=require('../src/analytics');
const {QuizGame}=require('../src/quiz-game');

test('real game telemetry supports question analysis, timings, survival and win rates',()=>{
  let clock=Date.parse('2026-09-08T10:00:00Z');const events=[];
  const game=new QuizGame({now:()=>clock,schedule:()=>null,cancel:()=>{},recordEvent:e=>events.push({...e,timestamp:new Date(clock).toISOString()}),questions:[{id:'q1',text:'Example question?',category:'horror',difficulty:2,options:['Correct','Wrong','Other','Last'],answer:0}]});
  const chat=(id,text)=>game.handleChatEvent({platform:'twitch',user:{id,displayName:id},text});
  game.open({questionCount:1});chat('KingGumption','!join');chat('Second','!join');game.next();
  clock+=2000;chat('KingGumption',String(game.deck[0].answer+1));clock+=2000;chat('Second',String((game.deck[0].answer+1)%4+1));game.resolve();game.next();
  clock+=6000;chat('KingGumption',String((game.deck[1].answer+1)%4+1));game.resolve();
  const q=buildAnalyticsReport({events,now:new Date(clock+1000)}).tools.eliminationQuiz;
  assert.equal(q.averageResponseMs,4000);assert.equal(q.medianResponseMs,4000);assert.equal(q.timedAnswers,3);
  assert.equal(q.joinToAnswerRate,100);assert.equal(q.questionCoverage.uniqueQuestions,1);assert.equal(q.questionCoverage.identifiedRounds,2);
  assert.equal(q.questionPerformance[0].timesAsked,2);assert.equal(q.questionPerformance[0].text,'Example question?');assert.equal(q.questionPerformance[0].wrong,2);
  assert.equal(q.roundPerformance[0].standing,1);assert.equal(q.roundPerformance[1].standing,1);assert.equal(q.roundPerformance[1].correct,0);
  assert.equal(q.playerPerformance.find(p=>p.username==='KingGumption').winRate,100);assert.equal(q.playerPerformance.find(p=>p.username==='Second').winRate,0);
  assert.equal(q.difficultyPerformance[0].difficulty,2);assert.equal(q.gameRounds.length,2);
  assert.equal(q.gameRounds[0].options.length,4);assert.ok(Number.isInteger(q.gameRounds[0].correctAnswer));
  assert.equal(events.find(e=>e.eventType==='question_started').metadata.correctAnswer,undefined);
});

test('historic results retain survival but do not invent identities, difficulty or timing',()=>{
  const events=[{tool:'elimination_quiz',eventType:'answer_result',platform:'youtube',userId:'1',username:'Player',correlationId:'old',timestamp:'2026-09-07T18:00:00Z',metadata:{round:1,correct:false,missed:true}}];
  const q=buildAnalyticsReport({events,now:'2026-09-08T00:00:00Z'}).tools.eliminationQuiz;
  assert.equal(q.averageResponseMs,null);assert.equal(q.questionCoverage.identifiedRounds,0);assert.equal(q.questionPerformance.length,0);
  assert.equal(q.difficultyPerformance[0].difficulty,'unknown');assert.equal(q.roundPerformance[0].missed,1);assert.equal(q.playerPerformance[0].winRate,null);
});

test('question choice context remains global while response statistics follow the platform filter',()=>{
  const base={tool:'elimination_quiz',correlationId:'mixed',timestamp:'2026-09-07T18:00:00Z'};
  const events=[
    {...base,platform:'admin',eventType:'question_started',metadata:{round:1,questionId:'q',difficulty:1,questionText:'Q?',options:['A','B','C','D']}},
    {...base,platform:'twitch',userId:'1',username:'T',eventType:'answer_result',metadata:{round:1,questionId:'q',correct:true}},
    {...base,platform:'youtube',userId:'2',username:'Y',eventType:'answer_result',metadata:{round:1,questionId:'q',correct:false}},
    {...base,platform:'admin',eventType:'round_completed',metadata:{round:1,questionId:'q',answerCounts:[1,1,0,0],correctAnswer:0}},
  ];
  const q=buildAnalyticsReport({events,platform:'youtube',now:'2026-09-08T00:00:00Z'}).tools.eliminationQuiz;
  assert.equal(q.questionPerformance[0].correct,0);assert.equal(q.questionPerformance[0].wrong,1);assert.deepEqual(q.gameRounds[0].answerCounts,[1,1,0,0]);
  assert.equal(q.playerPerformance.length,1);assert.equal(q.playerPerformance[0].username,'Y');
});

test('a timed response of zero is retained and invalid timing is excluded',()=>{
  const events=[0,null,-2,NaN,120001].map((responseMs,i)=>({tool:'elimination_quiz',eventType:'answer_submitted',platform:'twitch',userId:String(i),username:'P'+i,correlationId:'game',timestamp:'2026-09-07T18:00:00Z',metadata:{round:1,responseMs}}));
  const q=buildAnalyticsReport({events,now:'2026-09-08T00:00:00Z'}).tools.eliminationQuiz;
  assert.equal(q.timedAnswers,1);assert.equal(q.averageResponseMs,0);assert.equal(q.medianResponseMs,0);
});
