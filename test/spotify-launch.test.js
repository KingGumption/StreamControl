const {test}=require('node:test'),assert=require('node:assert/strict');
const {SpotifyApiClient}=require('../src/spotify-api');
test('launch picks an eligible track across pages and starts its playlist on the named stream PC',async t=>{
 const api=new SpotifyApiClient({auth:{},config:{spotify:{playlistId:'stream',cleanOnly:true}}});
 const sample={name:'Stream tune',uri:'spotify:track:chosen',explicit:false,type:'track'};
 const calls=[];
 t.mock.method(api,'request',async(path,options)=>{
   calls.push([path,options]);
   if(path.endsWith('offset=0'))return {items:[null,{item:{...sample,explicit:true}},{track:{...sample,is_local:true}}],next:'more'};
   if(path.endsWith('offset=3'))return {items:[{track:sample}],next:null};
   if(path.endsWith('devices'))return {devices:[{name:'Other',type:'computer',id:'other',is_active:true},{name:'STREAMPC',type:'Computer',id:'target'}]};
 });
 const track=await api.randomPlaylistTrack();assert.equal(track.name,sample.name);
 await api.playStreamTrack('StreamPC',track,async()=>{});
 assert.deepEqual(calls.at(-1)[0],'/me/player/play?device_id=target');
 assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{context_uri:'spotify:playlist:stream',offset:{uri:sample.uri}});
});
