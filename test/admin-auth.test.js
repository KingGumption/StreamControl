const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionToken, verifySessionToken, serializeSessionCookie } = require('../src/admin-auth');

test('creates signed admin sessions that expire and reject tampering', () => {
  const secret = 's'.repeat(40);
  const token = createSessionToken(secret, 2000);
  assert.equal(verifySessionToken(token, secret, 1000), true);
  assert.equal(verifySessionToken(token, secret, 2000), false);
  assert.equal(verifySessionToken(`${token}x`, secret, 1000), false);
  assert.equal(verifySessionToken(token, 'x'.repeat(40), 1000), false);
});

test('admin session survives a provider redirect without allowing cross-site posts', () => {
  const cookie = serializeSessionCookie('session-token', 3600);
  assert.match(cookie, /; Path=\/admin;/);
  assert.match(cookie, /; HttpOnly;/);
  assert.match(cookie, /; Secure;/);
  assert.match(cookie, /; SameSite=Lax$/);
});
