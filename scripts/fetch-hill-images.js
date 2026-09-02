const fs = require('node:fs');
const path = require('node:path');
const { TOPICS } = require('../src/hill-game');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'hill-art');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const API_URL = 'https://commons.wikimedia.org/w/api.php';

const QUERY_OVERRIDES = {
  original: 'Monster Energy drink can photograph',
  'mango-loco': 'mango tropical drink photograph',
  'pipeline-punch': 'guava juice photograph',
  'ultra-white': 'lemon sparkling water photograph',
  'pacific-punch': 'fruit punch photograph',
  'aussie-lemonade': 'lemonade photograph',
  khaotic: 'orange citrus drink photograph',
  monarch: 'peach juice photograph',
  'ultra-paradise': 'kiwi juice photograph',
  'nitro-super-dry': 'lime soda photograph',
  halo: 'astronaut helmet',
  gta: 'sports car city photograph',
  'resident-evil': 'zombie cosplay photograph',
  'call-of-duty': 'modern military soldier combat photograph',
  minecraft: 'Minecraft costume photograph',
  'steam-deck': 'portable video game console',
  'pick-mix': 'colourful candy sweets photograph',
  'hot-dog': 'hot dog food photograph',
  maltesers: 'chocolate candy balls',
  'fizzy-drink': 'soda glass photograph',
  churros: 'churros food photograph',
  flight: 'skydiver flying photograph',
  invisibility: 'camouflage person photograph',
  teleportation: 'long exposure light portal photograph',
  strength: 'strongman lifting photograph',
  time: 'hourglass clock photograph',
  'mind-reading': 'human brain model photograph',
  shapeshifting: 'chameleon changing colour photograph',
  'super-speed': 'sprinter motion blur photograph',
  healing: 'medical bandage heart photograph',
  elements: 'fire and water photograph',
  playstation: 'PlayStation console photograph',
  xbox: 'Xbox console photograph',
  switch: 'Nintendo Switch console photograph',
  pc: 'gaming PC computer photograph',
  sega: 'Sega Mega Drive console photograph',
  'game-boy': 'Nintendo Game Boy photograph',
  'steam-deck': 'Steam Deck console photograph',
  arcade: 'arcade cabinet photograph',
  mobile: 'smartphone video game screen photograph',
  'nintendo-64': 'Nintendo 64 console photograph',
};

const EXACT_FILES = {
  'steam-deck': 'File:Steam Deck (front).png',
  'mango-loco': 'File:Glass of Mango Juice.jpg',
  gta: 'File:Sports Car (28907622603).jpg',
  'resident-evil': 'File:The Walking Dead Cosplay.jpg',
  healing: 'File:Bandaging an injured arm as part of a course in first aid 8d21269v.jpg',
  chocolate: 'File:Chocolate bar.png',
  'call-of-duty': 'File:170720-Z-NI803-0689.jpg',
  mobile: 'File:Playing with smartphone.jpg',
};

const REFRESH_IDS = new Set(
  String(process.argv.find((argument) => argument.startsWith('--refresh=')) || '')
    .replace(/^--refresh=/, '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const previous = readManifest();
  const manifest = { generatedAt: new Date().toISOString(), provider: 'Wikimedia Commons', assets: {} };
  const total = TOPICS.reduce((sum, topic) => sum + topic.entries.length, 0);
  let completed = 0;

  for (const topic of TOPICS) {
    const topicDir = path.join(OUTPUT_DIR, topic.id);
    fs.mkdirSync(topicDir, { recursive: true });
    for (const entry of topic.entries) {
      const key = `${topic.id}/${entry.id}`;
      const existing = previous.assets?.[key];
      if (existing && !REFRESH_IDS.has(entry.id) && fs.existsSync(path.join(OUTPUT_DIR, existing.file))) {
        manifest.assets[key] = existing;
        completed += 1;
        process.stdout.write(`cached ${completed}/${total} ${key}\n`);
        continue;
      }

      const query = searchQuery(topic.id, entry);
      const candidate = EXACT_FILES[entry.id]
        ? await getCommonsFile(EXACT_FILES[entry.id])
        : await findCommonsImage(query);
      if (!candidate) {
        completed += 1;
        process.stdout.write(`missing ${completed}/${total} ${key}\n`);
        await delay(900);
        continue;
      }

      const response = await fetchWithRetry(candidate.thumbnailUrl);
      if (!response.ok) throw new Error(`Image download failed (${response.status}) for ${key}`);
      const mimeType = String(response.headers.get('content-type') || candidate.mimeType).split(';')[0];
      const extension = extensionFor(mimeType);
      if (!extension) {
        completed += 1;
        process.stdout.write(`unsupported ${completed}/${total} ${key}\n`);
        await delay(900);
        continue;
      }
      const relativeFile = `${topic.id}/${entry.id}.${extension}`;
      fs.writeFileSync(path.join(OUTPUT_DIR, relativeFile), Buffer.from(await response.arrayBuffer()));
      manifest.assets[key] = {
        file: relativeFile.replace(/\\/g, '/'),
        title: entry.title,
        topic: topic.title,
        query,
        sourceTitle: candidate.sourceTitle,
        sourceUrl: candidate.sourceUrl,
        artist: candidate.artist,
        credit: candidate.credit,
        license: candidate.license,
        licenseUrl: candidate.licenseUrl,
      };
      writeManifest(manifest);
      completed += 1;
      process.stdout.write(`downloaded ${completed}/${total} ${key}\n`);
      await delay(900);
    }
  }

  writeManifest(manifest);
  process.stdout.write(`saved ${Object.keys(manifest.assets).length}/${total} images and attribution metadata\n`);
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return { assets: {} }; }
}

function searchQuery(topicId, entry) {
  if (QUERY_OVERRIDES[entry.id]) return QUERY_OVERRIDES[entry.id];
  if (topicId === 'mcu') return `${entry.title} Marvel cosplay photograph`;
  if (topicId === 'games') return `${entry.title} video game cosplay photograph`;
  if (topicId === 'takeaway') return `${entry.title} food photograph`;
  if (topicId === 'snack') return `${entry.title} cinema food photograph`;
  return `${entry.title} photograph`;
}

async function findCommonsImage(query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '800',
  });
  const response = await fetchWithRetry(`${API_URL}?${params}`);
  if (!response.ok) throw new Error(`Commons search failed (${response.status}) for ${query}`);
  const payload = await response.json();
  const pages = Object.values(payload.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !isUsableLicense(info.extmetadata) || !extensionFor(info.mime)) continue;
    return {
      thumbnailUrl: info.thumburl || info.url,
      mimeType: info.mime,
      sourceTitle: page.title,
      sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      artist: cleanMetadata(info.extmetadata?.Artist?.value),
      credit: cleanMetadata(info.extmetadata?.Credit?.value),
      license: cleanMetadata(info.extmetadata?.LicenseShortName?.value || info.extmetadata?.UsageTerms?.value),
      licenseUrl: info.extmetadata?.LicenseUrl?.value || '',
    };
  }
  return null;
}

async function getCommonsFile(title) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '800',
  });
  const response = await fetchWithRetry(`${API_URL}?${params}`);
  if (!response.ok) throw new Error(`Commons file request failed (${response.status}) for ${title}`);
  const page = Object.values((await response.json()).query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info || !isUsableLicense(info.extmetadata) || !extensionFor(info.mime)) return null;
  return {
    thumbnailUrl: info.thumburl || info.url,
    mimeType: info.mime,
    sourceTitle: page.title,
    sourceUrl: info.descriptionurl,
    artist: cleanMetadata(info.extmetadata?.Artist?.value),
    credit: cleanMetadata(info.extmetadata?.Credit?.value),
    license: cleanMetadata(info.extmetadata?.LicenseShortName?.value || info.extmetadata?.UsageTerms?.value),
    licenseUrl: info.extmetadata?.LicenseUrl?.value || '',
  };
}

function isUsableLicense(metadata) {
  const license = String(metadata?.LicenseShortName?.value || metadata?.UsageTerms?.value || '').toLowerCase();
  return license.includes('creative commons') || license.includes('cc ') || license.includes('public domain') || license.includes('pdm');
}

function cleanMetadata(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extensionFor(mimeType) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[String(mimeType || '').toLowerCase()] || '';
}

function requestHeaders() {
  return { 'User-Agent': 'KingGumptionStreamOverlay/1.0 (local artwork cache)' };
}

async function fetchWithRetry(url) {
  let lastResponse;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    lastResponse = await fetch(url, { headers: requestHeaders() });
    if (lastResponse.status !== 429 && lastResponse.status < 500) return lastResponse;
    const retryAfter = Number(lastResponse.headers.get('retry-after')) || (attempt + 1) * 2;
    await delay(Math.min(retryAfter, 15) * 1000);
  }
  return lastResponse;
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
