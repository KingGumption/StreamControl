const test=require('node:test'),assert=require('node:assert/strict');
const {GameLauncher}=require('../src/game-launcher');
const {QuizGame}=require('../src/quiz-game');
const {HillGame}=require('../src/hill-game');
const {ArcadeGames}=require('../src/arcade-games');
const {normalizeStreamerBotEvent}=require('../src/chat-events');
function fixture(){
 const opts={schedule:()=>1,cancel:()=>{},random:()=>.25};
 const quiz=new QuizGame(opts),hill=new HillGame(opts),arcade=new ArcadeGames(opts);
 let enabled=false;
 const launcher=new GameLauncher({quiz,hill,arcade,permission:()=>enabled,load:()=>({}),audit:()=>{}});
 return {quiz,hill,arcade,launcher,enable:value=>enabled=value};
}
const actor={role:'owner'};
const chat=(text,role='moderator')=>({platform:'twitch',text,user:{id:'user',roles:[role]}});
test('all eight games reserve the overlay until explicitly stopped, including completed results',()=>{
 const {launcher:l,quiz:q,arcade:a}=fixture();
 for(const {id} of l.catalog()){
  l.action('launch',id,actor);
  assert.deepEqual(l.overlayState(),{active:id});
  if(id==='quiz')q.phase='completed';
  else if(id!=='hill'){while(a.phase!=='completed')a.next();}
  for(const next of l.catalog())assert.throws(()=>l.action('launch',next.id,actor),/Stop it first/);
  assert.equal(l.active(),id);
  l.action('stop',undefined,actor);assert.deepEqual(l.overlayState(),{active:null});
 }
});
test('moderator toggle blocks every chat mutation immediately while broadcaster retains control',()=>{
 const {launcher:l,enable,quiz:q}=fixture();
 for(const cmd of ['!launch quiz','!start quiz','!next quiz','!stop quiz','!stop'])assert.match(l.chat(chat(cmd)),/disabled/);
 enable(true);assert.match(l.chat(chat('!launch quiz')),/joining/);
 enable(false);
 for(const cmd of ['!start quiz','!next quiz','!stop quiz','!stop'])assert.match(l.chat(chat(cmd)),/disabled/);
 assert.equal(q.phase,'lobby');
 assert.equal(q.handleChatEvent(chat('!join','viewer')),true);
 assert.match(l.chat(chat('!start quiz','broadcaster')),/accepted/);
 assert.equal(q.phase,'question');
 assert.match(l.chat(chat('!stop','broadcaster')),/quiz: stop accepted/);
 enable(true);assert.match(l.chat(chat('!launch snacks')),/accepted/);
 assert.match(l.chat(chat('!next snacks')),/accepted/);
 assert.match(l.chat(chat('!stop')),/accepted/);
 assert.equal(l.active(),null);
});
test('shared overlay subscription follows engines and releases listeners on disconnect',()=>{
 const {launcher:l,arcade:a,hill:h}=fixture();const updates=[];
 const off=l.subscribeOverlay(state=>updates.push(state));
 l.action('launch','snacks',actor);assert.deepEqual(updates.at(-1),{active:'snacks'});
 l.action('stop','snacks',actor);assert.deepEqual(updates.at(-1),{active:null});
 l.action('launch','hill',actor);assert.deepEqual(updates.at(-1),{active:'hill'});
 off();const count=updates.length;h.stop();a.start('snacks');assert.equal(updates.length,count);
});
test('streamer control commands survive Streamer.bot self-message filtering without granting roles',()=>{
 for(const [source,type]of [['Twitch','ChatMessage'],['YouTube','Message']]){
  for(const text of ['!launch quiz','!start quiz','!next quiz','!stop']){
   const event=normalizeStreamerBotEvent({event:{source,type},data:{text,message:text,meta:{isMe:true},user:{id:'owner',login:'owner',name:'owner',isBroadcaster:true}}});
   assert.equal(event.text,text);assert.ok(event.user.roles.includes('broadcaster'));
  }
  const event=normalizeStreamerBotEvent({event:{source,type},data:{text:'!stop',message:'!stop',meta:{isMe:true},user:{id:'viewer',login:'viewer',name:'viewer'}}});
  assert.equal(event.user.roles.includes('broadcaster'),false);
 }
});
