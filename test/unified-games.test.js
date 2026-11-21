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
test('compact layouts are sent on the first overlay update and are scoped to the current launch',t=>{
 const {launcher}=fixture(),updates=[];
 let presets={};
 launcher.load=()=>presets;launcher.save=value=>{presets=value;};
 const unsubscribe=launcher.subscribeOverlay(state=>updates.push(state));
 t.after(()=>{unsubscribe();if(launcher.active())launcher.action('stop',undefined,actor);});
 for(const id of ['word','higher','number','split']){
  launcher.savePreset(id,{layout:'compact'});
  updates.length=0;
  launcher.action('launch',id,actor);
  assert.deepEqual(updates[0],{active:id,layout:'compact'});
  launcher.action('stop',id,actor);
  assert.deepEqual(updates.at(-1),{active:null});
  launcher.action('launch',id,actor,{layout:'full'});
  assert.deepEqual(launcher.overlayState(),{active:id});
  assert.equal(launcher.preset(id).layout,'compact');
  launcher.action('stop',id,actor);
 }
 assert.throws(()=>launcher.savePreset('boss',{layout:'compact'}),/layout/);
 assert.throws(()=>launcher.action('launch','word',actor,{layout:'tiny'}),/layout/);
 assert.deepEqual(launcher.overlayState(),{active:null});
});
test('Word Vault renews host controls on every ballot and counts one vote per platform identity',t=>{
 const {launcher}=fixture(),audience=launcher.audience,events=[];
 audience.games.word.random=()=>0;
 audience.record=event=>events.push(event);
 launcher.action('launch','word-vault',actor,{rounds:1,seconds:10});
 t.after(()=>launcher.action('stop','word',actor));
 const original=audience.snapshot(true).game.turn;
 launcher.action('next','word',actor,{turn:original});
 const current=audience.snapshot(true).game.turn;
 assert.notEqual(current,original,'an empty ballot must invalidate its controls');
 assert.throws(()=>launcher.action('next','word',actor,{turn:original}),/stage has finished/);
 for(const platform of ['twitch','twitch','youtube','tiktok']){
  audience.chat({platform,text:'CRANE',user:{id:'same',username:'Player'}});
 }
 assert.equal(audience.snapshot(true).game.turn,current);
 assert.deepEqual(events.filter(e=>e.eventType==='vote').map(e=>e.platform),['twitch','youtube','tiktok']);
 launcher.action('next','word',actor,{turn:current});
 assert.deepEqual(audience.snapshot().game.rows.map(row=>[row.word,row.votes]),[['CRANE',3]]);
 assert.throws(()=>launcher.action('next','word',actor,{turn:current}),/stage has finished/);
});
test('all games reserve the overlay until explicitly stopped, including completed results',()=>{
 const {launcher:l,quiz:q,arcade:a}=fixture();
 for(const {id} of l.catalog()){
  l.action('launch',id,actor);
  assert.deepEqual(l.overlayState(),{active:id});
  if(id==='quiz')q.phase='completed';
  else if(l.audience.active===null&&id!=='hill'){while(a.phase!=='completed')a.next();}
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
