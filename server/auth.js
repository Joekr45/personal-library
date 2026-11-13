// Password hashing and login sessions, using only Node's built-in crypto module.
import crypto from 'node:crypto';

const SESSION_DAYS = 90;
export const SESSION_COOKIE = 'pl_session';

// --- Passwords: scrypt with a random salt. Stored as "scrypt$<salt>$<hash>". ---
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// --- Sessions: a random token goes in a cookie; only its SHA-256 hash is stored. ---
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires.toISOString());
  return { token, maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60 };
}

export function userForSession(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.role, u.color, u.circle, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    deleteSession(db, token);
    return null;
  }
  return publicUser(row);
}

export function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}

// What the browser is allowed to see about a user (never the password hash).
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    color: row.color,
    circle: row.circle === 'friend' ? 'friend' : 'family'
  };
}

// --- Simple protection against password guessing: max 10 failed logins per 15 min per IP. ---
const failedLogins = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

export function isLoginBlocked(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordLoginFailure(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failedLogins.set(ip, { first: Date.now(), count: 1 });
  } else {
    entry.count++;
  }
}

export function clearLoginFailures(ip) {
  failedLogins.delete(ip);
}
