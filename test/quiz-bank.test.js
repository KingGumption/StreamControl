const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require('sharp');
const questions=require('../src/quiz-questions.json');
test('all themed questions have unique identities, valid options and decodable local picture assets',async()=>{
 assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
 for(const q of questions){
  assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4);
  assert.ok(q.difficulty>=1&&q.difficulty<=15);assert.ok(q.category);
  if(!q.image)continue;
  assert.match(q.image.file,/^[a-f0-9]{16}\.(png|jpg|webp)$/);
  const metadata=await sharp(path.join(__dirname,'../public/quiz-media',q.image.file)).metadata();assert.ok(metadata.width&&metadata.height);
  const [x,y,w,h]=q.image.crop||[0,0,1,1];assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1);
  assert.ok(Math.abs(q.image.aspect-metadata.width*w/(metadata.height*h))<.001);
 }
});
