// Decisions use only completed turns. Current audience votes never influence them.
const PROFILES={
 pumpkin:{guard:.18,charge:.27,heal:18,guardName:'Thorn Armour',chargeName:'Harvest Moon',healName:'Soul Harvest'},
 frost:{guard:.12,charge:.34,heal:16,guardName:'Ice Aegis',chargeName:'Deep Freeze',healName:'Frozen Renewal'},
 golem:{guard:.34,charge:.16,heal:22,guardName:'Sugar Shell',chargeName:'Molten Core',healName:'Reforge'}
};
function chooseBossTactic(game){
 const p=PROFILES[game.boss.id],roll=game.random();
 if(game.bossCharged||game.round===1)return 'attack';
 const history=game.partyActions||[],last=history.at(-1),repeated=last&&last===history.at(-2);
 const wounded=game.bossHp<=game.bossMaxHp*.6,enraged=game.bossHp<=game.bossMaxHp*.3;
 const heal=wounded&&game.bossHeals>0&&game.lastBossAction!=='heal'?.25:0;
 const guard=game.lastBossAction==='defend'?0:p.guard+(repeated&&last==='attack'?.2:0);
 const charge=p.charge+(repeated&&last==='defend'?.18:0);
 // Enraged bosses trade some defensive turns for more frequent attacks.
 const weights=[['attack',enraged?.8:.55],['defend',enraged?guard*.5:guard],['charge',charge],['heal',heal]];
 let cursor=roll*weights.reduce((sum,[,weight])=>sum+weight,0);
 for(const [action,weight] of weights){cursor-=weight;if(cursor<0)return action;}
 return 'attack';
}
module.exports={PROFILES,chooseBossTactic};
