// Checks for author search and bibliographies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLookup, looksEnglish } from '../server/lookup.js';
import { createServer } from '../server/app.js';

const json = (body, status = 200) => ({ ok: status === 200, status, headers: { get: () => null }, json: async () => body });

const OL_DOCS = [
  { key: '/works/OL1W', title: 'The Pillars of the Earth', first_publish_year: 1989, cover_i: 101, edition_count: 150, language: ['eng', 'spa'], author_name: ['Ken Follett'] },
  { key: '/works/OL2W', title: 'The pillars of the earth', first_publish_year: 1990, edition_count: 10, language: ['eng'], author_name: ['Ken Follett'] },
  { key: '/works/OL3W', title: 'Los pilares de la Tierra', first_publish_year: 1992, cover_i: 103, edition_count: 40, language: ['spa'], author_name: ['Ken Follett'] },
  { key: '/works/OL4W', title: 'Kingsbridge Box Set', first_publish_year: 2018, cover_i: 104, edition_count: 2, language: ['eng'], author_name: ['Ken Follett'] },
  { key: '/works/OL5W', title: 'Fall of Giants', first_publish_year: 2010, cover_i: 105, edition_count: 60, language: ['eng'], author_name: ['Ken Follett'] },
  { key: '/works/OL6W', title: 'Fall of Giants: Book One of the Century Trilogy', first_publish_year: 2011, edition_count: 4, author_name: ['Ken Follett'] },
  { key: '/works/OL7W', title: 'Random pamphlet', edition_count: 1, author_name: ['Ken Follett'] },
  { key: '/works/OL8W', title: 'A Column of Fire', first_publish_year: 2017, cover_i: 108, edition_count: 40, language: ['eng'], author_name: ['Ken Follett'] },
  { key: '/works/OL9W', title: 'The Heist', first_publish_year: 1990, edition_count: 3, language: ['eng'], author_name: ['Ken Follett', 'Rene Louis Maurice'] },
  { key: '/works/OL10W', title: 'Summary of A Column of Fire', first_publish_year: 2018, edition_count: 1, language: ['eng'], author_name: ['Ken Follett'] },
  // Real-world messiness: translations with missing or wrong language tags
  { key: '/works/OL11W', title: 'Die Säulen der Erde', first_publish_year: 1990, edition_count: 30, author_name: ['Ken Follett'] },
  { key: '/works/OL12W', title: 'Mundo sin fin', first_publish_year: 2007, edition_count: 12, language: ['eng', 'spa'], author_name: ['Ken Follett'] },
  { key: '/works/OL13W', title: 'Die Nadel', first_publish_year: 1979, edition_count: 9, author_name: ['Ken Follett'],
    editions: { docs: [{ title: 'Die Nadel', language: ['ger'] }] } },
  { key: '/works/OL14W', title: 'Столпы земли', first_publish_year: 2005, edition_count: 4, author_name: ['Ken Follett'] },
  // A work whose main title is foreign but which has an English edition: shown under its English title
  { key: '/works/OL15W', title: "L'Arme à l'œil", first_publish_year: 1978, cover_i: 115, edition_count: 200, language: ['fre', 'eng'], author_name: ['Ken Follett'],
    editions: { docs: [{ title: 'Eye of the Needle', language: ['eng'] }] } }
];

const GOOGLE = {
  items: [
    { id: 'new1', volumeInfo: { title: 'Circle of Days', authors: ['Ken Follett'], publishedDate: '2025-09-30', language: 'en', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593300381' }], imageLinks: { thumbnail: 'http://books.google.com/x?id=new1&zoom=1' } } },
    { id: 'es1', volumeInfo: { title: 'El círculo de los días', authors: ['Ken Follett'], publishedDate: '2025', language: 'es' } },
    { id: 'other', volumeInfo: { title: 'Gardening Basics', authors: ['Ken Smith'], publishedDate: '2024', language: 'en' } },
    { id: 'dup', volumeInfo: { title: 'A Column of Fire', authors: ['Ken Follett'], publishedDate: '2018', language: 'en', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780525954972' }] } }
  ]
};

function fakeFetch() {
  return async (url) => {
    if (url.includes('/search/authors.json')) return json({ docs: [
      { key: 'OL9999A', name: 'Ken Follett', work_count: 2 },
      { key: 'OL25277A', name: 'Ken Follett', birth_date: '5 June 1949', top_work: 'The Pillars of the Earth', work_count: 320 }
    ] });
    if (url.includes('/authors/OL25277A.json')) return json({ name: 'Ken Follett', birth_date: '5 June 1949' });
    if (url.includes('search.json') && url.includes('author_key=OL25277A')) return json({ docs: url.includes('page=1') ? OL_DOCS : [] });
    if (url.includes('googleapis.com')) return json(GOOGLE);
    return json({}, 404);
  };
}

test('author search lists the best-known author first', async () => {
  const authors = await createLookup({ fetchImpl: fakeFetch() }).searchAuthors('ken follett');
  assert.equal(authors[0].key, 'OL25277A');
  assert.equal(authors[0].topWork, 'The Pillars of the Earth');
  assert.equal(authors.length, 2);
});

test('bibliography: one entry per book, no translations, no junk, includes new releases', async () => {
  const { author, books } = await createLookup({ fetchImpl: fakeFetch() }).authorWorks('OL25277A');
  assert.equal(author.name, 'Ken Follett');
  const titles = books.map(b => b.title);

  assert.equal(titles.filter(t => t.toLowerCase() === 'the pillars of the earth').length, 1, 'duplicate work merged');
  const pillars = books.find(b => b.title === 'The Pillars of the Earth');
  assert.equal(pillars.year, '1989');
  assert.equal(pillars.workKey, '/works/OL1W'); // the most popular record wins
  assert.ok(pillars.cover.includes('/101-'));

  assert.ok(!titles.includes('Los pilares de la Tierra'), 'Spanish-only work skipped');
  for (const t of ['Die Säulen der Erde', 'Mundo sin fin', 'Die Nadel', 'Столпы земли', "L'Arme à l'œil"]) {
    assert.ok(!titles.includes(t), `translation shown: ${t}`);
  }
  assert.ok(titles.includes('Eye of the Needle'), 'English edition title used');
  assert.ok(!titles.some(t => /box set|summary/i.test(t)), 'junk removed');
  assert.ok(!titles.includes('Random pamphlet'), 'noise removed');
  assert.equal(titles.filter(t => t.startsWith('Fall of Giants')).length, 1, 'subtitle variant merged');

  const newRelease = books.find(b => b.title === 'Circle of Days');
  assert.ok(newRelease, 'new release from Google included');
  assert.equal(newRelease.isbn13, '9780593300381');
  assert.ok(!titles.includes('El círculo de los días'));
  assert.ok(!titles.includes('Gardening Basics'));

  const column = books.find(b => b.title === 'A Column of Fire');
  assert.deepEqual(column.sources, ['Open Library', 'Google Books']);
  assert.equal(column.isbn13, '9780525954972');

  assert.deepEqual(books.find(b => b.title === 'The Heist').coAuthors, ['Rene Louis Maurice']);
  assert.equal(books[0].title, 'Circle of Days', 'newest first');
});

test('author endpoints and per-person hidden list', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-authors-'));
  const server = createServer({ dataDir, distDir: dataDir, fetchImpl: fakeFetch() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword' })
  })).headers.get('set-cookie').split(';')[0];
  try {
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    const call = (method, url, body, c) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: c }, body: body && JSON.stringify(body) });

    assert.equal((await fetch(`${base}/api/authors/search?q=follett`)).status, 401);
    const found = await (await call('GET', '/api/authors/search?q=ken%20follett', undefined, a)).json();
    assert.equal(found.authors[0].key, 'OL25277A');

    const works = await (await call('GET', '/api/authors/OL25277A/works', undefined, a)).json();
    const heist = works.books.find(x => x.title === 'The Heist');
    assert.equal(heist.hidden, false);

    assert.equal((await call('PUT', '/api/authors/OL25277A/hidden', { bookId: heist.id, hidden: true }, a)).status, 200);
    const afterA = await (await call('GET', '/api/authors/OL25277A/works', undefined, a)).json();
    assert.equal(afterA.books.find(x => x.id === heist.id).hidden, true);
    const afterB = await (await call('GET', '/api/authors/OL25277A/works', undefined, b)).json();
    assert.equal(afterB.books.find(x => x.id === heist.id).hidden, false, 'hiding is per person');

    await call('PUT', '/api/authors/OL25277A/hidden', { bookId: heist.id, hidden: false }, a);
    const unhidden = await (await call('GET', '/api/authors/OL25277A/works', undefined, a)).json();
    assert.equal(unhidden.books.find(x => x.id === heist.id).hidden, false);

    assert.equal((await call('GET', '/api/authors/bad-key/works', undefined, a)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('looksEnglish: translated titles vs English titles', () => {
  const foreign = ['Los pilares de la Tierra', 'Die Säulen der Erde', 'Les Piliers de la terre', 'I pilastri della terra',
    'De pijlers van de aarde', 'Jordens søjler', 'Столпы земли', '大聖堂', 'Un mondo senza fine', 'Mundo sin fin',
    'La caída de los gigantes', 'Winter der Welt', 'Der Mann aus St. Petersburg', 'Una columna de fuego', 'Nacht über den Wassern'];
  const english = ['The Pillars of the Earth', 'World Without End', 'Fall of Giants', 'Night Over Water', 'Code to Zero',
    'Whiteout', 'Hornet Flight', 'Jackdaws', 'Never', 'Lie Down with Lions', 'Triple', 'Paper Money', 'Eye of the Needle',
    'The Key to Rebecca', 'A Column of Fire', 'On Wings of Eagles', 'The Third Twin', 'Storm Island', 'Under the Dome'];
  for (const t of foreign) assert.equal(looksEnglish(t), false, t);
  for (const t of english) assert.equal(looksEnglish(t), true, t);
  assert.equal(looksEnglish('Triple', ['spa']), false, 'language tag says Spanish');
});
