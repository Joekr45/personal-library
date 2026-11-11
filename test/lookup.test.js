// Checks for barcode handling and the catalog lookups, using recorded-style catalog
// responses instead of the real internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyCode, toIsbn13 } from '../shared/isbn.js';
import { createLookup, normalizeTitle } from '../server/lookup.js';
import { createServer } from '../server/app.js';

// ---------- fake catalogs ----------
const OL_FOLLETT = {
  'ISBN:0451124383': {
    bib_key: 'ISBN:0451124383',
    details: {
      title: 'The Man from St. Petersburg',
      authors: [{ key: '/authors/OL25277A', name: 'Ken Follett' }],
      publishers: ['Signet'],
      publish_date: '1983',
      languages: [{ key: '/languages/eng' }],
      works: [{ key: '/works/OL81613W' }],
      covers: [8231432],
      physical_format: 'Mass Market Paperback',
      number_of_pages: 352,
      key: '/books/OL7458010M'
    }
  }
};

const GOOGLE_FOLLETT = {
  totalItems: 1,
  items: [{
    volumeInfo: {
      title: 'The Man from St. Petersburg',
      authors: ['Ken Follett'],
      publisher: 'Signet',
      publishedDate: '1983',
      description: 'A thriller set on the eve of World War I.',
      industryIdentifiers: [{ type: 'ISBN_10', identifier: '0451124383' }, { type: 'ISBN_13', identifier: '9780451124388' }],
      imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' },
      language: 'en'
    }
  }]
};

// A brand-new book only Google knows about
const GOOGLE_NEW = {
  totalItems: 1,
  items: [{
    volumeInfo: {
      title: 'Brand New Novel',
      authors: ['New Author'],
      publishedDate: '2026-10-01',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781250000002' }],
      language: 'en'
    }
  }]
};

// Google returning an unrelated book for an ISBN query
const GOOGLE_WRONG = {
  totalItems: 1,
  items: [{ volumeInfo: { title: 'Something Else', authors: ['Nobody'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000002' }] } }]
};

const OL_SEARCH = {
  docs: [
    { key: '/works/OL81613W', title: 'The Man from St. Petersburg', author_name: ['Ken Follett'], first_publish_year: 1982, cover_i: 8231432, edition_count: 61, language: ['eng', 'spa'] },
    { key: '/works/OLX', title: 'El hombre de San Petersburgo', author_name: ['Ken Follett'], first_publish_year: 1984, edition_count: 5, language: ['spa'] }
  ]
};
const GOOGLE_SEARCH = {
  items: [
    { volumeInfo: { title: 'The Man From St. Petersburg', authors: ['Ken Follett'], publishedDate: '2009-03-03', publisher: 'Penguin', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780451228017' }], language: 'en' } },
    { volumeInfo: { title: 'Eye of the Needle', authors: ['Ken Follett'], publishedDate: '1978', language: 'en' } }
  ]
};

function fakeFetch({ olDown = false, googleDown = false } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (url.startsWith('https://openlibrary.org/')) {
      if (olDown) throw new Error('network down');
      if (url.includes('/api/books') && url.includes('ISBN:0451124383')) return json(OL_FOLLETT);
      if (url.includes('/api/books')) return json({});
      if (url.includes('/search.json')) return json(OL_SEARCH);
    }
    if (url.startsWith('https://www.googleapis.com/')) {
      if (googleDown) return json({ error: 'quota' }, 429);
      const q = decodeURIComponent(new URL(url).searchParams.get('q'));
      if (q === 'isbn:9780451124388') return json(GOOGLE_FOLLETT);
      if (q === 'isbn:9781250000002') return json(GOOGLE_NEW);
      if (q === 'isbn:9780306406157') return json(GOOGLE_WRONG);
      if (q.startsWith('intitle:')) return json(GOOGLE_SEARCH);
      return json({ totalItems: 0 });
    }
    return json({}, 404);
  };
  fn.calls = calls;
  return fn;
}

// ---------- barcode classification ----------
test('recognises ISBN-10, ISBN-13 and old store (UPC) barcodes', () => {
  assert.deepEqual(classifyCode('0-451-12438-3'), { kind: 'isbn', isbn13: '9780451124388', isbn10: '0451124383' });
  assert.equal(classifyCode('978-0-451-12438-8').kind, 'isbn');
  assert.equal(classifyCode('080442957X').isbn13, '9780804429573');
  assert.equal(classifyCode('9791032300824').kind, 'isbn');
  assert.equal(classifyCode('9791032300824').isbn10, null);
  // The UPC on the back of the Signet paperback, as a scanner reads it (12 digits or 13 with a leading 0)
  assert.deepEqual(classifyCode('071162003956'), { kind: 'upc', code: '071162003956' });
  assert.deepEqual(classifyCode('0071162003956'), { kind: 'upc', code: '071162003956' });
  // Typos
  assert.equal(classifyCode('0451124384').kind, 'invalid');
  assert.equal(classifyCode('9780451124389').kind, 'invalid');
  assert.match(classifyCode('7116200395').reason, /store code/);
  assert.equal(toIsbn13('0451124383'), '9780451124388');
  assert.equal(toIsbn13('Pending Scan'), null);
});

test('normalizeTitle ignores case, accents, leading articles and punctuation', () => {
  assert.equal(normalizeTitle('The Man From St. Petersburg'), normalizeTitle('Man from St Petersburg'));
  assert.equal(normalizeTitle('Café'), 'cafe');
});

// ---------- ISBN lookup ----------
test('combines Open Library and Google Books for an ISBN', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch() });
  const book = await lookup.lookupIsbn('9780451124388', '0451124383');
  assert.equal(book.title, 'The Man from St. Petersburg');
  assert.deepEqual(book.authors, ['Ken Follett']);
  assert.equal(book.publisher, 'Signet');
  assert.equal(book.language, 'English');
  assert.equal(book.format, 'Mass Market Paperback');
  assert.equal(book.description, 'A thriller set on the eve of World War I.');
  assert.deepEqual(book.sources, ['Open Library', 'Google Books']);
  assert.ok(book.covers.some(c => c.url === 'https://covers.openlibrary.org/b/id/8231432-L.jpg'));
  const google = book.covers.find(c => c.source === 'Google Books');
  assert.ok(google.url.startsWith('https://'));
  assert.ok(!google.url.includes('edge=curl'));
});

test('finds new releases that only Google Books knows', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch() });
  const book = await lookup.lookupIsbn('9781250000002', '1250000009');
  assert.equal(book.title, 'Brand New Novel');
  assert.deepEqual(book.sources, ['Google Books']);
});

test('ignores Google results whose ISBN does not match', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch() });
  assert.equal(await lookup.lookupIsbn('9780306406157', '0306406152'), null);
});

test('still works when one catalog is down', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch({ googleDown: true }) });
  const book = await lookup.lookupIsbn('9780451124388', '0451124383');
  assert.equal(book.title, 'The Man from St. Petersburg');
  assert.deepEqual(book.sources, ['Open Library']);

  const lookup2 = createLookup({ fetchImpl: fakeFetch({ olDown: true }) });
  assert.equal((await lookup2.lookupIsbn('9780451124388', '0451124383')).title, 'The Man from St. Petersburg');
});

test('remembers lookups so the catalogs are asked only once', async () => {
  const fetchImpl = fakeFetch();
  const lookup = createLookup({ fetchImpl });
  await lookup.lookupIsbn('9780451124388', '0451124383');
  const callsAfterFirst = fetchImpl.calls.length;
  await lookup.lookupIsbn('9780451124388', '0451124383');
  assert.equal(fetchImpl.calls.length, callsAfterFirst);
});

// ---------- title search ----------
test('title search merges the same book from both catalogs and ranks the best match first', async () => {
  const lookup = createLookup({ fetchImpl: fakeFetch() });
  const results = await lookup.searchBooks({ title: 'The Man from St. Petersburg', author: 'Follett' });
  assert.equal(results[0].title, 'The Man from St. Petersburg');
  assert.deepEqual(results[0].sources, ['Open Library', 'Google Books']);
  assert.equal(results[0].isbn13, '9780451228017'); // from Google
  assert.equal(results[0].year, '1982'); // earliest year
  assert.ok(results[0].cover);
  assert.equal(results.filter(r => normalizeTitle(r.title) === normalizeTitle('The Man from St. Petersburg')).length, 1);
  assert.ok(results.some(r => r.title === 'Eye of the Needle'));
});

// ---------- through the server ----------
test('lookup endpoints: login required, UPC explained, typos rejected', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-lookup-'));
  const server = createServer({ dataDir, distDir: dataDir, fetchImpl: fakeFetch() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/lookup/isbn/0451124383`)).status, 401);

    const reg = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@example.com', password: 'longpassword' })
    });
    const cookie = reg.headers.get('set-cookie').split(';')[0];
    const get = (url) => fetch(base + url, { headers: { Cookie: cookie } });

    const found = await (await get('/api/lookup/isbn/0-451-12438-3')).json();
    assert.equal(found.kind, 'isbn');
    assert.equal(found.found, true);
    assert.equal(found.book.title, 'The Man from St. Petersburg');

    const upc = await (await get('/api/lookup/isbn/071162003956')).json();
    assert.deepEqual(upc, { kind: 'upc', code: '071162003956' });

    const typo = await get('/api/lookup/isbn/0451124384');
    assert.equal(typo.status, 400);
    assert.match((await typo.json()).error, /typo/);

    const missing = await (await get('/api/lookup/isbn/9780306406157')).json();
    assert.equal(missing.found, false);

    const search = await (await get('/api/lookup/search?title=Man%20from%20St.%20Petersburg')).json();
    assert.ok(search.results.length > 0);
    assert.equal((await get('/api/lookup/search')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
