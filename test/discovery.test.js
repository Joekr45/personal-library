// Checks for bulk import and "New for you".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

const iso = (monthsAgo) => { const d = new Date(); d.setMonth(d.getMonth() - monthsAgo); return d.toISOString().slice(0, 10); };
const json = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
const googleCalls = [];
const fakeFetch = async (url) => {
  if (url.includes('googleapis.com')) {
    const q = new URL(url).searchParams.get('q');
    googleCalls.push(q);
    if (q === 'inauthor:"Ken Follett"') return json({ items: [
      { id: 'new', volumeInfo: { title: 'Circle of Days', authors: ['Ken Follett'], publishedDate: iso(1), language: 'en', imageLinks: { thumbnail: 'http://books.google.com/x?id=new' } } },
      { id: 'soon', volumeInfo: { title: 'Future Book', authors: ['Ken Follett'], publishedDate: iso(-4), language: 'en' } },
      { id: 'old', volumeInfo: { title: 'Never', authors: ['Ken Follett'], publishedDate: iso(30), language: 'en' } },
      { id: 'owned', volumeInfo: { title: 'The Armour of Light', authors: ['Ken Follett'], publishedDate: iso(2), language: 'en' } },
      { id: 'es', volumeInfo: { title: 'El círculo de los días', authors: ['Ken Follett'], publishedDate: iso(1), language: 'es' } },
      { id: 'other', volumeInfo: { title: 'Gardening', authors: ['Ken Smith'], publishedDate: iso(1), language: 'en' } }
    ] });
    return json({ items: [] });
  }
  return json({});
};

let server, base, dataDir, cookie;
const call = (method, url, body) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-disc-'));
  server = createServer({ dataDir, distDir: dataDir, fetchImpl: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  cookie = (await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'r@example.com', password: 'longpassword' }) })).headers.get('set-cookie').split(';')[0];
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('bulk add: adds valid books, skips invalid ones, all-or-nothing on errors', async () => {
  const res = await (await call('POST', '/api/books/bulk', { books: [
    { workTitle: 'The Armour of Light', author: 'Ken Follett', rating: 5, editions: [] },
    { workTitle: 'Fall of Giants', author: 'Ken Follett', editions: [] },
    { workTitle: '', author: 'Nobody' }
  ] })).json();
  assert.equal(res.added, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.books[0].rating, 5);
  assert.ok(res.books[0].addedAt);
  assert.equal((await (await call('GET', '/api/books')).json()).books.length, 2);
  assert.equal((await call('POST', '/api/books/bulk', { books: [] })).status, 400);
});

test('New for you: recent & upcoming English books by your authors, not ones you have', async () => {
  const res = await (await call('GET', '/api/new-releases')).json();
  assert.equal(res.authorsChecked, 1);
  assert.deepEqual(res.releases.map(r => r.title), ['Future Book', 'Circle of Days']);
  assert.equal(res.releases[1].reason, 'New from Ken Follett');
  assert.ok(res.releases[1].cover.startsWith('https://'));
});

test('dismissing hides a release for good', async () => {
  assert.equal((await call('POST', '/api/new-releases/dismiss', { id: 'g-soon' })).status, 200);
  const res = await (await call('GET', '/api/new-releases')).json();
  assert.deepEqual(res.releases.map(r => r.title), ['Circle of Days']);
  assert.equal(googleCalls.length, 1, 'author lookups are cached');
});
