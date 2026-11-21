const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'graphics-access-'));
Object.assign(process.env,{APP_MODE:'cloud',BRIDGE_TOKEN:'test-only-bridge'.repeat(4),SESSION_SECRET:'test-only-session'.repeat(4),ADMIN_PASSWORD:'fixture-password',PUBLIC_BASE_URL:'https://example.test'});
const {app}=require('../src/admin'),access=require('../src/moderator-access'),{bridgeHub}=require('../src/bridge-hub');
test('source URLs are owner-only, reject unrelated sources and remember no event parameters', async t=>{
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));t.after(()=>{srv.closeAllConnections();srv.close()});
 const base='http://127.0.0.1:'+srv.address().port;
 const get=(route,session)=>fetch(base+'/admin/graphics/'+route,{headers:session?{Cookie:'stream_control_session='+session}:{}});
 const owner=access.issue({id:'owner',role:'owner'}),moderator=access.issue({...await access.create('fixture-mod','fixture-password'),role:'games'});
 for(const route of ['catalog','url/card','preview/card']){assert.equal((await get(route)).status,401);assert.equal((await get(route,moderator)).status,403)}
 let url='file:///D:/fixtures/FollowerCard-Blender/index.html?frame=spooky&name=Trevor&follower=Example&token=fictional#ignored';
 t.mock.method(bridgeHub,'requestObs',async()=>({inputSettings:{url}}));
 const r=await get('url/card',owner);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).url,'file:///D:/fixtures/FollowerCard-Blender/index.html?frame=spooky&name=Trevor&follower=Example');
 const list=await (await get('catalog',owner)).json();assert.equal(list.find(i=>i.id==='card').base,'file:///D:/fixtures/FollowerCard-Blender/index.html');
 url='https://example.test/private';assert.equal((await get('url/card',owner)).status,409);
});
