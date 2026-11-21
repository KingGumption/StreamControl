const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-connections-'));
Object.assign(process.env,{APP_MODE:'cloud',BRIDGE_TOKEN:'fixture-bridge'.repeat(4),SESSION_SECRET:'fixture-session'.repeat(4),ADMIN_PASSWORD:'fixture-owner-pass',PUBLIC_BASE_URL:'https://example.test'});
const {app}=require('../src/admin'),access=require('../src/moderator-access');
const {ConnectionStatusRegistry}=require('../src/connection-status');
test('connection summary projects the same four safe states for any signed-in workspace account',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const get=(cookie,route='/admin/workspace/connections',method='GET')=>fetch(base+route,{method,headers:cookie?{Cookie:'stream_control_session='+cookie}:{}});
 const sample={spotify:{state:'connected',account:'secret fixture',detail:'fixture scopes'},streamerbot:{state:'connecting',lastEvent:'private event'},tikfinity:{state:'disconnected',configured:true},connector:{state:'unknown internal error'},privateService:{state:'connected'}};
 t.mock.method(ConnectionStatusRegistry.prototype,'snapshot',()=>sample);
 const owner=access.issue({id:'owner',role:'owner'});
 const helper=await access.create('fixture-helper','test-helper-password');
 const moderator=access.issue({...helper,role:'games'});
 const expected={ok:true,connections:{spotify:{state:'connected'},streamerbot:{state:'connecting'},tikfinity:{state:'disconnected'},connector:{state:'unknown'}}};
 assert.equal((await get()).status,401);
 assert.equal((await get('expired-token')).status,401);
 for(const sections of [['games'],['graphics'],[]]){
   access.setSections(helper.id,sections);
   for(const identity of [owner,moderator]){
     const r=await get(identity);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),expected);
   }
   assert.equal((await get(moderator,'/admin/connections')).status,403);
   assert.equal((await get(moderator,'/admin/workspace/connections','POST')).status,403);
 }
 delete sample.tikfinity;assert.equal((await (await get(owner)).json()).connections.tikfinity.state,'unknown');
 access.revoke(helper.id);assert.equal((await get(moderator)).status,401);
});
