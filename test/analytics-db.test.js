const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('database loading retains old open sessions, sample peaks, weighted averages and ledger pagination',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'analytics-audit-'));
  try{
    const result=execFileSync(process.execPath,['-e',`
      const d=require('./src/db');
      d.openStreamSession({id:'old',platform:'twitch',startedAt:'2026-07-01T00:00:00Z'});
      d.openStreamSession({id:'closed',platform:'youtube',startedAt:'2026-07-01T00:00:00Z'});
      d.closeStreamSession({id:'closed',endedAt:'2026-07-02T00:00:00Z'});
      for(const [second,n] of [[0,10],[10,30],[20,20]])d.addViewerSnapshot({platform:'twitch',timestamp:'2026-09-07T18:00:'+String(second).padStart(2,'0')+'Z',viewerCount:n});
      for(let i=0;i<120;i++)d.addEngagementEvent({timestamp:'2026-09-07T18:00:00Z',tool:'king_of_the_hill',eventType:'vote',platform:'twitch',userId:String(i),username:'Viewer'+i});
      const sessions=d.listStreamSessionsForRange({since:'2026-09-01T00:00:00Z'});
      const samples=d.listViewerSnapshotsForRange({since:'2026-09-01T00:00:00Z'});
      const report=require('./src/analytics').loadAnalyticsReport({now:'2026-09-08T00:00:00Z',range:'7d',activityPage:1});
      process.stdout.write(JSON.stringify({sessions:sessions.map(s=>s.id),samples,activity:report.activity.length,pagination:report.activityPagination,checks:report.reconciliation}));
    `],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir},encoding:'utf8'});
    const r=JSON.parse(result);assert.deepEqual(r.sessions,['old']);assert.equal(r.samples[0].viewer_count,20);assert.equal(r.samples[0].peak_viewer_count,30);assert.equal(r.samples[0].sample_count,3);
    assert.equal(r.activity,20);assert.equal(r.pagination.page,1);assert.equal(r.checks.roundups,120);
  }finally{
    const resolved=fs.realpathSync(dir),root=fs.realpathSync(os.tmpdir());
    assert.ok(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('analytics-audit-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
