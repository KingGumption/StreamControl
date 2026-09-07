const crypto = require('node:crypto');
const { addEngagementEvent, getQuizWinCount } = require('./db');
const { resolveTwitchAvatar } = require('./avatar-resolver');
const QUESTIONS = require('./quiz-questions.json');
class QuizGame {
  constructor({ recordEvent = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, questions = QUESTIONS, resolveAvatar = null, getWins = () => 0 } = {}) {
    Object.assign(this, { recordEvent, now, schedule, cancel, questions, resolveAvatar, getWins });
    this.phase = 'idle'; this.players = new Map(); this.round = 0; this.count = 10;
  }
  track(eventType, player, metadata = {}) {
    this.recordEvent({ tool: 'elimination_quiz', eventType, correlationId: this.id, platform: player?.platform || 'admin', userId: player?.id, username: player?.username, metadata: { round: this.round, ...metadata } });
  }
  open({ questionCount = 10, answerSeconds = 20 } = {}) {
    if (['lobby', 'question', 'reveal'].includes(this.phase)) throw new Error('Stop the current quiz before opening another lobby.');
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > this.questions.length) throw new Error(`Question count must be 1–${this.questions.length}.`);
    if (!Number.isInteger(answerSeconds) || answerSeconds < 5 || answerSeconds > 120) throw new Error('Answer time must be 5–120 seconds.');
    this.id = crypto.randomUUID(); this.count = questionCount; this.answerSeconds = answerSeconds;
    this.deck = Array.from({ length: questionCount }, (_, i) => this.questions[questionCount === 1 ? 0 : Math.round(i * (this.questions.length - 1) / (questionCount - 1))]).map(q => {
      const options = q.options.map((text, i) => ({ text, correct: i === q.answer }));
      for (let i = options.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [options[i], options[j]] = [options[j], options[i]]; }
      return { ...q, options: options.map(o => o.text), answer: options.findIndex(o => o.correct) };
    });
    this.nextQuestionAt = null; this.roundResult = null; this.outcome = null; this.players.clear(); this.round = 0; this.phase = 'lobby'; this.deadline = null; this.track('lobby_opened'); return this.getState();
  }
  next() {
    if (this.phase === 'question') { this.resolve(); return this.getState(); }
    if (!['lobby', 'reveal'].includes(this.phase)) throw new Error('Open a lobby first.');
    if (!this.players.size) throw new Error('At least one player must join first.');
    if (this.phase === 'lobby') this.track('game_started', null, { players: this.players.size, questionCount: this.count });
    this.cancel(this.timer); this.nextQuestionAt = null;
    if (this.round >= this.count) this.deck.push(this.suddenDeathQuestion());
    this.roundResult = null; this.round++; this.phase = 'question'; this.players.forEach(p => { p.answer = null; });
    this.deadline = this.now() + this.answerSeconds * 1000;
    this.timer = this.schedule(() => this.resolve(), this.answerSeconds * 1000); this.timer?.unref?.();
    return this.getState();
  }
  resolve() {
    if (this.phase !== 'question') return;
    this.cancel(this.timer); this.deadline = null;
    const q = this.deck[this.round - 1];
    const answerCounts = [0, 0, 0, 0], eliminated = [];
    let missed = 0, winnerRunEnded = false;
    const lastPlayer = this.survivors().length === 1;
    for (const p of this.players.values()) if (p.alive) {
      if (p.answer === null) missed++;
      else answerCounts[p.answer]++;
      const correct = p.answer === q.answer;
      if (correct) p.correctAnswers++;
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
    this.roundResult = { answerCounts, missed, eliminated, winnerRunEnded };
    this.track('round_completed', null, { survivors: this.survivors().length, answerCounts, missed, eliminated: eliminated.length });
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
    this.track('answer_submitted', p); return true;
  }
  suddenDeathQuestion() {
    const a = 101 + (this.round - this.count), b = crypto.randomInt(13, 70), c = crypto.randomInt(11, 90);
    const modulus = [7, 11, 13, 17, 19][crypto.randomInt(5)];
    const answer = (a * b + c) % modulus;
    const choices = new Set([answer]);
    while (choices.size < 4) choices.add(crypto.randomInt(modulus));
    const options = [...choices];
    for (let i = options.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [options[i], options[j]] = [options[j], options[i]]; }
    return { text: `What is the remainder when (${a} x ${b} + ${c}) is divided by ${modulus}?`, options: options.map(String), answer: options.indexOf(answer), difficulty: 16 };
  }
  getState() {
    const q = this.round ? this.deck?.[this.round - 1] : null;
    return { nextQuestionAt: this.nextQuestionAt || null, suddenDeath: this.round > this.count, solo: this.players.size === 1, roster: [...this.players.values()].map(({username, platform, profileImageUrl}) => ({username, platform, profileImageUrl})), gameId: this.id || null, outcome: this.phase === 'completed' ? this.outcome : null, roundResult: ['reveal', 'completed'].includes(this.phase) ? this.roundResult : null, phase: this.phase, round: this.round, questionCount: this.count, maxQuestions: this.questions.length, deadline: this.deadline, players: this.players.size, survivors: this.survivors().length,
      question: q && this.phase !== 'idle' ? { text: q.text, options: q.options, difficulty: q.difficulty, ...(['reveal','completed'].includes(this.phase) ? { answer: q.answer } : {}) } : null,
      winners: this.phase === 'completed' ? this.survivors().map(({ username, platform, profileImageUrl, correctAnswers, totalWins }) => ({ username, platform, profileImageUrl, correctAnswers, totalWins })) : [] };
  }
}
function safeProfileImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
module.exports = { QuizGame, quizGame: new QuizGame({ recordEvent: addEngagementEvent, resolveAvatar: resolveTwitchAvatar, getWins: getQuizWinCount }) };
