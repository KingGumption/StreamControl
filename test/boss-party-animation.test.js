const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function arena(){
 const sprite={dataset:{},style:{}},callout={textContent:''},stage={dataset:{},querySelector:s=>s==='.boss-sprite'?sprite:callout},queue=[];
 const context={window:{BossArt:{pumpkin:'pumpkin.webp'}},document:{getElementById:()=>stage},setTimeout:(fn,ms)=>{const task={fn,ms};queue.push(task);return task;},clearTimeout:task=>{task.cancelled=true;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/boss-stage.js'),'utf8'),context);
 return {stage,observe:context.window.BossStage.observe,flush:()=>{for(const task of queue.sort((a,b)=>a.ms-b.ms))if(!task.cancelled)task.fn();}};
}
const state={gameId:'test',round:1,phase:'question',boss:{id:'pumpkin'},battle:{},combat:null};
test('reconnecting to either final result restores the camera-facing hero pose',()=>{
 for(const success of [true,false]){const a=arena();a.observe({...state,phase:'completed',result:{success}});assert.equal(a.stage.dataset.partyPose,success?'victory':'defeat');assert.equal(a.stage.dataset.pose,success?'defeat':'victory');}
});
test('boss support moves use their own poses rather than a phantom attack',()=>{
 for(const [action,pose]of [['heal','boss-heal'],['defend','guard'],['charge','charge']]){
  const a=arena();a.observe(state);a.observe({...state,phase:'reveal',combat:{action:'attack',damage:28,bossAction:action,bossHeal:18}});
  assert.equal(a.stage.dataset.partyPose,'attack');a.flush();assert.equal(a.stage.dataset.pose,pose);assert.equal(a.stage.dataset.partyPose,'idle');
 }
});
