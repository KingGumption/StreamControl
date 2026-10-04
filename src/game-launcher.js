const crypto=require('node:crypto');
const {quizGame}=require('./quiz-game');
const {hillGame}=require('./hill-game');
const {arcadeGames,CATALOG}=require('./arcade-games');
const access=require('./moderator-access');
const {getConfigValue,setConfigValue,addAuditLog}=require('./db');
const ALIASES={'king-of-the-hill':'hill','kingofthehill':'hill','snackwars':'snacks','snack-wars':'snacks','higher-or-lower':'higher','haunted-house':'escape','split-the-crowd':'split','boss-battle':'boss','number-hunt':'number'};
class GameLauncher {
 constructor({quiz=quizGame,hill=hillGame,arcade=arcadeGames,permission=()=>access.handoff().enabled,load=()=>getConfigValue('game_presets',{}),save=v=>setConfigValue('game_presets',v),audit=addAuditLog}={}){Object.assign(this,{quiz,hill,arcade,permission,load,save,audit});}
 catalog(){return [{id:'quiz',name:'Elimination Quiz'},{id:'hill',name:'King of the Hill'},...CATALOG];}
 canonical(id){id=String(id||'').trim().toLowerCase();return ALIASES[id]||id;}
 active(){if(['lobby','question','reveal'].includes(this.quiz.phase))return 'quiz';if(this.hill.running)return 'hill';if(['question','reveal'].includes(this.arcade.phase))return this.arcade.id;return null;}
 allowed(actor){return actor?.role==='owner'||actor?.role==='device'||(actor?.role==='games'&&this.permission());}
 preset(id){return this.load()[id]||{};}
 savePreset(id,values){id=this.canonical(id);if(!this.catalog().some(g=>g.id===id))throw Error('Unknown game.');const next={};
  const fields=id==='quiz'?{questionCount:[1,15],answerSeconds:[5,120],lobbySeconds:[5,300]}:id==='hill'?{}:{rounds:[3,10],seconds:[10,60]};
  for(const [key,[min,max]]of Object.entries(fields)){if(values[key]===undefined)continue;const v=Number(values[key]);if(!Number.isInteger(v)||v<min||v>max)throw Error(`${key}: use ${min}–${max}.`);next[key]=v;}
  if(id==='hill'){const category=String(values.category||'all');if(!['all',...this.hill.topics.map(t=>t.category||'general')].includes(category))throw Error('Unknown Hill category.');next.category=category;}
  if(id==='quiz'&&Array.isArray(values.categories)){if(values.categories.some(c=>!this.quiz.getCatalog().some(x=>x.id===c)))throw Error('Unknown quiz category.');next.categories=values.categories;}
  this.save({...this.load(),[id]:next});return next;
 }
 action(action,id,actor){
  if(!this.allowed(actor))throw Error('Moderator game controls are disabled.');
  id=this.canonical(id);if(!this.catalog().some(g=>g.id===id))throw Error('Unknown game. Type !games for the list.');
  const active=this.active();if(action==='launch'&&active)throw Error(`${active} is already running. Stop it first.`);
  const game=id==='quiz'?this.quiz:id==='hill'?this.hill:this.arcade;
  if(action!=='launch'&&active!==id)throw Error('That game is not active.');
  if(action==='launch'){const preset=this.preset(id);if(id==='quiz')this.quiz.launch(preset);else if(id==='hill'){this.hill.categoryFilter=preset.category||'all';this.hill.start();}else this.arcade.start(id,preset);}
  else if(action==='stop')game.stop();
  else if(action==='start'){if(id!=='quiz'||this.quiz.phase!=='lobby')throw Error('There is no quiz lobby to start.');this.quiz.next();}
  else if(action==='next'){if(id==='hill')game.finishPhase();else game.next();}
  else throw Error('Unknown action.');
  this.audit({action:'game-control',source:actor.id||actor.role,details:JSON.stringify({action,game:id})});return this.state();
 }
 state(){return {active:this.active(),catalog:this.catalog(),quiz:this.quiz.getState(),hill:this.hill.getState(),arcade:this.arcade.getState(),presets:this.load(),hillCategories:[...new Set(this.hill.topics.map(t=>t.category||'general'))]};}
 chat(event){const m=String(event.text||'').trim().match(/^!(launch|start|stop|games)(?:\s+([\w-]+))?\s*$/i);if(!m)return null;
  if(m[1].toLowerCase()==='games')return 'Games: '+this.catalog().map(g=>g.id).join(', ')+'. Mods: !launch gamename; !start quiz; !stop gamename.';
  const roles=event.user?.roles||[];const actor={id:event.platform+':'+event.user?.id,role:roles.includes('broadcaster')?'owner':roles.includes('moderator')?'games':'viewer'};
  try{this.action(m[1].toLowerCase(),m[2],actor);return m[1].toLowerCase()==='launch'&&this.canonical(m[2])==='quiz'?`Quiz joining is open! Type !join. Starts in ${this.quiz.lobbySeconds} seconds.`:`${this.canonical(m[2])}: ${m[1].toLowerCase()} accepted.`;}catch(e){return e.message;}
 }
}
const gameLauncher=new GameLauncher();
function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
function issueDeviceToken(){const token=crypto.randomBytes(32).toString('base64url');setConfigValue('game_device_token',tokenHash(token));return token;}
function validDeviceToken(token){const expected=getConfigValue('game_device_token','');return Boolean(token&&expected&&crypto.timingSafeEqual(Buffer.from(tokenHash(token)),Buffer.from(expected)));}
function revokeDeviceToken(){setConfigValue('game_device_token','');}
module.exports={GameLauncher,gameLauncher,issueDeviceToken,validDeviceToken,revokeDeviceToken};
