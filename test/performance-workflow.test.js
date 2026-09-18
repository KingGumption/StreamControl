const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PolaroidRuntime}=require('../src/polaroid/runtime');
const {WorkQueue}=require('../src/work-queue');
const {QuizGame}=require('../src/quiz-game');
const {getLiveConfig,saveConfig}=require('../src/config');
const {upsertOverride,deleteOverride,db}=require('../src/db');
const flush=()=>new Promise(r=>setImmediate(r));
test('bounded delivery work never requires capture to wait and rejects excess backlog',async()=>{
 let release;const q=new WorkQueue({limit:1});
 const first=q.add(()=>new Promise(r=>{release=r;}));await flush();
 const second=q.add(()=>42);await assert.rejects(q.add(()=>99),/full/);
 release();await first;assert.equal(await second,42);await q.idle();assert.equal(q.size,0);
});
test('Polaroid starts screenshot while avatar is unresolved and limits avatar wait',async()=>{
 const config={obs:{},discord:{enabled:false},streamerBot:{avatarResolverEnabled:true},polaroid:{showProfilePicture:true},avatarBudgetMs:10};
 const runtime=new PolaroidRuntime({config,obs:new EventEmitter()});
 runtime.resolveTwitchProfileImage=()=>new Promise(()=>{});
 let captureStarted=false;
 runtime.captureCameraSource=async()=>{captureStarted=true;throw Error('fixture end');};
 await runtime.handleStreamerBotRedemption({source:'Twitch',username:'uncached_speed_test',redeemerName:'Speed',eventId:'speed'});
 await flush();assert.equal(captureStarted,true);
 assert.equal(await runtime.boundedAvatar(new Promise(()=>{})),null);
});
test('quiz events coalesce bursts and preserve answer secrecy and control version',async()=>{
 const game=new QuizGame();const states=[];const unsubscribe=game.subscribe(s=>states.push(s));
 game.open({questionCount:1,answerSeconds:5});
 const lobbyVersion=game.getState().controlVersion;
 game.handleChatEvent({platform:'twitch',text:'!join',user:{id:'p',username:'p'}});
 assert.equal(game.getState().controlVersion,lobbyVersion);
 game.next();assert.notEqual(game.getState().controlVersion,lobbyVersion);
 await new Promise(r=>setTimeout(r,45));assert.equal(states.length,1);assert.equal(states[0].question.answer,undefined);
 game.resolve();await new Promise(r=>setTimeout(r,45));assert.equal(typeof states.at(-1).question.answer,'number');
 unsubscribe();game.stop();
});
test('permission cache updates on saves and overrides, and returns isolated values',()=>{
 const before=getLiveConfig();saveConfig(before);
 const changed=getLiveConfig();changed.commands={};assert.notDeepEqual(getLiveConfig().commands,{});
 upsertOverride({platform:'twitch',username:'cache_user',userId:'cache-1',command:'song',access:'deny'});
 assert.ok(getLiveConfig().overrides.some(x=>x.username==='cache_user'));
 deleteOverride({platform:'twitch',username:'cache_user',userId:'cache-1',command:'song'});
 assert.ok(!getLiveConfig().overrides.some(x=>x.username==='cache_user'));
});
test('analytics date expressions use matching indexes',()=>{
 const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM engagement_events WHERE julianday(timestamp)>=julianday(?)').all('2026-01-01');
 assert.ok(plan.some(row=>row.detail.includes('idx_events_julian')&&row.detail.includes('SEARCH')));
});
