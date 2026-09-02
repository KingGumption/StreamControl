const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getHillGameTimings, getHillGameRoundCount } = require('./runtime-settings');
const { addEngagementEvent } = require('./db');

const HILL_ART_MANIFEST = loadArtworkManifest();

const TOTAL_ROUNDS = 5;
const MAX_ROUNDS = 9;

const TOPICS = [
  topic('monster', 'Best Monster Flavour', [
    ['original', 'Original', '⚡', '#171717', '#73bf44'],
    ['mango-loco', 'Mango Loco', '🥭', '#11678a', '#ffb52e'],
    ['pipeline-punch', 'Pipeline Punch', '🌺', '#f06b9b', '#65d4b0'],
    ['ultra-white', 'Ultra White', '❄️', '#e9eef2', '#7ad8e8'],
    ['pacific-punch', 'Pacific Punch', '🏴‍☠️', '#d6383d', '#f6bf46'],
    ['aussie-lemonade', 'Aussie Lemonade', '🍋', '#27a8a5', '#f6e14b'],
    ['khaotic', 'Khaotic', '🍊', '#e85a28', '#f5bf42'],
    ['monarch', 'Monarch', '🦋', '#ef7f4d', '#8a4bb3'],
    ['ultra-paradise', 'Ultra Paradise', '🍏', '#62a744', '#d7ee58'],
    ['nitro-super-dry', 'Nitro Super Dry', '🍋‍🟩', '#2a8c65', '#c6e64b'],
  ]),
  topic('mcu', 'Best MCU Character', [
    ['iron-man', 'Iron Man', '🤖', '#a51c30', '#ffc857'],
    ['captain-america', 'Captain America', '🛡️', '#174c8c', '#e43d47'],
    ['spider-man', 'Spider-Man', '🕷️', '#c51f35', '#2166a6'],
    ['thor', 'Thor', '⚡', '#334d82', '#d8dce9'],
    ['black-panther', 'Black Panther', '🐾', '#251642', '#9c68d7'],
    ['scarlet-witch', 'Scarlet Witch', '🔮', '#7f1534', '#f05a7e'],
    ['hulk', 'Hulk', '💚', '#3e7e3b', '#8d53a6'],
    ['doctor-strange', 'Doctor Strange', '🌀', '#9a2634', '#e8a944'],
    ['loki', 'Loki', '🐍', '#28543b', '#d1b24b'],
    ['star-lord', 'Star-Lord', '🚀', '#67384e', '#4ab1c5'],
  ]),
  topic('games', 'Best Video Game Franchise', [
    ['mario', 'Mario', '🍄', '#e53935', '#4aa3df'],
    ['zelda', 'The Legend of Zelda', '🗡️', '#287c54', '#e5bd45'],
    ['pokemon', 'Pokémon', '⚡', '#e8c62d', '#3672b9'],
    ['final-fantasy', 'Final Fantasy', '💎', '#385d8a', '#dde8f3'],
    ['halo', 'Halo', '🪖', '#47694c', '#e3b64b'],
    ['gta', 'Grand Theft Auto', '🚗', '#326e42', '#ecbd40'],
    ['sonic', 'Sonic the Hedgehog', '💨', '#1769c2', '#f0cc35'],
    ['resident-evil', 'Resident Evil', '🧟', '#47272b', '#bf363d'],
    ['call-of-duty', 'Call of Duty', '🎖️', '#46483c', '#b2a776'],
    ['minecraft', 'Minecraft', '⛏️', '#4d8b42', '#886a3f'],
  ]),
  topic('takeaway', 'Best Takeaway', [
    ['pizza', 'Pizza', '🍕', '#b53535', '#f6bf43'],
    ['curry', 'Curry', '🍛', '#a94824', '#f0b84d'],
    ['chinese', 'Chinese', '🥡', '#c83232', '#f4d26d'],
    ['fish-chips', 'Fish & Chips', '🐟', '#287eb0', '#e5c766'],
    ['burgers', 'Burgers', '🍔', '#9b3f2e', '#efc457'],
    ['kebab', 'Kebab', '🥙', '#6f3a27', '#79aa57'],
    ['fried-chicken', 'Fried Chicken', '🍗', '#a84e27', '#f2b94b'],
    ['sushi', 'Sushi', '🍣', '#d56667', '#334f4a'],
    ['thai', 'Thai', '🍜', '#b64c2d', '#e7c34b'],
    ['burritos', 'Burritos', '🌯', '#7a4a2f', '#76a74e'],
  ]),
  topic('superpower', 'Best Superpower', [
    ['flight', 'Flight', '🪽', '#3081c3', '#b9ecff'],
    ['invisibility', 'Invisibility', '👻', '#4a6275', '#d3f4ff'],
    ['teleportation', 'Teleportation', '🌀', '#693ab3', '#4de0d2'],
    ['strength', 'Super Strength', '💪', '#ad3f45', '#f2a55c'],
    ['time', 'Time Control', '⏳', '#835b1e', '#f4d35e'],
    ['mind-reading', 'Mind Reading', '🧠', '#8d3c8e', '#f08bbd'],
    ['shapeshifting', 'Shapeshifting', '🦎', '#397c64', '#a0d55d'],
    ['super-speed', 'Super Speed', '🏃', '#2968a4', '#f1d448'],
    ['healing', 'Healing', '❤️‍🩹', '#b73859', '#75d5aa'],
    ['elements', 'Element Control', '🌊', '#287fc1', '#f07a35'],
  ]),
  topic('console', 'Best Gaming Platform', [
    ['playstation', 'PlayStation', '🎮', '#174c9c', '#62b8ff'],
    ['xbox', 'Xbox', '🟢', '#197b30', '#7ed957'],
    ['switch', 'Nintendo Switch', '🕹️', '#e53645', '#45bad0'],
    ['pc', 'PC Gaming', '🖥️', '#3d4866', '#67e8f9'],
    ['sega', 'Sega Mega Drive', '💿', '#254da3', '#e8edf7'],
    ['game-boy', 'Game Boy', '👾', '#686b61', '#b7d34b'],
    ['steam-deck', 'Steam Deck', '⚙️', '#25394e', '#68c4d9'],
    ['arcade', 'Arcade', '🕹️', '#853d9d', '#ef4c98'],
    ['mobile', 'Mobile Gaming', '📱', '#36557c', '#62d4a8'],
    ['nintendo-64', 'Nintendo 64', '🎮', '#294990', '#e33d42'],
  ]),
  topic('snack', 'Best Cinema Snack', [
    ['popcorn', 'Popcorn', '🍿', '#bd3a38', '#ffd75e'],
    ['nachos', 'Nachos', '🧀', '#e07725', '#ffd044'],
    ['pick-mix', 'Pick & Mix', '🍬', '#c94386', '#74d3d1'],
    ['hot-dog', 'Hot Dog', '🌭', '#9e352f', '#e8b84a'],
    ['ice-cream', 'Ice Cream', '🍦', '#9163b6', '#ffb7d0'],
    ['chocolate', 'Chocolate', '🍫', '#55301f', '#d89452'],
    ['maltesers', 'Maltesers', '🔴', '#9c292b', '#e4b068'],
    ['fizzy-drink', 'Fizzy Drink', '🥤', '#a52c45', '#65bde0'],
    ['pretzel', 'Pretzel', '🥨', '#8a5229', '#ddb56a'],
    ['churros', 'Churros', '✨', '#9b5d2e', '#efc56a'],
  ]),
  topic('dessert', 'Best Dessert', [
    ['dessert-cheesecake', 'Cheesecake', '🍰', '#d6a96c', '#fff0c7'],
    ['dessert-chocolate-cake', 'Chocolate Cake', '🍫', '#4a2418', '#b86b3e'],
    ['dessert-apple-pie', 'Apple Pie', '🥧', '#a85d28', '#efc36e'],
    ['dessert-brownies', 'Brownies', '🟫', '#3a2118', '#8b4a2b'],
    ['dessert-doughnuts', 'Doughnuts', '🍩', '#d9668e', '#ffd06a'],
    ['dessert-waffles', 'Waffles', '🧇', '#c57a2c', '#f0c86d'],
    ['dessert-tiramisu', 'Tiramisu', '☕', '#6b3c25', '#dfbd8d'],
    ['dessert-sticky-toffee', 'Sticky Toffee Pudding', '🍮', '#7a3e1d', '#d9963e'],
    ['dessert-sundae', 'Ice Cream Sundae', '🍨', '#e26f95', '#86d8e8'],
    ['dessert-cookies', 'Cookies', '🍪', '#a96832', '#e6bd73'],
  ]),
  topic('animal', 'Best Animal', [
    ['animal-dog', 'Dog', '🐕', '#8a5b35', '#d9b17b'],
    ['animal-cat', 'Cat', '🐈', '#6b6578', '#c9b7a2'],
    ['animal-red-panda', 'Red Panda', '🐾', '#a94427', '#e5a24c'],
    ['animal-sea-otter', 'Sea Otter', '🦦', '#6d4b35', '#5bb6c8'],
    ['animal-penguin', 'Penguin', '🐧', '#222b35', '#dceaf0'],
    ['animal-elephant', 'Elephant', '🐘', '#66717a', '#b6c0c7'],
    ['animal-dolphin', 'Dolphin', '🐬', '#237fa5', '#7dd7e8'],
    ['animal-tiger', 'Tiger', '🐅', '#c96622', '#f1b34d'],
    ['animal-fox', 'Fox', '🦊', '#c65326', '#ef9a45'],
    ['animal-capybara', 'Capybara', '🦫', '#76533a', '#b99a68'],
  ]),
  topic('music', 'Best Music Genre', [
    ['music-rock', 'Rock', '🎸', '#8a2533', '#d94f45'],
    ['music-pop', 'Pop', '🎤', '#c13d91', '#5fc9e8'],
    ['music-hip-hop', 'Hip-Hop', '🎧', '#34284f', '#d7a83e'],
    ['music-electronic', 'Dance / Electronic', '🎛️', '#3c2f91', '#38d6c9'],
    ['music-metal', 'Metal', '🤘', '#1c1c22', '#7e858c'],
    ['music-rnb', 'R&B', '🎙️', '#73376f', '#db7fa8'],
    ['music-indie', 'Indie', '🎶', '#47705d', '#dfb965'],
    ['music-country', 'Country', '🤠', '#8a542d', '#deb665'],
    ['music-jazz', 'Jazz', '🎷', '#263f70', '#d9a93f'],
    ['music-classical', 'Classical', '🎻', '#65435e', '#d8c2a1'],
  ]),
  topic('holiday', 'Best Type of Holiday', [
    ['holiday-beach', 'Beach Holiday', '🏖️', '#1e91b6', '#f2d17a'],
    ['holiday-city', 'City Break', '🏙️', '#465d78', '#e18a52'],
    ['holiday-mountains', 'Mountain Retreat', '🏔️', '#456f72', '#b9d6d2'],
    ['holiday-road-trip', 'Road Trip', '🚗', '#316ba3', '#e5b74a'],
    ['holiday-cruise', 'Cruise', '🛳️', '#2678a7', '#e6eff4'],
    ['holiday-theme-park', 'Theme Park', '🎢', '#9a3f91', '#f1c84c'],
    ['holiday-camping', 'Camping', '🏕️', '#3f7042', '#ce9a45'],
    ['holiday-skiing', 'Ski Holiday', '⛷️', '#4c83ad', '#e7f3fa'],
    ['holiday-safari', 'Safari', '🦁', '#a56b27', '#dfc46a'],
    ['holiday-countryside', 'Countryside Escape', '🌳', '#3d7b45', '#a9cf68'],
  ]),
  topic('transport', 'Best Way to Travel', [
    ['transport-sports-car', 'Sports Car', '🏎️', '#b52d34', '#ec6a46'],
    ['transport-motorcycle', 'Motorcycle', '🏍️', '#31343b', '#b9bec6'],
    ['transport-train', 'Train', '🚆', '#315a89', '#d9bb4c'],
    ['transport-aeroplane', 'Aeroplane', '✈️', '#3d83b7', '#d9eef8'],
    ['transport-speedboat', 'Speedboat', '🚤', '#1e789e', '#f1f1e7'],
    ['transport-bicycle', 'Bicycle', '🚲', '#39815c', '#e5c74d'],
    ['transport-helicopter', 'Helicopter', '🚁', '#58616b', '#d99a39'],
    ['transport-campervan', 'Campervan', '🚐', '#b26037', '#e5cf9c'],
    ['transport-skateboard', 'Skateboard', '🛹', '#6f3f92', '#e85d77'],
    ['transport-balloon', 'Hot-Air Balloon', '🎈', '#d44747', '#67b8d8'],
  ]),
  topic('breakfast', 'Best Breakfast', [
    ['breakfast-full-english', 'Full English', '🍳', '#8d4128', '#e9b84d'],
    ['breakfast-pancakes', 'Pancakes', '🥞', '#bc742d', '#edcf78'],
    ['breakfast-waffles', 'Waffles', '🧇', '#b26d2d', '#e8c46d'],
    ['breakfast-cereal', 'Cereal', '🥣', '#5275a6', '#e6bf4e'],
    ['breakfast-toast', 'Toast', '🍞', '#a8642f', '#e6bd75'],
    ['breakfast-eggs-benedict', 'Eggs Benedict', '🥚', '#d49131', '#f3dd8e'],
    ['breakfast-croissant', 'Croissant', '🥐', '#c77c2e', '#f0c665'],
    ['breakfast-bacon-sandwich', 'Bacon Sandwich', '🥓', '#9c3c32', '#e2ad63'],
    ['breakfast-porridge', 'Porridge', '🥣', '#9c8263', '#dac9aa'],
    ['breakfast-avocado-toast', 'Avocado Toast', '🥑', '#4f843c', '#d4b96e'],
  ]),
  topic('creature', 'Best Fantasy Creature', [
    ['creature-dragon', 'Dragon', '🐉', '#8b2e2e', '#e17a39'],
    ['creature-vampire', 'Vampire', '🧛', '#4b1c31', '#a92f45'],
    ['creature-werewolf', 'Werewolf', '🐺', '#4d5360', '#9da4ae'],
    ['creature-zombie', 'Zombie', '🧟', '#4c6e3d', '#9fb868'],
    ['creature-ghost', 'Ghost', '👻', '#65758b', '#dbeaf3'],
    ['creature-alien', 'Alien', '👽', '#477d4b', '#9fd36f'],
    ['creature-mermaid', 'Mermaid', '🧜', '#297f91', '#6fd4c5'],
    ['creature-unicorn', 'Unicorn', '🦄', '#9c4fa4', '#ef9fce'],
    ['creature-witch', 'Witch', '🧙', '#4f3475', '#a978c4'],
    ['creature-robot', 'Robot', '🤖', '#4b6373', '#a8ccd5'],
  ]),
  topic('sport', 'Best Sport to Watch', [
    ['sport-football', 'Football', '⚽', '#277044', '#e7e9e3'],
    ['sport-rugby', 'Rugby', '🏉', '#6f4b29', '#d4ad61'],
    ['sport-cricket', 'Cricket', '🏏', '#477847', '#d8e1c9'],
    ['sport-tennis', 'Tennis', '🎾', '#6f9c35', '#d9ea52'],
    ['sport-formula-one', 'Formula One', '🏎️', '#a72f35', '#30343a'],
    ['sport-boxing', 'Boxing', '🥊', '#a13335', '#df7c56'],
    ['sport-darts', 'Darts', '🎯', '#287250', '#dd4a43'],
    ['sport-snooker', 'Snooker', '🎱', '#2f754d', '#913c48'],
    ['sport-basketball', 'Basketball', '🏀', '#bc632d', '#e7a446'],
    ['sport-golf', 'Golf', '⛳', '#3f8144', '#dce6d2'],
  ]),
  topic('landmark', 'Best World Landmark', [
    ['landmark-eiffel-tower', 'Eiffel Tower', '🗼', '#4b6c8f', '#d6a45f'],
    ['landmark-statue-liberty', 'Statue of Liberty', '🗽', '#4e8a82', '#c9d7c6'],
    ['landmark-great-wall', 'Great Wall of China', '🧱', '#8c5b39', '#caa66a'],
    ['landmark-pyramids', 'Pyramids of Giza', '🔺', '#ae7b38', '#e1c06f'],
    ['landmark-colosseum', 'The Colosseum', '🏛️', '#896846', '#ceb98e'],
    ['landmark-taj-mahal', 'Taj Mahal', '🕌', '#557d98', '#e7e3d5'],
    ['landmark-big-ben', 'Big Ben', '🕰️', '#705532', '#d1aa58'],
    ['landmark-sydney-opera', 'Sydney Opera House', '🎭', '#327ba1', '#e7ecec'],
    ['landmark-machu-picchu', 'Machu Picchu', '⛰️', '#507044', '#a9aa70'],
    ['landmark-mount-fuji', 'Mount Fuji', '🗻', '#506f91', '#e8d6d7'],
  ]),
  topic('crisps', 'Best Crisp Flavour', [
    ['crisps-salt-vinegar', 'Salt & Vinegar', '🧂', '#2f78a8', '#dcebf3'],
    ['crisps-cheese-onion', 'Cheese & Onion', '🧀', '#3f7d45', '#e0c44e'],
    ['crisps-ready-salted', 'Ready Salted', '🥔', '#b73738', '#edb66a'],
    ['crisps-prawn-cocktail', 'Prawn Cocktail', '🦐', '#d05b83', '#f1b2c5'],
    ['crisps-smoky-bacon', 'Smoky Bacon', '🥓', '#8b3a2f', '#d3815e'],
    ['crisps-roast-chicken', 'Roast Chicken', '🍗', '#b27627', '#e5c45e'],
    ['crisps-worcester-sauce', 'Worcester Sauce', '🍶', '#633f72', '#b88dc3'],
    ['crisps-pickled-onion', 'Pickled Onion', '🧅', '#773c84', '#d5a6df'],
    ['crisps-barbecue', 'Barbecue', '🔥', '#8f3027', '#df713b'],
    ['crisps-sour-cream', 'Sour Cream & Onion', '🌿', '#3c7f64', '#d4e1bb'],
  ]),
];

class HillGame {
  constructor({
    topics = TOPICS,
    topicDurationMs = 30000,
    roundDurationMs = 30000,
    championDurationMs = 8000,
    roundCount = TOTAL_ROUNDS,
    random = Math.random,
    now = () => Date.now(),
    schedule = setTimeout,
    cancel = clearTimeout,
    recordEvent = null,
  } = {}) {
    this.topics = topics;
    this.topicDurationMs = topicDurationMs;
    this.roundDurationMs = roundDurationMs;
    this.championDurationMs = championDurationMs;
    this.configuredRoundCount = validRoundCount(roundCount);
    this.activeRoundCount = this.configuredRoundCount;
    this.random = random;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.recordEvent = recordEvent;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.timer = null;
    this.sequence = 0;
    this.running = false;
    this.phase = 'idle';
    this.options = [];
    this.voters = new Set();
    this.counts = [0, 0];
    this.platformCounts = [{}, {}];
    this.round = 0;
    this.topic = null;
    this.entrants = [];
    this.king = null;
    this.endsAt = null;
    this.gameId = '';
    this.gameStartedAt = null;
  }

  start() {
    if (this.running) return this.getState();
    this.running = true;
    this.beginGame();
    return this.getState();
  }

  stop() {
    if (this.running) {
      this.track('game_stopped', {
        phase: this.phase,
        round: this.round,
        topic: compactOption(this.topic),
      });
    }
    this.clearTimer();
    this.running = false;
    this.phase = 'idle';
    this.options = [];
    this.voters.clear();
    this.counts = [0, 0];
    this.platformCounts = [{}, {}];
    this.round = 0;
    this.topic = null;
    this.king = null;
    this.endsAt = null;
    this.gameId = '';
    this.gameStartedAt = null;
    return this.publish();
  }

  setTimings({ topicSeconds, roundSeconds, championSeconds }) {
    this.topicDurationMs = timingMilliseconds(topicSeconds, 5, 300, 'topicSeconds');
    this.roundDurationMs = timingMilliseconds(roundSeconds, 5, 300, 'roundSeconds');
    this.championDurationMs = timingMilliseconds(championSeconds, 3, 60, 'championSeconds');
    return this.publish();
  }

  setRoundCount(value) {
    this.configuredRoundCount = validRoundCount(value);
    if (!this.running || ['idle', 'topic'].includes(this.phase)) {
      this.activeRoundCount = this.configuredRoundCount;
    }
    return this.publish();
  }

  handleChatEvent(event) {
    if (!this.running || !['topic', 'battle'].includes(this.phase)) return false;
    const match = String(event?.text || '').trim().match(/^([12])$/);
    if (!match) return false;
    const platform = String(event?.platform || '').trim().toLowerCase();
    const username = String(event?.user?.username || '').trim().toLowerCase();
    const identity = String(event?.user?.id || username).trim();
    if (!platform || !identity) return false;
    const voterKey = `${platform}:${identity}`;
    if (this.voters.has(voterKey)) return true;
    this.voters.add(voterKey);
    const optionIndex = Number(match[1]) - 1;
    this.counts[optionIndex] += 1;
    this.platformCounts[optionIndex][platform] = (this.platformCounts[optionIndex][platform] || 0) + 1;
    this.track('vote', {
      phase: this.phase,
      round: this.round,
      topic: compactOption(this.topic),
      option: compactOption(this.options[optionIndex]),
      optionNumber: optionIndex + 1,
    }, event);
    this.publish();
    return true;
  }

  finishPhase() {
    if (!this.running) return this.getState();
    if (this.phase === 'topic') {
      const winner = this.options[this.winningIndex()];
      this.trackPhaseCompleted(winner);
      this.beginBattle(this.topics.find((entry) => entry.id === winner.id));
    } else if (this.phase === 'battle') {
      this.king = this.options[this.winningIndex()];
      this.trackPhaseCompleted(this.king);
      if (this.round >= this.activeRoundCount) {
        this.track('game_completed', {
          topic: compactOption(this.topic),
          champion: compactOption(this.king),
          rounds: this.activeRoundCount,
          durationMs: this.gameStartedAt ? Math.max(0, this.now() - this.gameStartedAt) : null,
        });
        this.beginChampion();
      }
      else this.beginRound(this.round + 1, this.king, this.entrants[this.round + 1]);
    } else if (this.phase === 'champion') {
      this.beginGame();
    }
    return this.getState();
  }

  beginGame() {
    this.gameId = crypto.randomUUID();
    this.gameStartedAt = this.now();
    this.track('game_started', { rounds: this.configuredRoundCount });
    this.beginTopicVote();
  }

  trackPhaseCompleted(winner) {
    this.track('phase_completed', {
      phase: this.phase,
      round: this.round,
      topic: compactOption(this.topic),
      winner: compactOption(winner),
      totalVotes: this.counts[0] + this.counts[1],
      options: this.options.map((option, index) => ({
        ...compactOption(option),
        votes: this.counts[index] || 0,
        platformVotes: { ...(this.platformCounts[index] || {}) },
      })),
    });
  }

  track(eventType, metadata, event = null) {
    if (!this.recordEvent) return;
    try {
      this.recordEvent({
        tool: 'king_of_the_hill',
        eventType,
        platform: event?.platform,
        userId: event?.user?.id,
        username: event?.user?.username,
        roles: event?.user?.roles,
        correlationId: this.gameId,
        metadata,
      });
    } catch (error) {
      console.warn('[Analytics] Could not record King of the Hill event:', error.message);
    }
  }

  beginTopicVote() {
    const choices = sample(this.topics, 2, this.random);
    this.topic = null;
    this.king = null;
    this.entrants = [];
    this.beginPhase('topic', choices, this.topicDurationMs);
  }

  beginBattle(selectedTopic) {
    this.topic = selectedTopic;
    this.activeRoundCount = this.configuredRoundCount;
    this.entrants = sample(selectedTopic.entries, this.activeRoundCount + 1, this.random);
    this.king = this.entrants[0];
    this.beginRound(1, this.king, this.entrants[1]);
  }

  beginRound(round, king, challenger) {
    this.round = round;
    this.beginPhase('battle', [king, challenger], this.roundDurationMs);
  }

  beginChampion() {
    this.clearTimer();
    this.phase = 'champion';
    this.options = [this.king];
    this.voters.clear();
    this.counts = [0, 0];
    this.platformCounts = [{}, {}];
    this.endsAt = this.now() + this.championDurationMs;
    this.publish();
    this.armTimer(this.championDurationMs);
  }

  beginPhase(phase, options, durationMs) {
    this.clearTimer();
    this.phase = phase;
    this.options = options;
    this.voters.clear();
    this.counts = [0, 0];
    this.platformCounts = [{}, {}];
    this.endsAt = this.now() + durationMs;
    this.publish();
    this.armTimer(durationMs);
  }

  armTimer(durationMs) {
    const phaseSequence = ++this.sequence;
    this.timer = this.schedule(() => {
      if (phaseSequence === this.sequence) this.finishPhase();
    }, durationMs);
    if (typeof this.timer?.unref === 'function') this.timer.unref();
  }

  clearTimer() {
    this.sequence += 1;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
  }

  winningIndex() {
    if (this.counts[0] === this.counts[1]) return this.random() < 0.5 ? 0 : 1;
    return this.counts[0] > this.counts[1] ? 0 : 1;
  }

  getState() {
    const totalVotes = this.counts[0] + this.counts[1];
    return {
      running: this.running,
      phase: this.phase,
      round: this.round,
      totalRounds: ['battle', 'champion'].includes(this.phase) ? this.activeRoundCount : this.configuredRoundCount,
      roundCount: this.configuredRoundCount,
      endsAt: this.endsAt ? new Date(this.endsAt).toISOString() : null,
      totalVotes,
      timings: {
        topicSeconds: this.topicDurationMs / 1000,
        roundSeconds: this.roundDurationMs / 1000,
        championSeconds: this.championDurationMs / 1000,
      },
      topic: this.topic ? { id: this.topic.id, title: this.topic.title } : null,
      options: this.options.map((option, index) => ({
        id: option.id,
        number: index + 1,
        title: option.title,
        icon: option.icon,
        colors: option.colors,
        imageUrl: artworkUrl(this.phase === 'topic' ? 'topics' : this.topic?.id || 'topics', option.id),
        votes: this.counts[index] || 0,
        platformVotes: { ...(this.platformCounts[index] || {}) },
        percent: totalVotes ? Math.round(((this.counts[index] || 0) / totalVotes) * 100) : 0,
        isKing: this.phase === 'battle' && index === 0,
      })),
    };
  }

  publish() {
    const state = this.getState();
    this.emitter.emit('state', state);
    return state;
  }

  subscribe(listener) {
    this.emitter.on('state', listener);
    return () => this.emitter.off('state', listener);
  }

  artwork(groupId, entryId) {
    let item;
    if (groupId === 'topics') {
      const selected = this.topics.find((entry) => entry.id === entryId);
      item = selected && { title: selected.title.replace(/^Best /, ''), icon: selected.icon, colors: selected.colors };
    } else {
      item = this.topics.find((entry) => entry.id === groupId)?.entries.find((entry) => entry.id === entryId);
    }
    return item ? artworkSvg(item) : null;
  }
}

function topic(id, title, entries) {
  const normalizedEntries = entries.map(([entryId, entryTitle, icon, colorA, colorB]) => ({
    id: entryId,
    title: entryTitle,
    icon,
    colors: [colorA, colorB],
  }));
  return {
    id,
    title,
    icon: normalizedEntries[0].icon,
    colors: normalizedEntries[0].colors,
    entries: normalizedEntries,
  };
}

function sample(values, count, random) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy.slice(0, count);
}

function artworkSvg(item) {
  const title = escapeXml(item.title);
  const icon = escapeXml(item.icon);
  const [colorA, colorB] = item.colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colorA}"/><stop offset="1" stop-color="${colorB}"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-opacity=".35"/></filter></defs>
  <rect width="640" height="420" rx="42" fill="url(#g)"/>
  <circle cx="520" cy="70" r="150" fill="#fff" opacity=".1"/><circle cx="100" cy="390" r="190" fill="#000" opacity=".12"/>
  <text x="320" y="220" text-anchor="middle" font-size="150" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif" filter="url(#s)">${icon}</text>
  <text x="320" y="350" text-anchor="middle" fill="white" stroke="#000" stroke-opacity=".35" stroke-width="8" paint-order="stroke" font-size="42" font-weight="800" font-family="Arial, sans-serif">${title}</text>
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]));
}

function loadArtworkManifest() {
  try {
    const manifestPath = path.join(__dirname, '..', 'public', 'hill-art-official', 'manifest.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { assets: {} };
  }
}

function artworkUrl(groupId, entryId) {
  const file = HILL_ART_MANIFEST.assets?.[`${groupId}/${entryId}`]?.file;
  if (file && !file.includes('..')) {
    return `/assets/hill-art-official/${file.split('/').map(encodeURIComponent).join('/')}`;
  }
  return `/king-of-the-hill/art/${encodeURIComponent(groupId)}/${encodeURIComponent(entryId)}.svg`;
}

function timingMilliseconds(value, minimum, maximum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${name} must be a whole number from ${minimum} to ${maximum}`);
  }
  return number * 1000;
}

function validRoundCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_ROUNDS) {
    throw new RangeError(`roundCount must be a whole number from 1 to ${MAX_ROUNDS}`);
  }
  return number;
}

const savedTimings = getHillGameTimings();
const hillGame = new HillGame({
  topicDurationMs: savedTimings.topicSeconds * 1000,
  roundDurationMs: savedTimings.roundSeconds * 1000,
  championDurationMs: savedTimings.championSeconds * 1000,
  roundCount: getHillGameRoundCount(),
  recordEvent: addEngagementEvent,
});

function compactOption(option) {
  return option ? { id: option.id, title: option.title } : null;
}

module.exports = { HillGame, TOPICS, TOTAL_ROUNDS, MAX_ROUNDS, hillGame };
