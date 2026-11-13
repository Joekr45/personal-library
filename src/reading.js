// Small helpers for reading dates, ratings and "Up next" in a series.

// Today's date as YYYY-MM-DD in the reader's own time zone.
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) : null);

export const formatDate = (date) => {
  if (!date) return '';
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// When the reading status changes, fill in the obvious dates (they can still be edited).
export function statusChanges(book, status) {
  const changes = { readingStatus: status };
  if (status === 'Reading' && !book.dateStarted) changes.dateStarted = today();
  if (status === 'Completed') {
    if (!book.dateFinished) changes.dateFinished = today();
    if (!book.dateStarted && book.readingStatus === 'Reading') changes.dateStarted = today();
  }
  return changes;
}

// For each series you've started, the next book to read: the first one after the last
// finished book that you haven't finished yet (it may be on your shelf or your wishlist).
export function upNextInSeries(books) {
  const groups = new Map();
  for (const b of books) {
    if (!b.series || b.seriesNumber === null || b.seriesNumber === undefined) continue;
    const key = b.hardcoverSeriesId ? `hc-${b.hardcoverSeriesId}` : b.series.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const result = [];
  for (const list of groups.values()) {
    const finished = list.filter(b => b.readingStatus === 'Completed');
    if (finished.length === 0) continue;
    const lastFinished = Math.max(...finished.map(b => Number(b.seriesNumber)));
    const next = list
      .filter(b => b.readingStatus !== 'Completed' && Number(b.seriesNumber) > lastFinished)
      .sort((a, b) => Number(a.seriesNumber) - Number(b.seriesNumber))[0];
    if (next) result.push({ book: next, series: next.series, finishedCount: finished.length });
  }
  return result.sort((a, b) => a.series.localeCompare(b.series));
}

// Every date this book was finished: earlier reads (re-reads) and the latest one.
export const finishDates = (book) =>
  [...(Array.isArray(book?.reads) ? book.reads.map(r => r?.finished) : []), book?.dateFinished].filter(Boolean);

// How many times you've read it (a Completed book without a date still counts once).
export const timesRead = (book) =>
  (Array.isArray(book?.reads) ? book.reads.filter(r => r?.finished).length : 0) +
  (book?.dateFinished || book?.readingStatus === 'Completed' ? 1 : 0);

// "Read it again": the finished read goes into the history and a new read starts today.
export const startReread = (book) => ({
  reads: [...(book.reads || []), { started: book.dateStarted || null, finished: book.dateFinished || null }],
  readingStatus: 'Reading',
  dateStarted: today(),
  dateFinished: null,
  currentPage: null
});
