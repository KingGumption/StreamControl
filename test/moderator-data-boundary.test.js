const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'moderator-projection-'));
process.env.APP_MODE='cloud';process.env.PUBLIC_BASE_URL='https://studio.example.test';
process.env.ADMIN_PASSWORD=crypto.randomUUID();process.env.BRIDGE_TOKEN=crypto.randomUUID();
const {app}=require('../src/admin'),access=require('../src/moderator-access'),{db,setConfigValue}=require('../src/db');
const {gameLauncher}=require('../src/game-launcher'), {bridgeHub}=require('../src/bridge-hub');
const {updateConnectionStatus}=require('../src/connection-status');
test('moderators see only operational game fields; owner source settings, private capture ledger and control assets stay private',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const get=(url,cookie)=>fetch(base+url,{headers:cookie?{Cookie:cookie}:{},redirect:'manual'});
 const mod=await access.create('helper',crypto.randomUUID());
 const cookie='stream_control_session='+access.issue({...mod,role:'games'});
 const owner='stream_control_session='+access.issue({id:'owner',role:'owner'});
 const marker=crypto.randomUUID();
 const fixture=gameLauncher.state();fixture.quiz.roster=[{id:marker}];fixture.arcade.extra=marker;
 fixture.presets={quiz:{questionCount:3,private:marker},unknown:{private:marker}};
 t.mock.method(gameLauncher,'state',()=>fixture);
 setConfigValue('games_control_persistent',{enabled:false,extra:marker});
 updateConnectionStatus('streamerbot',{detail:marker,url:marker});
 for(const url of ['/admin/games/session','/admin/games/connections','/admin/games/state']){
  const r=await get(url,cookie);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
  const data=await r.json();assert.equal(JSON.stringify(data).includes(marker),false);
  if(data.user)assert.deepEqual(data.user,{username:'helper',role:'games'});
  if(data.presets){assert.deepEqual(data.presets,{quiz:{questionCount:3}});assert.equal(data.quiz.phase,'idle');assert.ok(data.catalog.some(g=>g.id==='quiz'));}
  if(data.handoff)assert.deepEqual(data.handoff,{enabled:false});
 }
 const mock=t.mock.method(bridgeHub,'requestObs',async()=>{throw Error('should not be called');});
 for(const url of ['/admin/graphics/url/card','/admin/graphics/catalog','/admin/graphics/preview/banner','/admin/dashboard/state','/admin/polaroid/status','/admin/polaroid/control.js']){
  assert.equal((await get(url,cookie)).status,403,url);assert.equal((await get(url)).status,401,url);
 }
 assert.equal(mock.mock.callCount(),0);assert.equal((await get('/admin/polaroid/control.js',owner)).status,200);
 const dir=path.join(process.env.DATA_DIR,'polaroid-captures');fs.mkdirSync(dir,{recursive:true});
 const filename='2026-01-02T03-04-05-006Z_sample.jpg';fs.writeFileSync(path.join(dir,filename),Buffer.from([255,216,255,217]));
 fs.writeFileSync(path.join(dir,filename+'.json'),marker);
 assert.equal((await get('/polaroid/captures/'+filename)).status,200);
 for(const url of ['/polaroid/captures/'+filename+'.json','/polaroid/assets/control.js','/assets/polaroid/control.js'])assert.equal((await get(url)).status,404,url);
 for(const url of ['/polaroid','/polaroid/assets/overlay.css','/polaroid/assets/overlay.js','/polaroid/assets/audio/wow.mp3'])assert.equal((await get(url)).status,200,url);
});
