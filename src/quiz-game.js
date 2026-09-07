const crypto = require('node:crypto');
const { addEngagementEvent } = require('./db');
const QUESTIONS = require('./quiz-questions.json');
class QuizGame {
  constructor({ recordEvent = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, questions = QUESTIONS } = {}) {
    Object.assign(this, { recordEvent, now, schedule, cancel, questions });
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
    this.players.clear(); this.round = 0; this.phase = 'lobby'; this.deadline = null; this.track('lobby_opened'); return this.getState();
  }
  next() {
    if (this.phase === 'question') { this.resolve(); return this.getState(); }
    if (!['lobby', 'reveal'].includes(this.phase)) throw new Error('Open a lobby first.');
    if (!this.players.size) throw new Error('At least one player must join first.');
    if (this.phase === 'lobby') this.track('game_started', null, { players: this.players.size, questionCount: this.count });
    this.round++; this.phase = 'question'; this.players.forEach(p => { p.answer = null; });
    this.deadline = this.now() + this.answerSeconds * 1000;
    this.timer = this.schedule(() => this.resolve(), this.answerSeconds * 1000); this.timer?.unref?.();
    return this.getState();
  }
  resolve() {
    if (this.phase !== 'question') return;
    this.cancel(this.timer); this.deadline = null;
    const q = this.deck[this.round - 1];
    for (const p of this.players.values()) if (p.alive) {
      const correct = p.answer === q.answer;
      this.track('answer_result', p, { correct, missed: p.answer === null });
      if (!correct) { p.alive = false; this.track('player_eliminated', p); }
    }
    this.track('round_completed', null, { survivors: this.survivors().length });
    this.phase = this.round >= this.count || !this.survivors().length ? 'completed' : 'reveal';
    if (this.phase === 'completed') {
      this.survivors().forEach(p => this.track('player_won', p));
      this.track('game_completed', null, { winners: this.survivors().length, players: this.players.size });
    }
  }
  stop() { this.cancel(this.timer); if (['lobby','question','reveal'].includes(this.phase)) this.track('game_stopped'); this.phase = 'idle'; this.deadline = null; return this.getState(); }
  survivors() { return [...this.players.values()].filter(p => p.alive); }
  handleChatEvent(event) {
    const match = String(event.text || '').trim().match(/^!quiz\s+(join|[a-d1-4])$/i);
    if (!match) return false;
    const platform = String(event.platform || '').toLowerCase(), id = String(event.user?.id || '');
    if (!['twitch','youtube','tiktok'].includes(platform) || !id) return true;
    const key = `${platform}:${id}`, value = match[1].toLowerCase();
    if (value === 'join') {
      if (this.phase === 'lobby' && !this.players.has(key)) {
        const p = { platform, id, username: event.user.username || id, alive: true, answer: null };
        this.players.set(key, p); this.track('player_joined', p);
      }
      return true;
    }
    if (this.phase === 'question' && this.now() >= this.deadline) this.resolve();
    const p = this.players.get(key);
    if (this.phase !== 'question' || !p?.alive || p.answer !== null) return true;
    p.answer = /[1-4]/.test(value) ? Number(value) - 1 : value.charCodeAt(0) - 97;
    this.track('answer_submitted', p); return true;
  }
  getState() {
    const q = this.round ? this.deck?.[this.round - 1] : null;
    return { phase: this.phase, round: this.round, questionCount: this.count, maxQuestions: this.questions.length, deadline: this.deadline, players: this.players.size, survivors: this.survivors().length,
      question: q && this.phase !== 'idle' ? { text: q.text, options: q.options, difficulty: q.difficulty, ...(['reveal','completed'].includes(this.phase) ? { answer: q.answer } : {}) } : null,
      winners: this.phase === 'completed' ? this.survivors().map(({ username, platform }) => ({ username, platform })) : [] };
  }
}
module.exports = { QuizGame, quizGame: new QuizGame({ recordEvent: addEngagementEvent }) };
