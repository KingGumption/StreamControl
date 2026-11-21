const test=require('node:test');
const assert=require('node:assert/strict');
const {WordVault,markGuess}=require('../src/word-vault');

function fixture(settings={}){
 let stamp=1000;
 const timers=[];
 const engine=new WordVault({
  random:()=>0,now:()=>stamp,
  schedule:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
  cancel:()=>{}
 });
 engine.start({rounds:2,seconds:10,...settings});
 const say=(text,platform='twitch',id='a')=>engine.chat({text,platform,user:{id}});
 const step=()=>{const {fn,ms}=timers.at(-1);stamp+=ms;fn();};
 return {engine,say,step,state:()=>engine.getState(),timers};
}

test('duplicate letters reserve exact matches before spending remaining letters',()=>{
 assert.deepEqual(markGuess('LEVEL','SHELL'),['present','present','absent','absent','exact']);
 assert.deepEqual(markGuess('EERIE','EAGLE'),['exact','absent','absent','absent','exact']);
});
test('bare guesses pool platform identities, pass other chat through and break ties by first nomination',()=>{
 const {say,step,state,engine}=fixture();
 for(const text of ['four','banana','two words','word!','crane!','a1bcd','🎮🎮🎮🎮🎮'])assert.equal(say(text),false,text);
 assert.equal(say('  Qzxwv  '),true);
 say('LEMON'); // same account already voted
 say('lemon','youtube');say('LEMON','tiktok');
 assert.deepEqual(state().candidates,[{word:'LEMON',votes:2},{word:'QZXWV',votes:1}]);
 assert.equal(state().answer,null);assert.equal(state().clue,null);
 step();assert.equal(state().rows[0].word,'LEMON');
 say('LEMON');say('crane');say('GROVE','youtube');
 step();assert.equal(state().rows[1].word,'CRANE');
 say('FROST');step();assert.equal(typeof state().clue,'string');assert.equal(state().answer,null);
 engine.stop();
});
test('one run awards points and streaks, advances to a new answer, then releases timers on completion',()=>{
 const {say,step,state,engine,timers}=fixture();
 const first=state().ballotId;
 step();assert.ok(state().ballotId>first);assert.deepEqual(state().rows,[]);
 say('AMBER');step();assert.equal(state().phase,'reveal');assert.equal(state().score,600);assert.equal(state().streak,1);
 assert.equal(state().answer,'AMBER');assert.equal(say('BLADE'),false);
 const expired=timers.at(-1).fn;
 engine.act('next');expired();
 assert.equal(state().round,2);assert.equal(state().phase,'guessing');
 say('BLADE');step();assert.equal(state().phase,'completed');assert.equal(state().streak,2);assert.equal(state().score,1250);
 assert.equal(state().answer,'BLADE');assert.equal(state().endsAt,null);
 engine.stop();assert.equal(state().phase,'idle');assert.equal(say('amber'),false);
});
test('six wrong attempts reveal the answer and a stopped or superseded timer cannot publish another round',()=>{
 const {say,step,state,engine,timers}=fixture({rounds:1});
 const stale=timers.at(-1).fn;
 for(const word of ['CRANE','LEMON','FROST','GROVE','JELLY','SHELL']){say(word);step();}
 assert.equal(state().phase,'completed');assert.equal(state().solved,false);
 assert.equal(state().rows.length,6);assert.equal(state().score,0);assert.equal(state().answer,'AMBER');
 engine.stop();engine.start({rounds:1,seconds:10});stale();
 assert.equal(state().round,1);assert.deepEqual(state().rows,[]);assert.equal(state().phase,'guessing');
});
