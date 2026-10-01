const crypto = require('node:crypto');
const {db} = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS content_posts (
    platform TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT NOT NULL,
    metadata TEXT NOT NULL, updated_at TEXT NOT NULL,
    analysis TEXT, analysis_fingerprint TEXT, advice_state TEXT NOT NULL DEFAULT 'new',
    PRIMARY KEY(platform,url)
  );
  CREATE TABLE IF NOT EXISTS content_snapshots (
    platform TEXT NOT NULL, url TEXT NOT NULL, observed_at TEXT NOT NULL,
    metrics TEXT NOT NULL, PRIMARY KEY(platform,url,observed_at)
  );
  CREATE INDEX IF NOT EXISTS content_snapshots_post ON content_snapshots(platform,url,observed_at);
  CREATE TABLE IF NOT EXISTS content_job (
    name TEXT PRIMARY KEY, next_at TEXT, lease_until TEXT, last_started_at TEXT,
    last_finished_at TEXT, last_error TEXT, detail TEXT
  );
  CREATE TABLE IF NOT EXISTS content_ai_spend (
    month TEXT PRIMARY KEY, reserved_gbp REAL NOT NULL DEFAULT 0,
    estimated_gbp REAL NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS content_public_examples (
    post_url TEXT NOT NULL, video_id TEXT NOT NULL, data TEXT NOT NULL,
    checked_at TEXT NOT NULL, PRIMARY KEY(post_url,video_id)
  );
`);

const parse = value => value ? JSON.parse(value) : null;
const iso = now => new Date(now).toISOString();
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function upsertPosts(platform, posts, observedAt) {
  const update = db.prepare(`INSERT INTO content_posts(platform,url,published_at,metadata,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(platform,url) DO UPDATE SET
    metadata=excluded.metadata,updated_at=excluded.updated_at`);
  const snapshot = db.prepare(`INSERT OR REPLACE INTO content_snapshots(platform,url,observed_at,metrics) VALUES(?,?,?,?)`);
  const cutoff = Date.parse(observedAt) - 366 * 86400000;
  return db.transaction(() => {
    let count = 0;
    for (const post of posts) {
      if (!post.url || !Number.isFinite(Date.parse(post.publishedAt)) || Date.parse(post.publishedAt) < cutoff) continue;
      const metadata = {
        title: String(post.title || '').slice(0, 300),
        description: String(post.description || '').slice(0, 10000),
        hashtags: Array.isArray(post.hashtags) ? post.hashtags.slice(0, 30).map(String) : [],
        category: post.category == null ? null : String(post.category).slice(0, 100),
        coverUrl: post.coverUrl || null,
        format: post.format, durationSeconds: post.durationSeconds ?? null,
        source: platform, publishedAt: post.publishedAt,
      };
      update.run(platform, post.url, post.publishedAt, JSON.stringify(metadata), observedAt);
      snapshot.run(platform, post.url, observedAt, JSON.stringify(post.metrics || {}));
      count++;
    }
    return count;
  })();
}

function listPosts(limit = 500) {
  const rows = db.prepare(`SELECT p.*,s.metrics,s.observed_at FROM content_posts p LEFT JOIN content_snapshots s
    ON s.platform=p.platform AND s.url=p.url AND s.observed_at=(SELECT MAX(observed_at) FROM content_snapshots WHERE platform=p.platform AND url=p.url)
    ORDER BY p.published_at DESC LIMIT ?`).all(Math.min(Math.max(Number(limit) || 500, 1), 2000));
  return rows.map(r => ({platform:r.platform,url:r.url,publishedAt:r.published_at,metadata:parse(r.metadata),
    metrics:parse(r.metrics) || {},observedAt:r.observed_at,analysis:parse(r.analysis),
    fingerprint:r.analysis_fingerprint,adviceState:r.advice_state}));
}
function snapshots(platform,url) {
  return db.prepare('SELECT observed_at,metrics FROM content_snapshots WHERE platform=? AND url=? ORDER BY observed_at').all(platform,url)
    .map(r=>({observedAt:r.observed_at,metrics:parse(r.metrics)}));
}
function saveAnalysis(platform,url,analysis,hash) {
  return db.prepare(`UPDATE content_posts SET analysis=?,analysis_fingerprint=? WHERE platform=? AND url=?`)
    .run(JSON.stringify(analysis),hash,platform,url).changes;
}
function setAdviceState(platform,url,state) {
  if (!['new','tried','dismissed'].includes(state)) throw Error('Invalid advice state.');
  return db.prepare('UPDATE content_posts SET advice_state=? WHERE platform=? AND url=?').run(state,platform,url).changes;
}
function jobStatus(name='daily') { return db.prepare('SELECT * FROM content_job WHERE name=?').get(name) || null; }
function claimJob(name,now,leaseMs=30*60000) {
  const at=iso(now),until=iso(now+leaseMs);
  return db.transaction(()=>{
    const current=jobStatus(name);
    if (current?.lease_until && current.lease_until>at) return false;
    if (current?.next_at && current.next_at>at) return false;
    db.prepare(`INSERT INTO content_job(name,lease_until,last_started_at) VALUES(?,?,?) ON CONFLICT(name)
      DO UPDATE SET lease_until=excluded.lease_until,last_started_at=excluded.last_started_at,last_error=NULL`)
      .run(name,until,at);
    return true;
  })();
}
function finishJob(name,now,detail,error=null) {
  db.prepare(`UPDATE content_job SET lease_until=NULL,last_finished_at=?,next_at=?,last_error=?,detail=? WHERE name=?`)
    .run(iso(now),iso(now+(error?60*60000:24*60*60000)),error ? String(error).slice(0,500) : null,JSON.stringify(detail),name);
}
function reserveSpend(now,amount,budget) {
  const month=iso(now).slice(0,7);
  return db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO content_ai_spend(month) VALUES(?)').run(month);
    const row=db.prepare('SELECT * FROM content_ai_spend WHERE month=?').get(month);
    if (row.reserved_gbp+amount>budget) return false;
    db.prepare('UPDATE content_ai_spend SET reserved_gbp=reserved_gbp+?,requests=requests+1 WHERE month=?').run(amount,month);
    return true;
  })();
}
function spendStatus(now) {return db.prepare('SELECT * FROM content_ai_spend WHERE month=?').get(iso(now).slice(0,7)) || {month:iso(now).slice(0,7),reserved_gbp:0,estimated_gbp:0,requests:0};}
function saveExamples(url,items,now) {
  db.transaction(()=>{
    db.prepare('DELETE FROM content_public_examples WHERE post_url=?').run(url);
    const insert=db.prepare('INSERT INTO content_public_examples(post_url,video_id,data,checked_at) VALUES(?,?,?,?)');
    for(const item of items)insert.run(url,item.id,JSON.stringify(item),iso(now));
    db.prepare('DELETE FROM content_public_examples WHERE checked_at<?').run(iso(now-30*86400000));
  })();
}
function examples(url) {return db.prepare('SELECT data,checked_at FROM content_public_examples WHERE post_url=?').all(url).map(r=>({...parse(r.data),checkedAt:r.checked_at}));}
module.exports={upsertPosts,listPosts,snapshots,saveAnalysis,setAdviceState,jobStatus,claimJob,finishJob,reserveSpend,spendStatus,saveExamples,examples,fingerprint};
