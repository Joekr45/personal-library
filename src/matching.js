// Deciding whether two book records are "the same book" (any edition).
import { toIsbn13 } from '../shared/isbn.js';

const normalize = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
export const mainTitle = (t) => normalize(String(t || '').split(/\s*[:([]\s*|\s+[-–—]\s+/)[0].replace(/our\b/gi, 'or'));
export const surname = (name) => String(name || '').split(',')[0].trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s.]+/).filter(Boolean).pop() || '';

const isbnsOf = (b) => new Set([...(b.isbns || []), ...(b.editions || []).map(e => e.isbn)].map(toIsbn13).filter(Boolean));

// a and b can be library books, search results or family books.
// Returns 'edition' (same ISBN), 'work' (same book, maybe another edition) or null.
export function sameBook(a, b) {
  const ia = isbnsOf(a);
  for (const i of isbnsOf(b)) if (ia.has(i)) return 'edition';
  if (a.workKey && b.workKey && a.workKey === b.workKey) return 'work';
  const titleA = a.workTitle || a.title;
  const titleB = b.workTitle || b.title;
  const authorA = a.author || a.authors?.[0];
  const authorB = b.author || b.authors?.[0];
  if (mainTitle(titleA) && mainTitle(titleA) === mainTitle(titleB) && surname(authorA) && surname(authorA) === surname(authorB)) return 'work';
  return null;
}

// The loan that's still out (lent and not returned), if any.
export const currentLoan = (book) => (book.loans || []).find(l => !l.returnedOn) || null;
