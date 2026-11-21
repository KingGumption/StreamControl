const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
Object.assign(process.env,{APP_MODE:'cloud',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'christmas-')),PUBLIC_BASE_URL:'https://workspace.test',SESSION_SECRET:crypto.randomUUID(),BRIDGE_TOKEN:crypto.randomUUID(),ADMIN_PASSWORD:crypto.randomUUID()});
const {app}=require('../src/admin');
const {bridgeHub}=require('../src/bridge-hub');
const access=require('../src/moderator-access');

test('Christmas selects each OBS asset and removing the theme restores the likes widget',async t=>{
 const server=app.listen(0,'127.0.0.1');
 await new Promise(done=>server.once('listening',done));
 t.after(()=>{server.closeAllConnections();server.close()});
 const origin='http://127.0.0.1:'+server.address().port;
 const owner=access.issue({id:'owner',role:'owner'});
 const post=body=>fetch(origin+'/admin/graphics',{method:'POST',headers:{cookie:'stream_control_session='+owner,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const calls=[];
 const stalled=Promise.withResolvers();
 t.after(()=>stalled.resolve());
 t.mock.getter(bridgeHub,'connected',()=>true);
 t.mock.method(bridgeHub,'requestObs',async(method,args)=>{
  calls.push({method,args});
  if(calls.length===1)await stalled.promise;
  if(method==='GetCurrentSceneTransition')return {transitionName:'SkullStinger',transitionSettings:{path:'media/pig-print-horizontal.webm'}};
  if(method==='GetInputSettings')return {inputSettings:{local_file:'media/original.mp4',css:'.base{}',url:'http://localhost:8791/?vertical=1'}};
  if(method==='CallVendorRequest')return {responseData:{success:true,transitions:['StingerVERTYT','SkullStingerVertical'].map(name=>({name,type:'obs_stinger_transition',settings:{path:'media/pig-print-vertical.webm'}}))}};
  return {};
 });
 const result=await Promise.race([
  post({scope:'theme',theme:'christmas'}).then(r=>r.json()),
  require('node:timers/promises').setTimeout(3000,null,{ref:false})
 ]);
 assert.equal(result?.state.theme,'christmas','theme save must finish even while OBS is stalled');
 assert.equal(result.obsSync,'syncing');
 const read=()=>fetch(origin+'/graphics/state').then(r=>r.json());
 assert.equal((await read()).theme,'christmas');
 stalled.resolve();
 assert.equal((await read()).obsSync,'complete');
 const css=()=>fetch(origin+'/graphics/likes.css').then(r=>r.text());
 assert.match(await css(),/\.thin-source/);
 const updates=Object.fromEntries(calls.filter(c=>c.method==='SetInputSettings').map(({args})=>[args.inputName,args.inputSettings]));
 assert.match(updates['Spooktober-Intro'].local_file,/KingGumption-Christmas-16x9\.mp4$/);
 assert.match(updates['SpooktoberIntro-Vertical'].local_file,/KingGumption-Christmas-9x16\.mp4$/);
 assert.match(updates.StreamCredits.url,/style=christmas/);
 assert.match(updates['StreamCredits-Vertical'].url,/vertical=1.*style=christmas/);
 assert.match(updates.GlassOverlays.css,/#E7BC70/);
 assert.match(calls.find(c=>c.method==='SetCurrentSceneTransitionSettings').args.transitionSettings.path,/Glitch-Sticker-Christmas-Horizontal\.webm$/);
 const vertical=calls.filter(c=>c.args?.requestType==='transitions_add');
 assert.equal(vertical.length,2);
 assert.ok(vertical.every(c=>c.args.requestData.settings.path.endsWith('Glitch-Sticker-Christmas-Vertical.webm')));
 assert.deepEqual(calls.filter(c=>c.method==='PressInputPropertiesButton').map(c=>c.args.inputName).sort(),['Like-Leaderboard','ThinLikeCount']);
 assert.equal((await post({scope:'spotify',spotifyStyle:'christmas',transparency:33})).status,200);
 await post({scope:'theme',theme:'vicecity'});
 assert.doesNotMatch(await css(),/\.thin-source/);
});
