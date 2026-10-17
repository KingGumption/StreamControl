const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandService } = require('../src/command-service');
const { SpotifyApiClient } = require('../src/spotify-api');
const { loadAppConfig } = require('../src/app-config');
const { normalizeStreamerBotEvent } = require('../src/chat-events');
function setup({dryRun=false, fail=false}={}) {
  const calls=[];
  const row={id:12, track_name:'Song', spotify_uri:'spotify:track:123', status:'accepted'};
  const config={...loadAppConfig({USER_COOLDOWN_SECONDS:'0',GLOBAL_COOLDOWN_SECONDS:'0'}),dryRun};
  config.dryRun=dryRun;
  const service=new CommandService({config,loadPermissions:()=>({}),areSongRequestsEnabled:()=>false,
    spotify:{getActivePlaybackDevice:async()=>({id:'device'}),skipTrack:async id=>{calls.push(['skip',id]);},removeTrackFromPlaylist:async uri=>{calls.push(['remove',uri]);if(fail)throw new Error('failed');}},
    history:{getLastAcceptedSongRequest:()=>row,getSongRequest:id=>Number(id)===12?row:null,deleteSongRequest:id=>{calls.push(['delete',id]);return true;}}});
  const send=(text,roles=['moderator'])=>service.handleChatEvent({platform:'twitch',text,user:{id:'1',username:'Mod',roles}});
  return {calls,send,service};
}
test('controls respect permissions and remain usable while requests are closed',async()=>{
  const {send,calls}=setup();
  for(const command of ['!skip','!songremove']) assert.equal((await send(command,[])).status,'denied');
  assert.deepEqual(calls,[]);
  assert.equal((await send('!skip')).status,'ok');
  assert.deepEqual(calls,[['skip','device']]);
});
test('remove latest or explicit ID only deletes history after playlist success',async()=>{
  for(const command of ['!songremove','!songremove 12']) {
    const {send,calls}=setup();
    assert.match((await send(command)).response,/remains in Spotify/);
    assert.deepEqual(calls,[['remove','spotify:track:123'],['delete',12]]);
  }
  const {send,calls}=setup({fail:true});
  assert.equal((await send('!songremove')).status,'error');
  assert.equal(calls.some(c=>c[0]==='delete'),false);
});
test('dry run and invalid commands do not mutate Spotify or history',async()=>{
  const {send,calls}=setup({dryRun:true});
  for(const command of ['!skip','!songremove']) assert.equal((await send(command)).status,'dry-run');
  for(const command of ['!skip blah','!songremove Queen','!songremove -1']) assert.equal((await send(command)).status,'usage');
  assert.equal((await send('!songremove 999')).status,'not-found');
  assert.deepEqual(calls,[]);
});
test('simultaneous skips cannot advance multiple tracks',async()=>{
  const {send,service,calls}=setup();
  let finish;
  service.spotify.skipTrack=()=>new Promise(resolve=>{finish=resolve;});
  const pending=send('!skip');
  await Promise.resolve();
  assert.equal((await send('!skip')).status,'busy');
  finish();
  assert.equal((await pending).status,'ok');
});
test('Spotify skip uses POST and maps missing device',async()=>{
  const requests=[];
  const client=new SpotifyApiClient({auth:{getAccessToken:async()=> 'token',hasScope:()=>true},fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(null,{status:204});}});
  await client.skipTrack('my device');
  assert.equal(requests[0].url,'https://api.spotify.com/v1/me/player/next?device_id=my+device');
  assert.equal(requests[0].options.method,'POST');
  client.fetch=async()=>new Response('{}',{status:404});
  await assert.rejects(client.skipTrack(),{code:'queue-no-active-device'});
});
test('Streamer.bot self song commands are accepted but internal replies remain ignored',()=>{
  for(const text of ['!song Queen','!skip','!songremove 12','!playlist','!songlast']) {
    const payload={event:{source:'Twitch',type:'ChatMessage'},data:{meta:{isMe:true},user:{id:'1',login:'Owner',isBroadcaster:true},text}};
    assert.equal(normalizeStreamerBotEvent(payload).text,text);
    payload.data.meta.internal=true;
    assert.equal(normalizeStreamerBotEvent(payload),null);
  }
});
