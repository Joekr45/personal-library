import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../src/qr.js';
import { labelsHtml } from '../src/labels.js';

test('QR codes have the right size and finder patterns', () => {
  const short = qrMatrix('hi');
  assert.equal(short.length, 21);
  const link = qrMatrix('https://library.example.com/?book=6f1c2b8e-4f4a-4d1e-9a2b-1234567890ab');
  assert.equal(link.length, 37, 'version 5');
  for (const [x, y] of [[0, 0], [link.length - 7, 0], [0, link.length - 7]]) {
    assert.equal(link[y][x], true); assert.equal(link[y + 1][x + 1], false); assert.equal(link[y + 3][x + 3], true);
  }
  assert.match(qrSvg('hi'), /^<svg /);
  assert.throws(() => qrMatrix('x'.repeat(300)));
});

test('label sheets: one label per book, blanks to skip used labels, text escaped', () => {
  const books = [{ id: 'a', workTitle: 'Tom & Jerry <3', author: 'X', shelfLocation: 'Den' }, { id: 'b', workTitle: 'B', author: 'Y' }];
  const html = labelsHtml(books, { origin: 'https://lib.example.com', startAt: 3, owner: 'From the library of Yoel' });
  assert.equal((html.match(/class="label"/g) || []).length, 4);
  assert.match(html, /Tom &amp; Jerry &lt;3/);
  assert.match(html, /Den/);
  const many = labelsHtml(Array.from({ length: 31 }, (_, i) => ({ id: String(i), workTitle: 't', author: 'a' })), { origin: 'https://x.y' });
  assert.equal((many.match(/class="page"/g) || []).length, 2);
});
