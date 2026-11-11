// The web server: a small JSON API plus serving the built React app.
// Built on Node's own http module, so the server has no third-party dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDatabase } from './db.js';
import { createLookup } from './lookup.js';
import { createCoverStore, CoverError, COVER_CONTENT_TYPES } from './covers.js';
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
  '.txt': 'text/plain; charset=utf-8'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createServer({ dataDir, distDir, allowRegistration = true, fetchImpl, googleApiKey, resolveHost }) {
  const db = openDatabase(dataDir);
  const lookup = createLookup({ fetchImpl, googleApiKey });
  const covers = createCoverStore({ dataDir, fetchImpl, resolveHost });
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
    const { id, userId, user_id, ...data } = input; // the server decides ids and owners
    data.workTitle = cleanText(data.workTitle);
    data.author = cleanText(data.author);
    if (!data.workTitle) throw new HttpError(400, 'A book needs a title.');
    if (!data.author) throw new HttpError(400, 'A book needs an author.');
    if (!Array.isArray(data.editions)) data.editions = [];
    data.owned = data.owned !== false;
    return data;
  };

  const bookFromRow = (row) => ({ ...JSON.parse(row.data), id: row.id });

  // ---------- API routes ----------
  const routes = {
    'GET /api/health': () => ({ status: 200, body: { ok: true } }),

    'GET /api/auth/me': (req) => {
      const user = userForSession(db, getCookie(req, SESSION_COOKIE));
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
      return { status: 200, body: { user, hasUsers: count > 0, allowRegistration } };
    },

    'POST /api/auth/register': async (req) => {
      const body = await readJson(req);
      const email = cleanText(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const displayName = cleanText(body.displayName, 60) || email.split('@')[0];

      const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
      // The very first account can always be created; after that it depends on the setting.
      if (count > 0 && !allowRegistration) throw new HttpError(403, 'New sign-ups are turned off.');
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
      db.prepare('INSERT INTO users (id, email, password_hash, display_name, role, color) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.email, hashPassword(password), user.display_name, user.role, user.color);

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

    'GET /api/books': (req) => {
      const user = requireUser(req);
      const rows = db.prepare('SELECT id, data FROM books WHERE user_id = ? ORDER BY created_at DESC, rowid DESC').all(user.id);
      return { status: 200, body: { books: rows.map(bookFromRow) } };
    },

    'POST /api/books': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      delete body.coverFile; // managed by the server
      const data = validateBook(body);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO books (id, user_id, data) VALUES (?, ?, ?)').run(id, user.id, JSON.stringify(data));
      return { status: 201, body: { book: { ...data, id } } };
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
      return { status: 200, body: { book: { ...data, id: bookId } } };
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
    return { status: 200, body: { book: { ...data, id: bookId } } };
  };

  // Send a saved cover picture, only to the person whose book it belongs to.
  const serveCover = (req, res, file) => {
    const user = requireUser(req);
    const owns = db.prepare("SELECT 1 FROM books WHERE user_id = ? AND json_extract(data, '$.coverFile') = ?").get(user.id, file);
    const full = owns && covers.filePath(file);
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
        const coverFile = pathname.match(/^\/api\/covers\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif))$/);
        if (coverFile && req.method === 'GET') return serveCover(req, res, coverFile[1]);
        let result;
        if (route) result = await route(req);
        else if (coverUpload && req.method === 'POST') result = await saveBookCover(req, coverUpload[1]);
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
