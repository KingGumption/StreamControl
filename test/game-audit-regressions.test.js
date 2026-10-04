const test=require('node:test'),assert=require('node:assert/strict');
const {ArcadeGames}=require('../src/arcade-games');
const {HillGame}=require('../src/hill-game');
const chat=(id,text,platform='twitch')=>({platform,text,user:{id,username:id}});
function fixture(random=()=>.4){let now=1000;return {g:new ArcadeGames({now:()=>now,random,schedule:()=>1,cancel:()=>{}}),at:n=>now=n};}
test('all arcade games accept the last call, lock first input, reject after grace',()=>{
 for(const [id,input]of [['escape','1'],['higher','1'],['split','1'],['boss','attack'],['number','50'],['snacks','2']]){
  const {g,at}=fixture();g.start(id,{seconds:10});at(11000);assert.equal(g.handleChatEvent(chat('grace',input)),true,id);assert.equal(g.getState().answered,1);
  at(12999);g.handleChatEvent(chat('last',input));assert.equal(g.getState().answered,2);g.handleChatEvent(chat('last',input));assert.equal(g.getState().answered,2);
  at(13000);g.handleChatEvent(chat('late',input));assert.equal(g.players.has('twitch:late'),false);assert.notEqual(g.phase,'question');g.stop();
 }
});
test('higher/lower draws only A–K, excludes equality and restores both revealed cards',()=>{
 for(let old=1;old<=13;old++)for(let next=0;next<12;next++){
  const {g}=fixture(()=>next/12);g.start('higher');g.currentCard=old;g.nextRound();const before=g.getState();assert.equal(before.previousCard,old);assert.equal(before.nextCard,undefined);
  const drawn=g.nextCard;assert.ok(drawn>=1&&drawn<=13);assert.notEqual(drawn,old);g.handleChatEvent(chat('p',drawn>old?'1':'2'));g.resolve();const revealed=JSON.parse(JSON.stringify(g.getState()));assert.equal(revealed.previousCard,old);assert.equal(revealed.card,drawn);assert.equal(revealed.leaderboard[0].score,1);g.stop();
 }
});
test('haunted house escapes immediately on enough clues and empty rounds cannot win',()=>{
 const {g}=fixture();g.start('escape',{rounds:5});while(g.phase!=='completed'){g.handleChatEvent(chat('p',String(g.effects.indexOf(2)+1)));g.resolve();if(g.phase!=='completed')g.next();}assert.equal(g.round,3);assert.equal(g.result.success,true);g.stop();
 g.start('escape',{rounds:5});while(g.phase!=='completed'){g.resolve();if(g.phase!=='completed')g.next();}assert.equal(g.result.success,false);assert.equal(g.health,0);
});
test('default secret-number hunt is solvable by one viewer using seven binary guesses',()=>{
 for(let target=1;target<=100;target++){const {g}=fixture();g.start('number');assert.equal(g.rounds,7);g.target=target;
 while(g.phase!=='completed'){g.handleChatEvent(chat('solo',String(Math.floor((g.low+g.high)/2))));g.resolve();if(g.phase!=='completed')g.next();}assert.equal(g.result.success,true,'target '+target);g.stop();}
});
test('Hill accepts two seconds of lag but never applies a late vote to the next round',()=>{
 let now=1000;const g=new HillGame({now:()=>now,random:()=>.2,schedule:()=>1,cancel:()=>{}});g.start();const end=g.endsAt;now=end+1999;g.handleChatEvent(chat('a','1'));assert.equal(g.getState().options[0].votes,1);now=end+2000;g.handleChatEvent(chat('b','2'));assert.equal(g.phase,'battle');assert.equal(g.getState().options.reduce((n,o)=>n+o.votes,0),0);g.stop();
});

test('boss overlay restores the correct final pose on reconnect without replaying combat',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 for(const success of [true,false]){const sprite={dataset:{},style:{}},callout={},stage={dataset:{},querySelector:selector=>selector==='.boss-sprite'?sprite:callout};let scheduled=0;
  const window={BossArt:{golem:'/assets/boss-sprites/golem.webp'}},context=vm.createContext({window,document:{getElementById:()=>stage},setTimeout:()=>scheduled++,clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/boss-stage.js'),'utf8'),context);
  window.BossStage.observe({gameId:'reconnected',round:5,phase:'completed',boss:{id:'golem'},result:{success}});
  assert.equal(stage.dataset.pose,success?'defeat':'victory');assert.equal(scheduled,0);assert.equal(callout.textContent,success?'BOSS DEFEATED':'THE BOSS WINS');
 }
});

test('crowd reveal uses real voters only and a busy number win keeps the broadcast text bounded',()=>{
 const {g}=fixture();g.start('split');g.handleChatEvent(chat('Alice','1'));g.handleChatEvent(chat('Bob','2'));assert.equal(g.getState().result,null);g.resolve();assert.deepEqual(g.result.groups,[['Alice'],['Bob']]);g.stop();
 g.start('number');for(let i=0;i<100;i++)g.handleChatEvent(chat('Player'+i,String(g.target)));g.resolve();assert.match(g.result.text,/and 97 more/);assert.ok(g.result.text.length<100);assert.equal([...g.players.values()].filter(p=>p.score===1).length,100);g.stop();
});
