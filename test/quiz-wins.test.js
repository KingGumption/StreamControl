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
