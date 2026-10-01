const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'content-tiktok-'));
const {createTikTokConnection}=require('../src/content-tiktok');
const {getConfigValue}=require('../src/db');
const store=require('../src/content-coach-store');
const automationStore=require('../src/content-automation-store');
const now=Date.parse('2026-09-30T12:00:00Z');
const response=data=>({ok:true,status:200,json:async()=>data});
const requests=[];
const fetchImpl=async(url,options={})=>{requests.push({url:String(url),body:String(options.body||'')});if(String(url).includes('/oauth/token/'))return response({access_token:'access-test-secret',refresh_token:'refresh-test-secret',expires_in:86400,refresh_expires_in:31536000,scope:'user.info.basic,video.list',open_id:'open-test'});if(String(url).includes('/user/info/'))return response({data:{user:{open_id:'open-test',display_name:'KingGumption'}},error:{code:'ok'}});if(String(url).includes('/video/list/'))return response({data:{videos:[{id:'100',title:'Post',video_description:'Gaming #fun',cover_image_url:'https://p16.tiktokcdn.com/cover.jpg',share_url:'https://www.tiktok.com/@KingGumption/video/100?share=1',create_time:Date.parse('2026-09-23T12:00:00Z')/1000,duration:40,view_count:1200,like_count:50,comment_count:2,share_count:12}]},error:{code:'ok'}});if(String(url).includes('/oauth/revoke/'))return response({});throw Error('Unexpected provider URL.');};
const environment={PUBLIC_BASE_URL:'https://example.test',SESSION_SECRET:'s'.repeat(40),TIKTOK_CLIENT_KEY:'client-key',TIKTOK_CLIENT_SECRET:'client-secret'};
test('TikTok login enforces state/session and stores encrypted tokens; sync imports only exposed metrics',async()=>{
 const connector=createTikTokConnection({environment,fetchImpl,now:()=>now});assert.equal(connector.status().configured,true);assert.equal(connector.status().connected,false);
 let url=new URL(connector.begin('owner-session'));assert.equal(url.origin,'https://www.tiktok.com');assert.equal(url.searchParams.get('scope'),'user.info.basic,video.list');assert.equal(url.searchParams.get('redirect_uri'),'https://example.test/admin/content-coach/tiktok/callback');
 await assert.rejects(connector.callback({state:url.searchParams.get('state'),code:'test-code',sessionCookie:'different-session'}),/session/);
 url=new URL(connector.begin('owner-session'));await connector.callback({state:url.searchParams.get('state'),code:'test-code',sessionCookie:'owner-session'});
 assert.equal(connector.status().account.displayName,'KingGumption');assert.equal(getConfigValue('content_tiktok_auth_v1').includes('access-test-secret'),false);
 const result=await connector.sync();assert.equal(result.posts,1);assert.equal(result.observations,2);assert.equal(result.skipped.length,0);
 const rows=store.read().records;assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(r=>r.window)),new Set(['lifetime','7d']));assert.ok(rows.every(r=>r.traffic==='unknown'&&r.views===1200&&r.shares===12&&r.averageViewSeconds===null));
 assert.deepEqual(automationStore.listPosts()[0].metadata.hashtags,['#fun']);
 assert.equal(connector.status().account.lastSyncAt,'2026-09-30T12:00:00.000Z');assert.ok(requests.some(r=>r.url.includes('/video/list/')));
 const current=store.read();store.save({revision:current.revision,type:'import',rows:current.records.map(r=>({...r,traffic:'organic',averageViewSeconds:20,source:'Creator analytics export'}))});await connector.sync();assert.ok(store.read().records.every(r=>r.traffic==='organic'&&r.averageViewSeconds===20));
 await connector.disconnect();assert.equal(connector.status().connected,false);assert.equal(store.read().records.length,2);
});
test('connector stays unavailable without an approved developer app configuration',()=>{
 const connector=createTikTokConnection({environment:{PUBLIC_BASE_URL:'https://example.test'},fetchImpl,now:()=>now});assert.equal(connector.status().configured,false);assert.throws(()=>connector.begin('owner'),/Configure/);
});
test('TikTok authorization state survives a server restart and expires after 30 minutes',async()=>{
 let clock=now;
 const first=createTikTokConnection({environment,fetchImpl,now:()=>clock});
 const state=new URL(first.begin('same-session')).searchParams.get('state');
 const restarted=createTikTokConnection({environment,fetchImpl,now:()=>clock});
 await assert.rejects(restarted.callback({state,code:'test-code',sessionCookie:'different-session'}),/session/);
 clock+=29*60*1000;
 await restarted.callback({state,code:'test-code',sessionCookie:'same-session'});
 const expired=new URL(first.begin('same-session')).searchParams.get('state');
 clock+=31*60*1000;
 await assert.rejects(restarted.callback({state:expired,code:'test-code',sessionCookie:'same-session'}),/expired/);
});
