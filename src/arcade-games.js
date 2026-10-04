const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const snacks=require('./snack-bank.json');
const CATALOG=[['escape','Haunted House Escape','Vote 1–3 to escape together.'],['higher','Higher or Lower','Vote 1 for higher, 2 for lower. Cards run from 1 to 100.'],['split','Split the Crowd','Vote 1 or 2. The smaller non-empty group scores.'],['boss','Crowd Boss Battle','Type attack, defend or heal each turn.'],['number','Secret Number Hunt','Guess 1–100. Follow the clues and find the number.'],['snacks','Snack Wars','Vote 1 for Britain or 2 for the world. Every snack shows its origin.']].map(([id,name,help])=>({id,name,help}));
const BOSSES=[
 {id:'pumpkin',name:'The Pumpkin King',title:'LORD OF THE LANTERNS',moves:['Thorn Slam','Phantom Flame','Royal Shockwave'],tint:'#ffad55'},
 {id:'frost',name:'The Frost Wyrm',title:'GUARDIAN OF THE FROZEN CROWN',moves:['Ice Claw','Glacial Breath','Blizzard Wing'],tint:'#7deaff'},
 {id:'golem',name:'The Candy Golem',title:'SOVEREIGN OF THE SUGAR VAULT',moves:['Chocolate Crush','Sugar Shards','Candyquake'],tint:'#e39dff'}
];
const ROOMS=[
 ['The front hall: a cold draught comes from beneath the door.',['Follow the draught','Ring the rusty bell','Read the visitor book'],[2,-1,1]],
 ['The library: one shelf has no dust.',['Pull a dusty book','Push the clean shelf','Call for the librarian'],[0,2,-1]],
 ['The kitchen: footsteps approach from the corridor.',['Hide beneath the table','Light every candle','Follow the footsteps'],[2,1,-1]],
 ['The cellar: fresh air whistles through a crack.',['Open the iron chest','Follow the whispering','Widen the crack'],[1,-1,2]],
 ['The garden: a gate glints beyond the maze.',['Follow the mossy wall','Enter the glowing pond','Climb the stone steps'],[2,-1,1]],
 ['The tower: a rope hangs beside an open window.',['Use the rope','Wake the sleeping portrait','Search the desk'],[2,-1,1]],
 ['The crypt: candle flames bend towards a passage.',['Follow the flames','Read the cursed inscription','Wait for silence'],[2,-1,0]],
 ['The attic: moonlight reveals footprints in the dust.',['Open the rattling box','Follow the footprints','Search an old coat'],[-1,2,1]],
 ['The conservatory: vines cover a broken latch.',['Pull the thorny vine','Clear the latch','Knock on the glass'],[-1,2,0]],
 ['The ballroom: a mirror reflects an open doorway.',['Step towards the doorway','Dance with a shadow','Inspect the chandelier'],[2,-1,1]],
];
const SPLITS=[['Tea','Coffee'],['Sweet','Savoury'],['Ghosts','Zombies'],['Cats','Dogs'],['Night owl','Early bird'],['Teleport','Fly'],['Pizza','Curry'],['Beach','Mountains'],['Biscuits','Cake'],['Co-op','Competitive']];
class ArcadeGames {
 constructor({now=Date.now,random=Math.random,schedule=setTimeout,cancel=clearTimeout,recordEvent=()=>{}}={}){Object.assign(this,{now,random,schedule,cancel,recordEvent});this.events=new EventEmitter();this.events.setMaxListeners(100);this.phase='idle';this.players=new Map();this.serial=0;}
 shuffle(items){return items.map(v=>({v,r:this.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v);}
 start(id,{rounds=5,seconds=20}={}){
  if(!CATALOG.some(g=>g.id===id))throw Error('Unknown game.');
  if(this.phase!=='idle'&&this.phase!=='completed')throw Error('A game is already running.');
  if(!Number.isInteger(rounds)||rounds<3||rounds>10||!Number.isInteger(seconds)||seconds<10||seconds>60)throw Error('Use 3–10 rounds and 10–60 seconds.');
  this.cancel(this.timer);Object.assign(this,{id,rounds,seconds,round:0,gameId:crypto.randomUUID(),players:new Map(),health:5,progress:0,bossHp:100,partyHp:100,teamScores:[0,0],currentCard:1+Math.floor(this.random()*100),target:1+Math.floor(this.random()*100),low:1,high:100,result:null});
  this.boss=BOSSES[Math.floor(this.random()*BOSSES.length)];this.combat=null;
  this.british=this.shuffle(snacks.filter(s=>s.team==='britain'));this.world=this.shuffle(snacks.filter(s=>s.team==='world'));this.rooms=this.shuffle(ROOMS);this.splits=this.shuffle(SPLITS);
  return this.nextRound();
 }
 nextRound(){
  this.round++;this.phase='question';this.votes=new Map();this.endsAt=this.now()+this.seconds*1000;this.result=null;
  if(this.id==='snacks'){this.options=[this.british[(this.round-1)%this.british.length],this.world[(this.round-1)%this.world.length]];this.prompt='Britain vs the world — which snack wins?';}
  if(this.id==='escape'){const room=this.rooms[(this.round-1)%this.rooms.length];this.prompt=room[0];this.options=room[1].map(name=>({name}));this.effects=room[2];}
  if(this.id==='higher'){this.prompt=`Current card: ${this.currentCard}. Will the next card be higher or lower?`;this.options=[{name:'Higher'},{name:'Lower'}];this.nextCard=1+Math.floor(this.random()*99);if(this.nextCard>=this.currentCard)this.nextCard++;}
  if(this.id==='split'){this.prompt='Be in the smaller group to score!';this.options=this.splits[(this.round-1)%this.splits.length].map(name=>({name}));}
  if(this.id==='boss'){this.bossMove=this.boss.moves[(this.round-1)%this.boss.moves.length];this.combat=null;this.prompt=`${this.boss.name} is charging ${this.bossMove}. Choose your move.`;this.options=[{name:'Attack',command:'attack'},{name:'Defend',command:'defend'},{name:'Heal',command:'heal'}];}
  if(this.id==='number'){this.prompt=`Find the secret number: ${this.low}–${this.high}. One guess each this round.`;this.options=[];}
  this.arm(this.seconds*1000,()=>this.resolve());return this.publish();
 }
 arm(ms,fn){this.cancel(this.timer);this.timer=this.schedule(fn,ms);this.timer?.unref?.();}
 handleChatEvent(event){
  if(this.phase!=='question')return false;
  const text=String(event.text||'').trim().toLowerCase();let value;
  if(this.id==='boss')value=['attack','defend','heal'].indexOf(text);
  else if(this.id==='number')value=/^\d{1,3}$/.test(text)?Number(text):-1;
  else value=/^[1-3]$/.test(text)?Number(text)-1:-1;
  if(value<0||(this.id==='number'?(value<this.low||value>this.high):value>=this.options.length))return false;
  if(this.now()>=this.endsAt){this.resolve();return true;}
  const identity=event.user?.id||event.user?.username;if(!identity||!event.platform)return false;
  const key=event.platform+':'+identity;if(this.votes.has(key))return true;
  if(!this.players.has(key)){if(this.players.size>=2000)return true;this.players.set(key,{username:String(event.user.displayName||event.user.username||identity).slice(0,100),platform:event.platform,score:0});}
  this.votes.set(key,value);this.publish();return true;
 }
 resolve(){
  if(this.phase!=='question')return this.getState();
  this.cancel(this.timer);const counts=this.options.map((_,i)=>[...this.votes.values()].filter(v=>v===i).length);let winner=-1,done=this.round>=this.rounds,text='',success=false;
  const max=Math.max(...counts,0),leaders=counts.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  const majority=max>0?leaders[Math.floor(this.random()*leaders.length)]:-1;
  if(this.id==='snacks'){
   if(max&&leaders.length===1){winner=majority;this.teamScores[winner]++;text=this.options[winner].name+' wins this round!';}else text=max?'Tie — neither team scores.':'No votes — neither team scores.';
   if(done)text+=' '+(this.teamScores[0]===this.teamScores[1]?'Snack Wars ends in a draw.':(this.teamScores[0]>this.teamScores[1]?'Britain':'The world')+' wins Snack Wars!');
  }
  if(this.id==='split'){
   if(counts[0]&&counts[1]&&counts[0]!==counts[1]){winner=counts[0]<counts[1]?0:1;text=this.options[winner].name+' is the smaller group — 1 point each!';}else text='No minority this round — no points awarded.';
  }
  if(this.id==='higher'){winner=this.nextCard>this.currentCard?0:1;text=`${this.nextCard} — ${this.options[winner].name.toLowerCase()}! Correct guesses earn 1 point.`;this.currentCard=this.nextCard;}
  if(this.id==='escape'){
   if(majority<0){this.health--;text='Nobody chose a route. The house drains one courage.';}else{const effect=this.effects[majority];this.progress+=Math.max(0,effect);if(effect<0)this.health--;text=this.options[majority].name+': '+(effect>0?`gained ${effect} escape clues.`:effect<0?'a fright costs one courage.':'a dead end.');if(leaders.length>1)text+=' Tied routes were chosen at random.';}
   done=done||this.health<=0;success=this.health>0&&this.progress>=this.rounds;if(done)text+=success?' You escape together!':' The house keeps its secrets. Try another run!';
  }
  if(this.id==='boss'){
   const n=this.votes.size;this.combat={damage:0,shield:0,heal:0,hit:25,move:this.bossMove,style:(this.round-1)%3};if(n){const damage=Math.round(40*counts[0]/n),shield=Math.round(30*counts[1]/n),heal=Math.round(25*counts[2]/n);this.bossHp=Math.max(0,this.bossHp-damage);const hit=this.bossHp?Math.max(0,25-shield):0;this.partyHp=Math.max(0,Math.min(100,this.partyHp+heal)-hit);this.combat={damage,shield:Math.min(25,shield),heal,hit,move:this.bossMove,style:(this.round-1)%3};text=`Dealt ${damage} damage, blocked ${Math.min(25,shield)}, healed up to ${heal}. The boss dealt ${hit}.`;}else{this.partyHp=Math.max(0,this.partyHp-25);text='No moves received. The boss hits for 25.';}
   done=done||this.partyHp<=0||this.bossHp<=0;success=this.bossHp<=0;if(done)text+=success?` ${this.boss.name} is defeated!`:` ${this.boss.name} wins this battle.`;
  }
  if(this.id==='number'){
   const found=[...this.votes].filter(([,v])=>v===this.target);if(found.length){found.forEach(([key])=>this.players.get(key).score++);text=found.map(([key])=>this.players.get(key).username).join(', ')+` found ${this.target}!`;done=true;success=true;}
   else{const guesses=[...this.votes.values()];for(const v of guesses){if(v<this.target)this.low=Math.max(this.low,v+1);if(v>this.target)this.high=Math.min(this.high,v-1);}text=guesses.length?`Higher than ${this.low-1}; lower than ${this.high+1}.`:'No guesses received.';if(done)text+=` The number was ${this.target}.`;}
  }
  if(winner>=0)for(const [key,v] of this.votes)if(v===winner)this.players.get(key).score++;
  this.result={text,counts,winner,success};this.phase=done?'completed':'reveal';this.endsAt=done?null:this.now()+5000;
  try{this.recordEvent({tool:'chat_games',eventType:done?'game_completed':'round_completed',correlationId:this.gameId,metadata:{game:this.id,round:this.round,votes:this.votes.size,result:text}});}catch{}
  if(!done)this.arm(5000,()=>this.nextRound());return this.publish();
 }
 next(){if(this.phase==='question')return this.resolve();if(this.phase==='reveal'){this.cancel(this.timer);return this.nextRound();}throw Error('No active round.');}
 stop(){this.cancel(this.timer);this.phase='idle';this.endsAt=null;return this.publish();}
 getState(){return {gameId:this.gameId||null,id:this.id||null,name:CATALOG.find(g=>g.id===this.id)?.name,help:CATALOG.find(g=>g.id===this.id)?.help,phase:this.phase,round:this.round||0,rounds:this.rounds,seconds:this.seconds,prompt:this.prompt,options:(this.options||[]).map(({name,origin,team,command,image})=>({name,origin,team,command,image})),endsAt:this.endsAt||null,players:this.players.size,answered:this.votes?.size||0,result:this.phase==='question'?null:this.result,card:this.id==='higher'?this.currentCard:undefined,range:this.id==='number'?{low:this.low,high:this.high}:undefined,boss:this.id==='boss'?this.boss:undefined,moveCounts:this.id==='boss'?[0,1,2].map(i=>[...this.votes.values()].filter(v=>v===i).length):undefined,party:this.id==='boss'?[...this.players.values()].slice(0,5).map(({username,platform})=>({username,platform})):undefined,bossMove:this.id==='boss'?this.bossMove:undefined,combat:this.id==='boss'&&this.phase!=='question'?this.combat:null,teamScores:this.teamScores,health:this.health,progress:this.progress,bossHp:this.bossHp,partyHp:this.partyHp,leaderboard:this.phase==='question'?[]:[...this.players.values()].sort((a,b)=>b.score-a.score).slice(0,5),revision:this.serial};}
 publish(){this.serial++;const state=this.getState();this.events.emit('state',state);return state;}
 subscribe(fn){this.events.on('state',fn);return()=>this.events.off('state',fn);}
}
const arcadeGames=new ArcadeGames({recordEvent:event=>require('./db').addEngagementEvent(event)});
module.exports={ArcadeGames,arcadeGames,CATALOG,BOSSES};
