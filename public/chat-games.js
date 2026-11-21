(() => {
 const {c,scenes}=ArcadeDraw,root=document.getElementById('game');
 const board=document.getElementById('board'),summary=document.getElementById('description');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const palettes={
  higher:['#5c9c88','#ebc687','#132d2b'],escape:['#8ea69c','#e9b879','#211c27'],
  boss:['#8fb6ea','#e7b975','#211c30'],split:['#d89772','#c2ce86','#203a33'],
  snacks:['#88ccbc','#f8cd69','#302530'],number:['#7de8b4','#d1c68a','#13282a']
 };
 let game=null,palette=null,phaseKey='',since=0,lastVote=-Infinity,frame=0,lastDraw=0,dirty=false;
 function colours(){
  if(!game)return;
  const css=getComputedStyle(document.documentElement),[a,b,ink]=palettes[game.id];
  palette={a:css.getPropertyValue('--accent').trim()||a,b:css.getPropertyValue('--gold').trim()||b,ink:css.getPropertyValue('--theme-deep').trim()||ink};
  dirty=true;
 }
 new MutationObserver(colours).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 function paint(now){
  frame=0;if(!game||document.hidden)return;
  const age=now-since,voteAge=now-lastVote;
  const moving=!reduced.matches&&(age<1000||voteAge<500||game.id==='number'||game.id==='split');
  if(dirty||now-lastDraw>=(moving?1000/24:200)){
   dirty=false;lastDraw=now;c.save();c.clearRect(0,0,1080,640);
   try{scenes[game.id](game,palette,reduced.matches?0:now/1000,reduced.matches?10000:age,reduced.matches?10000:voteAge);}finally{c.restore();}
   window.GameSound?.tick(game,game.id);
  }
  frame=requestAnimationFrame(paint);
 }
 function schedule(){if(game&&!frame&&!document.hidden)frame=requestAnimationFrame(paint);}
 document.addEventListener('visibilitychange',schedule);
 function render(g){
  if(!scenes[g.id]||g.phase==='idle'){
   game=null;root.hidden=true;window.BossStage?.stop();cancelAnimationFrame(frame);frame=0;phaseKey='';return;
  }
  const newGame=g.gameId!==game?.gameId,newScene=g.id!==game?.id;
  if(newGame||g.round!==game?.round)lastVote=-Infinity;
  else if(g.answered>game.answered)lastVote=performance.now();
  game=g;root.hidden=false;root.dataset.game=g.id;root.dataset.phase=g.phase;
  if(newScene||!palette)colours();
  const key=g.gameId+':'+g.round+':'+g.phase;
  if(key!==phaseKey){
   // A newly attached OBS source shows the settled state on its first frame.
   since=performance.now()-(newGame?2000:0);phaseKey=key;
   const health=g.id==='boss'?'Party health '+g.partyHp+' of 100. Boss health '+g.bossHp+' of '+g.bossMaxHp+'.':null;
   summary.textContent=[g.name,'Round '+g.round,g.phase==='question'?g.prompt:g.result?.text,health,...(g.options||[]).map((o,i)=>(i+1)+': '+o.name),g.phase==='question'?g.help:''].filter(Boolean).join('. ');
   board.setAttribute('role','img');
  }
  document.getElementById('bossStage').hidden=g.id!=='boss';
  if(g.id==='boss')window.BossStage.observe(g);else if(newScene)window.BossStage.stop();
  window.GameSound?.observe(g,g.id);dirty=true;schedule();
 }
 const events=new EventSource('/chat-games/events'),connection=document.getElementById('connection');
 events.addEventListener('arcade-state',e=>{render(JSON.parse(e.data));connection.textContent='';});
 events.onerror=()=>{connection.textContent='Reconnecting…';};
})();
