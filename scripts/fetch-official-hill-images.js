const fs = require('node:fs');
const path = require('node:path');
const { TOPICS } = require('../src/hill-game');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'hill-art-official');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

const OFFICIAL_PAGES = {
  original: 'https://www.monsterenergy.com/en-ie/energy-drinks/monster-energy/original-green/',
  'mango-loco': 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/mango-loco/',
  'pipeline-punch': 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/pipeline-punch/',
  'ultra-white': 'https://www.monsterenergy.com/en-ie/energy-drinks/monster-ultra/ultra-white/',
  'pacific-punch': 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/pacific-punch/',
  'aussie-lemonade': 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/aussie-lemonade/',
  khaotic: 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/khaotic/',
  monarch: 'https://www.monsterenergy.com/en-ie/energy-drinks/juiced-monster/monarch/',
  'ultra-paradise': 'https://www.monsterenergy.com/en-ie/energy-drinks/monster-ultra/ultra-paradise/',
  'nitro-super-dry': 'https://www.monsterenergy.com/en-ie/energy-drinks/monster-energy/nitro-super-dry/',
  'iron-man': 'https://www.marvel.com/characters/iron-man-tony-stark/on-screen',
  'captain-america': 'https://www.marvel.com/characters/captain-america-steve-rogers/on-screen',
  'spider-man': 'https://www.marvel.com/characters/spider-man-peter-parker/on-screen',
  thor: 'https://www.marvel.com/characters/thor-thor-odinson/on-screen',
  'black-panther': 'https://www.marvel.com/characters/black-panther-t-challa/on-screen',
  'scarlet-witch': 'https://www.marvel.com/characters/scarlet-witch-wanda-maximoff/on-screen',
  hulk: 'https://www.marvel.com/characters/hulk-bruce-banner/on-screen',
  'doctor-strange': 'https://www.marvel.com/characters/doctor-strange-stephen-strange/on-screen',
  loki: 'https://www.marvel.com/characters/loki-loki-laufeyson/on-screen',
  'star-lord': 'https://www.marvel.com/characters/star-lord-peter-quill/on-screen',
  mario: 'https://mario.nintendo.com/',
  zelda: 'https://zelda.nintendo.com/',
  pokemon: 'https://www.pokemon.com/uk',
  'final-fantasy': 'https://ffvii.square-enix-games.com/en-gb',
  halo: 'https://www.halowaypoint.com/',
  gta: 'https://www.rockstargames.com/gta-v',
  sonic: 'https://www.sonicthehedgehog.com/',
  'resident-evil': 'https://game.capcom.com/residentevil/en/',
  'call-of-duty': 'https://www.callofduty.com/uk/en/',
  minecraft: 'https://www.minecraft.net/en-us',
  playstation: 'https://www.playstation.com/en-gb/',
  xbox: 'https://www.xbox.com/en-GB/',
  switch: 'https://www.nintendo.com/en-gb/Hardware/Nintendo-Switch-family/Nintendo-Switch/Nintendo-Switch-1148779.html',
  pc: 'https://www.microsoft.com/en-gb/windows/pc-gaming',
  sega: 'https://www.sega.com/',
  'game-boy': 'https://www.nintendo.com/en-gb/Hardware/Nintendo-History/Nintendo-History-625945.html',
  'steam-deck': 'https://www.steamdeck.com/en/',
  'nintendo-64': 'https://www.nintendo.com/en-gb/Hardware/Nintendo-History/Nintendo-History-625945.html',
  maltesers: 'https://www.maltesers.co.uk/',
};

const WIKIPEDIA_TITLES = {
  original: 'Monster Energy',
  'mango-loco': 'Monster Energy',
  'pipeline-punch': 'Monster Energy',
  'ultra-white': 'Monster Energy',
  'pacific-punch': 'Monster Energy',
  'aussie-lemonade': 'Monster Energy',
  khaotic: 'Monster Energy',
  monarch: 'Monster Energy',
  'ultra-paradise': 'Monster Energy',
  'nitro-super-dry': 'Monster Energy',
  'iron-man': 'Iron Man',
  'captain-america': 'Captain America',
  'spider-man': 'Spider-Man',
  thor: 'Thor (Marvel Comics)',
  'black-panther': 'Black Panther (character)',
  'scarlet-witch': 'Scarlet Witch',
  hulk: 'Hulk',
  'doctor-strange': 'Doctor Strange',
  loki: 'Loki (Marvel Comics)',
  'star-lord': 'Star-Lord',
  mario: 'Mario (franchise)',
  zelda: 'The Legend of Zelda',
  pokemon: 'Pokémon (video game series)',
  'final-fantasy': 'Final Fantasy',
  halo: 'Halo (franchise)',
  gta: 'Grand Theft Auto',
  sonic: 'Sonic the Hedgehog',
  'resident-evil': 'Resident Evil',
  'call-of-duty': 'Call of Duty',
  minecraft: 'Minecraft',
  pizza: 'Pizza',
  curry: 'Curry',
  chinese: 'Chinese cuisine',
  'fish-chips': 'Fish and chips',
  burgers: 'Hamburger',
  kebab: 'Kebab',
  'fried-chicken': 'Fried chicken',
  sushi: 'Sushi',
  thai: 'Pad thai',
  burritos: 'Burrito',
  flight: 'Wingsuit flying',
  invisibility: 'Invisibility',
  teleportation: 'Wormhole',
  strength: 'Weight training',
  time: 'Hourglass',
  'mind-reading': 'Human brain',
  shapeshifting: 'Chameleon',
  'super-speed': 'Sprinting',
  healing: 'First aid',
  elements: 'Classical element',
  playstation: 'PlayStation 5',
  xbox: 'Xbox Series X and Series S',
  switch: 'Nintendo Switch',
  pc: 'Gaming computer',
  sega: 'Mega Drive',
  'game-boy': 'Game Boy',
  'steam-deck': 'Steam Deck',
  arcade: 'Arcade cabinet',
  mobile: 'Mobile game',
  'nintendo-64': 'Nintendo 64',
  popcorn: 'Popcorn',
  nachos: 'Nachos',
  'pick-mix': 'Bulk confectionery',
  'hot-dog': 'Hot dog',
  'ice-cream': 'Ice cream',
  chocolate: 'Chocolate bar',
  maltesers: 'Maltesers',
  'fizzy-drink': 'Soft drink',
  pretzel: 'Pretzel',
  churros: 'Churro',
  'dessert-cheesecake': 'Cheesecake',
  'dessert-chocolate-cake': 'Chocolate cake',
  'dessert-apple-pie': 'Apple pie',
  'dessert-brownies': 'Chocolate brownie',
  'dessert-doughnuts': 'Doughnut',
  'dessert-waffles': 'Waffle',
  'dessert-tiramisu': 'Tiramisu',
  'dessert-sticky-toffee': 'Sticky toffee pudding',
  'dessert-sundae': 'Sundae',
  'dessert-cookies': 'Cookie',
  'animal-dog': 'Dog',
  'animal-cat': 'Cat',
  'animal-red-panda': 'Red panda',
  'animal-sea-otter': 'Sea otter',
  'animal-penguin': 'Penguin',
  'animal-elephant': 'Elephant',
  'animal-dolphin': 'Dolphin',
  'animal-tiger': 'Tiger',
  'animal-fox': 'Red fox',
  'animal-capybara': 'Capybara',
  'music-rock': 'Queen (band)',
  'music-pop': 'Madonna',
  'music-hip-hop': 'Hip hop music',
  'music-electronic': 'Electronic dance music',
  'music-metal': 'Metallica',
  'music-rnb': 'Ray Charles',
  'music-indie': 'Arctic Monkeys',
  'music-country': 'Dolly Parton',
  'music-jazz': 'Louis Armstrong',
  'music-classical': 'Classical music',
  'holiday-beach': 'Beach',
  'holiday-city': 'City tourism',
  'holiday-mountains': 'Mountain resort',
  'holiday-road-trip': 'Road trip',
  'holiday-cruise': 'Cruise ship',
  'holiday-theme-park': 'Amusement park',
  'holiday-camping': 'Camping',
  'holiday-skiing': 'Ski lift',
  'holiday-safari': 'Safari',
  'holiday-countryside': 'Rural tourism',
  'transport-sports-car': 'Sports car',
  'transport-motorcycle': 'Motorcycle',
  'transport-train': 'Train',
  'transport-aeroplane': 'Airplane',
  'transport-speedboat': 'Motorboat',
  'transport-bicycle': 'Bicycle',
  'transport-helicopter': 'Helicopter',
  'transport-campervan': 'Campervan',
  'transport-skateboard': 'Skateboard',
  'transport-balloon': 'Hot air balloon',
  'breakfast-full-english': 'Full breakfast',
  'breakfast-pancakes': 'Pancake',
  'breakfast-waffles': 'Waffle',
  'breakfast-cereal': 'Breakfast cereal',
  'breakfast-toast': 'Toast (food)',
  'breakfast-eggs-benedict': 'Eggs Benedict',
  'breakfast-croissant': 'Croissant',
  'breakfast-bacon-sandwich': 'Bacon sandwich',
  'breakfast-porridge': 'Porridge',
  'breakfast-avocado-toast': 'Avocado toast',
  'creature-dragon': 'Dragon',
  'creature-vampire': 'Vampire',
  'creature-werewolf': 'Werewolf',
  'creature-zombie': 'Zombie',
  'creature-ghost': 'Ghost',
  'creature-alien': 'Extraterrestrial life',
  'creature-mermaid': 'Mermaid',
  'creature-unicorn': 'Unicorn',
  'creature-witch': 'Witchcraft',
  'creature-robot': 'Robot',
  'sport-football': 'Association football',
  'sport-rugby': 'Rugby union',
  'sport-cricket': 'Cricket',
  'sport-tennis': 'Tennis',
  'sport-formula-one': 'Formula One',
  'sport-boxing': 'Boxing',
  'sport-darts': 'Darts',
  'sport-snooker': 'Snooker',
  'sport-basketball': 'Basketball',
  'sport-golf': 'Golf',
  'landmark-eiffel-tower': 'Champ de Mars',
  'landmark-statue-liberty': 'Statue of Liberty',
  'landmark-great-wall': 'Great Wall of China',
  'landmark-pyramids': 'Giza pyramid complex',
  'landmark-colosseum': 'Colosseum',
  'landmark-taj-mahal': 'Taj Mahal',
  'landmark-big-ben': 'Big Ben',
  'landmark-sydney-opera': 'Sydney Opera House',
  'landmark-machu-picchu': 'Machu Picchu',
  'landmark-mount-fuji': 'Mount Fuji',
  'crisps-salt-vinegar': 'Vinegar',
  'crisps-cheese-onion': 'Cheddar cheese',
  'crisps-ready-salted': 'Potato chip',
  'crisps-prawn-cocktail': 'Prawn cocktail',
  'crisps-smoky-bacon': 'Bacon',
  'crisps-roast-chicken': 'Roast chicken',
  'crisps-worcester-sauce': 'Worcestershire sauce',
  'crisps-pickled-onion': 'Pickled onion',
  'crisps-barbecue': 'Barbecue',
  'crisps-sour-cream': 'Sour cream',
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
  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: 'Official promotional pages with curated reference fallbacks',
    usageNote: 'Branded promotional artwork remains the property of its respective owner.',
    // Keep a complete manifest even if a later network request fails. Entries
    // are replaced as they are refreshed and validated below.
    assets: { ...(previous.assets || {}) },
  };
  const entries = TOPICS.flatMap((topic) => topic.entries.map((entry) => ({ topic, entry })));
  let completed = 0;

  for (const { topic, entry } of entries) {
    const key = `${topic.id}/${entry.id}`;
    const existing = previous.assets?.[key];
    if (existing && !REFRESH_IDS.has(entry.id) && fs.existsSync(path.join(OUTPUT_DIR, existing.file))) {
      manifest.assets[key] = existing;
      completed += 1;
      process.stdout.write(`cached ${completed}/${entries.length} ${key}\n`);
      continue;
    }

    let candidate = null;
    const officialPage = OFFICIAL_PAGES[entry.id];
    if (officialPage) {
      try { candidate = await imageFromOfficialPage(officialPage); } catch (error) {
        process.stdout.write(`official source unavailable for ${key}: ${error.message}\n`);
      }
    }
    if (!candidate && topic.id === 'monster') {
      try { candidate = await imageFromOpenFoodFacts(`Monster Energy ${entry.title}`); } catch (error) {
        process.stdout.write(`product packshot unavailable for ${key}: ${error.message}\n`);
      }
    }
    if (!candidate) candidate = await imageFromWikipedia(WIKIPEDIA_TITLES[entry.id] || entry.title);
    if (!candidate) throw new Error(`No usable image found for ${key}`);

    const imageResponse = await fetchWithRetry(candidate.imageUrl, 8);
    if (!imageResponse.ok) throw new Error(`Image download failed (${imageResponse.status}) for ${key}`);
    const mimeType = String(imageResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const extension = extensionFor(mimeType, candidate.imageUrl);
    if (!extension) throw new Error(`Unsupported image type ${mimeType || 'unknown'} for ${key}`);
    const relativeFile = `${topic.id}/${entry.id}.${extension}`;
    const targetDirectory = path.dirname(path.join(OUTPUT_DIR, relativeFile));
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, relativeFile), Buffer.from(await imageResponse.arrayBuffer()));
    manifest.assets[key] = {
      file: relativeFile.replace(/\\/g, '/'),
      title: entry.title,
      topic: topic.title,
      sourceType: candidate.sourceType,
      sourceOwner: candidate.sourceOwner,
      sourceTitle: candidate.sourceTitle,
      sourceUrl: candidate.sourceUrl,
      imageUrl: candidate.imageUrl,
      usageNote: candidate.usageNote,
    };
    writeManifest(manifest);
    completed += 1;
    process.stdout.write(`downloaded ${completed}/${entries.length} ${key} (${candidate.sourceOwner})\n`);
    await delay(650);
  }

  writeManifest(manifest);
  process.stdout.write(`saved ${Object.keys(manifest.assets).length}/${entries.length} images and source metadata\n`);
}

async function imageFromOpenFoodFacts(searchTerms) {
  const params = new URLSearchParams({
    search_terms: searchTerms,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '15',
    fields: 'code,product_name,brands,image_front_url,image_url',
  });
  const sourceUrl = `https://world.openfoodfacts.org/cgi/search.pl?${params}`;
  const response = await fetchWithRetry(sourceUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const wantedWords = searchTerms.toLowerCase().split(/\s+/).filter((word) => word !== 'energy');
  const products = Array.isArray(payload.products) ? payload.products : [];
  const product = products
    .filter((item) => item.image_front_url || item.image_url)
    .sort((a, b) => productScore(b, wantedWords) - productScore(a, wantedWords))[0];
  if (!product) throw new Error('no exact product packshot');
  return {
    imageUrl: product.image_front_url || product.image_url,
    sourceType: 'curated-product-packshot',
    sourceOwner: product.brands || 'Monster Energy / Open Food Facts',
    sourceTitle: product.product_name || searchTerms,
    sourceUrl: `https://world.openfoodfacts.org/product/${product.code}`,
    usageNote: 'Recognizable product-packaging photograph from the Open Food Facts catalogue.',
  };
}

function productScore(product, wantedWords) {
  const haystack = `${product.product_name || ''} ${product.brands || ''}`.toLowerCase();
  return wantedWords.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

async function imageFromOfficialPage(sourceUrl) {
  const response = await fetchWithRetry(sourceUrl, 1);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const imageValue = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  if (!imageValue) throw new Error('no social preview image');
  const title = metaContent(html, 'og:title') || titleContent(html) || new URL(sourceUrl).hostname;
  return {
    imageUrl: new URL(decodeHtml(imageValue), response.url).href,
    sourceType: 'official-promotional',
    sourceOwner: ownerName(new URL(response.url).hostname),
    sourceTitle: decodeHtml(title),
    sourceUrl: response.url,
    usageNote: 'Official promotional image; rights remain with the brand or publisher.',
  };
}

async function imageFromWikipedia(title) {
  const sourceUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const response = await fetchWithRetry(sourceUrl);
  if (!response.ok) return imageFromWikipediaSearch(title);
  const payload = await response.json();
  // The REST thumbnail is plenty large for a two-card OBS layout and is much
  // less likely to be throttled than multi-megabyte originals.
  const imageUrl = payload.thumbnail?.source || payload.originalimage?.source;
  if (!imageUrl) return imageFromWikipediaSearch(title);
  return {
    imageUrl,
    sourceType: 'curated-reference',
    sourceOwner: 'Wikipedia / Wikimedia Commons',
    sourceTitle: payload.title || title,
    sourceUrl: payload.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    usageNote: 'Curated reference image. Follow the source page for creator and licence details.',
  };
}

async function imageFromWikipediaSearch(title) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: title,
    gsrnamespace: '0',
    gsrlimit: '8',
    prop: 'pageimages|info',
    piprop: 'thumbnail',
    pithumbsize: '800',
    inprop: 'url',
  });
  const response = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!response.ok) return null;
  const pages = Object.values((await response.json()).query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const page = pages.find((candidate) => candidate.thumbnail?.source);
  if (!page) return null;
  return {
    imageUrl: page.thumbnail.source,
    sourceType: 'curated-reference',
    sourceOwner: 'Wikipedia / Wikimedia Commons',
    sourceTitle: page.title || title,
    sourceUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title || title).replace(/ /g, '_'))}`,
    usageNote: 'Curated reference image. Follow the source page for creator and licence details.',
  };
}

function metaContent(html, key) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi), (match) => [match[1].toLowerCase(), match[3]]));
    if (String(attributes.property || attributes.name || '').toLowerCase() === key) return attributes.content || '';
  }
  return '';
}

function titleContent(html) {
  return decodeHtml((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function ownerName(hostname) {
  const knownOwners = {
    'monsterenergy.com': 'Monster Energy',
    'marvel.com': 'Marvel',
    'nintendo.com': 'Nintendo',
    'pokemon.com': 'The Pokémon Company',
    'finalfantasy.com': 'Square Enix',
    'square-enix-games.com': 'Square Enix',
    'square-enix.com': 'Square Enix',
    'halowaypoint.com': 'Xbox Game Studios / 343 Industries',
    'rockstargames.com': 'Rockstar Games',
    'sonicthehedgehog.com': 'SEGA',
    'capcom.com': 'Capcom',
    'callofduty.com': 'Activision',
    'minecraft.net': 'Mojang Studios',
    'playstation.com': 'Sony Interactive Entertainment',
    'xbox.com': 'Microsoft',
    'microsoft.com': 'Microsoft',
    'sega.com': 'SEGA',
    'steamdeck.com': 'Valve',
    'maltesers.co.uk': 'Mars Wrigley',
  };
  const host = hostname.replace(/^www\./, '').toLowerCase();
  const match = Object.entries(knownOwners).find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match?.[1] || host;
}

function extensionFor(mimeType, url) {
  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  if (byMime[mimeType]) return byMime[mimeType];
  const fromPath = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fromPath) ? fromPath.replace('jpeg', 'jpg') : '';
}

function requestHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (compatible; KingGumptionStreamOverlay/2.0; local artwork cache)',
    Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
  };
}

async function fetchWithRetry(url, attempts = 4) {
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastResponse = await fetch(url, {
        headers: requestHeaders(),
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (lastResponse.status !== 429 && lastResponse.status < 500) return lastResponse;
    } catch (error) { lastError = error; }
    const retryAfter = Number(lastResponse?.headers?.get('retry-after')) || 0;
    await delay(Math.max(retryAfter * 1000, (attempt + 1) * 1000));
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error(`Could not fetch ${url}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return { assets: {} }; }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
