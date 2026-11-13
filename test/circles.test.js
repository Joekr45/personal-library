// Family vs Friend accounts: only Family use shared shelves and challenges.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { openDatabase } from '../server/db.js';

let server, base, dataDir, owner, mom, pal, ids = {};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const register = async (email, displayName, inviteCode) => {
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName, inviteCode }) });
  assert.equal(res.status, 201, `register ${email}`);
  return res.headers.get('set-cookie').split(';')[0];
};

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-circles-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'invite' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await register('me@example.com', 'Yoel');
  const famInvite = (await call('POST', '/api/admin/invites', { note: 'Mom', days: 7, circle: 'family' }, owner)).body;
  const palInvite = (await call('POST', '/api/admin/invites', { note: 'Pal', days: 7, circle: 'friend' }, owner)).body;
  assert.equal(famInvite.circle, 'family');
  assert.equal(palInvite.circle, 'friend');
  mom = await register('mom@example.com', 'Mom', famInvite.code);
  pal = await register('pal@example.com', 'Pal', palInvite.code);
  for (const [who, cookie] of [['owner', owner], ['mom', mom], ['pal', pal]]) {
    const b = (await call('POST', '/api/books', { workTitle: `${who} book`, author: 'A', editions: [], readingStatus: 'Completed', dateFinished: '2026-05-05' }, cookie)).body.book;
    ids[who] = b.id;
  }
  await call('POST', `/api/books/${ids.owner}/cover`, { imageData: `data:image/jpeg;base64,${JPEG.toString('base64')}` }, owner);
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('accounts know whether they are Family or Friend; invites decide it', async () => {
  assert.equal((await call('GET', '/api/auth/me', undefined, owner)).body.user.circle, 'family');
  assert.equal((await call('GET', '/api/auth/me', undefined, mom)).body.user.circle, 'family');
  assert.equal((await call('GET', '/api/auth/me', undefined, pal)).body.user.circle, 'friend');
  const invites = (await call('GET', '/api/admin/invites', undefined, owner)).body.invites;
  assert.deepEqual(invites.map(i => i.circle).sort(), ['family', 'friend']);
  const users = (await call('GET', '/api/admin/users', undefined, owner)).body.users;
  assert.deepEqual(users.map(u => [u.displayName, u.circle]), [['Yoel', 'family'], ['Mom', 'family'], ['Pal', 'friend']]);
});

test('friends cannot use family shelves or challenges, and are never shown to family', async () => {
  for (const c of [owner, mom]) assert.equal((await call('PUT', '/api/me/sharing', { sharing: true }, c)).status, 200);
  assert.equal((await call('PUT', '/api/me/sharing', { sharing: true }, pal)).status, 403);
  assert.equal((await call('GET', '/api/family', undefined, pal)).status, 403);
  assert.equal((await call('GET', '/api/challenges', undefined, pal)).status, 403);
  assert.equal((await call('POST', '/api/challenges', { name: 'x', target: 1, startsOn: '2026-01-01', endsOn: '2026-12-31' }, pal)).status, 403);
  const fam = (await call('GET', '/api/family', undefined, mom)).body;
  assert.deepEqual(fam.members.map(m => m.displayName), ['Yoel']);
  // Shared covers: family yes, friends no.
  const cover = (await call('GET', '/api/books', undefined, owner)).body.books.find(b => b.id === ids.owner).customCoverUrl;
  assert.equal((await fetch(base + cover, { headers: { Cookie: mom } })).status, 200);
  assert.equal((await fetch(base + cover, { headers: { Cookie: pal } })).status, 404);
});

test('the Owner can move someone between Family and Friend', async () => {
  const users = (await call('GET', '/api/admin/users', undefined, owner)).body.users;
  const momId = users.find(u => u.displayName === 'Mom').id;
  const palId = users.find(u => u.displayName === 'Pal').id;
  const ownerId = users.find(u => u.displayName === 'Yoel').id;
  assert.equal((await call('PUT', '/api/admin/circle', { userId: palId, circle: 'family' }, mom)).status, 403, 'only the Owner');
  assert.equal((await call('PUT', '/api/admin/circle', { userId: ownerId, circle: 'friend' }, owner)).status, 400, 'Owner stays family');
  assert.equal((await call('PUT', '/api/admin/circle', { userId: palId, circle: 'cousin' }, owner)).status, 400);

  // Mom joins a challenge, then is moved to Friend: she drops out of everything family.
  const list = (await call('POST', '/api/challenges', { name: 'Year', target: 5, startsOn: '2026-01-01', endsOn: '2026-12-31' }, mom)).body.challenges;
  assert.equal(list[0].members.length, 1);
  assert.equal((await call('PUT', '/api/admin/circle', { userId: momId, circle: 'friend' }, owner)).status, 200);
  assert.equal((await call('GET', '/api/challenges', undefined, mom)).status, 403);
  assert.deepEqual((await call('GET', '/api/challenges', undefined, owner)).body.challenges[0].members, []);
  assert.deepEqual((await call('GET', '/api/family', undefined, owner)).body.members, []);

  // Pal becomes Family and can now use the family features.
  assert.equal((await call('PUT', '/api/admin/circle', { userId: palId, circle: 'family' }, owner)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', undefined, pal)).body.user.circle, 'family');
  assert.equal((await call('GET', '/api/challenges', undefined, pal)).status, 200);
});

test('open sign-ups start as Friend; existing accounts stay Family after the upgrade', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-up6-'));
  const db = openDatabase(dir);
  db.exec("DROP TABLE borrow_requests; DROP TABLE push_subscriptions; DROP TABLE trash; DROP TABLE activity; DROP TABLE recommendations; DROP TABLE club_posts; DROP TABLE club_members; DROP TABLE clubs; DROP TABLE lists; DROP TABLE reading_log; DROP TABLE reading_days; DROP TABLE gift_claims; ALTER TABLE users DROP COLUMN circle; ALTER TABLE invites DROP COLUMN circle; PRAGMA user_version = 5;");
  db.prepare("INSERT INTO users (id, email, password_hash, display_name, role, color) VALUES ('u1', 'old@x.com', 'h', 'Old', 'Member', 'c')").run();
  db.close();
  const again = openDatabase(dir);
  assert.equal(again.prepare("SELECT circle FROM users WHERE id = 'u1'").get().circle, 'family');
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('with open sign-ups, a new person is a Friend', async () => {
  assert.equal((await call('PUT', '/api/admin/signups', { mode: 'open' }, owner)).status, 200);
  const stranger = await register('new@example.com', 'New');
  assert.equal((await call('GET', '/api/auth/me', undefined, stranger)).body.user.circle, 'friend');
});
