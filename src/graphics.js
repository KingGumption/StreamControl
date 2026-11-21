const path = require('node:path');
const {getConfigValue,setConfigValue}=require('./db');
const {bridgeHub}=require('./bridge-hub');
const {streamEvents}=require('./sse');
const listeners=new Set();
const defaults={theme:null,transparency:0};
const spotifyStyles=['stream','classic','halloween','ghost','slime','spooktober','vicecity'];
function read(){
 const state=getConfigValue('graphics_settings',defaults);
 // Match the visual precedence of existing installs until the owner makes a choice.
 const legacy=state.theme ? null : getConfigValue('song_overlay_style',null);
 return {...state,spotifyStyle:state.spotifyStyle || (spotifyStyles.includes(legacy)?legacy:null)};
}
const names={
 banner:'follow=new',bannerPlain:'follow=new-no-char',card:'PlayingCardTwitch-3D',cardVertical:'PlayingCard-3d-Tiktok',
 counter:'DeathCounter',credits:'StreamCredits',creditsVertical:'StreamCredits-Vertical',divider:'GlassOverlays',
 intro:'Spooktober-Intro',introVertical:'SpooktoberIntro-Vertical',stinger:'SkullStinger',verticalYT:'StingerVERTYT',verticalTT:'SkullStingerVertical'
};
const themes=['classic','spooktober','vicecity'];
const obs=(m,args)=>bridgeHub.requestObs(m,args);
let tail=Promise.resolve(), retry;
async function sync(theme,only){
 clearTimeout(retry);
 const pending=[];
 for(const [id,inputName] of Object.entries(names)){
  if(only && !only.includes(inputName))continue;
  if(id.startsWith('card')||id.startsWith('banner')||id==='counter')continue; // Card resolves the theme before loading its renderer.
  try{
   if(id.startsWith('vertical')){
    const canvas=id==='verticalYT'?'Twitch/YT Vertical':'TikTok Canvas';
    const vendor=async(requestType,args={})=>{
     const r=await obs('CallVendorRequest',{vendorName:'aitum-stream-suite',requestType,requestData:{canvas,...args}});
     if(!r.responseData?.success)throw Error();return r.responseData;
    };
    const {transitions}=await vendor('get_transitions');
    const original=transitions.find(t=>t.name===inputName && t.type==='obs_stinger_transition');
    if(!original?.settings?.path)throw Error();
    const leaf=theme==='vicecity'?'Glitch-Sticker-Vicecity-Vertical.webm':'pig-print-vertical.webm';
    const filename=path.win32.join(path.win32.dirname(original.settings.path),leaf);
    let target=transitions.find(t=>t.type===original.type && t.settings?.path && path.win32.normalize(t.settings.path).toLowerCase()===filename.toLowerCase());
    if(!target){
     const name=inputName+' - '+(theme==='vicecity'?'Vice City':'Original');
     if(transitions.some(t=>t.name===name))throw Error();
     await vendor('transitions_add',{name,type:original.type,settings:{...original.settings,path:filename.replaceAll('\\','/')}});
     target={name};
    }
    await vendor('switch_transition',{transition:target.name});continue;
   }
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
 if(pending.length){retry=setTimeout(()=>{if(bridgeHub.connected && read().theme===theme)void queue(pending);},30000);retry.unref?.();}
 return pending;
}
function queue(only){const job=tail.then(()=>bridgeHub.connected&&read().theme?sync(read().theme,only):Object.values(names));tail=job.catch(()=>{});return job;}
function install(app,router){
 bridgeHub.on('connector-connected',()=>{if(read().theme)void queue();});
 app.get('/graphics/state',(_,res)=>res.set({'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}).json(read()));
 app.get('/graphics/events',(req,res,next)=>{res.set('Access-Control-Allow-Origin','*');next();},(req,res)=>streamEvents(req,res,{name:'graphics',initial:read,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}}));
 router.get('/graphics/spotify-availability',(_,res)=>res.set('Cache-Control','no-store').json({enabled:require('./runtime-settings').songRequestsEnabled()}));
 router.get('/graphics',(_,res)=>res.sendFile(path.join(__dirname,'../public/admin-graphics.html')));
 const gallery=['banner','bannerPlain','card','cardVertical','counter'];
 // Discover machine-specific paths from this owner's OBS. Persist only the base, never follower event fields.
 const readBase=id=>getConfigValue('graphics_base_'+id,id==='counter'?'http://127.0.0.1:18765/':'');
 router.get('/graphics/catalog',(_,res)=>res.set('Cache-Control','no-store').json(gallery.map(id=>({id,name:names[id],base:readBase(id)}))));
 router.get('/graphics/url/:id',async(req,res)=>{
  const id=req.params.id;if(!gallery.includes(id))return res.sendStatus(404);
  try{const {inputSettings}=await obs('GetInputSettings',{inputName:names[id]});
   const url=new URL(inputSettings.url),card=id.startsWith('card'),counter=id==='counter';
   const pathname=decodeURIComponent(url.pathname).toLowerCase();
   const expected=counter ? url.origin==='http://127.0.0.1:18765' && pathname==='/' :
    url.protocol==='file:' && !url.host && pathname.endsWith(card?'/followercard-blender/index.html':'/followbanner/follow-banner.html');
   if(!expected || url.username || url.password)return res.sendStatus(409);
   const clean=new URL(url);clean.hash='';
   const allowed=new Set(card?['frame','style','collection','character','name','accent','bg','follower','rarity','event','hold']:['style','font','no-char','game','gameName','ActivePackPath','title']);
   for(const k of [...clean.searchParams.keys()])if(!allowed.has(k))clean.searchParams.delete(k);
   const base=new URL(clean);base.search='';if(id==='bannerPlain')base.searchParams.set('no-char','');
   if(readBase(id)!==base.href)setConfigValue('graphics_base_'+id,base.href);
   res.set('Cache-Control','no-store').json({url:clean.href});
  }catch{res.sendStatus(503);}
 });
 router.get('/graphics/preview/:id',async(req,res)=>{
  if(req.identity?.role!=='owner')return res.sendStatus(403);
  if(!gallery.includes(req.params.id))return res.sendStatus(404);
  try{const {imageData}=await obs('GetSourceScreenshot',{sourceName:names[req.params.id],imageFormat:'png',imageWidth:480});res.set('Cache-Control','no-store').type('png').send(Buffer.from(imageData.split(',')[1],'base64'));}catch{res.sendStatus(503);}
 });
 router.post('/graphics',async(req,res)=>{
  if(req.identity?.role!=='owner')return res.sendStatus(403);
  const {scope,theme,transparency,spotifyStyle}=req.body||{};
  const previous=read(); let state;
  if(scope==='spotify'){
   if(!spotifyStyles.includes(spotifyStyle)||!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
   state={...previous,spotifyStyle,transparency};
  }else if(scope==='theme'){
   if(!themes.includes(theme))return res.sendStatus(400);
   state={...previous,theme};
  }else if(scope===undefined){
   // Older dashboards submit both theme and opacity; preserve a separately saved palette.
   if(!themes.includes(theme)||!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
   state={...previous,theme,transparency};
  }else return res.sendStatus(400);
  setConfigValue('graphics_settings',state);for(const f of listeners)f(state);
  const pending=scope==='spotify'?[]:await queue();res.json({state,pending});
 });
}
module.exports={install};
