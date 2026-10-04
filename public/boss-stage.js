(() => {
 let timers=[],key='',lastGame='';
 function clear(){timers.forEach(clearTimeout);timers=[];}
 function later(fn,delay){timers.push(setTimeout(fn,delay));}
 window.BossStage={
  stop(){clear();key='';lastGame='';},
  observe(g){
   const stage=document.getElementById('bossStage');if(!stage)return;
   const next=`${g.gameId}:${g.round}:${g.phase}`;if(next===key)return;
   const first=lastGame!==g.gameId;lastGame=g.gameId;key=next;clear();
   const sprite=stage.querySelector('.boss-sprite'),callout=stage.querySelector('.combat-callout');
   const id=['pumpkin','frost','golem'].includes(g.boss?.id)?g.boss.id:'pumpkin';stage.dataset.boss=id;stage.dataset.hit=String(Boolean(g.combat?.hit));stage.dataset.move=String(g.combat?.style??(g.round-1)%3);
   if(sprite.dataset.boss!==id){sprite.style.backgroundImage=`url("${window.BossArt[id]}")`;sprite.dataset.boss=id;}
   const pose=(name,message='')=>{stage.dataset.pose=name;callout.textContent=message;const effect=name==='attack'?['slam','breath','sweep'][Number(stage.dataset.move)]:name==='blocked'?'block':name==='healing'?'heal':null;if(effect)window.GameSound?.effect(effect,`${next}:${name}`);};
   if(g.phase==='question'){pose(g.bossIntent?.type==='guard'?'guard':'idle','');stage.dataset.enraged=String(Boolean(g.bossIntent?.enraged));return;}
   if(first){pose(g.phase==='completed'?(g.result?.success?'defeat':'victory'):'idle',g.phase==='completed'?(g.result?.success?'BOSS DEFEATED':'THE BOSS WINS'):'');return;}
   // The sequence visualises the authoritative totals; it does not change damage.
   const combat=g.combat||{};
   pose(combat.damage?'hit':'guard',combat.damage?`−${combat.damage} BOSS HP`:'NO DAMAGE');
   if(g.phase==='completed'&&g.result?.success){later(()=>pose('defeat','BOSS DEFEATED'),950);return;}
   later(()=>pose('windup',combat.move||g.bossMove),1000);
   later(()=>pose('attack',combat.hit?`−${combat.hit} TEAM HP`:'ATTACK BLOCKED'),1700);
   if(combat.shield)later(()=>pose('blocked',`${combat.shield} DAMAGE BLOCKED`),2450);
   if(combat.heal)later(()=>pose('healing',`+${combat.heal} TEAM HP`),3150);
   later(()=>pose(g.phase==='completed'?'victory':'idle',g.phase==='completed'?'THE BOSS WINS':'READY FOR THE NEXT TURN'),4000);
  }
 };
})();
