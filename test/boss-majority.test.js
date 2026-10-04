const test=require('node:test'),assert=require('node:assert/strict');
const {ArcadeGames}=require('../src/arcade-games');
const chat=(id,text)=>({platform:'twitch',text,user:{id,username:id}});
function game(){const g=new ArcadeGames({random:()=>.1,schedule:()=>1,cancel:()=>{}});g.start('boss');return g;}
test('numeric aliases and names share one locked vote; only the majority action executes',()=>{
 const g=game();g.partyHp=60;
 for(const [id,text]of [['a','1'],['b','attack'],['c','2'],['d','3']])assert.equal(g.handleChatEvent(chat(id,text)),true);
 g.handleChatEvent(chat('a','heal'));assert.deepEqual(g.getState().moveCounts,[2,1,1]);
 g.resolve();assert.equal(g.combat.action,'attack');assert.equal(g.combat.damage,28);assert.equal(g.combat.heal,0);assert.equal(g.combat.shield,0);assert.equal(g.potions,2);assert.equal(g.result.action,0);
});
test('defend banks one focus, repeated defence cannot stack, attack consumes it',()=>{
 const g=game();for(let i=0;i<2;i++){g.handleChatEvent(chat('a','2'));g.resolve();assert.equal(g.focus,true);assert.equal(g.combat.damage,0);assert.equal(g.combat.shield,Math.round(g.bossIntent.power*.75));g.next();}
 g.handleChatEvent(chat('a','1'));g.resolve();assert.equal(g.combat.damage,56);assert.equal(g.focus,false);
});
test('two shared potions, no free heals, capped health and no resurrection',()=>{
 const g=game();g.partyHp=90;g.handleChatEvent(chat('a','3'));g.resolve();assert.equal(g.combat.heal,10);assert.equal(g.potions,1);g.next();g.handleChatEvent(chat('a','heal'));g.resolve();assert.equal(g.potions,0);g.next();g.handleChatEvent(chat('a','3'));g.resolve();assert.equal(g.combat.heal,0);assert.equal(g.potions,0);assert.match(g.result.text,/No potions/);
 const dead=game();dead.partyHp=0;dead.handleChatEvent(chat('a','3'));dead.resolve();assert.equal(dead.partyHp,0);assert.equal(dead.combat.heal,0);
});
test('ties select only tied actions, no votes wait, killing blow prevents retaliation',()=>{
 const g=game();g.handleChatEvent(chat('a','2'));g.handleChatEvent(chat('b','3'));g.resolve();assert.equal(g.combat.tied,true);assert.ok(['defend','heal'].includes(g.combat.action));assert.match(g.result.text,/Tied vote/);
 const empty=game();empty.resolve();assert.equal(empty.combat.action,'wait');assert.equal(empty.combat.damage,0);assert.ok(empty.combat.hit>0);
 const kill=game();kill.bossHp=20;kill.handleChatEvent(chat('a','1'));kill.resolve();assert.equal(kill.combat.hit,0);assert.equal(kill.combat.move,null);assert.equal(kill.result.success,true);
});
test('question snapshots conceal the selected move, power and animation style',()=>{
 const g=game(),s=JSON.parse(JSON.stringify(g.getState()));assert.equal(s.bossIntent,undefined);assert.equal(s.bossMove,undefined);assert.equal(s.combat,null);assert.equal(s.battle.lastMove,null);assert.equal(s.rounds,8);
 g.handleChatEvent(chat('a','2'));g.resolve();const previous=g.combat.move;g.next();assert.equal(g.getState().battle.lastMove,previous);assert.equal(g.getState().bossMove,undefined);
});
test('attack-only enemy baseline still rewards defence and a potion',()=>{
 for(let b=0;b<3;b++)for(const strategic of [false,true]){
  const g=new ArcadeGames({random:()=>(b+.1)/3,schedule:()=>1,cancel:()=>{}});const originalIntent=g.intent.bind(g);g.intent=()=>({...originalIntent(),action:'attack'});g.start('boss');g.bossHp=g.bossMaxHp=180;
  const plan=b===1?['attack','defend','attack','defend','heal','attack','defend','attack']:['attack','attack','attack','defend','heal','attack','defend','attack'];
  while(g.phase!=='completed'){g.handleChatEvent(chat('p',strategic?plan[g.round-1]:'attack'));g.resolve();if(g.phase!=='completed')g.next();}
  assert.equal(g.result.success,strategic,`${b}: strategic=${strategic}`);
 }
});
