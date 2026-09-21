const crypto = require('node:crypto');
const path = require('node:path');

const COOKIE_NAME = 'stream_control_session';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function createAdminAuth(config, { now = () => Date.now() } = {}) {
  const access = require('./moderator-access');
  const attempts = new Map();
  const enabled = config.mode === 'cloud';
  const token = req => parseCookies(req.headers.cookie)[COOKIE_NAME];
  const identity = req => enabled ? access.session(token(req), now()) : {id:'owner',username:'Owner',role:'owner'};

  function loginPage(req, res) {
    const user = identity(req);
    if (user) return res.redirect(user.role === 'owner' ? '/admin' : '/admin/games');
    return res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
  }

  async function login(req, res) {
    if (!enabled) return res.redirect('/admin');
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    for (const [id, item] of attempts) if (item.resetAt <= now()) attempts.delete(id);
    if (!attempts.has(key) && attempts.size >= 10000) return res.status(429).send('Try again later.');
    const record = attempts.get(key) || { count: 0, resetAt: now() + 15 * 60 * 1000 };
    if (record.resetAt <= now()) { record.count = 0; record.resetAt = now() + 15 * 60 * 1000; }
    if (record.count >= 8) return res.status(429).send('Too many login attempts. Try again later.');
    record.count += 1;
    attempts.set(key, record);
    const username = String(req.body?.username || 'owner').trim().toLowerCase();
    const password = String(req.body?.password || '').slice(0,1024);
    const user = username === 'owner'
      ? (safeSecretEqual(password,config.admin.password) ? {id:'owner',role:'owner'} : null)
      : await access.authenticate(username,password);
    if (!user) {
      return res.redirect('/admin/login?error=1');
    }
    attempts.delete(key);
    res.setHeader('Set-Cookie', serializeSessionCookie(access.issue(user,now()), SESSION_MAX_AGE_SECONDS));
    return res.redirect(user.role === 'games' ? '/admin/games' : safeReturnPath(req.body?.returnTo));
  }

  function logout(req, res) {
    access.logout(token(req));
    res.setHeader('Set-Cookie', serializeSessionCookie('', 0));
    return res.redirect('/admin/login');
  }

  function requireAuthentication(req, res, next) {
    req.identity = identity(req);
    if (req.identity) return next();
    if (String(req.get('accept') || '').includes('text/html')) {
      return res.redirect(`/admin/login?returnTo=${encodeURIComponent(req.originalUrl || '/admin')}`);
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  function requireSameOrigin(req, res, next) {
    if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    // JSON API clients without Origin remain supported; browser form mutations
    // must include an exact same-origin Origin header.
    if (!origin && req.is?.('application/json') && req.get('sec-fetch-site') !== 'cross-site') return next();
    try {
      if (new URL(origin).origin === new URL(config.publicBaseUrl).origin) return next();
    } catch { /* Invalid origins are rejected below. */ }
    return res.status(403).json({ ok: false, error: 'Cross-origin request rejected' });
  }

  function requireCapability(req,res,next) {
    if (req.identity?.role === 'owner') return next();
    const pathname = req.path;
    const read = ['GET','HEAD'].includes(req.method);
    const reads = new Set(['/games','/quiz','/quiz/state','/king-of-the-hill','/king-of-the-hill/state','/games/session','/games/connections']);
    const writes = new Set(['/quiz/audio','/quiz/open','/quiz/next','/quiz/stop','/king-of-the-hill/start','/king-of-the-hill/stop','/king-of-the-hill/next','/king-of-the-hill/settings']);
    if (read && reads.has(pathname)) return next();
    if (req.method === 'POST' && writes.has(pathname) && access.handoff(now()).enabled) return next();
    return res.status(403).json({ok:false,error:'Owner access required, or moderator handoff is disabled.'});
  }
  return { loginPage, login, logout, requireAuthentication, requireSameOrigin, requireCapability };
}

function createSessionToken(secret, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ expiresAt, nonce: crypto.randomBytes(12).toString('base64url') })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token, secret, currentTime = Date.now()) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeSecretEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(decoded.expiresAt) && decoded.expiresAt > currentTime;
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  return String(header).split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 1) return cookies;
    const key = part.slice(0, index).trim();
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { cookies[key] = ''; }
    return cookies;
  }, {});
}

function serializeSessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function safeReturnPath(value) {
  const pathValue = String(value || '/admin');
  return pathValue === '/admin' || pathValue.startsWith('/admin/') || pathValue.startsWith('/admin?') ? pathValue : '/admin';
}

function safeSecretEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left)).digest();
  const rightHash = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

module.exports = { createAdminAuth, createSessionToken, verifySessionToken };
