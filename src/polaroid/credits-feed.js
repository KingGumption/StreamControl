const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 16 * 1024 * 1024;
function creditsToken(bridgeToken, explicitToken = '') {
  return explicitToken || (bridgeToken ? crypto.createHmac('sha256', bridgeToken).update('polaroid-credits-v1').digest('hex') : '');
}
function parseFilename(filename) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_([^/\\]+)\.jpg$/.exec(filename);
  if (!match || /^(test[-_ ]?viewer|test)$/i.test(match[6])) return null;
  const createdAt = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
  if (!Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) return null;
  return { filename, createdAt, name: match[6] };
}
function parseWindow(start, end) {
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/;
  if (typeof start !== 'string' || typeof end !== 'string' || !utc.test(start) || !utc.test(end)) throw new Error('Use UTC start and end timestamps.');
  const from = Date.parse(start), to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > MAX_WINDOW_MS) throw new Error('The stream window must be between 0 and 48 hours.');
  return { from, to };
}
async function recordCapture(capturesDir, { filename, name, createdAt, image, isTest }) {
  if (isTest) return;
  if (!parseFilename(filename)) throw new Error('Invalid capture filename.');
  const record = { version: 1, filename, name, createdAt, sha256: crypto.createHash('sha256').update(image).digest('hex') };
  const file = path.join(capturesDir, filename + '.json');
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(record), { flag: 'wx' });
  await fs.rename(temporary, file);
}
async function listCaptures(capturesDir, start, end) {
  const { from, to } = parseWindow(start, end);
  let files;
  try { files = await fs.readdir(capturesDir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const photos = [];
  for (const filename of files.sort()) {
    const parsed = parseFilename(filename);
    if (!parsed || Date.parse(parsed.createdAt) < from || Date.parse(parsed.createdAt) > to) continue;
    const stat = await fs.stat(path.join(capturesDir, filename));
    if (!stat.isFile() || stat.size > MAX_PHOTO_BYTES) throw new Error('A capture cannot be downloaded.');
    let record = parsed;
    try {
      const saved = JSON.parse(await fs.readFile(path.join(capturesDir, filename + '.json'), 'utf8'));
      if (saved.filename === filename && typeof saved.name === 'string') record = { ...parsed, name: saved.name, sha256: saved.sha256 };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    photos.push({ ...record, bytes: stat.size, path: '/api/polaroid-credits/photo/' + encodeURIComponent(filename) });
  }
  return photos;
}
function registerCreditsFeed(app, { capturesDir, token }) {
  function authorize(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!token) return res.status(503).json({ error: 'Credits access is not configured.' });
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const a = Buffer.from(supplied), b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }
  app.get('/api/polaroid-credits', authorize, async (req, res) => {
    try { parseWindow(req.query.start, req.query.end); } catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const photos = await listCaptures(capturesDir, req.query.start, req.query.end);
      res.json({ version: 1, start: req.query.start, end: req.query.end, photos, storageDirectory: capturesDir });
    } catch { res.status(500).json({ error: 'Unable to read the Polaroid index.' }); }
  });
  app.get('/api/polaroid-credits/photo/:filename', authorize, (req, res) => {
    if (!parseFilename(req.params.filename)) return res.status(400).json({ error: 'Invalid filename.' });
    res.sendFile(path.join(capturesDir, req.params.filename), error => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).end();
    });
  });
}
module.exports = { creditsToken, parseFilename, parseWindow, recordCapture, listCaptures, registerCreditsFeed };
