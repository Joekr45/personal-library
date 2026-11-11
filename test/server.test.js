// Automated checks for the server. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

let server;
let baseUrl;
let dataDir;
let distDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-data-'));
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html>app</html>');
  server = createServer({ dataDir, distDir, allowRegistration: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(distDir, { recursive: true, force: true });
});

// A tiny "browser" that remembers its login cookie.
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(baseUrl + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  };
}

const book = (title, extra = {}) => ({
  workTitle: title,
  author: 'Ken Follett',
  readingStatus: 'Unread',
  editions: [{ isbn: '0451124383', format: 'Paperback', language: 'English' }],
  ...extra
});

test('first account becomes Owner, later ones are Members', async () => {
  const alice = client();
  const r1 = await alice('POST', '/api/auth/register', { email: 'Alice@Example.com', password: 'correct horse', displayName: 'Alice' });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.user.role, 'Owner');
  assert.equal(r1.body.user.email, 'alice@example.com');
  assert.equal(r1.body.user.password, undefined);
  assert.equal(r1.body.user.password_hash, undefined);
  assert.match(r1.headers.get('set-cookie'), /HttpOnly/);

  const bob = client();
  const r2 = await bob('POST', '/api/auth/register', { email: 'bob@example.com', password: 'another pass' });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.user.role, 'Member');
  assert.equal(r2.body.user.displayName, 'bob');
});

test('cannot register an email twice (no account takeover)', async () => {
  const mallory = client();
  const r = await mallory('POST', '/api/auth/register', { email: 'alice@example.com', password: 'hijacked!!' });
  assert.equal(r.status, 409);
  const login = await client()('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse' });
  assert.equal(login.status, 200);
});

test('rejects short passwords and bad emails', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { email: 'x@y.com', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'not-an-email', password: 'long enough' })).status, 400);
});

test('wrong password is rejected; passwords are stored hashed', async () => {
  const r = await client()('POST', '/api/auth/login', { email: 'alice@example.com', password: 'wrong password' });
  assert.equal(r.status, 401);
  const raw = fs.readFileSync(path.join(dataDir, 'library.db'));
  assert.equal(raw.includes(Buffer.from('correct horse')), false);
});

test('book endpoints require login', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/books')).status, 401);
  assert.equal((await anon('POST', '/api/books', book('X'))).status, 401);
});

test("each user only sees and changes their own books", async () => {
  const alice = client();
  await alice('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse' });
  const bob = client();
  await bob('POST', '/api/auth/login', { email: 'bob@example.com', password: 'another pass' });

  const a1 = await alice('POST', '/api/books', book('The Man from St. Petersburg', { id: 'evil', userId: 'someone' }));
  assert.equal(a1.status, 201);
  assert.notEqual(a1.body.book.id, 'evil');
  const b1 = await bob('POST', '/api/books', book('Eye of the Needle'));
  assert.equal(b1.status, 201);

  const aliceBooks = (await alice('GET', '/api/books')).body.books;
  const bobBooks = (await bob('GET', '/api/books')).body.books;
  assert.deepEqual(aliceBooks.map(b => b.workTitle), ['The Man from St. Petersburg']);
  assert.deepEqual(bobBooks.map(b => b.workTitle), ['Eye of the Needle']);

  // Bob cannot edit or delete Alice's book
  assert.equal((await bob('PUT', `/api/books/${a1.body.book.id}`, { workTitle: 'Hacked' })).status, 404);
  assert.equal((await bob('DELETE', `/api/books/${a1.body.book.id}`)).status, 404);
  assert.equal((await alice('GET', '/api/books')).body.books[0].workTitle, 'The Man from St. Petersburg');
});

test('updating a book merges changes; deleting removes it', async () => {
  const alice = client();
  await alice('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse' });
  const created = (await alice('POST', '/api/books', book('Fall of Giants'))).body.book;

  const updated = await alice('PUT', `/api/books/${created.id}`, { readingStatus: 'Reading', series: 'Century Trilogy', seriesNumber: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.book.readingStatus, 'Reading');
  assert.equal(updated.body.book.workTitle, 'Fall of Giants');
  assert.equal(updated.body.book.editions.length, 1);

  assert.equal((await alice('PUT', `/api/books/${created.id}`, { workTitle: '   ' })).status, 400);

  assert.equal((await alice('DELETE', `/api/books/${created.id}`)).status, 200);
  const titles = (await alice('GET', '/api/books')).body.books.map(b => b.workTitle);
  assert.equal(titles.includes('Fall of Giants'), false);
});

test('two people can be signed in at once, and logout only ends one session', async () => {
  const phone = client();
  const laptop = client();
  await phone('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse' });
  await laptop('POST', '/api/auth/login', { email: 'alice@example.com', password: 'correct horse' });
  assert.equal((await phone('POST', '/api/auth/logout')).status, 200);
  assert.equal((await phone('GET', '/api/books')).status, 401);
  assert.equal((await laptop('GET', '/api/books')).status, 200);
  const me = await laptop('GET', '/api/auth/me');
  assert.equal(me.body.user.email, 'alice@example.com');
});

test('data survives a server restart', async () => {
  const second = createServer({ dataDir, distDir });
  await new Promise((resolve) => second.listen(0, '127.0.0.1', resolve));
  const res = await fetch(`http://127.0.0.1:${second.address().port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com', password: 'another pass' })
  });
  assert.equal(res.status, 200);
  second.closeAllConnections();
  await new Promise((resolve) => second.close(resolve));
});

test('serves the app, falls back to index.html, blocks path tricks', async () => {
  const c = client();
  const home = await c('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /app/);
  assert.equal((await c('GET', '/some/page')).status, 200);
  const sneaky = await fetch(baseUrl + '/..%2f..%2fetc%2fpasswd');
  assert.notEqual(await sneaky.text(), fs.existsSync('/etc/passwd') ? fs.readFileSync('/etc/passwd', 'utf8') : 'x');
  assert.equal((await c('GET', '/api/nope')).status, 404);
});

test('blocks repeated password guessing', async () => {
  const guesser = client();
  let last;
  for (let i = 0; i < 11; i++) {
    last = await guesser('POST', '/api/auth/login', { email: 'bob@example.com', password: `guess-${i}` });
  }
  assert.equal(last.status, 429);
});
