const test=require('node:test'),assert=require('node:assert/strict');
const {QuizGame}=require('../src/quiz-game');
function fixture(options={}) {
  let now=1000, timer;
  const g=new QuizGame({now:()=>now,schedule:(fn,ms)=>{timer={fn,ms};return 1;},cancel:()=>{},...options});
  const chat=(id,text,platform='twitch')=>g.handleChatEvent({platform,text,user:{id,username:id}});
  g.open({questionCount:1,answerSeconds:5});
  return {g,chat,at:value=>now=value,timer:()=>timer,correct:()=>String(g.deck[g.round-1].answer+1)};
}
test('grace accepts until just before two seconds, keeps answers secret, and closes at boundary',()=>{
  const f=fixture();for(const id of ['a','b','c'])f.chat(id,'!join');f.g.next();
  assert.equal(f.timer().ms,7000);assert.equal(f.g.deadline,6000);assert.equal(f.g.acceptUntil,8000);
  f.at(6000);f.chat('a',f.correct());f.at(7999);f.chat('b',f.correct());
  assert.equal(f.g.getState().question.answer,undefined);assert.equal(f.g.getState().roundResult,null);
  f.at(8000);f.chat('c',f.correct());assert.equal(f.g.players.get('twitch:c').alive,false);
  assert.deepEqual(f.g.roundResult.podium.map(p=>p.points),[3,2]);f.g.stop();
});
test('pass replaces answer, spends free first, works in grace and sudden death, and cannot be undone',()=>{
  let bank=1,spends=0;const f=fixture({passBank:{balance:()=>bank,spend:()=>{spends++;bank=0;return true;},award:()=>1}});
  f.chat('a','!join');f.chat('b','!join');f.g.next();f.at(7000);f.chat('a',' PaSs ');f.chat('a',f.correct());f.chat('a','pass');f.chat('b',f.correct());
  assert.equal(spends,0);assert.equal(f.g.players.get('twitch:a').answer,null);f.g.resolve();
  assert.equal(f.g.players.get('twitch:a').correctAnswers,0);assert.equal(f.g.roundResult.passed,1);assert.deepEqual(f.g.getState().roundResult.passedPlayers.map(p=>[p.username,p.platform]),[['a','twitch']]);assert.equal(f.g.roundResult.missed,0);
  f.g.next();assert.equal(f.g.getState().suddenDeath,true);f.chat('a','pass');assert.equal(spends,1);f.chat('b',f.correct());f.g.resolve();
  f.g.next();f.chat('a','pass');assert.equal(f.g.players.get('twitch:a').passed,false);f.chat('a',f.correct());f.chat('a','pass');assert.equal(f.g.players.get('twitch:a').passed,false);f.g.stop();
});
test('speed podium uses first correct arrival, awards 3/2/1, no points to wrong answers or passes',()=>{
  const f=fixture();for(const id of ['wrong','pass','third','first','second'])f.chat(id,'!join');f.g.next();
  f.chat('wrong',String((f.g.deck[0].answer+1)%4+1));f.chat('pass','pass');
  f.chat('first',f.correct());f.chat('second',f.correct());f.chat('third',f.correct());f.chat('first',f.correct());
  f.g.resolve();assert.deepEqual(f.g.roundResult.podium.map(p=>[p.username,p.points]),[['first',3],['second',2],['third',1]]);
  assert.equal(f.g.players.get('twitch:wrong').speedPoints,0);assert.equal(f.g.players.get('twitch:pass').speedPoints,0);f.g.stop();
});
test('completion rewards winner and an eliminated speed champion; stopping awards nothing',()=>{
  const awards=[];const f=fixture({passBank:{balance:()=>0,spend:()=>false,award:(game,platform,id)=>{awards.push(id);return 1;}}});
  for(const id of ['fast','survivor'])f.chat(id,'!join');f.g.next();f.chat('fast',f.correct());f.chat('survivor','pass');f.g.resolve();
  f.g.next();f.chat('survivor',f.correct());f.g.resolve(); // fast misses; points tie, earlier fast submission wins tiebreak
  f.g.next();f.g.resolve();assert.equal(f.g.phase,'completed');
  assert.equal(f.g.getState().winners[0].username,'survivor');assert.equal(f.g.getState().speedChampion.username,'fast');
  assert.deepEqual(awards.sort(),['fast','survivor']);f.g.resolve();assert.equal(awards.length,2);
  f.g.open({questionCount:1});f.chat('fast','!join');f.g.next();f.g.stop();assert.equal(awards.length,2);
});
test('one player can earn both titles but receives a single capped award; no correct answers means no speed champion',()=>{
  let awards=0;const f=fixture({passBank:{balance:()=>0,award:()=>{awards++;return 1;}}});f.chat('a','!join');f.g.next();f.chat('a',f.correct());f.g.resolve();f.g.next();f.chat('a','pass');f.g.resolve();assert.equal(f.g.phase,'reveal');f.g.next();f.g.resolve();assert.equal(awards,1);assert.equal(f.g.speedChampion.username,'a');
  const empty=fixture();empty.chat('a','!join');empty.chat('b','!join');empty.g.next();empty.g.resolve();assert.equal(empty.g.outcome,'defeat');assert.equal(empty.g.speedChampion,null);
});
test('pass bank is capped, separates platforms, survives module reload, and awards idempotently',()=>{
  const bank=require('../src/quiz-pass-bank'),id='test-'+require('node:crypto').randomUUID();
  assert.equal(bank.balance('twitch',id),0);bank.award('game1','twitch',id);bank.award('game2','twitch',id);assert.equal(bank.balance('twitch',id),1);assert.equal(bank.balance('youtube',id),0);
  assert.equal(bank.spend('twitch',id),true);assert.equal(bank.spend('twitch',id),false);bank.award('game1','twitch',id);assert.equal(bank.balance('twitch',id),0);
  bank.award('game3','twitch',id);delete require.cache[require.resolve('../src/quiz-pass-bank')];assert.equal(require('../src/quiz-pass-bank').balance('twitch',id),1);
});
