const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function browser(preview = false) {
  const elements = new Map(), timers = new Map(); let timerId = 0;
  class Element {
    constructor() { this.children = []; this.hidden = false; this.textContent = ''; this.style = { setProperty() {} }; }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    after() {}
    remove() { elements.delete(this.id); }
  }
  for (const id of ['questionMedia','overlayRoot','questionPanel','quizStage','status','counts','question','options','result','error','open','next','questionCount']) { const el = new Element(); el.id = id; }
  let fetches = 0;
  const context = vm.createContext({ QUIZ_PREVIEW: preview, document: { getElementById: id => elements.get(id), createElement: () => new Element() },
    setInterval() {}, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    fetch: () => { fetches++; return new Promise(() => {}); }, Date, URL,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/quiz-view.js'), 'utf8'), context);
  return { elements, timers, get fetches() { return fetches; }, render(g) { context.render(g); }, tick() { const [id,fn] = timers.entries().next().value; timers.delete(id); fn(); } };
}
function result(overrides = {}) {
  return { gameId:'one',phase:'completed',round:1,questionCount:10,maxQuestions:15,players:10,survivors:1,
    question:{text:'Question',options:['A','B','C','D'],answer:0},
    roundResult:{answerCounts:[1,8,0,0],missed:1,eliminated:Array.from({length:9},(_,i)=>({username:`Player ${i}`,platform:'twitch',answer:i===8?null:1}))},
    winners:[{username:'<img src=x onerror=alert(1)>',platform:'youtube'}],...overrides };
}

test('elimination recap is only shown in host controls, never the overlay or preview',()=>{
 for(const preview of [false,true]){
  const b=browser(preview);b.render(result());assert.equal(b.elements.has('eliminationSummary'),false);
  b.tick();assert.equal(b.elements.get('quizStage').hidden,false);
 }
 const host=browser();host.elements.set('overlay',{});host.render(result());
 assert.equal(host.elements.has('eliminationSummary'),true);
});
test('shows every elimination in batches, avoids replay on polling, then shows winner', () => {
  const b=browser(),g=result(); b.render(g);
  assert.equal(b.elements.get('quizStage').hidden,true);
  assert.equal(b.elements.get('questionPanel').hidden,false);
  b.tick();assert.equal(b.elements.get('questionPanel').hidden,true);
  assert.equal(b.elements.get('quizStage').children.at(-1).children.length,4);
  assert.equal(b.elements.get('next').disabled,true);
  assert.equal(b.elements.get('options').children[1].children[1].textContent,'8 wrong');
  b.render(g);assert.equal(b.timers.size,1);
  b.tick();assert.equal(b.elements.get('quizStage').children.at(-1).children.length,4);
  b.tick();assert.equal(b.elements.get('quizStage').children.at(-1).children.length,1);
  b.tick();assert.equal(b.elements.get('quizStage').className,'quiz-stage victory');
  assert.equal(b.elements.get('quizStage').children.at(-1).children[0].children[1].textContent,g.winners[0].username);
  b.render(g);assert.equal(b.timers.size,0);
});
test('defeat follows elimination and stopping cancels animation', () => {
  const b=browser(),g=result({winners:[],survivors:0}); b.render(g);b.tick();b.tick();b.tick();b.tick();
  assert.equal(b.elements.get('quizStage').className,'quiz-stage defeat');
  b.render({...g,gameId:'two'});assert.equal(b.timers.size,1);
  b.render({...g,phase:'idle',roundResult:null,question:null});assert.equal(b.timers.size,0);assert.equal(b.elements.get('quizStage').hidden,true);
});
test('next question clears reveal counts while advancement stays automatic', () => {
  const b=browser(),g=result({phase:'reveal',survivors:2,winners:[]});b.render(g);b.tick();b.tick();b.tick();b.tick();
  assert.equal(b.elements.get('next').disabled,true);
  b.render({...g,phase:'question',round:2,roundResult:null,question:{text:'New question',options:['A','B','C','D']}});
  assert.equal(b.elements.get('options').children[0].children.length,1);assert.equal(b.elements.get('quizStage').hidden,true);
});


test('answer reveal precedes compact winner screen even without eliminations; portraits preserve casing',()=>{
 const b=browser(),g=result({winners:[{username:'KingGumption',correctAnswers:7,totalWins:3,platform:'twitch',profileImageUrl:'https://static-cdn.jtvnw.net/avatar.png'}],roundResult:{answerCounts:[0,1,0,0],missed:0,eliminated:[],winnerRunEnded:true}});
 b.render(g);assert.equal(b.elements.get('questionPanel').hidden,false);assert.equal(b.elements.get('quizStage').hidden,true);
 b.tick();assert.equal(b.elements.get('questionPanel').hidden,true);assert.equal(b.elements.get('quizStage').hidden,false);
 const card=b.elements.get('quizStage').children.at(-1).children[0];assert.equal(card.children[1].textContent,'KingGumption');
 assert.equal(card.children[0].children[1].src,g.winners[0].profileImageUrl);
 assert.equal(card.children.at(-1).children[0].textContent,'7 correct answers');assert.equal(card.children.at(-1).children[1].textContent,'3 total wins');
});


test('overlay is blank before the lobby opens and after stopping',()=>{
 const b=browser();b.render(result({phase:'idle',question:null,roundResult:null}));assert.equal(b.elements.get('overlayRoot').hidden,true);
 b.render(result({phase:'lobby',round:0,question:null,roundResult:null}));assert.equal(b.elements.get('overlayRoot').hidden,false);
 b.render(result({phase:'idle',question:null,roundResult:null}));assert.equal(b.elements.get('overlayRoot').hidden,true);
});


test('preview renderer never fetches the live game and shows sample screens locally',()=>{
 const b=browser(true);assert.equal(b.fetches,0);b.render(result());assert.equal(b.fetches,0);
 b.tick();b.tick();b.tick();b.tick();assert.equal(b.fetches,0);
});


test('picture questions render cropped clues without descriptive answer text, then clear for text rounds',()=>{
 const b=browser(true);const g=result({phase:'question',roundResult:null,question:{text:'Guess the movie.',options:['A','B','C','D'],image:{url:'/assets/quiz-media/1234567890abcdef.png',crop:[.1,.2,.8,.5],aspect:1.2}}});
 b.render(g);const holder=b.elements.get('questionMedia');assert.equal(holder.hidden,false);
 const image=holder.children[0].children[0];assert.equal(image.alt,'Quiz picture clue');assert.equal(image.style.width,'125%');assert.equal(image.style.top,'-40%');
 b.render({...g,round:2,question:{text:'A written clue.',options:['A','B','C','D']}});assert.equal(holder.hidden,true);assert.equal(holder.children.length,0);
});

test('lobby roster stays bounded, preserves casing, and does not rebuild on identical polling',()=>{
 const b=browser(true),roster=Array.from({length:20},(_,i)=>({username:'Player'+i,platform:'twitch'}));
 roster[19].username='KingGumption';
 const g=result({phase:'lobby',question:null,roundResult:null,players:20,roster});b.render(g);
 const holder=b.elements.get('quizLobbyPlayers');assert.equal(holder.children.length,9);
 assert.equal(holder.children[7].children[1].textContent,'KingGumption');assert.equal(holder.children[8].textContent,'+12 more');
 const card=holder.children[7];b.render(g);assert.equal(holder.children[7],card);
 b.render({...g,phase:'question',question:{text:'Q',options:['a','b','c','d']}});assert.equal(holder.hidden,true);
});

test('answer progress and final countdown update without replaying the question or leaking choices',()=>{
 const b=browser(true);const g=result({phase:'question',roundResult:null,question:{text:'Q',options:['a','b','c','d']},survivors:5,answered:2,answerSeconds:20,deadline:Date.now()+4000});
 b.render(g);assert.equal(b.elements.get('quizAnswerProgress').textContent,'2 / 5 answers locked in');
 assert.equal(b.elements.get('quizEnergy').className,'quiz-energy urgent');
 const first=b.elements.get('options').children[0];b.render({...g,answered:5});
 assert.equal(b.elements.get('quizAnswerProgress').textContent,'All 5 answers locked in');assert.equal(b.elements.get('options').children[0],first);
 assert.equal(first.children.length,1);
 b.render({...g,phase:'reveal',roundResult:{answerCounts:[5,0,0,0],eliminated:[],missed:0}});assert.equal(b.elements.get('quizEnergy').hidden,true);
});

test('streak celebrations only appear on reveal and sudden death has a nonblocking introduction',()=>{
 const b=browser(true);const g=result({phase:'reveal',round:5,roundResult:{answerCounts:[5,0,0,0],eliminated:[],missed:0,milestones:[{username:'KingGumption',correctAnswers:5}]}});
 b.render(g);assert.equal(b.elements.get('quizMoment').children[0].textContent,'5 correct in a row!');
 assert.equal(b.elements.get('quizMoment').children[1].textContent,'KingGumption');
 b.render({...g,phase:'question',round:11,suddenDeath:true,roundResult:null});
 assert.equal(b.elements.get('quizMoment').children[0].textContent,'SUDDEN DEATH');assert.equal(b.elements.get('questionPanel').hidden,false);assert.equal(b.timers.size,0);
});
