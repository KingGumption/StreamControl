const crypto = require('node:crypto');
const { QuizGame } = require('./quiz-game');

class QuizTestSessions {
  constructor({ now = Date.now, schedule = setTimeout, cancel = clearTimeout, ttlMs = 30 * 60 * 1000, limit = 20, random = Math.random } = {}) {
    Object.assign(this, { now, schedule, cancel, ttlMs, limit, random });
    this.sessions = new Map();
  }
  catalog() { return new QuizGame().getState(); }
  sweep() {
    for (const [id, session] of this.sessions) if (session.expiresAt <= this.now()) this.stop(id);
  }
  create({ questionCount = 3, answerSeconds = 15, categories, opponents = 2, username = 'KingGumption', autoplay = false, scenario = 'mixed' } = {}) {
    this.sweep();
    if (this.sessions.size >= this.limit) throw new Error('Too many test sessions. Stop an existing test or try again later.');
    if (!Number.isInteger(opponents) || opponents < 0 || opponents > 5) throw new Error('Choose 0 to 5 simulated opponents.');
    if (typeof autoplay !== 'boolean' || !['mixed','winner','defeat','sudden-death'].includes(scenario)) throw new Error('Choose a valid demo scenario.');
    if (autoplay && scenario === 'defeat' && opponents === 0) throw new Error('The defeat demo needs at least one simulated opponent.');
    const name = String(username).trim().slice(0, 50);
    if (!name) throw new Error('Enter a test player name.');
    const manager = this;
    const session = { id: crypto.randomUUID(), expiresAt: this.now() + this.ttlMs, botTimers: new Set(), scheduledRound: 0, autoplay, scenario };
    session.game = new class extends QuizGame {
      next() {
        const state = super.next();
        manager.scheduleOpponents(session);
        return state;
      }
    }({ now: this.now, schedule: this.schedule, cancel: this.cancel, recordEvent: () => {}, getWins: () => 0 });
    session.game.open({ questionCount, answerSeconds, categories });
    session.game.handleChatEvent(this.chat('self', name, '!join'));
    const names = ['PixelPilot', 'MoonCat', 'Nova', 'StarSeeker', 'Echo'];
    this.sessions.set(session.id, session);
    for (let i = 0; i < opponents; i++) {
      const join = () => session.game.handleChatEvent(this.chat(`bot-${i}`, names[i], '!join'));
      if (autoplay) this.later(session, join, 500 + i * 700);
      else join();
    }
    if (autoplay) this.later(session, () => { if(session.game.phase === 'lobby') session.game.next(); }, 1700 + opponents * 700);
    return this.state(session);
  }
  chat(id, username, text) { return { platform: 'twitch', text, user: { id, username, displayName: username } }; }
  require(id) {
    this.sweep();
    const session = this.sessions.get(id);
    if (!session) throw new Error('This test has expired or stopped. Open a new test lobby.');
    session.expiresAt = this.now() + this.ttlMs;
    return session;
  }
  get(id) { return this.state(this.require(id)); }
  state(session) {
    const game = session.game;
    const self = game.players.get('twitch:self');
    return { ok: true, autoplay: session.autoplay, scenario: session.scenario, testId: session.id, game: game.getState(), self: { username: self.username, alive: self.alive, answer: self.answer, correctAnswers: self.correctAnswers },
      testPlayers: [...game.players.values()].map(p => ({ username: p.username, alive: p.alive, correctAnswers: p.correctAnswers })),
    };
  }
  action(id, action, payload = {}) {
    const session = this.require(id), game = session.game;
    if (action === 'start') {
      if (game.phase !== 'lobby') throw new Error('The test has already started.');
      game.next();
    } else if (action === 'answer') {
      const self = game.players.get('twitch:self');
      if (!Number.isInteger(payload.answer) || payload.answer < 1 || payload.answer > 4) throw new Error('Choose an answer from 1 to 4.');
      if (game.phase !== 'question' || this.now() >= game.deadline || !self.alive || self.answer !== null) throw new Error('You cannot answer this question now.');
      game.handleChatEvent(this.chat('self', self.username, String(payload.answer)));
    } else if (action === 'finish-question') {
      if (game.phase !== 'question') throw new Error('There is no open question.');
      game.resolve();
    } else throw new Error('Unknown test action.');
    return this.state(session);
  }
  scheduleOpponents(session) {
    const game = session.game;
    if (game.phase !== 'question' || session.scheduledRound === game.round) return;
    session.scheduledRound = game.round;
    for (const timer of session.botTimers) this.cancel(timer);
    session.botTimers.clear();
    const round = game.round;
    for (const player of game.players.values()) {
      if ((!session.autoplay && player.id === 'self') || !player.alive) continue;
      const timer = this.schedule(() => {
        session.botTimers.delete(timer);
        if (game.phase !== 'question' || game.round !== round) return;
        const correct = game.deck[round - 1].answer;
        let right = this.random() < .65;
        if (session.scenario === 'defeat') right = false;
        if (session.scenario === 'winner') right = player.id === 'self' ? round <= 3 : round <= Number(player.id.split('-')[1]) % 2 + 1;
        if (session.scenario === 'sudden-death') right = round <= game.count || (player.id === 'self' && round === game.count + 1);
        const answer = right ? correct : (correct + 1 + Math.floor(this.random() * 3)) % 4;
        game.handleChatEvent(this.chat(player.id, player.username, String(answer + 1)));
      }, Math.min(2500, game.answerSeconds * 250));
      timer?.unref?.();
      session.botTimers.add(timer);
    }
  }
  later(session, callback, delay) {
    const timer = this.schedule(() => { session.botTimers.delete(timer); if(this.sessions.has(session.id)) callback(); }, delay);
    timer?.unref?.(); session.botTimers.add(timer);
  }
  stop(id) {
    const session = this.sessions.get(id);
    if (!session) return { ok: true };
    session.game.stop();
    for (const timer of session.botTimers) this.cancel(timer);
    this.sessions.delete(id);
    return { ok: true };
  }
}
const quizTestSessions = new QuizTestSessions();
const cleanup = setInterval(() => quizTestSessions.sweep(), 60000);
cleanup.unref();
module.exports = { QuizTestSessions, quizTestSessions };
