'use strict';

// Each hand-written vault pairs a five-letter word with
// a recovery clue. Shuffle without replacement so one run never repeats a vault.
const vaults=[
 ['AMBER','An ancient drop of tree resin.'],
 ['BLADE','The business end of a skate.'],['BLOOM','A garden coming into colour.'],
 ['BRICK','A small piece of a very tall wall.'],['BRUSH','A painter keeps one close.'],
 ['CABLE','It keeps a wired controller connected.'],['CARGO','Everything a freighter is carrying.'],
 ['CHARM','A tiny keepsake on a bracelet.'],['CHESS','A knight moves differently here.'],
 ['CHIME','A sound you might hear at the door.'],['CHORD','Several notes sounding together.'],
 ['CLOUD','It can cast a shadow without touching the ground.'],['CORAL','A reef is built from it.'],
 ['CRANE','A bird that shares its name with a lifting machine.'],['CREST','The highest point of a wave.'],
 ['CROWN','Something a monarch might misplace.'],['DELTA','A river branches out here.'],
 ['DRIFT','A car sliding sideways through a corner.'],['EMBER','The campfire still has one glowing.'],
 ['FERRY','It crosses water on a schedule.'],['FLAME','The moving part of a candle.'],
 ['FLINT','Strike it for a spark.'],['FROST','A cold morning can leave it on glass.'],
 ['GLASS','Look through a window and you look through this.'],['GLIDE','Travel without a wingbeat.'],
 ['GLYPH','A carved symbol with a meaning.'],['GRAPE','A small fruit that grows in bunches.'],
 ['GROVE','A little gathering of trees.'],['IVORY','An old name for the pale keys of a piano.'],
 ['JELLY','A dessert with a wobble.'],['JOUST','Two riders meet with lances.'],
 ['LATCH','It keeps a gate from swinging open.'],['LAYER','One tier of a cake.'],
 ['LEMON','A wedge that makes you pucker.'],['LODGE','A hikers’ shelter in the mountains.'],
 ['MAGIC','A stage illusion might look like this.'],['MAPLE','A tree famous for its syrup.'],
 ['MEDAL','It can hang from a ribbon.'],['METAL','A blacksmith works with this.'],
 ['MOOSE','A giant with antlers.'],['ORBIT','The path a moon follows.'],
 ['PEARL','A treasure sometimes found in a shell.'],['PEDAL','Press this with your foot.'],
 ['PIXEL','One tiny square of a digital picture.'],['PLAZA','An open square in a city.'],
 ['PLUME','A showy feather.'],['PRISM','Light enters and a spectrum emerges.'],
 ['PULSE','A beat you can feel at your wrist.'],['QUILT','A blanket made in patches.'],
 ['RADAR','It picks things up using radio waves.'],['RAVEN','A dark bird with a croaking call.'],
 ['RELAY','A race where you pass a baton.'],['RHYME','Two words that share an ending sound.'],
 ['RIDER','The person on the saddle.'],['RIVER','Follow its current downstream.'],
 ['ROAST','Sunday dinner might be one.'],['ROBIN','A small bird often painted on winter cards.'],
 ['SCOUT','The one who goes ahead to look around.'],['SHADE','A tree provides it on a hot day.'],
 ['SHARD','A piece of a broken mirror.'],['SHELF','A home for a row of books.'],
 ['SHELL','A hermit crab borrows one.'],['SHORE','Where sand meets water.'],
 ['SKATE','Lace this up before stepping onto the ice.'],['SLATE','A dark rock once used for writing.'],
 ['SOLAR','Powered by our nearest star.'],['SPARK','A little flash before a fire.'],
 ['SPELL','A wizard might cast one.'],['SPIRE','A pointed rooftop above the skyline.'],
 ['SPOON','A fork is the wrong tool for soup.'],['SQUAD','A small team on a mission.'],
 ['STACK','A pile with one thing on top of another.'],['STAGE','A performer walks onto it.'],
 ['STAMP','A tiny square that pays for postage.'],['STEAM','A kettle makes plenty of this.'],
 ['STEEL','Iron with a little carbon.'],['STONE','A small one skips across a pond.'],
 ['STORM','Lightning is a clue it is coming.'],['STRAW','Sip a drink through one.'],
 ['SURGE','A sudden rush of energy.'],['SWING','A playground seat on chains.'],
 ['THORN','A rose’s sharp defence.'],['TIGER','A large cat in stripes.'],
 ['TOKEN','A coin-shaped ticket to the arcade.'],['TORCH','A handheld light.'],
 ['TOWER','A tall lookout above the town.'],['TRACE','Follow the outline with a pencil.'],
 ['TRACK','An athlete runs laps here.'],['TRAIL','A path through the woods.'],
 ['TREAD','The pattern underneath a tyre.'],['TRUNK','The part of an elephant that can pick things up.'],
 ['TULIP','A spring flower grown from a bulb.'],['TWIST','A surprise turn in the story.'],
 ['VAULT','A bank keeps its valuables inside.'],['VIVID','Bright, intense and full of colour.'],
 ['WAGON','A cart pulled along a trail.'],['WALTZ','A dance counted in threes.'],
 ['WHALE','A giant that surfaces to breathe.'],['WHEAT','A grain ground to make flour.'],
 ['WHEEL','It turns beneath a car.'],['WINDY','Weather that sends hats flying.'],
 ['WOVEN','Made by crossing threads together.'],['YACHT','A boat built for leisure.'],
 ['YEAST','It helps bread dough rise.'],['ZEBRA','Its coat has black and white stripes.']
];

function markGuess(word,target){
 const marks=Array(5).fill('absent'),remaining=[...target];
 for(let i=0;i<5;i++)if(word[i]===target[i]){marks[i]='exact';remaining[i]=null;}
 for(let i=0;i<5;i++){
  if(marks[i]==='exact')continue;
  const position=remaining.indexOf(word[i]);
  if(position>=0){marks[i]='present';remaining[position]=null;}
 }
 return marks;
}

class WordVault {
 constructor({publish=()=>{},now=Date.now,schedule=setTimeout,cancel=clearTimeout,random=Math.random}={}){
  Object.assign(this,{publish,now,schedule,cancel,random});
  this.phase='idle';
  this.tick=0;this.ballotId=0;
 }
 start({rounds=3,seconds=25}={}){
  if(this.phase!=='idle')throw Error('A vault run is already active.');
  if(!Number.isInteger(rounds)||rounds<1||rounds>10||!Number.isInteger(seconds)||seconds<10||seconds>60)throw Error('Choose 1–10 vaults and 10–60 seconds per ballot.');
  Object.assign(this,{rounds,seconds,score:0,streak:0,round:0,deck:vaults.slice()});
  this.openPuzzle();
 }
 openPuzzle(){
  this.round++;
  [this.puzzle]=this.deck.splice(Math.floor(this.random()*this.deck.length),1);
  this.phase='guessing';this.rows=[];this.solved=false;
  this.openBallot();
 }
 openBallot(){
  this.ballotId++;
  this.ballots=new Set();this.tally=new Map();
  this.arm(this.seconds);
  this.publish();
 }
 arm(seconds){
  this.disarm();
  this.endsAt=this.now()+seconds*1000;
  const tick=this.tick;
  this.timer=this.schedule(()=>{if(tick===this.tick)this.advance();},seconds*1000);
  this.timer?.unref?.();
 }
 disarm(){
  this.tick++;
  if(this.timer!=null)this.cancel(this.timer);
  this.timer=null;this.endsAt=null;
 }
 candidates(){
  return [...this.tally].map(([word,votes])=>({word,votes})).sort((a,b)=>b.votes-a.votes);
 }
 advance(){
  if(this.phase==='reveal'){this.openPuzzle();return;}
  if(this.phase!=='guessing')throw Error('There is no open ballot.');
  const top=this.candidates()[0];
  if(!top){this.openBallot();return;}
  const [answer]=this.puzzle;
  this.rows.push({...top,marks:markGuess(top.word,answer)});
  this.solved=top.word===answer;
  if(!this.solved&&this.rows.length<6){this.openBallot();return;}
  this.streak=this.solved?this.streak+1:0;
  if(this.solved)this.score+=(7-this.rows.length)*100+50*(this.streak-1);
  this.phase=this.round===this.rounds?'completed':'reveal';
  this.tally.clear();this.ballots.clear();
  if(this.phase==='reveal')this.arm(10);else this.disarm();
  this.publish();
 }
 act(action){
  if(action!=='next')throw Error('Unknown vault control.');
  this.advance();
 }
 stop(){this.disarm();this.phase='idle';this.publish();}
 chat(event){
  const match=/^(?:!guess\s+)?([a-z]{5})$/i.exec(String(event?.text||'').trim());
  if(!match||this.phase!=='guessing')return false;
  const word=match[1].toUpperCase(),id=event.user?.id||event.user?.username;
  if(!id||!event.platform)return false;
  if(this.now()>=this.endsAt){this.advance();return true;}
  const key=JSON.stringify([event.platform,String(id).toLowerCase()]);
  if(this.ballots.has(key)||this.ballots.size>=10000||this.rows.some(row=>row.word===word))return true;
  this.ballots.add(key);this.tally.set(word,(this.tally.get(word)||0)+1);
  this.publish();return true;
 }
 getState(){
  if(this.phase==='idle')return {phase:'idle',actions:[]};
  const guessing=this.phase==='guessing';
  const candidates=this.candidates().slice(0,5);
  return {phase:this.phase,name:'Word Vault',title:'Word Vault',prompt:guessing?'Type a five-letter word in chat. The most popular word goes on the board.':this.solved?'Vault cracked!':'The vault held.',
   round:this.round,rounds:this.rounds,ballotId:this.ballotId,endsAt:this.endsAt,options:[],votes:[this.ballots.size],candidates,
   rows:this.rows.map(row=>({...row,marks:[...row.marks]})),attemptLimit:6,score:this.score,streak:this.streak,
   clue:this.rows.length>=3?this.puzzle[1]:null,answer:guessing?null:this.puzzle[0],solved:this.solved,
   actions:this.phase==='completed'?[]:[{id:'next',label:guessing?'Lock in leading word':'Open next vault'}]};
 }
}
module.exports={WordVault,markGuess};
