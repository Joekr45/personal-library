// Checks for cover choices and for saving covers on the server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { createLookup } from '../server/lookup.js';
import { detectImageType, isPrivateAddress } from '../server/covers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 1)]);
const TINY_GIF = Buffer.from('GIF89a' + 'x'.repeat(30)); // Open Library's "no cover" placeholder size

const response = ({ status = 200, json, body, headers = {} }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => json,
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
});

const OL_EDITION = {
  'ISBN:9780451124388': { details: {
    title: 'The Man from St. Petersburg', authors: [{ name: 'Ken Follett' }], publishers: ['Signet'], publish_date: '1983',
    languages: [{ key: '/languages/eng' }], works: [{ key: '/works/OL81613W' }], covers: [111], physical_format: 'Mass Market Paperback'
  } }
};
const OL_EDITIONS = {
  entries: [
    { title: 'The Man from St. Petersburg', covers: [111], languages: [{ key: '/languages/eng' }], publish_date: '1983', publishers: ['Signet'], isbn_13: ['9780451124388'] },
    { title: 'El hombre de San Petersburgo', covers: [222], languages: [{ key: '/languages/spa' }], publish_date: '1998', publishers: ['Plaza & Janés'], isbn_13: ['9788401499999'] },
    { title: 'The Man from St. Petersburg', covers: [333], languages: [{ key: '/languages/eng' }], publish_date: '2009', publishers: ['NAL'] },
    { title: 'Der Mann aus St. Petersburg', covers: [-1], languages: [{ key: '/languages/ger' }] }, // no real cover
    { title: 'L\'homme de Saint-Pétersbourg', languages: [{ key: '/languages/fre' }] } // no cover at all
  ]
};
const GOOGLE_EDITIONS = {
  items: [
    { volumeInfo: { title: 'El hombre de San Petersburgo', language: 'es', publishedDate: '2015', publisher: 'DEBOLSILLO', imageLinks: { thumbnail: 'http://books.google.com/x?id=es&zoom=1&edge=curl' } } },
    { volumeInfo: { title: 'The Man from St. Petersburg', language: 'en', publishedDate: '2019', imageLinks: { thumbnail: 'http://books.google.com/x?id=en&zoom=1' } } },
    { volumeInfo: { title: 'A Totally Different Book', language: 'en', imageLinks: { thumbnail: 'http://books.google.com/x?id=other' } } }
  ]
};

function fakeFetch() {
  return async (url) => {
    if (url.includes('/api/books?bibkeys')) return response({ json: url.includes('9780451124388') ? OL_EDITION : {} });
    if (url.includes('/works/OL81613W/editions.json')) return response({ json: OL_EDITIONS });
    if (url.includes('search.json')) return response({ json: { docs: [{ key: '/works/OL81613W' }] } });
    if (url.includes('googleapis.com')) {
      const q = new URL(url).searchParams.get('q');
      return response({ json: q.startsWith('isbn:') ? { totalItems: 0 } : GOOGLE_EDITIONS });
    }
    if (url === 'https://images.example.com/cover.jpg') return response({ body: JPEG, headers: { 'content-type': 'image/jpeg' } });
    if (url === 'https://images.example.com/moved.jpg') return response({ status: 302, body: Buffer.alloc(0), headers: { location: 'https://cdn.example.com/real.png' } });
    if (url === 'https://cdn.example.com/real.png') return response({ body: PNG });
    if (url === 'https://images.example.com/placeholder.gif') return response({ body: TINY_GIF });
    if (url === 'https://images.example.com/page.html') return response({ body: Buffer.from('<html>' + 'x'.repeat(2000)) });
    if (url === 'https://images.example.com/to-router') return response({ status: 301, body: Buffer.alloc(0), headers: { location: 'http://192.168.1.1/admin' } });
    return response({ status: 404, body: Buffer.alloc(0) });
  };
}
const resolveHost = async (host) => (host === 'router.lan' ? ['192.168.1.1'] : ['93.184.216.34']);

test('detects real images and private addresses', () => {
  assert.equal(detectImageType(JPEG), 'jpg');
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(Buffer.from('<html>')), null);
  for (const a of ['10.0.0.5', '127.0.0.1', '192.168.1.1', '172.20.1.1', '169.254.1.1', '::1', 'fd00::1', '::ffff:192.168.0.1']) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateAddress(a), false, a);
});

test('cover options: this edition first, then the chosen language, labelled, junk filtered', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch() });
  const en = await lookup.getCoverOptions({ isbn13: '9780451124388' });
  assert.equal(en.options[0].thisEdition, true);
  assert.equal(en.options[0].language, 'English');
  assert.equal(en.workKey, '/works/OL81613W');
  const urls = en.options.map(o => o.url);
  assert.ok(urls.includes('https://covers.openlibrary.org/b/id/222-L.jpg'));
  assert.ok(!urls.some(u => u.includes('/-1-')));
  assert.ok(!urls.some(u => u.includes('id=other')), 'unrelated Google book excluded');
  assert.equal(new Set(urls).size, urls.length, 'no duplicates');
  assert.equal(en.options.filter(o => o.thisEdition).length, 1, 'same picture not shown twice');
  assert.deepEqual(en.languages.sort(), ['English', 'Spanish']);
  const firstSpanish = en.options.findIndex(o => o.language === 'Spanish');
  const lastEnglish = en.options.map(o => o.language).lastIndexOf('English');
  assert.ok(lastEnglish < firstSpanish, 'English editions before Spanish ones');

  const es = await createLookup({ fetchImpl: fakeFetch() }).getCoverOptions({ title: 'The Man from St. Petersburg', author: 'Ken Follett', language: 'Spanish' });
  assert.equal(es.options[0].language, 'Spanish');
  assert.equal(es.options[0].year, '1998');
  assert.equal(es.options[0].publisher, 'Plaza & Janés');
});

// ---------- through the server ----------
let server, base, dataDir, cookie, otherCookie;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-covers-'));
  server = createServer({ dataDir, distDir: dataDir, fetchImpl: fakeFetch(), resolveHost });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword' })
  })).headers.get('set-cookie').split(';')[0];
  cookie = await register('a@example.com');
  otherCookie = await register('b@example.com');
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const call = (method, url, body, c = cookie) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json', Cookie: c }, body: body === undefined ? undefined : JSON.stringify(body)
});
const newBook = async () => (await (await call('POST', '/api/books', { workTitle: 'Test', author: 'Someone', editions: [] })).json()).book;
const coverFiles = () => fs.readdirSync(path.join(dataDir, 'covers'));

test('saves a cover from the web and serves it only to its owner', async () => {
  const book = await newBook();
  const res = await call('POST', `/api/books/${book.id}/cover`, { url: 'https://images.example.com/cover.jpg' });
  assert.equal(res.status, 200);
  const saved = (await res.json()).book;
  assert.match(saved.customCoverUrl, /^\/api\/covers\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(saved.coverSourceUrl, 'https://images.example.com/cover.jpg');

  const img = await call('GET', saved.customCoverUrl);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await img.arrayBuffer()).length, JPEG.length);
  assert.equal((await call('GET', saved.customCoverUrl, undefined, otherCookie)).status, 404);
  assert.equal((await fetch(base + saved.customCoverUrl)).status, 401);
});

test('follows redirects, replaces the old file, saves phone photos', async () => {
  const book = await newBook();
  const first = (await (await call('POST', `/api/books/${book.id}/cover`, { url: 'https://images.example.com/cover.jpg' })).json()).book;
  const before = coverFiles().length;
  const second = (await (await call('POST', `/api/books/${book.id}/cover`, { url: 'https://images.example.com/moved.jpg' })).json()).book;
  assert.match(second.customCoverUrl, /\.png$/);
  assert.equal(coverFiles().length, before, 'old cover file deleted');
  assert.ok(!coverFiles().includes(first.coverFile));

  const photo = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
  const third = (await (await call('POST', `/api/books/${book.id}/cover`, { imageData: photo })).json()).book;
  assert.match(third.customCoverUrl, /\.jpg$/);
  assert.equal(third.coverSourceUrl, undefined);
});

test('rejects placeholders, non-images, private addresses and others\' books', async () => {
  const book = await newBook();
  const post = (body, c) => call('POST', `/api/books/${book.id}/cover`, body, c);
  assert.match((await (await post({ url: 'https://images.example.com/placeholder.gif' })).json()).error, /no cover/i);
  assert.match((await (await post({ url: 'https://images.example.com/page.html' })).json()).error, /not a picture/);
  assert.match((await (await post({ url: 'http://router.lan/x.jpg' })).json()).error, /public websites/);
  assert.match((await (await post({ url: 'http://127.0.0.1:80/x.jpg' })).json()).error, /public websites/);
  assert.match((await (await post({ url: 'https://images.example.com/to-router' })).json()).error, /public websites/);
  assert.equal((await post({ imageData: 'data:text/html;base64,PGh0bWw+' })).status, 400);
  assert.equal((await post({ url: 'https://images.example.com/cover.jpg' }, otherCookie)).status, 404);
});

test('switching to a web cover or deleting the book removes the saved file', async () => {
  const book = await newBook();
  const saved = (await (await call('POST', `/api/books/${book.id}/cover`, { url: 'https://images.example.com/cover.jpg' })).json()).book;
  assert.ok(coverFiles().includes(saved.coverFile));
  // A client can't point coverFile at someone else's file
  const sneaky = (await (await call('PUT', `/api/books/${book.id}`, { coverFile: 'x.jpg', readingStatus: 'Reading' })).json()).book;
  assert.equal(sneaky.coverFile, saved.coverFile);
  const changed = (await (await call('PUT', `/api/books/${book.id}`, { customCoverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg' })).json()).book;
  assert.equal(changed.coverFile, undefined);
  assert.ok(!coverFiles().includes(saved.coverFile));

  const again = (await (await call('POST', `/api/books/${book.id}/cover`, { url: 'https://images.example.com/cover.jpg' })).json()).book;
  await call('DELETE', `/api/books/${book.id}`);
  assert.ok(coverFiles().includes(again.coverFile), 'kept while the book is in the trash');
  await call('POST', '/api/trash/empty', { ids: [book.id] });
  assert.ok(!coverFiles().includes(again.coverFile), 'removed once the trash is emptied');
});

test('cover options endpoint', async () => {
  const res = await (await call('GET', '/api/lookup/covers?isbn=0451124383&language=English')).json();
  assert.ok(res.options.length >= 3);
  assert.equal(res.options[0].thisEdition, true);
  assert.equal((await fetch(`${base}/api/lookup/covers?isbn=0451124383`)).status, 401);
});
