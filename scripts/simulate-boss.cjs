const {ArcadeGames,BOSSES}=require('../src/arcade-games');
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function run(seed,boss,strategy,rounds=8){
 const g=new ArcadeGames({random:rng(seed),schedule:()=>1,cancel:()=>{}});g.start('boss',{rounds});g.boss=BOSSES[boss];g.bossIntent=g.intent();g.bossMove=g.boss.moves[g.bossIntent.style];
 const turns=[];while(g.phase!=='completed'){
  const s=g.getState(),move=strategy(s);g.handleChatEvent({platform:'twitch',text:move,user:{id:'test',username:'test'}});g.resolve();turns.push([g.round,move,g.combat.bossAction,g.partyHp,g.bossHp]);if(g.phase!=='completed')g.next();
 }return {won:g.result.success,turns};
}
const strategies={attack:()=> 'attack',reactive:s=>{
 const b=s.battle;if(s.bossHp<=(b.focus?56:b.bossGuard?14:28))return 'attack';
 if(b.bossCharged)return 'defend';
 if(s.partyHp<=55&&b.potions)return 'heal';
 if(b.bossGuard&&!b.focus)return 'defend';
 if(!b.focus&&s.partyHp<=65&&(s.rounds===null||s.round<s.rounds-1))return 'defend';
 return 'attack';
}};
if(require.main===module)for(let b=0;b<3;b++)for(const [name,strategy]of Object.entries(strategies)){let wins=0;const actions={};for(let seed=1;seed<=500;seed++){const r=run(seed,b,strategy);wins+=r.won;for(const t of r.turns)actions[t[2]]=(actions[t[2]]||0)+1;}console.log(BOSSES[b].id,name,wins+'/500',JSON.stringify(actions));}
module.exports={run,strategies,rng};
