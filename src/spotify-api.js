const { appConfig } = require('./app-config');
const { spotifyAuth } = require('./spotify-auth');
const { spotifyCleanOnly } = require('./runtime-settings');

const API_BASE = 'https://api.spotify.com/v1';

class SpotifyApiError extends Error {
  constructor(message, { code = 'spotify-error', retryAfter = null, status = null } = {}) {
    super(message);
    this.name = 'SpotifyApiError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.status = status;
  }
}

class SpotifyApiClient {
  constructor({ auth = spotifyAuth, fetchImpl = globalThis.fetch, config = appConfig, loadCleanOnly } = {}) {
    this.auth = auth;
    this.fetch = fetchImpl;
    this.config = config;
    this.loadCleanOnly = loadCleanOnly || (() => this.config.spotify.cleanOnly);
  }

  async request(path, options = {}, retried = false) {
    const { errorCodes = {}, ...requestOptions } = options;
    const accessToken = await this.auth.getAccessToken();
    let response;
    try {
      response = await this.fetch(`${API_BASE}${path}`, {
        ...requestOptions,
        headers: {
          Accept: 'application/json',
          ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...(requestOptions.headers || {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      throw new SpotifyApiError(`Spotify API is unreachable: ${safeMessage(error)}`, { code: 'unreachable' });
    }

    if (response.status === 401 && !retried) {
      await this.auth.refreshAfterUnauthorized();
      return this.request(path, options, true);
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || null;
      throw new SpotifyApiError('Spotify rate limit reached', {
        code: 'rate-limited',
        retryAfter,
        status: 429,
      });
    }

    const data = response.status === 204 ? null : await readJson(response);
    if (!response.ok) {
      const code = errorCodes[response.status]
        || (response.status === 403 ? 'playlist-forbidden' : 'spotify-error');
      throw new SpotifyApiError(`Spotify request failed (HTTP ${response.status})`, {
        code,
        status: response.status,
      });
    }
    return data;
  }

  async searchTrack(query) {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '10' });
    const data = await this.request(`/search?${params}`);
    const candidates = Array.isArray(data?.tracks?.items)
      ? data.tracks.items.filter((track) => track?.id && track?.uri)
      : [];
    const cleanOnly = this.loadCleanOnly();
    const track = cleanOnly
      ? candidates.find((candidate) => candidate.explicit === false)
      : candidates[0];

    if (!track && candidates.length && cleanOnly) {
      throw new SpotifyApiError('No non-explicit version was found', { code: 'clean-version-not-found' });
    }
    if (!track) return null;
    return {
      id: track.id,
      uri: track.uri,
      name: track.name || 'Unknown title',
      artists: Array.isArray(track.artists)
        ? track.artists.map((artist) => artist.name).filter(Boolean)
        : [],
      albumName: track.album?.name || '',
      albumArtUrl: Array.isArray(track.album?.images)
        ? track.album.images.find((image) => image?.url)?.url || ''
        : '',
      url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
      explicit: track.explicit === true,
    };
  }

  async addTrackToPlaylist(trackUri, playlistId = this.config.spotify.playlistId) {
    if (!playlistId) {
      throw new SpotifyApiError('The request playlist is not configured', { code: 'playlist-missing' });
    }
    return this.request(`/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: [trackUri] }),
    });
  }

  async removeTrackFromPlaylist(trackUri, playlistId = this.config.spotify.playlistId) {
    if (!playlistId) {
      throw new SpotifyApiError('The request playlist is not configured', { code: 'playlist-missing' });
    }
    if (!trackUri) {
      throw new SpotifyApiError('The song request has no Spotify track URI', { code: 'track-missing' });
    }
    return this.request(`/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ items: [{ uri: trackUri }] }),
    });
  }

  assertQueuePermission() {
    if (typeof this.auth.hasScope !== 'function') return;
    if (!this.auth.hasScope('user-read-playback-state') || !this.auth.hasScope('user-modify-playback-state')) {
      throw new SpotifyApiError('Spotify live queue permission has not been approved', {
        code: 'queue-permission-missing',
      });
    }
  }

  async getActivePlaybackDevice() {
    this.assertQueuePermission();
    const data = await this.request('/me/player/devices', {
      errorCodes: { 403: 'queue-forbidden' },
    });
    const device = Array.isArray(data?.devices)
      ? data.devices.find((candidate) => candidate?.is_active && !candidate?.is_restricted)
      : null;
    if (!device?.id) {
      throw new SpotifyApiError('No active Spotify playback device was found', {
        code: 'queue-no-active-device',
      });
    }
    return device;
  }

  async addTrackToQueue(trackUri, deviceId) {
    this.assertQueuePermission();
    const params = new URLSearchParams({ uri: trackUri });
    if (deviceId) params.set('device_id', deviceId);
    return this.request(`/me/player/queue?${params}`, {
      method: 'POST',
      errorCodes: {
        403: 'queue-forbidden',
        404: 'queue-no-active-device',
      },
    });
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeMessage(error) {
  return String(error?.message || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 160);
}

const spotifyApi = new SpotifyApiClient({ loadCleanOnly: spotifyCleanOnly });

module.exports = {
  SpotifyApiClient,
  SpotifyApiError,
  spotifyApi,
  API_BASE,
};
