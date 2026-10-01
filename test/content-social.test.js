const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'content-social-'));

const {getConfigValue} = require('../src/db');
const store = require('../src/content-coach-store');
const automationStore = require('../src/content-automation-store');
const {createYouTubeConnection} = require('../src/content-youtube');
const {createInstagramConnection} = require('../src/content-instagram');

const now = Date.parse('2026-09-30T12:00:00Z');
const result = data => ({ok: true, status: 200, json: async () => data});
const base = {PUBLIC_BASE_URL: 'https://example.test', SESSION_SECRET: 's'.repeat(40)};

test('YouTube OAuth imports owned public videos and available analytics only', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname === '/token') return result({access_token: 'youtube-access-secret', refresh_token: 'youtube-refresh-secret', expires_in: 3600});
    if (url.pathname.endsWith('/channels')) return result({items: [{id: 'channel-1', snippet: {title: 'KingGumption'}, contentDetails: {relatedPlaylists: {uploads: 'uploads-1'}}}]});
    if (url.pathname.endsWith('/playlistItems')) return result({items: [{contentDetails: {videoId: 'abcdefghi00'}}, {contentDetails: {videoId: 'private0001'}}]});
    if (url.pathname.endsWith('/videos')) return result({items: [
      {id: 'abcdefghi00', snippet: {title: 'Video', publishedAt: '2026-09-23T12:00:00Z', description:'A gaming video', tags:['gaming'],categoryId:'20',thumbnails:{high:{url:'https://i.ytimg.com/vi/abcdefghi00/hqdefault.jpg'}}}, contentDetails: {duration: 'PT45S'}, status: {privacyStatus: 'public'}, statistics: {viewCount: '1200', likeCount: '60', commentCount: '4'}},
      {id: 'private0001', snippet: {title: 'Private', publishedAt: '2026-09-23T12:00:00Z'}, contentDetails: {duration: 'PT1M'}, status: {privacyStatus: 'private'}},
    ]});
    if (url.pathname === '/v2/reports') return result({columnHeaders: ['video','views','shares','subscribersGained','averageViewDuration'].map(name => ({name})), rows: [['abcdefghi00', 1100, 12, 3, 24.5]]});
    if (url.pathname === '/revoke') return {ok: true, status: 200};
    throw Error(`Unexpected YouTube path: ${url.pathname}`);
  };
  const connector = createYouTubeConnection({environment: {...base, YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'secret'}, fetchImpl, now: () => now});
  const auth = new URL(connector.begin('owner-session'));
  assert.equal(auth.searchParams.get('access_type'), 'offline');
  assert.match(auth.searchParams.get('scope'), /yt-analytics.readonly/);
  await assert.rejects(connector.callback({state: auth.searchParams.get('state'), code: 'code', sessionCookie: 'other-session'}), /another session/);
  await connector.callback({state: auth.searchParams.get('state'), code: 'code', sessionCookie: 'owner-session'});
  assert.equal(connector.status().account.displayName, 'KingGumption');
  assert.ok(!getConfigValue('content_youtube_auth_v1').includes('youtube-refresh-secret'));
  const synced = await connector.sync();
  assert.equal(synced.posts, 1);
  assert.equal(synced.observations, 2);
  const rows = store.read().records.filter(row => row.platform === 'youtube');
  assert.deepEqual(new Set(rows.map(row => row.window)), new Set(['lifetime', '7d']));
  assert.ok(rows.every(row => row.views === 1200 && row.shares === 12 && row.followers === 3 && row.averageViewSeconds === 24.5));
  const packaged=automationStore.listPosts().find(post=>post.platform==='youtube');
  assert.equal(packaged.metadata.description,'A gaming video');
  assert.deepEqual(packaged.metadata.hashtags,['gaming']);
  assert.equal(packaged.metadata.category,'20');
  assert.equal(packaged.metadata.coverUrl,'https://i.ytimg.com/vi/abcdefghi00/hqdefault.jpg');
  assert.ok(calls.includes('/v2/reports'));
  await connector.disconnect();
  assert.equal(connector.status().connected, false);
  assert.equal(store.read().records.filter(row => row.platform === 'youtube').length, 2);
});

test('Instagram OAuth imports Reel insights, leaves duration unknown, and retains owner edits', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname === '/oauth/access_token') return result({access_token: 'instagram-short-secret', user_id: 'ig-1'});
    if (url.pathname === '/access_token') return result({access_token: 'instagram-long-secret', expires_in: 5000000});
    if (url.pathname.endsWith('/me')) return result({id: 'ig-1', username: 'KingGumption', account_type: 'CREATOR'});
    if (url.pathname.endsWith('/me/media')) return result({data: [
      {id: 'media-1', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/Reel123/', timestamp: '2026-09-23T12:00:00Z', caption: 'My Reel #gaming', thumbnail_url:'https://scontent.cdninstagram.com/cover.jpg', like_count: 80, comments_count: 5},
      {id: 'photo-1', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/Photo123/', timestamp: '2026-09-23T12:00:00Z'},
    ]});
    if (url.pathname.endsWith('/media-1/insights')) {
      const metrics = url.searchParams.get('metric').split(',');
      return result({data: metrics.map(name => ({name, values: [{value: ({views: 500, reach: 400, saved: 9, shares: 14, ig_reels_avg_watch_time: 12750})[name]}]}))});
    }
    throw Error(`Unexpected Instagram path: ${url.pathname}`);
  };
  const connector = createInstagramConnection({environment: {...base, INSTAGRAM_APP_ID: 'ig-client', INSTAGRAM_APP_SECRET: 'ig-secret'}, fetchImpl, now: () => now});
  const auth = new URL(connector.begin('owner-session'));
  assert.equal(auth.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_insights');
  await connector.callback({state: auth.searchParams.get('state'), code: 'code', sessionCookie: 'owner-session'});
  await assert.rejects(connector.callback({state: auth.searchParams.get('state'), code: 'code', sessionCookie: 'owner-session'}), /expired/);
  assert.ok(!getConfigValue('content_instagram_auth_v1').includes('instagram-long-secret'));
  const synced = await connector.sync();
  assert.equal(synced.posts, 1);
  assert.equal(synced.observations, 1);
  const original = store.read().records.find(row => row.platform === 'instagram');
  assert.equal(original.window, 'lifetime');
  assert.equal(original.durationSeconds, null);
  assert.equal(original.averageViewSeconds, 12.75);
  assert.equal(original.saves, 9);
  const packaged=automationStore.listPosts().find(post=>post.platform==='instagram');
  assert.deepEqual(packaged.metadata.hashtags,['#gaming']);
  assert.equal(packaged.metadata.coverUrl,'https://scontent.cdninstagram.com/cover.jpg');
  const current = store.read();
  store.save({revision: current.revision, type: 'import', rows: [{...original, durationSeconds: 30, traffic: 'organic', topic: 'Gaming', source: 'Creator correction'}]});
  await connector.sync();
  const rows = store.read().records.filter(row => row.platform === 'instagram');
  assert.deepEqual(new Set(rows.map(row => row.window)), new Set(['lifetime', '7d']));
  assert.ok(rows.every(row => row.durationSeconds === 30 && row.traffic === 'organic' && row.topic === 'Gaming'));
  await connector.disconnect();
  assert.equal(connector.status().connected, false);
});

test('Instagram code exchange reports Meta flat errors with the failing stage', async () => {
  const fetchImpl = async () => ({ok: false, status: 400,
    json: async () => ({error_type: 'OAuthException', error_message: 'Invalid client secret', code: 400})});
  const connector = createInstagramConnection({environment: {...base, INSTAGRAM_APP_ID: 'ig-client', INSTAGRAM_APP_SECRET: 'ig-secret'}, fetchImpl, now: () => now});
  const auth = new URL(connector.begin('owner-session'));
  await assert.rejects(
    connector.callback({state: auth.searchParams.get('state'), code: 'code', sessionCookie: 'owner-session'}),
    /Instagram code exchange: Instagram request failed: Invalid client secret/
  );
  assert.equal(connector.status().connected, false);
});
