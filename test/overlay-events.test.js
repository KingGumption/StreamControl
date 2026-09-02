const test = require('node:test');
const assert = require('node:assert/strict');

const { OverlayEvents, safeSpotifyImageUrl } = require('../src/overlay-events');

test('publishes safe song-added display data to subscribers', () => {
  const events = new OverlayEvents();
  const received = [];
  const unsubscribe = events.subscribe((payload) => received.push(payload));

  const payload = events.publishSongAdded({
    requestId: 42,
    platform: 'twitch',
    username: 'Requester',
    profileImageUrl: 'https://example.test/avatar.png',
    track: {
      name: 'Song',
      artists: ['Artist'],
      albumName: 'Album',
      albumArtUrl: 'https://i.scdn.co/image/art',
    },
  });
  unsubscribe();
  events.publishSongAdded({ username: 'Ignored', track: { name: 'Other' } });

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], payload);
  assert.equal(payload.track.albumArtUrl, 'https://i.scdn.co/image/art');
  assert.equal(payload.profileImageUrl, 'https://example.test/avatar.png');
});

test('rejects non-HTTPS album art URLs', () => {
  assert.equal(safeSpotifyImageUrl('http://example.com/art.jpg'), '');
  assert.equal(safeSpotifyImageUrl('javascript:alert(1)'), '');
  assert.equal(safeSpotifyImageUrl('not a url'), '');
});
