// Uses an isolated temporary database and fixtures; never opens configured live data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'stream-benchmark-'));
process.env.APP_MODE='local';
const {db}=require('../src/db');
const {loadAnalyticsReport}=require('../src/analytics');
const {QuizGame}=require('../src/quiz-game');
const insert=db.prepare('INSERT INTO engagement_events(timestamp,tool,event_type,platform,platform_user_id,username,correlation_id,metadata) VALUES(?,?,?,?,?,?,?,?)');
db.transaction(()=>{for(let i=0;i<10000;i++)insert.run(new Date(Date.now()-i*60000).toISOString(),'king_of_the_hill','vote','twitch','viewer'+i%100,'viewer'+i%100,'game'+Math.floor(i/50),'{}');})();
let start=performance.now();const report=loadAnalyticsReport({range:'30d'});const cold=performance.now()-start;
start=performance.now();loadAnalyticsReport({range:'30d',activityPage:2,activitySearch:'viewer'});const cached=performance.now()-start;
const game=new QuizGame();start=performance.now();for(let i=0;i<1000;i++)game.getState();const quiz=(performance.now()-start)/1000;
console.log(JSON.stringify({fixtureEvents:10000,coldReportMs:cold,cachedActivityPageMs:cached,quizStateMs:quiz,interactions:report.overview.interactions,reconciliation:report.reconciliation},null,2));
db.close();
