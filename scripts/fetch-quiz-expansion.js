// Download missing reference artwork; reviewed crops are stored with the questions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),file=path.join(root,'src/quiz-media-sources.json');
const entries=require('./quiz-media-expansion.json');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'StreamControlQuiz/1.0 (reference artwork)'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(String(r.status));return r;}
(async()=>{for(const [kind,titles] of Object.entries(entries)){for(const title of new Set(titles)){
 if(manifest.some(m=>m.title===title&&fs.existsSync(path.join(root,'public/quiz-media',m.file))))continue;
 try{
  const sourceUrl='https://en.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'));
  let imageUrl,originalUrl;
  if(kind==='logo'){
   const html=await (await get(sourceUrl)).text();
   imageUrl=html.match(/<table[^>]*class="[^"]*infobox[\s\S]*?<img[^>]*src="([^"]+)/)?.[1]?.replaceAll('&amp;','&');
   if(imageUrl?.startsWith('//'))imageUrl='https:'+imageUrl;
  }else{
   const data=await (await get('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title.replaceAll(' ','_')))).json();
   imageUrl=data.thumbnail?.source||data.originalimage?.source;originalUrl=data.originalimage?.source;
  }
  if(!imageUrl)throw Error('no image');
  let img;try{img=await get(imageUrl);}catch(e){
   imageUrl=originalUrl&&originalUrl!==imageUrl?originalUrl:imageUrl.includes('/thumb/')?imageUrl.split('?')[0].replace('/thumb/','/').replace(/\/[^/]+$/,''):imageUrl;img=await get(imageUrl);
  }
  const type=img.headers.get('content-type')?.split(';')[0];
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/svg+xml':'png'}[type];
  if(!ext)throw Error('unsupported image');
  const name=crypto.createHash('sha256').update(title).digest('hex').slice(0,16)+'.'+ext;
  let bytes=Buffer.from(await img.arrayBuffer());
  if(type==='image/svg+xml')bytes=await require('sharp')(bytes).resize({width:800}).png().toBuffer();
  fs.writeFileSync(path.join(root,'public/quiz-media',name),bytes);
  const entry={kind,title,file:name,sourceUrl,imageUrl},existing=manifest.findIndex(m=>m.title===title);
  if(existing>=0)manifest[existing]=entry;else manifest.push(entry);
  fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log('OK',kind,title);
 }catch(e){console.log('FAILED',kind,title,e.message);}await pause(450);
}}})();
