import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClippings, groupClippings, matchBook, newQuotes } from '../src/kindle.js';

const FILE = `﻿Pride and Prejudice (Austen, Jane)
- Your Highlight on page 1 | Location 5-6 | Added on Monday, January 1, 2024 10:00:00 AM

It is a truth universally acknowledged
==========
Pride and Prejudice (Austen, Jane)
- Your Highlight on page 1 | Location 5-7 | Added on Monday, January 1, 2024 10:01:00 AM

It is a truth universally acknowledged, that a single man in possession of a good fortune
==========
Pride and Prejudice (Austen, Jane)
- Your Note on page 1 | Location 7 | Added on Monday, January 1, 2024 10:02:00 AM

So true
==========
Pride and Prejudice (Austen, Jane)
- Your Bookmark on page 9 | Location 120 | Added on Monday, January 1, 2024 10:03:00 AM


==========
The Name of the Wind (The Kingkiller Chronicle Book 1) (Patrick Rothfuss)
- Your Highlight at location 300-301 | Added on Tuesday, 2 January 2024 08:00:00

Words are pale shadows of forgotten names.
==========
`;

test('reads My Clippings.txt: highlights, notes, skips bookmarks, keeps the longest highlight', () => {
  const c = parseClippings(FILE);
  assert.equal(c.length, 4);
  assert.deepEqual([c[0].title, c[0].author, c[0].page, c[0].addedOn], ['Pride and Prejudice', 'Jane Austen', 1, '2024-01-01']);
  assert.equal(c[3].addedOn, '2024-01-02');
  const groups = groupClippings(c);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].quotes.length, 1);
  assert.match(groups[0].quotes[0].text, /single man/);
  assert.equal(groups[0].quotes[0].note, 'So true');
  const library = [{ id: 'a', workTitle: 'Pride & Prejudice', author: 'Jane Austen', quotes: [] }, { id: 'b', workTitle: 'The Name of the Wind', author: 'Patrick Rothfuss', quotes: [{ text: 'Words are pale shadows of forgotten names.' }] }];
  assert.equal(matchBook(groups[1], library)?.id, 'b');
  assert.equal(newQuotes(groups[1], library[1]).length, 0, 'already saved');
});
