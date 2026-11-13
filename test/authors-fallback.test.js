// When a scan finds the book but not its author, other places are checked in turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLookup } from '../server/lookup.js';

const reply = (body) => ({ ok: true, status: 200, json: async () => body });
const nope = { ok: false, status: 404, json: async () => ({}) };
// An Open Library edition with no author listed (only the work has one), and Google knows nothing.
const edition = (isbn, extra = {}) => ({
  [`ISBN:${isbn}`]: { details: { title: 'The Pillars of the Earth', works: [{ key: '/works/OL5W' }], key: '/books/OL1M', ...extra } }
});
const makeFetch = (routes) => async (url) => {
  url = String(url);
  for (const [part, body] of routes) if (url.includes(part)) return typeof body === 'function' ? body(url) : reply(body);
  return nope;
};

test('author found on the Open Library work', async () => {
  const lookup = createLookup({ fetchImpl: makeFetch([
    ['api/books?bibkeys', edition('9780451166890')],
    ['/works/OL5W.json', { authors: [{ author: { key: '/authors/OL9A' } }] }],
    ['/authors/OL9A.json', { name: 'Ken Follett' }]
  ]) });
  const book = await lookup.lookupIsbn('9780451166890', '0451166892');
  assert.deepEqual(book.authors, ['Ken Follett']);
});

test('author found with Open Library search by ISBN', async () => {
  const lookup = createLookup({ fetchImpl: makeFetch([
    ['api/books?bibkeys', edition('9780451166890', { works: [] })],
    ['search.json?isbn=9780451166890', { docs: [{ title: 'The Pillars of the Earth', author_name: ['Ken Follett'] }] }]
  ]) });
  assert.deepEqual((await lookup.lookupIsbn('9780451166890')).authors, ['Ken Follett']);
});

test("Google's guess is used only when its title matches", async () => {
  const google = { items: [{ volumeInfo: { title: 'Something Else', authors: ['Wrong Person'], industryIdentifiers: [] } }] };
  const lookupWrong = createLookup({ fetchImpl: makeFetch([['api/books?bibkeys', edition('9780451166890', { works: [] })], ['googleapis.com', google]]) });
  assert.deepEqual((await lookupWrong.lookupIsbn('9780451166890')).authors, []);
  const right = { items: [{ volumeInfo: { title: 'Pillars of the Earth', authors: ['Ken Follett'], industryIdentifiers: [] } }] };
  const lookupRight = createLookup({ fetchImpl: makeFetch([['api/books?bibkeys', edition('9780451166890', { works: [] })], ['googleapis.com', right]]) });
  assert.deepEqual((await lookupRight.lookupIsbn('9780451166890')).authors, ['Ken Follett']);
});

test('Hardcover is asked when the others fail', async () => {
  let asked = null;
  const lookup = createLookup({
    fetchImpl: makeFetch([['api/books?bibkeys', edition('9780451166890', { works: [] })]]),
    extraAuthors: async (isbn) => { asked = isbn; return ['Ken Follett']; }
  });
  assert.deepEqual((await lookup.lookupIsbn('9780451166890')).authors, ['Ken Follett']);
  assert.equal(asked, '9780451166890');
});

test('title search is the last resort, only when every match agrees on the author', async () => {
  const agree = { docs: [{ title: 'The Pillars of the Earth', author_name: ['Ken Follett'] }, { title: 'Pillars of the Earth', author_name: ['Ken Follett'] }] };
  const disagree = { docs: [{ title: 'The Pillars of the Earth', author_name: ['Ken Follett'] }, { title: 'The Pillars of the Earth', author_name: ['Someone Else'] }] };
  const make = (docs) => createLookup({ fetchImpl: makeFetch([['api/books?bibkeys', edition('9780451166890', { works: [] })], ['search.json?title=', docs]]) });
  assert.deepEqual((await make(agree).lookupIsbn('9780451166890')).authors, ['Ken Follett']);
  assert.deepEqual((await make(disagree).lookupIsbn('9780451166890')).authors, []);
});

test('"Unknown" placeholders from a catalog are not taken as an author', async () => {
  const lookup = createLookup({ fetchImpl: makeFetch([
    ['api/books?bibkeys', edition('9780451166890', { works: [], authors: [{ name: 'Unknown' }] })],
    ['search.json?isbn=', { docs: [{ author_name: ['Ken Follett'] }] }]
  ]) });
  assert.deepEqual((await lookup.lookupIsbn('9780451166890')).authors, ['Ken Follett']);
});
