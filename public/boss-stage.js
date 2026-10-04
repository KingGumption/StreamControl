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
   const id=['pumpkin','frost','golem'].includes(g.boss?.id)?g.boss.id:'pumpkin';stage.dataset.boss=id;stage.dataset.hit=String(Boolean(g.combat?.hit));stage.dataset.move=String(g.combat?.style??0);
   if(sprite.dataset.boss!==id){sprite.style.backgroundImage=`url("${window.BossArt[id]}")`;sprite.dataset.boss=id;}
   const pose=(name,message='')=>{stage.dataset.pose=name;
    // Painted poses have unequal widths. Sample their actual atlas bounds.
    const frostFrames={idle:[0,0,530,495],windup:[530,0,460,500],attack:[990,0,546,500],hit:[0,500,512,524],guard:[512,500,480,524],defeat:[992,512,544,512],victory:[530,0,460,500]};
    if(id==='frost'){const [x,y,w,h]=frostFrames[name]||frostFrames.idle,scale=Math.min(360/w,315/h);Object.assign(sprite.style,{width:w*scale+'px',height:h*scale+'px',backgroundSize:1536*scale+'px '+1024*scale+'px',backgroundPosition:-x*scale+'px '+-y*scale+'px',clipPath:(!frostFrames[name]||name==='idle')?'polygon(0 0,96% 0,96% 60%,100% 60%,100% 100%,0 100%)':''});}
    else{Object.assign(sprite.style,{width:"",height:"",backgroundSize:"",backgroundPosition:"",clipPath:""});}
callout.textContent=message;const effect=name==='attack'?['slam','breath','sweep'][Number(stage.dataset.move)]:name==='blocked'?'block':name==='healing'?'heal':null;if(effect)window.GameSound?.effect(effect,`${next}:${name}`);};
   if(g.phase==='question'){pose('idle','');stage.dataset.enraged=String(Boolean(g.battle?.enraged));return;}
   if(first){pose(g.phase==='completed'?(g.result?.success?'defeat':'victory'):'idle',g.phase==='completed'?(g.result?.success?'BOSS DEFEATED':'THE BOSS WINS'):'');return;}
   // The sequence visualises the authoritative totals; it does not change damage.
   const combat=g.combat||{};
   pose(combat.damage?'hit':combat.heal?'healing':combat.action==='defend'?'blocked':'idle',combat.damage?`−${combat.damage} BOSS HP`:combat.heal?`+${combat.heal} TEAM HP`:combat.action==='defend'?'PARTY DEFENDS':'PARTY WAITS');
   if(g.phase==='completed'&&g.result?.success){later(()=>pose('defeat','BOSS DEFEATED'),950);return;}
   later(()=>pose('windup',combat.move||g.bossMove),1000);
   later(()=>pose('attack',combat.hit?`−${combat.hit} TEAM HP`:'ATTACK BLOCKED'),1700);
   if(combat.shield)later(()=>pose('blocked',`${combat.shield} DAMAGE BLOCKED`),2450);
   later(()=>pose(g.phase==='completed'?'victory':'idle',g.phase==='completed'?'THE BOSS WINS':'READY FOR THE NEXT TURN'),4000);
  }
 };
})();
