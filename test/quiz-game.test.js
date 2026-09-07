const test = require('node:test');
const assert = require('node:assert/strict');
const { QuizGame } = require('../src/quiz-game');
const { buildAnalyticsReport } = require('../src/analytics');
function setup() {
  let now = 1000; const events = []; let timeout;
  const game = new QuizGame({ recordEvent: e => events.push(e), now: () => now, schedule: fn => { timeout = fn; }, cancel: () => {} });
  const chat = (id, text, platform = 'twitch') => game.handleChatEvent({ platform, text, user: { id, username: id } });
  return { game, events, chat, expire: () => { now += 20000; timeout(); }, late: () => { now += 20000; } };
}
test('locks roster, separates platform IDs, hides answers, and enforces first answer', () => {
  const { game, chat, events } = setup(); game.open({ questionCount: 2 });
  for (const platform of ['twitch','youtube','tiktok']) chat('same', '!join', platform);
  chat('same','!join'); assert.equal(game.players.size,3);
  game.next(); chat('late','!join'); assert.equal(game.players.size,3);
  assert.equal(Object.hasOwn(game.getState().question,'answer'),false);
  assert.equal(JSON.stringify(game.getState()).includes('deck'),false);
  const correct = game.deck[0].answer;
  chat('same',`${correct+1}`); chat('same',`${(correct+1)%4+1}`);
  assert.equal(game.players.get('twitch:same').answer,correct);
  game.next(); assert.equal(game.survivors().length,1);
  chat('same','!join','youtube'); assert.equal(game.survivors().length,1);
  assert.equal(events.filter(e=>e.eventType==='player_eliminated').length,2);
  assert.equal(game.phase,'reveal');game.next();
  chat('same',`${(game.deck[1].answer+1)%4+1}`);game.next();
  assert.equal(game.phase,'completed'); assert.equal(game.getState().winners.length,1);
  assert.equal(events.filter(e=>e.eventType==='player_won').length,1);
});
test('deadline rejects late answers even before timer fires and everyone can lose', () => {
  const { game, chat, late } = setup(); game.open(); chat('a','!join'); chat('b','!join'); game.next(); late();
  chat('a',`${game.deck[0].answer+1}`);
  assert.equal(game.phase,'completed'); assert.equal(game.getState().winners.length,0);
});
test('timer eliminates missing answers and stop prevents pending resolution', () => {
  const { game, chat, expire } = setup(); game.open();chat('a','!join');game.next();expire();assert.equal(game.phase,'completed');
  game.open();chat('a','!join');game.next();game.stop();expire();assert.equal(game.phase,'idle');
});
test('validates settings, requires entrants, and progressively increases difficulty', () => {
  const { game } = setup();
  for(const questionCount of [0,16,2.5,'10']) assert.throws(()=>game.open({questionCount}));
  assert.throws(()=>game.open({answerSeconds:0}));game.open();assert.equal(game.count,10);
  assert.throws(()=>game.open());assert.throws(()=>game.next());
  assert.equal(new Set(game.deck.map(q=>q.id||q.text)).size,10);
  assert.ok(game.deck.every((q,i)=>!i||q.difficulty>=game.deck[i-1].difficulty));
});
test('quiz analytics count participation and outcomes with platform filters', () => {
  const { game, chat, events } = setup();game.open({questionCount:1});chat('a','!join');game.next();chat('a',`${(game.deck[0].answer+1)%4+1}`);game.next();
  const rows=events.map(e=>({...e,event_type:e.eventType,platform_user_id:e.userId,correlation_id:e.correlationId,timestamp:'2026-09-07T10:00:00Z',metadata:JSON.stringify(e.metadata)}));
  const report=buildAnalyticsReport({events:rows,range:'all',now:new Date('2026-09-07T12:00:00Z')});
  assert.equal(report.tools.eliminationQuiz.gamesCompleted,1);assert.equal(report.tools.eliminationQuiz.winners,1);
  assert.equal(report.overview.interactions,2);assert.equal(report.overview.uniqueParticipants,1);assert.equal(report.timeline[0].quiz,2);
  const filtered=buildAnalyticsReport({events:rows,range:'all',platform:'youtube',now:new Date('2026-09-07T12:00:00Z')});assert.equal(filtered.tools.eliminationQuiz.answers,0);
});
test('new pages have valid inline scripts',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const name of ['admin-games.html','admin-quiz.html','quiz.html']){const html=fs.readFileSync(path.join(__dirname,'../public',name),'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(m[1]));}
});


test('reveals answer totals and every elimination, hiding results during questions', () => {
  const {game,chat}=setup();game.open({questionCount:3});
  for(const id of ['a','b','c','d','e'])chat(id,'!join');
  game.next();const answer=game.deck[0].answer,wrong=(answer+1)%4;
  chat('a',String(answer+1));chat('b',String(answer+1));
  chat('c',String(wrong+1));chat('d',String(wrong+1));
  assert.equal(game.getState().roundResult,null);
  game.next();const result=game.getState().roundResult;
  assert.equal(game.phase,'reveal');assert.equal(result.answerCounts[answer],2);assert.equal(result.answerCounts[wrong],2);
  assert.equal(result.missed,1);assert.deepEqual(result.eliminated.map(p=>p.username),['c','d','e']);
  assert.equal(result.eliminated[2].answer,null);
  game.next();assert.equal(game.getState().roundResult,null);
  chat('a',String(game.deck[1].answer+1));game.next();
  assert.equal(game.phase,'reveal');assert.equal(game.getState().winners.length,0);
  assert.deepEqual(game.getState().roundResult.eliminated.map(p=>p.username),['b']);
  game.next();game.next();assert.equal(game.getState().outcome,'victory');assert.equal(game.getState().winners[0].username,'a');
});

test('simultaneous elimination is defeat and records no winner', () => {
  const {game,chat,events}=setup();game.open();
  chat('a','!join');chat('b','!join');game.next();
  chat('a',String((game.deck[0].answer+1)%4+1));game.next();
  assert.equal(game.getState().outcome,'defeat');assert.equal(game.getState().winners.length,0);
  assert.equal(game.getState().roundResult.eliminated.length,2);
  assert.equal(events.filter(e=>e.eventType==='player_won').length,0);
  assert.equal(events.find(e=>e.eventType==='game_completed').metadata.outcome,'defeat');
  game.resolve();assert.equal(events.filter(e=>e.eventType==='game_completed').length,1);
  game.open();assert.equal(game.getState().outcome,null);assert.equal(game.getState().roundResult,null);
});

test('multiple final-round survivors enter sudden death and the last survivor keeps playing', () => {
  const {game,chat}=setup();game.open({questionCount:1});
  chat('a','!join');chat('b','!join');game.next();
  for(const id of ['a','b'])chat(id,String(game.deck[0].answer+1));
  game.next();assert.equal(game.phase,'reveal');assert.equal(game.getState().winners.length,0);
  for(let i=0;i<25;i++){
    game.next();assert.equal(game.getState().suddenDeath,true);
    const q=game.deck[game.round-1];assert.equal(new Set(q.options).size,4);
    for(const id of ['a','b'])chat(id,String(q.answer+1));
    game.next();assert.equal(game.phase,'reveal');
  }
  game.next();chat('a',String(game.deck[game.round-1].answer+1));game.next();
  assert.equal(game.survivors().length,1);assert.equal(game.phase,'reveal');
  game.next();chat('a',String(game.deck[game.round-1].answer+1));game.next();assert.equal(game.phase,'reveal');
  game.next();game.next();assert.equal(game.getState().outcome,'victory');assert.equal(game.getState().winners[0].username,'a');
});


test('preserves display names and avatars, resolving missing Twitch pictures asynchronously',async()=>{
  const events=[];const game=new QuizGame({recordEvent:e=>events.push(e),resolveAvatar:async login=>{assert.equal(login,'kinggumption');return 'https://static-cdn.jtvnw.net/avatar.png';},schedule:()=>null,cancel:()=>{}});
  game.open();game.handleChatEvent({platform:'twitch',text:'!join',user:{id:'1',username:'kinggumption',displayName:'KingGumption'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(game.getState().roster[0].username,'KingGumption');assert.match(game.getState().roster[0].profileImageUrl,/avatar.png/);
  game.next();game.next();assert.equal(game.getState().winners[0].username,'KingGumption');assert.match(game.getState().winners[0].profileImageUrl,/avatar.png/);
  assert.equal(events.find(e=>e.eventType==='player_won').username,'KingGumption');
});

test('solo player keeps answering past configured questions until first wrong answer',()=>{
 const {game,chat}=setup();game.open({questionCount:1});chat('a','!join');
 for(let i=0;i<4;i++){game.next();chat('a',String(game.deck[game.round-1].answer+1));game.next();assert.equal(game.phase,'reveal');}
 game.next();chat('a',String((game.deck[game.round-1].answer+1)%4+1));game.next();
 assert.equal(game.getState().outcome,'victory');assert.equal(game.getState().roundResult.winnerRunEnded,true);
});

test('winner score counts correct answers once and lifetime wins survive new game instances',()=>{
 const saved=[];
 const options={schedule:()=>null,cancel:()=>{},recordEvent:e=>saved.push(e),getWins:(platform,id)=>saved.filter(e=>e.eventType==='player_won'&&e.platform===platform&&e.userId===id).length};
 function run(correctRounds){
   const game=new QuizGame(options);game.open({questionCount:1});
   const user={id:'stable-id',username:'kinggumption',displayName:'KingGumption'};
   game.handleChatEvent({platform:'twitch',text:'!join',user});
   for(let i=0;i<correctRounds;i++){
     game.next();const text=String(game.deck[game.round-1].answer+1);
     game.handleChatEvent({platform:'twitch',text,user});game.handleChatEvent({platform:'twitch',text,user});game.next();
   }
   game.next();game.next();game.resolve();return game.getState().winners[0];
 }
 assert.equal(run(3).correctAnswers,3);
 const winner=run(2);assert.equal(winner.correctAnswers,2);assert.equal(winner.totalWins,2);
 assert.equal(saved.filter(e=>e.eventType==='player_won').length,2);
 assert.equal(saved.filter(e=>e.eventType==='player_won')[1].metadata.correctAnswers,2);
});

test('server advances automatically after all reveal batches and cancels advancement on stop',()=>{
 let now=1000,serial=0;const timers=new Map();
 const game=new QuizGame({now:()=>now,schedule:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},cancel:id=>timers.delete(id)});
 const tick=()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);now+=timer.ms;timer.fn();};
 const answer=(id)=>game.handleChatEvent({platform:'twitch',text:String(game.deck[game.round-1].answer+1),user:{id,username:id}});
 game.open({questionCount:1});
 for(let i=0;i<11;i++)game.handleChatEvent({platform:'twitch',text:'!join',user:{id:String(i),username:String(i)}});
 game.next();answer('0');answer('1');tick();
 assert.equal(game.phase,'reveal');assert.equal(game.nextQuestionAt-now,3500+3*3200+1500);
 tick();assert.equal(game.phase,'question');assert.equal(game.round,2);assert.equal(game.getState().suddenDeath,true);
 answer('0');answer('1');tick();assert.equal(game.phase,'reveal');
 game.stop();assert.equal(timers.size,0);assert.equal(game.getState().nextQuestionAt,null);
});

test('category selection restricts normal and sudden-death rounds and rejects insufficient banks',()=>{
 const {game,chat}=setup();
 assert.equal(game.getCatalog().length,13);
 assert.throws(()=>game.open({categories:[]}));assert.throws(()=>game.open({categories:['unknown']}));
 const small=new QuizGame({questions:[...game.questions.filter(q=>q.category==='logos').slice(0,2),...game.questions.filter(q=>q.category==='posters').slice(0,4)]});
 assert.throws(()=>small.open({categories:['logos'],questionCount:3}),/Selected categories have 2 questions/);
 game.open({categories:['posters'],questionCount:1});chat('a','!join');
 const seen=new Set();
 const posterCount=game.getCatalog().find(c=>c.id==='posters').count;
 for(let i=0;i<posterCount+1;i++){
  game.next();const q=game.deck[game.round-1];assert.equal(q.category,'posters');
  if(i<posterCount){assert.equal(seen.has(q.id),false);seen.add(q.id);}
  assert.equal(Object.hasOwn(game.getState().question,'answer'),false);
  assert.ok(game.getState().question.image.url.startsWith('/assets/quiz-media/'));
  assert.equal(JSON.stringify(game.getState()).includes('sourceUrl'),false);
  chat('a',String(q.answer+1));game.next();
 }
 assert.equal(seen.size,posterCount);
});
