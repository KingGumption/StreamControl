const crypto=require('node:crypto');
const {quizGame}=require('./quiz-game');
const {hillGame}=require('./hill-game');
const {arcadeGames,CATALOG}=require('./arcade-games');
const {rivalName}=require('./seasonal-rival');
const {AudienceGames,audienceNames}=require('./audience-games');
const access=require('./moderator-access');
const {getConfigValue,setConfigValue,addAuditLog}=require('./db');
const compactGames=new Set(['word','higher','number','split']);
const ALIASES={'word-vault':'word','heist-night':'heist',grinch:'rival','seasonal-rival':'rival','king-of-the-hill':'hill','kingofthehill':'hill','snackwars':'snacks','snack-wars':'snacks','higher-or-lower':'higher','haunted-house':'escape','split-the-crowd':'split','boss-battle':'boss','number-hunt':'number'};
class GameLauncher {
 constructor({audience=new AudienceGames(),quiz=quizGame,hill=hillGame,arcade=arcadeGames,permission=()=>access.handoff().enabled,load=()=>getConfigValue('game_presets',{}),save=v=>setConfigValue('game_presets',v),audit=addAuditLog}={}){Object.assign(this,{audience,quiz,hill,arcade,permission,load,save,audit});}
 catalog(){return [{id:'quiz',name:'Elimination Quiz'},{id:'hill',name:'King of the Hill'},...CATALOG,...Object.entries(audienceNames).map(([id,name])=>id==='rival'?{id,name,variant:rivalName(this.audience.theme())}:{id,name})];}
 canonical(id){id=String(id||'').trim().toLowerCase();return ALIASES[id]||id;}
 active(){if(this.audience.active)return this.audience.active;if(['lobby','question','reveal','completed'].includes(this.quiz.phase))return 'quiz';if(this.hill.running)return 'hill';if(['question','reveal','completed'].includes(this.arcade.phase))return this.arcade.id;return null;}
 overlayState(){const active=this.active();return active&&this.compactGame===active?{active,layout:'compact'}:{active};}
 subscribeOverlay(fn){const notify=()=>fn(this.overlayState());const off=[this.quiz,this.hill,this.arcade,this.audience].map(game=>game.subscribe(notify));return ()=>off.forEach(unsubscribe=>unsubscribe());}
 allowed(actor){return actor?.role==='owner'||actor?.role==='device'||(actor?.role==='games'&&this.permission());}
 preset(id){return this.load()[id]||{};}
 settings(id,values){
  if(!this.catalog().some(g=>g.id===id))throw Error('Unknown game.');
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Game settings must be an object.');
  const next={};
  const fields=id==='quiz'?{questionCount:[1,15],answerSeconds:[5,120],lobbySeconds:[5,300]}:id==='hill'?{}:['word','rival'].includes(id)?{rounds:[1,10],seconds:[10,60]}:(id==='boss'||id==='heist')?{seconds:[10,60]}:{rounds:[3,10],seconds:[10,60]};
  if(values.layout!==undefined){
   if(!compactGames.has(id)||!['full','compact'].includes(values.layout))throw Error('Unsupported game layout.');
   next.layout=values.layout;
  }
  for(const [key,[min,max]]of Object.entries(fields)){if(values[key]===undefined)continue;const v=Number(values[key]);if(!Number.isInteger(v)||v<min||v>max)throw Error(`${key}: use ${min}–${max}.`);next[key]=v;}
  if(id==='rival'&&values.pacing!==undefined){if(!['host','auto'].includes(values.pacing))throw Error('Unknown round pacing.');next.pacing=values.pacing;}
  if(id==='rival'&&values.deaths!==undefined){if(!['auto','manual'].includes(values.deaths))throw Error('Unknown death counter mode.');next.deaths=values.deaths;}
  if(id==='hill'&&values.category!==undefined){const category=String(values.category||'all');if(!['all',...this.hill.topics.map(t=>t.category||'general')].includes(category))throw Error('Unknown Hill category.');next.category=category;}
  if(id==='quiz'&&Array.isArray(values.categories)){if(values.categories.some(c=>!this.quiz.getCatalog().some(x=>x.id===c)))throw Error('Unknown quiz category.');next.categories=values.categories;}
  return next;
 }
 savePreset(id,values){
  id=this.canonical(id);
  const next={...this.preset(id),...this.settings(id,values)};
  this.save({...this.load(),[id]:next});return next;
 }
 action(action,id,actor,values){
  if(!this.allowed(actor))throw Error('Moderator game controls are disabled.');
  id=this.canonical(id)||(action==='stop'?this.active():null);if(!this.catalog().some(g=>g.id===id))throw Error(action==='stop'&&!id?'No game is active.':'Unknown game. Type !games for the list.');
  const active=this.active();if(action==='launch'&&active)throw Error(`${active} is already running. Stop it first.`);
  const game=id==='quiz'?this.quiz:id==='hill'?this.hill:this.arcade;
  if(action!=='launch'&&active!==id)throw Error('That game is not active.');
  if(action==='launch'){
   const defaults=this.preset(id);
   const preset=values===undefined?defaults:{...defaults,...this.settings(id,values)};
   this.compactGame=preset.layout==='compact'&&compactGames.has(id)?id:null;
   if(Object.hasOwn(audienceNames,id))this.audience.start(id,preset);
   else if(id==='quiz')this.quiz.launch(preset);
   else if(id==='hill'){this.hill.categoryFilter=preset.category||'all';this.hill.start();}
   else this.arcade.start(id,preset);
  }
  else if(Object.hasOwn(audienceNames,id)){if(action==='stop')this.audience.stop();else this.audience.act(action,values);}
  else if(action==='stop')game.stop();
  else if(action==='start'){if(id!=='quiz'||this.quiz.phase!=='lobby')throw Error('There is no quiz lobby to start.');this.quiz.next();}
  else if(action==='next'){if(id==='hill')game.finishPhase();else game.next();}
  else throw Error('Unknown action.');
  if(action==='stop')this.compactGame=null;
  this.audit({action:'game-control',source:actor.id||actor.role,details:JSON.stringify({action,game:id})});return this.state();
 }
 state(){return {active:this.active(),catalog:this.catalog(),audience:this.audience.snapshot(true).game,quiz:this.quiz.getState(),hill:this.hill.getState(),arcade:this.arcade.getState(),presets:this.load(),hillCategories:[...new Set(this.hill.topics.map(t=>t.category||'general'))]};}
 chat(event){const m=String(event.text||'').trim().match(/^!(launch|start|next|stop|games)(?:\s+([\w-]+))?\s*$/i);if(!m)return null;
  if(m[1].toLowerCase()==='games')return 'Games: '+this.catalog().map(g=>g.id).join(', ')+'. Mods: !launch gamename; !start quiz; !next gamename; !stop.';
  const roles=event.user?.roles||[];const actor={id:event.platform+':'+event.user?.id,role:roles.includes('broadcaster')?'owner':roles.includes('moderator')?'games':'viewer'};
  const id=m[2]||(m[1].toLowerCase()==='stop'?this.active():undefined);
  try{this.action(m[1].toLowerCase(),id,actor);return m[1].toLowerCase()==='launch'&&this.canonical(m[2])==='quiz'?`Quiz joining is open! Type !join. Starts in ${this.quiz.lobbySeconds} seconds.`:`${this.canonical(id)}: ${m[1].toLowerCase()} accepted.`;}catch(e){return e.message;}
 }
}
const gameLauncher=new GameLauncher({audience:new AudienceGames({
 theme:()=>getConfigValue('graphics_settings',{}).theme||'classic',
 readDeaths:async()=>(await require('./bridge-hub').bridgeHub.requestObs('ReadGameDeathCounter')).count,
 record:event=>require('./db').addEngagementEvent(event)
})});
function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
function issueDeviceToken(){const token=crypto.randomBytes(32).toString('base64url');setConfigValue('game_device_token',tokenHash(token));return token;}
function validDeviceToken(token){const expected=getConfigValue('game_device_token','');return Boolean(token&&expected&&crypto.timingSafeEqual(Buffer.from(tokenHash(token)),Buffer.from(expected)));}
function revokeDeviceToken(){setConfigValue('game_device_token','');}
module.exports={GameLauncher,gameLauncher,issueDeviceToken,validDeviceToken,revokeDeviceToken};
