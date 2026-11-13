// Choosing what to read next (used by "Pick my next read").
import { totalPagesOf } from './shelves.js';

export const LENGTHS = [['any', 'Any length'], ['short', 'Short (under 250 pages)'], ['medium', '250–450 pages'], ['long', 'Long (over 450)']];
const fitsLength = (b, length) => {
  if (length === 'any') return true;
  const p = totalPagesOf(b);
  if (!p) return false;
  return length === 'short' ? p < 250 : length === 'medium' ? p >= 250 && p <= 450 : p > 450;
};

// A later book in a series is skipped while an earlier one you own is still unread.
const earlierUnread = (b, books) => {
  const n = Number(b.seriesNumber);
  if (!b.series || !(n > 1)) return false;
  return books.some(o => o.id !== b.id && o.owned !== false && o.series === b.series && Number(o.seriesNumber) < n && o.readingStatus !== 'Completed');
};

// The books "Pick my next read" can choose from with these choices.
export function candidates(books, { length = 'any', format = 'any', mood = 'any', inOrder = true } = {}) {
  return books.filter(b => b.owned !== false && b.readingStatus === 'Unread'
    && fitsLength(b, length)
    && (format === 'any' || (b.readFormat || 'print') === format)
    && (mood === 'any' || (b.moods || []).includes(mood))
    && !(inOrder && earlierUnread(b, books)));
}

