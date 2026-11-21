(() => {
 const get=id=>document.getElementById(id),game=get('game'),choices=get('choices');
 const platforms={twitch:['Twitch','#bd99ff'],youtube:['YouTube','#ff827b'],tiktok:['TikTok','#7aeee2']};
 let current=null,identity='';
 function element(tag,cls,text){
  const el=document.createElement(tag);el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 }
 function choice(option,phase){
  const card=element('article','choice');
  card.classList.toggle('king',Boolean(option.isKing));
  const cloth=element('div','cloth'),image=element('img','art'),monogram=element('b','monogram',option.title.slice(0,1));
  monogram.setAttribute('aria-hidden','true');
  image.alt='';image.src=option.imageUrl;image.onerror=()=>{image.hidden=true;};
  cloth.append(monogram,image);
  const number=element('span','number',option.number);
  const role=element('div','role',phase==='topic'?'Topic '+option.number:phase==='champion'?'Crowned champion':option.isKing?(current.kingStreak?current.kingStreak+' win streak':'Defending the crown'):'Challenger');
  const name=element('h2','choice-name',option.title);
  const score=element('div','score'),count=element('strong','votes'),percent=element('span','percent');
  score.append(count,percent);
  const details=element('div','details');
  details.append(role,name,score,element('div','platform-breakdown'));
  card.append(cloth,number,details);
  return card;
 }
 function totals(card,option){
  card.querySelector('.votes').textContent=option.votes+(option.votes===1?' vote':' votes');
  card.querySelector('.percent').textContent=option.percent+'%';
  card.querySelector('.platform-breakdown').replaceChildren(...Object.entries(option.platformVotes||{}).filter(([,n])=>n>0).map(([id,n])=>{
   const [name,color]=platforms[id]||[id,'#fff'];
   const stat=element('span','platform-stat',name+' '+n);stat.style.setProperty('--spot',color);return stat;
  }));
 }
 function render(state){
  current=state;
  game.hidden=!state.running||state.phase==='idle';
  if(game.hidden){identity='';return;}
  const {phase}=state;
  game.dataset.phase=phase;
  game.classList.toggle('champion',phase==='champion');
  game.classList.add('visible');
  get('kicker').textContent=phase==='topic'?'Choose the tournament':phase==='champion'?'The crown is claimed':'King of the Hill · Bout '+state.round+' / '+state.totalRounds;
  get('title').textContent=phase==='topic'?'King of the Hill':state.topic?.title||'King of the Hill';
  get('footer').textContent=phase==='champion'?(state.kingStreak?state.kingStreak+' consecutive '+(state.kingStreak===1?'win':'wins'):'Tournament complete'):phase==='topic'?'Type 1 or 2 to choose the topic':'Type 1 or 2 to back a contender';
  const key=JSON.stringify([state.gameId,phase,state.round,state.kingStreak,state.options.map(o=>[o.title,o.imageUrl,o.number,o.isKing])]);
  if(key!==identity){
   identity=key;choices.replaceChildren(...state.options.map(o=>choice(o,phase)));
  }
  state.options.forEach((o,i)=>totals(choices.children[i],o));
  const balance=state.totalVotes?(state.options[0]?.percent??50):50;
  game.style.setProperty('--balance',balance+'%');
  game.querySelector('.tug').setAttribute('aria-label','Vote balance: '+balance+' percent for choice one');
  const shares=state.options.map(option=>state.totalVotes?option.percent/100:0);
  game.querySelectorAll('.trail').forEach((trail,i)=>{
   const pos=trail.getPointAtLength(trail.getTotalLength()*(shares[i]||0));
   const climber=game.querySelectorAll('.climber')[i];
   climber.style.transform='translate('+pos.x+'px,'+pos.y+'px)';
  });
  window.GameSound?.observe(state,'hill');tick();
 }
 function tick(){
  if(!current||game.hidden||current.phase==='champion')return;
  const sec=Math.max(0,Math.ceil((Date.parse(current.endsAt)-Date.now())/1000));
  get('timer').textContent=sec===0&&Date.now()<Date.parse(current.acceptUntil)?'…':sec;
  game.classList.toggle('closing',sec<=5);
  window.GameSound?.tick(current,'hill');
 }
 const events=new EventSource('/king-of-the-hill/events');
 events.addEventListener('hill-state',e=>render(JSON.parse(e.data)));
 setInterval(tick,250);
})();
