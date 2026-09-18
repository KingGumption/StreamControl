const TWITCH_AVATAR_ENDPOINT = 'https://decapi.me/twitch/avatar/';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const { AvatarCache } = require('./avatar-cache');
const cache = new AvatarCache({ ttlMs: CACHE_TTL_MS });

async function resolveTwitchAvatar(username, { fetchImpl = globalThis.fetch, lookup = null } = {}) {
  const login = String(username || '').trim().replace(/^@+/, '').toLowerCase();
  // Some redemption events contain only a localized display name. Preserve
  // the existing resolver in that case without caching under a guessed login.
  if (!/^[a-z0-9_]{1,25}$/.test(login)) return lookup ? lookup() : '';

  return cache.get(login, async () => {
    if (lookup) return safeTwitchCdnUrl(await lookup());

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
    return url;
  });
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
