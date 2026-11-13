// Reading a Goodreads export (My Books → Import and export → Export Library) and turning it
// into books for this app. Shared by the app (preview) and the tests.

// A careful CSV reader: handles quoted fields with commas, quotes ("") and line breaks inside.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

// Goodreads writes ISBNs as ="0451166892" so spreadsheets keep the leading zero.
const cleanIsbn = (v) => String(v || '').replace(/[="\s]/g, '');
const goodreadsDate = (v) => {
  const m = String(v || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};

// "The Pillars of the Earth (Kingsbridge, #1)" -> title + series + number
export function splitSeries(title) {
  const m = String(title || '').match(/^(.*?)\s*\(([^()]*?),?\s*#(\d+(?:\.\d+)?)[^()]*\)\s*$/);
  if (!m) return { title: String(title || '').trim(), series: null, seriesNumber: null };
  return { title: m[1].trim(), series: m[2].trim().replace(/,$/, ''), seriesNumber: Number(m[3]) };
}

// Returns { books, shelves: { read, 'currently-reading', 'to-read', other } } or throws if it isn't a Goodreads file.
export function readGoodreadsExport(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('That file is empty.');
  const header = rows[0].map(h => h.trim());
  const col = (name) => header.indexOf(name);
  if (col('Title') < 0 || col('Author') < 0 || col('Exclusive Shelf') < 0) {
    throw new Error('That doesn\'t look like a Goodreads export. In Goodreads use My Books → Import and export → Export Library.');
  }
  const get = (row, name) => (col(name) >= 0 ? String(row[col(name)] ?? '').trim() : '');
  const books = rows.slice(1).filter(r => get(r, 'Title')).map(r => {
    const { title, series, seriesNumber } = splitSeries(get(r, 'Title'));
    const isbn13 = cleanIsbn(get(r, 'ISBN13'));
    const isbn10 = cleanIsbn(get(r, 'ISBN'));
    const rating = Number(get(r, 'My Rating')) || null;
    const review = get(r, 'My Review').replace(/<br\s*\/?>/gi, '\n');
    const privateNotes = get(r, 'Private Notes');
    const year = get(r, 'Original Publication Year') || get(r, 'Year Published');
    // Your own Goodreads shelves (e.g. "favorites", "book-club") become shelves here too.
    const builtIn = new Set(['read', 'to-read', 'currently-reading']);
    const tags = [...new Set(get(r, 'Bookshelves').split(',').map(t => t.trim()).filter(t => t && !builtIn.has(t)))];
    return {
      shelf: get(r, 'Exclusive Shelf') || 'read',
      workTitle: title,
      author: [get(r, 'Author'), ...get(r, 'Additional Authors').split(',').map(a => a.trim()).filter(Boolean)].join(', '),
      series,
      seriesNumber,
      rating,
      notes: [review, privateNotes].filter(Boolean).join('\n\n') || null,
      dateFinished: goodreadsDate(get(r, 'Date Read')),
      ...(tags.length ? { tags } : {}),
      editions: [{
        id: `ed-gr-${get(r, 'Book Id') || Math.random().toString(36).slice(2)}`,
        title,
        language: 'English',
        format: get(r, 'Binding') || 'Physical Print',
        isbn: isbn13 || isbn10 || 'Pending Scan',
        published: year || 'Unknown',
        publisher: get(r, 'Publisher') || 'Unknown',
        pageCount: Number(get(r, 'Number of Pages')) || null
      }]
    };
  });
  const shelves = { read: 0, 'currently-reading': 0, 'to-read': 0, other: 0 };
  for (const b of books) shelves[b.shelf in shelves ? b.shelf : 'other']++;
  return { books, shelves };
}
