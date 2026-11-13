// Several copies of the same book (e.g. each new cover edition), each with its own cover.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

const JPEG = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, n)]);
const dataUrl = (n) => `data:image/jpeg;base64,${JPEG(n).toString('base64')}`;
let server, base, dataDir, rivka, other;
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const coverFiles = () => fs.readdirSync(path.join(dataDir, 'covers'));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-copies-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'open' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName: email.split('@')[0] })
  })).headers.get('set-cookie').split(';')[0];
  rivka = await register('rivka@example.com');
  other = await register('other@example.com');
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('each copy can have its own saved cover; only the owner can see them', async () => {
  const book = (await call('POST', '/api/books', { workTitle: 'Pride and Prejudice', author: 'Jane Austen', editions: [{ id: 'c1', isbn: '9780141439518' }] }, rivka)).body.book;
  const withCopy = (await call('PUT', `/api/books/${book.id}`, { editions: [...book.editions, { id: 'c2', isbn: '9780141199078', note: '  2023 Penguin Clothbound  ' }] }, rivka)).body.book;
  assert.equal(withCopy.editions.length, 2);
  assert.equal(withCopy.editions[1].note, '2023 Penguin Clothbound');

  const main = (await call('POST', `/api/books/${book.id}/cover`, { imageData: dataUrl(1) }, rivka)).body.book;
  const second = (await call('POST', `/api/books/${book.id}/cover`, { imageData: dataUrl(2), editionId: 'c2' }, rivka)).body.book;
  assert.equal(second.customCoverUrl, main.customCoverUrl, 'main cover unchanged');
  assert.match(second.editions[1].coverUrl, /^\/api\/covers\/[0-9a-f-]{36}\.jpg$/);
  assert.equal((await call('POST', `/api/books/${book.id}/cover`, { imageData: dataUrl(3), editionId: 'nope' }, rivka)).status, 404);
  assert.equal(coverFiles().length, 2, 'the picture for a missing copy is not kept');

  assert.equal((await fetch(base + second.editions[1].coverUrl, { headers: { Cookie: rivka } })).status, 200);
  assert.equal((await fetch(base + second.editions[1].coverUrl, { headers: { Cookie: other } })).status, 404);
});

test("a book can't borrow someone else's saved cover", async () => {
  const mine = (await call('GET', '/api/books', undefined, rivka)).body.books[0];
  const theirs = (await call('POST', '/api/books', {
    workTitle: 'Sneaky', author: 'X', customCoverUrl: mine.customCoverUrl,
    editions: [{ id: 'x1', coverFile: mine.coverFile, coverUrl: mine.editions[1].coverUrl }]
  }, other)).body.book;
  assert.equal(theirs.customCoverUrl, null);
  assert.equal(theirs.editions[0].coverFile, undefined);
  assert.equal(theirs.editions[0].coverUrl, null);
  const sneak = (await call('PUT', `/api/books/${theirs.id}`, { editions: [{ id: 'x1', coverFile: mine.coverFile, coverUrl: mine.editions[1].coverUrl }] }, other)).body.book;
  assert.equal(sneak.editions[0].coverUrl, null);
  assert.equal((await fetch(base + mine.editions[1].coverUrl, { headers: { Cookie: other } })).status, 404);
});

test("using a copy's cover as the main cover, and removing a copy, tidy up the pictures", async () => {
  const book = (await call('GET', '/api/books', undefined, rivka)).body.books[0];
  const copyCover = book.editions[1].coverUrl;
  // Use copy 2's cover as the main cover: the old main picture is no longer used and is deleted.
  const switched = (await call('PUT', `/api/books/${book.id}`, { customCoverUrl: copyCover }, rivka)).body.book;
  assert.equal(switched.customCoverUrl, copyCover);
  assert.equal(coverFiles().length, 1);
  assert.equal((await fetch(base + copyCover, { headers: { Cookie: rivka } })).status, 200);
  // Remove copy 2: its picture stays, because it's still the main cover.
  const removed = (await call('PUT', `/api/books/${book.id}`, { editions: [switched.editions[0]] }, rivka)).body.book;
  assert.equal(removed.editions.length, 1);
  assert.equal(coverFiles().length, 1);
  // Switch the main cover to a web picture: now nothing uses the file, so it goes.
  await call('PUT', `/api/books/${book.id}`, { customCoverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg' }, rivka);
  assert.equal(coverFiles().length, 0);
});
