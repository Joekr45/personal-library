// Checks for invite-only sign-ups.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from '../server/app.js';

let server, base, dataDir, owner;
const register = (email, inviteCode) => fetch(`${base}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', inviteCode })
});
const call = (method, url, body, cookie = owner) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body)
});

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-invite-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'invite' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('the first account needs no code; after that a code is required', async () => {
  assert.equal((await (await fetch(`${base}/api/auth/me`)).json()).signupMode, 'open');
  const first = await register('owner@example.com');
  assert.equal(first.status, 201);
  owner = first.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(`${base}/api/auth/me`)).json()).signupMode, 'invite');
  const noCode = await register('stranger@example.com');
  assert.equal(noCode.status, 403);
  assert.match((await noCode.json()).error, /invite code/);
  assert.equal((await register('stranger@example.com', 'ABCD-EFGH')).status, 403);
});

test('an invite code works once, ignoring case and dashes', async () => {
  const { code, expiresAt } = await (await call('POST', '/api/admin/invites', { note: 'Mom', days: 7 })).json();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(new Date(expiresAt) > new Date(Date.now() + 6 * 86400000));
  const mom = await register('mom@example.com', ` ${code.toLowerCase().replace('-', '')} `);
  assert.equal(mom.status, 201);
  assert.equal((await mom.json()).user.role, 'Member');
  const again = await register('cousin@example.com', code);
  assert.equal(again.status, 403);
  assert.match((await again.json()).error, /already been used/);
  const list = (await (await call('GET', '/api/admin/invites')).json()).invites;
  assert.deepEqual(list.map(i => [i.code, i.status, i.usedBy, i.note]), [[code, 'used', 'mom', 'Mom']]);
});

test('members cannot make invites; owner can revoke unused ones', async () => {
  const mom = (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mom@example.com', password: 'longpassword' }) })).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('POST', '/api/admin/invites', {}, mom)).status, 403);
  const { code } = await (await call('POST', '/api/admin/invites', {})).json();
  assert.equal((await call('DELETE', `/api/admin/invites/${code}`)).status, 200);
  assert.equal((await register('late@example.com', code)).status, 403);
});

test('expired codes are refused', async () => {
  const { code } = await (await call('POST', '/api/admin/invites', {})).json();
  const db = new DatabaseSync(path.join(dataDir, 'library.db'));
  db.prepare("UPDATE invites SET expires_at = '2000-01-01 00:00:00' WHERE code = ?").run(code);
  db.close();
  const res = await register('old@example.com', code);
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /expired/);
});

test('owner can switch to open or closed', async () => {
  assert.equal((await (await call('PUT', '/api/admin/signups', { mode: 'open' })).json()).signupMode, 'open');
  assert.equal((await register('anyone@example.com')).status, 201);
  await call('PUT', '/api/admin/signups', { mode: 'closed' });
  const closed = await register('nobody@example.com');
  assert.equal(closed.status, 403);
  assert.match((await closed.json()).error, /turned off/);
  assert.equal((await call('PUT', '/api/admin/signups', { mode: 'banana' })).status, 400);
  await call('PUT', '/api/admin/signups', { mode: 'invite' });
});

test('guessing codes gets blocked', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await register(`guess${i}@example.com`, `ZZZZ-ZZ${String(i).padStart(2, '0')}`);
  assert.equal(last.status, 429);
});
