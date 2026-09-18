const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {observe}=require('./performance');
let worker,sequence=0;
const pending=new Map(),shared=new Map();
function start() {
  if(worker)return worker;
  const current=new Worker(path.join(__dirname,'analytics-worker.js'),{env:{...process.env,STREAMCONTROL_DB_READONLY:'true'}});
  worker=current;
  function fail(error){if(worker!==current)return;worker=null;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();shared.clear();}
  current.on('error',fail);
  current.on('exit',()=>fail(new Error('Analytics worker stopped. Retry the report.')));
  current.on('message',({id,data,error})=>{
    const entry=pending.get(id);if(!entry)return;pending.delete(id);clearTimeout(entry.timer);
    observe('analytics.request',Date.now()-entry.started);
    if(!pending.size)current.unref();
    if(error)entry.reject(new Error(error));else entry.resolve(data);
  });
  current.unref();return current;
}
function request(options={},activityOnly=false){
  // Only recognised scalar filters cross the worker boundary.
  const filters=Object.fromEntries(['range','platform','activityPage','activityTool','activitySearch','snapshotAt'].filter(key=>options[key]!==undefined).map(key=>[key,String(options[key]).slice(0,200)]));
  const key=JSON.stringify([filters,activityOnly]);
  if(shared.has(key))return shared.get(key);
  if(pending.size>=8)return Promise.reject(new Error('Analytics is busy. Please retry shortly.'));
  const promise=new Promise((resolve,reject)=>{
    const current=start(),id=++sequence;
    const timer=setTimeout(()=>{current.terminate();},30000);timer.unref();
    pending.set(id,{resolve,reject,timer,started:Date.now()});current.ref();current.postMessage({id,options:filters,activityOnly});
  }).finally(()=>shared.delete(key));
  shared.set(key,promise);return promise;
}
async function close(){const current=worker;if(current)await current.terminate();}
module.exports={request,close};
