const picturePreviews = {"picture-logos": {"text": "Which franchise uses this symbol?", "options": ["The Legend of Zelda", "Final Fantasy", "Dragon Quest", "Kingdom Hearts"], "difficulty": 1, "category": "logos", "image": {"url": "/assets/quiz-media/19400d3be00ee3b0.png", "crop": [0, 0, 1, 1], "aspect": 1.1538}}, "picture-characters": {"text": "Name this game character.", "options": ["Mario", "Luigi", "Wario", "Waluigi"], "difficulty": 1, "category": "characters", "image": {"url": "/assets/quiz-media/61c8e16ad90d4e6d.png", "crop": [0, 0, 1, 1], "aspect": 0.7597}}, "picture-posters": {"text": "Guess the movie from this poster detail.", "options": ["Jaws", "Deep Blue Sea", "The Meg", "Shark Night"], "difficulty": 1, "category": "posters", "image": {"url": "/assets/quiz-media/d5cb0a9cc40fa1c0.jpg", "crop": [0.17, 0.28, 0.66, 0.43], "aspect": 1.0212}}, "picture-actors": {"text": "Who is this actor?", "options": ["Keanu Reeves", "Johnny Depp", "Tom Cruise", "Brad Pitt"], "difficulty": 1, "category": "actors", "image": {"url": "/assets/quiz-media/796d63d21697d23d.jpg", "crop": [0, 0, 1, 1], "aspect": 0.75}}, "picture-descriptions": {"text": "Guess the game: Build, mine and survive in a world made of blocks.", "options": ["Minecraft", "Terraria", "Roblox", "Fortnite"], "difficulty": 1, "category": "descriptions"}};
const previewModes = [
  ['picture-logos','Logo round'],['picture-characters','Character round'],['picture-posters','Poster round'],['picture-actors','Actor round'],['picture-descriptions','Description round'],
  ['idle', 'Blank / stopped'], ['lobby', 'Lobby'], ['question', 'Question'],
  ['reveal', 'Answer reveal'], ['eliminations', 'Eliminations'], ['winner', 'Winner'],
  ['defeat', 'Defeat'], ['sudden-death', 'Sudden death'], ['last-survivor', 'Last survivor'],
  ['countdown','Final five seconds'], ['all-answered','Answers locked'], ['streak','Streak celebration'],
  ['no-photo', 'Missing picture'], ['sequence', 'Full sequence'],
];
let previewSerial = 0;
function previewState(mode) {
  const winner = { username: 'KingGumption', platform: 'twitch', profileImageUrl: `${location.origin}/overlay/avatar/twitch/kinggumption`, correctAnswers: 12, totalWins: 3 };
  const eliminated = ['PixelPilot','MoonCat','Nova','StarSeeker','Echo','River'].map((username,i) => ({ username, platform: ['twitch','youtube','tiktok'][i%3], answer: i === 5 ? null : (i%2 ? 1 : 3), profileImageUrl: '', correctAnswers: 2 }));
  const g = {
    gameId: `preview-${++previewSerial}`, phase: 'question', round: 3, questionCount: 10, maxQuestions: 15,
    deadline: Date.now() + 20000, answerSeconds:20, answered:5, players: 8, survivors: 8, winners: [], roster: [winner,...eliminated,{username:'Orbit',platform:'youtube'}],
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
  if (mode === 'sudden-death') { g.round = 11; g.suddenDeath = true; g.question = {text:'Which game takes place aboard the Talos I space station?',options:['Prey (2017)','System Shock 2','Dead Space 2','Alien: Isolation'],difficulty:13}; }
  if (mode === 'last-survivor') { g.survivors = 1; g.round = 7; }
  if (mode === 'countdown') g.deadline=Date.now()+5000;
  if (mode === 'all-answered') g.answered=g.survivors;
  if (mode === 'streak') {
    g.round=5;g.phase='reveal';g.question.answer=2;
    g.roundResult={answerCounts:[0,0,8,0],missed:0,eliminated:[],milestones:[{...winner,correctAnswers:5}]};
  }
  if(picturePreviews[mode]) g.question = picturePreviews[mode];
  return g;
}
function selectPreview(mode) {
  globalThis.stopQuizTest?.();
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
const requestedPreview = new URLSearchParams(location.search).get('state');
selectPreview(previewModes.some(([id])=>id===requestedPreview) ? requestedPreview : 'winner');
// Read-only cleanup receipt; previewing never writes to the live game or analytics.
fetch('/admin/quiz/analytics-baseline').then(r => {
  if (!r.ok) throw Error('Sign in to view the cleanup receipt.');
  return r.json();
}).then(data => {
  $('cleanupStatus').textContent = `${data.archivedEvents} earlier quiz events removed from analytics and win totals (through ${new Date(data.cutoff).toLocaleString()}).`;
}).catch(() => { $('cleanupStatus').textContent = 'Sign in to view the analytics cleanup receipt.'; });
