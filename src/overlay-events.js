const { EventEmitter } = require('node:events');

class OverlayEvents {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  publishSongAdded({ requestId, platform, username, profileImageUrl, track, status = 'accepted' }) {
    const payload = {
      requestId: Number(requestId) || null,
      platform: String(platform || '').slice(0, 30),
      username: String(username || 'Someone').slice(0, 80),
      profileImageUrl: safeHttpsImageUrl(profileImageUrl),
      status,
      track: {
        name: String(track?.name || 'Unknown song').slice(0, 200),
        artists: Array.isArray(track?.artists)
          ? track.artists.map((artist) => String(artist)).filter(Boolean).slice(0, 8)
          : [],
        albumName: String(track?.albumName || '').slice(0, 200),
        albumArtUrl: safeHttpsImageUrl(track?.albumArtUrl),
      },
      timestamp: new Date().toISOString(),
    };
    this.emitter.emit('song-added', payload);
    return payload;
  }

  subscribe(listener) {
    this.emitter.on('song-added', listener);
    return () => this.emitter.off('song-added', listener);
  }
}

function safeHttpsImageUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

const overlayEvents = new OverlayEvents();

const safeSpotifyImageUrl = safeHttpsImageUrl;

module.exports = { OverlayEvents, overlayEvents, safeHttpsImageUrl, safeSpotifyImageUrl };
