const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const snacks=require('./snack-bank.json');
const {PROFILES,chooseBossTactic}=require('./boss-tactics');
const CATALOG=[['escape','Haunted House Escape','Vote 1–3. Collect the required clues before courage runs out.'],['higher','Higher or Lower','Vote 1 for higher, 2 for lower. Ace is low, King is high. Equal ranks are redrawn.'],['split','Split the Crowd','Vote 1 or 2. The smaller group scores; a tie or empty side scores nothing.'],['boss','Crowd Boss Battle','Vote 1/attack, 2/defend or 3/heal. Most votes choose ONE action. Defeat the boss before team HP reaches 0. No turn limit.'],['number','Secret Number Hunt','Guess 1–100. Follow the clues and find the number.'],['snacks','Snack Wars','Vote 1 for Britain or 2 for the world. Every snack shows its origin.']].map(([id,name,help])=>({id,name,help}));
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
const SPLITS=[['Tea','Coffee'],['Sweet','Savoury'],['Ghosts','Zombies'],['Cats','Dogs'],['Night owl','Early bird'],['Teleport','Fly'],['Pizza','Curry'],['Beach','Mountains'],['Biscuits','Cake'],['Co-op','Competitive'],['Invisible','Read minds'],['Past','Future'],['Film night','Games night'],['Dragons','Dinosaurs'],['Vampires','Werewolves'],['Haunted castle','Ghost ship'],['Chocolate','Crisps'],['Ketchup','Brown sauce'],['Chips','Roast potatoes'],['Summer','Winter'],['Books','Podcasts'],['Controller','Keyboard'],['Single-player','Multiplayer'],['Space station','Underwater city'],['Sword','Magic'],['Detective','Master thief'],['Explore','Build'],['Save the boss','Take the loot'],['Trick','Treat'],['Sharks','Crocodiles'],['Camping','Hotel'],['Train','Plane'],['Robot helper','Dragon pet'],['Tiny mansion','Huge treehouse'],['One superpower','Three wishes'],['Always lucky','Always clever'],['Tidy desk','Creative chaos'],['Breakfast','Midnight snack'],['Comedy','Horror'],['Museum','Theme park']];
class ArcadeGames {
 constructor({now=Date.now,random=Math.random,schedule=setTimeout,cancel=clearTimeout,recordEvent=()=>{},resolveAvatar=null}={}){Object.assign(this,{now,random,schedule,cancel,recordEvent,resolveAvatar});this.events=new EventEmitter();this.events.setMaxListeners(100);this.phase='idle';this.players=new Map();this.serial=0;}
 shuffle(items){return items.map(v=>({v,r:this.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v);}
 start(id,{rounds=id==='number'?7:id==='boss'?8:5,seconds=20}={}){
  if(!CATALOG.some(g=>g.id===id))throw Error('Unknown game.');
  if(this.phase!=='idle'&&this.phase!=='completed')throw Error('A game is already running.');
  if(id==='boss')rounds=8; // Legacy saved round counts no longer impose a boss turn limit.
  if(!Number.isInteger(rounds)||rounds<3||rounds>10||!Number.isInteger(seconds)||seconds<10||seconds>60)throw Error('Use 3–10 rounds and 10–60 seconds.');
  this.cancel(this.timer);Object.assign(this,{id,rounds,seconds,round:0,gameId:crypto.randomUUID(),players:new Map(),health:5,progress:0,bossHp:100,partyHp:100,teamScores:[0,0],currentCard:1+Math.floor(this.random()*13),previousCard:null,cardHistory:[],target:1+Math.floor(this.random()*100),low:1,high:100,result:null});
  this.boss=BOSSES[Math.floor(this.random()*BOSSES.length)];this.combat=null;this.bossMaxHp=160;this.bossHp=this.bossMaxHp;this.focus=false;this.potions=2;this.lastBossMove=null;this.lastBossAction=null;this.bossGuard=false;this.bossCharged=false;this.bossHeals=1;this.partyActions=[];
  this.british=this.shuffle(snacks.filter(s=>s.team==='britain'));this.world=this.shuffle(snacks.filter(s=>s.team==='world'));this.rooms=this.shuffle(ROOMS);this.splits=this.shuffle(SPLITS);
  return this.nextRound();
 }
 intent(){
  const step=Math.floor(this.random()*3),rage=this.bossHp<=this.bossMaxHp*.3;
  const powers={pumpkin:[24,30,26],frost:[26,28,24],golem:[24,32,24]}[this.boss.id];
  return {action:chooseBossTactic(this),style:step,power:Math.round((Math.min(28,powers[step])+(rage?6:0))*(this.bossCharged?1.6:1))};
 }
 nextRound(){
  this.round++;this.phase='question';this.votes=new Map();this.endsAt=this.now()+this.seconds*1000;this.acceptUntil=this.endsAt+2000;this.result=null;
  if(this.id==='snacks'){this.options=[this.british[(this.round-1)%this.british.length],this.world[(this.round-1)%this.world.length]];this.prompt='Britain vs the world — which snack wins?';}
  if(this.id==='escape'){const room=this.rooms[(this.round-1)%this.rooms.length];this.prompt=room[0];const routes=this.shuffle(room[1].map((name,i)=>({name,effect:room[2][i]})));this.options=routes.map(({name})=>({name}));this.effects=routes.map(({effect})=>effect);}
  if(this.id==='higher'){this.previousCard=this.currentCard;this.cardHistory.push(this.currentCard);this.prompt=`${rank(this.currentCard)} on the table. Will the next rank be higher or lower?`;this.options=[{name:'Higher'},{name:'Lower'}];this.nextCard=1+Math.floor(this.random()*12);if(this.nextCard>=this.currentCard)this.nextCard++;}
  if(this.id==='split'){this.prompt='Be in the smaller group to score!';this.options=this.splits[(this.round-1)%this.splits.length].map(name=>({name}));}
  if(this.id==='boss'){this.bossIntent=this.intent();this.bossMove=this.bossIntent.action==='attack'?this.boss.moves[this.bossIntent.style]:PROFILES[this.boss.id][{defend:'guardName',heal:'healName',charge:'chargeName'}[this.bossIntent.action]];this.combat=null;this.prompt='Choose one party action. The boss move is hidden until the turn resolves.';this.options=[{name:'Attack',command:'attack'},{name:'Defend',command:'defend'},{name:'Heal',command:'heal'}];}
  if(this.id==='number'){this.prompt=`Find the secret number: ${this.low}–${this.high}. One guess each this round.`;this.options=[];}
  this.arm(this.seconds*1000+2000,()=>this.resolve());return this.publish();
 }
 arm(ms,fn){this.cancel(this.timer);this.timer=this.schedule(fn,ms);this.timer?.unref?.();}
 handleChatEvent(event){
  if(this.phase!=='question')return false;
  const text=String(event.text||'').trim().toLowerCase();let value;
  if(this.id==='boss')value=/^[1-3]$/.test(text)?Number(text)-1:({attack:0,one:0,defend:1,two:1,heal:2,three:2}[text]??-1);
  else if(this.id==='number')value=/^\d{1,3}$/.test(text)?Number(text):-1;
  else value=/^[1-3]$/.test(text)?Number(text)-1:-1;
  if(value<0||(this.id==='number'?(value<this.low||value>this.high):value>=this.options.length))return false;
  if(this.now()>=this.acceptUntil){this.resolve();return true;}
  const identity=event.user?.id||event.user?.username;if(!identity||!event.platform)return false;
  const key=event.platform+':'+identity;if(this.votes.has(key))return true;
  if(!this.players.has(key)){if(this.players.size>=2000)return true;this.players.set(key,{username:String(event.user.displayName||event.user.username||identity).slice(0,100),platform:event.platform,score:0,profileImageUrl:safeProfileImage(event.user.profileImageUrl)});
   const player=this.players.get(key),gameId=this.gameId;
   if(!player.profileImageUrl&&event.platform==='twitch'&&this.resolveAvatar){
    Promise.resolve().then(()=>this.resolveAvatar(event.user.username)).then(url=>{
     if(this.gameId!==gameId||this.players.get(key)!==player)return;
     player.profileImageUrl=safeProfileImage(url);if(player.profileImageUrl)this.publish();
    }).catch(()=>{});
   }
  }
  this.votes.set(key,value);this.publish();return true;
 }
 resolve(){
  if(this.phase!=='question')return this.getState();
  this.cancel(this.timer);const counts=this.options.map((_,i)=>[...this.votes.values()].filter(v=>v===i).length);let winner=-1,done=this.id!=='boss'&&this.round>=this.rounds,text='',success=false;
  const max=Math.max(...counts,0),leaders=counts.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  const majority=max>0?leaders[Math.floor(this.random()*leaders.length)]:-1;
  if(this.id==='snacks'){
   if(max&&leaders.length===1){winner=majority;this.teamScores[winner]++;text=this.options[winner].name+' wins this round!';}else text=max?'Tie — neither team scores.':'No votes — neither team scores.';
   if(done)text+=' '+(this.teamScores[0]===this.teamScores[1]?'Snack Wars ends in a draw.':(this.teamScores[0]>this.teamScores[1]?'Britain':'The world')+' wins Snack Wars!');
  }
  if(this.id==='split'){
   if(counts[0]&&counts[1]&&counts[0]!==counts[1]){winner=counts[0]<counts[1]?0:1;text=this.options[winner].name+' is the smaller group — 1 point each!';}else text='No minority this round — no points awarded.';
  }
  if(this.id==='higher'){winner=this.nextCard>this.currentCard?0:1;text=`${rank(this.nextCard)} — ${this.options[winner].name.toLowerCase()}! Correct guesses earn 1 point.`;this.currentCard=this.nextCard;}
  if(this.id==='escape'){
   if(majority<0){this.health--;text='Nobody chose a route. The house drains one courage.';}else{const effect=this.effects[majority];this.progress+=Math.max(0,effect);if(effect<0)this.health--;text=this.options[majority].name+': '+(effect>0?`gained ${effect} escape clues.`:effect<0?'a fright costs one courage.':'a dead end.');if(leaders.length>1)text+=' Tied routes were chosen at random.';}
   success=this.health>0&&this.progress>=this.rounds;done=done||this.health<=0||success;if(done)text+=success?' You escape together!':' The house keeps its secrets. Try another run!';
  }
  if(this.id==='boss'){
   const intent=this.bossIntent,action=majority<0?'wait':['attack','defend','heal'][majority];
   const focused=this.focus,guarded=this.bossGuard,rawDamage=action==='attack'?(focused?56:28):0;
   const damage=guarded&&!focused?Math.ceil(rawDamage/2):rawDamage;
   this.bossGuard=false;
   if(action==='attack')this.focus=false;
   if(action==='defend')this.focus=true;
   const heal=action==='heal'&&this.potions>0&&this.partyHp>0?Math.min(40,100-this.partyHp):0;
   const usedPotion=action==='heal'&&this.potions>0&&this.partyHp>0;
   if(usedPotion)this.potions--;
   this.partyHp=Math.min(100,this.partyHp+heal);
   this.bossHp=Math.max(0,this.bossHp-damage);
   const bossAction=this.bossHp?(intent.action||'attack'):null;
   const attacking=bossAction==='attack';
   const shield=attacking&&action==='defend'?Math.round(intent.power*.75):0;
   const hit=attacking?Math.max(0,intent.power-shield):0;
   const bossHeal=bossAction==='heal'&&this.bossHeals>0?Math.min(PROFILES[this.boss.id].heal,this.bossMaxHp-this.bossHp):0;
   const chargedStrike=attacking&&this.bossCharged;
   if(attacking)this.bossCharged=false;
   if(bossAction==='defend')this.bossGuard=true;
   if(bossAction==='charge')this.bossCharged=true;
   if(bossAction==='heal'&&this.bossHeals>0){this.bossHeals--;this.bossHp+=bossHeal;}
   this.partyHp=Math.max(0,this.partyHp-hit);
   if(bossAction){this.lastBossMove=this.bossMove;this.lastBossAction=bossAction;}
   this.partyActions.push(action);this.partyActions=this.partyActions.slice(-2);
   this.combat={action,damage,shield,heal,hit,bossAction,bossHeal,chargedStrike,guarded:guarded&&rawDamage>0,guardBroken:guarded&&focused&&rawDamage>0,move:bossAction?this.bossMove:null,style:attacking?intent.style:null,focused:action==='attack'&&focused,tied:max>0&&leaders.length>1,usedPotion};
   text=action==='attack'?'Party attacks for '+damage+(guarded?(focused?' — focus pierces the guard.':' — reduced by boss guard.'):'.'):action==='defend'?'Party defends: blocked '+shield+'. Next attack powered up.':action==='heal'?(usedPotion?'Party uses a potion: restored '+heal+'.':'No potions left — the heal fails.'):'No votes — the party waits.';
   if(this.combat.tied)text='Tied vote: '+action+' selected. '+text;
   if(attacking)text+=' '+(chargedStrike?'Charged ':'')+this.bossMove+' hits for '+hit+'.';
   if(bossAction==='defend')text+=' '+this.bossMove+': halves the next turn’s normal attack. Focus pierces it.';
   if(bossAction==='charge')text+=' '+this.bossMove+': stores power for a 60% stronger next attack.';
   if(bossAction==='heal')text+=' '+this.bossMove+': boss restores '+bossHeal+' HP. Recovery used up.';
   done=done||this.partyHp<=0||this.bossHp<=0;success=this.bossHp<=0;if(done)text+=success?' Boss defeated!':' Party defeated!';
  }
  if(this.id==='number'){
   const found=[...this.votes].filter(([,v])=>v===this.target);if(found.length){found.forEach(([key])=>this.players.get(key).score++);text=found.slice(0,3).map(([key])=>this.players.get(key).username).join(', ')+(found.length>3?` and ${found.length-3} more`:'')+` found ${this.target}!`;done=true;success=true;}
   else{const guesses=[...this.votes.values()];for(const v of guesses){if(v<this.target)this.low=Math.max(this.low,v+1);if(v>this.target)this.high=Math.min(this.high,v-1);}text=guesses.length?`Higher than ${this.low-1}; lower than ${this.high+1}.`:'No guesses received.';if(done)text+=` The number was ${this.target}.`;}
  }
  if(winner>=0)for(const [key,v] of this.votes)if(v===winner)this.players.get(key).score++;
  this.result={text,counts,winner,success};
  if(this.id==='boss')this.result.action=majority;
  if(this.id==='higher')this.result.previousCard=this.previousCard;
  if(this.id==='escape')this.result.route=majority;
  if(this.id==='split')this.result.groups=[0,1].map(side=>[...this.votes].filter(([,v])=>v===side).slice(0,18).map(([key])=>this.players.get(key).username));
  if(this.id==='number')this.result.guesses=[...new Set(this.votes.values())].sort((a,b)=>a-b);this.phase=done?'completed':'reveal';this.endsAt=done?null:this.now()+5000;
  try{this.recordEvent({tool:'chat_games',eventType:done?'game_completed':'round_completed',correlationId:this.gameId,metadata:{game:this.id,round:this.round,votes:this.votes.size,result:text}});}catch{}
  if(!done)this.arm(5000,()=>this.nextRound());return this.publish();
 }
 next(){if(this.phase==='question')return this.resolve();if(this.phase==='reveal'){this.cancel(this.timer);return this.nextRound();}throw Error('No active round.');}
 stop(){this.cancel(this.timer);this.phase='idle';this.endsAt=null;return this.publish();}
 getState(){return {gameId:this.gameId||null,id:this.id||null,name:CATALOG.find(g=>g.id===this.id)?.name,help:CATALOG.find(g=>g.id===this.id)?.help,phase:this.phase,round:this.round||0,rounds:this.id==='boss'?null:this.rounds,seconds:this.seconds,prompt:this.prompt,options:(this.options||[]).map(({name,origin,team,command,image})=>({name,origin,team,command,image})),endsAt:this.endsAt||null,acceptUntil:this.phase==='question'?this.acceptUntil:null,players:this.players.size,answered:this.votes?.size||0,result:this.phase==='question'?null:this.result,revealedNumber:this.id==='number'&&this.phase==='completed'?this.target:undefined,card:this.id==='higher'?this.currentCard:undefined,previousCard:this.id==='higher'?this.previousCard:undefined,cardHistory:this.id==='higher'?[...this.cardHistory]:undefined,cardLabel:this.id==='higher'?rank(this.currentCard):undefined,range:this.id==='number'?{low:this.low,high:this.high}:undefined,boss:this.id==='boss'?this.boss:undefined,moveCounts:this.id==='boss'?[0,1,2].map(i=>[...this.votes.values()].filter(v=>v===i).length):undefined,party:this.id==='boss'?[...this.players.entries()].sort(([a],[b])=>Number(this.votes.has(b))-Number(this.votes.has(a))).slice(0,5).map(([key,{username,platform,profileImageUrl}])=>({username,platform,profileImageUrl,voted:this.votes.has(key),action:this.votes.has(key)?this.votes.get(key)+1:null})):undefined,bossIntent:undefined,bossMove:this.id==='boss'&&this.phase!=='question'?this.combat?.move:undefined,battle:this.id==='boss'?{focus:this.focus,potions:this.potions,lastMove:this.lastBossMove,bossGuard:this.bossGuard,bossCharged:this.bossCharged,bossHeals:this.bossHeals,enraged:this.bossHp<=this.bossMaxHp*.3}:undefined,combat:this.id==='boss'&&this.phase!=='question'?this.combat:null,teamScores:this.teamScores,health:this.health,progress:this.progress,bossMaxHp:this.bossMaxHp,bossHp:this.bossHp,partyHp:this.partyHp,leaderboard:this.phase==='question'?[]:[...this.players.values()].sort((a,b)=>b.score-a.score).slice(0,5),revision:this.serial};}
 publish(){this.serial++;const state=this.getState();this.events.emit('state',state);return state;}
 subscribe(fn){this.events.on('state',fn);return()=>this.events.off('state',fn);}
}
function safeProfileImage(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
const arcadeGames=new ArcadeGames({resolveAvatar:require('./avatar-resolver').resolveTwitchAvatar,recordEvent:event=>require('./db').addEngagementEvent(event)});
function rank(n){return ({1:'Ace',11:'Jack',12:'Queen',13:'King'})[n]||String(n);}
module.exports={ArcadeGames,arcadeGames,CATALOG,BOSSES};
