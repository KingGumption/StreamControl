(() => {
 let last='',timeout;const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 window.BroadcastFX={observe(g,type){
  const canvas=document.querySelector('[data-game-canvas]');if(!canvas)return;
  const key=`${g.gameId}:${g.round}:${g.phase}`;if(key===last)return;
  const first=!last;last=key;clearTimeout(timeout);canvas.querySelector('.fx-burst')?.remove();
  canvas.dataset.show=type;canvas.dataset.moment=g.phase;
  if(g.phase==='idle'||reduced||type==='boss')return;
  // Animate only phase changes, never individual votes or reconnect snapshots.
  canvas.getAnimations?.().forEach(a=>a.cancel());
  if(!first&&['reveal','completed','champion'].includes(g.phase)){
   const burst=document.createElement('div');burst.className='fx-burst';burst.setAttribute('aria-hidden','true');
   for(let i=0;i<22;i++){const spark=document.createElement('i');spark.style.setProperty('--x',`${(i*47)%100}%`);spark.style.setProperty('--delay',`${(i%7)*.08}s`);spark.style.setProperty('--spin',`${i*53}deg`);burst.append(spark);}
   canvas.append(burst);timeout=setTimeout(()=>burst.remove(),2500);
  }
  const targets=canvas.querySelectorAll(type==='quiz'?'.option,.quiz-stage':type==='hill'||type==='higher'?'.choice':'.choice,#sceneArt');
  targets.forEach((el,i)=>el.animate?.([{opacity:.15,transform:`translateY(${20+i*3}px) scale(.96)`},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:450,delay:i*65,easing:'cubic-bezier(.2,.8,.2,1)'}));
 }};
})();
