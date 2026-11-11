// Checks for family sharing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

let server, base, dataDir, mom, kid, dad;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
const call = (method, url, body, cookie) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body)
});

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-family-'));
  server = createServer({ dataDir, distDir: dataDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email, displayName) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName })
  })).headers.get('set-cookie').split(';')[0];
  mom = await register('mom@example.com', 'Mom');
  kid = await register('kid@example.com', 'Kid');
  dad = await register('dad@example.com', 'Dad');
  const pillars = (await (await call('POST', '/api/books', { workTitle: 'The Pillars of the Earth', author: 'Ken Follett', workKey: '/works/OL1W', notes: 'private thoughts', editions: [{ isbn: '9780451166890' }] }, mom)).json()).book;
  await call('POST', '/api/books', { workTitle: 'Secret Wishlist Book', author: 'X', owned: false, editions: [] }, mom);
  await call('POST', '/api/books', { workTitle: 'Dad Book', author: 'Y', editions: [] }, dad);
  await call('POST', `/api/books/${pillars.id}/cover`, { imageData: `data:image/jpeg;base64,${JPEG.toString('base64')}` }, mom);
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('nobody is shared until they choose to', async () => {
  const res = await (await call('GET', '/api/family', undefined, kid)).json();
  assert.deepEqual(res, { sharing: false, members: [] });
});

test('sharing shows shelf books only, without private details', async () => {
  assert.deepEqual(await (await call('PUT', '/api/me/sharing', { sharing: true }, mom)).json(), { sharing: true });
  const res = await (await call('GET', '/api/family', undefined, kid)).json();
  assert.equal(res.members.length, 1);
  const m = res.members[0];
  assert.equal(m.displayName, 'Mom');
  assert.equal(m.email, undefined);
  assert.deepEqual(m.books.map(b => b.workTitle), ['The Pillars of the Earth']);
  assert.equal(m.books[0].notes, undefined, 'notes stay private');
  assert.deepEqual(m.books[0].isbns, ['9780451166890']);
  // Mom doesn't see herself
  assert.equal((await (await call('GET', '/api/family', undefined, mom)).json()).members.length, 0);
});

test("a sharing member's saved cover can be seen by family; not when they stop sharing", async () => {
  const cover = (await (await call('GET', '/api/family', undefined, kid)).json()).members[0].books[0].customCoverUrl;
  assert.match(cover, /^\/api\/covers\//);
  assert.equal((await call('GET', cover, undefined, kid)).status, 200);
  await call('PUT', '/api/me/sharing', { sharing: false }, mom);
  assert.equal((await call('GET', cover, undefined, kid)).status, 404);
  assert.equal((await call('GET', cover, undefined, mom)).status, 200);
  assert.equal((await (await call('GET', '/api/family', undefined, kid)).json()).members.length, 0);
});
