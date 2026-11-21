const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../public/games-overlay.js'), 'utf8');
function openSource(pathname) {
  const host = {
    dataset: {}, classList: {toggle() {}},
    replaceChildren() { this.frame = null; },
    append(frame) { this.frame = frame; }
  };
  let events;
  class EventSource {
    constructor() { events = this; }
    addEventListener(name, callback) { this[name] = callback; }
  }
  vm.runInNewContext(script, {
    location: {pathname, search: '?muted=1'}, URLSearchParams, EventSource,
    document: {getElementById: () => host, createElement: () => ({})}
  });
  return {host, disconnect: () => events.onerror(), select: state => events['game-selection']({data:JSON.stringify(state)})};
}

test('full and corner sources follow one selection, including after a reconnect', () => {
  const combined = openSource('/games'), full = openSource('/games/full'), corner = openSource('/games/corner/');
  const select = state => [combined, full, corner].forEach(source => source.select(state));
  select({active:'word',layout:'compact'});
  assert.equal(full.host.frame, undefined);
  assert.equal(corner.host.frame.src, '/word-vault?muted=1&layout=compact');
  assert.equal(combined.host.frame.src, corner.host.frame.src);
  const frame = corner.host.frame;
  select({active:'word',layout:'compact'});
  assert.equal(corner.host.frame,frame);
  corner.disconnect();
  assert.equal(corner.host.frame,null);
  select({active:'word'});
  assert.equal(corner.host.frame,null);
  assert.equal(full.host.frame.src,'/word-vault?muted=1');
  assert.equal(combined.host.frame.src,full.host.frame.src);
  select({active:'split',layout:'compact'});
  assert.equal(full.host.frame,null);
  assert.equal(corner.host.frame.src,'/arcade-corner?muted=1&layout=compact');
  select({active:null});
  for(const source of [combined, full, corner]) assert.equal(source.host.frame,null);
});
