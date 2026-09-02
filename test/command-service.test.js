const test = require('node:test');
const assert = require('node:assert/strict');

const { loadAppConfig } = require('../src/app-config');
const { CommandService, CooldownManager, parseCommand } = require('../src/command-service');

function event(text, roles = []) {
  return {
    platform: 'twitch',
    text,
    user: { id: 'u1', username: 'Requester', profileImageUrl: 'https://example.test/avatar.png', roles },
  };
}

function permissions(allowed = ['everyone']) {
  return {
    commands: {
      song: { twitch: allowed },
      playlist: { twitch: ['everyone'] },
      songlast: { twitch: ['everyone'] },
    },
    overrides: [],
  };
}

function history() {
  const rows = [];
  return {
    rows,
    addSongRequest: (row) => rows.push(row),
    hasAcceptedTrack: (id) => rows.some((row) => row.trackId === id && ['accepted', 'partial'].includes(row.status)),
    getLastAcceptedSongRequest: () => null,
  };
}

test('parses supported chat command syntax case-insensitively', () => {
  assert.deepEqual(parseCommand(' !SoNg  Song Artist '), { command: 'song', args: 'Song Artist' });
  assert.equal(parseCommand('hello'), null);
});

test('authorized song request searches, adds, records, and responds', async () => {
  const requestHistory = history();
  const calls = [];
  const notifications = [];
  const config = loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist', USER_COOLDOWN_SECONDS: '0', GLOBAL_COOLDOWN_SECONDS: '0' });
  const service = new CommandService({
    config,
    spotify: {
      searchTrack: async (query) => {
        calls.push(['search', query]);
        return { id: 'track-1', uri: 'spotify:track:track-1', name: 'Song', artists: ['Artist'], albumName: 'Album', albumArtUrl: 'https://i.scdn.co/image/art' };
      },
      getActivePlaybackDevice: async () => {
        calls.push(['device']);
        return { id: 'active-device' };
      },
      addTrackToPlaylist: async (uri) => calls.push(['add', uri]),
      addTrackToQueue: async (uri, deviceId) => calls.push(['queue', uri, deviceId]),
    },
    loadPermissions: () => permissions(),
    history: requestHistory,
    notifications: { publishSongAdded: (payload) => notifications.push(payload) },
  });

  const result = await service.handleChatEvent(event('!song Song Artist'));
  assert.equal(result.status, 'accepted');
  assert.match(result.response, /added “Song” by Artist/);
  assert.deepEqual(calls, [
    ['search', 'Song Artist'],
    ['device'],
    ['add', 'spotify:track:track-1'],
    ['queue', 'spotify:track:track-1', 'active-device'],
  ]);
  assert.equal(requestHistory.rows[0].status, 'accepted');
  assert.equal(requestHistory.rows[0].albumArtUrl, 'https://i.scdn.co/image/art');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].username, 'Requester');
  assert.equal(notifications[0].profileImageUrl, 'https://example.test/avatar.png');
});

test('does not modify the playlist when live queue permission or an active device is missing', async () => {
  const requestHistory = history();
  let playlistCalled = false;
  const missingPermission = Object.assign(new Error('Reconnect required'), { code: 'queue-permission-missing' });
  const service = new CommandService({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist', USER_COOLDOWN_SECONDS: '0', GLOBAL_COOLDOWN_SECONDS: '0' }),
    spotify: {
      searchTrack: async () => ({ id: 'track-1', uri: 'spotify:track:track-1', name: 'Song', artists: ['Artist'] }),
      getActivePlaybackDevice: async () => { throw missingPermission; },
      addTrackToPlaylist: async () => { playlistCalled = true; },
    },
    loadPermissions: () => permissions(),
    history: requestHistory,
  });

  const result = await service.handleChatEvent(event('!song Song'));
  assert.equal(result.status, 'error');
  assert.match(result.response, /reconnected/);
  assert.equal(playlistCalled, false);
});

test('records a partial result if Spotify loses the active device after the playlist update', async () => {
  const requestHistory = history();
  const queueError = Object.assign(new Error('Device disappeared'), { code: 'queue-no-active-device' });
  const service = new CommandService({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist', USER_COOLDOWN_SECONDS: '0', GLOBAL_COOLDOWN_SECONDS: '0' }),
    spotify: {
      searchTrack: async () => ({ id: 'track-1', uri: 'spotify:track:track-1', name: 'Song', artists: ['Artist'] }),
      getActivePlaybackDevice: async () => ({ id: 'active-device' }),
      addTrackToPlaylist: async () => {},
      addTrackToQueue: async () => { throw queueError; },
    },
    loadPermissions: () => permissions(),
    history: requestHistory,
  });

  const result = await service.handleChatEvent(event('!song Song'));
  assert.equal(result.status, 'partial');
  assert.equal(requestHistory.rows[0].errorCode, 'queue-no-active-device');
});

test('role denial happens before Spotify is called', async () => {
  let called = false;
  const service = new CommandService({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist' }),
    spotify: { searchTrack: async () => { called = true; } },
    loadPermissions: () => permissions(['moderator']),
    history: history(),
  });

  const result = await service.handleChatEvent(event('!song Song'));
  assert.equal(result.status, 'denied');
  assert.equal(called, false);
});

test('closed song requests reject !song before Spotify is called', async () => {
  let called = false;
  const service = new CommandService({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist' }),
    spotify: { searchTrack: async () => { called = true; } },
    loadPermissions: () => permissions(),
    history: history(),
    areSongRequestsEnabled: () => false,
  });

  const result = await service.handleChatEvent(event('!song Song'));
  assert.equal(result.status, 'closed');
  assert.match(result.response, /currently closed/);
  assert.equal(called, false);
});

test('duplicate requests and cooldowns are rejected', async () => {
  const requestHistory = history();
  requestHistory.rows.push({ trackId: 'track-1', status: 'accepted' });
  let now = 10_000;
  const cooldowns = new CooldownManager({ userSeconds: 5, globalSeconds: 1, now: () => now });
  const service = new CommandService({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist' }),
    spotify: {
      searchTrack: async () => ({ id: 'track-1', uri: 'spotify:track:track-1', name: 'Song', artists: ['Artist'] }),
      addTrackToPlaylist: async () => {},
    },
    loadPermissions: () => permissions(),
    history: requestHistory,
    cooldowns,
  });

  assert.equal((await service.handleChatEvent(event('!song Song'))).status, 'duplicate');
  now += 500;
  assert.equal((await service.handleChatEvent(event('!song Other'))).status, 'cooldown');
});
