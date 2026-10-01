const {createVault, requestJson, saveObservations} = require('./content-social-common');
const automationStore = require('./content-automation-store');
const {getConfigValue,setConfigValue} = require('./db');

const AUTH = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';
const SCOPES = 'instagram_business_basic,instagram_business_manage_insights';

function metricValue(item) {
  const value = item?.total_value?.value ?? item?.values?.[0]?.value ?? item?.value;
  const number = Number(value);
  return value == null || !Number.isFinite(number) || number < 0 ? null : number;
}

function createInstagramConnection({environment = process.env, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const clientId = String(environment.INSTAGRAM_APP_ID || '').trim();
  const clientSecret = String(environment.INSTAGRAM_APP_SECRET || '').trim();
  const secret = String(environment.SESSION_SECRET || '');
  const baseUrl = String(environment.PUBLIC_BASE_URL || environment.RENDER_EXTERNAL_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
  const version = /^v\d+\.\d+$/.test(environment.INSTAGRAM_GRAPH_VERSION || '') ? environment.INSTAGRAM_GRAPH_VERSION : 'v25.0';
  const configured = Boolean(clientId && clientSecret && secret.length >= 32 && baseUrl.startsWith('https://'));
  const redirectUri = `${baseUrl}/admin/content-coach/instagram/callback`;
  const vault = createVault('instagram', secret, now);
  const json = (url, options) => requestJson(fetchImpl, url, options, 'Instagram');
  const bearer = token => ({Authorization: `Bearer ${token}`});

  function status() {
    let account = null;
    try { account = vault.read(); } catch { /* A changed session secret requires reconnection. */ }
    return {configured, connected: Boolean(account?.accessToken),
      account: account ? {username: account.username, displayName: `@${account.username}`, lastSyncAt: account.lastSyncAt || null} : null,
      callbackUrl: redirectUri};
  }
  function begin(sessionCookie) {
    if (!configured) throw Error('Configure INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Render first.');
    const url = new URL(AUTH);
    url.search = new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, scope: SCOPES,
      response_type: 'code', enable_fb_login: '0', force_reauth: 'true', state: vault.state(sessionCookie)}).toString();
    return url.toString();
  }
  async function callback({state, code, sessionCookie}) {
    vault.verify(state, sessionCookie);
    if (!code || String(code).length > 2048) throw Error('Instagram did not return an authorisation code.');
    const form = new FormData();
    for (const [key, value] of Object.entries({client_id: clientId, client_secret: clientSecret,
      grant_type: 'authorization_code', redirect_uri: redirectUri, code})) form.set(key, value);
    const short = await json(TOKEN, {method: 'POST', body: form})
      .catch(error => { throw Error(`Instagram code exchange: ${error.message}`); });
    if (!short.access_token || !short.user_id) throw Error('Instagram did not grant account access.');
    const exchange = new URL(`${GRAPH}/access_token`);
    exchange.search = new URLSearchParams({grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: short.access_token}).toString();
    const long = await json(exchange).catch(error => { throw Error(`Instagram token extension: ${error.message}`); });
    if (!long.access_token || !Number.isFinite(Number(long.expires_in))) throw Error('Instagram did not provide a long-lived token.');
    const profileUrl = new URL(`${GRAPH}/${version}/me`);
    profileUrl.search = new URLSearchParams({fields: 'id,username,account_type'}).toString();
    const profile = await json(profileUrl, {headers: bearer(long.access_token)})
      .catch(error => { throw Error(`Instagram profile verification: ${error.message}`); });
    if (String(profile.id) !== String(short.user_id) || !profile.username) throw Error('Could not verify the authorised Instagram account.');
    if (profile.username.toLowerCase() !== 'kinggumption') throw Error('Please connect the KingGumption Instagram account.');
    vault.save({userId: profile.id, username: profile.username, accountType: profile.account_type,
      accessToken: long.access_token, expiresAt: now() + Number(long.expires_in) * 1000, lastSyncAt: null});
    return status();
  }
  async function access() {
    const account = vault.read();
    if (!account?.accessToken) throw Error('Connect Instagram first.');
    if (account.expiresAt > now() + 7 * 86400000) return account;
    if (account.expiresAt <= now()) throw Error('Instagram authorisation expired. Reconnect Instagram.');
    const url = new URL(`${GRAPH}/refresh_access_token`);
    url.search = new URLSearchParams({grant_type: 'ig_refresh_token', access_token: account.accessToken}).toString();
    const result = await json(url);
    if (!result.access_token || !Number.isFinite(Number(result.expires_in))) throw Error('Instagram token refresh failed. Reconnect Instagram.');
    const updated = {...account, accessToken: result.access_token, expiresAt: now() + Number(result.expires_in) * 1000};
    vault.save(updated);
    return updated;
  }
  async function media(account) {
    const url = new URL(`${GRAPH}/${version}/me/media`);
    url.search = new URLSearchParams({fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url', limit: '50'}).toString();
    const result = [];
    let next = url.toString();
    for (let page = 0; page < 40 && next && result.length < 2000; page++) {
      const pageUrl = new URL(next);
      if (pageUrl.protocol !== 'https:' || pageUrl.hostname !== 'graph.instagram.com') throw Error('Instagram returned an unsafe pagination URL.');
      const data = await json(pageUrl, {headers: bearer(account.accessToken)});
      if (!Array.isArray(data.data)) throw Error('Instagram did not return a media list.');
      result.push(...data.data);
      if (data.data.some(item=>Date.parse(item.timestamp)<now()-366*86400000)) break;
      next = data.paging?.next || '';
    }
    return result.filter(item => (item.media_type === 'VIDEO' || item.media_product_type === 'REELS') && Date.parse(item.timestamp)>=now()-366*86400000);
  }
  async function insights(account, id, isReel) {
    const values = {}, unavailable = [];
    const get = async metrics => {
      const url = new URL(`${GRAPH}/${version}/${encodeURIComponent(id)}/insights`);
      url.search = new URLSearchParams({metric: metrics.join(',')}).toString();
      const data = await json(url, {headers: bearer(account.accessToken)});
      for (const item of data.data || []) values[item.name] = metricValue(item);
    };
    const names = ['views', 'reach', 'saved', 'shares'];
    try { await get(names); }
    catch { for (const name of names) { try { await get([name]); } catch { unavailable.push(name); } } }
    if (isReel) { try { await get(['ig_reels_avg_watch_time']); } catch { unavailable.push('ig_reels_avg_watch_time'); } }
    return {values, unavailable};
  }
  async function sync() {
    const account = await access();
    const observedAt = new Date(now()).toISOString();
    const allItems = await media(account);
    const recent=allItems.slice(0,20),older=allItems.slice(20);
    const offset=Number(getConfigValue('content_instagram_backfill_offset_v1',0))||0;
    const items=[...recent,...older.slice(offset,offset+30)];
    setConfigValue('content_instagram_backfill_offset_v1',older.length&&offset+30<older.length?offset+30:0);
    const posts = [], warnings = [];
    for (const item of items) {
      let result = {values: {}, unavailable: []};
      try { result = await insights(account, item.id, item.media_product_type === 'REELS'); }
      catch (error) { warnings.push(`Insights unavailable for ${String(item.id).slice(0, 30)}: ${error.message}`); }
      if (result.unavailable.length) warnings.push(`${result.unavailable.length} metrics unavailable for ${String(item.id).slice(0, 30)}`);
      const metrics = result.values;
      posts.push({id: item.id, url: item.permalink, title: item.caption || 'Instagram video',
        description: item.caption || '', hashtags: (item.caption || '').match(/#[\p{L}\p{N}_]+/gu) || [],
        category: null, coverUrl: item.thumbnail_url || null,
        publishedAt: item.timestamp, format: item.media_product_type === 'REELS' ? 'short' : 'long',
        durationSeconds: null,
        metrics: {views: metrics.views ?? null, reach: metrics.reach ?? null,
          likes: item.like_count ?? null, comments: item.comments_count ?? null,
          shares: metrics.shares ?? null, saves: metrics.saved ?? null,
          averageViewSeconds: metrics.ig_reels_avg_watch_time == null ? null : metrics.ig_reels_avg_watch_time / 1000}});
    }
    const saved = saveObservations('instagram', posts, observedAt, 'Instagram Graph API · media insights', now());
    automationStore.upsertPosts('instagram', posts, observedAt);
    vault.save({...account, lastSyncAt: observedAt});
    return {...saved, warning: warnings.length ? 'Some Instagram insights were unavailable; affected metrics remain blank.' : null};
  }
  async function disconnect() { vault.clear(); }
  return {status, begin, callback, sync, disconnect, redirectUri};
}

module.exports = {createInstagramConnection, metricValue};
