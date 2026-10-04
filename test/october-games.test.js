const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {ArcadeGames,CATALOG}=require('../src/arcade-games');
const {QuizGame}=require('../src/quiz-game');
const {HillGame,TOPICS}=require('../src/hill-game');
const {GameLauncher}=require('../src/game-launcher');
const {PolaroidRuntime}=require('../src/polaroid/runtime');
const {ConnectorRuntime}=require('../src/connector-runtime');
const snacks=require('../src/snack-bank.json');
function fixture(Type=ArcadeGames){let now=1000,callback;const game=new Type({now:()=>now,random:()=>.25,schedule:fn=>{callback=fn;return 1;},cancel:()=>{}});return{game,at:n=>now=n,tick:()=>callback()};}
const chat=(id,text,roles=[])=>({platform:'twitch',text,user:{id,username:id,roles}});
test('all six chat games complete automatically without votes and stop cancels their timers',()=>{
 for(const {id} of CATALOG){const f=fixture();f.game.start(id,{rounds:3,seconds:10});let safety=0;while(f.game.phase!=='completed'&&safety++<10)f.tick();assert.equal(f.game.phase,'completed',id);assert.equal(f.game.getState().result.counts.reduce((a,b)=>a+b,0),0);f.game.stop();assert.equal(f.game.phase,'idle');}
});
test('Snack Wars always pairs Britain against the world and exposes origin, never vote totals early',()=>{
 const f=fixture();f.game.start('snacks',{rounds:10,seconds:10});const seen=new Set();
 for(let round=1;round<=10;round++){const s=f.game.getState();assert.equal(s.options[0].team,'britain');assert.equal(s.options[1].team,'world');s.options.forEach(o=>{assert.ok(o.origin);assert.ok(!seen.has(o.name));seen.add(o.name);});f.game.handleChatEvent(chat('a','1'));f.game.handleChatEvent(chat('a','2'));f.game.handleChatEvent(chat('b','2'));assert.equal(f.game.getState().result,null);f.game.resolve();assert.deepEqual(f.game.result.counts,[1,1]);assert.deepEqual(f.game.teamScores,[0,0]);if(round<10)f.tick();}
 assert.equal(f.game.phase,'completed');assert.match(f.game.result.text,/draw/);snacks.forEach(s=>assert.match(s.source,/^https:\/\//));
});
test('split rewards only the smaller non-empty group and accepts only first choice',()=>{
 const f=fixture();f.game.start('split');f.game.handleChatEvent(chat('a','1'));f.game.handleChatEvent(chat('a','2'));f.game.handleChatEvent(chat('b','2'));f.game.handleChatEvent(chat('c','2'));f.game.resolve();assert.equal(f.game.players.get('twitch:a').score,1);assert.equal(f.game.players.get('twitch:b').score,0);
 f.game.next();f.game.handleChatEvent(chat('a','1'));f.game.resolve();assert.equal(f.game.result.winner,-1);f.game.stop();
});
test('arcade deadline rejects late answers and higher/lower never leaks the next card',()=>{
 const f=fixture();f.game.start('higher',{seconds:10,rounds:3});assert.equal(f.game.getState().nextCard,undefined);assert.notEqual(f.game.currentCard,f.game.nextCard);const correct=f.game.nextCard>f.game.currentCard?'1':'2';f.at(10999);f.game.handleChatEvent(chat('a',correct));f.at(11000);f.game.handleChatEvent(chat('late',correct));assert.equal(f.game.players.has('twitch:late'),false);assert.equal(f.game.players.get('twitch:a').score,1);f.game.stop();
});
test('number hunt bounds shrink correctly, exact guesses win together, target remains secret',()=>{
 const f=fixture();f.game.start('number');const target=f.game.target;assert.equal(f.game.getState().target,undefined);f.game.handleChatEvent(chat('a',String(target-1)));f.game.handleChatEvent(chat('b',String(target+1)));f.game.resolve();assert.equal(f.game.low,target);assert.equal(f.game.high,target);f.game.next();f.game.handleChatEvent(chat('a',String(target)));f.game.handleChatEvent(chat('b',String(target)));f.game.resolve();assert.equal(f.game.phase,'completed');assert.equal(f.game.result.success,true);assert.equal(f.game.getState().leaderboard.length,2);
});
test('escape has a achievable cooperative win and failure, boss can be beaten with coordinated attacks',()=>{
 const f=fixture();f.game.start('escape',{rounds:3});for(let i=0;i<3;i++){f.game.handleChatEvent(chat('a',String(f.game.effects.indexOf(2)+1)));f.game.resolve();if(i<2)f.game.next();}assert.equal(f.game.result.success,true);
 f.game.start('boss',{rounds:5});let turns=0;while(f.game.phase!=='completed'&&turns++<5){const intent=f.game.bossIntent;const moves=intent.type==='opening'?['attack','attack','attack','attack','attack']:intent.type==='heavy'?['attack','defend','defend','defend','heal']:['attack','attack','attack','defend','heal'];moves.forEach((move,i)=>f.game.handleChatEvent(chat('p'+i,move)));f.game.resolve();if(f.game.phase!=='completed')f.game.next();}assert.equal(f.game.phase,'completed');assert.equal(f.game.bossHp,0);assert.equal(f.game.result.success,true);
});
test('one-step quiz waits for joining, starts once, closes empty lobbies and manual start cancels countdown',()=>{
 const f=fixture(QuizGame);const initial=f.game.launch({questionCount:1,answerSeconds:5,lobbySeconds:5});assert.equal(initial.phase,'lobby');assert.equal(initial.lobbyEndsAt,6000);f.game.handleChatEvent(chat('a','!join'));f.tick();assert.equal(f.game.phase,'question');f.game.stop();f.game.launch({lobbySeconds:5});f.tick();assert.equal(f.game.phase,'idle');assert.match(f.game.lobbyNotice,/nobody joined/);f.game.stop();
});
test('launcher requires roles and toggle, shares active-game checks and supports aliases',()=>{
 let enabled=false,settings={};const q=fixture(QuizGame).game,h=fixture(HillGame).game,a=fixture().game;const l=new GameLauncher({quiz:q,hill:h,arcade:a,permission:()=>enabled,load:()=>settings,save:s=>settings=s,audit:()=>{}});
 assert.match(l.chat(chat('viewer','!launch quiz')),/disabled/);assert.match(l.chat(chat('mod','!launch quiz',['moderator'])),/disabled/);enabled=true;assert.match(l.chat(chat('mod','!launch quiz',['moderator'])),/joining/);assert.throws(()=>l.action('launch','hill',{role:'owner'}),/already running/);enabled=false;assert.throws(()=>l.action('stop','quiz',{role:'games'}),/disabled/);l.action('stop','quiz',{role:'owner'});l.action('launch','snackwars',{role:'owner'});assert.equal(a.id,'snacks');l.action('stop','snacks',{role:'owner'});assert.throws(()=>l.savePreset('quiz',{lobbySeconds:0}),/5–300/);l.savePreset('hill',{category:'halloween'});assert.equal(settings.hill.category,'halloween');
});
test('Hill filters categories and avoids recently offered topics',()=>{const f=fixture(HillGame);f.game.categoryFilter='halloween';f.game.start();const first=f.game.options.map(x=>x.id);assert.ok(f.game.options.every(t=>t.category==='halloween'));f.game.stop();f.game.start();assert.ok(f.game.options.every(t=>!first.includes(t.id)));assert.equal(TOPICS.length,57);f.game.stop();});
test('Polaroid rejects offline, unknown and forged test flags before enqueue; owner test alone bypasses',async()=>{
 const obs=new EventEmitter();obs.call=async()=>({outputActive:false});const r=new PolaroidRuntime({config:{obs:{},streamerBot:{},discord:{},polaroid:{}},obs});r.state.obsConnected=true;let captures=0;r.processRedemption=async()=>{captures++;return{};};
 await assert.rejects(r.enqueueRedemption('Viewer'),/must be live/);await assert.rejects(r.enqueueRedemption('Viewer','Admin','','','',[],{isTest:true,ownerTest:true}),/must be live/);assert.equal(captures,0);
 await r.enqueueOwnerTest('Owner');assert.equal(captures,1);obs.call=async()=>({});await assert.rejects(r.enqueueRedemption('Viewer'),/must be live/);obs.call=async()=>({outputActive:true});await r.enqueueRedemption('Viewer');assert.equal(captures,2);
});
test('queued Polaroids are discarded when stream ends, even if it starts again',async()=>{
 const obs=new EventEmitter();obs.call=async()=>({outputActive:true});const r=new PolaroidRuntime({config:{obs:{},streamerBot:{},discord:{},polaroid:{showProfilePicture:false}},obs});r.state.obsConnected=true;r.state.processing=true;let capture=false;r.captureCameraSource=async()=>{capture=true;};const waiting=r.enqueueRedemption('Viewer');await new Promise(setImmediate);assert.equal(r.queue.length,1);obs.emit('StreamStateChanged',{outputActive:false});obs.emit('StreamStateChanged',{outputActive:true});r.state.processing=false;void r.runQueue();await assert.rejects(waiting,/stream ended/);assert.equal(capture,false);
});
test('connector checks live state locally immediately before photo, while owner test is explicit',async()=>{
 const obs=new EventEmitter();let captured=0;obs.call=async method=>method==='GetStreamStatus'?{outputActive:false}:(captured++,{imageData:'photo'});const c=new ConnectorRuntime({config:{},obs});c.obsConnected=true;const sent=[];c.send=m=>sent.push(m);
 await c.handleObsRequest({id:'1',method:'CapturePolaroid',args:{screenshot:{}}});assert.equal(captured,0);assert.equal(sent.at(-1).ok,false);
 await c.handleObsRequest({id:'2',method:'CapturePolaroid',args:{ownerTest:true,screenshot:{}}});assert.equal(captured,1);assert.equal(sent.at(-1).ok,true);
});
test('local Polaroid rechecks live status immediately before screenshot',async()=>{
 const obs=new EventEmitter();let captures=0;obs.call=async method=>method==='GetStreamStatus'?{outputActive:false}:(captures++,{imageData:'data:image/png;base64,YQ=='});
 const r=new PolaroidRuntime({config:{obs:{cameraSource:'Camera'},streamerBot:{},discord:{},polaroid:{}},obs});r.state.obsConnected=true;
 await assert.rejects(r.captureCameraSource(),/must be live/);assert.equal(captures,0);assert.equal((await r.captureCameraSource(true)).toString(),'a');assert.equal(captures,1);
});

