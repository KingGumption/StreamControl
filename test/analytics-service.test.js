const test=require('node:test'),assert=require('node:assert/strict');
const {addEngagementEvent,db}=require('../src/db');
const service=require('../src/analytics-service');
test('worker reports reconcile, concurrent loads share work and activity pages are separate',async t=>{
 t.after(()=>service.close());
 const id='worker-viewer-'+Date.now();
 db.transaction(()=>{for(let i=0;i<130;i++)addEngagementEvent({tool:'king_of_the_hill',eventType:'vote',platform:'twitch',userId:id,username:id,correlationId:'worker-game'});})();
 const first=service.request({range:'7d'}),second=service.request({range:'7d'});
 assert.equal(first,second);
 const report=await first;
 assert.equal(report.overview.interactions,report.reconciliation.timeline);
 const page=await service.request({range:'7d',activitySearch:id,activityPage:1,snapshotAt:report.generatedAt},true);
 assert.equal(page.activityPagination.total,130);assert.equal(page.activity.length,30);assert.equal(page.overview,undefined);
 assert.equal(page.generatedAt,report.generatedAt);
 await service.close();
 assert.equal((await service.request({range:'7d'})).ok,true);
});
