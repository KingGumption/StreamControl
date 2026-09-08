const crypto = require('node:crypto');
const { addEngagementEvent, getQuizWinCount } = require('./db');
const { resolveTwitchAvatar } = require('./avatar-resolver');
const { loadQuestionHistory, saveQuestionHistory } = require('./quiz-question-history');
const QUESTIONS = require('./quiz-questions.json');
const CATEGORY_LABELS = { logos: 'Franchise logos', characters: 'Game characters', posters: 'Movie posters', actors: 'Guess the actor', descriptions: 'Game descriptions', locations: 'Game locations', horror: 'Horror trivia', items: 'Weapons and items', villains: 'Game villains', movies: 'Guess the movie', 'film-roles': 'Actors and roles', tv: 'TV and animation', 'game-lore': 'Gaming trivia', general: 'General knowledge' };
function shuffle(items) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function shuffleOptions(q) { const options = shuffle(q.options.map((text,i) => ({text,correct:i===q.answer}))); return {...q,options:options.map(o=>o.text),answer:options.findIndex(o=>o.correct)}; }
class QuizGame {
  constructor({ recordEvent = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, questions = QUESTIONS, resolveAvatar = null, getWins = () => 0, loadHistory = null, saveHistory = () => {} } = {}) {
    Object.assign(this, { recordEvent, now, schedule, cancel, questions, resolveAvatar, getWins, loadHistory, saveHistory });
    this.history = [];
    this.phase = 'idle'; this.players = new Map(); this.round = 0; this.count = 10;
  }
  track(eventType, player, metadata = {}) {
    const question=this.deck?.[this.round-1];
    this.recordEvent({ tool: 'elimination_quiz', eventType, correlationId: this.id, platform: player?.platform || 'admin', userId: player?.id, username: player?.username, metadata: { round: this.round, category: question?.category, questionId:question?.id || question?.text, difficulty:question?.difficulty, suddenDeath: this.round>this.count, ...metadata } });
  }
  open({ questionCount = 10, answerSeconds = 20, categories } = {}) {
    if (['lobby', 'question', 'reveal'].includes(this.phase)) throw new Error('Stop the current quiz before opening another lobby.');
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > Math.min(15,this.questions.length)) throw new Error(`Question count must be 1–${Math.min(15,this.questions.length)}.`);
    if (!Number.isInteger(answerSeconds) || answerSeconds < 5 || answerSeconds > 120) throw new Error('Answer time must be 5–120 seconds.');
    const known = [...new Set(this.questions.map(q => q.category || 'general'))];
    const selected = categories === undefined ? known : categories;
    if (!Array.isArray(selected) || !selected.length || selected.some(c => !known.includes(c))) throw new Error('Select at least one valid quiz category.');
    const pool = this.questions.filter(q => selected.includes(q.category || 'general'));
    if (pool.length < questionCount) throw new Error(`Selected categories have ${pool.length} questions. Reduce the question count or select more categories.`);
    const knownIds = new Set(this.questions.map(q=>q.id || q.text));
    this.history = [...new Set((this.loadHistory?.() || this.history).filter(id=>knownIds.has(id)))];
    const recency = new Map(this.history.map((id,i)=>[id,i]));
    this.historyRank = q => recency.get(q.id || q.text) ?? -1;
    const available = shuffle(pool), chosen = [];
    const min = Math.min(...pool.map(q=>q.difficulty)), max = Math.max(...pool.map(q=>q.difficulty));
    for(let i=0;i<questionCount;i++) {
      const target = questionCount === 1 ? min : min + i*(max-min)/(questionCount-1);
      let best = 0;
      for(let j=1;j<available.length;j++) {
        const rank = this.historyRank(available[j]) - this.historyRank(available[best]);
        if(rank<0 || (rank===0 && Math.abs(available[j].difficulty-target)<Math.abs(available[best].difficulty-target))) best=j;
      }
      chosen.push(available.splice(best,1)[0]);
    }
    chosen.sort((a,b)=>Number(this.historyRank(a)>=0)-Number(this.historyRank(b)>=0)||a.difficulty-b.difficulty);
    this.selectedCategories = [...new Set(selected)]; this.questionPool = pool;
    this.reserve = shuffle(available).sort((a,b)=>this.historyRank(a)-this.historyRank(b)||b.difficulty-a.difficulty);
    this.id = crypto.randomUUID(); this.count = questionCount; this.answerSeconds = answerSeconds;
    this.deck = chosen.map(shuffleOptions);
    this.nextQuestionAt = null; this.roundResult = null; this.outcome = null; this.players.clear(); this.round = 0; this.phase = 'lobby'; this.deadline = null; this.track('lobby_opened'); return this.getState();
  }
  next() {
    if (this.phase === 'question') { this.resolve(); return this.getState(); }
    if (!['lobby', 'reveal'].includes(this.phase)) throw new Error('Open a lobby first.');
    if (!this.players.size) throw new Error('At least one player must join first.');
    if (this.phase === 'lobby') this.track('game_started', null, { players: this.players.size, questionCount: this.count, answerSeconds:this.answerSeconds, categories:this.selectedCategories });
    this.cancel(this.timer); this.nextQuestionAt = null;
    if (this.round >= this.count) this.deck.push(this.suddenDeathQuestion());
    this.roundResult = null; this.round++; this.phase = 'question'; this.players.forEach(p => { p.answer = null; });
    const shown = this.deck[this.round-1];
    const questionId = shown.id || shown.text;
    this.history = this.history.filter(id=>id!==questionId); this.history.push(questionId);
    this.saveHistory([...this.history]);
    this.deadline = this.now() + this.answerSeconds * 1000;
    this.track('question_started', null, { questionText:shown.text, questionImage:shown.image || null, options:shown.options, players:this.survivors().length, answerSeconds:this.answerSeconds });
    this.timer = this.schedule(() => this.resolve(), this.answerSeconds * 1000); this.timer?.unref?.();
    return this.getState();
  }
  resolve() {
    if (this.phase !== 'question') return;
    this.cancel(this.timer); this.deadline = null;
    const q = this.deck[this.round - 1];
    const answerCounts = [0, 0, 0, 0], eliminated = [], milestones = [];
    let missed = 0, winnerRunEnded = false;
    const lastPlayer = this.survivors().length === 1;
    for (const p of this.players.values()) if (p.alive) {
      if (p.answer === null) missed++;
      else answerCounts[p.answer]++;
      const correct = p.answer === q.answer;
      if (correct) {
        p.correctAnswers++;
        if(p.correctAnswers%5===0) milestones.push({username:p.username,platform:p.platform,profileImageUrl:p.profileImageUrl,correctAnswers:p.correctAnswers});
      }
      this.track('answer_result', p, { correct, missed: p.answer === null });
      if (!correct && lastPlayer) {
        winnerRunEnded = true;
        this.track('winner_run_completed', p, { missed: p.answer === null });
      } else if (!correct) {
        p.alive = false;
        eliminated.push({ username: p.username, platform: p.platform, profileImageUrl: p.profileImageUrl, correctAnswers: p.correctAnswers, answer: p.answer });
        this.track('player_eliminated', p);
      }
    }
    this.roundResult = { answerCounts, missed, eliminated, winnerRunEnded, milestones };
    this.track('round_completed', null, { survivors: this.survivors().length, answerCounts, correctAnswer:q.answer, missed, eliminated: eliminated.length });
    this.phase = this.survivors().length === 0 || winnerRunEnded ? 'completed' : 'reveal';
    if (this.phase === 'reveal') {
      const revealMs = 3500 + Math.ceil(eliminated.length / 4) * 3200 + 1500;
      this.nextQuestionAt = this.now() + revealMs;
      this.timer = this.schedule(() => { if (this.phase === 'reveal') this.next(); }, revealMs);
      this.timer?.unref?.();
    }
    if (this.phase === 'completed') {
      this.outcome = this.survivors().length ? 'victory' : 'defeat';
      this.survivors().forEach(p => {
        p.totalWins++;
        this.track('player_won', p, { correctAnswers: p.correctAnswers, totalWins: p.totalWins });
      });
      this.track('game_completed', null, { winners: this.survivors().length, players: this.players.size, outcome: this.outcome });
    }
  }
  stop() { this.cancel(this.timer); this.nextQuestionAt = null; if (['lobby','question','reveal'].includes(this.phase)) this.track('game_stopped'); this.phase = 'idle'; this.deadline = null; return this.getState(); }
  survivors() { return [...this.players.values()].filter(p => p.alive); }
  handleChatEvent(event) {
    const match = String(event.text || '').trim().match(/^(?:!(join)|([1-4])|!quiz\s+(join|[a-d1-4]))$/i);
    if (!match || !['lobby', 'question', 'reveal'].includes(this.phase)) return false;
    const platform = String(event.platform || '').toLowerCase(), id = String(event.user?.id || '');
    if (!['twitch','youtube','tiktok'].includes(platform) || !id) return true;
    const key = `${platform}:${id}`, value = (match[1] || match[2] || match[3]).toLowerCase();
    if (value === 'join') {
      if (this.phase === 'lobby' && !this.players.has(key)) {
        const p = { platform, id, username: event.user.displayName || event.user.username || id, profileImageUrl: safeProfileImage(event.user.profileImageUrl), correctAnswers: 0, totalWins: this.getWins(platform, id), alive: true, answer: null };
        this.players.set(key, p); this.track('player_joined', p);
        if (!p.profileImageUrl && platform === 'twitch' && this.resolveAvatar) {
          Promise.resolve().then(() => this.resolveAvatar(event.user.username || p.username)).then(url => { p.profileImageUrl = safeProfileImage(url); }).catch(() => {});
        }
      }
      return true;
    }
    if (this.phase === 'question' && this.now() >= this.deadline) this.resolve();
    const p = this.players.get(key);
    if (this.phase !== 'question' || !p?.alive || p.answer !== null) return true;
    p.answer = /[1-4]/.test(value) ? Number(value) - 1 : value.charCodeAt(0) - 97;
    this.track('answer_submitted', p, { responseMs:Math.max(0,this.now()-(this.deadline-this.answerSeconds*1000)) }); return true;
  }
  suddenDeathQuestion() {
    if (!this.reserve.length) {
      this.reserve = shuffle(this.questionPool).sort((a,b)=>b.difficulty-a.difficulty);
      const last = this.deck[this.deck.length-1];
      if (this.reserve.length > 1 && (this.reserve[0].id || this.reserve[0].text) === (last.id || last.text)) this.reserve.push(this.reserve.shift());
    }
    return shuffleOptions(this.reserve.shift());
  }
  getCatalog() {
    return [...new Set(this.questions.map(q=>q.category || 'general'))].map(id=>({id,label:CATEGORY_LABELS[id] || id,count:this.questions.filter(q=>(q.category || 'general')===id).length}));
  }
  getState() {
    const q = this.round ? this.deck?.[this.round - 1] : null;
    return { answerSeconds: this.answerSeconds, answered: this.phase === 'question' ? this.survivors().filter(p=>p.answer!==null).length : null, categories: this.getCatalog(), selectedCategories: this.selectedCategories || this.getCatalog().map(c=>c.id), nextQuestionAt: this.nextQuestionAt || null, suddenDeath: this.round > this.count, solo: this.players.size === 1, roster: [...this.players.values()].map(({username, platform, profileImageUrl}) => ({username, platform, profileImageUrl})), gameId: this.id || null, outcome: this.phase === 'completed' ? this.outcome : null, roundResult: ['reveal', 'completed'].includes(this.phase) ? this.roundResult : null, phase: this.phase, round: this.round, questionCount: this.count, maxQuestions: Math.min(15,this.questions.length), deadline: this.deadline, players: this.players.size, survivors: this.survivors().length,
      question: q && this.phase !== 'idle' ? { text: q.text, options: q.options, difficulty: q.difficulty, category: q.category || 'general', ...(q.image ? { image: { url: `/assets/quiz-media/${q.image.file}`, crop: q.image.crop || [0,0,1,1], aspect: q.image.aspect } } : {}), ...(['reveal','completed'].includes(this.phase) ? { answer: q.answer } : {}) } : null,
      winners: this.phase === 'completed' ? this.survivors().map(({ username, platform, profileImageUrl, correctAnswers, totalWins }) => ({ username, platform, profileImageUrl, correctAnswers, totalWins })) : [] };
  }
}
function safeProfileImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
module.exports = { QuizGame, quizGame: new QuizGame({ recordEvent: addEngagementEvent, resolveAvatar: resolveTwitchAvatar, getWins: getQuizWinCount, loadHistory: loadQuestionHistory, saveHistory: saveQuestionHistory }) };
