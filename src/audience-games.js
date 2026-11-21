const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const {HeistNight}=require('./heist-night');
const {SeasonalRival}=require('./seasonal-rival');

const {WordVault}=require('./word-vault');
const audienceNames={heist:'Heist Night',rival:'Seasonal Rival',word:'Word Vault'};

class AudienceGames {
 constructor({theme=()=>null,readDeaths,record=()=>{}}={}){
  this.events=new EventEmitter();
  this.events.setMaxListeners(0);
  this.theme=theme;
  this.readDeaths=readDeaths;
  this.record=record;
  const publish=()=>this.changed();
  this.games={heist:new HeistNight({publish}),rival:new SeasonalRival({publish,theme:()=>this.currentTheme}),word:new WordVault({publish})};
  this.active=null;
 }
 subscribe(fn){this.events.on('update',fn);return ()=>this.events.off('update',fn);}
 snapshot(host=false){
  const game=this.games[this.active];
  if(!game)return {active:null,game:null};
  const state=host&&game.getHostState?game.getHostState():game.getState();
  if(!host)return {active:this.active,game:state};
  const actions=state.actions.filter(a=>a.id!=='death'||!this.counterStatus);
  if(this.counterStatus==='Death counter unavailable'&&state.actions.some(a=>a.id==='death'))actions.push({id:'manual-deaths',label:'Switch to manual death entry'});
  return {active:this.active,game:{...state,actions,turn:this.turn,counterStatus:this.counterStatus}};
 }
 changed(){
  if(!this.active)return;
  const {game}=this.snapshot();
  const turnKey=this.active==='word'?`${game.round}:${game.phase}:${game.ballotId}`:game.phase;
  if(turnKey!==this.turnKey){
   this.turnKey=turnKey;
   this.phase=game.phase;this.turn=randomUUID();
   if(game.phase==='completed')this.track('game_completed');
  }
  this.events.emit('update');
 }
 start(id,settings={}){
  this.currentTheme=this.theme();
  this.active=id;this.phase=null;this.turnKey=null;this.run=randomUUID();
  this.counterStatus=null;this.previousDeaths=null;
  try{this.games[id].start(settings);}
  catch(error){this.stop(false);throw error;}
  this.track('game_started');
  if(id==='rival'&&settings.deaths!=='manual'&&this.readDeaths){
   this.counterStatus='Connecting to death counter';
   void this.pollDeaths(this.run);
  }
 }
 async pollDeaths(run){
  try{
   const count=await this.readDeaths();
   if(this.run!==run||!this.counterStatus)return;
   if(!Number.isSafeInteger(count)||count<0)throw Error();
   const previous=this.previousDeaths;
   this.previousDeaths=count;
   const rival=this.games.rival;
   if(previous!==null&&count>previous&&rival.getState().actions.some(a=>a.id==='death')){
    rival.act('death',{count:count-previous});
   }
   this.counterStatus='Using the PC death counter';
  }catch{
   if(this.run!==run||!this.counterStatus)return;
   this.counterStatus='Death counter unavailable';
  }
  if(this.run===run&&this.counterStatus&&this.phase!=='completed'){
   this.timer=setTimeout(()=>this.pollDeaths(run),2000);this.timer.unref?.();
  }
 }
 act(action,values={}){
  if(values?.turn && values.turn!==this.turn)throw Error('This stage has finished. Use the current controls.');
  if(action==='death'&&this.counterStatus)throw Error('Deaths are counted by the streaming PC.');
  if(action==='manual-deaths'&&this.counterStatus==='Death counter unavailable'){
   clearTimeout(this.timer);this.counterStatus=null;this.changed();return;
  }
  if(action==='death'){this.games[this.active].act(action);return;}
  this.games[this.active].act(action,values);
 }
 chat(event){
  const game=this.games[this.active];
  if(!game)return false;
  const before=game.getState().votes?.reduce((a,b)=>a+b,0)||0;
  const handled=game.chat(event);
  if(handled&&(game.getState().votes?.reduce((a,b)=>a+b,0)||0)>before)this.track('vote',event);
  return handled;
 }
 track(eventType,event={}){
  try{this.record({tool:'chat_games',eventType,correlationId:this.run,platform:event.platform,userId:event.user?.id,username:event.user?.username,metadata:{game:this.active,schemaVersion:2}});}catch(error){console.warn('Audience game analytics unavailable:',error.message);}
 }
 stop(record=true){
  if(!this.active)return;
  const game=this.games[this.active];
  if(record&&this.phase!=='completed')this.track('game_stopped');
  clearTimeout(this.timer);
  this.run=null;this.active=null;this.counterStatus=null;
  game.stop();this.events.emit('update');
 }
}
module.exports={AudienceGames,audienceNames};
