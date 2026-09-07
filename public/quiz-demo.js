let testSession = null, testEpoch = 0, testRevision = 0, testBusy = false;
async function testRequest(path, body) {
  const response = await fetch('/admin/quiz/test' + path, body === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Unable to run test quiz.');
  return data;
}
function displayTest(data) {
  testSession = data;
  render(data.game);
  const g = data.game;
  $('stopTest').disabled = false;
  $('startTest').hidden = data.autoplay || g.phase !== 'lobby';
  $('finishTestQuestion').disabled = g.phase !== 'question';
  $('testAnswers').hidden = data.autoplay || g.phase !== 'question' || !data.self.alive;
  document.querySelectorAll('[data-test-answer]').forEach(button => { button.disabled = testBusy || data.self.answer !== null || !data.self.alive || g.phase !== 'question'; });
  const mode = data.autoplay ? 'Automatic demo' : 'Playing as ' + data.self.username;
  const detail = g.phase === 'lobby' ? (data.autoplay ? 'Viewers are joining. The quiz will start automatically.' : 'Ready! Start the test quiz when you are ready.') : g.phase === 'completed' ? (g.outcome === 'victory' ? 'Winner run complete.' : 'Everyone was eliminated.') : !data.autoplay && !data.self.alive ? 'You are out. Watch the remaining viewers play.' : !data.autoplay && data.self.answer !== null && g.phase === 'question' ? `Answer ${data.self.answer + 1} submitted. Waiting for the reveal.` : 'Questions and results advance automatically.';
  $('testStatus').textContent = `${mode}: ${detail}`;
  $('previewDescription').textContent = `${mode} - test only, no analytics or real wins`;
  $('testRoster').replaceChildren();
  data.testPlayers.forEach(p => $('testRoster').append(node('span', 'test-player' + (p.alive ? '' : ' out'), `${p.username}: ${p.correctAnswers} correct${p.alive ? '' : ' - eliminated'}`)));
}
globalThis.stopQuizTest = function() {
  const previous = testSession;
  testEpoch++; testRevision++; testSession = null; testBusy = false;
  $('stopTest').disabled = true; $('startTest').hidden = true; $('finishTestQuestion').disabled = true; $('testAnswers').hidden = true;
  $('testRoster').replaceChildren();
  if (previous) {
    $('testStatus').textContent = 'Test stopped. Your live quiz was not affected.';
    testRequest('/' + previous.testId + '/stop', {}).catch(() => {});
  }
};
async function beginTest(autoplay) {
  globalThis.stopQuizTest();
  const epoch = testEpoch;
  testBusy = true;
  $('testError').textContent = '';
  $('runAutoDemo').disabled = true; $('playTest').disabled = true;
  try {
    const categories = Array.from(document.querySelectorAll('#testCategories input:checked'),input=>input.value);
    const scenario = autoplay ? $('testScenario').value : 'mixed';
    const opponents = Number($('testOpponents').value);
    if (scenario === 'defeat' && opponents === 0) throw Error('Choose at least one simulated viewer for the everyone-eliminated scenario.');
    const data = await testRequest('', { questionCount:Number($('testQuestionCount').value), answerSeconds:Number($('testAnswerSeconds').value), opponents, username:$('testName').value, categories, autoplay, scenario });
    if (epoch !== testEpoch) { testRequest('/' + data.testId + '/stop',{}).catch(()=>{}); return; }
    document.querySelectorAll('[data-preview]').forEach(button=>button.setAttribute('aria-pressed','false'));
    displayTest(data);
  } catch(error) { if(epoch === testEpoch) $('testError').textContent = error.message; }
  finally { testBusy = false; $('runAutoDemo').disabled = false; $('playTest').disabled = false; }
}
async function testAction(action, body = {}) {
  if (!testSession || testBusy) return;
  const id = testSession.testId, epoch = testEpoch;
  testRevision++;
  testBusy = true; $('testError').textContent = '';
  try {
    const data = await testRequest('/' + id + '/' + action, body);
    if(epoch === testEpoch) { testBusy = false; displayTest(data); }
  } catch(error) { if(epoch === testEpoch) $('testError').textContent = error.message; }
  finally { testBusy = false; }
}
$('runAutoDemo').onclick = () => beginTest(true);
$('playTest').onclick = () => beginTest(false);
$('startTest').onclick = () => testAction('start');
$('finishTestQuestion').onclick = () => testAction('finish-question');
$('stopTest').onclick = () => { globalThis.stopQuizTest(); selectPreview('idle'); };
document.querySelectorAll('[data-test-answer]').forEach(button => button.onclick = () => testAction('answer',{answer:Number(button.dataset.testAnswer)}));
document.addEventListener('keydown',event=>{
  if(!testSession || testSession.autoplay || event.repeat || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(/^[1-4]$/.test(event.key)){event.preventDefault();testAction('answer',{answer:Number(event.key)});}
});
let testPolling = false;
setInterval(async()=>{
  if(!testSession || testPolling || testBusy)return;
  const id=testSession.testId,epoch=testEpoch,revision=testRevision;testPolling=true;
  try {const data=await testRequest('/'+id);if(epoch===testEpoch&&revision===testRevision&&!testBusy)displayTest(data);}
  catch(error){if(epoch===testEpoch)$('testError').textContent=error.message;}
  finally{testPolling=false;}
},500);
window.addEventListener('pagehide',()=>{
  if(testSession)fetch('/admin/quiz/test/'+testSession.testId+'/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});
});
$('runAutoDemo').disabled = true; $('playTest').disabled = true;
testRequest('/catalog').then(data=>{
  for(const category of data.game.categories){
    const label=node('label',''),input=node('input','');input.type='checkbox';input.value=category.id;input.checked=true;
    label.append(input,node('span','',`${category.label} (${category.count})`));$('testCategories').append(label);
  }
  $('runAutoDemo').disabled=false;$('playTest').disabled=false;
}).catch(error=>{$('testError').textContent=error.message;});
