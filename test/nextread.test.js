// "Pick my next read": which books it may choose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates } from '../src/nextread.js';

const book = (id, extra = {}) => ({ id, workTitle: id, owned: true, readingStatus: 'Unread', editions: [{ pageCount: 300 }], ...extra });
const books = [
  book('short', { editions: [{ pageCount: 180 }], moods: ['Funny'] }),
  book('long', { editions: [{ pageCount: 600 }], readFormat: 'audio' }),
  book('nopages', { editions: [{}] }),
  book('s1', { series: 'Saga', seriesNumber: 1, readingStatus: 'Reading' }),
  book('s2', { series: 'Saga', seriesNumber: 2 }),
  book('done', { readingStatus: 'Completed' }),
  book('wish', { owned: false })
];
const ids = (opts) => candidates(books, opts).map(b => b.id).sort();

test('only owned, unread books; later series books wait for earlier ones', () => {
  assert.deepEqual(ids(), ['long', 'nopages', 'short']);
  assert.deepEqual(ids({ inOrder: false }), ['long', 'nopages', 's2', 'short']);
});
test('length, format and mood filters', () => {
  assert.deepEqual(ids({ length: 'short' }), ['short']);
  assert.deepEqual(ids({ length: 'long' }), ['long']);
  assert.deepEqual(ids({ format: 'audio' }), ['long']);
  assert.deepEqual(ids({ format: 'print' }), ['nopages', 'short']);
  assert.deepEqual(ids({ mood: 'Funny' }), ['short']);
});
