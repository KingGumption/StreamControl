let game;
const $ = id => document.getElementById(id);
let viewKey = '', stageTimer = null, animationRunning = false;
function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function updateControls(g) {
  if (!$('open')) return;
  $('open').disabled = ['lobby','question','reveal'].includes(g.phase);
  $('next').disabled = animationRunning || !['lobby','question','reveal'].includes(g.phase);
  $('next').textContent = g.phase === 'question' ? 'Close answers & reveal' : g.phase === 'lobby' ? 'Lock entries & start' : 'Next question';
  $('questionCount').max = g.maxQuestions;
}
function showOutcome(g) {
  animationRunning = false;
  updateControls(g);
  const stage = $('quizStage');
  stage.replaceChildren();
  stage.hidden = g.phase !== 'completed';
  if (stage.hidden) return;
  const won = g.winners.length > 0;
  stage.className = 'quiz-stage ' + (won ? 'victory' : 'defeat');
  stage.append(node('div', 'outcome-symbol', won ? '\u265b' : '\u00d7'));
  stage.append(node('h2', 'outcome-title', won ? (g.winners.length === 1 ? 'WINNER!' : 'WINNERS!') : 'DEFEAT'));
  stage.append(node('p', 'outcome-copy', won ? (g.winners.length === 1 ? 'The last player standing takes the crown.' : 'You survived the final question together.') : 'Everyone was eliminated this round. No one takes the crown.'));
  const winners = node('div', 'winner-list');
  g.winners.forEach(p => {
    const card = node('div', 'winner-name');
    card.append(node('strong', '', p.username), node('small', '', p.platform));
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
  stage.className = 'quiz-stage elimination';
  let offset = 0;
  function batch() {
    stage.replaceChildren();
    stage.append(node('div', 'stage-label', `ROUND ${g.round} RESULTS`));
    stage.append(node('h2', '', `${players.length} eliminated`));
    stage.append(node('p', '', `${offset + 1}-${Math.min(offset + 8, players.length)} of ${players.length} players`));
    const grid = node('div', 'eliminated-grid');
    players.slice(offset, offset + 8).forEach((p, i) => {
      const card = node('div', 'eliminated-player');
      card.style.setProperty('--delay', `${i * 70}ms`);
      card.append(node('strong', '', p.username), node('small', '', p.platform), node('span', '', p.answer === null ? 'No answer' : `Answer ${p.answer + 1} - incorrect`));
      grid.append(card);
    });
    stage.append(grid);
    offset += 8;
    stageTimer = setTimeout(() => offset < players.length ? batch() : showOutcome(g), 3200);
  }
  batch();
}
function render(g) {
  game = g;
  $('status').textContent = g.phase === 'lobby' ? 'Lobby open - type !join in chat' : g.phase === 'question' ? `Question ${g.round} of ${g.questionCount} - Entries locked` : g.phase === 'reveal' ? 'Answer revealed - Entries locked' : g.phase === 'completed' ? (g.winners.length ? 'Quiz complete - victory' : 'Quiz complete - defeat') : 'Waiting for a quiz';
  $('counts').textContent = `${g.players} joined - ${g.survivors} remaining`;
  const key = `${g.gameId}:${g.phase}:${g.round}`;
  if (key !== viewKey) {
    viewKey = key;
    clearTimeout(stageTimer);
    animationRunning = false;
    $('quizStage').hidden = true;
    $('quizStage').replaceChildren();
    $('question').textContent = g.question?.text || 'Join with !join before the host starts. Answer with 1, 2, 3 or 4.';
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
      $('result').textContent = `${result.eliminated.length} eliminated this round. ${result.missed} did not answer.`;
      if (result.eliminated.length) {
        const details = node('details', 'elimination-summary');
        details.id = 'eliminationSummary';
        details.append(node('summary', '', `Eliminated players (${result.eliminated.length})`));
        const list = node('ul', '');
        result.eliminated.forEach(p => list.append(node('li', '', `${p.username} (${p.platform}) - ${p.answer === null ? 'no answer' : `answer ${p.answer + 1}`}`)));
        details.append(list);
        $('result').after(details);
      }
      showEliminations(g);
    } else {
      $('result').textContent = 'First answer is final. Wrong or missing answers eliminate you. The last survivor wins immediately.';
    }
  }
  updateControls(g);
}
async function refresh() {
  try {
    const response = await fetch('/quiz/state', { cache: 'no-store' });
    if (!response.ok) throw Error('Unable to load quiz');
    render((await response.json()).game);
  } catch (error) { $('error').textContent = error.message; }
}
setInterval(refresh, 1000);
setInterval(() => {
  if (game?.phase === 'question') $('status').textContent = `Question ${game.round} of ${game.questionCount} - ${Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000))}s - Entries locked`;
}, 250);
refresh();
