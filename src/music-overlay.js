const { EventEmitter } = require('node:events');
const { spotifyApi } = require('./spotify-api');
const settings = require('./runtime-settings');
const { safeHttpsImageUrl } = require('./overlay-events');

// One Spotify poll shared by every open OBS source; nothing polls with no viewers.
class MusicOverlay {
  constructor({ api = spotifyApi, runtime = settings, now = Date.now, pollMs = 5000,
    schedule = setTimeout, cancel = clearTimeout } = {}) {
    Object.assign(this, { api, runtime, now, pollMs, schedule, cancel });
    this.events = new EventEmitter(); this.events.setMaxListeners(100);
    this.playback = null; this.timer = null; this.generation = 0; this.inflight = null;
    this.unsubscribers = [];
  }
  state() {
    const enabled = this.runtime.songRequestsEnabled();
    return { enabled, style: this.runtime.getSongOverlayStyle(), playback: enabled ? this.playback : null };
  }
  emit() { this.events.emit('state', this.state()); }
  subscribe(listener) {
    this.events.on('state', listener);
    if (this.events.listenerCount('state') === 1) {
      this.unsubscribers = [
        this.runtime.subscribeSongOverlayStyle(() => this.emit()),
        this.runtime.subscribeSongRequestsEnabled(() => this.reset()),
      ];
      this.reset();
    }
    return () => {
      this.events.off('state', listener);
      if (!this.events.listenerCount('state')) {
        this.generation++; this.cancel(this.timer); this.timer = null; this.playback = null;
        this.unsubscribers.splice(0).forEach(fn => fn());
      }
    };
  }
  reset() {
    this.generation++; this.cancel(this.timer); this.timer = null; this.playback = null;
    this.emit();
    if (this.runtime.songRequestsEnabled() && this.events.listenerCount('state')) this.refresh();
  }
  async refresh() {
    if (!this.runtime.songRequestsEnabled() || !this.events.listenerCount('state')) return;
    // An off/on toggle can happen while a request is in flight. Wait for that
    // request to settle instead of issuing overlapping calls or reviving old data.
    if (this.inflight) {
      this.timer = this.schedule(() => this.refresh(), this.pollMs); this.timer?.unref?.(); return;
    }
    const generation = this.generation;
    let delay = this.pollMs;
    const pending = Promise.resolve().then(() => this.api.getPlaybackState());
    this.inflight = pending;
    try {
      const data = await pending;
      if (generation === this.generation) this.playback = normalizePlayback(data, this.now());
    } catch (error) {
      if (generation === this.generation) this.playback = null;
      delay = error?.code === 'rate-limited'
        ? Math.max(1000, Math.min(3600000, Number(error.retryAfter) * 1000 || 30000)) : 15000;
    } finally {
      if (this.inflight === pending) this.inflight = null;
      if (generation === this.generation && this.runtime.songRequestsEnabled() && this.events.listenerCount('state')) {
        this.emit(); this.timer = this.schedule(() => this.refresh(), delay); this.timer?.unref?.();
      }
    }
  }
}
function normalizePlayback(data, observedAt) {
  const track = data?.item;
  if (!data?.is_playing || data?.currently_playing_type === 'ad' || track?.type !== 'track' || !track?.id) return null;
  const durationMs = Math.max(0, Number(track.duration_ms) || 0);
  return {
    id: String(track.id).slice(0, 100), name: String(track.name || 'Unknown song').slice(0, 200),
    artists: (Array.isArray(track.artists) ? track.artists : []).map(a => String(a?.name || '')).filter(Boolean).slice(0, 8),
    albumArtUrl: safeHttpsImageUrl(track.album?.images?.find(image => image?.url)?.url),
    durationMs, progressMs: Math.min(durationMs, Math.max(0, Number(data.progress_ms) || 0)), observedAt,
  };
}
const musicOverlay = new MusicOverlay();
module.exports = { MusicOverlay, musicOverlay, normalizePlayback };
