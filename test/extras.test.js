// Checks for quotes, re-reads, collector details, due dates, preferences and family challenges.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { openDatabase } from '../server/db.js';

let server, base, dataDir, mom, kid, dad;
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text };
};

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-extras-'));
  server = createServer({ dataDir, distDir: dataDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email, displayName) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName })
  })).headers.get('set-cookie').split(';')[0];
  mom = await register('mom@example.com', 'Mom'); // Owner
  kid = await register('kid@example.com', 'Kid');
  dad = await register('dad@example.com', 'Dad');
  // Open sign-ups start as Friend; these tests are about family, so make everyone Family.
  const everyone = (await (await fetch(`${base}/api/admin/users`, { headers: { Cookie: mom } })).json()).users;
  for (const u of everyone.filter(u => u.role !== 'Owner')) {
    await fetch(`${base}/api/admin/circle`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: mom }, body: JSON.stringify({ userId: u.id, circle: 'family' }) });
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('quotes, re-reads, collector details and due dates are cleaned up', async () => {
  const r = await call('POST', '/api/books', {
    workTitle: 'Rebecca', author: 'Daphne du Maurier', editions: [],
    quotes: [{ text: '  Last night I dreamt I went to Manderley again. ', page: '1', addedOn: '2026-11-01' }, { text: '' }, { text: 'x', page: -3, addedOn: 'yesterday' }],
    reads: [{ started: '2019-01-01', finished: '2019-02-01' }, { started: 'nope' }, {}],
    collector: { signed: true, firstEdition: 'yes', condition: 'Very good', boughtFrom: ' Strand ', pricePaid: '$12', boughtOn: '2020-05-05', extra: 'dropped' },
    loans: [{ to: 'Sam', lentOn: '2026-10-01', dueOn: '2026-10-15' }]
  }, mom);
  assert.equal(r.status, 201);
  const b = r.body.book;
  assert.deepEqual(b.quotes, [
    { text: 'Last night I dreamt I went to Manderley again.', page: 1, addedOn: '2026-11-01' },
    { text: 'x', page: null, addedOn: null }
  ]);
  assert.deepEqual(b.reads, [{ started: '2019-01-01', finished: '2019-02-01' }]);
  assert.deepEqual(b.collector, { signed: true, firstEdition: false, condition: 'Very good', boughtFrom: 'Strand', pricePaid: '$12', boughtOn: '2020-05-05' });
  assert.equal(b.loans[0].dueOn, '2026-10-15');

  const bad = await call('PUT', `/api/books/${b.id}`, { collector: 'nonsense', quotes: 'nope' }, mom);
  assert.equal(bad.body.book.collector.condition, null);
  assert.deepEqual(bad.body.book.quotes, []);

  const csv = await call('GET', '/api/export/books.csv', undefined, mom);
  assert.match(csv.text, /Read Count,Signed,First Edition,Condition/);
});

test('library preference: Libby key is kept per person and tidied', async () => {
  assert.deepEqual((await call('GET', '/api/me/prefs', undefined, kid)).body.prefs, {});
  const saved = await call('PUT', '/api/me/prefs', { libbyLibrary: ' NYPL!! ' }, kid);
  assert.deepEqual(saved.body.prefs, { libbyLibrary: 'nypl' });
  assert.deepEqual((await call('GET', '/api/me/prefs', undefined, dad)).body.prefs, {});
  assert.deepEqual((await call('PUT', '/api/me/prefs', { libbyLibrary: '' }, kid)).body.prefs, {});
  assert.equal((await call('GET', '/api/me/prefs')).status, 401);
});

test('family challenges: create, join, count finished books (re-reads too), leave, delete', async () => {
  const bad = await call('POST', '/api/challenges', { name: 'x', target: 5, startsOn: '2026-07-01', endsOn: '2026-06-01' }, kid);
  assert.equal(bad.status, 400);

  const made = await call('POST', '/api/challenges', { name: 'Summer reading', target: 3, startsOn: '2026-06-01', endsOn: '2026-08-31' }, kid);
  assert.equal(made.status, 201);
  const ch = made.body.challenges[0];
  assert.equal(ch.joined, true);
  assert.equal(ch.createdBy, 'Kid');
  const id = ch.id;

  // Kid finished one book in the summer and re-read another; one finish is outside the dates.
  await call('POST', '/api/books', { workTitle: 'A', author: 'Z', editions: [], readingStatus: 'Completed', dateFinished: '2026-07-04' }, kid);
  await call('POST', '/api/books', { workTitle: 'B', author: 'Z', editions: [], readingStatus: 'Completed', dateFinished: '2026-09-10', reads: [{ started: '2026-06-02', finished: '2026-06-20' }] }, kid);
  await call('POST', '/api/books', { workTitle: 'C', author: 'Z', editions: [], readingStatus: 'Completed', dateFinished: '2026-08-01' }, dad);

  let list = (await call('GET', '/api/challenges', undefined, dad)).body.challenges;
  assert.equal(list[0].joined, false);
  assert.deepEqual(list[0].members.map(m => [m.displayName, m.finished]), [['Kid', 2]]);
  assert.equal(list[0].canDelete, false);

  list = (await call('POST', `/api/challenges/${id}/join`, undefined, dad)).body.challenges;
  assert.deepEqual(list[0].members.map(m => [m.displayName, m.finished]), [['Kid', 2], ['Dad', 1]]);
  assert.equal(list[0].members.find(m => m.displayName === 'Dad').isMe, true);

  list = (await call('POST', `/api/challenges/${id}/leave`, undefined, dad)).body.challenges;
  assert.equal(list[0].members.length, 1);

  assert.equal((await call('DELETE', `/api/challenges/${id}`, undefined, dad)).status, 403);
  assert.equal((await call('GET', '/api/challenges', undefined, mom)).body.challenges[0].canDelete, true); // the Owner can
  list = (await call('DELETE', `/api/challenges/${id}`, undefined, kid)).body.challenges;
  assert.deepEqual(list, []);
  assert.equal((await call('POST', `/api/challenges/${id}/join`, undefined, dad)).status, 404);
});

test('upgrading an older database adds the challenge tables and keeps books', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-upgrade-'));
  const db = openDatabase(dir);
  db.exec('DROP TABLE push_subscriptions; DROP TABLE trash; DROP TABLE activity; DROP TABLE recommendations; DROP TABLE club_posts; DROP TABLE club_members; DROP TABLE clubs; DROP TABLE lists; DROP TABLE reading_log; DROP TABLE reading_days; DROP TABLE gift_claims; DROP TABLE challenge_members; DROP TABLE challenges; ALTER TABLE users DROP COLUMN circle; ALTER TABLE invites DROP COLUMN circle; PRAGMA user_version = 4;');
  db.close();
  const again = openDatabase(dir);
  assert.equal(again.prepare('PRAGMA user_version').get().user_version, 9);
  assert.ok(again.prepare("SELECT name FROM sqlite_master WHERE name = 'challenges'").get());
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('menu preference: hidden menu items are kept per person and tidied', async () => {
  const saved = await call('PUT', '/api/me/prefs', { hiddenMenu: ['clubs', 'gifts', 'clubs', 'BAD KEY!', 42] }, dad);
  assert.deepEqual(saved.body.prefs.hiddenMenu, ['clubs', 'gifts', '42'].filter(k => /^[a-z]{2,20}$/.test(k)));
  assert.deepEqual((await call('GET', '/api/me/prefs', undefined, dad)).body.prefs.hiddenMenu, ['clubs', 'gifts']);
  assert.equal((await call('GET', '/api/me/prefs', undefined, kid)).body.prefs.hiddenMenu, undefined);
});

test('reading format and audiobook time are cleaned up', async () => {
  const r = await call('POST', '/api/books', { workTitle: 'Audio', author: 'A', editions: [], readFormat: 'audio', audioMinutes: '95.4', audioLength: -3 }, dad);
  assert.equal(r.body.book.readFormat, 'audio');
  assert.equal(r.body.book.audioMinutes, 95);
  assert.equal(r.body.book.audioLength, null);
  const u = await call('PUT', `/api/books/${r.body.book.id}`, { readFormat: 'vinyl' }, dad);
  assert.equal(u.body.book.readFormat, null);
});
