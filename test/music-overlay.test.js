const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(),'music-overlay-'));
const { EventEmitter } = require('node:events');
const { MusicOverlay, normalizePlayback } = require('../src/music-overlay');
const { SpotifyApiClient } = require('../src/spotify-api');
const sample = () => ({is_playing:true,currently_playing_type:'track',progress_ms:1500,item:{id:'track',type:'track',name:'Song',duration_ms:100000,artists:[{name:'Artist'}],album:{images:[{url:'https://i.scdn.co/image/cover'}]}}});
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const events = new EventEmitter(), tasks = new Map(); let enabled = true, style = 'classic', calls = 0, id = 0;
  const runtime = {songRequestsEnabled:()=>enabled,getSongOverlayStyle:()=>style,
    subscribeSongRequestsEnabled(fn){events.on('enabled',fn);return()=>events.off('enabled',fn);},
    subscribeSongOverlayStyle(fn){events.on('style',fn);return()=>events.off('style',fn);}};
  const api = {getPlaybackState:async()=>{calls++;return sample();}};
  const service = new MusicOverlay({api,runtime,now:()=>12345,schedule:(fn,ms)=>{const key=++id;tasks.set(key,{fn,ms});return key;},cancel:key=>tasks.delete(key)});
  return {service,api,tasks,events,calls:()=>calls,setEnabled(value){enabled=value;events.emit('enabled',value);},setStyle(value){style=value;events.emit('style',{style:value});}};
}
test('one poll is shared across OBS sources; closing the last stops polling and subscriptions', async()=>{
  const f=setup(), states=[];
  assert.equal(f.calls(),0);
  const closeA=f.service.subscribe(s=>states.push(s)),closeB=f.service.subscribe(()=>{});
  await flush(); assert.equal(f.calls(),1); assert.equal(f.tasks.size,1);
  assert.equal(states.at(-1).playback.name,'Song');
  assert.equal(states.at(-1).playback.observedAt,12345);
  closeA();assert.equal(f.tasks.size,1);closeB();assert.equal(f.tasks.size,0);assert.equal(f.events.eventNames().length,0);
});
test('off hides immediately, suppresses in-flight data, and on starts fresh without overlapping calls',async()=>{
  const f=setup(), states=[];let finish;
  f.api.getPlaybackState=()=>new Promise(resolve=>{finish=resolve;});
  const close=f.service.subscribe(s=>states.push(s));await flush();
  f.setEnabled(false);assert.deepEqual(states.at(-1),{enabled:false,style:'classic',playback:null});
  f.setEnabled(true);assert.equal(states.at(-1).playback,null);assert.equal(f.tasks.size,1);
  finish(sample());await flush();assert.equal(f.service.state().playback,null);
  f.api.getPlaybackState=async()=>sample();const task=[...f.tasks.values()][0];f.tasks.clear();task.fn();await flush();
  assert.equal(f.service.state().playback.id,'track');close();
});
test('theme changes propagate; disabled mode performs no Spotify request',async()=>{
  const f=setup(), states=[];f.setEnabled(false);const close=f.service.subscribe(s=>states.push(s));await flush();
  assert.equal(f.calls(),0);assert.equal(f.tasks.size,0);
  f.setStyle('halloween');assert.equal(states.at(-1).style,'halloween');assert.equal(states.at(-1).enabled,false);close();
});
test('paused, unavailable, adverts and failures clear now-playing; rate limits back off',async()=>{
  for (const data of [null,{...sample(),is_playing:false},{...sample(),currently_playing_type:'ad'},{...sample(),item:{type:'episode',id:'episode'}}]) assert.equal(normalizePlayback(data,10),null);
  const f=setup();f.api.getPlaybackState=async()=>{throw Object.assign(new Error('rate limited'),{code:'rate-limited',retryAfter:45});};
  const close=f.service.subscribe(()=>{});await flush();assert.equal(f.service.state().playback,null);assert.equal([...f.tasks.values()][0].ms,45000);close();
});
test('public playback exposes only display fields, sanitizes artwork, clamps progress',()=>{
  const data=sample();data.device={id:'private-device'};data.item.album.images[0].url='javascript:alert(1)';data.progress_ms=1000000;
  const result=normalizePlayback(data,50);assert.equal(result.albumArtUrl,'');assert.equal(result.progressMs,100000);assert.equal(result.device,undefined);
});
test('Spotify playback uses the existing read scope and gracefully handles no playback',async()=>{
  let url;
  const client=new SpotifyApiClient({auth:{hasScope:s=>s==='user-read-playback-state',getAccessToken:async()=>'token'},fetchImpl:async value=>{url=value;return new Response(null,{status:204});}});
  assert.equal(await client.getPlaybackState(),null);assert.equal(url,'https://api.spotify.com/v1/me/player');
  client.auth.hasScope=()=>false;await assert.rejects(client.getPlaybackState(),{code:'queue-permission-missing'});
});
