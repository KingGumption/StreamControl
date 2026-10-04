const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..'),dir=path.join(root,'public/hill-art-official'),file=path.join(dir,'manifest.json'),cacheFile=path.join(__dirname,'hill-image-metadata.json');
const sources=require('./hill-image-sources.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8')),metadata=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile,'utf8')):{},failures=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchOk(url){for(let n=0;n<4;n++){const r=await fetch(url,{headers:{'User-Agent':'KingGumptionStreamControl/1.0 (reference image catalogue)'},signal:AbortSignal.timeout(30000)});if(r.ok)return r;if(r.status===429){const sec=Math.max(45,Number(r.headers.get('retry-after'))||60);console.log('Source cooldown '+sec+'s');await delay(sec*1000);continue;}if(r.status===404)throw Error('404');await delay(2000);}throw Error('Source unavailable');}
async function main(){
 const missing=Object.entries(sources).filter(([k])=>!manifest.assets[k]?.file||!fs.existsSync(path.join(dir,manifest.assets[k].file)));
 const subjects=[...new Set(missing.map(([,s])=>s.subject))].filter(s=>!metadata[s]);
 for(let i=0;i<subjects.length;i+=20){const batch=subjects.slice(i,i+20),url=new URL('https://en.wikipedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',prop:'pageimages|info',inprop:'url',piprop:'thumbnail|original',pilicense:'any',pilimit:'50',pithumbsize:'640',redirects:'1',titles:batch.join('|')});
 const data=await(await fetchOk(url)).json();const redirects=new Map([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map(x=>[x.from,x.to]));
 for(const subject of batch){let title=subject;for(let n=0;n<5&&redirects.has(title);n++)title=redirects.get(title);const page=Object.values(data.query?.pages||{}).find(p=>p.title===title);metadata[subject]=page?{title:page.title,url:page.fullurl,image:page.thumbnail?.source,original:page.original?.source}:{};}
 fs.writeFileSync(cacheFile,JSON.stringify(metadata,null,2));console.log('Metadata '+Math.min(i+20,subjects.length)+'/'+subjects.length);await delay(1200);}
 const images=new Map();
 for(const asset of Object.values(manifest.assets)){if(asset.imageUrl&&asset.file&&fs.existsSync(path.join(dir,asset.file))){const url=new URL(asset.imageUrl);url.search='';images.set(url.href,fs.readFileSync(path.join(dir,asset.file)));}}
 for(const [key,source]of missing){try{const meta=metadata[source.subject];if(!meta?.image&&!meta?.original)throw Error('No image on exact subject');const canonical=new URL(meta.image||meta.original);canonical.search='';const url=canonical.href;let output=images.get(url);
 if(!output){const bytes=Buffer.from(await(await fetchOk(url)).arrayBuffer());output=await sharp(bytes,{limitInputPixels:64000000}).resize({width:760,height:560,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();images.set(url,output);await delay(1000);}
 const relative=key+'.webp';fs.mkdirSync(path.dirname(path.join(dir,relative)),{recursive:true});fs.writeFileSync(path.join(dir,relative),output);
 manifest.assets[key]={file:relative,title:source.title,topic:source.topic,sourceType:source.illustrative?'contextual-reference':'reference-image',sourceOwner:'See source page for creator and licence',sourceTitle:meta.title,sourceUrl:meta.url,imageUrl:url,usageNote:'Reference artwork; consult the source image page for attribution and licence.',illustrative:!!source.illustrative};fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log('OK '+key+' '+source.title);
 }catch(e){failures.push({key,...source,error:e.message});console.log('MISSING '+key+' '+source.title+' '+e.message);}}
 manifest.generatedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(__dirname,'hill-image-missing.json'),JSON.stringify(failures,null,2));console.log('Missing '+failures.length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
