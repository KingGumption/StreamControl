const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
Object.assign(process.env,{DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'workspace-grants-')),APP_MODE:'cloud',PUBLIC_BASE_URL:'https://workspace.test',ADMIN_PASSWORD:crypto.randomUUID(),SESSION_SECRET:crypto.randomUUID(),BRIDGE_TOKEN:crypto.randomUUID()});
const {app}=require('../src/admin'),access=require('../src/moderator-access'),{sections}=require('../src/workspace-access');
test('each section grant changes both page and data access in an existing moderator session',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close()});
 const user=await access.create('helper',crypto.randomUUID()),url='http://127.0.0.1:'+server.address().port+'/admin';
 const cookie=user=>'stream_control_session='+access.issue(user);
 const owner=cookie({id:'owner',role:'owner'}),mod=cookie({...user,role:'games'});
 const call=(route,cookie,body)=>fetch(url+route,{redirect:'manual',method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const grants='/moderators/'+user.id+'/sections';
 for(const [key,group] of Object.entries(sections)){
   assert.equal((await call(grants,owner,{sections:[key],gameControl:false})).status,200);
   assert.equal((await call(group.page,mod)).status,200,key);
   for(const forbidden of ['/moderators/state','/games/device-token','/spotify/connect','/content-coach/tiktok/connect'])assert.equal((await call(forbidden,mod)).status,403);
   const other=key==='graphics'?'/games/state':'/graphics/catalog';assert.equal((await call(other,mod)).status,403);
   assert.equal((await call(grants,mod,{sections:['games']})).status,403);
 }
 await call('/moderators/handoff',owner,{enabled:true});
 await call(grants,owner,{sections:['games'],gameControl:false});
 assert.equal((await call('/games/action',mod,{action:'launch',game:'quiz'})).status,403);
 assert.equal((await (await call('/games/state',mod)).json()).controlEnabled,false);
 assert.equal((await call(grants,owner,{sections:['moderators']})).status,400);
 await call(grants,owner,{sections:[]});
 assert.equal((await call('/workspace',mod)).status,200);assert.equal((await call('/games/state',mod)).status,403);
 assert.equal((await call('/dashboard',mod)).headers.get('location'),'/admin/workspace');
});
