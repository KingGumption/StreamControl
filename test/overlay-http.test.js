const test = require('node:test');
const assert = require('node:assert/strict');
const artManifest = require('../public/hill-art-official/manifest.json');

const { app } = require('../src/admin');

test('serves the transparent overlay, mascot asset, and preview trigger', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  }));

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const overlay = await fetch(`${base}/overlay`);
  assert.equal(overlay.status, 200);
  assert.match(await overlay.text(), /new EventSource\('\/overlay\/events'\)/);

  const mascot = await fetch(`${base}/assets/pig-frame-crowned-v2.png`);
  assert.equal(mascot.status, 200);
  assert.match(mascot.headers.get('content-type'), /^image\/png/);

  const invalidAvatar = await fetch(`${base}/overlay/avatar/twitch/not-valid!`);
  assert.equal(invalidAvatar.status, 404);

  const config = await fetch(`${base}/admin/config`);
  const configPayload = await config.json();
  assert.equal(typeof configPayload.settings.allowExplicitTracks, 'boolean');
  assert.equal(typeof configPayload.settings.songRequestsEnabled, 'boolean');

  const invalidSetting = await fetch(`${base}/admin/settings/explicit-tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowExplicitTracks: 'yes' }),
  });
  assert.equal(invalidSetting.status, 400);

  const invalidRequestSetting = await fetch(`${base}/admin/settings/song-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songRequestsEnabled: 'yes' }),
  });
  assert.equal(invalidRequestSetting.status, 400);

  const hillOverlay = await fetch(`${base}/king-of-the-hill`);
  assert.equal(hillOverlay.status, 200);
  const hillOverlayHtml = await hillOverlay.text();
  assert.match(hillOverlayHtml, /king-of-the-hill\/events/);
  assert.match(hillOverlayHtml, /platformVotes/);
  assert.match(hillOverlayHtml, /#9146ff/);
  assert.match(hillOverlayHtml, /#ff3040/);
  assert.match(hillOverlayHtml, /#25f4ee/);

  const hillState = await fetch(`${base}/king-of-the-hill/state`);
  assert.equal(hillState.status, 200);
  assert.equal(typeof (await hillState.json()).game.running, 'boolean');

  const hillArt = await fetch(`${base}/king-of-the-hill/art/topics/monster.svg`);
  assert.equal(hillArt.status, 200);
  assert.match(hillArt.headers.get('content-type'), /image\/svg\+xml/);

  const cachedArt = Object.values(artManifest.assets)[0];
  const cachedArtResponse = await fetch(`${base}/assets/hill-art-official/${cachedArt.file}`);
  assert.equal(cachedArtResponse.status, 200);
  assert.match(cachedArtResponse.headers.get('content-type'), /^image\//);

  const hillAdmin = await fetch(`${base}/admin/king-of-the-hill`);
  assert.equal(hillAdmin.status, 200);
  assert.match(await hillAdmin.text(), /KingGumption King of the Hill/);

  const hillAdminState = await fetch(`${base}/admin/king-of-the-hill/state`);
  assert.equal(hillAdminState.status, 200);
  const hillAdminPayload = await hillAdminState.json();
  assert.equal(typeof hillAdminPayload.game.running, 'boolean');
  assert.equal(typeof hillAdminPayload.game.timings.topicSeconds, 'number');

  const invalidHillTimings = await fetch(`${base}/admin/king-of-the-hill/timings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicSeconds: 4, roundSeconds: 30, championSeconds: 8 }),
  });
  assert.equal(invalidHillTimings.status, 400);

  const invalidHillSettings = await fetch(`${base}/admin/king-of-the-hill/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundCount: 10, topicSeconds: 30, roundSeconds: 30, championSeconds: 8 }),
  });
  assert.equal(invalidHillSettings.status, 400);

  const eventStream = await fetch(`${base}/overlay/events`);
  assert.equal(eventStream.status, 200);
  const reader = eventStream.body.getReader();
  const decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /connected/);

  const preview = await fetch(`${base}/admin/overlay/preview`, { method: 'POST' });
  assert.equal(preview.status, 200);
  const payload = await preview.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.preview.track.name);

  const eventChunk = await Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Overlay event timed out')), 1000)),
  ]);
  const eventText = decoder.decode(eventChunk.value);
  assert.match(eventText, /event: song-added/);
  assert.match(eventText, /Dancing in the Pigpen|\"track\"/);
  await reader.cancel();
  const analyticsPage = await fetch(`${base}/admin/analytics`);
  assert.equal(analyticsPage.status, 200);
  const analyticsHtml = await analyticsPage.text();
  assert.match(analyticsHtml, /Analytics Studio/);
  assert.match(analyticsHtml, /Granular Activity Ledger/);

  const analyticsSummary = await fetch(`${base}/admin/analytics/summary`);
  assert.equal(analyticsSummary.status, 200);
  const analyticsPayload = await analyticsSummary.json();
  assert.equal(typeof analyticsPayload.totalRequests, 'number');
  assert.equal(typeof analyticsPayload.acceptedRequests, 'number');
  assert.equal(typeof analyticsPayload.platformBreakdown.twitch, 'number');
  assert.equal(typeof analyticsPayload.overview.interactions, 'number');
  assert.equal(typeof analyticsPayload.tools.kingOfTheHill.votes, 'number');
  assert.equal(typeof analyticsPayload.tools.polaroid.captures, 'number');
  assert.ok(Array.isArray(analyticsPayload.sessions));
  assert.ok(Array.isArray(analyticsPayload.activity));

  const polaroidAdmin = await fetch(`${base}/admin/polaroid`);
  assert.equal(polaroidAdmin.status, 200);
  const polaroidAdminHtml = await polaroidAdmin.text();
  assert.match(polaroidAdminHtml, /Polaroid Redeem/);
  assert.match(polaroidAdminHtml, /id="deliver-discord" type="checkbox" checked/);

  const polaroidControl = await fetch(`${base}/polaroid/assets/control.js`);
  assert.equal(polaroidControl.status, 200);
  assert.match(await polaroidControl.text(), /deliverToDiscord/);

  const polaroidStatus = await fetch(`${base}/admin/polaroid/status`);
  assert.equal(polaroidStatus.status, 200);
  const polaroidStatusPayload = await polaroidStatus.json();
  assert.equal(typeof polaroidStatusPayload.obsConnected, 'boolean');
  assert.equal(polaroidStatusPayload.overlayUrl, 'http://127.0.0.1:8787/polaroid');

  const polaroidOverlay = await fetch(`${base}/polaroid`);
  assert.equal(polaroidOverlay.status, 200);
  assert.match(await polaroidOverlay.text(), /polaroid\/assets\/overlay\.js/);

  const polaroidScript = await fetch(`${base}/polaroid/assets/overlay.js`);
  assert.equal(polaroidScript.status, 200);
  assert.match(await polaroidScript.text(), /EventSource\('\/polaroid\/events'\)/);
});
