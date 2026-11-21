const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {ConnectorRuntime}=require('../src/connector-runtime');
const {IntegrationRuntime,streamerBotAuthentication}=require('../src/integration-runtime');
const {BridgeHub}=require('../src/bridge-hub');
function fixture(password='local-test-secret'){
 const messages=[],local=[],connector=new ConnectorRuntime({config:{streamerBot:{password}},obs:new EventEmitter()});
 const socket={readyState:1,send:raw=>local.push(JSON.parse(raw)),close:()=>{}};
 connector.cloud={readyState:1,bufferedAmount:0,send:raw=>messages.push(JSON.parse(raw))};
 connector.openStreamerBot(socket);
 const hello={request:'Hello',authentication:{salt:'salt-fixture',challenge:'challenge-fixture'}};
 const handle=(obj,s=socket)=>connector.handleStreamerBot(JSON.stringify(obj),s);
 const dispatch=obj=>connector.handleCloudMessage(JSON.stringify({type:'service.send',service:'streamerbot',payload:JSON.stringify(obj)}));
 return {connector,messages,local,socket,handle,dispatch,hello};
}
test('connector signs challenge locally, waits for matching acknowledgement, never forwards private protocol material',()=>{
 const f=fixture();
 try{
  f.handle(f.hello);assert.equal(f.local.length,1);const a=f.local[0];assert.equal(a.request,'Authenticate');assert.equal(a.authentication,streamerBotAuthentication('local-test-secret',f.hello.authentication));
  f.dispatch({request:'Subscribe',id:'too-soon'});f.handle({id:'pc-streamerbot-auth:other',status:'ok'});assert.equal(f.local.length,1);assert.ok(!f.messages.some(m=>m.connected));
  f.handle({event:{source:'Twitch',type:'ChatMessage'},data:{text:'not-authenticated'}});assert.ok(!f.messages.some(m=>m.type==='service.message'));
  f.handle({id:a.id,status:'ok'});assert.equal(f.messages.at(-1).authenticatedLocally,true);
  f.dispatch({request:'Authenticate',id:'cloud-auth'});assert.equal(f.local.length,1);
  f.dispatch({request:'Subscribe',id:'allowed'});assert.equal(f.local.at(-1).id,'allowed');
  f.handle({id:'allowed',status:'ok'});assert.equal(JSON.parse(f.messages.at(-1).payload).id,'allowed');
  const remote=JSON.stringify(f.messages);for(const secret of [a.id,a.authentication,'salt-fixture','challenge-fixture','local-test-secret','cloud-auth'])assert(!remote.includes(secret));
 }finally{f.connector.clearLocalAuth();}
});
test('missing/rejected challenges and reconnection clear reply capability and cannot replay stale acknowledgements',()=>{
 const f=fixture();
 try{
  f.handle({request:'Hello'});assert.equal(f.local.length,0);assert.equal(f.messages.at(-1).connected,false);
  f.handle(f.hello);const first=f.local[0];f.handle({id:first.id,status:'error',error:'private diagnostic'});assert(!JSON.stringify(f.messages).includes('private diagnostic'));
  f.handle({id:first.id,status:'ok'});assert.equal(f.connector.localAuthReady,false);
  f.handle(f.hello);const second=f.local.at(-1);f.handle({id:second.id,status:'ok'});assert.equal(f.connector.localAuthReady,true);
  const replacement={readyState:1,send:()=>{},close:()=>{}};f.connector.openStreamerBot(replacement);
  f.handle({id:second.id,status:'ok'});assert.equal(f.connector.localAuthReady,false);
  f.dispatch({request:'SendMessage'});assert.equal(f.local.length,2);
  f.connector.cloud=null;f.handle(f.hello,replacement);assert.equal(f.connector.outbox.length,0);
 }finally{f.connector.clearLocalAuth();}
});
test('legacy connector still relays challenges to deployments using a Render secret',()=>{
 const f=fixture('');f.handle(f.hello);assert.deepEqual(JSON.parse(f.messages.at(-1).payload),f.hello);assert(f.messages[0].connected);
});
test('cloud subscribes and may send replies only after the bridge attests to success; closes revoke readiness',()=>{
 const bridge=new BridgeHub({token:'test-bridge'});const sent=[];bridge.socket={readyState:1,send:v=>sent.push(JSON.parse(v))};
 const runtime=new IntegrationRuntime({config:{streamerBot:{},tikfinity:{}},bridge});runtime.start();
 const state=patch=>bridge.handleMessage(JSON.stringify({type:'service.state',service:'streamerbot',...patch}));
 try{
  state({connected:false,authenticatedLocally:true});assert.equal(runtime.streamerBot.canSendChat,false);
  state({connected:true,authenticatedLocally:true});assert.equal(runtime.streamerBot.canSendChat,true);assert.equal(JSON.parse(sent.at(-1).payload).request,'Subscribe');
  state({connected:true,authenticatedLocally:true});assert.equal(sent.length,1);
  assert.equal(runtime.streamerBot.sendChat('twitch','test fixture'),true);assert.equal(JSON.parse(sent.at(-1).payload).request,'SendMessage');
  state({connected:false});assert.equal(runtime.streamerBot.sendChat('twitch','test fixture'),false);
 }finally{runtime.stop();}
});
