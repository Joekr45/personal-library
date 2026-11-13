// Borrowing from each other: browse the libraries people share with you, ask to borrow a book,
// and the owner says yes (it goes into their "Lent Out" list) or no.
//
// Whose library you can see:
//  - Family see family who turned on "Share my library with the family".
//  - Everyone (family and friends) sees people who turned on "Let friends see my library".
import crypto from 'node:crypto';

const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const today = () => new Date().toLocaleDateString('en-CA');

export function createBorrow(ctx) {
  const { db, requireUser, readJson, HttpError, cleanText, getSetting, setSetting, validateBook } = ctx;
  const notify = ctx.notify || (() => {});

  const familySharing = (userId) => getSetting(`share:${userId}`) === 'true';
  const friendsSharing = (userId) => getSetting(`sharefriends:${userId}`) === 'true';
  const isFamily = (u) => u && u.circle !== 'friend';
  const userById = (id) => db.prepare('SELECT id, display_name, color, circle, role FROM users WHERE id = ?').get(id);
  const person = (u) => (u ? { id: u.id, displayName: u.display_name, color: u.color } : null);

  // Can `me` see `owner`'s library?
  const canSee = (me, owner) => Boolean(owner && owner.id !== me.id && (
    friendsSharing(owner.id) || (isFamily(me) && isFamily(owner) && familySharing(owner.id))
  ));

  const getBook = (ownerId, bookId) => {
    const row = db.prepare('SELECT id, data FROM books WHERE id = ? AND user_id = ?').get(bookId, ownerId);
    return row ? { id: row.id, data: json(row.data, {}) } : null;
  };
  const openLoan = (data) => (data.loans || []).find(l => !l.returnedOn) || null;
  const coverOf = (b) => {
    const isbn = (b.editions || []).map(e => String(e.isbn || '').replace(/[^0-9X]/gi, '')).find(i => i.length === 13 || i.length === 10);
    if (/^https:\/\//.test(b.customCoverUrl || '')) return b.customCoverUrl;
    return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null;
  };
  const saveBook = (ownerId, id, data) => {
    db.prepare("UPDATE books SET data = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(validateBook(data)), id, ownerId);
  };

  // If the owner pressed "It's back" on the book itself, the request is finished too.
  const reconcile = (r) => {
    if (r.status !== 'lent') return r;
    const book = getBook(r.owner_id, r.book_id);
    const borrower = userById(r.requester_id);
    const stillOut = book && (book.data.loans || []).some(l => !l.returnedOn && l.to === borrower?.display_name);
    if (stillOut) return r;
    db.prepare("UPDATE borrow_requests SET status = 'returned', updated_at = datetime('now') WHERE id = ?").run(r.id);
    return { ...r, status: 'returned' };
  };

  const view = (r, me) => {
    const book = json(r.book, {});
    return {
      id: r.id, status: r.status, message: r.message, reply: r.reply, dueOn: r.due_on,
      createdAt: r.created_at, updatedAt: r.updated_at, book,
      owner: person(userById(r.owner_id)), requester: person(userById(r.requester_id)),
      mine: r.requester_id === me.id
    };
  };

  const getRequest = (id) => {
    const r = db.prepare('SELECT * FROM borrow_requests WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'That request no longer exists.');
    return r;
  };

  const routes = {
    // The libraries you can browse and borrow from.
    'GET /api/libraries': (req) => {
      const me = requireUser(req);
      const mine = db.prepare("SELECT book_id, status FROM borrow_requests WHERE requester_id = ? AND status IN ('pending', 'lent')").all(me.id);
      const asked = new Map(mine.map(r => [r.book_id, r.status]));
      const people = db.prepare('SELECT id, display_name, color, circle, role FROM users WHERE id != ? ORDER BY created_at').all(me.id)
        .filter(u => canSee(me, u))
        .map(u => ({
          ...person(u),
          books: db.prepare('SELECT id, data FROM books WHERE user_id = ?').all(u.id)
            .map(r => ({ id: r.id, ...json(r.data, {}) }))
            .filter(b => b.owned !== false)
            .map(b => ({
              id: b.id, workTitle: b.workTitle, author: b.author, series: b.series || null,
              cover: coverOf(b), format: b.editions?.[0]?.format || null,
              out: Boolean(openLoan(b)), myRequest: asked.get(b.id) || null
            }))
        }));
      return { status: 200, body: { people, sharingWithFriends: friendsSharing(me.id) } };
    },

    'PUT /api/me/share-with-friends': async (req) => {
      const me = requireUser(req);
      const on = (await readJson(req)).on === true;
      setSetting(`sharefriends:${me.id}`, on ? 'true' : 'false');
      return { status: 200, body: { on } };
    },

    // Requests you sent and requests for your books.
    'GET /api/borrow': (req) => {
      const me = requireUser(req);
      const rows = db.prepare('SELECT * FROM borrow_requests WHERE owner_id = ? OR requester_id = ? ORDER BY created_at DESC LIMIT 200').all(me.id, me.id).map(reconcile);
      const list = rows.map(r => view(r, me));
      return {
        status: 200,
        body: {
          incoming: list.filter(r => !r.mine),
          outgoing: list.filter(r => r.mine),
          waiting: list.filter(r => !r.mine && r.status === 'pending').length
        }
      };
    },

    'POST /api/borrow': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const owner = userById(String(body.ownerId || ''));
      if (!canSee(me, owner)) throw new HttpError(404, "You can't see that library.");
      const book = getBook(owner.id, String(body.bookId || ''));
      if (!book || book.data.owned === false) throw new HttpError(404, 'That book is no longer on their shelves.');
      const already = db.prepare("SELECT id FROM borrow_requests WHERE requester_id = ? AND book_id = ? AND status IN ('pending', 'lent')").get(me.id, book.id);
      if (already) throw new HttpError(409, 'You already asked for this book.');
      const snap = { title: book.data.workTitle, author: book.data.author, cover: coverOf(book.data), bookId: book.id };
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO borrow_requests (id, owner_id, requester_id, book_id, book, message) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, owner.id, me.id, book.id, JSON.stringify(snap), cleanText(body.message, 500) || null);
      notify(owner.id, 'borrow', { title: `${me.display_name} would like to borrow a book`, body: `${snap.title} by ${snap.author}`, url: '/?section=borrow', tag: `borrow-${id}` });
      return { status: 201, body: { request: view(getRequest(id), me) } };
    }
  };

  // POST /api/borrow/:id/(accept|decline|cancel|returned)
  const act = async (req, id, action) => {
    const me = requireUser(req);
    const body = await readJson(req).catch(() => ({}));
    const r = reconcile(getRequest(id));
    const isOwner = r.owner_id === me.id;
    const isRequester = r.requester_id === me.id;
    const borrower = userById(r.requester_id);
    const snap = json(r.book, {});
    const set = (status, extra = {}) => db.prepare("UPDATE borrow_requests SET status = ?, reply = COALESCE(?, reply), due_on = COALESCE(?, due_on), updated_at = datetime('now') WHERE id = ?")
      .run(status, extra.reply ?? null, extra.dueOn ?? null, id);

    if (action === 'accept') {
      if (!isOwner) throw new HttpError(403, 'Only the owner can lend this book.');
      if (r.status !== 'pending') throw new HttpError(409, 'That request was already answered.');
      const book = getBook(me.id, r.book_id);
      if (!book) throw new HttpError(404, 'That book is no longer on your shelves.');
      if (openLoan(book.data)) throw new HttpError(409, `It's lent to ${openLoan(book.data).to} right now. Mark it back first.`);
      const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(body.dueOn || '') ? body.dueOn : null;
      book.data.loans = [...(book.data.loans || []), { to: borrower?.display_name || 'Someone', lentOn: today(), dueOn, returnedOn: null }];
      saveBook(me.id, book.id, book.data);
      const reply = cleanText(body.reply, 500) || null;
      set('lent', { reply, dueOn });
      notify(r.requester_id, 'borrow', { title: `${me.display_name} said yes!`, body: `You can borrow ${snap.title}${dueOn ? ` until ${dueOn}` : ''}.${reply ? ` "${reply}"` : ''}`, url: '/?section=borrow', tag: `borrow-${id}` });
    } else if (action === 'decline') {
      if (!isOwner) throw new HttpError(403, 'Only the owner can answer this.');
      if (r.status !== 'pending') throw new HttpError(409, 'That request was already answered.');
      const reply = cleanText(body.reply, 500) || null;
      set('declined', { reply });
      notify(r.requester_id, 'borrow', { title: `${me.display_name} can't lend ${snap.title} right now`, body: reply || 'Maybe another time.', url: '/?section=borrow', tag: `borrow-${id}` });
    } else if (action === 'cancel') {
      if (!isRequester) throw new HttpError(403, 'Only the person who asked can cancel.');
      if (r.status !== 'pending') throw new HttpError(409, 'That request was already answered.');
      set('cancelled');
    } else if (action === 'returned') {
      if (!isOwner) throw new HttpError(403, 'Only the owner can mark it returned.');
      if (r.status !== 'lent') throw new HttpError(409, "That book isn't out.");
      const book = getBook(me.id, r.book_id);
      if (book) {
        book.data.loans = (book.data.loans || []).map(l => (!l.returnedOn && l.to === borrower?.display_name ? { ...l, returnedOn: today() } : l));
        saveBook(me.id, book.id, book.data);
      }
      set('returned');
    } else {
      throw new HttpError(404, 'Not found.');
    }
    return routes['GET /api/borrow'](req);
  };

  const handle = async (req, pathname) => {
    const m = pathname.match(/^\/api\/borrow\/([0-9a-f-]{36})\/(accept|decline|cancel|returned)$/);
    if (m && req.method === 'POST') return act(req, m[1], m[2]);
    return null;
  };

  return { routes, handle };
}
