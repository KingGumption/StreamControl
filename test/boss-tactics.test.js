const test=require('node:test'),assert=require('node:assert/strict');
const {ArcadeGames}=require('../src/arcade-games');
const {chooseBossTactic}=require('../src/boss-tactics');
const make=()=>{const g=new ArcadeGames({random:()=>.1,schedule:()=>1,cancel:()=>{}});g.start('boss');return g;};
function turn(g,boss,party='attack'){
 g.bossIntent={action:boss,style:0,power:g.bossCharged?40:25};g.bossMove=boss;
 g.handleChatEvent({platform:'twitch',text:party,user:{id:'p',username:'P'}});g.resolve();
}
test('boss guard is visible for one following turn and focus pierces it',()=>{
 const g=make();turn(g,'defend');assert.equal(g.combat.hit,0);assert.equal(g.bossGuard,true);g.next();
 assert.equal(g.getState().battle.bossGuard,true);turn(g,'attack');assert.equal(g.combat.damage,14);assert.equal(g.bossGuard,false);
 const h=make();h.focus=true;h.bossGuard=true;turn(h,'attack');assert.equal(h.combat.damage,56);assert.equal(h.combat.guardBroken,true);
});
test('charge spends its turn preparing, then a defended charged strike consumes the charge',()=>{
 const g=make();turn(g,'charge');assert.equal(g.combat.hit,0);assert.equal(g.bossCharged,true);g.next();
 assert.equal(g.bossIntent.action,'attack');assert.equal(g.getState().bossMove,undefined);
 turn(g,'attack','defend');assert.equal(g.combat.chargedStrike,true);assert.equal(g.combat.hit,10);assert.equal(g.bossCharged,false);
});
test('boss recovery is capped, limited to one use, and cannot resurrect a killed boss',()=>{
 const g=make();g.bossHp=g.bossMaxHp-5;turn(g,'heal','defend');assert.equal(g.combat.bossHeal,5);assert.equal(g.bossHp,g.bossMaxHp);assert.equal(g.bossHeals,0);assert.equal(g.combat.hit,0);
 g.next();turn(g,'heal','defend');assert.equal(g.combat.bossHeal,0);
 const dead=make();dead.bossHp=1;turn(dead,'heal');assert.equal(dead.bossHp,0);assert.equal(dead.combat.bossAction,null);assert.equal(dead.result.success,true);
});
test('each boss can choose all four actions, reacts to past behaviour, never current votes',()=>{
 for(const boss of ['pumpkin','frost','golem']){
  const g=make();g.boss={...g.boss,id:boss};g.round=3;g.bossHp=50;
  const choices=new Set();for(let i=0;i<100;i++){g.random=()=>i/100;choices.add(chooseBossTactic(g));}
  assert.deepEqual([...choices].sort(),['attack','charge','defend','heal']);
  const guards=history=>{g.partyActions=history;let n=0;for(let i=0;i<100;i++){g.random=()=>i/100;n+=chooseBossTactic(g)==='defend';}return n;};
  assert.ok(guards(['attack','attack'])>guards([]));
  g.random=()=>.6;const before=chooseBossTactic(g);g.votes.set('twitch:p',2);assert.equal(chooseBossTactic(g),before);
  g.lastBossAction='defend';for(let i=0;i<100;i++){g.random=()=>i/100;assert.notEqual(chooseBossTactic(g),'defend');}
 }
});
test('all enemy decisions stay hidden while only established statuses are public',()=>{
 const g=make();g.bossIntent={action:'heal',power:25,style:2};g.bossMove='Secret';
 const s=JSON.parse(JSON.stringify(g.getState()));assert.equal(s.bossIntent,undefined);assert.equal(s.bossMove,undefined);assert.equal(s.combat,null);assert.equal(JSON.stringify(s).includes('Secret'),false);
});
test('responding to visible statuses beats attack-only across reproducible battle samples',()=>{
 const {run,strategies}=require('../scripts/simulate-boss.cjs');
 for(let boss=0;boss<3;boss++){
  let reactive=0,attack=0;for(let seed=1;seed<=100;seed++){reactive+=run(seed,boss,strategies.reactive).won;attack+=run(seed,boss,strategies.attack).won;}
  assert.ok(reactive>=50&&reactive<100,`boss ${boss}: ${reactive} responsive wins`);
  assert.ok(reactive>=attack+20,`boss ${boss}: ${reactive} responsive vs ${attack} attack-only`);
 }
});
