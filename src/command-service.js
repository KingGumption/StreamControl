const { appConfig } = require('./app-config');
const { getLiveConfig } = require('./config');
const { canUseCommand } = require('./permissions');
const { spotifyApi } = require('./spotify-api');
const { overlayEvents } = require('./overlay-events');
const { songRequestsEnabled } = require('./runtime-settings');
const {
  addSongRequest,
  getLastAcceptedSongRequest,
  hasAcceptedTrack,
} = require('./db');

const SUPPORTED_COMMANDS = new Set(['song', 'playlist', 'songlast']);

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

class CommandService {
  constructor({
    config = appConfig,
    spotify = spotifyApi,
    loadPermissions = getLiveConfig,
    history = { addSongRequest, getLastAcceptedSongRequest, hasAcceptedTrack },
    cooldowns = new CooldownManager({
      userSeconds: config.cooldowns.userSeconds,
      globalSeconds: config.cooldowns.globalSeconds,
    }),
    notifications = overlayEvents,
    areSongRequestsEnabled = songRequestsEnabled,
  } = {}) {
    this.config = config;
    this.spotify = spotify;
    this.loadPermissions = loadPermissions;
    this.history = history;
    this.cooldowns = cooldowns;
    this.notifications = notifications;
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

    if (parsed.command === 'playlist') return this.playlist(event);
    if (parsed.command === 'songlast') return this.songLast(event);
    return this.song(event, parsed.args);
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

      if (this.history.hasAcceptedTrack(track.id)) {
        this.record(event, trimmedQuery, track, 'duplicate', 'Track was already requested', 'duplicate');
        return handled(`@${event.user.username}, ${trackLabel(track)} has already been requested.`, 'duplicate');
      }

      let activeDevice = null;
      if (!this.config.dryRun && this.config.spotify.queueEnabled) {
        activeDevice = await this.spotify.getActivePlaybackDevice();
      }

      if (!this.config.dryRun) await this.spotify.addTrackToPlaylist(track.uri);

      if (!this.config.dryRun && this.config.spotify.queueEnabled) {
        try {
          await this.spotify.addTrackToQueue(track.uri, activeDevice.id);
        } catch (queueError) {
          const errorCode = queueError.code || 'queue-failed';
          const response = `@${event.user.username}, added ${trackLabel(track)} to the request playlist, but ${queueFailureMessage(errorCode)}`;
          const requestId = this.record(event, trimmedQuery, track, 'partial', response, errorCode);
          this.notifySongAdded(event, track, 'partial', requestId);
          return handled(response, 'partial', track);
        }
      }

      const status = this.config.dryRun ? 'dry-run' : 'accepted';
      const response = this.config.dryRun
        ? `@${event.user.username}, dry run: would add ${trackLabel(track)}.`
        : this.config.spotify.queueEnabled
          ? `@${event.user.username}, added ${trackLabel(track)} to the request playlist and playback queue.`
          : `@${event.user.username}, added ${trackLabel(track)} to the request playlist.`;
      const requestId = this.record(event, trimmedQuery, track, status, response, null);
      if (status === 'accepted') this.notifySongAdded(event, track, status, requestId);
      return handled(response, status, track);
    } catch (error) {
      const errorCode = error.code || (error.name === 'SpotifyAuthError' ? 'spotify-not-connected' : 'request-failed');
      const response = userSafeError(event.user.username, errorCode, error.retryAfter);
      this.record(event, trimmedQuery, track, 'error', response, errorCode);
      return handled(response, 'error');
    }
  }

  record(event, query, track, status, response, errorCode) {
    return this.history.addSongRequest({
      platform: event.platform,
      userId: event.user.id,
      username: event.user.username,
      query,
      trackId: track?.id,
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
