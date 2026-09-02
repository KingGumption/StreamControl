const TWITCH_AVATAR_ENDPOINT = 'https://decapi.me/twitch/avatar/';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

async function resolveTwitchAvatar(username, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const login = String(username || '').trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) return '';

  const cached = cache.get(login);
  if (cached && cached.expiresAt > now()) return cached.url;

  let response;
  try {
    response = await fetchImpl(`${TWITCH_AVATAR_ENDPOINT}${encodeURIComponent(login)}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(3500),
    });
  } catch {
    return '';
  }
  if (!response.ok) return '';

  const url = safeTwitchCdnUrl((await response.text()).trim());
  if (url) cache.set(login, { url, expiresAt: now() + CACHE_TTL_MS });
  return url;
}

function safeTwitchCdnUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && parsed.hostname === 'static-cdn.jtvnw.net'
      ? parsed.href
      : '';
  } catch {
    return '';
  }
}

module.exports = { resolveTwitchAvatar, safeTwitchCdnUrl, TWITCH_AVATAR_ENDPOINT };
