import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, splitSeries, readGoodreadsExport } from '../shared/goodreads.js';

const SAMPLE = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '5043,"The Pillars of the Earth (Kingsbridge, #1)",Ken Follett,"Follett, Ken",,"=""0451166892""","=""9780451166890""",5,4.33,Signet,Mass Market Paperback,983,1990,1989,2024/03/15,2023/01/02,,,read,"Loved it,<br/>truly ""epic"".",,,1,0',
  '234225,Dune,Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.27,Ace,Paperback,604,1990,1965,,2024/05/01,to-read,to-read (#3),to-read,,,,0,0',
  '1,"Good Omens","Terry Pratchett","Pratchett, Terry","Neil Gaiman",,,4,4.2,Harper,Hardcover,400,2006,1990,,2024/01/01,,,currently-reading,,,"private note",1,1'
].join('\r\n');

test('CSV reader handles quotes, commas and line breaks', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n"line\nbreak",2,3\n'), [['a', 'b, c', 'd "e"'], ['line\nbreak', '2', '3']]);
});

test('series are split out of Goodreads titles', () => {
  assert.deepEqual(splitSeries('The Pillars of the Earth (Kingsbridge, #1)'), { title: 'The Pillars of the Earth', series: 'Kingsbridge', seriesNumber: 1 });
  assert.deepEqual(splitSeries('The Way of Kings (The Stormlight Archive, #1)'), { title: 'The Way of Kings', series: 'The Stormlight Archive', seriesNumber: 1 });
  assert.deepEqual(splitSeries('Edgedancer (The Stormlight Archive, #2.5)'), { title: 'Edgedancer', series: 'The Stormlight Archive', seriesNumber: 2.5 });
  assert.deepEqual(splitSeries('Dune'), { title: 'Dune', series: null, seriesNumber: null });
});

test('Goodreads export becomes books', () => {
  const { books, shelves } = readGoodreadsExport(SAMPLE);
  assert.deepEqual(shelves, { read: 1, 'currently-reading': 1, 'to-read': 1, other: 0 });
  const pillars = books[0];
  assert.equal(pillars.workTitle, 'The Pillars of the Earth');
  assert.equal(pillars.series, 'Kingsbridge');
  assert.equal(pillars.rating, 5);
  assert.equal(pillars.dateFinished, '2024-03-15');
  assert.equal(pillars.notes, 'Loved it,\ntruly "epic".');
  assert.equal(pillars.editions[0].isbn, '9780451166890');
  assert.equal(pillars.editions[0].pageCount, 983);
  assert.equal(pillars.editions[0].published, '1989');
  const dune = books[1];
  assert.equal(dune.rating, null);
  assert.equal(dune.editions[0].isbn, 'Pending Scan');
  assert.equal(books[2].author, 'Terry Pratchett, Neil Gaiman');
  assert.equal(books[2].notes, 'private note');
  assert.throws(() => readGoodreadsExport('Name,Email\nx,y'), /Goodreads export/);
});
