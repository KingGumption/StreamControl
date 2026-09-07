const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..');const entries=require('./quiz-media-expansion.json');const manifest=require('../src/quiz-media-sources.json');
const output=path.join(root,'..','.quiz-review');fs.mkdirSync(output,{recursive:true});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const args=process.argv.slice(2),clues=args.includes('--clues'),kinds=args.filter(a=>a!=='--clues');
const bank=require('../src/quiz-questions.json');
(async()=>{for(const kind of kinds.length?kinds:['actor','poster','logo']){
 const items=manifest.filter(m=>entries[kind].includes(m.title));
 fs.writeFileSync(path.join(output,kind+'-index.json'),JSON.stringify(items,null,2));
 const columns=kind==='actor'?6:4,rows=kind==='actor'?5:4,w=240,h=kind==='poster'?370:220;
 for(let start=0;start<items.length;start+=columns*rows){const composites=[];for(let i=0;i<Math.min(columns*rows,items.length-start);i++){
  const m=items[start+i],x=i%columns*w,y=Math.floor(i/columns)*h;
  let input=sharp(path.join(root,'public/quiz-media',m.file));
  const crop=clues?bank.find(q=>q.image?.file===m.file)?.image.crop:null;
  if(crop){const meta=await input.metadata();const [cx,cy,cw,ch]=crop;input=input.extract({left:Math.floor(cx*meta.width),top:Math.floor(cy*meta.height),width:Math.max(1,Math.floor(cw*meta.width)),height:Math.max(1,Math.floor(ch*meta.height))});}
  const thumb=await input.resize(w-12,h-42,{fit:'contain',background:'#e9e9e9'}).png().toBuffer();composites.push({input:thumb,left:x+6,top:y});
  const label=`<svg width="${w}" height="40"><rect width="100%" height="100%" fill="white"/><text x="4" y="14" font-size="11">${start+i}: ${escape(m.title.slice(0,35))}</text><text x="4" y="30" font-size="10">${escape(m.title.slice(35,70))}</text></svg>`;composites.push({input:Buffer.from(label),left:x,top:y+h-40});
 }await sharp({create:{width:w*columns,height:h*rows,channels:4,background:'#fff'}}).composite(composites).png().toFile(path.join(output,kind+(clues?'-clues':'')+'-'+Math.floor(start/(columns*rows))+'.png'));}
 console.log(kind,items.length);
}})();
