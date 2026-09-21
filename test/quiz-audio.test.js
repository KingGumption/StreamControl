const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('arcade cues deduplicate updates, respect mute, and do not replay completed results on load',()=>{
  let sounds=0;const timers=[];
  class Audio {
    constructor(){this.currentTime=0;this.destination={};}
    createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator(){sounds++;return {frequency:{},connect(){},disconnect(){},start(){},stop(){}};}
    resume(){return Promise.resolve();}
  }
  const window={AudioContext:Audio};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/quiz-audio.js'),'utf8'),{window,setTimeout:fn=>timers.push(fn),Date});
  const audio=window.QuizAudio,base={gameId:'1',round:0,phase:'lobby',audio:{muted:false,volume:.3}};
  audio.observe(base);assert.equal(sounds,0);
  const q={...base,round:1,phase:'question'};audio.observe(q);assert.equal(sounds,2);audio.observe(q);assert.equal(sounds,2);
  audio.observe({...q,audio:{muted:true,volume:.3}});audio.tick({...q,deadline:Date.now()+2000});assert.equal(sounds,2);
  audio.observe({...q,phase:'completed',winners:[],roundResult:{podium:[]},audio:{muted:true,volume:.3}});assert.equal(sounds,2);
  audio.observe({...base,gameId:'2',round:9,phase:'completed',winners:[]});audio.outcome({...base,gameId:'2',round:9,phase:'completed',winners:[]});assert.equal(sounds,2);
});
test('only the actual overlay includes the audio engine',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
  assert.ok(read('quiz.html').includes('/assets/quiz-audio.js'));
  assert.ok(!read('admin-quiz.html').includes('/assets/quiz-audio.js'));
  assert.ok(!read('quiz-preview.html').includes('/assets/quiz-audio.js'));
});
