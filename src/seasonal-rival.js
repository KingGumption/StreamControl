'use strict';

const FLAVOURS = {
  christmas: {
    title: 'The Grinch’s gift grab', rival: 'The Grinch', loot: 'presents', stash: 'sack',
    place: 'workshop', marks: ['Bell', 'Star', 'Holly'],
    chatFinals: ['Let chat pick the next in-game outfit', 'Take a festive group screenshot', 'Give the next in-game vehicle a festive name'],
    rivalFinals: ['Narrate the next minute as the Grinch', 'Give a dramatic holiday villain monologue', 'Pose for a Grinch victory screenshot'],
  },
  classic: {
    title: 'The Pig Sty prize raid', rival: 'The Prize Bandit', loot: 'prizes', stash: 'stash',
    place: 'prize vault', marks: ['Crown', 'Key', 'Coin'],
    chatFinals: ['Let chat name the next mission', 'Pose for a Pig Sty victory screenshot', 'Let chat pick the next in-game outfit'],
    rivalFinals: ['Narrate the next minute as the bandit', 'Give the bandit a victory speech', 'Name the next in-game vehicle after the bandit'],
  },
  vicecity: {
    title: 'The midnight haul', rival: 'The Neon Bandit', loot: 'parcels', stash: 'trunk',
    place: 'marina', marks: ['Palm', 'Flamingo', 'Sun'],
    chatFinals: ['Let chat pick the next cruising route', 'Take a neon-lit in-game screenshot', 'Let chat name the getaway car'],
    rivalFinals: ['Narrate the next minute as a late-night DJ', 'Pose for a getaway-driver screenshot', 'Give the Neon Bandit a radio shout-out'],
  },
  spooktober: {
    title: 'The phantom’s candy raid', rival: 'The Candy Phantom', loot: 'treats', stash: 'cauldron',
    place: 'crypt', marks: ['Bat', 'Moon', 'Skull'],
    chatFinals: ['Give chat a spooky campfire story', 'Let chat name the next haunted hideout', 'Take a ghost-hunter victory screenshot'],
    rivalFinals: ['Narrate the next minute in a ghost voice', 'Give the phantom a theatrical introduction', 'Pose for a haunted victory screenshot'],
  },
};

function challenge(round, session, flavour) {
  const seed = round + session;
  const n = 2 + seed % 5;
  const mark = flavour.marks[seed % 3];
  const following = flavour.marks[(seed + 1) % 3];
  const third = flavour.marks[(seed + 2) % 3];
  const puzzles = [
    () => ({prompt: `Read the seal on the ${flavour.place} door: ${mark}, ${following}, ${third}, ${mark}, __. Which mark comes next?`, answers: [following, third, mark], clue: 'The three marks repeat in order.'}),
    () => ({prompt: `A crate at the ${flavour.place} weighs ${n * 3} kilos. Its three bundles weigh the same. How heavy is one bundle?`, answers: [`${n} kg`, `${n + 2} kg`, `${n + 7} kg`], clue: `Divide ${n * 3} by three to get ${n}.`}),
    () => ({prompt: `The ${flavour.place} lock flashes ${n}, ${n + 3}, ${n + 6}, __. Pick the fourth number.`, answers: [String(n + 9), String(n + 8), String(n + 12)], clue: 'The lock counts up in threes.'}),
    () => ({prompt: `The ${flavour.place} has three doors. The key is behind neither ${third} nor ${mark}. Which door opens?`, answers: [following, mark, third], clue: 'Cross out the two marks ruled out by the clue.'}),
    () => ({prompt: `There are ${n + 4} crates at the ${flavour.place}. Two go out and three come back. How many are there now?`, answers: [String(n + 5), String(n + 3), String(n + 4)], clue: 'Three returned and two left, a net gain of one.'}),
  ];
  const puzzle = puzzles[seed % puzzles.length]();
  const correct = (round + Math.floor(session / 2)) % 3;
  const options = puzzle.answers.slice();
  options.splice(correct, 0, options.shift());
  return {prompt:puzzle.prompt, options, correct, clue:puzzle.clue};
}

function leaders(votes) {
  const max = Math.max(0, ...votes);
  return max ? votes.flatMap((v, i) => v === max ? [i] : []) : [];
}

class SeasonalRival {
  constructor({publish = () => {}, schedule = setTimeout, cancel = clearTimeout, now = Date.now, theme = () => null} = {}) {
    Object.assign(this, {publish, schedule, cancel, now, theme});
    this.phase = 'idle';
    this.session = 0;
    this.generation = 0;
    this.round = this.rounds = this.recovered = this.sack = this.deaths = 0;
    this.votes = [];
    this.voters = new Set();
    this.endsAt = this.timer = this.winner = this.finalIndex = null;
  }

  start({seconds = 20, rounds = 3, pacing = 'host'} = {}) {
    if (!['idle', 'completed'].includes(this.phase)) throw Error('A rival challenge is already running.');
    this.seconds = Number(seconds);
    const count = Number(rounds);
    if (!Number.isInteger(this.seconds) || this.seconds < 10 || this.seconds > 60) throw Error('Choose 10–60 seconds per vote.');
    if (!Number.isInteger(count) || count < 1 || count > 10) throw Error('Choose 1–10 challenges.');
    if (!['host', 'auto'].includes(pacing)) throw Error('Choose host or automatic pacing.');
    this.pacing = pacing;
    this.session++;
    this.rounds = this.sack = count;
    this.round = this.deaths = this.recovered = 0;
    this.winner = this.finalIndex = null;
    this.hostSettled = false;
    this.beginRound();
    return this.emit();
  }

  stop() {
    this.clearClock();
    this.phase = 'idle';
    this.winner = this.finalIndex = null;
    this.voters.clear();
    this.votes = [];
    this.round = this.rounds = this.recovered = this.sack = this.deaths = 0;
    return this.emit();
  }

  clearClock() {
    this.generation++;
    if (this.timer != null) this.cancel(this.timer);
    this.timer = this.endsAt = null;
  }

  enter(phase, seconds, choices) {
    this.clearClock();
    this.phase = phase;
    this.voters.clear();
    this.votes = Array(choices).fill(0);
    if (seconds == null) return;
    this.endsAt = this.now() + seconds * 1000;
    const token = this.generation;
    this.timer = this.schedule(() => {
      if (token !== this.generation) return;
      if (this.phase === 'reveal' && this.pacing === 'host') {
        this.enter('intermission', null, 0);
        this.emit();
      } else this.act('next');
    }, seconds * 1000);
    this.timer?.unref?.();
  }

  beginRound() {
    this.round++;
    this.outcome = '';
    this.enter('challenge', this.seconds, 3);
  }

  beginFinale() {
    this.winner = this.recovered > 0 && this.recovered >= this.sack ? 'chat' : 'rival';
    if (this.winner === 'rival') this.finalIndex = (this.session + this.deaths + this.sack) % 3;
    this.enter('finale', this.winner === 'chat' ? this.seconds : 5, this.winner === 'chat' ? 3 : 0);
  }

  act(action, {count = 1} = {}) {
    if (action === 'death' && ['challenge', 'reveal', 'intermission'].includes(this.phase)) {
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(this.deaths + count) || !Number.isSafeInteger(this.sack + count)) {
        throw Error('Death count must be a positive safe integer within the remaining score range.');
      }
      this.deaths += count;
      this.sack += count;
    } else if (action === 'next' && this.phase === 'challenge') {
      const top = leaders(this.votes);
      const {correct} = challenge(this.round, this.session, FLAVOURS.classic);
      const won = top.length === 1 && top[0] === correct;
      this.outcome = won ? 'recovered' : !top.length ? 'silent' : top.length > 1 ? 'tied' : 'missed';
      if (won) { this.sack--; this.recovered++; }
      const tally = this.votes;
      this.enter('reveal', this.pacing === 'host' && this.round === this.rounds ? null : 5, 0);
      this.votes = tally;
    } else if (['reveal','intermission'].includes(this.phase) && action === 'next') {
      if (this.round < this.rounds) this.beginRound();
      else this.beginFinale();
    } else if (action === 'finale' && this.pacing === 'host' && ['reveal','intermission'].includes(this.phase)) {
      this.beginFinale();
    } else if (action === 'next' && this.phase === 'finale') {
      if (this.winner === 'chat') {
        const top = leaders(this.votes);
        this.finalIndex = top.length === 1 ? top[0] : null;
        if (this.finalIndex === null) {
          this.enter('finalPick', null, 0);
          this.eligible = top.length ? top : [0, 1, 2];
          return this.emit();
        }
      }
      this.enter('completed', null, 0);
    } else if (this.phase === 'finalPick' && /^pick-[1-3]$/.test(action)) {
      const choice = Number(action.slice(-1)) - 1;
      if (!this.eligible.includes(choice)) throw Error('Choose one of the tied final challenges.');
      this.finalIndex = choice;
      this.hostSettled = true;
      this.enter('completed', null, 0);
    } else throw Error('That rival action is unavailable in this phase.');
    return this.emit();
  }

  chat(event) {
    const voting = this.phase === 'challenge' || (this.phase === 'finale' && this.winner === 'chat');
    if (!voting || !/^[1-3]$/.test(String(event?.text || '').trim())) return false;
    const identity = event.user?.id || event.user?.username;
    if (!identity || !event.platform) return false;
    if (this.now() >= this.endsAt) { this.act('next'); return true; }
    const key = JSON.stringify([event.platform, String(identity).toLowerCase()]);
    if (this.voters.has(key) || this.voters.size >= 10000) return true;
    this.voters.add(key);
    this.votes[Number(String(event.text).trim()) - 1]++;
    this.emit();
    return true;
  }

  emit() {
    const state = this.getState();
    this.publish(state);
    return state;
  }

  getState() {
    const requested = this.theme();
    const theme = Object.hasOwn(FLAVOURS, requested) ? requested : 'classic';
    const f = FLAVOURS[theme];
    const state = {phase:this.phase, theme, title:f.title, rivalName:f.rival, lootName:f.loot, stashName:f.stash,
      round:this.round, rounds:this.rounds, pacing:this.pacing || 'host', sack:this.sack, recovered:this.recovered, deaths:this.deaths,
      winner:this.winner, endsAt:this.endsAt, options:[], votes:[...this.votes], prompt:'', result:'', finalChallenge:'', actions:[]};
    const finale = this.winner === 'rival' ? f.rivalFinals : f.chatFinals;
    if (this.finalIndex != null) state.finalChallenge = finale[this.finalIndex];
    if (this.phase === 'challenge' || this.phase === 'reveal') {
      const q = challenge(this.round, this.session, f);
      state.options = q.options;
      if (this.phase === 'challenge') state.prompt = q.prompt;
      else {
        state.prompt = `Answer ${q.correct + 1}: ${q.options[q.correct]}.`;
        const lines = {recovered:'Chat recovered one!', silent:'No votes this round.', tied:'The vote was tied.', missed:'Chat picked another answer.'};
        state.result = `${lines[this.outcome]} ${q.clue}`;
      }
      state.actions = [{id:'death',label:`Record death (+1 to ${f.stash})`},{id:'next',label:this.phase === 'challenge' ? 'Reveal answer' : this.round === this.rounds ? 'Open finale' : 'Next challenge'}];
      if (this.phase === 'reveal' && this.pacing === 'host' && this.round < this.rounds) state.actions.push({id:'finale',label:'Go to finale'});
    } else if (this.phase === 'intermission') {
      state.prompt = `Between missions. The host can open the next challenge. Each in-game death adds one to the ${f.stash}.`;
      state.actions = [{id:'death',label:`Record death (+1 to ${f.stash})`},{id:'next',label:'Open next challenge'},{id:'finale',label:'Go to finale'}];
    } else if (this.phase === 'finale') {
      if (this.winner === 'chat') {
        state.prompt = 'Chat won! Vote 1–3 to choose the streamer’s final challenge.';
        state.options = [...finale];
      } else {
        state.prompt = `${f.rival} won and chose the streamer’s final challenge.`;
        state.result = state.finalChallenge;
      }
      state.actions = [{id:'next',label:this.winner === 'chat' ? 'Close final vote' : 'Show final challenge'}];
    } else if (this.phase === 'finalPick') {
      state.prompt = 'Chat won. The host can settle the final vote on chat’s behalf.';
      state.actions = this.eligible.map(i => ({id:`pick-${i + 1}`,label:finale[i]}));
    } else if (this.phase === 'completed') {
      state.prompt = this.winner === 'rival' ? `${f.rival} chose the final challenge.` : this.hostSettled ? 'The host settled chat’s final vote.' : 'Chat chose the final challenge.';
      state.result = state.finalChallenge;
    }
    return state;
  }
}

function rivalName(theme) {
  return (Object.hasOwn(FLAVOURS,theme)?FLAVOURS[theme]:FLAVOURS.classic).rival;
}
module.exports = {SeasonalRival,rivalName};
