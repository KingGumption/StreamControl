const http = require('node:http');
const { once } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { BridgeHub } = require('../src/bridge-hub');
const { RemoteObsClient } = require('../src/remote-obs');

test('authenticates the connector and relays services plus OBS requests in both directions', async (context) => {
  const token = 'b'.repeat(40);
  const hub = new BridgeHub({ token, requestTimeoutMs: 1000 });
  const server = http.createServer((req, res) => res.end('ok'));
  hub.attach(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}/bridge`;
  const connector = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
  await once(connector, 'open');
  context.after(() => {
    connector.terminate();
    hub.close();
    server.close();
  });

  const serviceState = once(hub, 'service-state');
  connector.send(JSON.stringify({ type: 'service.state', service: 'streamerbot', connected: true, detail: 'Ready' }));
  assert.deepEqual(await serviceState, ['streamerbot', { connected: true, detail: 'Ready' }]);

  const forwarded = once(hub, 'service-message');
  connector.send(JSON.stringify({ type: 'service.message', service: 'tikfinity', payload: '{"event":"chat"}' }));
  assert.deepEqual(await forwarded, ['tikfinity', '{"event":"chat"}']);

  const connectorMessage = once(connector, 'message');
  assert.equal(hub.sendService('streamerbot', '{"request":"Subscribe"}'), true);
  assert.deepEqual(JSON.parse((await connectorMessage)[0].toString()), {
    type: 'service.send', service: 'streamerbot', payload: '{"request":"Subscribe"}',
  });

  const remoteObs = new RemoteObsClient(hub);
  const obsRequest = once(connector, 'message');
  const resultPromise = remoteObs.call('GetStreamStatus');
  const request = JSON.parse((await obsRequest)[0].toString());
  assert.equal(request.type, 'obs.request');
  assert.equal(request.method, 'GetStreamStatus');
  connector.send(JSON.stringify({ type: 'obs.response', id: request.id, ok: true, data: { outputActive: true } }));
  assert.deepEqual(await resultPromise, { outputActive: true });

  const obsEvent = once(remoteObs, 'StreamStateChanged');
  connector.send(JSON.stringify({ type: 'obs.event', event: 'StreamStateChanged', data: { outputActive: false } }));
  assert.deepEqual((await obsEvent)[0], { outputActive: false });
});

test('rejects bridge connections with the wrong token', async (context) => {
  const hub = new BridgeHub({ token: 'c'.repeat(40) });
  const server = http.createServer();
  hub.attach(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => { hub.close(); server.close(); });
  const connector = new WebSocket(`ws://127.0.0.1:${server.address().port}/bridge`, {
    headers: { Authorization: 'Bearer wrong' },
  });
  connector.on('error', () => {});
  const [, response] = await once(connector, 'unexpected-response');
  assert.equal(response.statusCode, 401);
  response.resume();
  connector.terminate();
});
