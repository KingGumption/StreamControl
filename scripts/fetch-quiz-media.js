const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const entries = [
 ['character','Mario'],['character','Link (The Legend of Zelda)'],['character','Lara Croft'],['character','Sonic the Hedgehog (character)'],['character','Kirby (character)'],['character','Kratos (God of War)'],
 ['poster','Alien (film)'],['poster','Jaws (film)'],['poster','Jurassic Park (film)'],['poster','The Matrix'],['poster','Back to the Future'],['poster','The Thing (1982 film)'],
 ['actor','Sigourney Weaver'],['actor','Keanu Reeves'],['actor','Arnold Schwarzenegger'],['actor','Jamie Lee Curtis'],['actor','Nicolas Cage'],['actor','Bruce Campbell'],
 ['logo','Triforce'],['logo','Gears of War'],['logo','Portal (series)'],
 ['logo','Assassin\'s Creed'],['logo','Half-Life (series)'],['logo','Mortal Kombat'],['logo','BioShock'],
];
const root = path.join(__dirname, '..');
const output = path.join(root, 'public', 'quiz-media');
fs.mkdirSync(output, {recursive:true});
const manifestFile = path.join(root, 'src', 'quiz-media-sources.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : [];
async function fetchSlow(url, options) {
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,options);if(response.status!==429)return response;await new Promise(r=>setTimeout(r,4000));
 }
 return fetch(url,options);
}
async function run(entry) {
 const [kind,title] = entry;
 if(manifest.some(m=>m.title===title))return;
 try {
  const url='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title.replaceAll(' ','_'));
  const response=await fetchSlow(url,{headers:{'User-Agent':'StreamControlQuiz/1.0 (quiz artwork sources)'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`summary ${response.status}`);
  const data=await response.json();const imageUrl=data.thumbnail?.source||data.originalimage?.source;
  if(!imageUrl)throw Error('no image');
  const image=await fetchSlow(imageUrl,{headers:{'User-Agent':'StreamControlQuiz/1.0'},signal:AbortSignal.timeout(20000)});
  if(!image.ok)throw Error(`image ${image.status}`);
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/svg+xml':'svg'}[image.headers.get('content-type')?.split(';')[0]];
  if(!ext)throw Error('unsupported image');
  const id=crypto.createHash('sha256').update(title).digest('hex').slice(0,16);
  const file=`${id}.${ext}`;fs.writeFileSync(path.join(output,file),Buffer.from(await image.arrayBuffer()));
  manifest.push({kind,title,file,sourceUrl:data.content_urls?.desktop?.page||url,imageUrl});
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  console.log(kind,title,file);
 }catch(e){console.log('FAILED',title,e.message);}
}
(async()=>{for(const entry of entries){await run(entry);await new Promise(r=>setTimeout(r,1200));}})();
