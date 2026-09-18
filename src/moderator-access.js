const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { db, getConfigValue, setConfigValue } = require('./db');
db.exec(`CREATE TABLE IF NOT EXISTS moderator_accounts (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, expires_at INTEGER NOT NULL
);`);
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use a password between 12 and 256 characters.');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
async function checkPassword(password, encoded) {
  try {
    const [salt, expected] = encoded.split(':');
    const actual = await scrypt(String(password).slice(0,256), salt, 64);
    const buffer = Buffer.from(expected,'hex');
    return buffer.length === actual.length && crypto.timingSafeEqual(buffer,actual);
  } catch { return false; }
}
function list() { return db.prepare('SELECT id,username,enabled FROM moderator_accounts ORDER BY username').all(); }
async function create(username, password) {
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || username === 'owner') throw new Error('Use a unique username of 3–32 letters, numbers, underscores or hyphens.');
  if (list().length >= 50) throw new Error('Moderator account limit reached.');
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO moderator_accounts (id,username,password_hash) VALUES (?,?,?)').run(id,username,passwordHash);
  return {id,username};
}
function revoke(id) {
  db.transaction(() => {
    db.prepare('UPDATE moderator_accounts SET enabled=0 WHERE id=?').run(id);
    db.prepare('DELETE FROM admin_sessions WHERE user_id=?').run(id);
  })();
}
async function authenticate(username,password) {
  const user = db.prepare('SELECT * FROM moderator_accounts WHERE username=? AND enabled=1').get(String(username).trim().toLowerCase());
  // Equal-cost verification for unknown users.
  if (!await checkPassword(password, user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`)) return null;
  return user && { id: user.id, username: user.username, role:'games' };
}
function issue(user, now = Date.now()) {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').run(now);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO admin_sessions VALUES (?,?,?,?)').run(digest(token),user.id,user.role,now+12*3600000);
  return token;
}
function session(token, now = Date.now()) {
  if (!token) return null;
  const record = db.prepare('SELECT * FROM admin_sessions WHERE id_hash=? AND expires_at>?').get(digest(token),now);
  if (!record) return null;
  if (record.role === 'owner') return {id:'owner',username:'Owner',role:'owner'};
  const user = db.prepare('SELECT id,username FROM moderator_accounts WHERE id=? AND enabled=1').get(record.user_id);
  return user ? {...user,role:'games'} : null;
}
function logout(token) { if(token)db.prepare('DELETE FROM admin_sessions WHERE id_hash=?').run(digest(token)); }
function handoff(now = Date.now()) {
  const setting = getConfigValue('games_handoff',{enabled:false,expiresAt:null});
  return {...setting,enabled:setting.enabled===true && (!setting.expiresAt || setting.expiresAt>now)};
}
function setHandoff(enabled, minutes = 60) {
  if (typeof enabled !== 'boolean' || !Number.isInteger(minutes) || minutes<1 || minutes>720) throw Error('Choose an expiry from 1 to 720 minutes.');
  const setting={enabled,expiresAt:enabled ? Date.now()+minutes*60000 : null};
  setConfigValue('games_handoff',setting);return setting;
}
module.exports={list,create,revoke,authenticate,issue,session,logout,handoff,setHandoff};
