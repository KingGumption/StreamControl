let game;
const $ = id => document.getElementById(id);
let viewKey = '', stageTimer = null, animationRunning = false;
function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function portrait(player) {
  player = { ...player, profileImageUrl: player.profileImageUrl || game?.roster?.find(p => p.username === player.username && p.platform === player.platform)?.profileImageUrl };
  const wrapper = node('span', 'player-portrait');
  wrapper.append(node('span', 'avatar-fallback', Array.from(player.username || '?')[0]));
  try {
    const url = new URL(player.profileImageUrl);
    if (url.protocol === 'https:') {
      const image = node('img', 'avatar-image');
      image.alt = `${player.username}'s profile picture`;
      image.referrerPolicy = 'no-referrer';
      image.src = url.href;
      image.onerror = () => image.remove();
      wrapper.append(image);
    }
  } catch { /* Show initials when a platform does not supply an avatar. */ }
  return wrapper;
}
function roundLabel(g) {
  return g.suddenDeath ? `Sudden death ${g.round - g.questionCount}` : `Question ${g.round} of ${g.questionCount}`;
}
function updateStatus(g) {
  let label = g.phase === 'lobby' ? 'Join the quiz' : g.phase === 'question' ? roundLabel(g) : g.phase === 'reveal' ? 'Answer revealed' : g.phase === 'completed' ? (g.winners.length ? 'Quiz complete - victory' : 'Quiz complete - defeat') : 'Waiting for a quiz';
  const deadline = g.phase === 'question' ? g.deadline : g.phase === 'reveal' ? g.nextQuestionAt : null;
  if (g.phase === 'reveal' && deadline) label = 'Next question in';
  const parts = [node('span', 'status-label', label)];
  if (deadline) parts.push(node('span', 'quiz-countdown', `${String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))).padStart(2, '0')}s`));
  $('status').replaceChildren(...parts);
}
function renderMedia(q) {
  const holder = $('questionMedia');
  if (!holder) return;
  holder.replaceChildren(); holder.hidden = !q?.image;
  $('questionPanel').className = game.phase === 'lobby' ? 'panel quiz-lobby' : q?.image ? 'panel has-media' : 'panel';
  if (!q?.image) return;
  const frame = node('div', 'question-image-frame' + (q.category === 'logos' ? ' logo-clue' : ''));
  frame.style.aspectRatio = String(q.image.aspect || 1);
  frame.style.maxWidth = `${240 * (q.image.aspect || 1)}px`;
  const image = node('img', 'question-image');
  image.alt = 'Quiz picture clue'; image.src = q.image.url;
  const [x,y,w,h] = q.image.crop || [0,0,1,1];
  Object.assign(image.style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-100*x/w}%`,top:`${-100*y/h}%`});
  image.onerror = () => { frame.replaceChildren(node('span', 'picture-error', 'Picture unavailable')); };
  frame.append(image);holder.append(frame);
}
function updateCategories(g) {
  const holder = $('categoryChoices');
  if (!holder || !g.categories) return;
  if (!holder.children.length) {
    for(const category of g.categories) {
      const label = node('label','');
      const input = node('input',''); input.type = 'checkbox'; input.value = category.id;
      input.checked = (g.selectedCategories || g.categories.map(c=>c.id)).includes(category.id);
      input.onchange = () => { updateControls(game); const maximum = Number($('questionCount').max); if(Number($('questionCount').value)>maximum) $('questionCount').value=maximum; };
      label.append(input, node('span','',`${category.label} (${category.count})`));holder.append(label);
    }
  }
  const selected = Array.from(holder.querySelectorAll('input:checked'),input=>input.value);
  const count = g.categories.filter(c=>selected.includes(c.id)).reduce((n,c)=>n+c.count,0);
  $('questionCount').max = Math.max(1,Math.min(g.maxQuestions,count));
  $('categoryHelp').textContent = count ? `${count} questions selected. Sudden death uses unseen questions first, then reshuffles this selection.` : 'Select at least one category.';
  $('categorySettings').disabled = ['lobby','question','reveal'].includes(g.phase);
  if(!count) $('open').disabled = true;
}
function updateControls(g) {
  if (!$('open')) return;
  $('open').disabled = ['lobby','question','reveal'].includes(g.phase);
  $('next').disabled = animationRunning || !['lobby','question'].includes(g.phase);
  $('next').textContent = g.phase === 'question' ? 'Close answers & reveal' : g.phase === 'lobby' ? 'Lock entries & start' : 'Next question starts automatically';
  $('questionCount').max = g.maxQuestions;
  updateCategories(g);
}
function showOutcome(g) {
  animationRunning = false;
  updateControls(g);
  const stage = $('quizStage');
  stage.replaceChildren();
  stage.hidden = g.phase !== 'completed';
  $('questionPanel').hidden = !stage.hidden;
  if (stage.hidden) return;
  const won = g.winners.length > 0;
  stage.className = 'quiz-stage ' + (won ? 'victory' : 'defeat');
  stage.append(node('div', 'outcome-symbol', won ? '\u265b' : '\u00d7'));
  stage.append(node('h2', 'outcome-title', won ? (g.winners.length === 1 ? 'WINNER!' : 'WINNERS!') : 'DEFEAT'));
  stage.append(node('p', 'outcome-copy', won ? (g.winners.length === 1 ? `Last player standing. Run ended on question ${g.round}.` : 'You survived the final question together.') : 'Everyone was eliminated this round. No one takes the crown.'));
  const winners = node('div', 'winner-list');
  g.winners.forEach(p => {
    const card = node('div', 'winner-name');
    card.append(portrait(p), node('strong', '', p.username), node('small', '', p.platform));
    const stats = node('div', 'winner-stats');
    stats.append(node('span', '', `${p.correctAnswers || 0} correct answers`), node('span', '', `${p.totalWins || 0} total wins`));
    card.append(stats);
    winners.append(card);
  });
  stage.append(winners);
}
function showEliminations(g) {
  const players = g.roundResult?.eliminated || [];
  if (!players.length) { showOutcome(g); return; }
  const stage = $('quizStage');
  animationRunning = true;
  updateControls(g);
  stage.hidden = false;
  $('questionPanel').hidden = true;
  stage.className = 'quiz-stage elimination';
  let offset = 0;
  function batch() {
    stage.replaceChildren();
    stage.append(node('div', 'stage-label', `ROUND ${g.round} RESULTS`));
    stage.append(node('h2', '', `${players.length} eliminated`));
    stage.append(node('p', '', `${offset + 1}-${Math.min(offset + 4, players.length)} of ${players.length} players`));
    const grid = node('div', 'eliminated-grid');
    players.slice(offset, offset + 4).forEach((p, i) => {
      const card = node('div', 'eliminated-player');
      card.style.setProperty('--delay', `${i * 70}ms`);
      card.append(portrait(p), node('strong', '', p.username), node('small', '', p.platform), node('span', '', p.answer === null ? 'No answer' : `Answer ${p.answer + 1} - incorrect`));
      grid.append(card);
    });
    stage.append(grid);
    offset += 4;
    stageTimer = setTimeout(() => offset < players.length ? batch() : showOutcome(g), 3200);
  }
  batch();
}
function render(g) {
  game = g;
  if ($('overlayRoot')) $('overlayRoot').hidden = g.phase === 'idle';
  updateStatus(g);
  $('questionPanel').className = g.phase === 'lobby' ? 'panel quiz-lobby' : g.question?.image ? 'panel has-media' : 'panel';
  $('counts').textContent = g.phase === 'lobby' ? `${g.players} ${g.players === 1 ? 'player' : 'players'} joined` : `${g.players} joined - ${g.survivors} remaining`;
  const key = `${g.gameId}:${g.phase}:${g.round}`;
  if (key !== viewKey) {
    viewKey = key;
    clearTimeout(stageTimer);
    animationRunning = false;
    $('questionPanel').hidden = false;
    $('quizStage').hidden = true;
    $('quizStage').replaceChildren();
    $('question').textContent = g.phase === 'lobby' ? '!join' : g.question?.text || 'Waiting for the next quiz';
    renderMedia(g.question);
    $('options').replaceChildren();
    (g.question?.options || []).forEach((text, i) => {
      const correct = g.question.answer === i;
      const option = node('div', 'option' + (correct ? ' correct' : g.roundResult ? ' incorrect' : ''));
      option.append(node('span', '', `${i + 1}. ${text}`));
      if (g.roundResult) option.append(node('strong', 'answer-count', `${g.roundResult.answerCounts[i]} ${correct ? 'correct' : 'wrong'}`));
      $('options').append(option);
    });
    const oldList = $('eliminationSummary');
    if (oldList) oldList.remove();
    if (g.roundResult) {
      const result = g.roundResult;
      $('result').textContent = result.winnerRunEnded ? "The last survivor's run has ended. The crown is theirs." : `${result.eliminated.length} eliminated this round. ${result.missed} did not answer.`;
      if (result.eliminated.length && $('overlay')) {
        const details = node('details', 'elimination-summary');
        details.id = 'eliminationSummary';
        details.append(node('summary', '', `Eliminated players (${result.eliminated.length})`));
        const list = node('ul', '');
        result.eliminated.forEach(p => list.append(node('li', '', `${p.username} (${p.platform}) - ${p.answer === null ? 'no answer' : `answer ${p.answer + 1}`}`)));
        details.append(list);
        $('result').after(details);
      }
      animationRunning = true;
      stageTimer = setTimeout(() => showEliminations(g), 3500);
    } else {
      $('result').textContent = g.phase === 'lobby' ? 'Type in chat to play' : 'Answer 1, 2, 3 or 4. First answer counts.';
    }
  }
  updateControls(g);
}
async function refresh() {
  if (globalThis.QUIZ_PREVIEW) return;
  try {
    const response = await fetch('/quiz/state', { cache: 'no-store' });
    if (!response.ok) throw Error('Unable to load quiz');
    render((await response.json()).game);
  } catch (error) { $('error').textContent = error.message; }
}
setInterval(refresh, 1000);
setInterval(() => { if (game) updateStatus(game); }, 250);
refresh();
