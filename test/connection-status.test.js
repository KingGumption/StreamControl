const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ConnectionStatusRegistry,
  WebSocketConnectionMonitor,
} = require('../src/connection-status');

class FakeWebSocket extends EventEmitter {
  static instances = [];

  constructor(url) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {}
}

test('WebSocket monitor reports real connection and event transitions', () => {
  FakeWebSocket.instances = [];
  const registry = new ConnectionStatusRegistry();
  registry.define('test', { configured: true });
  const monitor = new WebSocketConnectionMonitor({
    service: 'test',
    url: 'ws://127.0.0.1:12345/',
    registry,
    WebSocketImpl: FakeWebSocket,
    reconnectDelayMs: 1000,
  });

  monitor.start();
  assert.equal(registry.snapshot().test.state, 'connecting');

  const socket = FakeWebSocket.instances[0];
  socket.emit('open');
  assert.equal(registry.snapshot().test.state, 'connected');
  assert.ok(registry.snapshot().test.lastConnectedAt);

  socket.emit('message', Buffer.from('{}'));
  assert.ok(registry.snapshot().test.lastEventAt);

  socket.emit('close', 1006);
  assert.equal(registry.snapshot().test.state, 'disconnected');
  assert.equal(registry.snapshot().test.reconnectAttempt, 1);
  monitor.stop();
});

test('WebSocket monitor reports connection errors without leaking multiline output', () => {
  FakeWebSocket.instances = [];
  const registry = new ConnectionStatusRegistry();
  registry.define('test', { configured: true });
  const monitor = new WebSocketConnectionMonitor({
    service: 'test',
    url: 'ws://127.0.0.1:12345/',
    registry,
    WebSocketImpl: FakeWebSocket,
  });

  monitor.start();
  FakeWebSocket.instances[0].emit('error', new Error('offline\nextra'));
  const status = registry.snapshot().test;
  assert.equal(status.state, 'disconnected');
  assert.equal(status.detail, 'Connection error: offline extra');
  monitor.stop();
});
