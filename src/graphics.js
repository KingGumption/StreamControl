const path = require('node:path');
const {getConfigValue,setConfigValue}=require('./db');
const {bridgeHub}=require('./bridge-hub');
const {streamEvents}=require('./sse');
const listeners=new Set();
const defaults={theme:null,transparency:0};
const read=()=>getConfigValue('graphics_settings',defaults);
const names={
 banner:'follow=new',bannerPlain:'follow=new-no-char',card:'PlayingCardTwitch-3D',cardVertical:'PlayingCard-3d-Tiktok',
 counter:'DeathCounter',credits:'StreamCredits',creditsVertical:'StreamCredits-Vertical',divider:'GlassOverlays',
 intro:'Spooktober-Intro',introVertical:'SpooktoberIntro-Vertical',stinger:'SkullStinger'
};
const themes=['classic','spooktober','vicecity'];
const obs=(m,args)=>bridgeHub.requestObs(m,args);
let tail=Promise.resolve(), retry;
async function sync(theme){
 clearTimeout(retry);
 const pending=[];
 for(const [id,inputName] of Object.entries(names)){
  if(id.startsWith('card')||id.startsWith('banner')||id==='counter')continue; // Card resolves the theme before loading its renderer.
  try{
   if(id==='stinger'){
    const t=await obs('GetCurrentSceneTransition');
    if(t.transitionName!==inputName){pending.push(inputName);continue;}
    const current=t.transitionSettings?.path;
    if(!current)throw Error();
    const leaf=theme==='vicecity'?'Glitch-Sticker-Vicecity-Horizontal.webm':'pig-print-horizontal.webm';
    const file=path.win32.join(path.win32.dirname(current),leaf).replaceAll('\\','/');
    if(current.replaceAll('\\','/')!==file)await obs('SetCurrentSceneTransitionSettings',{transitionSettings:{path:file},overlay:true});
    continue;
   }
   const {inputSettings:s}=await obs('GetInputSettings',{inputName});
   let patch;
   if(id.startsWith('intro')){
    const isVertical=id==='introVertical',size=isVertical?'9x16':'16x9';
    const leaf=(theme==='vicecity'?'KingGumption-Vice-Sunset-Dynamic-':'kinggumption-channel66-')+size+'.mp4';
    if(path.win32.basename(s.local_file).toLowerCase()===leaf.toLowerCase())continue;
    const media=await obs('GetMediaInputStatus',{inputName});
    if(['OBS_MEDIA_STATE_PLAYING','OBS_MEDIA_STATE_PAUSED','OBS_MEDIA_STATE_OPENING'].includes(media.mediaState)){pending.push(inputName);continue;}
    patch={local_file:path.win32.join(path.win32.dirname(s.local_file),leaf).replaceAll('\\','/')};
   }else if(id==='divider'){
    const palette={vicecity:['#a373d3','#eb9998'],spooktober:['#747d3c','#b8cb59'],classic:['#03f5d8','#c447ff']}[theme];
    const base=(s.css||'').split('/* stream graphics */')[0];
    patch={css:base+'/* stream graphics */.neon-divider{background:linear-gradient(90deg,transparent,'+palette[0]+' 24%,'+palette[1]+' 50%,'+palette[0]+' 76%,transparent)!important;box-shadow:0 0 10px '+palette[1]+'77!important}.neon-divider::after{background:'+palette[1]+'14!important}'};
    if(s.css===patch.css)continue;
   }else{
    const u=new URL(s.url);
    if((u.searchParams.get('style')||'classic')===theme)continue;
    if(id.startsWith('credits')&&(await obs('GetSourceActive',{sourceName:inputName})).videoActive){pending.push(inputName);continue;}
    if(theme==='classic')u.searchParams.delete('style');else u.searchParams.set('style',theme);
    patch={url:u.href};
   }
   await obs('SetInputSettings',{inputName,inputSettings:patch,overlay:true});
  }catch{pending.push(inputName);}
 }
 if(pending.length){retry=setTimeout(()=>{if(bridgeHub.connected)void queue();},30000);retry.unref?.();}
 return pending;
}
function queue(){const job=tail.then(()=>bridgeHub.connected&&read().theme?sync(read().theme):Object.values(names));tail=job.catch(()=>{});return job;}
function install(app,router){
 bridgeHub.on('connector-connected',()=>{if(read().theme)void queue();});
 app.get('/graphics/state',(_,res)=>res.set({'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}).json(read()));
 app.get('/graphics/events',(req,res,next)=>{res.set('Access-Control-Allow-Origin','*');next();},(req,res)=>streamEvents(req,res,{name:'graphics',initial:read,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}}));
 router.get('/graphics',(_,res)=>res.sendFile(path.join(__dirname,'../public/admin-graphics.html')));
 router.get('/graphics/catalog',(_,res)=>res.json(names));
 router.get('/graphics/preview/:id',async(req,res)=>{
  if(req.identity?.role!=='owner')return res.sendStatus(403);
  if(!Object.hasOwn(names,req.params.id))return res.sendStatus(404);
  try{const {imageData}=await obs('GetSourceScreenshot',{sourceName:names[req.params.id],imageFormat:'png',imageWidth:480});res.set('Cache-Control','no-store').type('png').send(Buffer.from(imageData.split(',')[1],'base64'));}catch{res.sendStatus(503);}
 });
 router.post('/graphics',async(req,res)=>{
  if(req.identity?.role!=='owner')return res.sendStatus(403);
  const {theme,transparency}=req.body||{};
  if(!themes.includes(theme)||!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
  const state={theme,transparency};setConfigValue('graphics_settings',state);for(const f of listeners)f(state);
  const pending=await queue();res.json({state,pending});
 });
}
module.exports={install};
