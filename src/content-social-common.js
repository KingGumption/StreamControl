const crypto = require('node:crypto');
const {getConfigValue, setConfigValue} = require('./db');
const coach = require('./content-coach');
const store = require('./content-coach-store');

const STATE_AGE = 30 * 60 * 1000;

function createVault(platform, secret, now = () => Date.now()) {
  const key = crypto.createHash('sha256').update(`content-coach-${platform}-v1:${secret}`).digest();
  const storageKey = `content_${platform}_auth_v1`;
  const pendingKey = `content_${platform}_pending_v1`;
  const hash = value => crypto.createHash('sha256').update(value).digest('base64url');
  const sign = value => crypto.createHmac('sha256', key).update(value).digest('base64url');
  function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map(item => item.toString('base64url')).join('.');
  }
  function read() {
    const saved = getConfigValue(storageKey);
    if (!saved) return null;
    const parts = String(saved).split('.');
    if (parts.length !== 3) throw Error(`Stored ${platform} connection is invalid. Reconnect it.`);
    const [iv, tag, body] = parts.map(item => Buffer.from(item, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString());
  }
  function save(value) { setConfigValue(storageKey, seal(value)); }
  function clear() { setConfigValue(storageKey, null); }
  function state(sessionCookie) {
    if (!sessionCookie) throw Error('Sign in before connecting an account.');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const payload = Buffer.from(JSON.stringify({nonce, expiresAt: now() + STATE_AGE, session: hash(sessionCookie)})).toString('base64url');
    setConfigValue(pendingKey, hash(nonce));
    return `${payload}.${sign(payload)}`;
  }
  function verify(stateValue, sessionCookie) {
    const fail = () => { throw Error(`${platform} authorisation expired or belongs to another session. Connect again.`); };
    const [payload, signature, extra] = String(stateValue || '').split('.');
    if (!payload || !signature || extra || !sessionCookie) fail();
    const expected = Buffer.from(sign(payload), 'base64url');
    let actual;
    try { actual = Buffer.from(signature, 'base64url'); } catch { fail(); }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) fail();
    let entry;
    try { entry = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { fail(); }
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now() || entry.expiresAt > now() + STATE_AGE || entry.session !== hash(sessionCookie) || getConfigValue(pendingKey) !== hash(entry.nonce || '')) fail();
    setConfigValue(pendingKey, null);
  }
  return {read, save, clear, state, verify};
}

async function requestJson(fetchImpl, url, options = {}, platform = 'Provider') {
  const response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(15000)});
  let data;
  try { data = await response.json(); } catch { throw Error(`${platform} returned an invalid response.`); }
  if (!response.ok || data.error) {
    const message = data.error?.message || data.error_message || data.error_description || data.error || `HTTP ${response.status}`;
    throw Error(`${platform} request failed: ${String(message).slice(0, 180)}`);
  }
  return data;
}

function observationWindows(publishedAt, observedAt) {
  const age = (Date.parse(observedAt) - Date.parse(publishedAt)) / 3600000;
  if (age < 0) throw Error('Publication is in the future.');
  return ['lifetime', ...Object.entries(coach.WINDOWS).filter(([, [low, high]]) => age >= low && age <= high).map(([name]) => name)];
}

function saveObservations(platform, posts, observedAt, source, now = Date.now()) {
  const existing = store.read().records.filter(row => row.platform === platform);
  const byUrl = new Map(existing.map(row => [row.url, row]));
  const byId = new Map(existing.map(row => [row.id, row]));
  const rows = [], skipped = [];
  for (const post of posts) {
    try {
      const url = coach.link(post.url, platform);
      const previous = byUrl.get(url);
      const common = {
        platform, url, format: previous?.format || post.format,
        title: String(post.title || previous?.title || `${platform} video`).slice(0, 300),
        publishedAt: previous?.publishedAt || post.publishedAt, observedAt,
        traffic: previous?.traffic || 'unknown',
        durationSeconds: previous?.durationSeconds ?? post.durationSeconds ?? null,
        group: previous?.group || '', topic: previous?.topic || '', hook: previous?.hook || '', notes: previous?.notes || '',
      };
      const windows = common.durationSeconds ? observationWindows(common.publishedAt, observedAt) : ['lifetime'];
      for (const window of windows) {
        const id = JSON.stringify([platform, url, window]);
        const old = byId.get(id);
        const metrics = Object.fromEntries(Object.entries(post.metrics || {}).filter(([, value]) => value != null));
        rows.push(coach.normalize({...old, ...common, ...metrics, window,
          source: old?.source && !old.source.includes(source) ? `${source}; other metrics: ${old.source}`.slice(0, 300) : source}, now));
      }
    } catch (error) { skipped.push({id: String(post.id || 'unknown').slice(0, 60), reason: error.message}); }
  }
  if (rows.length) {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      for (let attempt = 0; attempt < 2; attempt++) {
        try { store.save({revision: store.read().revision, type: 'import', rows: batch}); break; }
        catch (error) { if (error.status !== 409 || attempt) throw error; }
      }
    }
  }
  return {posts: new Set(rows.map(row => row.url)).size, observations: rows.length, skipped};
}

module.exports = {createVault, requestJson, saveObservations};
