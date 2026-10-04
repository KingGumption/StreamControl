const $=id=>document.getElementById(id);let game,viewKey='';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
function stat(label,value,max,cls=''){const box=node('div','stat '+cls),caption=node('span','',label),number=node('b','',`${value} / ${max}`),track=node('div','stat-track'),fill=node('i');caption.append(number);fill.style.width=`${Math.max(0,Math.min(100,value/max*100))}%`;track.append(fill);box.append(caption,track);return box;}
function card(option,i,g){
 const el=node('article','choice'+(g.result?.winner===i?' winner':''));el.append(node('b','',option.command||String(i+1)));
 if(g.id==='snacks'){
  const art=node('img','snack-art');art.src=option.image||'/assets/game-art/snacks.svg';art.alt=option.name;art.onerror=()=>{art.onerror=null;art.src='/assets/game-art/snacks.svg';};el.append(art,node('span','team-name',option.team==='britain'?'BRITAIN':'THE WORLD'));
 }else el.append(node('span','symbol',g.id==='boss'?['⚔','⬡','✚'][i]:g.id==='higher'?['↗','↘'][i]:g.id==='escape'?['⌁','✦','◈'][i]:['◒','◓'][i]));
 el.append(node('strong','',option.name));if(option.origin)el.append(node('small','',`Origin: ${option.origin}`));
 if(g.id==='boss')el.append(node('small','boss-tally','0 moves'));
 if(g.id!=='boss'&&g.result?.counts){const total=g.result.counts.reduce((a,b)=>a+b,0),votes=g.result.counts[i]||0;el.append(node('small','vote-label',`${votes} votes · ${total?Math.round(votes/total*100):0}%`));const track=node('div','vote-meter'),fill=node('i');fill.style.width=`${total?votes/total*100:0}%`;track.append(fill);el.append(track);}
 return el;
}
function render(g){
 game=g;$('game').hidden=g.phase==='idle';if(g.phase==='idle'){window.BossStage?.stop();window.PremiumStage?.stop();viewKey='';return;}
 $('game').dataset.game=g.id;$('game').dataset.phase=g.phase;
 $('name').textContent=g.id==='boss'?(g.boss?.name||g.name):g.name;
 $('phase').textContent=g.phase==='question'?'YOUR MOVE':g.phase==='completed'?'FINAL RESULT':'THE REVEAL';
 $('round').textContent=`ROUND ${g.round} / ${g.rounds}`;
 $('participation').textContent=`${g.answered||0} LOCKED IN · ${g.players} PLAYERS`;
 const key=`${g.gameId}:${g.round}:${g.phase}`;
 if(key!==viewKey){
  viewKey=key;$('prompt').textContent=g.phase==='question'?(g.prompt||''):g.id==='boss'?'Your team has made its move.':g.id==='higher'?`The next card is ${g.card}.`:g.id==='number'?(g.phase==='completed'?'The vault result':'The search narrows. Follow the new range.'):(g.prompt||'');$('help').textContent=g.phase==='question'?(g.id==='number'?`Guess ${g.range.low}–${g.range.high}. One number each.`:g.help||''):g.phase==='completed'?'Game complete · use controls or a chat command to start the next game.':'Answers locked · next round shortly';
  $('options').replaceChildren(...(g.options||[]).map((o,i)=>card(o,i,g)));
  $('numberGuide').hidden=g.id!=='number';$('range').textContent=`${g.range?.low||1} — ${g.range?.high||100}`;
  $('sceneArt').hidden=g.id==='boss';$('bossStage').hidden=g.id!=='boss';
  if(g.id!=='boss'){$('sceneArt').src='/assets/game-art/'+g.id+'.svg';window.BossStage?.stop();}
  $('sceneValue').textContent=g.id==='higher'?g.card:'';
  $('sceneLabel').textContent=g.id==='higher'?(g.phase==='question'?'CURRENT CARD':'NEW CARD'):g.id==='boss'?'':g.id==='escape'?`ROOM ${g.round}`:g.id==='number'?'CRACK THE VAULT':'';
  const stats=[];
  if(g.id==='snacks')stats.push(node('span','',`BRITAIN  ${g.teamScores?.[0]||0}`),node('span','',`WORLD  ${g.teamScores?.[1]||0}`));
  if(g.id==='boss')stats.push(stat('YOUR TEAM',g.partyHp,100),stat('BOSS',g.bossHp,g.bossMaxHp||100,'danger'));
  if(g.id==='escape')stats.push(stat('COURAGE',g.health,5,'danger'),stat('ESCAPE CLUES',g.progress,g.rounds));
  $('stats').replaceChildren(...stats);
  $('result').textContent=g.result?.text|| (g.id==='boss'?'':g.id==='split'?'':'');
  $('leaders').replaceChildren(...(['higher','split','number'].includes(g.id)?g.leaderboard||[]:[]).filter(p=>p.score>0).slice(0,3).map((p,i)=>node('li','',`${['♛','②','③'][i]} ${p.username} · ${p.score}`)));
  window.PremiumStage?.observe(g);
  window.BroadcastFX?.observe(g,g.id);
 }
 window.GameSound?.observe(g,g.id);
 if(g.id==='boss'){
  $('prompt').textContent=g.phase==='question'?`${g.bossIntent?.label||'INCOMING'} · ${g.bossMove}${g.bossIntent?.hint?' — '+g.bossIntent.hint:''}`:g.phase==='completed'?(g.result?.success?'BOSS DEFEATED':'PARTY DEFEATED'):'RESOLVING THE TURN';
  $('game').dataset.boss=g.boss?.id||'pumpkin';
  $('options').querySelectorAll('.boss-tally').forEach((el,i)=>{const n=(g.moveCounts||g.result?.counts||[])[i]||0;el.textContent=`${n} ${n===1?'move':'moves'}`;});
  const roster=$('battleRoster'),players=g.party||[],rosterKey=JSON.stringify(players);
  if(roster.dataset.players!==rosterKey){roster.dataset.players=rosterKey;roster.replaceChildren(...players.map(p=>{const badge=node('span','party-badge',p.username.slice(0,2).toUpperCase());badge.title=p.username;return badge;}));}
  window.BossStage?.observe(g);
 }
 tick();
}
function tick(){if(!game||game.phase==='idle')return;const remaining=Math.max(0,Math.ceil((game.endsAt-Date.now())/1000));$('timer').textContent=game.endsAt?remaining:'★';$('game').classList.toggle('urgent',game.phase==='question'&&remaining<=3);$('timeFill').style.transform=`scaleX(${game.endsAt?Math.min(1,Math.max(0,(game.endsAt-Date.now())/((game.phase==='question'?game.seconds||20:5)*1000))):1})`;window.GameSound?.tick(game,game.id);}
setInterval(tick,200);
const events=new EventSource('/chat-games/events');events.addEventListener('arcade-state',e=>{try{render(JSON.parse(e.data));$('connection').textContent='';}catch{$('connection').textContent='Waiting for game state…';}});events.onerror=()=>{$('connection').textContent='Reconnecting…';};
