// Asking to borrow each other's books.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

let server, base, dataDir, owner, mom, pal, momBook, palBook;
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const register = async (email, displayName, inviteCode) => {
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName, inviteCode }) });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
};

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-borrow-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'invite' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await register('me@example.com', 'Yoel');
  const fam = (await call('POST', '/api/admin/invites', { note: 'Mom', days: 7, circle: 'family' }, owner)).body;
  const fr = (await call('POST', '/api/admin/invites', { note: 'Pal', days: 7, circle: 'friend' }, owner)).body;
  mom = await register('mom@example.com', 'Mom', fam.code);
  pal = await register('pal@example.com', 'Pal', fr.code);
  momBook = (await call('POST', '/api/books', { workTitle: 'Emma', author: 'Jane Austen', editions: [] }, mom)).body.book;
  palBook = (await call('POST', '/api/books', { workTitle: 'Dune', author: 'Frank Herbert', editions: [] }, pal)).body.book;
  await call('POST', '/api/books', { workTitle: 'Secret wish', author: 'X', owned: false, editions: [] }, mom);
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('you only see libraries that are shared with you', async () => {
  assert.deepEqual((await call('GET', '/api/libraries', undefined, owner)).body.people, []);
  await call('PUT', '/api/me/sharing', { sharing: true }, mom);
  const mine = (await call('GET', '/api/libraries', undefined, owner)).body.people;
  assert.deepEqual(mine.map(p => p.displayName), ['Mom']);
  assert.deepEqual(mine[0].books.map(b => b.workTitle), ['Emma'], 'wishlist stays private');
  assert.deepEqual((await call('GET', '/api/libraries', undefined, pal)).body.people, [], 'a friend does not see family-only sharing');
  assert.equal((await call('POST', '/api/borrow', { ownerId: mine[0].id, bookId: momBook.id }, pal)).status, 404);
  await call('PUT', '/api/me/share-with-friends', { on: true }, pal);
  assert.deepEqual((await call('GET', '/api/libraries', undefined, owner)).body.people.map(p => p.displayName).sort(), ['Mom', 'Pal']);
});

test('ask, say yes, it shows as lent, then comes back', async () => {
  const momId = (await call('GET', '/api/libraries', undefined, owner)).body.people.find(p => p.displayName === 'Mom').id;
  const asked = await call('POST', '/api/borrow', { ownerId: momId, bookId: momBook.id, message: 'Can I read it on vacation?' }, owner);
  assert.equal(asked.status, 201);
  assert.equal((await call('POST', '/api/borrow', { ownerId: momId, bookId: momBook.id }, owner)).status, 409, 'no double asking');
  const lib = (await call('GET', '/api/libraries', undefined, owner)).body.people.find(p => p.displayName === 'Mom');
  assert.equal(lib.books[0].myRequest, 'pending');
  const inbox = (await call('GET', '/api/borrow', undefined, mom)).body;
  assert.equal(inbox.waiting, 1);
  assert.equal(inbox.incoming[0].message, 'Can I read it on vacation?');
  const id = inbox.incoming[0].id;
  assert.equal((await call('POST', `/api/borrow/${id}/accept`, {}, owner)).status, 403, 'only the owner answers');
  const yes = await call('POST', `/api/borrow/${id}/accept`, { dueOn: '2026-12-31', reply: 'Enjoy!' }, mom);
  assert.equal(yes.status, 200);
  const book = (await call('GET', '/api/books', undefined, mom)).body.books.find(b => b.id === momBook.id);
  assert.deepEqual(book.loans.map(l => [l.to, l.dueOn, l.returnedOn]), [['Yoel', '2026-12-31', null]]);
  const out = (await call('GET', '/api/borrow', undefined, owner)).body.outgoing[0];
  assert.equal(out.status, 'lent');
  assert.equal(out.reply, 'Enjoy!');
  assert.equal((await call('POST', `/api/borrow/${id}/returned`, {}, mom)).status, 200);
  const after = (await call('GET', '/api/books', undefined, mom)).body.books.find(b => b.id === momBook.id);
  assert.ok(after.loans[0].returnedOn);
  assert.equal((await call('GET', '/api/borrow', undefined, owner)).body.outgoing[0].status, 'returned');
});

test('"It\'s back" on the book itself also finishes the request; decline and cancel work', async () => {
  const palId = (await call('GET', '/api/libraries', undefined, mom)).body.people.find(p => p.displayName === 'Pal').id;
  const r1 = (await call('POST', '/api/borrow', { ownerId: palId, bookId: palBook.id }, mom)).body.request;
  await call('POST', `/api/borrow/${r1.id}/accept`, {}, pal);
  const b = (await call('GET', '/api/books', undefined, pal)).body.books.find(x => x.id === palBook.id);
  await call('PUT', `/api/books/${palBook.id}`, { ...b, loans: b.loans.map(l => ({ ...l, returnedOn: '2026-11-20' })) }, pal);
  assert.equal((await call('GET', '/api/borrow', undefined, mom)).body.outgoing.find(r => r.id === r1.id).status, 'returned');

  const r2 = (await call('POST', '/api/borrow', { ownerId: palId, bookId: palBook.id }, owner)).body.request;
  await call('POST', `/api/borrow/${r2.id}/decline`, { reply: 'Sorry, reading it again' }, pal);
  const d = (await call('GET', '/api/borrow', undefined, owner)).body.outgoing.find(r => r.id === r2.id);
  assert.deepEqual([d.status, d.reply], ['declined', 'Sorry, reading it again']);

  const r3 = (await call('POST', '/api/borrow', { ownerId: palId, bookId: palBook.id }, owner)).body.request;
  assert.equal((await call('POST', `/api/borrow/${r3.id}/cancel`, {}, pal)).status, 403);
  assert.equal((await call('POST', `/api/borrow/${r3.id}/cancel`, {}, owner)).status, 200);
  assert.equal((await call('GET', '/api/borrow', undefined, pal)).body.waiting, 0);
});
