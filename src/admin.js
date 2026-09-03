const express = require('express');
const path = require('node:path');
const { getLiveConfig, saveConfig } = require('./config');
const {
  canUseCommand,
  normalizeRole,
  DEFAULT_PERMISSION_PRESETS,
  sanitizeCommandPermissions,
} = require('./permissions');
const {
  upsertOverride,
  deleteOverride,
  addAuditLog,
  listOverrides,
  listSongRequests,
  getSongRequest,
  deleteSongRequest,
  getLastAcceptedSongRequest,
} = require('./db');
const { getConnectionStatuses } = require('./connection-status');
const { spotifyAuth } = require('./spotify-auth');
const { spotifyApi } = require('./spotify-api');
const { overlayEvents } = require('./overlay-events');
const { resolveTwitchAvatar } = require('./avatar-resolver');
const { hillGame } = require('./hill-game');
const { polaroidRuntime } = require('./polaroid/runtime');
const { loadAnalyticsReport } = require('./analytics');
const { appConfig } = require('./app-config');
const { createAdminAuth } = require('./admin-auth');
const {
  getRuntimeSettings,
  setAllowExplicitTracks,
  setSongRequestsEnabled,
  getHillGameTimings,
  setHillGameTimings,
  getHillGameRoundCount,
  setHillGameConfiguration,
} = require('./runtime-settings');

const app = express();
const router = express.Router();
const adminAuth = createAdminAuth(appConfig);
app.disable('x-powered-by');

const ROLE_OPTIONS = {
  twitch: ['broadcaster', 'moderator', 'vip', 'subscriber', 'follower', 'everyone'],
  youtube: ['broadcaster', 'moderator', 'member', 'subscriber', 'viewer', 'everyone'],
  tiktok: ['broadcaster', 'moderator', 'subscriber', 'fan-club', 'follower', 'everyone'],
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (appConfig.mode === 'cloud') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path === '/admin' || req.path.startsWith('/admin/')) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  next();
});
app.get('/health', (req, res) => res.json({ ok: true, mode: appConfig.mode }));
app.use((req, res, next) => {
  if (appConfig.mode !== 'local') return next();
  const host = req.hostname || req.headers.host || '';
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) && !(host.startsWith('127.0.0.1') || host.startsWith('localhost'))) {
    res.status(403).send('Forbidden');
    return;
  }
  next();
});
app.get('/admin/login', adminAuth.loginPage);
app.post('/admin/login', adminAuth.requireSameOrigin, adminAuth.login);
app.post('/admin/logout', adminAuth.requireAuthentication, adminAuth.requireSameOrigin, adminAuth.logout);
app.use('/admin', adminAuth.requireAuthentication, adminAuth.requireSameOrigin);

router.get('/status', (req, res) => {
  res.json({ ok: true, message: 'admin online', connections: getConnectionStatuses() });
});

router.get('/connections', (req, res) => {
  res.json({ ok: true, connections: getConnectionStatuses() });
});

router.get('/requests', (req, res) => {
  res.json({ ok: true, requests: listSongRequests(50) });
});

router.get('/analytics/summary', (req, res) => {
  res.json(loadAnalyticsReport({ range: req.query.range, platform: req.query.platform }));
});

router.get('/polaroid/status', (req, res) => {
  res.json({ ok: true, ...polaroidRuntime.getPublicState() });
});

router.get('/polaroid/latest', (req, res) => {
  res.json({ ok: true, ...(polaroidRuntime.getPublicState().lastCapture || {}) });
});

router.post('/polaroid/redeem', async (req, res) => {
  try {
    const deliverToDiscord = req.body.deliverToDiscord !== false;
    const photo = await polaroidRuntime.enqueueRedemption(
      req.body.redeemerName || req.body.userName || req.body.username,
      'Admin',
      '',
      req.body.profileImageUrl || req.body.avatarUrl || '',
      '',
      [],
      { deliverToDiscord },
    );
    res.status(201).json({ ok: true, ...photo, deliverToDiscord });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/overlay/preview', (req, res) => {
  const last = getLastAcceptedSongRequest();
  const payload = overlayEvents.publishSongAdded({
    requestId: last?.id,
    platform: last?.platform || 'twitch',
    username: last?.username || 'PiggyFan',
    profileImageUrl: last?.user_profile_image_url || '',
    status: 'preview',
    track: last ? {
      name: last.track_name || 'Dancing in the Pigpen',
      artists: String(last.artists || 'The Oinkestra').split(',').map((artist) => artist.trim()).filter(Boolean),
      albumName: last.album_name || '',
      albumArtUrl: last.album_art_url || '',
    } : {
      name: 'Dancing in the Pigpen',
      artists: ['The Oinkestra'],
      albumName: '',
      albumArtUrl: '',
    },
  });
  res.json({ ok: true, preview: payload });
});

router.delete('/requests/:id', async (req, res) => {
  const request = getSongRequest(req.params.id);
  if (!request) {
    res.status(404).json({ ok: false, message: 'Song request not found' });
    return;
  }

  const wasAdded = ['accepted', 'partial'].includes(request.status) && Boolean(request.spotify_uri);
  try {
    if (wasAdded) await spotifyApi.removeTrackFromPlaylist(request.spotify_uri);
  } catch (error) {
    addAuditLog({
      action: 'song-request-remove-failed',
      platform: request.platform,
      command: 'song',
      previousValue: request,
      newValue: { removed: false, errorCode: error.code || 'spotify-error' },
      source: 'admin-page',
      details: 'Could not remove song request from Spotify playlist',
    });
    res.status(502).json({
      ok: false,
      message: error.code === 'spotify-not-connected' || error.name === 'SpotifyAuthError'
        ? 'Reconnect Spotify before removing this request.'
        : 'Spotify could not remove this song from the request playlist.',
    });
    return;
  }

  const deleted = deleteSongRequest(request.id);
  addAuditLog({
    action: 'song-request-remove',
    platform: request.platform,
    command: 'song',
    previousValue: request,
    newValue: {
      removed: deleted,
      playlistRemoved: wasAdded,
      queueRemoved: false,
    },
    source: 'admin-page',
    details: wasAdded
      ? 'Removed request from playlist and history; Spotify does not support removing an arbitrary queued item'
      : 'Removed request from local history',
  });

  res.json({
    ok: deleted,
    playlistRemoved: wasAdded,
    queueRemoved: false,
    warning: wasAdded
      ? 'Removed from the playlist and request history. Spotify does not support removing an arbitrary item from the live queue.'
      : null,
  });
});

router.get('/spotify/connect', (req, res) => {
  try {
    res.redirect(spotifyAuth.createAuthorizationUrl());
  } catch (error) {
    res.status(400).send('Spotify is not configured. Check the local .env file.');
  }
});

router.post('/spotify/disconnect', (req, res) => {
  spotifyAuth.disconnect();
  addAuditLog({
    action: 'spotify-disconnect',
    source: 'admin-page',
    previousValue: { connected: true },
    newValue: { connected: false },
    details: 'Spotify authorization removed',
  });
  res.json({ ok: true });
});

router.get('/config', (req, res) => {
  const config = getLiveConfig();
  res.json({
    config,
    presets: DEFAULT_PERMISSION_PRESETS,
    roles: ROLE_OPTIONS,
    settings: getRuntimeSettings(),
  });
});

router.post('/settings/explicit-tracks', (req, res) => {
  if (typeof req.body?.allowExplicitTracks !== 'boolean') {
    res.status(400).json({ ok: false, message: 'allowExplicitTracks must be true or false' });
    return;
  }

  const previous = getRuntimeSettings();
  setAllowExplicitTracks(req.body.allowExplicitTracks);
  const settings = getRuntimeSettings();
  addAuditLog({
    action: 'explicit-tracks-setting',
    platform: 'spotify',
    command: 'song',
    previousValue: previous,
    newValue: settings,
    source: 'admin-page',
    details: settings.allowExplicitTracks
      ? 'Explicit Spotify tracks allowed'
      : 'Only non-explicit Spotify tracks allowed',
  });
  res.json({ ok: true, settings });
});

router.post('/settings/song-requests', (req, res) => {
  if (typeof req.body?.songRequestsEnabled !== 'boolean') {
    res.status(400).json({ ok: false, message: 'songRequestsEnabled must be true or false' });
    return;
  }

  const previous = getRuntimeSettings();
  setSongRequestsEnabled(req.body.songRequestsEnabled);
  const settings = getRuntimeSettings();
  addAuditLog({
    action: 'song-requests-setting',
    platform: 'all',
    command: 'song',
    previousValue: previous,
    newValue: settings,
    source: 'admin-page',
    details: settings.songRequestsEnabled ? 'Song requests opened' : 'Song requests closed',
  });
  res.json({ ok: true, settings });
});

router.get('/king-of-the-hill/state', (req, res) => {
  res.json({ ok: true, game: hillGame.getState() });
});

router.post('/king-of-the-hill/start', (req, res) => {
  res.json({ ok: true, game: hillGame.start() });
});

router.post('/king-of-the-hill/stop', (req, res) => {
  res.json({ ok: true, game: hillGame.stop() });
});

router.post('/king-of-the-hill/next', (req, res) => {
  if (!hillGame.running) {
    res.status(409).json({ ok: false, message: 'The game is not running' });
    return;
  }
  res.json({ ok: true, game: hillGame.finishPhase() });
});

router.post('/king-of-the-hill/timings', (req, res) => {
  const previous = getHillGameTimings();
  let timings;
  try {
    timings = setHillGameTimings(req.body);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
    return;
  }
  const game = hillGame.setTimings(timings);
  addAuditLog({
    action: 'hill-game-timings',
    platform: 'all',
    previousValue: previous,
    newValue: timings,
    source: 'admin-page',
    details: 'King of the Hill timings updated',
  });
  res.json({ ok: true, timings, game });
});

router.post('/king-of-the-hill/settings', (req, res) => {
  const previous = {
    timings: getHillGameTimings(),
    roundCount: getHillGameRoundCount(),
  };
  let configuration;
  try {
    configuration = setHillGameConfiguration(req.body);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
    return;
  }
  hillGame.setTimings(configuration.timings);
  const game = hillGame.setRoundCount(configuration.roundCount);
  addAuditLog({
    action: 'hill-game-settings',
    platform: 'all',
    previousValue: previous,
    newValue: configuration,
    source: 'admin-page',
    details: 'King of the Hill timings and round count updated',
  });
  res.json({ ok: true, ...configuration, game });
});

router.post('/save', (req, res) => {
  const payload = req.body || {};
  const newConfig = payload.config || {};
  const previous = getLiveConfig();
  const next = {
    commands: sanitizeCommandPermissions(newConfig.commands || previous.commands || {}),
    presets: newConfig.presets || DEFAULT_PERMISSION_PRESETS,
    overrides: Array.isArray(newConfig.overrides) ? newConfig.overrides : previous.overrides || [],
  };

  saveConfig(next);
  addAuditLog({
    action: 'permissions-save',
    platform: 'all',
    command: null,
    previousValue: previous,
    newValue: next,
    source: 'admin-page',
    details: 'Permission configuration updated',
  });

  res.json({ ok: true, message: 'Permissions updated', config: next });
});

router.post('/override', (req, res) => {
  const payload = req.body || {};
  const result = upsertOverride({
    platform: payload.platform,
    username: payload.username,
    command: payload.command,
    access: payload.access,
  });

  const previousOverrides = listOverrides();
  addAuditLog({
    action: 'user-override',
    platform: payload.platform,
    command: payload.command,
    previousValue: previousOverrides,
    newValue: result,
    source: 'admin-page',
    details: `User override ${payload.access} for ${payload.username}`,
  });

  res.json({ ok: true, override: result, config: getLiveConfig() });
});

router.post('/override/remove', (req, res) => {
  const payload = req.body || {};
  const deleted = deleteOverride({
    platform: payload.platform,
    username: payload.username,
    command: payload.command,
  });

  addAuditLog({
    action: 'user-override-remove',
    platform: payload.platform,
    command: payload.command,
    previousValue: { platform: payload.platform, username: payload.username, command: payload.command },
    newValue: { removed: deleted },
    source: 'admin-page',
    details: 'User override removed',
  });

  res.json({ ok: true, deleted });
});

router.get(['/', '/ui', '/stream-engagement'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

router.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-analytics.html'));
});

router.get('/polaroid', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-polaroid.html'));
});

router.get('/king-of-the-hill', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-hill.html'));
});

app.use('/admin', router);
app.use('/assets', express.static(path.join(__dirname, '..', 'public')));
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'overlay.html'));
});
app.get('/polaroid', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'polaroid', 'overlay.html'));
});
app.use('/polaroid/assets', express.static(path.join(__dirname, '..', 'public', 'polaroid')));
app.use('/polaroid/captures', express.static(polaroidRuntime.capturesDir, {
  immutable: true,
  maxAge: '1y',
}));
app.get('/polaroid/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const unsubscribe = polaroidRuntime.subscribe((payload) => {
    res.write(`event: polaroid\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get('/king-of-the-hill', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'king-of-the-hill.html'));
});
app.get('/king-of-the-hill/state', (req, res) => {
  res.json({ ok: true, game: hillGame.getState() });
});
app.get('/king-of-the-hill/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(`event: hill-state\ndata: ${JSON.stringify(hillGame.getState())}\n\n`);
  const unsubscribe = hillGame.subscribe((state) => {
    res.write(`event: hill-state\ndata: ${JSON.stringify(state)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get('/king-of-the-hill/art/:group/:entry.svg', (req, res) => {
  const svg = hillGame.artwork(req.params.group, req.params.entry);
  if (!svg) {
    res.status(404).end();
    return;
  }
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});
app.get('/overlay/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const unsubscribe = overlayEvents.subscribe((payload) => {
    res.write(`event: song-added\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get('/overlay/avatar/twitch/:username', async (req, res) => {
  const avatarUrl = await resolveTwitchAvatar(req.params.username);
  if (!avatarUrl) {
    res.status(404).end();
    return;
  }
  res.set('Cache-Control', 'public, max-age=21600');
  res.redirect(302, avatarUrl);
});
app.get('/callback', async (req, res) => {
  try {
    await spotifyAuth.handleCallback({
      code: req.query.code,
      state: req.query.state,
      error: req.query.error,
    });
    addAuditLog({
      action: 'spotify-connect',
      source: 'spotify-oauth',
      previousValue: { connected: false },
      newValue: { connected: true },
      details: 'Spotify authorization completed',
    });
    res.redirect('/admin?spotify=connected');
  } catch (error) {
    spotifyAuth.handleConnectionFailure(error);
    res.redirect('/admin?spotify=error');
  }
});
app.get('/', (req, res) => {
  res.redirect('/admin');
});

function startAdminServer(port = appConfig.port, host = appConfig.bindHost) {
  app.set('trust proxy', appConfig.mode === 'cloud' ? 1 : false);
  return app.listen(port, host, () => {
    console.log(`Admin page available at ${appConfig.publicBaseUrl}/admin`);
  });
}

module.exports = {
  app,
  startAdminServer,
  ROLE_OPTIONS,
};
