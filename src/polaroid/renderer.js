const sharp = require('sharp');

const WIDTH = 1200;
const HEIGHT = 1450;
const PHOTO_LEFT = 60;
const PHOTO_TOP = 60;
const PHOTO_SIZE = 1080;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fontSizeForCaption(text) {
  if (text.length <= 28) return 66;
  if (text.length <= 38) return 56;
  if (text.length <= 48) return 47;
  return 40;
}

async function renderPolaroid(input, redeemerName, options = {}, profileImage = null) {
  const caption = `${options.captionPrefix || 'taken by ='} ${redeemerName}`;
  const hasProfileImage = Boolean(profileImage && options.showProfilePicture !== false);
  const fontSize = Math.max(36, fontSizeForCaption(caption) - (hasProfileImage ? 6 : 0));
  const paper = options.paperColour || '#f7f3e8';
  const ink = options.inkColour || '#171717';
  const font = escapeXml(options.markerFont || 'Segoe Print');
  const captionX = hasProfileImage ? 680 : 600;
  const brandingLabel = String(options.brandingLabel || '').trim();

  const photo = await sharp(input)
    .rotate()
    .resize(PHOTO_SIZE, PHOTO_SIZE, {
      fit: 'cover',
      position: options.photoPosition || 'centre',
    })
    .modulate({ brightness: 1.02, saturation: 0.94 })
    .sharpen({ sigma: 0.45 })
    .toBuffer();

  const captionSvg = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="paperNoise" x="0" y="0" width="100%" height="100%">
          <feTurbulence baseFrequency="0.72" numOctaves="3" seed="21" type="fractalNoise" result="noise"/>
          <feColorMatrix in="noise" type="saturate" values="0" result="grey"/>
          <feComponentTransfer in="grey"><feFuncA type="table" tableValues="0 0.035"/></feComponentTransfer>
        </filter>
      </defs>
      <rect width="1200" height="1450" fill="${escapeXml(paper)}"/>
      <rect x="72" y="74" width="1080" height="1080" fill="#171717" opacity="0.2"/>
      <rect width="1200" height="1450" filter="url(#paperNoise)" opacity="0.32"/>
      <g transform="rotate(-1.15 600 1280)">
        <text x="${captionX}" y="1308" text-anchor="middle" dominant-baseline="middle"
          font-family="${font}, 'Comic Sans MS', cursive" font-size="${fontSize}" font-weight="600"
          letter-spacing="-1.5" fill="${escapeXml(ink)}">${escapeXml(caption)}</text>
      </g>
      ${brandingLabel ? `<text x="1110" y="1400" text-anchor="end" font-family="Segoe UI, sans-serif"
        font-size="22" letter-spacing="3" fill="${escapeXml(ink)}" opacity="0.34">${escapeXml(brandingLabel)}</text>` : ''}
    </svg>
  `);

  let roundProfileImage = null;
  if (hasProfileImage) {
    const avatarSize = 126;
    const mask = Buffer.from(`
      <svg width="${avatarSize}" height="${avatarSize}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="63" cy="63" r="61" fill="white"/>
      </svg>
    `);
    roundProfileImage = await sharp(profileImage)
      .rotate()
      .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  const composites = [
    { input: captionSvg, left: 0, top: 0 },
    { input: photo, left: PHOTO_LEFT, top: PHOTO_TOP },
  ];
  if (roundProfileImage) {
    composites.push(
      { input: roundProfileImage, left: 92, top: 1223 },
      {
        input: Buffer.from(`
          <svg width="140" height="140" xmlns="http://www.w3.org/2000/svg">
            <circle cx="70" cy="70" r="66" fill="none" stroke="${escapeXml(ink)}" stroke-width="4" opacity="0.9"/>
            <circle cx="70" cy="70" r="69" fill="none" stroke="${escapeXml(ink)}" stroke-width="1.5" opacity="0.35"/>
          </svg>
        `),
        left: 85,
        top: 1216,
      },
    );
  }

  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: paper } })
    .composite(composites)
    .jpeg({ quality: Number(options.jpegQuality) || 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

module.exports = { renderPolaroid };
