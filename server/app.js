// The web server: a small JSON API plus serving the built React app.
// Built on Node's own http module, so the server has no third-party dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDatabase } from './db.js';
import { createLookup } from './lookup.js';
import { createCoverStore, CoverError, COVER_CONTENT_TYPES } from './covers.js';
import { createHardcover, HardcoverError, cleanToken } from './hardcover.js';
import { createBackups } from './backups.js';
import { classifyCode } from '../shared/isbn.js';
import {
  SESSION_COOKIE, hashPassword, verifyPassword, createSession, userForSession,
  deleteSession, deleteExpiredSessions, publicUser,
  isLoginBlocked, recordLoginFailure, clearLoginFailures
} from './auth.js';

const MAX_BODY_BYTES = 4 * 1024 * 1024; // room for a phone photo of a cover
const USER_COLORS = [
  'from-orange-500 to-amber-500',
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-purple-600 to-pink-600',
  'from-rose-600 to-orange-600'
];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createServer({ dataDir, distDir, allowRegistration = true, signupMode: defaultSignupMode, fetchImpl, googleApiKey, resolveHost, startBackups = false }) {
  const db = openDatabase(dataDir);
  const lookup = createLookup({ fetchImpl, googleApiKey });
  const covers = createCoverStore({ dataDir, fetchImpl, resolveHost });

  // Library-wide settings
  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  const setSetting = (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  const deleteSetting = (key) => db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  const hardcover = createHardcover({ getToken: () => getSetting('hardcover_token'), fetchImpl });
  const backups = createBackups({ db, dataDir });
  if (startBackups) backups.start();

  // Who may create an account (after the first one, which is always allowed):
  //   'invite' – only with an invite code from the Owner, 'open' – anyone, 'closed' – nobody.
  // The Owner's choice in Settings wins; otherwise the server setting (SIGNUP_MODE / ALLOW_REGISTRATION).
  const SIGNUP_MODES = ['invite', 'open', 'closed'];
  const fallbackMode = SIGNUP_MODES.includes(defaultSignupMode) ? defaultSignupMode : allowRegistration ? 'open' : 'closed';
  const signupMode = () => {
    const saved = getSetting('signup_mode');
    if (SIGNUP_MODES.includes(saved)) return saved;
    if (getSetting('allow_registration') === 'false') return 'closed'; // older "sign-ups off" switch
    return fallbackMode;
  };

  // Invite codes look like "K7QP-3MZD": no 0/O or 1/I so they're easy to read out and type.
  const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newInviteCode = () => {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, b => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  };
  const normalizeCode = (code) => {
    const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  };
  const inviteStatus = (row) => (row.used_by || row.used_at ? 'used' : new Date(`${row.expires_at}Z`) < new Date() ? 'expired' : 'active');

  // Family sharing: each person chooses whether the rest of the family can see their library.
  const isSharing = (userId) => getSetting(`share:${userId}`) === 'true';

  const requireOwner = (req) => {
    const user = requireUser(req);
    if (user.role !== 'Owner') throw new HttpError(403, 'Only the library owner can change this setting.');
    return user;
  };
  const hardcoverCall = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HardcoverError) throw new HttpError(502, err.message);
      throw err;
    }
  };
  deleteExpiredSessions(db);
  setInterval(() => deleteExpiredSessions(db), 6 * 60 * 60 * 1000).unref();

  // ---------- helpers ----------
  const sendJson = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };

  const readJson = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });

  const getCookie = (req, name) => {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
  };

  // Mark the cookie "Secure" only when the browser reached us over HTTPS
  // (e.g. through a reverse proxy), so plain http://server-ip:8085 still works on the LAN.
  const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;

  const sessionCookie = (req, token, maxAgeSeconds) => [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(isHttps(req) ? ['Secure'] : [])
  ].join('; ');

  const clientIp = (req) => req.socket.remoteAddress || 'unknown';

  const requireUser = (req) => {
    const user = userForSession(db, getCookie(req, SESSION_COOKIE));
    if (!user) throw new HttpError(401, 'Please sign in.');
    return user;
  };

  const cleanText = (value, max = 500) =>
    typeof value === 'string' ? value.trim().slice(0, max) : '';

  // Checks a book sent by the browser and keeps only sensible data.
  const validateBook = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HttpError(400, 'Book data is missing.');
    }
    const { id, userId, user_id, addedAt, ...data } = input; // the server decides ids, owners and dates added
    data.workTitle = cleanText(data.workTitle);
    data.author = cleanText(data.author);
    if (!data.workTitle) throw new HttpError(400, 'A book needs a title.');
    if (!data.author) throw new HttpError(400, 'A book needs an author.');
    if (!Array.isArray(data.editions)) data.editions = [];
    data.owned = data.owned !== false;
    // Reading life: rating 1-5 (halves allowed), notes, and dates as YYYY-MM-DD.
    if (data.rating !== undefined) {
      const r = Math.round(Number(data.rating) * 2) / 2;
      data.rating = r >= 0.5 && r <= 5 ? r : null;
    }
    if (data.notes !== undefined) data.notes = typeof data.notes === 'string' ? data.notes.slice(0, 20000) : null;
    // Lending history: [{ to, lentOn, returnedOn }]
    if (data.loans !== undefined) {
      const date = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null);
      data.loans = (Array.isArray(data.loans) ? data.loans : []).slice(-100)
        .map(l => ({ to: cleanText(l?.to, 100), lentOn: date(l?.lentOn), returnedOn: date(l?.returnedOn) }))
        .filter(l => l.to);
    }
    for (const field of ['dateStarted', 'dateFinished']) {
      if (data[field] !== undefined && data[field] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(data[field]))) {
        throw new HttpError(400, 'Dates must look like 2026-11-11.');
      }
    }
    return data;
  };

  // created_at is stored as "YYYY-MM-DD HH:MM:SS" (UTC); send it to the app as a proper date.
  const bookFromRow = (row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    ...(row.created_at ? { addedAt: `${row.created_at.replace(' ', 'T')}Z` } : {})
  });

  // ---------- API routes ----------
  const routes = {
    'GET /api/health': () => ({ status: 200, body: { ok: true } }),

    'GET /api/auth/me': (req) => {
      const user = userForSession(db, getCookie(req, SESSION_COOKIE));
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
      const mode = count === 0 ? 'open' : signupMode();
      return { status: 200, body: { user, hasUsers: count > 0, signupMode: mode, allowRegistration: mode !== 'closed' } };
    },

    'POST /api/auth/register': async (req) => {
      const body = await readJson(req);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const displayName = cleanText(body.displayName, 60) || email.split('@')[0];

      const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
      // The very first account can always be created; after that it depends on the sign-up mode.
      const mode = count === 0 ? 'open' : signupMode();
      if (mode === 'closed') throw new HttpError(403, 'New sign-ups are turned off. Ask the library owner to add you.');
      let invite = null;
      if (mode === 'invite') {
        const ip = clientIp(req);
        if (isLoginBlocked(ip)) throw new HttpError(429, 'Too many wrong codes. Please wait 15 minutes and try again.');
        invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(normalizeCode(body.inviteCode));
        if (!invite || inviteStatus(invite) !== 'active') {
          recordLoginFailure(ip);
          throw new HttpError(403, invite && inviteStatus(invite) === 'expired'
            ? 'That invite code has expired. Ask the library owner for a new one.'
            : invite ? 'That invite code has already been used. Ask the library owner for a new one.'
              : 'You need a valid invite code from the library owner to create an account.');
        }
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters long.');
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        throw new HttpError(409, 'An account with this email address already exists.');
      }

      const user = {
        id: crypto.randomUUID(),
        email,
        display_name: displayName,
        role: count === 0 ? 'Owner' : 'Member',
        color: USER_COLORS[count % USER_COLORS.length]
      };
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO users (id, email, password_hash, display_name, role, color) VALUES (?, ?, ?, ?, ?, ?)')
          .run(user.id, user.email, hashPassword(password), user.display_name, user.role, user.color);
        if (invite) {
          // Use up the code (only if nobody else used it a moment ago)
          const used = db.prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code = ? AND used_at IS NULL").run(user.id, invite.code);
          if (used.changes === 0) throw new HttpError(403, 'That invite code has already been used. Ask the library owner for a new one.');
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const session = createSession(db, user.id);
      return {
        status: 201,
        body: { user: publicUser(user) },
        headers: { 'Set-Cookie': sessionCookie(req, session.token, session.maxAgeSeconds) }
      };
    },

    'POST /api/auth/login': async (req) => {
      const ip = clientIp(req);
      if (isLoginBlocked(ip)) throw new HttpError(429, 'Too many failed sign-in attempts. Please wait 15 minutes and try again.');

      const body = await readJson(req);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!row || !verifyPassword(password, row.password_hash)) {
        recordLoginFailure(ip);
        throw new HttpError(401, 'Incorrect email address or password.');
      }
      clearLoginFailures(ip);
      const session = createSession(db, row.id);
      return {
        status: 200,
        body: { user: publicUser(row) },
        headers: { 'Set-Cookie': sessionCookie(req, session.token, session.maxAgeSeconds) }
      };
    },

    'POST /api/auth/logout': (req) => {
      deleteSession(db, getCookie(req, SESSION_COOKIE));
      return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(req, '', 0) } };
    },

    // Search the catalogs by title and/or author.
    'GET /api/lookup/search': async (req) => {
      requireUser(req);
      const params = new URL(req.url, 'http://localhost').searchParams;
      const title = cleanText(params.get('title') || '', 200);
      const author = cleanText(params.get('author') || '', 200);
      if (!title && !author) throw new HttpError(400, 'Enter a title, an author, or both.');
      return { status: 200, body: { results: await lookup.searchBooks({ title, author }) } };
    },

    // All the cover pictures we can find for a book, labelled by edition.
    'GET /api/lookup/covers': async (req) => {
      requireUser(req);
      const params = new URL(req.url, 'http://localhost').searchParams;
      const isbn13 = classifyCode(params.get('isbn') || '').isbn13 || '';
      const workKey = /^\/works\/OL\d+W$/.test(params.get('workKey') || '') ? params.get('workKey') : '';
      const result = await lookup.getCoverOptions({
        isbn13,
        workKey,
        title: cleanText(params.get('title') || '', 200),
        author: cleanText(params.get('author') || '', 200),
        language: cleanText(params.get('language') || '', 40)
      });
      return { status: 200, body: result || { options: [], languages: [], workKey: null } };
    },

    // Find authors by name (several people can share a name).
    'GET /api/authors/search': async (req) => {
      requireUser(req);
      const q = cleanText(new URL(req.url, 'http://localhost').searchParams.get('q') || '', 200);
      if (!q) throw new HttpError(400, 'Enter an author\'s name.');
      return { status: 200, body: { authors: await lookup.searchAuthors(q) } };
    },

    // Change your own password (signs out your other devices).
    'PUT /api/auth/password': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
      if (!verifyPassword(String(body.currentPassword || ''), row.password_hash)) throw new HttpError(400, 'Your current password is not right.');
      const next = String(body.newPassword || '');
      if (next.length < 8) throw new HttpError(400, 'The new password must be at least 8 characters long.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
      const current = getCookie(req, SESSION_COOKIE);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, crypto.createHash('sha256').update(current || '').digest('hex'));
      return { status: 200, body: { ok: true } };
    },

    // ----- Owner tools -----
    'GET /api/admin/users': (req) => {
      requireOwner(req);
      const users = db.prepare(`
        SELECT u.id, u.email, u.display_name, u.role, u.color, u.created_at,
               (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) AS book_count
        FROM users u ORDER BY u.created_at
      `).all().map(u => ({ ...publicUser(u), createdAt: u.created_at, bookCount: u.book_count }));
      return { status: 200, body: { users, signupMode: signupMode(), signupsOpen: signupMode() !== 'closed' } };
    },

    'PUT /api/admin/signups': async (req) => {
      requireOwner(req);
      const body = await readJson(req);
      // { mode: 'invite' | 'open' | 'closed' }  (older form: { open: true/false })
      const mode = SIGNUP_MODES.includes(body.mode) ? body.mode : body.open === true ? 'open' : body.open === false ? 'closed' : null;
      if (!mode) throw new HttpError(400, 'Choose invite, open or closed.');
      setSetting('signup_mode', mode);
      return { status: 200, body: { signupMode: mode, signupsOpen: mode !== 'closed' } };
    },

    'GET /api/admin/invites': (req) => {
      requireOwner(req);
      const rows = db.prepare(`
        SELECT i.*, u.display_name AS used_by_name FROM invites i LEFT JOIN users u ON u.id = i.used_by
        ORDER BY i.created_at DESC LIMIT 100
      `).all();
      return {
        status: 200,
        body: {
          invites: rows.map(r => ({
            code: r.code,
            note: r.note,
            createdAt: `${r.created_at.replace(' ', 'T')}Z`,
            expiresAt: `${r.expires_at.replace(' ', 'T')}Z`,
            status: inviteStatus(r),
            usedBy: r.used_by_name || null
          }))
        }
      };
    },

    // Create an invite code: { note: "Mom", days: 7 }
    'POST /api/admin/invites': async (req) => {
      const owner = requireOwner(req);
      const body = await readJson(req);
      const days = Math.min(90, Math.max(1, Number(body.days) || 7));
      const expires = new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      let code = newInviteCode();
      while (db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code)) code = newInviteCode();
      db.prepare('INSERT INTO invites (code, created_by, note, expires_at) VALUES (?, ?, ?, ?)').run(code, owner.id, cleanText(body.note, 60) || null, expires);
      return { status: 201, body: { code, expiresAt: `${expires.replace(' ', 'T')}Z` } };
    },

    'GET /api/admin/backups': (req) => {
      requireOwner(req);
      return { status: 200, body: { backups: backups.list() } };
    },

    'POST /api/admin/backups': (req) => {
      requireOwner(req);
      backups.backupNow();
      return { status: 200, body: { backups: backups.list() } };
    },

    // ----- Settings -----
    'GET /api/settings': (req) => {
      const user = requireUser(req);
      const connected = Boolean(getSetting('hardcover_token'));
      return {
        status: 200,
        body: {
          isOwner: user.role === 'Owner',
          hardcover: { connected, username: connected ? getSetting('hardcover_username') : null }
        }
      };
    },

    // Connect Hardcover: checks the code works before saving it. The code is never sent back to browsers.
    'PUT /api/settings/hardcover': async (req) => {
      requireOwner(req);
      const token = cleanToken((await readJson(req)).token);
      if (!token) throw new HttpError(400, 'Paste your Hardcover API code first.');
      const username = await hardcoverCall(() => hardcover.testToken(token));
      setSetting('hardcover_token', token);
      if (username) setSetting('hardcover_username', username);
      else deleteSetting('hardcover_username');
      hardcover.clearCache();
      return { status: 200, body: { hardcover: { connected: true, username } } };
    },

    'DELETE /api/settings/hardcover': (req) => {
      requireOwner(req);
      deleteSetting('hardcover_token');
      deleteSetting('hardcover_username');
      hardcover.clearCache();
      return { status: 200, body: { hardcover: { connected: false, username: null } } };
    },

    // ----- Series (needs Hardcover) -----
    // Which series is this book in? ?isbn=&title=&author=
    'GET /api/series/find': async (req) => {
      requireUser(req);
      if (!getSetting('hardcover_token')) return { status: 200, body: { available: false, series: null } };
      const params = new URL(req.url, 'http://localhost').searchParams;
      const code = classifyCode(params.get('isbn') || '');
      const series = await hardcoverCall(() => hardcover.findSeries({
        isbn13: code.isbn13 || '',
        isbn10: code.isbn10 || '',
        title: cleanText(params.get('title') || '', 300),
        author: cleanText(params.get('author') || '', 200)
      }));
      return { status: 200, body: { available: true, series } };
    },

    'GET /api/books': (req) => {
      const user = requireUser(req);
      const rows = db.prepare('SELECT id, data, created_at FROM books WHERE user_id = ? ORDER BY created_at DESC, rowid DESC').all(user.id);
      return { status: 200, body: { books: rows.map(bookFromRow) } };
    },

    'POST /api/books': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      delete body.coverFile; // managed by the server
      const data = validateBook(body);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO books (id, user_id, data) VALUES (?, ?, ?)').run(id, user.id, JSON.stringify(data));
      return { status: 201, body: { book: bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(id)) } };
    },

    // Add many books at once (Goodreads import). Invalid entries are skipped and counted.
    'POST /api/books/bulk': async (req) => {
      const user = requireUser(req);
      const list = (await readJson(req)).books;
      if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, 'No books to add.');
      if (list.length > 5000) throw new HttpError(400, 'Please import at most 5,000 books at a time.');
      const insert = db.prepare('INSERT INTO books (id, user_id, data) VALUES (?, ?, ?)');
      const ids = [];
      let skipped = 0;
      db.exec('BEGIN');
      try {
        for (const raw of list) {
          try {
            const body = { ...raw };
            delete body.coverFile;
            const data = validateBook(body);
            const id = crypto.randomUUID();
            insert.run(id, user.id, JSON.stringify(data));
            ids.push(id);
          } catch (err) {
            if (!(err instanceof HttpError)) throw err;
            skipped++;
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      const get = db.prepare('SELECT id, data, created_at FROM books WHERE id = ?');
      return { status: 201, body: { added: ids.length, skipped, books: ids.map(id => bookFromRow(get.get(id))) } };
    },

    // New and upcoming books from the authors and series in your library.
    'GET /api/new-releases': async (req) => {
      const user = requireUser(req);
      const mine = db.prepare('SELECT data FROM books WHERE user_id = ?').all(user.id).map(r => JSON.parse(r.data));
      const have = new Set(mine.map(b => lookup.mainTitleKey(b.workTitle)));
      const dismissed = new Set(JSON.parse(getSetting(`dismissed:${user.id}`) || '[]'));
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffText = cutoff.toISOString().slice(0, 10);

      // Your 15 most-collected authors (first-listed author of each book)
      const counts = new Map();
      for (const b of mine) {
        const name = String(b.author || '').split(',')[0].trim();
        if (name && name !== 'Unknown Author') counts.set(name, (counts.get(name) || 0) + 1);
      }
      const authors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name]) => name);

      const found = new Map();
      for (const name of authors) {
        for (const r of await lookup.recentByAuthor(name)) {
          if (!r.date || r.date < cutoffText || have.has(r.titleKey) || dismissed.has(r.id)) continue;
          if (!found.has(r.titleKey)) found.set(r.titleKey, { ...r, reason: `New from ${name}` });
        }
      }

      // Newest books in series you collect (needs Hardcover)
      if (getSetting('hardcover_token')) {
        const seriesIds = [...new Set(mine.map(b => b.hardcoverSeriesId).filter(Boolean))].slice(0, 20);
        for (const id of seriesIds) {
          let series = null;
          try { series = await hardcover.seriesBooks(id); } catch { continue; }
          for (const b of series?.books || []) {
            const key = lookup.mainTitleKey(b.title);
            const hcId = `hc-${b.hardcoverId}`;
            if (!b.year || Number(b.year) < cutoff.getFullYear() || have.has(key) || dismissed.has(hcId)) continue;
            const existing = found.get(key);
            if (existing) existing.reason = `${series.name} #${b.position}`;
            else found.set(key, { id: hcId, title: b.title, author: mine.find(m => m.hardcoverSeriesId === id)?.author || '', date: b.year, cover: b.cover, isbn13: null, reason: `${series.name} #${b.position}`, series: series.name, seriesNumber: b.position, hardcoverSeriesId: id });
          }
        }
      }

      const releases = [...found.values()].map(({ titleKey, ...r }) => r).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return { status: 200, body: { releases, authorsChecked: authors.length } };
    },

    'POST /api/new-releases/dismiss': async (req) => {
      const user = requireUser(req);
      const id = cleanText((await readJson(req)).id, 100);
      if (!id) throw new HttpError(400, 'Which book?');
      const list = JSON.parse(getSetting(`dismissed:${user.id}`) || '[]').filter(x => x !== id);
      list.push(id);
      setSetting(`dismissed:${user.id}`, JSON.stringify(list.slice(-1000)));
      return { status: 200, body: { ok: true } };
    },

    // Family sharing
    'GET /api/me/sharing': (req) => {
      const user = requireUser(req);
      return { status: 200, body: { sharing: isSharing(user.id) } };
    },

    'PUT /api/me/sharing': async (req) => {
      const user = requireUser(req);
      const sharing = (await readJson(req)).sharing === true;
      setSetting(`share:${user.id}`, sharing ? 'true' : 'false');
      return { status: 200, body: { sharing } };
    },

    // Libraries the rest of the family shares with you (read-only, books on their shelves only).
    'GET /api/family': (req) => {
      const user = requireUser(req);
      const members = db.prepare('SELECT id, email, display_name, role, color FROM users WHERE id != ? ORDER BY created_at').all(user.id)
        .filter(u => isSharing(u.id))
        .map(u => {
          const shelf = db.prepare('SELECT id, data FROM books WHERE user_id = ?').all(u.id)
            .map(r => ({ id: r.id, ...JSON.parse(r.data) }))
            .filter(b => b.owned !== false)
            .map(b => ({
              id: b.id,
              workTitle: b.workTitle,
              author: b.author,
              series: b.series || null,
              seriesNumber: b.seriesNumber ?? null,
              workKey: b.workKey || null,
              customCoverUrl: b.customCoverUrl || null,
              isbns: (b.editions || []).map(e => e.isbn).filter(i => i && i !== 'Pending Scan'),
              language: b.editions?.[0]?.language || 'English',
              readingStatus: b.readingStatus,
              rating: b.rating || null
            }));
          const { email, ...profile } = publicUser(u);
          return { ...profile, books: shelf };
        });
      return { status: 200, body: { sharing: isSharing(user.id), members } };
    },

    // Yearly reading goal: GET ?year=2026, PUT { year, goal }
    'GET /api/me/goal': (req) => {
      const user = requireUser(req);
      const year = Number(new URL(req.url, 'http://localhost').searchParams.get('year')) || new Date().getFullYear();
      const goal = Number(getSetting(`goal:${user.id}:${year}`)) || null;
      return { status: 200, body: { year, goal } };
    },

    'PUT /api/me/goal': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      const year = Number(body.year);
      const goal = Number(body.goal);
      if (!Number.isInteger(year) || year < 1900 || year > 3000) throw new HttpError(400, 'Which year?');
      if (!goal) {
        deleteSetting(`goal:${user.id}:${year}`);
        return { status: 200, body: { year, goal: null } };
      }
      if (!Number.isInteger(goal) || goal < 1 || goal > 1000) throw new HttpError(400, 'The goal must be a number of books between 1 and 1000.');
      setSetting(`goal:${user.id}:${year}`, String(goal));
      return { status: 200, body: { year, goal } };
    }
  };

  // Look up a scanned or typed code: /api/lookup/isbn/<code>
  const lookupCode = async (req, rawCode) => {
    requireUser(req);
    const code = classifyCode(rawCode);
    if (code.kind === 'invalid') throw new HttpError(400, code.reason);
    if (code.kind === 'upc') return { status: 200, body: { kind: 'upc', code: code.code } };
    const book = await lookup.lookupIsbn(code.isbn13, code.isbn10);
    return { status: 200, body: { kind: 'isbn', isbn13: code.isbn13, isbn10: code.isbn10, found: Boolean(book), book } };
  };

  // An author's bibliography, with this person's hidden entries marked: /api/authors/<key>/works
  const authorWorks = async (req, authorKey) => {
    const user = requireUser(req);
    const result = await lookup.authorWorks(authorKey);
    if (!result) throw new HttpError(404, 'Could not load that author\'s books. Please try again in a moment.');
    const hidden = new Set(
      db.prepare('SELECT book_id FROM hidden_author_books WHERE user_id = ? AND author_key = ?').all(user.id, authorKey).map(r => r.book_id)
    );
    return { status: 200, body: { ...result, books: result.books.map(b => ({ ...b, hidden: hidden.has(b.id) })) } };
  };

  // Hide or un-hide one entry in an author's bibliography: /api/authors/<key>/hidden { bookId, hidden }
  const setAuthorBookHidden = async (req, authorKey) => {
    const user = requireUser(req);
    const body = await readJson(req);
    const bookId = cleanText(body.bookId, 100);
    if (!bookId) throw new HttpError(400, 'Which book?');
    if (body.hidden === false) {
      db.prepare('DELETE FROM hidden_author_books WHERE user_id = ? AND author_key = ? AND book_id = ?').run(user.id, authorKey, bookId);
    } else {
      db.prepare('INSERT OR IGNORE INTO hidden_author_books (user_id, author_key, book_id) VALUES (?, ?, ?)').run(user.id, authorKey, bookId);
    }
    return { status: 200, body: { ok: true } };
  };

  // Owner: set a new password for someone (signs them out everywhere).
  const resetUserPassword = async (req, userId) => {
    requireOwner(req);
    const password = String((await readJson(req)).password || '');
    if (password.length < 8) throw new HttpError(400, 'The new password must be at least 8 characters long.');
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
    if (result.changes === 0) throw new HttpError(404, 'Account not found.');
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return { status: 200, body: { ok: true } };
  };

  // Owner: remove someone's account and all their books.
  const removeUser = (req, userId) => {
    const owner = requireOwner(req);
    if (userId === owner.id) throw new HttpError(400, 'You can\'t remove your own account.');
    const files = db.prepare('SELECT data FROM books WHERE user_id = ?').all(userId).map(r => JSON.parse(r.data).coverFile).filter(Boolean);
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if (result.changes === 0) throw new HttpError(404, 'Account not found.');
    files.forEach(f => covers.remove(f));
    return { status: 200, body: { ok: true } };
  };

  // Your books as a spreadsheet (CSV), with Goodreads-style column names.
  const exportCsv = (req, res) => {
    const user = requireUser(req);
    const rows = db.prepare('SELECT data, created_at FROM books WHERE user_id = ? ORDER BY created_at').all(user.id);
    const columns = ['Title', 'Author', 'Series', 'Series #', 'Shelf', 'Owned', 'Reading Status', 'ISBN13', 'Format', 'Language',
      'Publisher', 'Year Published', 'My Rating', 'Date Read', 'Date Added', 'Notes'];
    const cell = (v) => {
      const text = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [columns.join(',')];
    for (const row of rows) {
      const b = JSON.parse(row.data);
      const e = (b.editions || [])[0] || {};
      lines.push([
        b.workTitle, b.author, b.series, b.seriesNumber, b.shelfLocation,
        b.owned === false ? 'Wishlist' : 'Owned', b.readingStatus,
        e.isbn && e.isbn !== 'Pending Scan' ? e.isbn : '', e.format, e.language, e.publisher,
        (String(e.published || '').match(/\d{4}/) || [''])[0], b.rating, b.dateFinished, row.created_at.slice(0, 10), b.notes
      ].map(cell).join(','));
    }
    const csv = '\ufeff' + lines.join('\r\n') + '\r\n'; // the mark at the start helps Excel read accents correctly
    const date = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-books-${date}.csv"`,
      'Cache-Control': 'no-store'
    });
    res.end(csv);
  };

  // Owner: download a complete copy of the database (everyone's books and accounts).
  const downloadBackup = (req, res) => {
    requireOwner(req);
    const file = backups.freshCopy();
    const date = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="personal-library-backup-${date}.db"`,
      'Content-Length': fs.statSync(file).size,
      'Cache-Control': 'no-store'
    });
    const stream = fs.createReadStream(file);
    stream.pipe(res);
    stream.on('close', () => fs.rmSync(file, { force: true }));
  };

  // All books in a series, in reading order: /api/series/<id>/books
  const seriesBooks = async (req, seriesId) => {
    requireUser(req);
    if (!getSetting('hardcover_token')) throw new HttpError(409, 'Connect Hardcover in Settings to see whole series.');
    const series = await hardcoverCall(() => hardcover.seriesBooks(seriesId));
    if (!series) throw new HttpError(404, 'Series not found on Hardcover.');
    return { status: 200, body: series };
  };

  // Routes with a book id in the address: /api/books/<id>
  const bookRoutes = {
    PUT: async (req, bookId) => {
      const user = requireUser(req);
      const existing = db.prepare('SELECT data FROM books WHERE id = ? AND user_id = ?').get(bookId, user.id);
      if (!existing) throw new HttpError(404, 'Book not found.');
      // Merge the changes into the saved book, so the browser can send only what changed.
      const changes = await readJson(req);
      delete changes.coverFile; // managed by the server
      const data = validateBook({ ...JSON.parse(existing.data), ...changes });
      // If the book no longer uses its saved cover, delete the saved file.
      if (data.coverFile && data.customCoverUrl !== `/api/covers/${data.coverFile}`) {
        covers.remove(data.coverFile);
        delete data.coverFile;
      }
      db.prepare("UPDATE books SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(JSON.stringify(data), bookId, user.id);
      return { status: 200, body: { book: bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(bookId)) } };
    },
    DELETE: (req, bookId) => {
      const user = requireUser(req);
      const existing = db.prepare('SELECT data FROM books WHERE id = ? AND user_id = ?').get(bookId, user.id);
      if (!existing) throw new HttpError(404, 'Book not found.');
      db.prepare('DELETE FROM books WHERE id = ? AND user_id = ?').run(bookId, user.id);
      covers.remove(JSON.parse(existing.data).coverFile);
      return { status: 200, body: { ok: true } };
    }
  };

  // Save a cover for a book: { url } downloads a picture from the web, { imageData } is a photo
  // taken or chosen on the phone. The picture is kept on the server from then on.
  const saveBookCover = async (req, bookId) => {
    const user = requireUser(req);
    const existing = db.prepare('SELECT data FROM books WHERE id = ? AND user_id = ?').get(bookId, user.id);
    if (!existing) throw new HttpError(404, 'Book not found.');
    const body = await readJson(req);
    let file;
    try {
      if (body.imageData) file = covers.saveFromDataUrl(body.imageData);
      else if (body.url) file = await covers.saveFromUrl(cleanText(body.url, 2000));
      else throw new HttpError(400, 'No picture was sent.');
    } catch (err) {
      if (err instanceof CoverError) throw new HttpError(400, err.message);
      throw err;
    }
    const data = JSON.parse(existing.data);
    const oldFile = data.coverFile;
    data.coverFile = file;
    data.customCoverUrl = `/api/covers/${file}`;
    if (body.url) data.coverSourceUrl = cleanText(body.url, 2000);
    else delete data.coverSourceUrl;
    db.prepare("UPDATE books SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(data), bookId, user.id);
    if (oldFile && oldFile !== file) covers.remove(oldFile);
    return { status: 200, body: { book: bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(bookId)) } };
  };

  // Send a saved cover picture, only to the person whose book it belongs to.
  const serveCover = (req, res, file) => {
    const user = requireUser(req);
    // Your own covers, and covers from family members who share their library.
    const owner = db.prepare("SELECT user_id FROM books WHERE json_extract(data, '$.coverFile') = ?").get(file);
    const allowed = owner && (owner.user_id === user.id || isSharing(owner.user_id));
    const full = allowed && covers.filePath(file);
    if (!full) throw new HttpError(404, 'Cover not found.');
    const ext = path.extname(full).slice(1);
    const stat = fs.statSync(full);
    res.writeHead(200, {
      'Content-Type': COVER_CONTENT_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'private, max-age=31536000, immutable'
    });
    fs.createReadStream(full).pipe(res);
  };

  // ---------- static files (the built React app) ----------
  const serveStatic = (req, res, pathname) => {
    const root = path.resolve(distDir);
    let filePath = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      res.writeHead(403);
      return res.end();
    }
    let stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (!stat || stat.isDirectory()) {
      // Unknown addresses get the app itself, so the React app can handle them.
      filePath = path.join(root, 'index.html');
      stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      if (!stat) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('App not built. Run "npm run build".');
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  };

  // ---------- request handler ----------
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) {
        const route = routes[`${req.method} ${pathname}`];
        const bookMatch = pathname.match(/^\/api\/books\/([A-Za-z0-9-]{1,64})$/);
        const codeMatch = pathname.match(/^\/api\/lookup\/isbn\/([0-9Xx-]{1,20})$/);
        const coverUpload = pathname.match(/^\/api\/books\/([A-Za-z0-9-]{1,64})\/cover$/);
        const seriesRoute = pathname.match(/^\/api\/series\/(\d{1,10})\/books$/);
        const authorRoute = pathname.match(/^\/api\/authors\/(OL\d+A)\/(works|hidden)$/);
        const coverFile = pathname.match(/^\/api\/covers\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif))$/);
        if (coverFile && req.method === 'GET') return serveCover(req, res, coverFile[1]);
        if (pathname === '/api/export/books.csv' && req.method === 'GET') return exportCsv(req, res);
        if (pathname === '/api/admin/backup/download' && req.method === 'GET') return downloadBackup(req, res);
        const inviteRoute = pathname.match(/^\/api\/admin\/invites\/([A-Z0-9-]{4,20})$/);
        if (inviteRoute && req.method === 'DELETE') {
          requireOwner(req);
          db.prepare('DELETE FROM invites WHERE code = ? AND used_at IS NULL').run(normalizeCode(inviteRoute[1]));
          return sendJson(res, 200, { ok: true });
        }
        const adminUser = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})(\/password)?$/);
        let result;
        if (route) result = await route(req);
        else if (coverUpload && req.method === 'POST') result = await saveBookCover(req, coverUpload[1]);
        else if (adminUser && adminUser[2] && req.method === 'POST') result = await resetUserPassword(req, adminUser[1]);
        else if (adminUser && !adminUser[2] && req.method === 'DELETE') result = removeUser(req, adminUser[1]);
        else if (seriesRoute && req.method === 'GET') result = await seriesBooks(req, seriesRoute[1]);
        else if (authorRoute && authorRoute[2] === 'works' && req.method === 'GET') result = await authorWorks(req, authorRoute[1]);
        else if (authorRoute && authorRoute[2] === 'hidden' && req.method === 'PUT') result = await setAuthorBookHidden(req, authorRoute[1]);
        else if (codeMatch && req.method === 'GET') result = await lookupCode(req, codeMatch[1]);
        else if (bookMatch && bookRoutes[req.method]) result = await bookRoutes[req.method](req, bookMatch[1]);
        else throw new HttpError(404, 'Not found.');
        return sendJson(res, result.status, result.body, result.headers);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      return serveStatic(req, res, pathname);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(`${req.method} ${pathname} failed:`, err);
      return sendJson(res, 500, { error: 'Something went wrong on the server.' });
    }
  });

  server.on('close', () => db.close());
  return server;
}
