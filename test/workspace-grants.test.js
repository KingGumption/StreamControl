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
 const {spotifyApi}=require('../src/spotify-api'),{bridgeHub}=require('../src/bridge-hub');
 const track={name:'Sample track',uri:'spotify:track:sample'};
 t.mock.method(spotifyApi,'randomPlaylistTrack',async()=>track);
 let liveState={outputActive:true,outputReconnecting:false};
 t.mock.method(bridgeHub,'requestObs',async method=>{assert.equal(method,'GetStreamStatus');return liveState});
 const launch=t.mock.method(bridgeHub,'launchSpotify',async()=>({deviceName:'Stream PC'}));
 t.mock.method(spotifyApi,'playStreamTrack',async(device,selected)=>{assert.equal(device,'Stream PC');assert.equal(selected,track)});
 assert.equal((await call('/spotify/launch','',{})).status,401);
 assert.equal((await call('/spotify/launch',owner,{})).status,200);
 for(const state of [{outputActive:false},{outputActive:true,outputReconnecting:true},null]){
   liveState=state;const before=launch.mock.callCount();
   assert.equal((await call('/spotify/launch',owner,{})).status,409);
   assert.equal(launch.mock.callCount(),before);
 }
 assert.equal((await call('/spotify/launch',owner,{offlineTest:true})).status,200);
 assert.deepEqual(launch.mock.calls.at(-1).arguments,[true]);
 liveState={outputActive:true};
 const grants='/moderators/'+user.id+'/sections';
 for(const [key,group] of Object.entries(sections)){
   assert.equal((await call(grants,owner,{sections:[key],gameControl:false})).status,200);
   assert.equal((await call(group.page,mod)).status,200,key);
   for(const forbidden of ['/moderators/state','/games/device-token','/spotify/connect','/content-coach/tiktok/connect'])assert.equal((await call(forbidden,mod)).status,403);
   const before=launch.mock.callCount();
   assert.equal((await call('/spotify/launch',mod,{offlineTest:true})).status,403);
   assert.equal((await call('/spotify/launch',mod,{})).status,403);
   assert.equal(launch.mock.callCount(),before);
   const other=key==='graphics'?'/games/state':'/graphics/catalog';assert.equal((await call(other,mod)).status,403);
   assert.equal((await call(grants,mod,{sections:['games']})).status,403);
 }
 const setOpen=value=>call('/settings/song-requests',mod,{songRequestsEnabled:value});
 const explicit=()=>call('/settings/explicit-tracks',mod,{allowExplicitTracks:true});
 await call(grants,owner,{sections:['songs'],songControls:['explicit']});
 assert.equal((await explicit()).status,200);assert.equal((await setOpen(false)).status,403);
 await call(grants,owner,{sections:['songs'],songControls:['requests']});
 assert.equal((await explicit()).status,403);assert.equal((await setOpen(false)).status,200);
 const beforeOpen=launch.mock.callCount();liveState={outputActive:false};
 assert.equal((await setOpen(true)).status,409);assert.equal(launch.mock.callCount(),beforeOpen);
 liveState={outputActive:true};assert.equal((await setOpen(true)).status,200);assert.equal((await setOpen(true)).status,200);
 assert.equal(launch.mock.callCount(),beforeOpen+1);
 await call('/moderators/handoff',owner,{enabled:true});
 await call(grants,owner,{sections:['games'],gameControl:false});
 assert.equal((await call('/games/action',mod,{action:'launch',game:'quiz'})).status,403);
 assert.equal((await (await call('/games/state',mod)).json()).controlEnabled,false);
 assert.equal((await call(grants,owner,{sections:['moderators']})).status,400);
 await call(grants,owner,{sections:[]});
 assert.equal((await call('/workspace',mod)).status,200);assert.equal((await call('/games/state',mod)).status,403);
 assert.equal((await call('/dashboard',mod)).headers.get('location'),'/admin/workspace');
});
