const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { streamEvents } = require('../src/sse');

test('SSE permits large initial rosters but disconnects an accumulating slow client', () => {
  const response = new EventEmitter();
  let destroyed = false, unsubscribed = false, send;
  Object.assign(response, {
    writableLength: 0, set() {}, flushHeaders() {},
    write(chunk) { this.writableLength += Buffer.byteLength(chunk); return false; },
    destroy() { destroyed = true; this.emit('close'); },
  });
  streamEvents({}, response, {
    name: 'quiz-state', initial: () => ({ roster: 'x'.repeat(20000) }),
    subscribe(listener) { send = listener; return () => { unsubscribed = true; }; },
  });
  assert.equal(destroyed, false);
  response.writableLength = 1024 * 1024;
  send({ phase: 'question' });
  assert.equal(destroyed, true);
  assert.equal(unsubscribed, true);
});
