const test = require('node:test');
const assert = require('node:assert/strict');

const { loadAppConfig } = require('../src/app-config');
const { SpotifyApiClient, API_BASE } = require('../src/spotify-api');

function response(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('searches for one track and maps safe display fields', async () => {
  const requests = [];
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response({ tracks: { items: [{
        id: 'track-id',
        uri: 'spotify:track:track-id',
        explicit: false,
        name: 'Track',
        artists: [{ name: 'Artist' }],
        album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/album-art' }] },
        external_urls: { spotify: 'https://open.spotify.com/track/track-id' },
      }] } });
    },
  });

  const track = await client.searchTrack('Track Artist');
  assert.equal(track.id, 'track-id');
  assert.deepEqual(track.artists, ['Artist']);
  assert.equal(track.albumArtUrl, 'https://i.scdn.co/image/album-art');
  assert.match(requests[0].url, new RegExp(`^${API_BASE}/search\\?`));
  assert.match(requests[0].url, /limit=10/);
});

test('selects a non-explicit result instead of an explicit first result', async () => {
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    fetchImpl: async () => response({ tracks: { items: [
      { id: 'explicit-id', uri: 'spotify:track:explicit-id', name: 'Song', explicit: true },
      { id: 'clean-id', uri: 'spotify:track:clean-id', name: 'Song', explicit: false },
    ] } }),
  });

  const track = await client.searchTrack('Song Artist');
  assert.equal(track.id, 'clean-id');
  assert.equal(track.explicit, false);
});

test('applies explicit-track setting changes to the next search', async () => {
  let cleanOnly = true;
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    loadCleanOnly: () => cleanOnly,
    fetchImpl: async () => response({ tracks: { items: [
      { id: 'explicit-id', uri: 'spotify:track:explicit-id', name: 'Song', explicit: true },
      { id: 'clean-id', uri: 'spotify:track:clean-id', name: 'Song', explicit: false },
    ] } }),
  });

  assert.equal((await client.searchTrack('Song Artist')).id, 'clean-id');
  cleanOnly = false;
  assert.equal((await client.searchTrack('Song Artist')).id, 'explicit-id');
});

test('rejects a search when Spotify only returns explicit results', async () => {
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    fetchImpl: async () => response({ tracks: { items: [
      { id: 'explicit-id', uri: 'spotify:track:explicit-id', name: 'Song', explicit: true },
    ] } }),
  });

  await assert.rejects(
    () => client.searchTrack('Song Artist'),
    { code: 'clean-version-not-found' },
  );
});

test('adds a track using Spotify current playlist items endpoint', async () => {
  const requests = [];
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response({ snapshot_id: 'snapshot' }, 201);
    },
  });

  await client.addTrackToPlaylist('spotify:track:track-id');
  assert.equal(requests[0].url, `${API_BASE}/playlists/playlist-id/items`);
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), { uris: ['spotify:track:track-id'] });
});

test('removes a track using Spotify current playlist items endpoint', async () => {
  const requests = [];
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response({ snapshot_id: 'updated-snapshot' });
    },
  });

  await client.removeTrackFromPlaylist('spotify:track:track-id');
  assert.equal(requests[0].url, `${API_BASE}/playlists/playlist-id/items`);
  assert.equal(requests[0].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    items: [{ uri: 'spotify:track:track-id' }],
  });
});

test('finds the active device and adds a track to its playback queue', async () => {
  const requests = [];
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: {
      getAccessToken: async () => 'token',
      hasScope: () => true,
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/me/player/devices')) {
        return response({ devices: [
          { id: 'inactive', is_active: false, is_restricted: false },
          { id: 'active-device', is_active: true, is_restricted: false },
        ] });
      }
      return response(null, 204);
    },
  });

  const device = await client.getActivePlaybackDevice();
  await client.addTrackToQueue('spotify:track:track-id', device.id);

  assert.equal(device.id, 'active-device');
  assert.match(requests[1].url, new RegExp(`^${API_BASE}/me/player/queue\\?`));
  const queueUrl = new URL(requests[1].url);
  assert.equal(queueUrl.searchParams.get('uri'), 'spotify:track:track-id');
  assert.equal(queueUrl.searchParams.get('device_id'), 'active-device');
  assert.equal(requests[1].options.method, 'POST');
});

test('requires new queue scopes and an active unrestricted device', async () => {
  const missingPermission = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token', hasScope: () => false },
    fetchImpl: async () => { throw new Error('must not fetch'); },
  });
  await assert.rejects(
    () => missingPermission.getActivePlaybackDevice(),
    { code: 'queue-permission-missing' },
  );

  const noDevice = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: { getAccessToken: async () => 'token', hasScope: () => true },
    fetchImpl: async () => response({ devices: [] }),
  });
  await assert.rejects(
    () => noDevice.getActivePlaybackDevice(),
    { code: 'queue-no-active-device' },
  );
});

test('refreshes once and retries after an unauthorized response', async () => {
  let fetchCount = 0;
  let refreshCount = 0;
  const client = new SpotifyApiClient({
    config: loadAppConfig({ SPOTIFY_PLAYLIST_ID: 'playlist-id' }),
    auth: {
      getAccessToken: async () => 'token',
      refreshAfterUnauthorized: async () => { refreshCount += 1; },
    },
    fetchImpl: async () => {
      fetchCount += 1;
      return fetchCount === 1 ? response({}, 401) : response({ tracks: { items: [] } });
    },
  });

  assert.equal(await client.searchTrack('missing'), null);
  assert.equal(refreshCount, 1);
  assert.equal(fetchCount, 2);
});
