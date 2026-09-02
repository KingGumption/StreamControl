const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionToken, verifySessionToken } = require('../src/admin-auth');

test('creates signed admin sessions that expire and reject tampering', () => {
  const secret = 's'.repeat(40);
  const token = createSessionToken(secret, 2000);
  assert.equal(verifySessionToken(token, secret, 1000), true);
  assert.equal(verifySessionToken(token, secret, 2000), false);
  assert.equal(verifySessionToken(`${token}x`, secret, 1000), false);
  assert.equal(verifySessionToken(token, 'x'.repeat(40), 1000), false);
});
