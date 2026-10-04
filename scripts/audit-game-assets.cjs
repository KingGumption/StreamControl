const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {TOPICS}=require('../src/hill-game');
const root=path.join(__dirname,'..'),manifest=require('../public/hill-art-official/manifest.json');
(async()=>{const missing=[],invalid=[];let total=0,bytes=0;
for(const topic of TOPICS)for(const entry of topic.entries){total++;const asset=manifest.assets[`${topic.id}/${entry.id}`];if(!asset?.file){missing.push({topic:topic.title,title:entry.title});continue;}try{const file=path.join(root,'public/hill-art-official',asset.file);const info=await sharp(file).metadata();if(!info.width||!info.height)throw Error('Empty image');bytes+=fs.statSync(file).size;if(!asset.sourceUrl||!asset.sourceType)throw Error('Source metadata missing');}catch(e){invalid.push({title:entry.title,error:e.message});}}
const result={total,covered:total-missing.length-invalid.length,missing,invalid,megabytes:Number((bytes/1048576).toFixed(2))};console.log(JSON.stringify(result,null,2));if(missing.length||invalid.length)process.exitCode=1;
})();
