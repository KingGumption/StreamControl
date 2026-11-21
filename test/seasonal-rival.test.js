const test = require('node:test');
const assert = require('node:assert/strict');
const {SeasonalRival} = require('../src/seasonal-rival');

function fixture() {
  let now = 10000, theme = 'christmas';
  const tasks = [], states = [];
  const engine = new SeasonalRival({
    now: () => now, theme: () => theme, publish: state => states.push(state),
    schedule: (run, delay) => { const task = {run, delay}; tasks.push(task); return task; },
    cancel: task => { task.cancelled = true; },
  });
  return {engine, tasks, states, jump: ms => {now += ms;}, theme: next => {theme = next;}};
}

const voter = (text, id = 'alice', platform = 'twitch') => ({text, platform, user:{id}});

test('a viewer wins a present, then chooses the final challenge', () => {
  const {engine} = fixture();
  const first = engine.start({rounds:1});
  assert.equal(first.title, 'The Grinch’s gift grab');
  assert.equal(first.endsAt, 30000);
  assert.equal(first.sack, 1);
  assert.match(first.prompt, /4, 7, 10/);
  assert.equal(first.result, '');
  assert.equal(first.options[1], '13');
  assert.equal('correct' in first, false);
  assert.equal(engine.chat(voter('2')), true);
  const result = engine.act('next');
  assert.equal(result.phase, 'reveal');
  assert.match(result.result, /recovered/);
  assert.deepEqual([result.sack,result.recovered], [0,1]);
  const finale = engine.act('next');
  assert.equal(finale.winner,'chat');
  engine.chat(voter('3'));
  const end = engine.act('next');
  assert.equal(end.phase, 'completed');
  assert.equal(end.finalChallenge, finale.options[2]);
  assert.equal(end.endsAt, null);
});

test('bulk deaths publish once, increase the sack and affect who picks the finale', () => {
  const {engine,states} = fixture();
  engine.start({rounds:1});
  const before = states.length;
  const changed = engine.act('death',{count:3});
  assert.equal(states.length,before+1);
  assert.deepEqual([changed.sack,changed.deaths], [4,3]);
  for(const count of [-1,0,1.5,'2',Infinity,Number.MAX_SAFE_INTEGER]) assert.throws(()=>engine.act('death',{count}));
  assert.deepEqual([engine.getState().sack, states.length], [4,before+1]);
  engine.chat(voter('2'));
  engine.act('next');
  assert.equal(engine.act('death').deaths,4);
  const finale = engine.act('next');
  assert.equal(finale.winner,'rival');
  assert.ok(finale.finalChallenge);
  assert.equal(engine.chat(voter('1')),false);
  assert.throws(()=>engine.act('death'));
  assert.equal(engine.act('next').finalChallenge,finale.finalChallenge);
});

test('rejects unrelated/anonymous chat; records one ballot per platform and viewer', () => {
  const {engine} = fixture();
  engine.start();
  for(const e of [null,{text:'1',platform:'twitch'},voter('!foo'),voter('4'),voter('1 or 2')]) assert.equal(engine.chat(e),false);
  engine.chat(voter('1'));engine.chat(voter('2','ALICE'));engine.chat(voter('2','alice','youtube'));
  assert.deepEqual(engine.getState().votes,[1,1,0]);
  assert.match(engine.act('next').result,/tied/);
  assert.equal(engine.act('next').round,2);
  engine.chat(voter('2'));
  assert.deepEqual(engine.getState().votes,[0,1,0]);
});

test('boundaries settle before counting a late vote; stale clocks cannot change a new game', () => {
  const {engine,jump,tasks} = fixture();
  engine.start({seconds:10, rounds:1, pacing:'auto'});
  const old = tasks[0];
  jump(10000);
  assert.equal(engine.chat(voter('2')),true);
  assert.match(engine.getState().result,/No votes/);
  assert.equal(engine.getState().recovered,0);
  old.run();
  assert.equal(engine.getState().phase,'reveal');
  tasks.at(-1).run();
  assert.equal(engine.getState().winner,'rival');
  tasks.at(-1).run();
  assert.equal(engine.getState().phase,'completed');
  engine.start();
  assert.throws(()=>engine.start());
  engine.stop();
  tasks.at(-1).run();
  assert.equal(engine.getState().phase,'idle');
});

for (const tie of [false,true]) test(`host arbitration when the winning side’s final vote is ${tie?'tied':'empty'}`, () => {
  const {engine} = fixture();
  engine.start({rounds:1});engine.chat(voter('2'));engine.act('next');
  const finale = engine.act('next');
  if(tie){engine.chat(voter('1'));engine.chat(voter('3','bea'));}
  const pending = engine.act('next');
  assert.equal(pending.phase,'finalPick');
  assert.deepEqual(pending.actions.map(a=>a.id),tie?['pick-1','pick-3']:['pick-1','pick-2','pick-3']);
  if(tie) assert.throws(()=>engine.act('pick-2'));
  const completed = engine.act('pick-3');
  assert.equal(completed.finalChallenge,finale.options[2]);
  assert.match(completed.prompt,/host settled/);
});

test('theme switches retain score, clock, vote indexes and readable final prompt', () => {
  const {engine,theme} = fixture();
  engine.start({rounds:2});
  engine.chat(voter('1'));
  for(const [id,rival] of [['vicecity','The Neon Bandit'],['spooktober','The Candy Phantom'],['unknown','The Prize Bandit']]) {
    theme(id);const s=engine.getState();
    assert.equal(s.rivalName,rival);assert.equal(s.endsAt,30000);
    assert.deepEqual(s.votes,[1,0,0]);
    s.votes[0]=999;assert.equal(engine.getState().votes[0],1);
  }
  assert.throws(()=>engine.act('bogus'));
});

test('settings validation keeps the game idle',()=>{
  const {engine} = fixture();
  for(const settings of [{seconds:9},{seconds:61},{rounds:0},{rounds:10.2}]) assert.throws(()=>engine.start(settings));
  assert.equal(engine.getState().phase,'idle');
  assert.equal(engine.start({seconds:60,rounds:10}).rounds,10);
});

test('host pacing holds between missions, counts deaths there, and allows an early finale',()=>{
  const {engine,tasks,jump} = fixture();
  assert.equal(engine.start({rounds:3}).pacing,'host');
  engine.chat(voter('2'));
  engine.act('next');
  tasks.at(-1).run();
  const wait=engine.getState();assert.equal(wait.phase,'intermission');assert.equal(wait.endsAt,null);
  jump(3600000);assert.equal(engine.getState().phase,'intermission');
  assert.equal(engine.chat(voter('1')),false);
  assert.equal(engine.act('death',{count:2}).sack,4);
  const next=engine.act('next');assert.equal(next.round,2);assert.equal(next.phase,'challenge');
  engine.act('next');const end=engine.act('finale');assert.equal(end.phase,'finale');assert.equal(end.round,2);
});

test('host final reveal stays on screen until the operator opens the finale',()=>{
  const {engine,jump} = fixture();
  engine.start({rounds:1});engine.chat(voter('2'));
  const reveal=engine.act('next');assert.equal(reveal.endsAt,null);jump(60000);
  assert.equal(engine.getState().phase,'reveal');
  assert.equal(engine.act('death').sack,1);
  assert.equal(engine.act('next').winner,'chat');
});
