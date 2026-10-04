/* Presentation reads authoritative game state; hidden votes never reach this view. */
(() => {
 const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let key='', previousCard=null, history=[], gameId='';
 const rank=n=>({1:'A',11:'J',12:'Q',13:'K'})[n]||String(n);
 function card(value,cls){value=value==='?'?value:rank(value);const c=make('div','table-card '+cls);c.append(make('span','card-corner',value),make('strong','card-value',value),make('span','card-suit','♠'));return c;}
 function room(g,root){
  const name=(g.prompt||'The house:').split(':')[0].replace(/^The /,'');
  root.className='premium-scene haunted-room';root.dataset.room=name;const roomId=['library','kitchen','cellar','garden','tower','crypt','attic','conservatory','ballroom'].includes(name)?name:'hall';root.style.setProperty('--room-art',`url("/assets/stage-art/haunted-${roomId}.webp")`);root.dataset.route=String(g.result?.route??-1);
  const plaque=make('div','room-plaque',name.toUpperCase());root.append(plaque);
  const doors=make('div','room-doors');
  (g.options||[]).forEach((o,i)=>{const door=make('div','room-door'+(g.result?.route===i?' chosen':''));door.append(make('span','door-number',String(i+1)),make('strong','door-label',o.name));doors.append(door);});
  root.append(doors);
  const route=make('div','route-map');for(let i=1;i<=g.rounds;i++)route.append(make('span',i<g.round?'visited':i===g.round?'current':'',i<g.round?'◆':String(i)));root.append(route);

 }
 function higher(g,root){
  root.className='premium-scene card-table';
  history=g.cardHistory||[g.card];previousCard=g.previousCard??g.card;
  root.append(make('div','table-brand','GUMPTION CARD CLUB'));
  const pair=make('div','card-pair'),left=card(previousCard??g.card,'current-card'),right=card(g.phase==='question'?'?':g.card,g.phase==='question'?'card-back':'drawn-card');
  left.append(make('small','card-caption','CURRENT'));right.append(make('small','card-caption',g.phase==='question'?'NEXT CARD':'THE DRAW'));pair.append(left,right);root.append(pair);
  const trail=make('div','card-history');trail.append(make('span','','CARDS SEEN'));history.slice(-7).forEach(n=>trail.append(make('b','',rank(n))));root.append(trail);
  root.append(make('div','rank-guide','A · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · J · Q · K'));
 }
 function vault(g,root){
  root.className='premium-scene vault-scene';
  const display=make('div','vault-display');display.append(make('span','eyebrow',g.phase==='question'?'ACCEPTED RANGE':g.phase==='completed'?'SEARCH COMPLETE':'RANGE UPDATED'),make('strong','',`${g.range.low} — ${g.range.high}`),make('span','',g.phase==='question'?'Type one number in chat':'Answers locked'));
  const rail=make('div','range-rail'),fill=make('i','');fill.style.left=`${g.range.low-1}%`;fill.style.width=`${Math.max(1,g.range.high-g.range.low+1)}%`;rail.append(fill);display.append(rail);
  if(g.result?.guesses?.length){const guesses=make('div','guess-trail');guesses.append(make('span','','LAST GUESSES'));g.result.guesses.slice(0,9).forEach(n=>guesses.append(make('b','',String(n))));display.append(guesses);}
  root.append(display);
 }
 function split(g,root){
  root.className='premium-scene crowd-arena';root.append(make('div','crowd-title',g.phase==='question'?'WHERE WILL YOU STAND?':'THE CROWD HAS CHOSEN'));
  const sides=make('div','crowd-sides');(g.options||[]).forEach((o,i)=>{const side=make('div','crowd-side'+(g.result?.winner===i?' minority':''));side.append(make('span','eyebrow',g.phase==='question'?`TYPE ${i+1}`:g.result?.winner===i?'MINORITY WINS':'THE CROWD'),make('strong','crowd-option',o.name));
   const crowd=make('div','crowd-tokens');if(g.phase==='question'){crowd.append(make('span','sealed-label','?'));}else{const count=g.result?.counts?.[i]||0;for(let j=0;j<Math.min(30,count);j++){const username=g.result?.groups?.[i]?.[j];if(!username)continue;const t=make('b','crowd-token',Array.from(username).slice(0,2).join('').toUpperCase());t.title=username;t.style.setProperty('--i',j);crowd.append(t);}side.append(make('b','crowd-count',`${count} ${count===1?'PLAYER':'PLAYERS'}`));}side.append(crowd);sides.append(side);});root.append(sides);
  if(g.phase==='question')root.append(make('div','sealed-votes','COUNTS HIDDEN · CHAT MESSAGES REMAIN PUBLIC'));
 }
 window.PremiumStage={observe(g){
  const next=`${g.gameId}:${g.round}:${g.phase}`;if(next===key)return;const first=gameId!==g.gameId;key=next;
  if(gameId!==g.gameId){history=[];previousCard=null;gameId=g.gameId;}
  let root=document.getElementById('premiumScene');if(!root){root=make('div','premium-scene');root.id='premiumScene';document.querySelector('.arena').prepend(root);}
  root.replaceChildren();root.dataset.animate=String(!first);root.hidden=!['escape','higher','number','split'].includes(g.id);
  if(!root.hidden)({escape:room,higher,vault,number:vault,split}[g.id])(g,root);
  document.getElementById('game').dataset.outcome=g.phase==='question'?'pending':g.result?.success?'success':g.phase==='completed'&&['escape','boss','number'].includes(g.id)?'failure':g.result?.winner>=0?'success':'neutral';
  document.getElementById('game').dataset.round=String(g.round);
  document.getElementById('finalSpotlight')?.remove();
  if(g.phase==='completed'&&g.id!=='boss'){
   const panel=make('section','final-spotlight');panel.id='finalSpotlight';
   let title='',detail='';
   if(g.id==='snacks'){const [a,b]=g.teamScores;title=a===b?'HONOURS EVEN':a>b?'BRITAIN WINS':'THE WORLD WINS';detail=`BRITAIN ${a} · WORLD ${b}`;}
   else if(['higher','split'].includes(g.id)){const leaders=g.leaderboard||[],score=leaders[0]?.score||0;title=score?'THE CHAT CHAMPIONS':'NO POINTS THIS TIME';detail=score?leaders.filter(p=>p.score===score).map(p=>p.username).slice(0,3).join(' · ')+` — ${score} points`:'Play again and make your move';}
   else if(g.id==='escape'){title=g.result?.success?'YOU ESCAPED':'THE HOUSE WINS';detail=`${g.progress} clues collected · ${g.health} courage remaining`;}
   else {title=g.result?.success?'VAULT UNLOCKED':'VAULT SEALED';detail=`The secret number was ${g.revealedNumber}`;}
   panel.append(make('span','eyebrow','KINGGUMPTION · FINAL RESULT'),make('h2','',title),make('p','',detail));
   if(g.id==='number'&&g.result?.success)panel.append(make('small','',g.leaderboard.filter(p=>p.score>0).slice(0,3).map(p=>p.username).join(' · ')));
   document.getElementById('game').append(panel);
  }
 },stop(){key='';gameId='';history=[];}};
})();
