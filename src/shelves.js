// Helpers for "My Shelves" (your own tags like "Beach reads") and reading progress.

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export const tagsOf = (book) => (Array.isArray(book?.tags) ? book.tags : []);

export const hasTag = (book, name) => {
  const key = String(name).toLowerCase();
  return tagsOf(book).some(t => t.toLowerCase() === key);
};

// Every shelf you've used, with how many books are on it, A–Z.
export function allShelves(books) {
  const map = new Map();
  for (const b of books) {
    for (const t of tagsOf(b)) {
      const key = t.toLowerCase();
      if (!map.has(key)) map.set(key, { name: t, count: 0 });
      map.get(key).count++;
    }
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

// Rename a shelf on one book (or remove it when newName is empty).
export function renameTag(book, oldName, newName) {
  const key = String(oldName).toLowerCase();
  const out = [];
  for (const t of tagsOf(book)) {
    const next = t.toLowerCase() === key ? newName : t;
    if (next && !out.some(o => o.toLowerCase() === next.toLowerCase())) out.push(next);
  }
  return out;
}

export const totalPagesOf = (book) => Number(book?.editions?.[0]?.pageCount) || 0;

// { page, total, pct } for a book you've started, or null. pct is null when the page count is unknown.
export function progressOf(book) {
  const page = Number(book?.currentPage) || 0;
  if (!page) return null;
  const total = totalPagesOf(book);
  return { page, total, pct: total ? Math.min(100, Math.round((page / total) * 100)) : null };
}
