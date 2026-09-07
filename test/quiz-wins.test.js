const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('quiz win totals persist by platform and user ID, including historic win events',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-win-test-'));
 const env={...process.env,DATA_DIR:dir};
 const cwd=path.join(__dirname,'..');
 execFileSync(process.execPath,['-e',`const {addEngagementEvent}=require('./src/db');
 for(const [platform,userId,correlationId,username] of [['twitch','42','old-game','kinggumption'],['twitch','42','new-game','KingGumption'],['youtube','42','other-platform','KingGumption'],['twitch','99','other-user','KingGumption']])addEngagementEvent({tool:'elimination_quiz',eventType:'player_won',platform,userId,correlationId,username});`],{cwd,env});
 const count=execFileSync(process.execPath,['-e',"process.stdout.write(String(require('./src/db').getQuizWinCount('twitch','42')))"],{cwd,env,encoding:'utf8'});
 assert.equal(count,'2');
 // This is the exact directory created above, resolved under the system temporary directory.
 const resolved=fs.realpathSync(dir),tempRoot=fs.realpathSync(os.tmpdir());
 assert.ok(resolved.startsWith(tempRoot+path.sep)&&path.basename(resolved).startsWith('quiz-win-test-'));
 fs.rmSync(resolved,{recursive:true,force:true});
});


test('validation cleanup archives only earlier quiz records, is idempotent and resets test wins',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-win-test-'));
 const script=`const assert=require('node:assert/strict');const d=require('./src/db');
 const before='2026-09-07T02:36:06Z',after='2026-09-07T02:36:08Z';
 for(const [tool,eventType,timestamp,correlationId] of [['elimination_quiz','player_won',before,'old'],['elimination_quiz','player_joined',before,'old'],['elimination_quiz','player_won',after,'new'],['king_of_the_hill','vote',before,'hill']])d.addEngagementEvent({tool,eventType,timestamp,correlationId,platform:'twitch',userId:'42'});
 assert.equal(d.getQuizWinCount('twitch','42'),2);
 const result=d.archiveQuizValidationEvents();assert.equal(result.archivedEvents,2);assert.equal(d.getQuizWinCount('twitch','42'),1);
 assert.equal(d.listEngagementEvents().length,2);assert.ok(d.listEngagementEvents().some(e=>e.tool==='king_of_the_hill'));
 assert.deepEqual(d.archiveQuizValidationEvents(),result);
 const Database=require('better-sqlite3');const db=new Database(require('node:path').join(process.env.DATA_DIR,'permissions.db'));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quiz_validation_archive').get().n,2);db.close();`;
 execFileSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir}});
 const resolved=fs.realpathSync(dir),tempRoot=fs.realpathSync(os.tmpdir());
 assert.ok(resolved.startsWith(tempRoot+path.sep)&&path.basename(resolved).startsWith('quiz-win-test-'));fs.rmSync(resolved,{recursive:true,force:true});
});
