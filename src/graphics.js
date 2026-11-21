const path = require('node:path');
const fs = require('node:fs');
const {getConfigValue,setConfigValue}=require('./db');
const {bridgeHub}=require('./bridge-hub');
const {streamEvents}=require('./sse');
const listeners=new Set();
const christmasLikes=fs.readFileSync(path.join(__dirname,'../public/christmas-likes.css'),'utf8').trim();
const defaults={theme:null,transparency:0};
const looks={
 classic:{intro:'kinggumption-channel66-',divider:['#03f5d8','#c447ff']},
 spooktober:{intro:'kinggumption-channel66-',divider:['#747d3c','#b8cb59']},
 vicecity:{intro:'KingGumption-Vice-Sunset-Dynamic-',sticker:'Vicecity',label:'Vice City',divider:['#a373d3','#eb9998']},
 christmas:{intro:'KingGumption-Christmas-',sticker:'Christmas',label:'Christmas',divider:['#A92E43','#E7BC70']}
};
const themes=Object.keys(looks);
const spotifyStyles=['stream','halloween','ghost','slime',...themes];
function stickerFile(look,orientation){
 return look.sticker?'Glitch-Sticker-'+look.sticker+'-'+orientation+'.webm':'pig-print-'+orientation.toLowerCase()+'.webm';
}
function read(){
 const state=getConfigValue('graphics_settings',defaults);
 // The earlier feathered panel stored a solid backing. Start the restored layout with its original fade.
 const backgroundOpacity=state.spotifyLayout==='original' ? state.backgroundOpacity??0 : 0;
 // Match the visual precedence of existing installs until the owner makes a choice.
 const legacy=state.theme ? null : getConfigValue('song_overlay_style',null);
 return {...state,backgroundOpacity,defaultTransparency:state.defaultTransparency??state.transparency??0,spotifyStyle:state.spotifyStyle || (spotifyStyles.includes(legacy)?legacy:null)};
}
const names={
 banner:'follow=new',bannerPlain:'follow=new-no-char',card:'PlayingCardTwitch-3D',cardVertical:'PlayingCard-3d-Tiktok',
 counter:'DeathCounter',credits:'StreamCredits',creditsVertical:'StreamCredits-Vertical',divider:'GlassOverlays',
 likes:'ThinLikeCount',likers:'Like-Leaderboard',
 intro:'Spooktober-Intro',introVertical:'SpooktoberIntro-Vertical',stinger:'SkullStinger',verticalYT:'StingerVERTYT',verticalTT:'SkullStingerVertical'
};
const obs=(m,args)=>bridgeHub.requestObs(m,args);
const likesAppearance=new Map();
const hostedSources=new Set(['card','cardVertical','banner','bannerPlain','counter']);
const managedSources=Object.entries(names).filter(([id])=>!hostedSources.has(id)).map(([,name])=>name);
let latestJob=null, running=false, revision=0, retry;
let obsSync='offline';
async function sync(theme,only,version){
 const obs=(method,args)=>{
  if(version!==revision || !bridgeHub.connected)throw Error('Sync superseded');
  return bridgeHub.requestObs(method,args);
 };
 const look=looks[theme];
 const pending=[];
 for(const [id,inputName] of Object.entries(names)){
  if(version!==revision || !bridgeHub.connected)break;
  if(!only.includes(inputName))continue;
  try{
   if(id==='likes'||id==='likers'){
    // Their OBS custom CSS imports /graphics/likes.css. Never request private widget URLs.
    const seasonal=theme==='christmas';
    if(likesAppearance.get(inputName)!==seasonal){
     await obs('PressInputPropertiesButton',{inputName,propertyName:'refreshnocache'});
     likesAppearance.set(inputName,seasonal);
    }
    continue;
   }
   if(id.startsWith('vertical')){
    const canvas=id==='verticalYT'?'Twitch/YT Vertical':'TikTok Canvas';
    const vendor=async(requestType,args={})=>{
     const r=await obs('CallVendorRequest',{vendorName:'aitum-stream-suite',requestType,requestData:{canvas,...args}});
     if(!r.responseData?.success)throw Error();return r.responseData;
    };
    const {transitions}=await vendor('get_transitions');
    const original=transitions.find(t=>t.name===inputName && t.type==='obs_stinger_transition');
    if(!original?.settings?.path)throw Error();
    const leaf=stickerFile(look,'Vertical');
    const filename=path.win32.join(path.win32.dirname(original.settings.path),leaf);
    let target=transitions.find(t=>t.type===original.type && t.settings?.path && path.win32.normalize(t.settings.path).toLowerCase()===filename.toLowerCase());
    if(!target){
     const name=inputName+' - '+(look.label||'Original');
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
    const leaf=stickerFile(look,'Horizontal');
    const file=path.win32.join(path.win32.dirname(current),leaf).replaceAll('\\','/');
    if(current.replaceAll('\\','/')!==file)await obs('SetCurrentSceneTransitionSettings',{transitionSettings:{path:file},overlay:true});
    continue;
   }
   const {inputSettings:s}=await obs('GetInputSettings',{inputName});
   let patch;
   if(id.startsWith('intro')){
    const isVertical=id==='introVertical',size=isVertical?'9x16':'16x9';
    const leaf=look.intro+size+'.mp4';
    if(path.win32.basename(s.local_file).toLowerCase()===leaf.toLowerCase())continue;
    const media=await obs('GetMediaInputStatus',{inputName});
    if(['OBS_MEDIA_STATE_PLAYING','OBS_MEDIA_STATE_PAUSED','OBS_MEDIA_STATE_OPENING'].includes(media.mediaState)){pending.push(inputName);continue;}
    patch={local_file:path.win32.join(path.win32.dirname(s.local_file),leaf).replaceAll('\\','/')};
   }else if(id==='divider'){
    const palette=look.divider;
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
 return pending;
}
async function drain(){
 running=true;
 try{
  while(latestJob){
   const {theme,only,version}=latestJob;
   latestJob=null;
   const pending=await sync(theme,only,version);
   if(version!==revision)continue;
   obsSync=pending.length?'waiting':'complete';
   if(pending.length){
    retry=setTimeout(()=>queue(theme,pending),30000);
    retry.unref?.();
   }
  }
 }finally{running=false;}
}
function queue(theme,only=managedSources){
 clearTimeout(retry);
 revision++;
 obsSync=bridgeHub.connected?'syncing':'offline';
 latestJob=bridgeHub.connected?{theme,only,version:revision}:null;
 if(latestJob&&!running)void drain();
}
function install(app,router){
 bridgeHub.on('connector-connected',()=>{const {theme}=read();if(theme)queue(theme);});
 bridgeHub.on('connector-disconnected',()=>{clearTimeout(retry);revision++;latestJob=null;obsSync='offline';});
 app.get('/graphics/state',(_,res)=>res.set({'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}).json({...read(),obsSync}));
 app.get('/graphics/likes.css',(_,res)=>res.set({'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}).type('css').send(read().theme==='christmas'?christmasLikes:'/* Use the configured widget appearance. */'));
 app.get('/graphics/events',(req,res,next)=>{res.set('Access-Control-Allow-Origin','*');next();},(req,res)=>streamEvents(req,res,{name:'graphics',initial:read,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}}));
 router.get('/graphics/spotify-availability',(_,res)=>res.set('Cache-Control','no-store').json({enabled:require('./runtime-settings').songRequestsEnabled()}));
 router.get('/graphics',(_,res)=>require('./workspace-page')(res,'admin-graphics.html'));
 const gallery=['banner','bannerPlain','card','cardVertical','counter'];
 const origin=new URL(require('./app-config').appConfig.publicBaseUrl).origin;
 const entry={banner:'follow',bannerPlain:'follow-no-character',card:'card-twitch',cardVertical:'card-tiktok',counter:'deaths'};
 const local={banner:'18743/widgets/banner',bannerPlain:'18743/widgets/banner?no-char',card:'18743/widgets/card/twitch',cardVertical:'18743/widgets/card/tiktok',counter:'18765/'};
 const address=id=>origin+'/graphics/live/'+entry[id];
 for(const id of gallery)app.get('/graphics/live/'+entry[id],(_,res)=>res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).redirect('http://127.0.0.1:'+local[id]));
 router.get('/graphics/catalog',(_,res)=>res.set('Cache-Control','no-store').json(gallery.map(id=>({id,name:names[id],base:address(id)}))));
 router.get('/graphics/url/:id',async(req,res)=>{
  const id=req.params.id;if(!gallery.includes(id))return res.sendStatus(404);
  try{const {inputSettings}=await obs('GetInputSettings',{inputName:names[id]});
   if(inputSettings.url!==address(id))return res.sendStatus(409);
   res.set('Cache-Control','no-store').json({url:address(id)});
  }catch{res.sendStatus(503);}
 });
 router.get('/graphics/preview/:id',async(req,res)=>{
  if(!gallery.includes(req.params.id))return res.sendStatus(404);
  try{const {imageData}=await obs('GetSourceScreenshot',{sourceName:names[req.params.id],imageFormat:'png',imageWidth:480});res.set('Cache-Control','no-store').type('png').send(Buffer.from(imageData.split(',')[1],'base64'));}catch{res.sendStatus(503);}
 });
 router.post('/graphics',async(req,res)=>{
  if(req.identity?.role!=='owner')return res.sendStatus(403);
  const {scope,theme,transparency,spotifyStyle,backgroundOpacity}=req.body||{};
  const previous=read(); let state;
  if(scope==='spotify-default'){
   if(!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
   state={...previous,defaultTransparency:transparency};
  }else if(scope==='spotify'){
   if(!spotifyStyles.includes(spotifyStyle)||!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
   if(backgroundOpacity!==undefined && (!Number.isInteger(backgroundOpacity)||backgroundOpacity<0||backgroundOpacity>100))return res.sendStatus(400);
   state={...previous,spotifyStyle,transparency,backgroundOpacity:backgroundOpacity??previous.backgroundOpacity,spotifyLayout:'original'};
  }else if(scope==='theme'){
   if(!themes.includes(theme))return res.sendStatus(400);
   state={...previous,theme};
  }else if(scope===undefined){
   // Older dashboards submit both theme and opacity; preserve a separately saved palette.
   if(!themes.includes(theme)||!Number.isInteger(transparency)||transparency<0||transparency>100)return res.sendStatus(400);
   state={...previous,theme,transparency};
  }else return res.sendStatus(400);
  setConfigValue('graphics_settings',state);
  if(previous.theme!==state.theme){const {audience}=require('./game-launcher').gameLauncher;if(audience.active==='rival'){audience.currentTheme=state.theme;audience.changed();}}
  for(const f of listeners)f(state);
  const applyTheme=scope==='theme'||scope===undefined;
  if(applyTheme)queue(state.theme);
  res.json({state,pending:applyTheme?managedSources:[],obsSync});
 });
}
module.exports={install};
