const test=require('node:test'),assert=require('node:assert/strict');
const {CommandService}=require('../src/command-service');
const {defaultCommandPermissions,canUseCommand}=require('../src/permissions');
const {loadAppConfig}=require('../src/app-config');
test('every advertised song command enforces each platform permission and overrides before handling',async()=>{
 for(const command of Object.keys(defaultCommandPermissions()))for(const platform of ['twitch','youtube','tiktok']){
  let config={commands:{[command]:{[platform]:[]}},overrides:[]};
  const service=new CommandService({config:{...loadAppConfig({}),dryRun:true},loadPermissions:()=>config,areSongRequestsEnabled:()=>false,history:{getLastAcceptedSongRequest:()=>null},cooldowns:{consume:()=>0}});
  const event={platform,text:'!'+command,user:{id:'42',username:'Viewer',roles:[]}};
  assert.equal((await service.handleChatEvent(event)).status,'denied',command+' '+platform);
  config.overrides=[{command,platform,user_id:'42',access:'allow'}];
  assert.notEqual((await service.handleChatEvent(event)).status,'denied');
  config.overrides.push({command,platform,username:'viewer',access:'deny'});
  assert.equal((await service.handleChatEvent(event)).status,'denied');
  config.overrides=[];config.commands[command][platform]=['moderator'];event.user.roles=['moderator'];
  assert.notEqual((await service.handleChatEvent(event)).status,'denied');
  event.user.roles=[];
  assert.equal((await service.handleChatEvent(event)).status,'denied');
 }
});
test('roles are not inferred when platform events omit them',()=>{
 for(const platform of ['twitch','youtube','tiktok'])for(const role of ['follower','subscriber','member','vip','fan-club']){
  assert.equal(canUseCommand({command:'song',platform,user:{username:'viewer',roles:[]},config:{commands:{song:{[platform]:[role]}}}}).allowed,false);
 }
});
