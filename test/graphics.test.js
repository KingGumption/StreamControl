const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('card keeps event data when Streamer.bot supplies a stale frame',async()=>{
 const src=fs.readFileSync('scripts/follower-frame-client.js','utf8');let result;
 const href='http://localhost/card?frame=spooky&follower=Summer+%F0%9F%A5%91&rarity=auto&character=Trevor.png';
 await vm.runInNewContext('(async()=>{'+src+';await resolveStreamFrame()})()', {location:{href},URL,fetch:async()=>({ok:true,json:async()=>({theme:'vicecity'})}),AbortSignal,history:{replaceState:(_,__,u)=>result=u}});
 const expected=new URL(href);expected.searchParams.set('frame','vicecity');assert.equal(result.href,expected.href);
});
test('Spotify preview maps slider endpoints and ignores messages from other origins',()=>{
 const html=fs.readFileSync('public/admin-graphics.html','utf8'); new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 const src=fs.readFileSync('public/music-overlay.js','utf8').split('  let enabled')[0]+'})();';const root={style:{}},doc={dataset:{}},parent={};let receive;
 vm.runInNewContext(src,{URLSearchParams,location:{search:'?preview=1',origin:'https://test'},document:{getElementById:()=>root,documentElement:doc},parent,addEventListener:(k,f)=>receive=f});
 const send=(n,origin)=>receive({source:parent,origin,data:{type:'graphics-preview',theme:'vicecity',transparency:n}});
 send(100,'elsewhere');assert.equal(root.style.opacity,undefined);send(100,'https://test');assert.equal(root.style.opacity,'0');assert.equal(doc.dataset.theme,'vicecity');send(0,'https://test');assert.equal(root.style.opacity,'1');
});
