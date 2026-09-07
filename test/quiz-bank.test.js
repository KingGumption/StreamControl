const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require('sharp');
const questions=require('../src/quiz-questions.json');
test('all themed questions have unique identities, valid options and decodable local picture assets',async()=>{
 assert.ok(questions.length>=500,'Keep at least 500 questions available');
 assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
 const normalise=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
 assert.equal(new Set(questions.map(q=>JSON.stringify([normalise(q.text),q.image?.file||'']))).size,questions.length,'No repeated prompts for the same image');
 for(const q of questions){
  assert.ok(typeof q.text==='string'&&q.text.trim().length>10);
  assert.equal(new Set(q.options.map(normalise)).size,4,'Options must be distinct ignoring punctuation and casing');
  assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4);
  assert.ok(q.difficulty>=1&&q.difficulty<=15);assert.ok(q.category);
  if(!q.image)continue;
  assert.match(q.image.file,/^[a-f0-9]{16}\.(png|jpg|webp)$/);
  const metadata=await sharp(path.join(__dirname,'../public/quiz-media',q.image.file)).metadata();assert.ok(metadata.width&&metadata.height);
  const [x,y,w,h]=q.image.crop||[0,0,1,1];assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1);
  assert.ok(Math.abs(q.image.aspect-metadata.width*w/(metadata.height*h))<.001);
 }
});

test('expanded categories are selectable with readable labels and questions across difficulty bands',()=>{
 const {QuizGame}=require('../src/quiz-game');
 const game=new QuizGame();
 for(const id of ['items','villains','movies','film-roles','tv','game-lore']){
  const category=game.getCatalog().find(c=>c.id===id);
  assert.ok(category&&category.label!==id);
  const pool=questions.filter(q=>q.category===id);
  assert.ok(pool.some(q=>q.difficulty<=5)&&pool.some(q=>q.difficulty>=11));
  game.open({categories:[id],questionCount:15});
  assert.ok(game.deck.every((q,i)=>q.category===id&&(!i||q.difficulty>=game.deck[i-1].difficulty)));
  assert.equal(new Set(game.deck.map(q=>q.id)).size,15);
  game.stop();
 }
});

test('a full bank run exhausts 500 distinct questions before sudden death reuses any',()=>{
 const {QuizGame}=require('../src/quiz-game');
 const game=new QuizGame();game.open({questionCount:15});
 const seen=new Set(game.deck.map(q=>q.id));
 while(seen.size<questions.length){
  const q=game.suddenDeathQuestion();
  assert.ok(!seen.has(q.id),'Unused bank questions should precede repeats');seen.add(q.id);
 }
 assert.ok(seen.has(game.suddenDeathQuestion().id));
 game.stop();
});
