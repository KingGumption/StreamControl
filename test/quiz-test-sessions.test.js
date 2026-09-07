const test = require('node:test');
const assert = require('node:assert/strict');
const { QuizTestSessions } = require('../src/quiz-test-sessions');
const { quizGame } = require('../src/quiz-game');
function clocked() {
  let now=0,serial=0;const timers=new Map();
  const manager=new QuizTestSessions({now:()=>now,schedule:(fn,ms)=>{timers.set(++serial,{fn,at:now+ms});return serial;},cancel:id=>timers.delete(id),random:()=>.2,ttlMs:600000});
  return {manager,timers,tick(){const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=timer.at;timer.fn();},advance(ms){now+=ms;}};
}
test('automatic demo simulates lobby joins, answers, elimination and winner without touching live state',()=>{
  const c=clocked(),before=JSON.stringify(quizGame.getState());
  const created=c.manager.create({autoplay:true,scenario:'winner',opponents:4,questionCount:3,answerSeconds:5});
  assert.equal(created.game.phase,'lobby');assert.equal(created.game.players,1);
  c.tick();assert.equal(c.manager.get(created.testId).game.players,2);
  let sawQuestion=false,sawElimination=false;
  for(let i=0;i<100 && c.manager.get(created.testId).game.phase!=='completed';i++){
    c.tick();const state=c.manager.get(created.testId).game;
    sawQuestion ||= state.phase==='question';sawElimination ||= Boolean(state.roundResult?.eliminated.length);
  }
  const final=c.manager.get(created.testId);
  assert.equal(final.game.outcome,'victory');assert.equal(final.game.winners[0].username,'KingGumption');
  assert.equal(final.game.winners[0].correctAnswers,3);assert.equal(final.game.winners[0].totalWins,1);
  assert.ok(sawQuestion&&sawElimination);assert.equal(JSON.stringify(quizGame.getState()),before);
  c.manager.stop(created.testId);assert.equal(c.timers.size,0);
});
test('automatic scenarios reliably demonstrate defeat and sudden death',()=>{
  for(const scenario of ['defeat','sudden-death']){
    const c=clocked(),{testId}=c.manager.create({autoplay:true,scenario,opponents:2,questionCount:1,answerSeconds:5});let suddenDeath=false;
    for(let i=0;i<60 && c.manager.get(testId).game.phase!=='completed';i++){c.tick();suddenDeath ||= c.manager.get(testId).game.suddenDeath;}
    const final=c.manager.get(testId).game;
    assert.equal(final.outcome,scenario==='defeat'?'defeat':'victory');assert.equal(suddenDeath,scenario==='sudden-death');
    c.manager.stop(testId);assert.equal(c.timers.size,0);
  }
});
test('manual tests accept one answer per question and isolate concurrent sessions',()=>{
  const c=clocked(),first=c.manager.create({opponents:2}),second=c.manager.create({opponents:0,username:'OtherViewer'});
  c.manager.action(first.testId,'start');const data=c.manager.action(first.testId,'answer',{answer:1});assert.equal(data.self.answer,0);
  assert.throws(()=>c.manager.action(first.testId,'answer',{answer:2}));
  assert.throws(()=>c.manager.action(second.testId,'answer',{answer:1}));assert.equal(c.manager.get(second.testId).game.phase,'lobby');
  c.manager.stop(first.testId);assert.throws(()=>c.manager.get(first.testId));assert.equal(c.manager.get(second.testId).game.players,1);
  c.manager.stop(second.testId);assert.equal(c.timers.size,0);
});
test('abandoned tests expire and release timers; invalid test configuration is rejected',()=>{
  const c=clocked();
  assert.throws(()=>c.manager.create({opponents:6}));assert.throws(()=>c.manager.create({autoplay:true,scenario:'defeat',opponents:0}));
  assert.throws(()=>c.manager.create({scenario:'bad'}));
  const {testId}=c.manager.create({autoplay:true});assert.ok(c.timers.size>0);
  c.advance(600001);c.manager.sweep();assert.equal(c.timers.size,0);assert.throws(()=>c.manager.get(testId));
});
