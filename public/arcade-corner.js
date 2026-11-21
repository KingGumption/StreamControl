(() => {
  const main=document.querySelector('main');
  const stages=Object.fromEntries([...main.querySelectorAll('section')].map(stage=>[stage.id,stage]));
  const byId=id=>document.getElementById(id);
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let game, stage, previousBeat;
  function tick(){
    if(main.hidden||!game)return;
    stage.querySelector('.clock').textContent=game.phase==='question'?Math.max(0,Math.ceil((game.endsAt-Date.now())/1000))+'s':game.phase==='completed'?'Final':'Reveal';
  }
  function restartDeal(){
    if(reducedMotion.matches)return;
    stages.higher.classList.remove('deal');
    void stages.higher.offsetWidth;
    stages.higher.classList.add('deal');
  }
  function rank(value){return ({1:'A',11:'J',12:'Q',13:'K'})[value]||String(value??'—');}
  function higher(g,reveal,changed){
    const drawn=byId('draw');
    byId('held').querySelector('b').textContent=rank(reveal?g.previousCard:g.card);
    drawn.classList.toggle('back',!reveal);
    drawn.querySelector('b').textContent=reveal?rank(g.card):'';
    stages.higher.querySelector('h2').textContent=reveal?(g.result?.winner===0?'Higher wins!':'Lower wins!'):'Call the next card';
    stages.higher.querySelector('.bets').hidden=reveal;
    if(changed)restartDeal();
    const correct=g.result?.counts?.[g.result.winner]||0;
    return reveal?correct+(correct===1?' correct call':' correct calls'):'Chat: 1 higher · 2 lower';
  }
  function person(){
    const ns='http://www.w3.org/2000/svg',sprite=document.createElementNS(ns,'svg'),shape=document.createElementNS(ns,'path');
    sprite.setAttribute('viewBox','0 0 10 16');sprite.setAttribute('aria-hidden','true');
    shape.setAttribute('d','M3 0h4v1h1v4H7v1H3V5H2V1h1zM2 7h6v1h2v5H8v-3H7v6H5v-4H4v4H2v-6H1v3H0V8h2z');
    sprite.append(shape);return sprite;
  }
  function split(g,reveal,changed){
    if(changed){
      stages.split.classList.toggle('reveal',reveal);
      for(const [i,id] of ['left','right'].entries()){
        const side=byId(id),crowd=side.querySelector('.crowd');
        side.querySelector('strong').textContent=g.options[i]?.name||'';
        side.classList.toggle('win',reveal&&g.result?.winner===i);
        crowd.replaceChildren();
        if(reveal){
          const votes=g.result?.counts?.[i]||0;
          for(let n=0;n<Math.min(6,votes);n++)crowd.append(person());
          const count=document.createElement('span');count.className='count';count.textContent=votes+' '+(votes===1?'vote':'votes');crowd.append(count);
        }else{
          const label=document.createElement('span');label.className='entry';label.textContent='Type '+(i+1);crowd.append(label);
        }
      }
    }
    return reveal?(g.result?.winner>=0?'Side '+(g.result.winner+1)+' takes the point':'No minority · no points'):'Join the smaller side';
  }
  function number(g,reveal,changed){
    const {low,high}=g.range,finished=g.phase==='completed';
    byId('frequency').textContent=finished?g.revealedNumber:low+'–'+high;
    byId('unit').textContent=finished?'Target':reveal?'Updated range':'Search range';
    const range=byId('range');range.style.left=((low-1)/99*100)+'%';range.style.width=((high-low)/99*100)+'%';
    if(changed){
      const echoes=(g.result?.guesses||[]).map(value=>{const marker=document.createElement('i');marker.style.left=((value-1)/99*100)+'%';return marker;});
      byId('echoes').replaceChildren(...echoes);
    }
    const total=g.result?.guesses?.length||0;
    return finished?(g.result?.success?'Chat found the signal!':'Search complete'):reveal?total+(total===1?' distinct guess':' distinct guesses'):'Type a number from '+low+' to '+high;
  }
  const renderers={higher,split,number};
  function render(g){
    game=g;
    main.hidden=g.phase==='idle'||!Object.hasOwn(stages,g.id);
    if(main.hidden){previousBeat=null;return;}
    stage=stages[g.id];
    for(const section of Object.values(stages))section.hidden=section!==stage;
    const beat=[g.gameId,g.id,g.round,g.phase].join('/');
    const round='R'+g.round+' / '+g.rounds;
    stage.querySelector('.meta').textContent=g.phase==='question'&&g.answered?round+' · '+g.answered+' in':round;
    stage.querySelector('.instruction').textContent=renderers[g.id](g,g.phase!=='question',beat!==previousBeat);
    const leader=g.phase==='completed'&&g.leaderboard?.[0];
    if(leader?.score>0)stage.querySelector('.meta').textContent=leader.username+' · '+leader.score+' pts';
    previousBeat=beat;tick();
  }
  const events=new EventSource('/chat-games/events');
  events.addEventListener('arcade-state',e=>render(JSON.parse(e.data)));
  events.onerror=()=>{main.hidden=true;previousBeat=null;};
  setInterval(tick,250);
})();
