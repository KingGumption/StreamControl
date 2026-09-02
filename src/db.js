const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { appConfig } = require('./app-config');

const dataDir = appConfig.dataDir;
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'permissions.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    user_id TEXT,
    username TEXT NOT NULL,
    command TEXT NOT NULL,
    access TEXT NOT NULL CHECK(access IN ('allow','deny')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    action TEXT NOT NULL,
    platform TEXT,
    command TEXT,
    previous_value TEXT,
    new_value TEXT,
    source TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS spotify_auth (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scope TEXT,
    token_type TEXT NOT NULL DEFAULT 'Bearer',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS song_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platform TEXT NOT NULL,
    platform_user_id TEXT,
    username TEXT NOT NULL,
    query TEXT NOT NULL,
    spotify_track_id TEXT,
    spotify_uri TEXT,
    track_name TEXT,
    artists TEXT,
    album_name TEXT,
    album_art_url TEXT,
    user_profile_image_url TEXT,
    roles TEXT,
    session_id TEXT,
    status TEXT NOT NULL,
    response TEXT,
    error_code TEXT
  );

  CREATE TABLE IF NOT EXISTS engagement_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tool TEXT NOT NULL,
    event_type TEXT NOT NULL,
    platform TEXT,
    platform_user_id TEXT,
    username TEXT,
    correlation_id TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS stream_sessions (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    external_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    title TEXT,
    category TEXT,
    source TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS viewer_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    platform TEXT NOT NULL,
    session_id TEXT,
    viewer_count INTEGER NOT NULL,
    total_viewers INTEGER,
    source TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_song_requests_track_status
    ON song_requests(spotify_track_id, status);

  CREATE INDEX IF NOT EXISTS idx_song_requests_timestamp
    ON song_requests(timestamp);

  CREATE INDEX IF NOT EXISTS idx_engagement_events_timestamp
    ON engagement_events(timestamp);

  CREATE INDEX IF NOT EXISTS idx_engagement_events_tool_type
    ON engagement_events(tool, event_type);

  CREATE INDEX IF NOT EXISTS idx_engagement_events_user
    ON engagement_events(platform, platform_user_id, username);

  CREATE INDEX IF NOT EXISTS idx_stream_sessions_started
    ON stream_sessions(started_at);

  CREATE INDEX IF NOT EXISTS idx_stream_sessions_platform_open
    ON stream_sessions(platform, ended_at);

  CREATE INDEX IF NOT EXISTS idx_viewer_snapshots_timestamp
    ON viewer_snapshots(timestamp);

  CREATE INDEX IF NOT EXISTS idx_viewer_snapshots_session
    ON viewer_snapshots(session_id, timestamp);
`);

const songRequestColumns = db.prepare('PRAGMA table_info(song_requests)').all();
if (!songRequestColumns.some((column) => column.name === 'album_art_url')) {
  db.exec('ALTER TABLE song_requests ADD COLUMN album_art_url TEXT');
}
if (!songRequestColumns.some((column) => column.name === 'user_profile_image_url')) {
  db.exec('ALTER TABLE song_requests ADD COLUMN user_profile_image_url TEXT');
}
if (!songRequestColumns.some((column) => column.name === 'roles')) {
  db.exec('ALTER TABLE song_requests ADD COLUMN roles TEXT');
}
if (!songRequestColumns.some((column) => column.name === 'session_id')) {
  db.exec('ALTER TABLE song_requests ADD COLUMN session_id TEXT');
}

const engagementEventColumns = db.prepare('PRAGMA table_info(engagement_events)').all();
if (!engagementEventColumns.some((column) => column.name === 'roles')) {
  db.exec('ALTER TABLE engagement_events ADD COLUMN roles TEXT');
}
if (!engagementEventColumns.some((column) => column.name === 'session_id')) {
  db.exec('ALTER TABLE engagement_events ADD COLUMN session_id TEXT');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_engagement_events_session ON engagement_events(session_id, timestamp)');

function setConfigValue(key, value) {
  const serialized = JSON.stringify(value);
  const stmt = db.prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run({ key, value: serialized });
}

function getConfigValue(key, fallback = null) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) {
    return fallback;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config ORDER BY key').all();
  return rows.reduce((acc, row) => {
    try {
      acc[row.key] = JSON.parse(row.value);
    } catch {
      acc[row.key] = row.value;
    }
    return acc;
  }, {});
}

function addAuditLog({ action, platform, command, previousValue, newValue, source, details }) {
  db.prepare(`
    INSERT INTO audit_log (action, platform, command, previous_value, new_value, source, details)
    VALUES (@action, @platform, @command, @previousValue, @newValue, @source, @details)
  `).run({
    action,
    platform: platform || null,
    command: command || null,
    previousValue: previousValue !== undefined ? JSON.stringify(previousValue) : null,
    newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
    source: source || 'system',
    details: details || null,
  });
}

function getAuditLog(limit = 50) {
  return db.prepare(`
    SELECT * FROM audit_log ORDER BY id DESC LIMIT ?
  `).all(limit);
}

function listOverrides() {
  return db.prepare(`
    SELECT * FROM user_overrides ORDER BY platform, username, command
  `).all();
}

function upsertOverride({ platform, username, command, access, userId }) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedUsername = String(username || '').trim();
  const normalizedCommand = String(command || '').trim().toLowerCase();
  const normalizedAccess = access === 'allow' ? 'allow' : 'deny';
  const normalizedUserId = userId ? String(userId).trim() : null;

  const existing = db.prepare(`
    SELECT id FROM user_overrides
    WHERE LOWER(platform)=LOWER(?)
      AND LOWER(command)=LOWER(?)
      AND (
        LOWER(username)=LOWER(?)
        OR (user_id IS NOT NULL AND user_id = ?)
      )
  `).get(normalizedPlatform, normalizedCommand, normalizedUsername, normalizedUserId || '');

  if (existing) {
    db.prepare(`
      UPDATE user_overrides
      SET access = @access, user_id = @userId, username = @username, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      access: normalizedAccess,
      userId: normalizedUserId,
      username: normalizedUsername,
      id: existing.id,
    });
    return { updated: true, id: existing.id };
  }

  const result = db.prepare(`
    INSERT INTO user_overrides (platform, user_id, username, command, access)
    VALUES (@platform, @userId, @username, @command, @access)
  `).run({
    platform: normalizedPlatform,
    userId: normalizedUserId,
    username: normalizedUsername,
    command: normalizedCommand,
    access: normalizedAccess,
  });

  return { updated: false, id: result.lastInsertRowid };
}

function deleteOverride({ platform, username, command, userId }) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedUsername = String(username || '').trim();
  const normalizedCommand = String(command || '').trim().toLowerCase();
  const normalizedUserId = userId ? String(userId).trim() : null;

  const result = db.prepare(`
    DELETE FROM user_overrides
    WHERE LOWER(platform)=LOWER(?)
      AND LOWER(command)=LOWER(?)
      AND (
        LOWER(username)=LOWER(?)
        OR (user_id IS NOT NULL AND user_id = ?)
      )
  `).run(normalizedPlatform, normalizedCommand, normalizedUsername, normalizedUserId || '');

  return result.changes > 0;
}

function getSpotifyAuth() {
  const row = db.prepare(`
    SELECT access_token, refresh_token, expires_at, scope, token_type
    FROM spotify_auth WHERE id = 1
  `).get();
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    scope: row.scope || '',
    tokenType: row.token_type || 'Bearer',
  };
}

function saveSpotifyAuth({ accessToken, refreshToken, expiresAt, scope, tokenType }) {
  const existing = getSpotifyAuth();
  const preservedRefreshToken = refreshToken || existing?.refreshToken;
  if (!accessToken || !preservedRefreshToken || !expiresAt) {
    throw new Error('Cannot save incomplete Spotify authorization data');
  }

  db.prepare(`
    INSERT INTO spotify_auth (id, access_token, refresh_token, expires_at, scope, token_type, updated_at)
    VALUES (1, @accessToken, @refreshToken, @expiresAt, @scope, @tokenType, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      token_type = excluded.token_type,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    accessToken,
    refreshToken: preservedRefreshToken,
    expiresAt: Number(expiresAt),
    scope: scope || existing?.scope || '',
    tokenType: tokenType || existing?.tokenType || 'Bearer',
  });
}

function clearSpotifyAuth() {
  return db.prepare('DELETE FROM spotify_auth WHERE id = 1').run().changes > 0;
}

function addSongRequest({
  platform,
  userId,
  username,
  query,
  trackId,
  trackUri,
  trackName,
  artists,
  albumName,
  albumArtUrl,
  userProfileImageUrl,
  roles,
  sessionId,
  status,
  response,
  errorCode,
}) {
  const occurredAt = new Date().toISOString();
  const normalizedPlatform = String(platform || 'other').toLowerCase();
  const resolvedSessionId = sessionId || findActiveStreamSessionId(normalizedPlatform, occurredAt);
  const result = db.prepare(`
    INSERT INTO song_requests (
      timestamp, platform, platform_user_id, username, query, spotify_track_id,
      spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id, status, response, error_code
    ) VALUES (
      @timestamp, @platform, @userId, @username, @query, @trackId,
      @trackUri, @trackName, @artists, @albumName, @albumArtUrl, @userProfileImageUrl, @roles, @sessionId, @status, @response, @errorCode
    )
  `).run({
    timestamp: occurredAt,
    platform: normalizedPlatform,
    userId: userId || null,
    username,
    query,
    trackId: trackId || null,
    trackUri: trackUri || null,
    trackName: trackName || null,
    artists: artists || null,
    albumName: albumName || null,
    albumArtUrl: albumArtUrl || null,
    userProfileImageUrl: userProfileImageUrl || null,
    roles: Array.isArray(roles) && roles.length ? JSON.stringify([...new Set(roles.map((role) => String(role).toLowerCase()))]) : null,
    sessionId: resolvedSessionId,
    status,
    response: response || null,
    errorCode: errorCode || null,
  });
  return Number(result.lastInsertRowid);
}

function listSongRequests(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return db.prepare(`
    SELECT id, timestamp, platform, platform_user_id, username, query,
           spotify_track_id, spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id,
           status, response, error_code
    FROM song_requests
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
}

function listAllSongRequests(limit = 50000) {
  const safeLimit = Math.max(1, Math.min(100000, Number(limit) || 50000));
  return db.prepare(`
    SELECT id, timestamp, platform, platform_user_id, username, query,
           spotify_track_id, spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id,
           status, response, error_code
    FROM song_requests
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
}

function addEngagementEvent({
  timestamp,
  tool,
  eventType,
  platform,
  userId,
  username,
  correlationId,
  sessionId,
  roles,
  metadata,
}) {
  const normalizedTool = String(tool || '').trim().toLowerCase();
  const normalizedType = String(eventType || '').trim().toLowerCase();
  if (!normalizedTool || !normalizedType) throw new TypeError('Engagement events require a tool and eventType');
  const occurredAt = timestamp || new Date().toISOString();
  const normalizedPlatform = platform ? String(platform).trim().toLowerCase() : null;
  const resolvedSessionId = sessionId || findActiveStreamSessionId(normalizedPlatform, occurredAt);
  const result = db.prepare(`
    INSERT INTO engagement_events (
      timestamp, tool, event_type, platform, platform_user_id, username, correlation_id, roles, session_id, metadata
    ) VALUES (
      @timestamp, @tool, @eventType, @platform, @userId, @username, @correlationId, @roles, @sessionId, @metadata
    )
  `).run({
    timestamp: occurredAt,
    tool: normalizedTool,
    eventType: normalizedType,
    platform: normalizedPlatform,
    userId: userId ? String(userId).trim() : null,
    username: username ? String(username).trim().slice(0, 100) : null,
    correlationId: correlationId ? String(correlationId).trim().slice(0, 200) : null,
    roles: Array.isArray(roles) && roles.length ? JSON.stringify([...new Set(roles.map((role) => String(role).toLowerCase()))]) : null,
    sessionId: resolvedSessionId,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
  });
  return Number(result.lastInsertRowid);
}

function listEngagementEvents(limit = 50000) {
  const safeLimit = Math.max(1, Math.min(100000, Number(limit) || 50000));
  return db.prepare(`
    SELECT id, timestamp, tool, event_type, platform, platform_user_id, username, correlation_id, roles, session_id, metadata
    FROM engagement_events
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit).map(parseEngagementEventRow);
}

function listEngagementEventsForRange({ since, before } = {}) {
  const conditions = [];
  const params = {};
  if (since) { conditions.push('julianday(timestamp) >= julianday(@since)'); params.since = since; }
  if (before) { conditions.push('julianday(timestamp) < julianday(@before)'); params.before = before; }
  const detailRows = db.prepare(`
    SELECT id, timestamp, tool, event_type, platform, platform_user_id, username, correlation_id, roles, session_id, metadata
    FROM engagement_events
    ${conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE'} NOT (tool = 'audience' AND event_type = 'chat_message')
  `).all(params);
  const chatRows = db.prepare(`
    SELECT MIN(id) AS id, MIN(timestamp) AS timestamp, tool, event_type, platform,
           platform_user_id, username, NULL AS correlation_id, roles, session_id,
           COUNT(*) AS aggregate_count, NULL AS metadata
    FROM engagement_events
    ${conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE'} tool = 'audience' AND event_type = 'chat_message'
    GROUP BY date(timestamp), platform, platform_user_id, LOWER(username), roles, session_id
  `).all(params);
  return [...detailRows, ...chatRows]
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)) || Number(right.id) - Number(left.id))
    .map(parseEngagementEventRow);
}

function listSongRequestsForRange({ since, before } = {}) {
  const conditions = [];
  const params = {};
  if (since) { conditions.push('julianday(timestamp) >= julianday(@since)'); params.since = since; }
  if (before) { conditions.push('julianday(timestamp) < julianday(@before)'); params.before = before; }
  return db.prepare(`
    SELECT id, timestamp, platform, platform_user_id, username, query,
           spotify_track_id, spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id,
           status, response, error_code
    FROM song_requests
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY timestamp DESC, id DESC
  `).all(params);
}

function openStreamSession({ id, platform, externalId, startedAt, title, category, source, metadata }) {
  const sessionId = String(id || `${platform}:${externalId || startedAt || Date.now()}`);
  db.prepare(`
    INSERT INTO stream_sessions (id, platform, external_id, started_at, title, category, source, metadata, updated_at)
    VALUES (@id, @platform, @externalId, @startedAt, @title, @category, @source, @metadata, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      external_id = COALESCE(excluded.external_id, stream_sessions.external_id),
      started_at = MIN(stream_sessions.started_at, excluded.started_at),
      title = COALESCE(excluded.title, stream_sessions.title),
      category = COALESCE(excluded.category, stream_sessions.category),
      source = COALESCE(excluded.source, stream_sessions.source),
      metadata = COALESCE(excluded.metadata, stream_sessions.metadata),
      updated_at = CURRENT_TIMESTAMP
  `).run({
    id: sessionId,
    platform: String(platform || 'other').toLowerCase(),
    externalId: externalId || null,
    startedAt: startedAt || new Date().toISOString(),
    title: title || null,
    category: category || null,
    source: source || null,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
  });
  return sessionId;
}

function closeStreamSession({ id, platform, endedAt, metadata } = {}) {
  const row = id
    ? db.prepare('SELECT id, metadata FROM stream_sessions WHERE id = ?').get(id)
    : db.prepare(`SELECT id, metadata FROM stream_sessions WHERE platform = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`).get(String(platform || 'other').toLowerCase());
  if (!row) return null;
  const mergedMetadata = metadata === undefined
    ? row.metadata
    : JSON.stringify({ ...parseJsonColumn(row.metadata, {}), ...metadata });
  db.prepare(`
    UPDATE stream_sessions
    SET ended_at = @endedAt,
        metadata = @metadata,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ id: row.id, endedAt: endedAt || new Date().toISOString(), metadata: mergedMetadata });
  return row.id;
}

function addViewerSnapshot({ timestamp, platform, sessionId, viewerCount, totalViewers, source, metadata }) {
  const count = Number(viewerCount);
  if (!Number.isFinite(count) || count < 0) return null;
  const occurredAt = timestamp || new Date().toISOString();
  const normalizedPlatform = String(platform || 'other').toLowerCase();
  const resolvedSessionId = sessionId || findActiveStreamSessionId(normalizedPlatform, occurredAt);
  return Number(db.prepare(`
    INSERT INTO viewer_snapshots (timestamp, platform, session_id, viewer_count, total_viewers, source, metadata)
    VALUES (@timestamp, @platform, @sessionId, @viewerCount, @totalViewers, @source, @metadata)
  `).run({
    timestamp: occurredAt,
    platform: normalizedPlatform,
    sessionId: resolvedSessionId,
    viewerCount: Math.round(count),
    totalViewers: Number.isFinite(Number(totalViewers)) ? Math.round(Number(totalViewers)) : null,
    source: source || null,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
  }).lastInsertRowid);
}

function listStreamSessionsForRange({ since, before } = {}) {
  const conditions = [];
  const params = {};
  if (since) { conditions.push('julianday(COALESCE(ended_at, started_at)) >= julianday(@since)'); params.since = since; }
  if (before) { conditions.push('julianday(started_at) < julianday(@before)'); params.before = before; }
  return db.prepare(`SELECT * FROM stream_sessions ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY started_at DESC`).all(params).map((row) => ({
    ...row,
    metadata: parseJsonColumn(row.metadata, {}),
  }));
}

function listViewerSnapshotsForRange({ since, before } = {}) {
  const conditions = [];
  const params = {};
  if (since) { conditions.push('julianday(timestamp) >= julianday(@since)'); params.since = since; }
  if (before) { conditions.push('julianday(timestamp) < julianday(@before)'); params.before = before; }
  return db.prepare(`
    SELECT MIN(id) AS id, MIN(timestamp) AS timestamp, platform, session_id,
           ROUND(AVG(viewer_count)) AS viewer_count, MAX(total_viewers) AS total_viewers,
           source, COUNT(*) AS sample_count, NULL AS metadata
    FROM viewer_snapshots
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    GROUP BY strftime('%Y-%m-%dT%H:%M', timestamp), platform, session_id, source
    ORDER BY timestamp DESC
  `).all(params).map((row) => ({
    ...row,
    metadata: parseJsonColumn(row.metadata, {}),
  }));
}

function findActiveStreamSessionId(platform, timestamp) {
  if (!platform) return null;
  const direct = db.prepare(`
    SELECT id FROM stream_sessions
    WHERE platform = @platform AND ended_at IS NULL AND julianday(started_at) <= julianday(@timestamp)
    ORDER BY started_at DESC LIMIT 1
  `).get({ platform, timestamp });
  if (direct) return direct.id;
  return db.prepare(`
    SELECT id FROM stream_sessions
    WHERE platform = 'obs' AND ended_at IS NULL AND julianday(started_at) <= julianday(@timestamp)
    ORDER BY started_at DESC LIMIT 1
  `).get({ timestamp })?.id || null;
}

function parseEngagementEventRow(row) {
  return {
    ...row,
    roles: parseJsonColumn(row.roles, []),
    metadata: row.aggregate_count
      ? { ...parseJsonColumn(row.metadata, {}), messageCount: Number(row.aggregate_count) }
      : parseJsonColumn(row.metadata, {}),
  };
}

function parseJsonColumn(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function getSongRequest(id) {
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) return null;
  return db.prepare(`
    SELECT id, timestamp, platform, platform_user_id, username, query,
           spotify_track_id, spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id,
           status, response, error_code
    FROM song_requests
    WHERE id = ?
  `).get(requestId) || null;
}

function deleteSongRequest(id) {
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) return false;
  return db.prepare('DELETE FROM song_requests WHERE id = ?').run(requestId).changes > 0;
}

function getLastAcceptedSongRequest() {
  return db.prepare(`
    SELECT id, timestamp, platform, platform_user_id, username, query,
           spotify_track_id, spotify_uri, track_name, artists, album_name, album_art_url, user_profile_image_url, roles, session_id,
           status, response
    FROM song_requests
    WHERE status IN ('accepted', 'partial', 'dry-run')
    ORDER BY id DESC
    LIMIT 1
  `).get() || null;
}

function hasAcceptedTrack(trackId) {
  if (!trackId) return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM song_requests
    WHERE spotify_track_id = ? AND status IN ('accepted', 'partial')
    LIMIT 1
  `).get(trackId));
}

const schema = {
  getAllConfig,
  getConfigValue,
  setConfigValue,
  addAuditLog,
  getAuditLog,
  listOverrides,
  upsertOverride,
  deleteOverride,
  getSpotifyAuth,
  saveSpotifyAuth,
  clearSpotifyAuth,
  addSongRequest,
  listSongRequests,
  listAllSongRequests,
  listSongRequestsForRange,
  addEngagementEvent,
  listEngagementEvents,
  listEngagementEventsForRange,
  openStreamSession,
  closeStreamSession,
  addViewerSnapshot,
  listStreamSessionsForRange,
  listViewerSnapshotsForRange,
  getSongRequest,
  deleteSongRequest,
  getLastAcceptedSongRequest,
  hasAcceptedTrack,
};

module.exports = schema;
