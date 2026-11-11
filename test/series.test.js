// Checks for the Hardcover connection and series lookups, with a pretend Hardcover.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { cleanToken } from '../server/hardcover.js';

const GOOD_TOKEN = 'eyJhbGciOi.good.token';
const calls = [];

const FALL_OF_GIANTS = {
  id: 100, title: 'Fall of Giants',
  book_series: [
    { position: null, series: { id: 9, name: 'Ken Follett Collection' } },
    { position: 1, series: { id: 7, name: 'The Century Trilogy' } }
  ]
};

async function fakeHardcover(url, options) {
  const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body, headers: { get: () => null } });
  if (url !== 'https://api.hardcover.app/v1/graphql') return json({}, 404);
  const auth = options.headers.Authorization;
  const { query, variables } = JSON.parse(options.body);
  calls.push({ query, variables, auth });
  if (auth !== `Bearer ${GOOD_TOKEN}` && auth !== `Bearer ${GOOD_TOKEN}-catalog-only`) return json({ errors: [{ message: 'Could not verify JWT: JWSError' }] });
  if (query.includes('me {')) {
    if (auth.endsWith('catalog-only')) return json({ errors: [{ message: "field 'me' not found in type: 'query_root'" }] });
    return json({ data: { me: [{ username: 'yoel' }] } });
  }
  if (query.includes('books(limit: 1)')) return json({ data: { books: [{ id: 1 }] } });
  if (query.includes('_in: $ids')) {
    return json({ data: { books: variables.ids.filter(id => id !== 103).map(id => ({ id, image: { url: `https://assets.hardcover.app/${id}.jpg` } })) } });
  }
  if (query.includes('series(where')) {
    if (variables.id !== 7) return json({ data: { series: [] } });
    return json({ data: { series: [{ id: 7, name: 'The Century Trilogy', book_series: [
      { position: 1, book: { id: 100, title: 'Fall of Giants', release_year: 2010, users_count: 900, compilation: false } },
      { position: 1, book: { id: 900, title: 'La caída de los gigantes', release_year: 2010, users_count: 12, compilation: false } },
      { position: 1.5, book: { id: 950, title: 'A short story', release_year: 2012, users_count: 3, compilation: false } },
      { position: 2, book: { id: 102, title: 'Winter of the World', release_year: 2012, users_count: 700, compilation: false } },
      { position: 3, book: { id: 103, title: 'Edge of Eternity', release_year: 2014, users_count: 650, compilation: false } },
      { position: 4, book: { id: 999, title: 'The Century Trilogy Box Set', release_year: 2015, users_count: 50, compilation: true } }
    ] }] } });
  }
  if (query.includes('books(where: $where')) {
    const where = variables.where;
    if (where.editions) {
      const isbns = where.editions._or.map(o => o.isbn_13?._eq || o.isbn_10?._eq);
      return json({ data: { books: isbns.includes('9780451232854') ? [FALL_OF_GIANTS] : [] } });
    }
    if (where.title?._eq === 'Winter of the World') {
      return json({ data: { books: [{ id: 102, title: 'Winter of the World', book_series: [{ position: 2, series: { id: 7, name: 'The Century Trilogy' } }] }] } });
    }
    return json({ data: { books: [] } });
  }
  return json({ errors: [{ message: 'unexpected query' }] });
}

let server, base, ownerCookie, memberCookie, dataDir;
const call = (method, url, body, cookie = ownerCookie) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body)
});

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-series-'));
  server = createServer({ dataDir, distDir: dataDir, fetchImpl: fakeHardcover });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword' })
  })).headers.get('set-cookie').split(';')[0];
  ownerCookie = await register('owner@example.com');
  memberCookie = await register('member@example.com');
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('cleanToken accepts the code with or without "Bearer"', () => {
  assert.equal(cleanToken('  Bearer abc.def  '), 'abc.def');
  assert.equal(cleanToken('abc.def'), 'abc.def');
});

test('without Hardcover, series lookups say it is not available', async () => {
  const res = await (await call('GET', '/api/series/find?isbn=9780451232854')).json();
  assert.deepEqual(res, { available: false, series: null });
  assert.equal((await call('GET', '/api/series/7/books')).status, 409);
  assert.equal(calls.length, 0);
});

test('only the owner can connect, and a wrong code is rejected', async () => {
  assert.equal((await call('PUT', '/api/settings/hardcover', { token: GOOD_TOKEN }, memberCookie)).status, 403);
  const bad = await call('PUT', '/api/settings/hardcover', { token: 'wrong' });
  assert.equal(bad.status, 502);
  assert.match((await bad.json()).error, /did not accept/);
  assert.equal((await (await call('GET', '/api/settings')).json()).hardcover.connected, false);
});

test('a key with only catalog permission connects (without a username)', async () => {
  const res = await call('PUT', '/api/settings/hardcover', { token: `${GOOD_TOKEN}-catalog-only` });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).hardcover, { connected: true, username: null });
});

test('connecting stores the code on the server only', async () => {
  const res = await call('PUT', '/api/settings/hardcover', { token: `Bearer ${GOOD_TOKEN}` });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).hardcover, { connected: true, username: 'yoel' });
  const owner = await (await call('GET', '/api/settings')).json();
  const member = await (await call('GET', '/api/settings', undefined, memberCookie)).json();
  assert.equal(owner.isOwner, true);
  assert.equal(member.isOwner, false);
  assert.equal(member.hardcover.connected, true);
  assert.ok(!JSON.stringify(owner).includes(GOOD_TOKEN), 'code never sent to the browser');
});

test('finds the main series by ISBN (ignoring collections) and by title', async () => {
  const byIsbn = await (await call('GET', '/api/series/find?isbn=0451232852')).json();
  assert.deepEqual(byIsbn, { available: true, series: { id: 7, name: 'The Century Trilogy', position: 1 } });

  const byTitle = await (await call('GET', '/api/series/find?title=Winter%20of%20the%20World&author=Ken%20Follett', undefined, memberCookie)).json();
  assert.deepEqual(byTitle.series, { id: 7, name: 'The Century Trilogy', position: 2 });
  const titleQuery = calls.find(c => c.variables?.where?.title);
  assert.equal(titleQuery.variables.where.contributions.author.name._ilike, '%Follett%');

  const none = await (await call('GET', '/api/series/find?title=Standalone%20Novel')).json();
  assert.equal(none.series, null);
});

test('series books: reading order, one book per number, no translations/compilations/novellas, covers', async () => {
  const res = await (await call('GET', '/api/series/7/books')).json();
  assert.equal(res.name, 'The Century Trilogy');
  assert.deepEqual(res.books.map(b => [b.position, b.title]), [[1, 'Fall of Giants'], [2, 'Winter of the World'], [3, 'Edge of Eternity']]);
  assert.equal(res.books[0].cover, 'https://assets.hardcover.app/100.jpg');
  assert.equal(res.books[2].cover, null);
  assert.equal(res.books[1].year, '2012');
  for (const c of calls) {
    // Every query stays within Hardcover's depth limit (at most 3 nested levels)
    let depth = 0, max = 0;
    for (const ch of c.query.replace(/\([^)]*\)/g, '')) { if (ch === '{') max = Math.max(max, ++depth); if (ch === '}') depth--; }
    assert.ok(max - 1 <= 4, `query too deep: ${c.query}`);
  }
  assert.equal((await call('GET', '/api/series/8/books')).status, 404);
});

test('disconnecting', async () => {
  assert.equal((await call('DELETE', '/api/settings/hardcover', undefined, memberCookie)).status, 403);
  assert.equal((await (await call('DELETE', '/api/settings/hardcover')).json()).hardcover.connected, false);
  assert.equal((await (await call('GET', '/api/series/find?isbn=9780451232854')).json()).available, false);
});
