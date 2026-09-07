const test=require('node:test'),assert=require('node:assert/strict');
const {QuizGame}=require('../src/quiz-game');
const questions=Array.from({length:7},(_,i)=>({id:'q'+i,category:i<4?'a':'b',text:'Question '+i,options:['One','Two','Three','Four'],answer:0,difficulty:i+1}));
function make(extra={}){return new QuizGame({questions,schedule:()=>null,cancel:()=>{},...extra});}
function join(game){game.handleChatEvent({platform:'twitch',user:{id:'1',username:'Test'},text:'!join'});}
function answer(game){game.handleChatEvent({platform:'twitch',user:{id:'1'},text:String(game.deck[game.round-1].answer+1)});game.resolve();}
test('consecutive games show every eligible question before repeating, including a partial pool boundary',()=>{
 const game=make(),shown=[];
 for(let run=0;run<4;run++){
  game.open({questionCount:3});join(game);
  for(let i=0;i<3;i++){game.next();shown.push(game.deck[game.round-1].id);answer(game);}
  game.stop();
 }
 assert.equal(new Set(shown.slice(0,7)).size,7);
 assert.ok(shown.slice(7).every(id=>shown.slice(0,7).includes(id)));
 assert.equal(new Set(game.history).size,7);
});
test('cancelled lobbies and unshown deck questions are not consumed; stopped visible questions are remembered',()=>{
 let saved=[];const game=make({loadHistory:()=>saved,saveHistory:value=>{saved=value;}});
 game.open({questionCount:3});game.stop();assert.deepEqual(saved,[]);
 game.open({questionCount:3});join(game);game.next();const shown=game.deck[0].id;game.stop();
 assert.deepEqual(saved,[shown]);
 const restarted=make({loadHistory:()=>saved,saveHistory:value=>{saved=value;}});
 restarted.open({questionCount:3});assert.ok(restarted.deck.every(q=>q.id!==shown));
 restarted.stop();
});
test('history respects category filters and prioritises unseen questions during sudden death',()=>{
 const game=make({loadHistory:()=>['q0','q1']});
 game.open({categories:['a'],questionCount:1});join(game);game.next();
 const first=game.deck[0].id;assert.ok(['q2','q3'].includes(first));answer(game);
 game.next();const next=game.deck[1];assert.equal(next.category,'a');assert.ok(['q2','q3'].includes(next.id)&&next.id!==first);
 answer(game);game.next();assert.equal(game.deck[2].category,'a');game.stop();
});
test('fresh preview games keep independent history and never write the live history store',()=>{
 let saved=['q0'];const live=make({loadHistory:()=>saved,saveHistory:value=>{saved=value;}});
 const preview=make();preview.open({questionCount:1});join(preview);preview.next();preview.stop();
 assert.deepEqual(saved,['q0']);live.open({questionCount:1});assert.notEqual(live.deck[0].id,'q0');live.stop();
});
test('question history survives process restarts without adding analytics events',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-history-'));
 const opts={cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir},encoding:'utf8'};
 try{
  execFileSync(process.execPath,['-e',"require('./src/quiz-question-history').saveQuestionHistory(['first','second'])"],opts);
  const data=JSON.parse(execFileSync(process.execPath,['-e',"console.log(JSON.stringify({history:require('./src/quiz-question-history').loadQuestionHistory(),events:require('./src/db').listEngagementEvents().length}))"],opts));
  assert.deepEqual(data,{history:['first','second'],events:0});
 }finally{
  const resolved=fs.realpathSync(dir),root=fs.realpathSync(os.tmpdir());
  assert.ok(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('quiz-history-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
});
