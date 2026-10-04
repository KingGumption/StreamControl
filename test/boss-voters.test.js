const test=require('node:test'),assert=require('node:assert/strict');
const {ArcadeGames}=require('../src/arcade-games');
const make=(extra={})=>new ArcadeGames({schedule:()=>1,cancel:()=>{},...extra});
const event=(text,id='viewer',profileImageUrl='')=>({platform:'twitch',text,user:{id,username:id,profileImageUrl}});
test('digits, words and action names work each round, with one vote per viewer',()=>{
 const game=make();game.start('boss');
 for(const inputs of [['1','two','heal'],['one','2','three'],['attack','defend','3']]){
  inputs.forEach((input,i)=>{assert.equal(game.handleChatEvent(event(input,String(i))),true);});
  assert.deepEqual(game.getState().moveCounts,[1,1,1]);
  game.handleChatEvent(event('3','0'));assert.deepEqual(game.getState().moveCounts,[1,1,1]);
  assert.deepEqual(game.getState().party.map(p=>p.action),[1,2,3]);
  game.resolve();game.next();
 }
});
test('avatar lookup never delays a vote and a stale lookup cannot update a new game',async()=>{
 let complete;const game=make({resolveAvatar:()=>new Promise(resolve=>complete=resolve)});game.start('boss');
 game.handleChatEvent(event('1'));assert.equal(game.getState().answered,1);
 await new Promise(setImmediate);complete('https://static-cdn.jtvnw.net/viewer.png');await new Promise(setImmediate);
 assert.equal(game.getState().party[0].profileImageUrl,'https://static-cdn.jtvnw.net/viewer.png');
 game.handleChatEvent(event('2','other'));await new Promise(setImmediate);
 game.stop();game.start('boss');complete('https://static-cdn.jtvnw.net/old.png');await new Promise(setImmediate);
 assert.deepEqual(game.getState().party,[]);
});
test('supplied portraits are safe, failed lookups retain initials and current voters lead roster',async()=>{
 const game=make({resolveAvatar:async()=>{throw Error('offline');}});game.start('boss');
 for(let i=0;i<10;i++)game.handleChatEvent(event('1',String(i),i===0?'https://example.com/avatar.png':'javascript:bad'));
 assert.equal(game.getState().party[0].profileImageUrl,'https://example.com/avatar.png');
 assert.equal(game.getState().party[1].profileImageUrl,'');
 game.resolve();game.next();game.handleChatEvent(event('2','9'));
 assert.equal(game.getState().party[0].username,'9');assert.equal(game.getState().party[0].voted,true);
 assert.equal(game.getState().party[1].voted,false);await new Promise(setImmediate);
});
