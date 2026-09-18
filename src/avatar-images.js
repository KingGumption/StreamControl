const { avatarImages } = require('./avatar-cache');
async function downloadAvatarImage(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported avatar URL');
  return await avatarImages.get(url.href, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`avatar server returned ${response.status}`);
    if (!String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
      throw new Error('avatar response was not an image');
    }
    const declaredSize = Number(response.headers.get('content-length')) || 0;
    if (declaredSize > 8 * 1024 * 1024) throw new Error('avatar image was too large');
    const chunks=[];let total=0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > 8 * 1024 * 1024) throw new Error('avatar image was too large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks,total);
  });

}
module.exports = { downloadAvatarImage };
