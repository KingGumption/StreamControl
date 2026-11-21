const test=require('node:test');
const assert=require('node:assert/strict');
const {HeistNight}=require('../src/heist-night');

function setup(){
  let clock=1000;
  const timers=[],published=[];
  const game=new HeistNight({
    now:()=>clock,publish:state=>published.push(state),
    schedule:(fn,delay)=>{const ticket={fn,delay,stopped:false};timers.push(ticket);return ticket;},
    cancel:ticket=>{ticket.stopped=true;}
  });
  const chat=(text,id='one',platform='twitch')=>game.chat({text,platform,user:{id}});
  return {game,chat,timers,published,advance:ms=>{clock+=ms;}};
}
function runThreeJobs(game){
  for(let n=1;n<=3;n++){
    assert.equal(game.getState().round,n);
    assert.equal(game.act('next').phase,'job');
    game.act('success');
  }
  assert.equal(game.getState().phase,'finale-vote');
}
test('three different jobs resolve viewer-chosen in-game rules and bank the exact pot',()=>{
  const {game,chat}=setup();
  assert.equal(game.start({seconds:'10'}).endsAt,11000);
  const labels=new Set();
  for(let i=1;i<=3;i++){
    const state=game.getState();
    labels.add(state.job.title);
    assert.equal(state.options.length,3);
    assert(chat('!vote 2'));assert(chat('1'));assert(chat('2','one','youtube'));
    assert.deepEqual(game.getState().votes,[0,2,0]);
    assert.equal(game.act('next').title,state.options[1]);
    assert.equal(game.getState().endsAt,null);
    assert.equal(chat('2'),false);
    game.act('success');
  }
  assert.equal(labels.size,3);
  assert.equal(game.getState().pot,550);
  assert.equal(chat('3'),false);
  assert(chat('1'));assert(chat('2','two'));
  const done=game.act('next');
  assert.equal(done.phase,'completed');assert.equal(done.banked,550);assert.equal(done.endsAt,null);
  assert.throws(()=>game.start(),/overlay/);
  assert.equal(game.stop().phase,'idle');assert.equal(game.start().pot,100);
});
test('court defence stays private until selected; a fine deducts points and cannot go below zero',()=>{
  const {game,chat,published}=setup();game.start();
  for(let round=1;round<=3;round++){
    game.act('next');game.act('failure');
    assert.equal(game.getState().phase,'defence');
    assert.equal(chat('!defend  '),false);assert(chat('!defend In-game\u202e alibi '+round));assert(chat('!defend duplicate'));
    assert.equal(game.getHostState().defenceCandidates.length,1);
    assert.equal(game.getState().selectedDefence,null);
    assert(!JSON.stringify(published.at(-1)).includes('alibi'));
    const candidate=game.getHostState().defenceCandidates[0];
    assert(!candidate.text.includes('\u202e'));
    assert.throws(()=>game.act('select-defence',{defenceId:'invalid'}),/unavailable/);
    assert.equal(game.act('select-defence',{defenceId:candidate.id}).selectedDefence,candidate.text);
    const verdict=game.act('next');
    assert.equal(verdict.selectedDefence,candidate.text);assert.deepEqual(game.getHostState().defenceCandidates,[]);
    assert(chat('2'));game.act('next');
    assert.equal(game.getState().pot,Math.max(0,100-round*50));
    assert.equal(game.getState().selectedDefence,null);
  }
  assert.equal(game.act('next').banked,0);
});
test('a court tie pardons the crew; the finale can double the pot or lose it',()=>{
  for(const success of [true,false]){
    const {game,chat}=setup();game.start();game.act('next');game.act('failure');game.act('next');
    chat('1');chat('2','two');game.act('next');assert.match(game.getState().consequence,/Pardoned/);
    for(let i=0;i<2;i++){game.act('next');game.act('success');}
    assert(chat('!vote 2'));assert.equal(game.act('next').phase,'risk');
    assert.equal(game.act(success?'success':'failure').banked,success?900:0);
  }
});
test('manual progress, stopped games and late votes cannot fire obsolete timers',()=>{
  const {game,chat,timers,advance}=setup();game.start({seconds:10});
  const original=timers[0];
  game.act('next');game.act('success');assert(original.stopped);
  original.fn();assert.equal(game.getState().phase,'job-vote');
  const defaultRule=game.getState().options[0];
  advance(10000);assert.equal(chat('3'),false);assert.equal(game.getState().phase,'job');
  assert.equal(game.getState().title,defaultRule);
  game.act('failure');const defenceTimer=timers.at(-1);defenceTimer.fn();assert.equal(game.getState().phase,'verdict');
  game.stop();game.start();defenceTimer.fn();assert.equal(game.getState().phase,'job-vote');game.stop();
});
test('host-only candidates are bounded and returned state cannot mutate future snapshots',()=>{
  const {game,chat}=setup();game.start();game.act('next');game.act('failure');
  for(let i=0;i<40;i++)chat('!defend '+'x'.repeat(170),String(i));
  const host=game.getHostState();assert.equal(host.defenceCandidates.length,30);assert.equal(host.defenceCandidates[0].text.length,140);
  host.defenceCandidates[0].text='edited';host.job.title='edited';host.actions.length=0;
  assert.notEqual(game.getHostState().defenceCandidates[0].text,'edited');
  assert.notEqual(game.getState().job.title,'edited');assert.equal(game.getState().actions.length,1);
  assert(!Object.hasOwn(game.getState(),'defenceCandidates'));
});
test('range, closed phases, missing identities and unrelated chat are rejected without writes',()=>{
  const {game,chat,published}=setup();
  for(const seconds of [0,9,61,'19.5','n/a'])assert.throws(()=>game.start({seconds}),/10 to 60/);
  assert.deepEqual(published,[]);
  assert.equal(chat('1'),false);game.start();assert.throws(()=>game.act('success'),/unavailable/);
  assert.equal(chat('1','', 'twitch'),false);assert.equal(chat('hey'),false);
  assert.equal(game.chat({text:'!vote 1',user:{id:'one'}}),false);
  const snapshot=game.getState();snapshot.votes[0]=30;
  assert.deepEqual(game.getState().votes,[0,0,0]);
  runThreeJobs(game);assert.equal(game.act('next').banked,550);
});
