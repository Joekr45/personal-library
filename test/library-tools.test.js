// Checks for the trash bin, merging duplicates, changing many books at once, and restoring backups.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { mergeBooks } from '../server/library-tools.js';

let server, base, dataDir, owner, member;
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const add = async (cookie, b) => (await call('POST', '/api/books', { editions: [], author: 'A', ...b }, cookie)).body.book;
const titles = async (cookie) => (await call('GET', '/api/books', undefined, cookie)).body.books.map(b => b.workTitle).sort();

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-tools-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'open' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName: email.split('@')[0] })
  })).headers.get('set-cookie').split(';')[0];
  owner = await register('owner@example.com');
  member = await register('member@example.com');
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('deleted books go to the trash and can be put back or deleted for good', async () => {
  const b = await add(owner, { workTitle: 'Trash Me', notes: 'keep these notes' });
  assert.equal((await call('DELETE', `/api/books/${b.id}`, undefined, owner)).body.trashed, true);
  assert.ok(!(await titles(owner)).includes('Trash Me'));
  const trash = (await call('GET', '/api/trash', undefined, owner)).body;
  assert.equal(trash.keepDays, 30);
  assert.equal(trash.books[0].workTitle, 'Trash Me');
  assert.ok(trash.books[0].deletedAt);
  assert.deepEqual((await call('GET', '/api/trash', undefined, member)).body.books, [], "others don't see your trash");
  assert.deepEqual((await call('POST', '/api/trash/restore', { ids: [b.id] }, member)).body.books, [], "and can't restore it");
  const back = (await call('POST', '/api/trash/restore', { ids: [b.id] }, owner)).body.books;
  assert.equal(back[0].notes, 'keep these notes');
  assert.equal(back[0].id, b.id, 'same book, same id');
  await call('DELETE', `/api/books/${b.id}`, undefined, owner);
  assert.equal((await call('POST', '/api/trash/empty', { all: true }, owner)).body.deleted, 1);
  assert.deepEqual((await call('GET', '/api/trash', undefined, owner)).body.books, []);
});

test('merging duplicates keeps everything from both copies, and can be undone', async () => {
  const a = await add(owner, { workTitle: 'Dune', author: 'Frank Herbert', readingStatus: 'Unread', tags: ['Sci-fi'], editions: [{ isbn: '9780441013593', language: 'English' }] });
  const b = await add(owner, {
    workTitle: 'Dune', author: 'Frank Herbert', readingStatus: 'Completed', rating: 5, dateFinished: '2025-03-01', notes: 'Loved it',
    tags: ['sci-fi', 'Favourites'], quotes: [{ text: 'Fear is the mind-killer.', page: 8 }], editions: [{ isbn: '9780441013593' }, { isbn: '9788497596824', language: 'Spanish' }]
  });
  assert.equal((await call('POST', '/api/books/merge', { keepId: a.id, mergeIds: [] }, owner)).status, 400);
  assert.equal((await call('POST', '/api/books/merge', { keepId: a.id, mergeIds: [b.id] }, member)).status, 404);
  const res = (await call('POST', '/api/books/merge', { keepId: a.id, mergeIds: [b.id] }, owner)).body;
  const m = res.book;
  assert.equal(m.id, a.id);
  assert.equal(m.readingStatus, 'Completed');
  assert.equal(m.rating, 5);
  assert.equal(m.notes, 'Loved it');
  assert.deepEqual(m.tags, ['Sci-fi', 'Favourites']);
  assert.equal(m.quotes.length, 1);
  assert.deepEqual(m.editions.map(e => e.isbn), ['9780441013593', '9788497596824']);
  assert.deepEqual(res.trashed, [b.id]);
  assert.deepEqual((await titles(owner)).filter(t => t === 'Dune'), ['Dune']);
  // The other copy is in the trash, so it can be brought back.
  await call('POST', '/api/trash/restore', { ids: [b.id] }, owner);
  assert.deepEqual((await titles(owner)).filter(t => t === 'Dune'), ['Dune', 'Dune']);
});

test('mergeBooks: wishlist + owned copy becomes owned; dates span both reads', () => {
  const m = mergeBooks({ workTitle: 'X', owned: false, dateStarted: '2024-05-01' }, [{ workTitle: 'X', owned: true, dateStarted: '2024-01-01', dateFinished: '2024-02-01', series: 'S' }]);
  assert.equal(m.owned, true);
  assert.equal(m.dateStarted, '2024-01-01');
  assert.equal(m.dateFinished, '2024-02-01');
  assert.equal(m.series, 'S');
});

test('changing many books at once: status (with dates), shelves, wishlist, trash', async () => {
  const one = await add(member, { workTitle: 'One', readingStatus: 'Unread' });
  const two = await add(member, { workTitle: 'Two', readingStatus: 'Reading', dateStarted: '2026-01-01', tags: ['Old'] });
  const res = (await call('POST', '/api/books/batch', { ids: [one.id, two.id], status: 'Completed', addTags: ['Beach reads'], removeTags: ['old'] }, member)).body.books;
  assert.deepEqual(res.map(b => b.readingStatus), ['Completed', 'Completed']);
  assert.ok(res.every(b => b.dateFinished));
  assert.equal(res.find(b => b.workTitle === 'Two').dateStarted, '2026-01-01');
  assert.deepEqual(res.map(b => b.tags), [['Beach reads'], ['Beach reads']]);
  const wish = (await call('POST', '/api/books/batch', { ids: [one.id], owned: false, shelfLocation: 'Attic' }, member)).body.books[0];
  assert.equal(wish.owned, false);
  assert.equal(wish.shelfLocation, 'Attic');
  assert.equal((await call('POST', '/api/books/batch', { ids: [one.id, two.id], status: 'Completed' }, owner)).body.books.length, 0, "can't change others' books");
  assert.equal((await call('POST', '/api/books/batch', { ids: [one.id, two.id], trash: true }, member)).body.trashed, 2);
  assert.deepEqual(await titles(member), []);
  assert.equal((await call('POST', '/api/books/batch', { ids: [] }, member)).status, 400);
});

test('restoring a backup brings the library back to that day, after a safety copy', async () => {
  const keep = await add(owner, { workTitle: 'Before Backup' });
  assert.equal((await call('POST', '/api/admin/backups', undefined, owner)).status, 200);
  const backup = (await call('GET', '/api/admin/backups', undefined, owner)).body.backups.find(b => !b.beforeRestore);
  await add(owner, { workTitle: 'After Backup' });
  await call('DELETE', `/api/books/${keep.id}`, undefined, owner);
  await call('POST', '/api/trash/empty', { all: true }, owner);

  assert.equal((await call('POST', '/api/admin/backups/restore', { file: backup.file }, member)).status, 403, 'Owner only');
  assert.equal((await call('POST', '/api/admin/backups/restore', { file: '../../etc/passwd' }, owner)).status, 404);
  const res = (await call('POST', '/api/admin/backups/restore', { file: backup.file }, owner)).body;
  assert.equal(res.ok, true);
  const now = await titles(owner);
  assert.ok(now.includes('Before Backup'));
  assert.ok(!now.includes('After Backup'));
  assert.equal((await call('GET', '/api/auth/me', undefined, member)).status, 200, 'still signed in');

  // Undo the restore with the safety copy made just before it.
  const safety = res.backups.find(b => b.beforeRestore);
  assert.ok(safety);
  await call('POST', '/api/admin/backups/restore', { file: safety.file }, owner);
  const undone = await titles(owner);
  assert.ok(undone.includes('After Backup'));
  assert.ok(!undone.includes('Before Backup'));
});

test('merging never drops copies already in a book, and can keep identical copies from other books', () => {
  const keep = { workTitle: 'P', editions: [{ id: 'a', isbn: '9780141439518' }, { id: 'b', isbn: '9780141439518', note: 'second identical copy' }] };
  const other = { workTitle: 'P', editions: [{ id: 'a', isbn: '9780141439518' }, { id: 'c', isbn: '9780141199078' }] };
  const usual = mergeBooks(keep, [other]);
  assert.deepEqual(usual.editions.map(e => e.id), ['a', 'b', 'c']);
  const all = mergeBooks(keep, [other], { keepAllCopies: true });
  assert.equal(all.editions.length, 4);
  assert.equal(new Set(all.editions.map(e => e.id)).size, 4, 'clashing ids are made unique');
});
