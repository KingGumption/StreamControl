const {createVault, requestJson, saveObservations} = require('./content-social-common');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const DATA = 'https://www.googleapis.com/youtube/v3/';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];

function durationSeconds(value) {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value || ''));
  return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : null;
}

function createYouTubeConnection({environment = process.env, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const clientId = String(environment.YOUTUBE_CLIENT_ID || '').trim();
  const clientSecret = String(environment.YOUTUBE_CLIENT_SECRET || '').trim();
  const secret = String(environment.SESSION_SECRET || '');
  const baseUrl = String(environment.PUBLIC_BASE_URL || environment.RENDER_EXTERNAL_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
  const configured = Boolean(clientId && clientSecret && secret.length >= 32 && baseUrl.startsWith('https://'));
  const redirectUri = `${baseUrl}/admin/content-coach/youtube/callback`;
  const vault = createVault('youtube', secret, now);
  const json = (url, options) => requestJson(fetchImpl, url, options, 'YouTube');
  const bearer = token => ({Authorization: `Bearer ${token}`});

  function status() {
    let account = null;
    try { account = vault.read(); } catch { /* A changed session secret requires reconnection. */ }
    return {configured, connected: Boolean(account?.refreshToken),
      account: account ? {channelId: account.channelId, displayName: account.displayName, lastSyncAt: account.lastSyncAt || null} : null,
      callbackUrl: redirectUri};
  }
  function begin(sessionCookie) {
    if (!configured) throw Error('Configure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in Render first.');
    const url = new URL(AUTH);
    url.search = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state: vault.state(sessionCookie)}).toString();
    return url.toString();
  }
  async function token(fields) {
    return json(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, ...fields})});
  }
  async function channel(accessToken) {
    const url = new URL(`${DATA}channels`);
    url.search = new URLSearchParams({part: 'snippet,contentDetails', mine: 'true'}).toString();
    const data = await json(url, {headers: bearer(accessToken)});
    const item = data.items?.[0];
    if (!item?.id || !item.contentDetails?.relatedPlaylists?.uploads) throw Error('The selected Google account has no accessible YouTube channel.');
    return {channelId: item.id, displayName: item.snippet?.title || 'YouTube channel', uploadsPlaylist: item.contentDetails.relatedPlaylists.uploads};
  }
  async function callback({state, code, sessionCookie}) {
    vault.verify(state, sessionCookie);
    if (!code || String(code).length > 2048) throw Error('YouTube did not return an authorisation code.');
    const result = await token({grant_type: 'authorization_code', code, redirect_uri: redirectUri});
    if (!result.access_token || !result.refresh_token) throw Error('Google did not grant offline YouTube access. Reconnect and allow the requested scopes.');
    const identity = await channel(result.access_token);
    vault.save({...identity, accessToken: result.access_token, refreshToken: result.refresh_token,
      expiresAt: now() + Number(result.expires_in || 3600) * 1000, lastSyncAt: null});
    return status();
  }
  async function access() {
    const account = vault.read();
    if (!account?.refreshToken) throw Error('Connect YouTube first.');
    if (account.accessToken && account.expiresAt > now() + 5 * 60 * 1000) return account;
    const result = await token({grant_type: 'refresh_token', refresh_token: account.refreshToken});
    if (!result.access_token) throw Error('YouTube authorisation expired. Reconnect YouTube.');
    const updated = {...account, accessToken: result.access_token, expiresAt: now() + Number(result.expires_in || 3600) * 1000};
    vault.save(updated);
    return updated;
  }
  async function uploads(account) {
    const ids = [], seen = new Set();
    let pageToken = '';
    for (let page = 0; page < 4 && ids.length < 200; page++) {
      const url = new URL(`${DATA}playlistItems`);
      url.search = new URLSearchParams({part: 'contentDetails', playlistId: account.uploadsPlaylist, maxResults: '50', ...(pageToken ? {pageToken} : {})}).toString();
      const result = await json(url, {headers: bearer(account.accessToken)});
      for (const item of result.items || []) {
        const id = item.contentDetails?.videoId;
        if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
      }
      pageToken = result.nextPageToken || '';
      if (!pageToken) break;
    }
    const videos = [];
    for (let index = 0; index < ids.length; index += 50) {
      const url = new URL(`${DATA}videos`);
      url.search = new URLSearchParams({part: 'snippet,contentDetails,statistics,status,liveStreamingDetails', id: ids.slice(index, index + 50).join(',')}).toString();
      const result = await json(url, {headers: bearer(account.accessToken)});
      videos.push(...(result.items || []));
    }
    return videos.filter(item => item.status?.privacyStatus === 'public' && !item.liveStreamingDetails && durationSeconds(item.contentDetails?.duration) > 0);
  }
  async function analytics(account, videos, observedAt) {
    const endDate = new Date(Date.parse(observedAt) - 86400000).toISOString().slice(0, 10);
    const eligible = videos.filter(item => item.snippet?.publishedAt?.slice(0, 10) <= endDate);
    if (!eligible.length) return new Map();
    const startDate = eligible.reduce((date, item) => item.snippet.publishedAt.slice(0, 10) < date ? item.snippet.publishedAt.slice(0, 10) : date, endDate);
    const result = new Map();
    for (let index = 0; index < eligible.length; index += 50) {
      const url = new URL(ANALYTICS);
      url.search = new URLSearchParams({ids: 'channel==MINE', startDate, endDate,
        metrics: 'views,likes,comments,shares,subscribersGained,averageViewDuration', dimensions: 'video',
        filters: `video==${eligible.slice(index, index + 50).map(item => item.id).join(',')}`, maxResults: '50'}).toString();
      const data = await json(url, {headers: bearer(account.accessToken)});
      const names = (data.columnHeaders || []).map(column => column.name);
      for (const values of data.rows || []) {
        const row = Object.fromEntries(names.map((name, position) => [name, values[position]]));
        if (row.video) result.set(row.video, row);
      }
    }
    return result;
  }
  async function sync() {
    const account = await access();
    const observedAt = new Date(now()).toISOString();
    const videos = await uploads(account);
    let insights = new Map(), warning = null;
    try { insights = await analytics(account, videos, observedAt); }
    catch (error) { warning = `YouTube Analytics unavailable: ${error.message}`; }
    const posts = videos.map(item => {
      const duration = durationSeconds(item.contentDetails?.duration);
      const report = insights.get(item.id);
      return {id: item.id, url: `https://www.youtube.com/watch?v=${item.id}`,
        title: item.snippet?.title, publishedAt: item.snippet?.publishedAt,
        format: duration <= 180 ? 'short' : 'long', durationSeconds: duration,
        metrics: {
          views: item.statistics?.viewCount ?? report?.views ?? null,
          likes: item.statistics?.likeCount ?? report?.likes ?? null,
          comments: item.statistics?.commentCount ?? report?.comments ?? null,
          shares: report?.shares ?? null,
          followers: report?.subscribersGained ?? null,
          averageViewSeconds: report?.averageViewDuration ?? null,
        }};
    });
    const result = saveObservations('youtube', posts, observedAt,
      `YouTube Data API; Analytics through ${new Date(Date.parse(observedAt) - 86400000).toISOString().slice(0, 10)}`, now());
    vault.save({...account, lastSyncAt: observedAt});
    return {...result, warning};
  }
  async function disconnect() {
    const account = vault.read();
    if (!account) return;
    const response = await fetchImpl(REVOKE, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token: account.refreshToken}), signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Google did not revoke the YouTube connection. Try again.');
    vault.clear();
  }
  return {status, begin, callback, sync, disconnect, redirectUri};
}

module.exports = {createYouTubeConnection, durationSeconds};
