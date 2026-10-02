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
  CREATE TABLE IF NOT EXISTS content_video_groups (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
    analysis TEXT, analysis_fingerprint TEXT
  );
  CREATE TABLE IF NOT EXISTS content_video_group_members (
    platform TEXT NOT NULL, url TEXT NOT NULL, group_id TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(platform,url)
  );
  CREATE INDEX IF NOT EXISTS content_video_group_members_group ON content_video_group_members(group_id);
  CREATE TABLE IF NOT EXISTS content_advice_trials (
    id TEXT PRIMARY KEY, source_group_id TEXT NOT NULL, action_index INTEGER NOT NULL,
    analysis_fingerprint TEXT NOT NULL, field TEXT NOT NULL, change_text TEXT NOT NULL,
    reason TEXT NOT NULL, target_group_id TEXT, state TEXT NOT NULL DEFAULT 'planned',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(source_group_id,action_index,analysis_fingerprint)
  );
  CREATE INDEX IF NOT EXISTS content_advice_trials_target ON content_advice_trials(target_group_id);
  CREATE TABLE IF NOT EXISTS content_group_research (
    group_id TEXT PRIMARY KEY, examples TEXT NOT NULL, checked_at TEXT NOT NULL
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

const GROUP_WINDOW_MS = 20 * 60 * 1000;
function autoGroup() {
  return db.transaction(() => {
    const posts = listPosts(2000).sort((a,b) => Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
    const members = db.prepare('SELECT platform,url,group_id,locked FROM content_video_group_members').all();
    const byPost = new Set(members.map(row => `${row.platform}\n${row.url}`));
    const byGroup = new Map();
    const postMap = new Map(posts.map(post => [`${post.platform}\n${post.url}`,post]));
    for (const member of members) {
      const post = postMap.get(`${member.platform}\n${member.url}`);
      if (!post) continue;
      if (!byGroup.has(member.group_id)) byGroup.set(member.group_id, []);
      byGroup.get(member.group_id).push({...post,locked:Boolean(member.locked)});
    }
    const addGroup = db.prepare('INSERT INTO content_video_groups(id,created_at) VALUES(?,?)');
    const addMember = db.prepare('INSERT INTO content_video_group_members(platform,url,group_id) VALUES(?,?,?)');
    const pending = posts.filter(post => !byPost.has(`${post.platform}\n${post.url}`));
    const counts = new Map();
    for (const post of pending) counts.set(post.platform,(counts.get(post.platform)||0)+1);
    // Seed the platform with more posts first, then attach other platforms to the closest match.
    // This avoids pairing an Instagram post with an earlier YouTube upload when a closer
    // YouTube version has not been visited yet.
    pending.sort((a,b)=>(counts.get(b.platform)-counts.get(a.platform)) ||
      Date.parse(a.publishedAt)-Date.parse(b.publishedAt) || a.platform.localeCompare(b.platform));
    let added = 0;
    for (const post of pending) {
      const published = Date.parse(post.publishedAt);
      if (!Number.isFinite(published)) continue;
      let best = null;
      for (const [id, groupPosts] of byGroup) {
        if (groupPosts.some(item => item.platform === post.platform) ||
            groupPosts.some(item => item.locked) ||
            groupPosts[0]?.metadata.format !== post.metadata.format) continue;
        const distance = Math.min(...groupPosts.map(item => Math.abs(Date.parse(item.publishedAt)-published)));
        if (distance <= GROUP_WINDOW_MS && (!best || distance < best.distance)) best = {id,distance};
      }
      const id = best?.id || crypto.randomUUID();
      if (!best) {addGroup.run(id,iso(Date.now()));byGroup.set(id,[]);}
      addMember.run(post.platform,post.url,id);
      byGroup.get(id).push({...post,locked:false});
      byPost.add(`${post.platform}\n${post.url}`);
      added++;
    }
    return added;
  })();
}
function listGroups() {
  const posts = listPosts(2000);
  const postMap = new Map(posts.map(post => [`${post.platform}\n${post.url}`,post]));
  const members = db.prepare('SELECT platform,url,group_id,locked FROM content_video_group_members').all();
  const groups = new Map(db.prepare('SELECT * FROM content_video_groups').all()
    .map(row => [row.id,{id:row.id,createdAt:row.created_at,analysis:parse(row.analysis),analysisFingerprint:row.analysis_fingerprint,posts:[]}]));
  for (const member of members) {
    const post = postMap.get(`${member.platform}\n${member.url}`);
    if (post && groups.has(member.group_id)) groups.get(member.group_id).posts.push(post);
  }
  return [...groups.values()].filter(group => group.posts.length)
    .map(group => ({...group,posts:group.posts.sort((a,b) => Date.parse(a.publishedAt)-Date.parse(b.publishedAt))}))
    .sort((a,b) => Date.parse(b.posts.at(-1).publishedAt)-Date.parse(a.posts.at(-1).publishedAt));
}
function removeFromGroup(id,platform,url) {
  if (!/^[0-9a-f-]{36}$/.test(String(id)) || !['youtube','instagram','tiktok'].includes(platform) || typeof url !== 'string') return false;
  return db.transaction(() => {
    const member = db.prepare('SELECT group_id FROM content_video_group_members WHERE platform=? AND url=?').get(platform,url);
    if (member?.group_id !== id) return false;
    const count = db.prepare('SELECT COUNT(*) AS count FROM content_video_group_members WHERE group_id=?').get(id).count;
    if (count < 2) return false;
    const soloId = crypto.randomUUID();
    db.prepare('INSERT INTO content_video_groups(id,created_at) VALUES(?,?)').run(soloId,iso(Date.now()));
    db.prepare('UPDATE content_video_group_members SET group_id=?,locked=1 WHERE platform=? AND url=?').run(soloId,platform,url);
    return true;
  })();
}
function saveGroupAnalysis(id,analysis,hash) {
  return db.prepare('UPDATE content_video_groups SET analysis=?,analysis_fingerprint=? WHERE id=?')
    .run(JSON.stringify(analysis),hash,id).changes;
}
function listTrials() {
  return db.prepare('SELECT * FROM content_advice_trials ORDER BY created_at DESC').all().map(row=>({
    id:row.id,sourceGroupId:row.source_group_id,actionIndex:row.action_index,
    analysisFingerprint:row.analysis_fingerprint,field:row.field,change:row.change_text,
    reason:row.reason,targetGroupId:row.target_group_id,state:row.state,
    createdAt:row.created_at,updatedAt:row.updated_at,
  }));
}
function createTrial(group,index,now) {
  const action=group.analysis?.actions?.[index];
  if(!action || !group.analysisFingerprint) throw Error('Analyze this group before tracking a suggestion.');
  const id=crypto.randomUUID(),at=iso(now);
  db.prepare(`INSERT OR IGNORE INTO content_advice_trials
    (id,source_group_id,action_index,analysis_fingerprint,field,change_text,reason,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id,group.id,index,group.analysisFingerprint,action.field,action.change,action.reason,at,at);
  return listTrials().find(row=>row.sourceGroupId===group.id&&row.actionIndex===index&&row.analysisFingerprint===group.analysisFingerprint);
}
function updateTrial(id,{targetGroupId,state},now) {
  if(!/^[0-9a-f-]{36}$/.test(String(id)) || !['planned','applied','dismissed'].includes(state)) throw Error('Invalid test update.');
  if(state==='applied'&&!targetGroupId) throw Error('Choose the video where you applied the suggestion.');
  if(targetGroupId!=null&&!/^[0-9a-f-]{36}$/.test(String(targetGroupId))) throw Error('Choose a valid video group.');
  const result=db.prepare('UPDATE content_advice_trials SET target_group_id=?,state=?,updated_at=? WHERE id=?')
    .run(targetGroupId||null,state,iso(now),id);
  if(!result.changes) throw Error('Tracked suggestion not found.');
  return listTrials().find(row=>row.id===id);
}
function saveGroupResearch(id,items,now) {
  db.prepare(`INSERT INTO content_group_research(group_id,examples,checked_at) VALUES(?,?,?)
    ON CONFLICT(group_id) DO UPDATE SET examples=excluded.examples,checked_at=excluded.checked_at`)
    .run(id,JSON.stringify(items),iso(now));
}
function groupResearch(id) {
  const row=db.prepare('SELECT examples,checked_at FROM content_group_research WHERE group_id=?').get(id);
  return row?{examples:parse(row.examples),checkedAt:row.checked_at}:null;
}
module.exports={upsertPosts,listPosts,snapshots,saveAnalysis,setAdviceState,jobStatus,claimJob,finishJob,reserveSpend,spendStatus,saveExamples,examples,fingerprint,autoGroup,listGroups,removeFromGroup,saveGroupAnalysis,listTrials,createTrial,updateTrial,saveGroupResearch,groupResearch};
