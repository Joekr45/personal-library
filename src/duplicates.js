// Spot books that are in the library more than once (e.g. scanned and also imported from Goodreads).
import { toIsbn13 } from '../shared/isbn.js';

const titleKey = (title) => String(title || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*[:(\[].*$/, '')            // drop subtitles and "(Book 1)"
  .replace(/^(the|a|an)\s+/, '')
  .replace(/our\b/g, 'or')                // armour / armor
  .replace(/[^a-z0-9]+/g, ' ').trim();
const surname = (author) => String(author || '').split(',')[0].trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).pop() || '';

// Groups of 2+ books that look like the same book: same ISBN, or same title and author surname.
export function findDuplicates(books, dismissed = []) {
  const skip = new Set(dismissed);
  const parent = new Map(books.map(b => [b.id, b.id]));
  const find = (id) => (parent.get(id) === id ? id : find(parent.get(id)));
  const join = (a, b) => parent.set(find(a), find(b));
  const seen = new Map();
  for (const b of books) {
    const keys = [
      ...(b.editions || []).map(e => toIsbn13(e.isbn)).filter(Boolean).map(i => `isbn:${i}`),
      titleKey(b.workTitle) && surname(b.author) && !/^unknown/.test(surname(b.author)) ? `title:${titleKey(b.workTitle)}|${surname(b.author)}` : null
    ].filter(Boolean);
    for (const k of keys) {
      if (seen.has(k)) join(b.id, seen.get(k));
      else seen.set(k, b.id);
    }
  }
  const groups = new Map();
  for (const b of books) {
    const root = find(b.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(b);
  }
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => ({ key: g.map(b => b.id).sort().join('+'), books: g }))
    .filter(g => !skip.has(g.key));
}

// How much is filled in on a book: the copy with the most is suggested to keep.
export const richness = (b) =>
  (b.owned !== false ? 5 : 0) + (b.rating ? 3 : 0) + (b.notes ? 2 : 0) + (b.dateFinished ? 2 : 0) + (b.coverFile ? 2 : 0) +
  (b.description ? 1 : 0) + (b.tags || []).length + (b.quotes || []).length + (b.editions || []).length;
