const previewModes = [
  ['idle', 'Blank / stopped'], ['lobby', 'Lobby'], ['question', 'Question'],
  ['reveal', 'Answer reveal'], ['eliminations', 'Eliminations'], ['winner', 'Winner'],
  ['defeat', 'Defeat'], ['sudden-death', 'Sudden death'], ['last-survivor', 'Last survivor'],
  ['no-photo', 'Missing picture'], ['sequence', 'Full sequence'],
];
let previewSerial = 0;
function previewState(mode) {
  const winner = { username: 'KingGumption', platform: 'twitch', profileImageUrl: `${location.origin}/overlay/avatar/twitch/kinggumption`, correctAnswers: 12, totalWins: 3 };
  const eliminated = ['PixelPilot','MoonCat','Nova','StarSeeker','Echo','River'].map((username,i) => ({ username, platform: ['twitch','youtube','tiktok'][i%3], answer: i === 5 ? null : (i%2 ? 1 : 3), profileImageUrl: '', correctAnswers: 2 }));
  const g = {
    gameId: `preview-${++previewSerial}`, phase: 'question', round: 3, questionCount: 10, maxQuestions: 15,
    deadline: Date.now() + 20000, players: 8, survivors: 8, winners: [], roster: [winner,...eliminated],
    suddenDeath: false, outcome: null, nextQuestionAt: null, roundResult: null,
    question: { text: 'Which planet is known as the Red Planet?', options: ['Venus','Jupiter','Mars','Saturn'], difficulty: 3 },
  };
  if (mode === 'idle' || mode === 'lobby') { g.phase = mode; g.question = null; g.round = 0; g.players = mode === 'idle' ? 0 : 8; g.survivors = g.players; }
  if (['reveal','eliminations','winner','defeat','sequence','no-photo'].includes(mode)) {
    g.question.answer = 2; g.survivors = 2; g.phase = 'reveal';
    g.roundResult = { answerCounts: [0,2,2,3], missed: 1, eliminated };
  }
  if (['winner','sequence','no-photo'].includes(mode)) {
    g.phase = 'completed'; g.outcome = 'victory'; g.survivors = 1; g.winners = [winner]; g.round = 13; g.suddenDeath = true;
    g.roundResult = { answerCounts: [0,1,0,0], missed: 0, eliminated: [], winnerRunEnded: true };
    if (mode === 'no-photo') { winner.profileImageUrl = ''; winner.username = 'NoPhotoViewer'; }
  }
  if (mode === 'defeat') { g.phase = 'completed'; g.outcome = 'defeat'; g.survivors = 0; g.winners = []; g.players = 6; g.roundResult.answerCounts = [0,2,0,3]; }
  if (mode === 'sudden-death') { g.round = 11; g.suddenDeath = true; g.question = {text:'What is the remainder when (101 x 17 + 13) is divided by 7?',options:['1','2','3','4'],difficulty:16}; }
  if (mode === 'last-survivor') { g.survivors = 1; g.round = 7; }
  return g;
}
function selectPreview(mode) {
  const g = previewState(mode);
  render(g);
  if (mode !== 'sequence') {
    clearTimeout(stageTimer);
    animationRunning = false;
    if (mode === 'winner' || mode === 'defeat' || mode === 'no-photo') showOutcome(g);
    if (mode === 'eliminations') showEliminations(g);
  }
  document.querySelectorAll('[data-preview]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preview === mode)));
  $('previewDescription').textContent = mode === 'idle' ? 'The checkerboard represents transparency: the stopped overlay is completely blank.' : mode === 'sequence' ? 'Playing the actual answer reveal, then winner screen.' : `${previewModes.find(([id])=>id===mode)?.[1] || mode} - sample data`;
}
for (const [id,label] of previewModes) {
  const button = node('button','',label);
  button.type = 'button'; button.dataset.preview = id;
  button.onclick = () => selectPreview(id);
  $('previewStates').append(button);
}
$('previewWidth').onchange = () => { $('previewCanvas').style.width = `${$('previewWidth').value}px`; };
$('playSequence').onclick = () => selectPreview('sequence');
selectPreview('winner');
// Read-only cleanup receipt; previewing never writes to the live game or analytics.
fetch('/admin/quiz/analytics-baseline').then(r => {
  if (!r.ok) throw Error('Sign in to view the cleanup receipt.');
  return r.json();
}).then(data => {
  $('cleanupStatus').textContent = `${data.archivedEvents} earlier quiz events removed from analytics and win totals (through ${new Date(data.cutoff).toLocaleString()}).`;
}).catch(() => { $('cleanupStatus').textContent = 'Sign in to view the analytics cleanup receipt.'; });
