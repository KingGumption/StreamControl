const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'song-cooldown-'));
process.env.APP_MODE='cloud';process.env.PUBLIC_BASE_URL='https://stream.example.test';
process.env.ADMIN_PASSWORD='owner-password-test';
const {app}=require('../src/admin'),{db,getConfigValue}=require('../src/db');

test('owner can adjust or disable the persisted track cooldown; invalid changes retain the last value',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();db.close()});
 const base='http://127.0.0.1:'+server.address().port,endpoint='/admin/settings/duplicate-song-cooldown';
 function post(route,body,cookie){return fetch(base+route,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Origin:process.env.PUBLIC_BASE_URL,...(cookie?{cookie}:{})},body:JSON.stringify(body)})}
 assert.equal((await post(endpoint,{duplicateSongCooldownMinutes:0})).status,401);
 const login=await post('/admin/login',{username:'owner',password:process.env.ADMIN_PASSWORD});
 assert.equal(login.status,302);const cookie=login.headers.get('set-cookie').split(';')[0];
 async function read(){return (await (await fetch(base+'/admin/config',{headers:{cookie}})).json()).settings.duplicateSongCooldownMinutes}
 assert.equal(await read(),30);
 for(const value of [1440,5,0]){
  assert.equal((await post(endpoint,{duplicateSongCooldownMinutes:value},cookie)).status,200);
  assert.equal(await read(),value);assert.equal(getConfigValue('duplicate_song_cooldown_minutes'),value);
 }
 for(const invalid of [-1,1441,'12',false,null,1.5]){
  assert.equal((await post(endpoint,{duplicateSongCooldownMinutes:invalid},cookie)).status,400);
  assert.equal(await read(),0);
 }
});
