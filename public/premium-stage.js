/* Presentation reads authoritative game state; hidden votes never reach this view. */
(() => {
 const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let key='', previousCard=null, history=[], gameId='';
 function card(value,cls){const c=make('div','table-card '+cls);c.append(make('span','card-corner',value),make('strong','card-value',value),make('span','card-suit','♠'));return c;}
 function room(g,root){
  const name=(g.prompt||'The house:').split(':')[0].replace(/^The /,'');
  root.className='premium-scene haunted-room';root.dataset.room=name;root.dataset.route=String(g.result?.route??-1);
  root.append(make('div','room-ceiling'),make('div','room-floor'));
  const window=make('div','moon-window');window.append(make('i','moon'));root.append(window);
  for(let i=0;i<2;i++){const candle=make('div','wall-candle');candle.style.setProperty('--side',i);candle.append(make('i','flame'));root.append(candle);}
  const plaque=make('div','room-plaque',name.toUpperCase());root.append(plaque);
  const doors=make('div','room-doors');
  (g.options||[]).forEach((o,i)=>{const door=make('div','room-door'+(g.result?.route===i?' chosen':''));const prop=make('div','room-prop');const text=o.name.toLowerCase();prop.dataset.object=/book|desk|inscription|portrait/.test(text)?'book':/bell/.test(text)?'bell':/candle|flame|light|chandelier/.test(text)?'candle':/box|chest|coat/.test(text)?'chest':/rope|vine/.test(text)?'rope':'passage';prop.append(make('i','prop-detail'));door.append(make('span','door-number',String(i+1)),make('div','door-panel'),prop,make('i','door-handle'),make('strong','door-label',o.name));doors.append(door);});
  root.append(doors);
  const route=make('div','route-map');for(let i=1;i<=g.rounds;i++)route.append(make('span',i<g.round?'visited':i===g.round?'current':'',i<g.round?'◆':String(i)));root.append(route);
  if(g.phase==='completed')root.append(make('div','scene-ending',g.result?.success?'THE WAY OUT':'TRAPPED IN THE HOUSE'));
 }
 function higher(g,root){
  root.className='premium-scene card-table';
  if(g.phase==='question'){if(history[history.length-1]!==g.card)history.push(g.card);previousCard=g.card;}
  root.append(make('div','table-brand','GUMPTION CARD CLUB'));
  const pair=make('div','card-pair'),left=card(previousCard??g.card,'current-card'),right=card(g.phase==='question'?'?':g.card,g.phase==='question'?'card-back':'drawn-card');
  left.append(make('small','card-caption','CURRENT'));right.append(make('small','card-caption',g.phase==='question'?'NEXT CARD':'THE DRAW'));pair.append(left,right);root.append(pair);
  const trail=make('div','card-history');trail.append(make('span','','PREVIOUS DRAWS'));history.slice(-7).forEach(n=>trail.append(make('b','',String(n))));root.append(trail);
 }
 function vault(g,root){
  root.className='premium-scene vault-scene';const vault=make('div','vault-machine'),inside=make('div','vault-interior');inside.append(make('strong','',g.revealedNumber===undefined?'THE SECRET':String(g.revealedNumber)));
  const door=make('div','vault-door');for(let i=0;i<8;i++){const bolt=make('i','vault-bolt');bolt.style.left=`${8+(i%4)*27}%`;bolt.style.top=`${8+Math.floor(i/4)*80}%`;door.append(bolt);}
  const dial=make('div','vault-dial');dial.append(make('span','','KG'));door.append(dial,make('span','vault-serial','SUGAR VAULT • Nº 001'));
  vault.append(inside,door);root.append(vault);
  const display=make('div','vault-display');display.append(make('span','eyebrow',g.phase==='question'?'ACCEPTED RANGE':g.phase==='completed'?'SEARCH COMPLETE':'RANGE UPDATED'),make('strong','',`${g.range.low} — ${g.range.high}`),make('span','',g.phase==='question'?'Type one number in chat':'Answers locked'));
  const rail=make('div','range-rail'),fill=make('i','');fill.style.left=`${g.range.low-1}%`;fill.style.width=`${Math.max(1,g.range.high-g.range.low+1)}%`;rail.append(fill);display.append(rail);
  if(g.result?.guesses?.length){const guesses=make('div','guess-trail');guesses.append(make('span','','LAST GUESSES'));g.result.guesses.slice(0,9).forEach(n=>guesses.append(make('b','',String(n))));display.append(guesses);}
  root.append(display);
 }
 function split(g,root){
  root.className='premium-scene crowd-arena';root.append(make('div','crowd-title',g.phase==='question'?'WHERE WILL YOU STAND?':'THE CROWD HAS CHOSEN'));
  const sides=make('div','crowd-sides');(g.options||[]).forEach((o,i)=>{const side=make('div','crowd-side'+(g.result?.winner===i?' minority':''));side.append(make('span','eyebrow',g.phase==='question'?`TYPE ${i+1}`:g.result?.winner===i?'MINORITY WINS':'THE CROWD'),make('strong','crowd-option',o.name));
   const crowd=make('div','crowd-tokens');if(g.phase==='question'){for(let j=0;j<12;j++)crowd.append(make('i','unassigned'));}else{const count=g.result?.counts?.[i]||0;for(let j=0;j<Math.min(30,count);j++){const t=make('i','crowd-token');t.style.setProperty('--i',j);crowd.append(t);}side.append(make('b','crowd-count',`${count} ${count===1?'PLAYER':'PLAYERS'}`));}side.append(crowd);sides.append(side);});root.append(sides);
  if(g.phase==='question')root.append(make('div','sealed-votes','VOTES SEALED · THE SMALLER GROUP SCORES'));
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
