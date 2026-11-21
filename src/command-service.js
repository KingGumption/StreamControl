const { appConfig } = require('./app-config');
const { getLiveConfig } = require('./config');
const { canUseCommand } = require('./permissions');
const { spotifyApi } = require('./spotify-api');
const { overlayEvents } = require('./overlay-events');
const { songRequestsEnabled, getDuplicateSongCooldownMinutes } = require('./runtime-settings');
const {
  addSongRequest,
  getLastAcceptedSongRequest,
  lastTrackQueueTime, markTrackQueued,
  getSongRequest,
  deleteSongRequest,
} = require('./db');

const SUPPORTED_COMMANDS = new Set(['song', 'playlist', 'songlast', 'skip', 'songremove']);

class CooldownManager {
  constructor({ userSeconds = 5, globalSeconds = 1, now = () => Date.now() } = {}) {
    this.userMs = userSeconds * 1000;
    this.globalMs = globalSeconds * 1000;
    this.now = now;
    this.lastGlobal = 0;
    this.users = new Map();
  }

  consume(event) {
    const now = this.now();
    for (const [key, last] of this.users) if (now - last >= this.userMs) this.users.delete(key);
    if (this.users.size >= 10000) this.users.delete(this.users.keys().next().value);
    const userKey = `${event.platform}:${event.user.id || event.user.username.toLowerCase()}`;
    const globalWait = this.globalMs - (now - this.lastGlobal);
    const userWait = this.userMs - (now - (this.users.get(userKey) || 0));
    const waitMs = Math.max(globalWait, userWait, 0);
    if (waitMs > 0) return Math.ceil(waitMs / 1000);
    this.lastGlobal = now;
    this.users.set(userKey, now);
    return 0;
  }
}

const pendingTracks = new Set();

class CommandService {
  constructor({
    config = appConfig,
    spotify = spotifyApi,
    loadPermissions = getLiveConfig,
    history = { addSongRequest, getLastAcceptedSongRequest, lastTrackQueueTime, markTrackQueued, getSongRequest, deleteSongRequest },
    cooldowns = new CooldownManager({
      userSeconds: config.cooldowns.userSeconds,
      globalSeconds: config.cooldowns.globalSeconds,
    }),
    notifications = overlayEvents,
    trackCooldownMinutes = getDuplicateSongCooldownMinutes,
    now = Date.now,
    areSongRequestsEnabled = songRequestsEnabled,
  } = {}) {
    this.controlBusy = false;
    this.config = config;
    this.spotify = spotify;
    this.loadPermissions = loadPermissions;
    this.history = history;
    this.cooldowns = cooldowns;
    this.notifications = notifications;
    this.trackCooldownMinutes = trackCooldownMinutes;
    this.now = now;
    this.areSongRequestsEnabled = areSongRequestsEnabled;
  }

  async handleChatEvent(event) {
    const parsed = parseCommand(event?.text);
    if (!parsed || !SUPPORTED_COMMANDS.has(parsed.command)) return { handled: false };

    const liveConfig = this.loadPermissions();
    const permission = canUseCommand({
      command: parsed.command,
      platform: event.platform,
      user: event.user,
      config: liveConfig,
      overrides: liveConfig.overrides || [],
    });
    if (!permission.allowed) {
      return handled(`@${event.user.username}, you don't have access to !${parsed.command}.`, 'denied');
    }

    if (['skip', 'songremove'].includes(parsed.command)) return this.control(event, parsed);
    if (parsed.command === 'playlist') return this.playlist(event);
    if (parsed.command === 'songlast') return this.songLast(event);
    return this.song(event, parsed.args);
  }

  async control(event, { command, args }) {
    if ((command === 'skip' && args.trim()) || (command === 'songremove' && args.trim() && !/^[1-9]\d*$/.test(args.trim()))) {
      return handled(command === 'skip' ? 'Use !skip to skip the current song.' : 'Use !songremove for the latest request, or !songremove REQUEST_ID.', 'usage');
    }
    if (this.controlBusy) return handled('A song control is already in progress. Please try again shortly.', 'busy');
    const wait = this.cooldowns.consume(event);
    if (wait) return handled('@' + event.user.username + ', please wait ' + wait + 's before another song command.', 'cooldown');
    this.controlBusy = true;
    try {
      if (command === 'skip') {
        if (this.config.dryRun) return handled('Dry run: would skip the currently playing song.', 'dry-run');
        const device = await this.spotify.getActivePlaybackDevice();
        await this.spotify.skipTrack(device.id);
        return handled('@' + event.user.username + ', skipped to the next song.', 'ok');
      }
      const request = args.trim() ? this.history.getSongRequest(args.trim()) : this.history.getLastAcceptedSongRequest();
      if (!request) return handled('No matching song request was found.', 'not-found');
      if (this.config.dryRun) return handled('Dry run: would remove request #' + request.id + ' (' + request.track_name + ').', 'dry-run');
      const added = request.playlist_added == null ? ['accepted', 'partial'].includes(request.status) : Boolean(request.playlist_added);
      if (added) await this.spotify.removeTrackFromPlaylist(request.spotify_uri);
      this.history.deleteSongRequest(request.id);
      return handled('Removed request #' + request.id + ' (' + request.track_name + ') from ' + (added ? 'the playlist and request history. If already queued, it remains in Spotify’s playback queue; use !skip when it plays.' : 'request history.'), 'ok');
    } catch (error) {
      return handled(userSafeError(event.user.username, error.code || (error.name === 'SpotifyAuthError' ? 'spotify-not-connected' : 'request-failed'), error.retryAfter), 'error');
    } finally {
      this.controlBusy = false;
    }
  }

  playlist(event) {
    const playlistId = this.config.spotify.playlistId;
    if (!playlistId) return handled(`@${event.user.username}, the request playlist is not configured.`, 'error');
    return handled(`Request playlist: https://open.spotify.com/playlist/${playlistId}`, 'ok');
  }

  songLast(event) {
    const last = this.history.getLastAcceptedSongRequest();
    if (!last) return handled(`@${event.user.username}, no songs have been requested yet.`, 'ok');
    return handled(`Last request: ${last.track_name} by ${last.artists} — requested by @${last.username}.`, 'ok');
  }

  async song(event, query) {
    if (!this.areSongRequestsEnabled()) {
      return handled(`@${event.user.username}, song requests are currently closed.`, 'closed');
    }
    const trimmedQuery = String(query || '').trim().slice(0, 200);
    if (!trimmedQuery) return handled(`@${event.user.username}, use !song followed by a song title and artist.`, 'usage');

    const waitSeconds = this.cooldowns.consume(event);
    if (waitSeconds) {
      return handled(`@${event.user.username}, please wait ${waitSeconds}s before requesting another song.`, 'cooldown');
    }

    let track = null;
    try {
      track = await this.spotify.searchTrack(trimmedQuery);
      if (!track) {
        this.record(event, trimmedQuery, null, 'not-found', 'No Spotify track found', 'not-found');
        return handled(`@${event.user.username}, I couldn't find that song on Spotify.`, 'not-found');
      }

      if (pendingTracks.has(track.id)) return handled(`@${event.user.username}, a request for ${trackLabel(track)} is already in progress.`, 'busy');
      pendingTracks.add(track.id);
      try {
        if (this.config.dryRun) {
          const response = `@${event.user.username}, dry run: no changes made for ${trackLabel(track)}.`;
          this.record(event, trimmedQuery, track, 'dry-run', response, null, false);
          return handled(response, 'dry-run', track);
        }
        const queue = this.config.spotify.queueEnabled;
        if (queue) {
          const last = this.history.lastTrackQueueTime(track.id);
          const remaining = last == null ? 0 : last + this.trackCooldownMinutes()*60000 - this.now();
          if (remaining > 0) {
            const response = `@${event.user.username}, ${trackLabel(track)} was recently queued. Try again in ${Math.ceil(remaining/1000)}s.`;
            this.record(event, trimmedQuery, track, 'duplicate', response, 'track-cooldown', false);
            return handled(response, 'duplicate');
          }
        }
        const device = queue ? await this.spotify.getActivePlaybackDevice() : null;
        const exists = await this.spotify.playlistHasTrack(track);
        if (!queue && exists) {
          const response = `@${event.user.username}, ${trackLabel(track)} is already on the playlist. Playback queueing is disabled.`;
          this.record(event, trimmedQuery, track, 'duplicate', response, 'queue-disabled', false);
          return handled(response, 'duplicate');
        }
        if (!exists) await this.spotify.addTrackToPlaylist(track.uri);
        if (queue) {
          try {
            await this.spotify.addTrackToQueue(track.uri, device.id);
          } catch (error) {
            const code = error.code || 'queue-failed';
            const response = `@${event.user.username}, ${exists ? 'already on the playlist' : 'added to the playlist'}: ${trackLabel(track)}, but ${queueFailureMessage(code)}`;
            const status = exists ? 'error' : 'partial';
            this.record(event, trimmedQuery, track, status, response, code, !exists);
            return handled(response, status, track);
          }
          this.history.markTrackQueued(track.id, this.now());
        }
        const response = exists
          ? `@${event.user.username}, queued ${trackLabel(track)}. It was already on the request playlist.`
          : `@${event.user.username}, added ${trackLabel(track)} to the request playlist${queue ? ' and playback queue.' : '. Playback queueing is disabled.'}`;
        const requestId = this.record(event, trimmedQuery, track, 'accepted', response, null, !exists);
        if (queue) this.notifySongAdded(event, track, 'accepted', requestId);
        return handled(response, 'accepted', track);
      } finally { pendingTracks.delete(track.id); }
    } catch (error) {
      const errorCode = error.code || (error.name === 'SpotifyAuthError' ? 'spotify-not-connected' : 'request-failed');
      const response = userSafeError(event.user.username, errorCode, error.retryAfter);
      this.record(event, trimmedQuery, track, 'error', response, errorCode);
      return handled(response, 'error');
    }
  }

  record(event, query, track, status, response, errorCode, playlistAdded = false) {
    return this.history.addSongRequest({
      platform: event.platform,
      userId: event.user.id,
      username: event.user.username,
      query,
      trackId: track?.id,
      playlistAdded,
      trackUri: track?.uri,
      trackName: track?.name,
      artists: track?.artists?.join(', '),
      albumName: track?.albumName,
      albumArtUrl: track?.albumArtUrl,
      userProfileImageUrl: event.user.profileImageUrl,
      roles: event.user.roles,
      status,
      response,
      errorCode,
    });
  }

  notifySongAdded(event, track, status, requestId) {
    this.notifications.publishSongAdded({
      requestId,
      platform: event.platform,
      username: event.user.username,
      profileImageUrl: event.user.profileImageUrl,
      track,
      status,
    });
  }
}

function parseCommand(text) {
  const match = String(text || '').trim().match(/^!([a-z0-9]+)(?:\s+(.*))?$/i);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2] || '' };
}

function trackLabel(track) {
  const artists = track.artists?.length ? track.artists.join(', ') : 'Unknown artist';
  return `“${track.name}” by ${artists}`;
}

function userSafeError(username, code, retryAfter) {
  if (code === 'spotify-not-connected') return `@${username}, Spotify is not connected yet.`;
  if (code === 'playlist-missing') return `@${username}, the request playlist is not configured.`;
  if (code === 'playlist-read-forbidden') return `@${username}, Spotify cannot read the request playlist. Check playlist access and reconnect Spotify from the admin page.`;
  if (code === 'playlist-forbidden') return `@${username}, Spotify cannot modify the configured playlist.`;
  if (code === 'clean-version-not-found') return `@${username}, I couldn't find a non-explicit version of that song.`;
  if (code === 'queue-permission-missing') return `@${username}, Spotify must be reconnected from the admin page to enable live queueing.`;
  if (code === 'queue-no-active-device') return `@${username}, start playing Spotify on the device you want to use, then try again.`;
  if (code === 'queue-forbidden') return `@${username}, Spotify cannot control the playback queue. Check Premium and reconnect Spotify.`;
  if (code === 'rate-limited') {
    return `@${username}, Spotify is busy. Please try again${retryAfter ? ` in ${retryAfter}s` : ' shortly'}.`;
  }
  if (code === 'unreachable') return `@${username}, Spotify is temporarily unreachable.`;
  return `@${username}, the song request failed. Please try again.`;
}

function queueFailureMessage(code) {
  if (code === 'queue-no-active-device') return 'the active Spotify device disappeared before it could be queued.';
  if (code === 'queue-forbidden' || code === 'queue-permission-missing') {
    return 'Spotify refused the live queue update; reconnect Spotify and check Premium.';
  }
  return 'it could not be added to the live playback queue.';
}

function handled(response, status, track = null) {
  return { handled: true, response: String(response).slice(0, 450), status, track };
}

const commandService = new CommandService();

module.exports = {
  CommandService,
  CooldownManager,
  parseCommand,
  commandService,
};
