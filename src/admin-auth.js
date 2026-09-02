const crypto = require('node:crypto');
const path = require('node:path');

const COOKIE_NAME = 'stream_control_session';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function createAdminAuth(config, { now = () => Date.now() } = {}) {
  const attempts = new Map();
  const enabled = config.mode === 'cloud';

  function loginPage(req, res) {
    if (!enabled || isAuthenticated(req, config, now())) return res.redirect('/admin');
    return res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
  }

  function login(req, res) {
    if (!enabled) return res.redirect('/admin');
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const record = attempts.get(key) || { count: 0, resetAt: now() + 15 * 60 * 1000 };
    if (record.resetAt <= now()) { record.count = 0; record.resetAt = now() + 15 * 60 * 1000; }
    if (record.count >= 8) return res.status(429).send('Too many login attempts. Try again later.');
    if (!safeSecretEqual(String(req.body?.password || '').slice(0, 1024), config.admin.password)) {
      record.count += 1;
      attempts.set(key, record);
      return res.redirect('/admin/login?error=1');
    }
    attempts.delete(key);
    const token = createSessionToken(config.admin.sessionSecret, now() + SESSION_MAX_AGE_SECONDS * 1000);
    res.setHeader('Set-Cookie', serializeSessionCookie(token, SESSION_MAX_AGE_SECONDS));
    return res.redirect(safeReturnPath(req.body?.returnTo));
  }

  function logout(req, res) {
    res.setHeader('Set-Cookie', serializeSessionCookie('', 0));
    return res.redirect('/admin/login');
  }

  function requireAuthentication(req, res, next) {
    if (!enabled || isAuthenticated(req, config, now())) return next();
    if (String(req.get('accept') || '').includes('text/html')) {
      return res.redirect(`/admin/login?returnTo=${encodeURIComponent(req.originalUrl || '/admin')}`);
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  function requireSameOrigin(req, res, next) {
    if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
      if (new URL(origin).origin === new URL(config.publicBaseUrl).origin) return next();
    } catch { /* Invalid origins are rejected below. */ }
    return res.status(403).json({ ok: false, error: 'Cross-origin request rejected' });
  }

  return { loginPage, login, logout, requireAuthentication, requireSameOrigin };
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

function isAuthenticated(req, config, currentTime) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME], config.admin.sessionSecret, currentTime);
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
