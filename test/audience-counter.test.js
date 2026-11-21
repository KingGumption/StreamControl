const test=require('node:test'),assert=require('node:assert/strict');
const {AudienceGames}=require('../src/audience-games');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('automatic deaths use a run baseline, ignore resets, and stop polling after manual takeover',async t=>{
 let count=75,unavailable=false;
 const games=new AudienceGames({readDeaths:async()=>{if(unavailable)throw Error();return count;}});
 t.after(()=>games.stop());
 games.start('rival',{seconds:60});await tick();
 const poll=()=>{clearTimeout(games.timer);return games.pollDeaths(games.run);};
 const deaths=()=>games.snapshot().game.deaths;
 assert.equal(deaths(),0);
 count+=2;await poll();assert.equal(deaths(),2);
 await poll();assert.equal(deaths(),2);
 count=0;await poll();assert.equal(deaths(),2);
 count=1;await poll();assert.equal(deaths(),3);
 assert.throws(()=>games.act('death'),/streaming PC/);
 unavailable=true;await poll();
 assert.ok(games.snapshot(true).game.actions.some(a=>a.id==='manual-deaths'));
 games.act('manual-deaths');games.act('death');assert.equal(deaths(),4);
 count=200;unavailable=false;await poll();assert.equal(deaths(),4);
});
test('a counter response received after stop cannot score in the next game',async t=>{
 let respond;
 const games=new AudienceGames({readDeaths:()=>new Promise(resolve=>{respond=resolve;})});
 t.after(()=>games.stop());
 games.start('rival',{});games.stop();
 games.start('rival',{deaths:'manual'});respond(99);await tick();
 assert.equal(games.snapshot().game.deaths,0);
 assert.equal(games.snapshot(true).game.counterStatus,null);
});
