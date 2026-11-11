// Checks for owner tools, password changes, exports and backups.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from '../server/app.js';

let server, base, dataDir, owner, member;

const register = async (email, password = 'longpassword') => {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, displayName: email.split('@')[0] })
  });
  return { cookie: res.headers.get('set-cookie')?.split(';')[0], status: res.status, body: await res.json() };
};
const login = async (email, password) => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0] };
};
const call = (method, url, body, cookie) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
});

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-admin-'));
  server = createServer({ dataDir, distDir: dataDir, startBackups: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = (await register('owner@example.com')).cookie;
  member = (await register('kid@example.com')).cookie;
  await call('POST', '/api/books', { workTitle: 'Fall of Giants, Part "One"', author: 'Ken Follett', series: 'The Century Trilogy', seriesNumber: 1, readingStatus: 'Completed', editions: [{ isbn: '9780451232854', language: 'English', format: 'Paperback', published: 'Sept 2010' }] }, owner);
  await call('POST', '/api/books', { workTitle: 'El tercer gemelo', author: 'Ken Follett', owned: false, editions: [{ language: 'Spanish' }] }, owner);
  await call('POST', '/api/books', { workTitle: 'Kid Book', author: 'Someone', editions: [] }, member);
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a backup is made on start, and can be made on demand', async () => {
  const list = await (await call('GET', '/api/admin/backups', undefined, owner)).json();
  assert.equal(list.backups.length, 1);
  assert.match(list.backups[0].file, /^library-\d{4}-\d{2}-\d{2}\.db$/);
  const again = await (await call('POST', '/api/admin/backups', undefined, owner)).json();
  assert.equal(again.backups.length, 1, 'same day replaces');
  // The backup is a real, readable copy of the database
  const copy = new DatabaseSync(path.join(dataDir, 'backups', again.backups[0].file));
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM books').get().n, 3);
  copy.close();
  assert.equal((await call('GET', '/api/admin/backups', undefined, member)).status, 403);
});

test('only the owner can download a full backup', async () => {
  const res = await call('GET', '/api/admin/backup/download', undefined, owner);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /personal-library-backup-.*\.db/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal((await call('GET', '/api/admin/backup/download', undefined, member)).status, 403);
});

test('CSV export has only your books, properly quoted', async () => {
  const res = await call('GET', '/api/export/books.csv', undefined, owner);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const text = (await res.text()).replace(/^﻿/, '');
  const lines = text.trim().split('\r\n');
  assert.equal(lines[0].split(',')[0], 'Title');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith('"Fall of Giants, Part ""One""",Ken Follett,The Century Trilogy,1,'));
  assert.ok(lines[1].includes('9780451232854'));
  assert.ok(lines[1].includes(',2010,'));
  assert.ok(lines[2].includes('Wishlist'));
  assert.ok(!text.includes('Kid Book'));
  assert.equal((await fetch(`${base}/api/export/books.csv`)).status, 401);
});

test('owner sees everyone with book counts; members cannot', async () => {
  const res = await (await call('GET', '/api/admin/users', undefined, owner)).json();
  assert.deepEqual(res.users.map(u => [u.email, u.role, u.bookCount]), [['owner@example.com', 'Owner', 2], ['kid@example.com', 'Member', 1]]);
  assert.equal(res.users[0].password_hash, undefined);
  assert.equal((await call('GET', '/api/admin/users', undefined, member)).status, 403);
});

test('owner can turn sign-ups off and on', async () => {
  assert.equal((await call('PUT', '/api/admin/signups', { open: false }, member)).status, 403);
  assert.equal((await (await call('PUT', '/api/admin/signups', { open: false }, owner)).json()).signupsOpen, false);
  const blocked = await register('stranger@example.com');
  assert.equal(blocked.status, 403);
  assert.equal((await (await call('GET', '/api/auth/me')).json()).allowRegistration, false);
  await call('PUT', '/api/admin/signups', { open: true }, owner);
  assert.equal((await register('friend@example.com')).status, 201);
});

test('changing your own password keeps you signed in here, signs out elsewhere', async () => {
  const other = (await login('kid@example.com', 'longpassword')).cookie;
  assert.equal((await call('PUT', '/api/auth/password', { currentPassword: 'wrong', newPassword: 'newpassword1' }, member)).status, 400);
  assert.equal((await call('PUT', '/api/auth/password', { currentPassword: 'longpassword', newPassword: 'short' }, member)).status, 400);
  assert.equal((await call('PUT', '/api/auth/password', { currentPassword: 'longpassword', newPassword: 'newpassword1' }, member)).status, 200);
  assert.equal((await call('GET', '/api/books', undefined, member)).status, 200, 'still signed in on this device');
  assert.equal((await call('GET', '/api/books', undefined, other)).status, 401, 'other device signed out');
  assert.equal((await login('kid@example.com', 'newpassword1')).status, 200);
});

test('owner can reset a forgotten password and remove an account', async () => {
  const users = (await (await call('GET', '/api/admin/users', undefined, owner)).json()).users;
  const kid = users.find(u => u.email === 'kid@example.com');
  const friend = users.find(u => u.email === 'friend@example.com');
  const me = users.find(u => u.email === 'owner@example.com');

  assert.equal((await call('POST', `/api/admin/users/${kid.id}/password`, { password: 'temporary1' }, member)).status, 403);
  assert.equal((await call('POST', `/api/admin/users/${kid.id}/password`, { password: 'temporary1' }, owner)).status, 200);
  assert.equal((await call('GET', '/api/books', undefined, member)).status, 401, 'kid signed out after reset');
  assert.equal((await login('kid@example.com', 'temporary1')).status, 200);

  assert.equal((await call('DELETE', `/api/admin/users/${me.id}`, undefined, owner)).status, 400, "can't remove yourself");
  assert.equal((await call('DELETE', `/api/admin/users/${friend.id}`, undefined, owner)).status, 200);
  assert.equal((await login('friend@example.com', 'longpassword')).status, 401);
  const after = (await (await call('GET', '/api/admin/users', undefined, owner)).json()).users;
  assert.ok(!after.some(u => u.email === 'friend@example.com'));
});
