// Tools for looking after your library: the trash bin (deleted books are kept 30 days),
// merging duplicates, and changing many books at once.

export const TRASH_DAYS = 30;
const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const today = () => new Date().toLocaleDateString('en-CA');

// ----- merging two or more copies of the same book into one -----
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const uniqueBy = (list, key) => {
  const seen = new Set();
  return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
};
const earliest = (...dates) => dates.filter(Boolean).sort()[0] || null;
const latest = (...dates) => dates.filter(Boolean).sort().pop() || null;
const STATUS_RANK = { Completed: 4, DNF: 3, Reading: 2, Unread: 1 };

// keepAllCopies: the books are separate copies you really own (e.g. the same edition bought twice),
// so every copy is kept. Otherwise a copy with the same ISBN in another book is taken to be the
// same copy entered twice. Copies already inside the kept book are never removed.
export function mergeBooks(keep, others, { keepAllCopies = false } = {}) {
  const all = [keep, ...others];
  const merged = { ...keep };
  // Fill anything the kept copy is missing from the others.
  for (const field of ['series', 'seriesNumber', 'hardcoverSeriesId', 'workKey', 'description', 'communityRating', 'shelfLocation', 'pace', 'targetPrice', 'customCoverUrl', 'coverFile']) {
    if (merged[field] === undefined || merged[field] === null || merged[field] === '') {
      const from = others.find(o => o[field] !== undefined && o[field] !== null && o[field] !== '');
      if (from) merged[field] = from[field];
    }
  }
  if (merged.coverFile && merged.customCoverUrl !== `/api/covers/${merged.coverFile}`) delete merged.coverFile;
  // Owned beats wishlist; the most advanced reading status wins.
  merged.owned = all.some(b => b.owned !== false);
  merged.readingStatus = all.map(b => b.readingStatus || 'Unread').sort((a, b) => (STATUS_RANK[b] || 0) - (STATUS_RANK[a] || 0))[0];
  merged.rating = keep.rating || others.map(o => o.rating).find(Boolean) || null;
  merged.dateStarted = earliest(...all.map(b => b.dateStarted));
  merged.dateFinished = latest(...all.map(b => b.dateFinished));
  merged.currentPage = Math.max(0, ...all.map(b => Number(b.currentPage) || 0)) || null;
  merged.notes = uniqueBy(all.map(b => String(b.notes || '').trim()).filter(Boolean), n => n).join('\n\n') || null;
  merged.review = keep.review?.text ? keep.review : others.find(o => o.review?.text)?.review || null;
  merged.collector = keep.collector || others.find(o => o.collector)?.collector;
  const list = (field) => all.flatMap(b => (Array.isArray(b[field]) ? b[field] : []));
  const isbnKey = (e) => String(e?.isbn || '').replace(/[^0-9X]/gi, '') || `${e?.title}|${e?.language}|${e?.format}`;
  const copies = [...(keep.editions || [])];
  const ids = new Set(copies.map(e => e.id).filter(Boolean));
  for (const other of others) {
    for (const e of other.editions || []) {
      if (!keepAllCopies && copies.some(c => isbnKey(c) === isbnKey(e))) continue;
      // Give a copy a new id if it clashes with one already there.
      copies.push(e.id && ids.has(e.id) ? { ...e, id: `${e.id}-${copies.length}` } : e);
      if (e.id) ids.add(e.id);
    }
  }
  merged.editions = copies;
  merged.tags = uniqueBy(list('tags'), t => String(t).toLowerCase());
  merged.genres = uniqueBy(list('genres'), t => String(t).toLowerCase());
  merged.moods = uniqueBy(list('moods'), t => String(t).toLowerCase());
  merged.warnings = uniqueBy(list('warnings'), t => String(t).toLowerCase());
  merged.quotes = uniqueBy(list('quotes'), q => `${q.text}|${q.page}`);
  merged.updates = uniqueBy(list('updates'), u => `${u.page}|${u.text}|${u.on}`).sort((a, b) => String(a.on || '').localeCompare(String(b.on || '')));
  merged.reads = uniqueBy(list('reads'), r => `${r.started}|${r.finished}`);
  merged.loans = uniqueBy(list('loans'), l => `${l.to}|${l.lentOn}`);
  return merged;
}

// The reading-status rules the app uses: dates fill themselves in.
const withStatus = (book, status) => {
  const out = { ...book, readingStatus: status };
  if (status === 'Reading' && !book.dateStarted) out.dateStarted = today();
  if (status === 'Completed') { out.dateStarted = book.dateStarted || null; out.dateFinished = book.dateFinished || today(); }
  if (status === 'DNF') out.dnfOn = today();
  return out;
};

export function createLibraryTools({ db, requireUser, readJson, HttpError, validateBook, bookFromRow, covers, cleanText }) {
  const getBook = (userId, id) => {
    const row = db.prepare('SELECT id, data, created_at FROM books WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? { row, data: json(row.data, {}) } : null;
  };
  const fromTrash = (row) => ({ ...json(row.data, {}), id: row.id, addedAt: row.created_at, deletedAt: `${row.deleted_at.replace(' ', 'T')}Z` });

  // Move books into the trash (instead of deleting them for good).
  const moveToTrash = (userId, ids) => {
    const move = db.prepare('INSERT OR REPLACE INTO trash (id, user_id, data, created_at) SELECT id, user_id, data, created_at FROM books WHERE id = ? AND user_id = ?');
    const remove = db.prepare('DELETE FROM books WHERE id = ? AND user_id = ?');
    let moved = 0;
    db.exec('BEGIN');
    try {
      for (const id of ids) {
        if (move.run(id, userId).changes) { remove.run(id, userId); moved++; }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return moved;
  };

  // Delete trash for good (and the saved covers that go with it).
  const purge = (rows) => {
    for (const r of rows) {
      db.prepare('DELETE FROM trash WHERE id = ?').run(r.id);
      // Remove its pictures (main cover and copies' covers) unless another book still uses them.
      const d = json(r.data, {});
      const files = [d.coverFile, ...(d.editions || []).map(e => e?.coverFile)].filter(Boolean);
      for (const file of files) {
        if (!db.prepare('SELECT 1 FROM books WHERE data LIKE ?').get(`%${file}%`)) covers.remove(file);
      }
    }
  };
  const purgeOld = () => purge(db.prepare(`SELECT id, data FROM trash WHERE deleted_at < datetime('now', '-${TRASH_DAYS} days')`).all());

  const routes = {
    'GET /api/trash': (req) => {
      const user = requireUser(req);
      purgeOld();
      const items = db.prepare('SELECT * FROM trash WHERE user_id = ? ORDER BY deleted_at DESC').all(user.id).map(fromTrash);
      return { status: 200, body: { books: items, keepDays: TRASH_DAYS } };
    },
    // Put books back: { ids }
    'POST /api/trash/restore': async (req) => {
      const user = requireUser(req);
      const ids = (await readJson(req)).ids;
      if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Which books?');
      const restored = [];
      for (const id of ids.slice(0, 1000).map(String)) {
        const row = db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(id, user.id);
        if (!row) continue;
        db.prepare("INSERT INTO books (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'))").run(row.id, user.id, row.data, row.created_at);
        db.prepare('DELETE FROM trash WHERE id = ?').run(row.id);
        restored.push(bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(row.id)));
      }
      return { status: 200, body: { books: restored } };
    },
    // Delete for good: { ids } or { all: true }
    'POST /api/trash/empty': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      const rows = body.all === true
        ? db.prepare('SELECT id, data FROM trash WHERE user_id = ?').all(user.id)
        : (Array.isArray(body.ids) ? body.ids : []).map(id => db.prepare('SELECT id, data FROM trash WHERE id = ? AND user_id = ?').get(String(id), user.id)).filter(Boolean);
      purge(rows);
      return { status: 200, body: { deleted: rows.length } };
    },

    // Merge duplicates: { keepId, mergeIds } — the others go to the trash, so it can be undone.
    'POST /api/books/merge': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      const keep = getBook(user.id, String(body.keepId || ''));
      if (!keep) throw new HttpError(404, 'Book not found.');
      const others = [...new Set((Array.isArray(body.mergeIds) ? body.mergeIds : []).map(String))]
        .filter(id => id !== keep.row.id).map(id => getBook(user.id, id)).filter(Boolean);
      if (others.length === 0) throw new HttpError(400, 'Choose at least one other copy to merge.');
      const data = validateBook(mergeBooks(keep.data, others.map(o => o.data), { keepAllCopies: body.keepAllCopies === true }));
      db.prepare("UPDATE books SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(JSON.stringify(data), keep.row.id, user.id);
      // A cover file the merged book now uses must not be deleted with the trash later.
      moveToTrash(user.id, others.map(o => o.row.id));
      return { status: 200, body: { book: bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(keep.row.id)), trashed: others.map(o => o.row.id) } };
    },

    // Change many books at once: { ids, status?, owned?, shelfLocation?, addTags?, removeTags?, trash? }
    'POST /api/books/batch': async (req) => {
      const user = requireUser(req);
      const body = await readJson(req);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 2000);
      if (ids.length === 0) throw new HttpError(400, 'Choose some books first.');
      if (body.trash === true) return { status: 200, body: { trashed: moveToTrash(user.id, ids), books: [] } };
      const status = ['Unread', 'Reading', 'Completed', 'DNF'].includes(body.status) ? body.status : null;
      const addTags = (Array.isArray(body.addTags) ? body.addTags : []).map(t => cleanText(t, 40)).filter(Boolean);
      const removeTags = new Set((Array.isArray(body.removeTags) ? body.removeTags : []).map(t => String(t).toLowerCase()));
      const out = [];
      db.exec('BEGIN');
      try {
        for (const id of ids) {
          const b = getBook(user.id, id);
          if (!b) continue;
          let data = { ...b.data };
          if (status && data.readingStatus !== status) data = withStatus(data, status);
          if (typeof body.owned === 'boolean') data.owned = body.owned;
          if (typeof body.shelfLocation === 'string') data.shelfLocation = cleanText(body.shelfLocation, 100);
          if (addTags.length || removeTags.size) {
            const tags = (data.tags || []).filter(t => !removeTags.has(String(t).toLowerCase()));
            for (const t of addTags) if (!tags.some(x => sameText(x, t))) tags.push(t);
            data.tags = tags;
          }
          data = validateBook(data);
          db.prepare("UPDATE books SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(JSON.stringify(data), id, user.id);
          out.push(bookFromRow(db.prepare('SELECT id, data, created_at FROM books WHERE id = ?').get(id)));
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return { status: 200, body: { books: out } };
    }
  };

  return { routes, moveToTrash, purgeOld };
}
