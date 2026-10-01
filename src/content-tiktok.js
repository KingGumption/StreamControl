const crypto=require('node:crypto');
const {getConfigValue,setConfigValue}=require('./db');
const contentCoach=require('./content-coach');
const store=require('./content-coach-store');
const automationStore=require('./content-automation-store');
const KEY='content_tiktok_auth_v1';
const AUTH='https://www.tiktok.com/v2/auth/authorize/';
const TOKEN='https://open.tiktokapis.com/v2/oauth/token/';
const API='https://open.tiktokapis.com/v2/';
const AUTH_STATE_MAX_AGE_MS=30*60*1000;
function createTikTokConnection({environment=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 const clientKey=String(environment.TIKTOK_CLIENT_KEY||'').trim(),clientSecret=String(environment.TIKTOK_CLIENT_SECRET||'').trim();
 const baseUrl=String(environment.PUBLIC_BASE_URL||environment.RENDER_EXTERNAL_URL||'http://127.0.0.1:8787').replace(/\/+$/,'');
 const secret=String(environment.SESSION_SECRET||'');
 const ready=Boolean(clientKey&&clientSecret&&secret.length>=32&&/^https:\/\//.test(baseUrl));
 const redirectUri=`${baseUrl}/admin/content-coach/tiktok/callback`;
 function key(){if(!ready)throw Error('TikTok developer app is not configured.');return crypto.createHash('sha256').update(`content-coach-tiktok-v1:${secret}`).digest();}
 function seal(data){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');}
 function unseal(value){if(!value)return null;const [iv,tag,body]=String(value).split('.').map(s=>Buffer.from(s||'','base64url'));const cipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(body),cipher.final()]).toString());}
 const read=()=>unseal(getConfigValue(KEY));
 const save=value=>setConfigValue(KEY,seal(value));
 function status(){let account=null;try{account=read();}catch{ /* Key rotation requires reconnection. */ }
  return {configured:ready,connected:Boolean(account?.accessToken),account:account?{displayName:account.displayName,openId:account.openId,scope:account.scope,expiresAt:new Date(account.expiresAt).toISOString(),lastSyncAt:account.lastSyncAt||null}:null,callbackUrl:redirectUri};}
 function sessionHash(sessionCookie){return crypto.createHash('sha256').update(sessionCookie).digest('base64url');}
 function begin(sessionCookie){if(!ready)throw Error('Configure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Render first.');if(!sessionCookie)throw Error('Sign in before connecting TikTok.');const payload=Buffer.from(JSON.stringify({nonce:crypto.randomBytes(24).toString('base64url'),expiresAt:now()+AUTH_STATE_MAX_AGE_MS,sessionHash:sessionHash(sessionCookie)})).toString('base64url');const signature=crypto.createHmac('sha256',key()).update(payload).digest('base64url');const state=`${payload}.${signature}`;const url=new URL(AUTH);url.search=new URLSearchParams({client_key:clientKey,response_type:'code',scope:'user.info.basic,video.list',redirect_uri:redirectUri,state}).toString();return url.toString();}
 function verify(state,sessionCookie){const fail=()=>{throw Error('TikTok authorization expired or belongs to another session. Try Connect again.');};const [payload,signature,extra]=String(state||'').split('.');if(!payload||!signature||extra||!sessionCookie)return fail();const expected=crypto.createHmac('sha256',key()).update(payload).digest();let provided;try{provided=Buffer.from(signature,'base64url');}catch{return fail();}if(provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return fail();let entry;try{entry=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return fail();}if(!Number.isFinite(entry.expiresAt)||entry.expiresAt<=now()||entry.expiresAt>now()+AUTH_STATE_MAX_AGE_MS||typeof entry.nonce!=='string'||entry.nonce.length<16||entry.sessionHash!==sessionHash(sessionCookie))return fail();}
 async function json(url,options={}){const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok||data.error&&typeof data.error==='string'||data.error?.code&&data.error.code!=='ok')throw Error(`TikTok request failed (${response.status}): ${String(data.error?.message||data.error_description||data.error||'unknown').slice(0,180)}`);return data;}
 async function token(fields){return json(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:clientKey,client_secret:clientSecret,...fields})});}
 async function callback({state,code,sessionCookie}){verify(state,sessionCookie);if(!code||String(code).length>1000)throw Error('TikTok did not return an authorization code.');const data=await token({grant_type:'authorization_code',code,redirect_uri:redirectUri});if(!data.access_token||!data.refresh_token||!Number.isFinite(Number(data.expires_in))||!Number.isFinite(Number(data.refresh_expires_in))||!String(data.scope||'').split(',').includes('video.list'))throw Error('TikTok did not grant video.list access.');const info=await json(`${API}user/info/?fields=open_id,display_name`,{headers:{Authorization:`Bearer ${data.access_token}`}});const user=info.data?.user;if(!user?.open_id||user.open_id!==data.open_id)throw Error('Could not verify the authorised TikTok account.');const account={accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:now()+data.expires_in*1000,refreshExpiresAt:now()+data.refresh_expires_in*1000,openId:user.open_id,displayName:user.display_name||'TikTok creator',scope:data.scope,lastSyncAt:null};save(account);return status();}
 async function access(){const account=read();if(!account)throw Error('Connect TikTok first.');if(account.expiresAt>now()+5*60*1000)return account;if(account.refreshExpiresAt<=now())throw Error('TikTok authorisation expired. Reconnect TikTok.');const data=await token({grant_type:'refresh_token',refresh_token:account.refreshToken});if(!data.access_token)throw Error('TikTok token refresh failed. Reconnect TikTok.');const refreshed={...account,accessToken:data.access_token,refreshToken:data.refresh_token||account.refreshToken,expiresAt:now()+data.expires_in*1000,refreshExpiresAt:data.refresh_expires_in?now()+data.refresh_expires_in*1000:account.refreshExpiresAt,scope:data.scope||account.scope};save(refreshed);return refreshed;}
 async function sync(){
  const account=await access();
  const fields='id,create_time,title,video_description,duration,share_url,cover_image_url,view_count,like_count,comment_count,share_count';
  const observedAt=new Date(now()).toISOString(),videos=[];
  let cursor=undefined;
  for(let page=0;page<100;page++){
   const data=await json(`${API}video/list/?fields=${fields}`,{method:'POST',headers:{Authorization:`Bearer ${account.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({max_count:20,...(cursor?{cursor}:{})})});
   if(!Array.isArray(data.data?.videos))throw Error('TikTok did not return a video list.');
   videos.push(...data.data.videos);
   if(data.data.videos.some(v=>Number(v.create_time)*1000<now()-366*86400000)||!data.data.has_more||!data.data.cursor||data.data.cursor===cursor)break;
   cursor=data.data.cursor;
  }
  const posts=[],skipped=[];
  for(const v of videos){
   try{
    const publishedAt=new Date(Number(v.create_time)*1000).toISOString();
    if(Date.parse(publishedAt)<now()-366*86400000)continue;
    const url=contentCoach.link(v.share_url,'tiktok'),duration=Number(v.duration);
    if(!(duration>0))throw Error('duration unavailable');
    const description=String(v.video_description||v.title||'');
    posts.push({id:v.id,url,publishedAt,title:String(v.title||description||'TikTok video').slice(0,300),description,
     hashtags:description.match(/#[\p{L}\p{N}_]+/gu)||[],category:null,coverUrl:v.cover_image_url||null,
     format:duration<=180?'short':'long',durationSeconds:duration,
     metrics:{views:v.view_count??null,likes:v.like_count??null,comments:v.comment_count??null,shares:v.share_count??null}});
   }catch(error){skipped.push({id:String(v.id||'unknown').slice(0,50),reason:error.message});}
  }
  const result=require('./content-social-common').saveObservations('tiktok',posts,observedAt,'TikTok Display API · public post counts',now());
  automationStore.upsertPosts('tiktok',posts,observedAt);
  save({...account,lastSyncAt:observedAt});
  return {...result,skipped:[...skipped,...result.skipped]};
 }
 async function disconnect(){const account=read();if(!account)return;await json(`${API}oauth/revoke/`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:clientKey,client_secret:clientSecret,token:account.accessToken})});setConfigValue(KEY,null);}
 return {status,begin,callback,sync,disconnect,redirectUri};
}
module.exports={createTikTokConnection};
