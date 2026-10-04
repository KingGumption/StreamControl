const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {ArcadeGames,BOSSES}=require('../src/arcade-games');
const read=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
test('bosses telegraph distinct phases and coordinated teams outperform all-attack',()=>{
 const play=(b,adaptive,rounds)=>{const g=new ArcadeGames({random:()=>(b+.1)/3,schedule:()=>1,cancel:()=>{}});g.start('boss',{rounds});
  while(g.phase!=='completed'){
   const intent=g.getState().bossIntent;assert.ok(intent.hint);assert.ok(intent.power>0);
   const counts=!adaptive?[10,0,0]:intent.type==='opening'?[10,0,0]:intent.type==='heavy'?[2,6,2]:[5,2,3];
   for(let i=0,k=0;i<3;i++)for(let j=0;j<counts[i];j++,k++)g.handleChatEvent({platform:'twitch',text:['attack','defend','heal'][i],user:{id:String(k),username:'P'+k}});
   g.resolve();assert.ok(g.partyHp>=0&&g.partyHp<=100);assert.ok(g.bossHp>=0&&g.bossHp<=g.bossMaxHp);
   if(g.phase!=='completed')g.next();
  }return g;
 };
 for(let b=0;b<BOSSES.length;b++){
  assert.equal(play(b,false,5).result.success,false);
  for(const rounds of [3,4,5])assert.equal(play(b,true,rounds).result.success,true,`${BOSSES[b].id}: ${rounds} rounds`);
 }
});
test('locked reveals expose guesses and selected route, never secret targets or votes early',()=>{
 const g=new ArcadeGames({random:()=>.5,schedule:()=>1,cancel:()=>{}});g.start('number');
 g.handleChatEvent({platform:'twitch',text:'20',user:{id:'a',username:'A'}});
 assert.equal(g.getState().result,null);assert.equal(g.getState().revealedNumber,undefined);
 g.resolve();assert.deepEqual(g.getState().result.guesses,[20]);assert.equal(g.getState().revealedNumber,undefined);
 g.next();g.handleChatEvent({platform:'twitch',text:String(g.target),user:{id:'a',username:'A'}});g.resolve();assert.equal(g.getState().revealedNumber,g.target);
 g.stop();g.start('escape');g.handleChatEvent({platform:'twitch',text:'2',user:{id:'a',username:'A'}});assert.equal(g.getState().result,null);g.resolve();assert.equal(g.getState().result.route,1);
});
test('healing cannot resurrect a team defeated by an incoming hit',()=>{
 const g=new ArcadeGames({random:()=>.1,schedule:()=>1,cancel:()=>{}});g.start('boss');g.partyHp=10;
 g.handleChatEvent({platform:'twitch',text:'heal',user:{id:'a',username:'A'}});g.resolve();assert.equal(g.partyHp,0);assert.equal(g.combat.heal,0);assert.equal(g.result.success,false);
});
test('presentation fields expose current card and range but never future card or hidden target',()=>{
 const g=new ArcadeGames({random:()=>.3,schedule:()=>1,cancel:()=>{}});g.start('higher');assert.equal(g.getState().card,g.currentCard);assert.equal(g.getState().nextCard,undefined);g.stop();g.start('number');assert.deepEqual(g.getState().range,{low:1,high:100});assert.equal(g.getState().target,undefined);
});
test('sound engine deduplicates, respects URL mute and does not replay results after reconnect',()=>{
 let sounds=0;class Audio{constructor(){this.state='running';this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}createOscillator(){sounds++;return{frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){}};}}
 const load=search=>{const window={location:{search},AudioContext:Audio};vm.runInNewContext(read('game-sound.js'),{window,URLSearchParams,Date});return window.GameSound;};
 const audio=load(''),q={gameId:'1',round:1,phase:'question'};audio.observe(q,'boss');assert.equal(sounds,0);audio.observe({...q,phase:'reveal'},'boss');assert.ok(sounds>0);const count=sounds;audio.observe({...q,phase:'reveal'},'boss');assert.equal(sounds,count);audio.observe({...q,gameId:'2',phase:'completed',result:{success:true}},'boss');assert.equal(sounds,count);
 const muted=load('?muted=1');muted.observe(q,'boss');muted.observe({...q,phase:'reveal'},'boss');muted.tick({...q,endsAt:Date.now()+2000},'boss');assert.equal(sounds,count);
});
test('boss sequences deduplicate vote updates and cancel pending actions on stop',()=>{
 const tasks=new Map();let seq=0;const sprite={dataset:{},style:{}},callout={textContent:''},stage={dataset:{},querySelector:selector=>selector==='.boss-sprite'?sprite:callout};
 const window={BossArt:{pumpkin:'/assets/boss-sprites/pumpkin.webp'}};vm.runInNewContext(read('boss-stage.js'),{window,document:{getElementById:()=>stage},setTimeout:fn=>{tasks.set(++seq,fn);return seq;},clearTimeout:id=>tasks.delete(id)});
 const q={gameId:'1',round:1,phase:'question',boss:{id:'pumpkin'},bossMove:'Thorn Slam'};window.BossStage.observe(q);assert.equal(stage.dataset.pose,'idle');
 const result={...q,phase:'reveal',combat:{damage:13,shield:10,heal:8,hit:15,move:'Thorn Slam',style:0}};window.BossStage.observe(result);assert.equal(stage.dataset.pose,'hit');const count=tasks.size;window.BossStage.observe(result);assert.equal(tasks.size,count);for(const fn of tasks.values())fn();assert.equal(stage.dataset.pose,'idle');window.BossStage.stop();assert.equal(tasks.size,0);
});

test('battle tallies update live, duplicate moves stay locked, and the party preview is bounded',()=>{
 const g=new ArcadeGames({random:()=>.3,schedule:()=>1,cancel:()=>{}});g.start('boss');
 for(let i=0;i<7;i++)g.handleChatEvent({platform:'twitch',text:i<3?'attack':i<5?'defend':'heal',user:{id:String(i),username:'Player'+i}});
 assert.deepEqual(g.getState().moveCounts,[3,2,2]);assert.equal(g.getState().party.length,5);
 g.handleChatEvent({platform:'twitch',text:'heal',user:{id:'0',username:'Player0'}});
 assert.deepEqual(g.getState().moveCounts,[3,2,2]);assert.equal(g.getState().combat,null);
 g.resolve();g.next();assert.deepEqual(g.getState().moveCounts,[0,0,0]);
 g.stop();g.start('higher');assert.equal(g.getState().moveCounts,undefined);assert.equal(g.getState().party,undefined);
});
