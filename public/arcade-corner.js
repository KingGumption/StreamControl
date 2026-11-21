(() => {
 const el=id=>document.getElementById(id), card=document.querySelector('main');
 let game;
 function tick(){
  if(!game||card.hidden)return;
  el('clock').textContent=game.phase==='question'?Math.max(0,Math.ceil((game.endsAt-Date.now())/1000))+'s':game.phase==='completed'?'Final':'Reveal';
 }
 function render(g){
  game=g;card.hidden=g.phase==='idle'||!['higher','number','split'].includes(g.id);
  if(card.hidden)return;
  const result=g.phase!=='question';
  card.dataset.kind=g.id;card.dataset.result=result;
  card.querySelector('h1').textContent=g.name;
  el('round').textContent='Round '+g.round+' / '+g.rounds;
  const rank=({Ace:'A',King:'K',Queen:'Q',Jack:'J'})[g.cardLabel]||g.cardLabel;
  card.querySelector('.stamp b').textContent=g.id==='higher'?rank:g.id==='split'?'½':g.revealedNumber??'#';
  // The full result can contain several long viewer names. Keep the number legible on a corner card.
  const numberFinal=g.id==='number'&&g.phase==='completed';
  const resultText=numberFinal?(g.result.success?'Chat found '+g.revealedNumber+'!':'The number was '+g.revealedNumber+'.'):g.result?.text;
  card.querySelector('h2').textContent=result?resultText:g.id==='higher'?'Call the next card':g.id==='split'?'Pick the smaller side':g.range.low+' – '+g.range.high;
  const choices=el('choices');choices.replaceChildren();
  if(!result)for(const [index,option] of g.options.entries()){
   const item=document.createElement('span'),number=document.createElement('b');number.textContent=index+1;
   item.append(number,option.name);choices.append(item);
  }
  el('rule').textContent=result?(g.phase==='completed'?'Final scores':'Answers locked'):g.id==='number'?'Type a number in chat':'Type 1 or 2 in chat';
  const leader=g.leaderboard?.[0];
  const activity=el('activity');
  if(result&&leader&&leader.score>0){
   const name=document.createElement('span');
   name.textContent=leader.username;
   activity.replaceChildren(name,' · '+leader.score+(leader.score===1?' pt':' pts'));
  }else activity.textContent=g.answered+' locked in';
  tick();
 }
 const events=new EventSource('/chat-games/events');
 events.addEventListener('arcade-state',e=>render(JSON.parse(e.data)));
 events.onerror=()=>{card.hidden=true;};
 setInterval(tick,250);
})();
