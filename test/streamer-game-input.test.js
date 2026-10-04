const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeStreamerBotEvent}=require('../src/chat-events');
const {IntegrationRuntime}=require('../src/integration-runtime');
const {arcadeGames}=require('../src/arcade-games');
const payload=(text,source='Twitch',meta={isMe:true})=>({event:{source,type:source==='Twitch'?'ChatMessage':'Message'},data:{text,meta,messageId:'game-'+text,user:{id:'owner',login:'kinggumption',name:'KingGumption',isBroadcaster:true}}});
test('self messages accept the entire game input vocabulary without granting roles',()=>{
 for(const source of ['Twitch','YouTube']){
  for(const text of ['1','3','4','5','50','99','100',' pass ','ATTACK','defend','heal'])assert.equal(normalizeStreamerBotEvent(payload(text,source)).text,text.trim());
  for(const text of ['0','101','1000','hello','!song loop','Britain wins!'])assert.equal(normalizeStreamerBotEvent(payload(text,source)),null);
  assert.equal(normalizeStreamerBotEvent(payload('50',source,{isMe:true,internal:true})),null);
  const p=payload('50',source);delete p.data.user.isBroadcaster;assert.equal(normalizeStreamerBotEvent(p).user.roles.includes('broadcaster'),false);
 }
});
test('raw Twitch owner messages travel through the real adapter and runtime into both reported games',async()=>{
 const runtime=new IntegrationRuntime({config:{streamerBot:{},tikfinity:{}},game:null,quiz:null,commands:{handleChatEvent:async()=>({handled:false})}});
 try{
  for(const [id,input]of [['escape','2'],['number','50']]){
   arcadeGames.stop();arcadeGames.start(id,{seconds:60});
   runtime.streamerBot.handleMessage(JSON.stringify(payload(input)));
   await new Promise(setImmediate);
   assert.equal(arcadeGames.getState().answered,1,id);assert.equal(arcadeGames.getState().players,1,id);
   assert.equal(arcadeGames.votes.get('twitch:owner'),id==='number'?50:1);
   runtime.streamerBot.handleMessage(JSON.stringify(payload(input)));await new Promise(setImmediate);
   assert.equal(arcadeGames.getState().answered,1,'duplicate is not counted again');
  }
 }finally{arcadeGames.stop();}
});
