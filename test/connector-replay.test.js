const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {ConnectorRuntime}=require('../src/connector-runtime');
const {IntegrationRuntime}=require('../src/integration-runtime');
test('offline connector backlog is byte-bounded and expires old messages',()=>{
 const connector=new ConnectorRuntime({config:{},obs:new EventEmitter()});
 for(let i=0;i<20;i++)connector.send({type:'service.message',service:'tikfinity',payload:'x'.repeat(500000)});
 assert.ok(connector.outboxBytes<=4*1024*1024);
 assert.ok(connector.outbox.length<20);
 const sent=[];connector.cloud={readyState:1,bufferedAmount:0,send:value=>sent.push(JSON.parse(value))};
 connector.outbox[0].message.receivedAt=new Date(Date.now()-16*60000).toISOString();
 const length=connector.outbox.length;connector.flushOutbox();
 assert.equal(sent.length,length-1);assert.ok(sent.every(x=>x.replayed));assert.equal(connector.outboxBytes,0);
});
test('replayed chat records audience history without executing commands or games',()=>{
 const bridge=new EventEmitter();bridge.connected=false;bridge.getServiceStates=()=>new Map();
 const recorded=[];
 const runtime=new IntegrationRuntime({config:{streamerBot:{},tikfinity:{}},bridge,
  recordEvent:e=>recorded.push(e),commands:{handleChatEvent:()=>{throw Error('must not execute replay');}},
  game:{handleChatEvent:()=>{throw Error('must not vote late');}},quiz:{handleChatEvent:()=>{throw Error('must not answer late');}},
 });
 runtime.start();
 const event=JSON.stringify({event:'chat',data:{uniqueId:'viewer',userId:'1',comment:'!song example',msgId:'old'}});
 const replay={replayed:true,receivedAt:new Date(Date.now()-1000).toISOString()};
 bridge.emit('service-message','tikfinity',event,replay);bridge.emit('service-message','tikfinity',event,replay);
 assert.equal(recorded.length,1);assert.equal(recorded[0].eventType,'chat_message');assert.equal(recorded[0].timestamp,replay.receivedAt);
 runtime.stop();
});
