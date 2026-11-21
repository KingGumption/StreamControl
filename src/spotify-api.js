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
        signal: AbortSignal.timeout(10000),
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

  // Read the real request playlist: history cannot see manual additions or removals.
  async playlistHasTrack(track, playlistId = this.config.spotify.playlistId) {
    if (!playlistId) throw new SpotifyApiError('The request playlist is not configured', {code:'playlist-missing'});
    const base = '/playlists/' + encodeURIComponent(playlistId) + '/items';
    for (let offset = 0; ; ) {
      const page = await this.request(base + '?limit=50&offset=' + offset, {errorCodes:{403:'playlist-read-forbidden',404:'playlist-read-forbidden'}});
      if (!Array.isArray(page?.items)) throw new SpotifyApiError('Invalid playlist response', {code:'playlist-read-failed'});
      if (page.items.some(entry => {
        const item = entry?.item ?? entry?.track;
        return item && (item.id === track.id || item.uri === track.uri || item.linked_from?.id === track.id);
      })) return true;
      if (!page.next) return false;
      if (!page.items.length) throw new SpotifyApiError('Empty playlist page', {code:'playlist-read-failed'});
      offset += page.items.length;
    }
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

  async getPlaybackState() {
    if (typeof this.auth.hasScope === 'function' && !this.auth.hasScope('user-read-playback-state')) {
      throw new SpotifyApiError('Spotify playback permission has not been approved', { code: 'queue-permission-missing' });
    }
    return this.request('/me/player', { errorCodes: { 403: 'queue-forbidden' } });
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

  async randomPlaylistTrack(){
    this.assertQueuePermission();
    const id=this.config.spotify.playlistId;
    if(!id)throw new SpotifyApiError('Configure the stream playlist first.',{code:'playlist-missing'});
    const clean=this.loadCleanOnly();
    let chosen=null,count=0,offset=0;
    for(;;){
      const page=await this.request('/playlists/'+encodeURIComponent(id)+'/items?limit=50&offset='+offset);
      if(!Array.isArray(page?.items)||(!page.items.length && page.next))throw new SpotifyApiError('Invalid playlist response');
      for(const entry of page.items){
        const track=entry?.item??entry?.track;
        if(track?.type!=='track'||!track.uri?.startsWith('spotify:track:')||entry.is_local||track.is_local||track.is_playable===false||track.restrictions?.reason||(clean&&track.explicit!==false))continue;
        if(Math.random()*++count<1)chosen={uri:track.uri,name:track.name||'Playlist track'};
      }
      if(!page.next)break;
      offset+=page.items.length;
    }
    if(!chosen)throw new SpotifyApiError('The stream playlist has no playable tracks matching the current settings.',{code:'playlist-empty'});
    return chosen;
  }

  async playStreamTrack(deviceName,track,requireLive){
    const name=String(deviceName||'').trim().toLowerCase();
    for(let attempt=0;name && attempt<12;attempt++){
      const data=await this.request('/me/player/devices',{errorCodes:{403:'queue-forbidden'}});
      const matches=(data?.devices||[]).filter(d=>d.type?.toLowerCase()==='computer' && d.name?.trim().toLowerCase()===name && !d.is_restricted && d.id);
      if(matches.length===1){
        await requireLive();
        return this.request('/me/player/play?device_id='+encodeURIComponent(matches[0].id),{
          method:'PUT',body:JSON.stringify({context_uri:'spotify:playlist:'+this.config.spotify.playlistId,offset:{uri:track.uri}}),errorCodes:{403:'queue-forbidden'}});
      }
      if(matches.length>1)break;
      if(attempt<11)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new SpotifyApiError('Spotify opened, but its stream-PC device could not be identified. Check the desktop app is signed into the connected account.',{code:'stream-device-missing'});
  }

  async skipTrack(deviceId) {
    this.assertQueuePermission();
    const params = new URLSearchParams();
    if (deviceId) params.set('device_id', deviceId);
    return this.request('/me/player/next' + (params.size ? '?' + params : ''), {
      method: 'POST',
      errorCodes: { 403: 'queue-forbidden', 404: 'queue-no-active-device' },
    });
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
