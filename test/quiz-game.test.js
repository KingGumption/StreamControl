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
  game.next(); chat('same',`${game.deck[1].answer+1}`); game.next();
  assert.equal(game.phase,'completed'); assert.equal(game.getState().winners.length,1);
  assert.equal(events.filter(e=>e.eventType==='player_won').length,1);
});
test('deadline rejects late answers even before timer fires and everyone can lose', () => {
  const { game, chat, late } = setup(); game.open(); chat('a','!join'); game.next(); late();
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
  assert.equal(new Set(game.deck.map(q=>q.text)).size,10);
  assert.ok(game.deck.every((q,i)=>!i||q.difficulty>game.deck[i-1].difficulty));
});
test('quiz analytics count participation and outcomes with platform filters', () => {
  const { game, chat, events } = setup();game.open({questionCount:1});chat('a','!join');game.next();chat('a',`${game.deck[0].answer+1}`);game.next();
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
