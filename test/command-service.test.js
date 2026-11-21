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
  const rows = [], times = new Map();
  return {
    rows,
    addSongRequest: (row) => rows.push(row),
    lastTrackQueueTime:id=>times.get(id) ?? null,
    markTrackQueued:(id,ms)=>times.set(id,ms),
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
      playlistHasTrack:async () => false,
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
      playlistHasTrack:async () => false,
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
      playlistHasTrack:async () => false,
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

test('track cooldown and ordinary command cooldown are independent', async () => {
  const requestHistory = history();
  requestHistory.markTrackQueued('track-1', 10000);
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
    cooldowns, now:()=>now, trackCooldownMinutes:()=>5,
  });

  assert.equal((await service.handleChatEvent(event('!song Song'))).status, 'duplicate');
  now += 500;
  assert.equal((await service.handleChatEvent(event('!song Other'))).status, 'cooldown');
});

function repeatFixture({queued=true,minutes=30}={}) {
  const store=history(), events=[], calls=[], playlist=new Set(['track-1']);
  const track={id:'track-1',uri:'spotify:track:track-1',name:'Song',artists:['Artist']};
  let clock=1_000_000, cooldown=minutes;
  const spotify={
    searchTrack:async()=>track, getActivePlaybackDevice:async()=>({id:'dev'}),
    playlistHasTrack:async()=>playlist.has(track.id),
    addTrackToPlaylist:async()=>{calls.push('playlist');playlist.add(track.id);},
    addTrackToQueue:async()=>{calls.push('queue');},
  };
  const service=new CommandService({config:loadAppConfig({SPOTIFY_QUEUE_ENABLED:String(queued)}), history:store,spotify,
    loadPermissions:()=>({}), areSongRequestsEnabled:()=>true, now:()=>clock,trackCooldownMinutes:()=>cooldown,
    cooldowns:{consume:()=>0}, notifications:{publishSongAdded:e=>events.push(e)}});
  const send=(platform='twitch')=>service.song({platform,user:{id:platform,username:platform,roles:[]}},'Song');
  return {events,calls,store,playlist,spotify,send,advance:ms=>clock+=ms,minutes:v=>cooldown=v};
}
test('requests a track already in Spotify without duplicating the playlist; queue cooldown is shared, adjustable and bounded',async()=>{
  const f=repeatFixture();
  assert.equal((await f.send()).status,'accepted'); assert.deepEqual(f.calls,['queue']);
  assert.equal(f.store.rows[0].playlistAdded,false);assert.equal(f.events[0].username,'twitch');
  f.advance(59_001);f.minutes(1);assert.match((await f.send('youtube')).response,/1s/);
  assert.deepEqual(f.calls,['queue']);assert.equal(f.events.length,1);
  f.advance(999);assert.equal((await f.send('youtube')).status,'accepted');assert.equal(f.events[1].username,'youtube');
  f.minutes(0);assert.equal((await f.send('tiktok')).status,'accepted');
});
test('overlapping platform requests reserve the Spotify track before any playlist/queue write',async()=>{
  const f=repeatFixture({minutes:0});let resume,started;
  const began=new Promise(resolve=>started=resolve);
  f.spotify.addTrackToQueue=async()=>{f.calls.push('queue');started();await new Promise(resolve=>resume=resolve);};
  const first=f.send();await began;assert.equal((await f.send('youtube')).status,'busy');
  assert.deepEqual(f.calls,['queue']);resume();assert.equal((await first).status,'accepted');assert.equal(f.events.length,1);
});
test('queue failure records playlist-only work but starts no cooldown and never reports a requested overlay',async()=>{
  const f=repeatFixture();f.playlist.clear();const succeed=f.spotify.addTrackToQueue;
  f.spotify.addTrackToQueue=async()=>{throw new Error('no queue')};
  assert.equal((await f.send()).status,'partial');assert.equal(f.store.rows[0].playlistAdded,true);
  assert.equal((await f.send('youtube')).status,'error');assert.equal(f.store.rows[1].playlistAdded,false);
  assert.equal(f.events.length,0);assert.equal(f.store.lastTrackQueueTime('track-1'),null);
  f.spotify.addTrackToQueue=succeed;assert.equal((await f.send()).status,'accepted');assert.deepEqual(f.calls,['playlist','queue']);assert.equal(f.events.length,1);
});
test('disabled queue preserves playlist-only writes and never starts track cooldown or queue alert',async()=>{
  const f=repeatFixture({queued:false});
  assert.match((await f.send()).response,/already on the playlist.*disabled/);f.playlist.clear();
  assert.equal((await f.send()).status,'accepted');assert.equal(f.events.length,0);
  assert.deepEqual(f.calls,['playlist']);assert.equal(f.store.lastTrackQueueTime('track-1'),null);
});
