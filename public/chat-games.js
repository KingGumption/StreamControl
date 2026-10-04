const $=id=>document.getElementById(id);let game,viewKey='';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
function stat(label,value,max,cls=''){const box=node('div','stat '+cls),caption=node('span','',label),number=node('b','',`${value} / ${max}`),track=node('div','stat-track'),fill=node('i');caption.append(number);fill.style.width=`${Math.max(0,Math.min(100,value/max*100))}%`;track.append(fill);box.append(caption,track);return box;}
function card(option,i,g){
 const el=node('article','choice'+((g.id==='boss'?g.result?.action:g.result?.winner)===i?' winner':''));el.append(node('b','',g.id==='boss'?String(i+1):option.command||String(i+1)));
 if(g.id==='snacks'){
  const art=node('img','snack-art');art.src=option.image||'/assets/game-art/snacks.svg';art.alt=option.name;art.onerror=()=>{art.onerror=null;art.src='/assets/game-art/snacks.svg';};el.append(art,node('span','team-name',option.team==='britain'?'BRITAIN':'THE WORLD'));
  }else if(g.id==='boss'){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.classList.add('action-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',[
   'M14 3h7v7L10 21l-7-7L14 3Z M5 19l-3 3 M4 12l8 8 M9 15L18 6',
   'M12 2 21 6v6c0 5-6 9-9 10-3-1-9-5-9-10V6l9-4Z M12 6v12',
   'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z'
  ][i]);icon.append(shape);el.append(icon);
 }else el.append(node('span','symbol',g.id==='boss'?['⚔','⬡','✚'][i]:g.id==='higher'?['↗','↘'][i]:g.id==='escape'?['⌁','✦','◈'][i]:['◒','◓'][i]));
 el.append(node('strong','',option.name));if(option.origin)el.append(node('small','',`Origin: ${option.origin}`));
 if(g.id==='boss')el.append(node('small','boss-tally','0 votes'),node('span','move-explanation',[g.battle?.focus?(g.battle?.bossGuard?'56 DAMAGE · PIERCES GUARD':'56 DAMAGE · FOCUSED'):(g.battle?.bossGuard?'14 DAMAGE · BOSS GUARDED':'28 DAMAGE'),'75% BLOCK · NEXT ATTACK ×2',g.battle?.potions?`+40 HP · ${g.battle.potions} POTIONS`:'NO POTIONS LEFT'][i]));
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
  viewKey=key;$('prompt').textContent=g.phase==='question'?(g.prompt||''):g.id==='boss'?'Your team has made its move.':g.id==='higher'?`The draw is ${g.cardLabel||g.card}.`:g.id==='number'?(g.phase==='completed'?'The vault result':'The search narrows. Follow the new range.'):(g.prompt||'');$('help').textContent=g.phase==='question'?(g.id==='number'?`Guess ${g.range.low}–${g.range.high}. One number each.`:g.id==='escape'?`Collect ${g.rounds} clues · ${g.rounds} rooms maximum · type 1, 2 or 3`:g.help||''):g.phase==='completed'?'Game complete · stop this game before launching another.':'Answers locked · next round shortly';
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
  $('prompt').textContent=g.phase==='question'?`${g.battle?.enraged?'ENRAGED · ':''}MAJORITY CHOOSES ONE ACTION${g.battle?.lastMove?' · Last: '+g.battle.lastMove:''}`:g.phase==='completed'?(g.result?.success?'BOSS DEFEATED':'PARTY DEFEATED'):'RESOLVING THE TURN';
  $('game').dataset.boss=g.boss?.id||'pumpkin';
  $('bossTactics').textContent=g.phase==='completed'?'':[g.battle?.bossGuard?'GUARDED · normal hits halved':'',g.battle?.bossCharged?'CHARGED · next strike +60%':'',g.battle?.enraged?'ENRAGED':''].filter(Boolean).join('  ·  ');
  $('options').querySelectorAll('.boss-tally').forEach((el,i)=>{const n=(g.moveCounts||g.result?.counts||[])[i]||0;el.textContent=`${n} ${n===1?'vote':'votes'}`;});
  const roster=$('battleRoster'),players=g.party||[],rosterKey=JSON.stringify(players);
  if(roster.dataset.players!==rosterKey){roster.dataset.players=rosterKey;roster.replaceChildren(...players.map(p=>{const badge=node('span','party-badge',p.username.slice(0,2).toUpperCase());badge.title=p.username+(p.voted?' · Voted '+p.action:' · Waiting');badge.classList.toggle('voted',Boolean(p.voted));
   if(p.profileImageUrl){try{const url=new URL(p.profileImageUrl);if(url.protocol==='https:'){const img=document.createElement('img');img.src=url.href;img.alt=p.username;img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});badge.append(img);}}catch{}}
   if(p.voted){const mark=node('small','vote-mark',String(p.action));badge.append(mark);}return badge;}));}
  window.BossStage?.observe(g);
 }
 tick();
}
function tick(){if(!game||game.phase==='idle')return;const remaining=Math.max(0,Math.ceil((game.endsAt-Date.now())/1000));const grace=game.phase==='question'&&remaining===0&&Date.now()<(game.acceptUntil||0);$('timer').textContent=grace?'…':game.endsAt?remaining:'★';if(grace)$('phase').textContent='LAST CALL';else if(game.phase==='question')$('phase').textContent='YOUR MOVE';$('game').classList.toggle('urgent',game.phase==='question'&&remaining<=3);$('timeFill').style.transform=`scaleX(${game.endsAt?Math.min(1,Math.max(0,(game.endsAt-Date.now())/((game.phase==='question'?game.seconds||20:5)*1000))):1})`;window.GameSound?.tick(game,game.id);}
setInterval(tick,200);
const events=new EventSource('/chat-games/events');events.addEventListener('arcade-state',e=>{try{render(JSON.parse(e.data));$('connection').textContent='';}catch{$('connection').textContent='Waiting for game state…';}});events.onerror=()=>{$('connection').textContent='Reconnecting…';};
