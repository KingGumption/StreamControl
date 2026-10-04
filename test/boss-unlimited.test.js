const test=require('node:test'),assert=require('node:assert/strict');
const {ArcadeGames}=require('../src/arcade-games');
const game=()=>new ArcadeGames({random:()=>.1,schedule:()=>1,cancel:()=>{}});
test('legacy boss round presets cannot cause timeout defeats or change boss HP',()=>{
 for(const rounds of [3,8,10]){
  const g=game();g.start('boss',{rounds});assert.equal(g.getState().rounds,null);assert.equal(g.bossHp,160);
  for(let i=0;i<12;i++){g.bossIntent={action:'attack',power:0,style:0};g.resolve();assert.equal(g.phase,'reveal');assert.equal(g.result.success,false);assert.doesNotMatch(g.result.text,/Out of turns/);g.next();}
  assert.equal(g.round,13);g.bossHp=1;g.handleChatEvent({platform:'twitch',text:'1',user:{id:'p'}});g.resolve();assert.equal(g.phase,'completed');assert.equal(g.result.success,true);
 }
});
test('party defeat and manual stop still end an unlimited battle',()=>{
 const g=game();g.start('boss');g.round=22;g.partyHp=1;g.bossIntent={action:'attack',power:20,style:0};g.resolve();assert.equal(g.phase,'completed');assert.equal(g.result.success,false);
 g.start('boss');g.stop();assert.equal(g.phase,'idle');
});
test('other arcade games retain their configured round limit',()=>{
 for(const id of ['higher','split','snacks','number']){const g=game();g.start(id,{rounds:3});for(let i=0;i<3;i++){g.resolve();if(i<2)g.next();}assert.equal(g.phase,'completed',id);assert.equal(g.getState().rounds,3);}
});
