const { db } = require('./db');
let ready = false;
function init() {
  if (ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS quiz_pass_bank (
    platform TEXT NOT NULL, user_id TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance IN (0,1)),
    PRIMARY KEY(platform,user_id));
    CREATE TABLE IF NOT EXISTS quiz_pass_awards (
    game_id TEXT NOT NULL, platform TEXT NOT NULL, user_id TEXT NOT NULL,
    PRIMARY KEY(game_id,platform,user_id));`);
  ready = true;
}
function balance(platform, id) {
  init();
  return db.prepare('SELECT balance FROM quiz_pass_bank WHERE platform=? AND user_id=?').get(platform,id)?.balance || 0;
}
function spend(platform, id) {
  init();
  return db.prepare('UPDATE quiz_pass_bank SET balance=0 WHERE platform=? AND user_id=? AND balance=1').run(platform,id).changes === 1;
}
function award(gameId, platform, id) {
  init();
  return db.transaction(() => {
    const added = db.prepare('INSERT OR IGNORE INTO quiz_pass_awards VALUES(?,?,?)').run(gameId,platform,id).changes;
    if (added) db.prepare('INSERT INTO quiz_pass_bank VALUES(?,?,1) ON CONFLICT(platform,user_id) DO UPDATE SET balance=1').run(platform,id);
    return balance(platform,id);
  })();
}
module.exports = { balance, spend, award };
