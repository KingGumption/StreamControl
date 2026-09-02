const { appConfig } = require('./app-config');
const { getConfigValue, setConfigValue } = require('./db');

const ALLOW_EXPLICIT_KEY = 'spotify_allow_explicit_tracks';
const SONG_REQUESTS_ENABLED_KEY = 'song_requests_enabled';
const HILL_GAME_TIMINGS_KEY = 'hill_game_timings';
const HILL_GAME_ROUNDS_KEY = 'hill_game_rounds';
const DEFAULT_HILL_GAME_ROUNDS = 5;
const DEFAULT_HILL_GAME_TIMINGS = Object.freeze({
  topicSeconds: 30,
  roundSeconds: 30,
  championSeconds: 8,
});

function allowExplicitTracks() {
  const fallback = !appConfig.spotify.cleanOnly;
  const stored = getConfigValue(ALLOW_EXPLICIT_KEY, fallback);
  return typeof stored === 'boolean' ? stored : fallback;
}

function spotifyCleanOnly() {
  return !allowExplicitTracks();
}

function setAllowExplicitTracks(value) {
  if (typeof value !== 'boolean') {
    throw new TypeError('allowExplicitTracks must be a boolean');
  }
  setConfigValue(ALLOW_EXPLICIT_KEY, value);
  return value;
}

function songRequestsEnabled() {
  const stored = getConfigValue(SONG_REQUESTS_ENABLED_KEY, true);
  return typeof stored === 'boolean' ? stored : true;
}

function setSongRequestsEnabled(value) {
  if (typeof value !== 'boolean') {
    throw new TypeError('songRequestsEnabled must be a boolean');
  }
  setConfigValue(SONG_REQUESTS_ENABLED_KEY, value);
  return value;
}

function getHillGameTimings() {
  const stored = getConfigValue(HILL_GAME_TIMINGS_KEY, DEFAULT_HILL_GAME_TIMINGS);
  return {
    topicSeconds: validTiming(stored?.topicSeconds, 5, 300, DEFAULT_HILL_GAME_TIMINGS.topicSeconds),
    roundSeconds: validTiming(stored?.roundSeconds, 5, 300, DEFAULT_HILL_GAME_TIMINGS.roundSeconds),
    championSeconds: validTiming(stored?.championSeconds, 3, 60, DEFAULT_HILL_GAME_TIMINGS.championSeconds),
  };
}

function setHillGameTimings(value) {
  const timings = {
    topicSeconds: requiredTiming(value?.topicSeconds, 5, 300, 'topicSeconds'),
    roundSeconds: requiredTiming(value?.roundSeconds, 5, 300, 'roundSeconds'),
    championSeconds: requiredTiming(value?.championSeconds, 3, 60, 'championSeconds'),
  };
  setConfigValue(HILL_GAME_TIMINGS_KEY, timings);
  return timings;
}

function getHillGameRoundCount() {
  return validTiming(getConfigValue(HILL_GAME_ROUNDS_KEY, DEFAULT_HILL_GAME_ROUNDS), 1, 9, DEFAULT_HILL_GAME_ROUNDS);
}

function setHillGameRoundCount(value) {
  const roundCount = requiredTiming(value, 1, 9, 'roundCount');
  setConfigValue(HILL_GAME_ROUNDS_KEY, roundCount);
  return roundCount;
}

function setHillGameConfiguration(value) {
  const timings = {
    topicSeconds: requiredTiming(value?.topicSeconds, 5, 300, 'topicSeconds'),
    roundSeconds: requiredTiming(value?.roundSeconds, 5, 300, 'roundSeconds'),
    championSeconds: requiredTiming(value?.championSeconds, 3, 60, 'championSeconds'),
  };
  const roundCount = requiredTiming(value?.roundCount, 1, 9, 'roundCount');
  setConfigValue(HILL_GAME_TIMINGS_KEY, timings);
  setConfigValue(HILL_GAME_ROUNDS_KEY, roundCount);
  return { timings, roundCount };
}

function validTiming(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function requiredTiming(value, minimum, maximum, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${name} must be a whole number from ${minimum} to ${maximum}`);
  }
  return number;
}

function getRuntimeSettings() {
  return {
    allowExplicitTracks: allowExplicitTracks(),
    songRequestsEnabled: songRequestsEnabled(),
  };
}

module.exports = {
  ALLOW_EXPLICIT_KEY,
  SONG_REQUESTS_ENABLED_KEY,
  HILL_GAME_TIMINGS_KEY,
  HILL_GAME_ROUNDS_KEY,
  DEFAULT_HILL_GAME_TIMINGS,
  DEFAULT_HILL_GAME_ROUNDS,
  allowExplicitTracks,
  spotifyCleanOnly,
  setAllowExplicitTracks,
  songRequestsEnabled,
  setSongRequestsEnabled,
  getHillGameTimings,
  setHillGameTimings,
  getHillGameRoundCount,
  setHillGameRoundCount,
  setHillGameConfiguration,
  getRuntimeSettings,
};
