// The "people" side of the library: activity feed, recommendations, reviews, book clubs,
// lists, reading log & streaks, gift ideas, discovery, followed authors and wishlist checks.
//
// Who sees what:
//  - Everyone with an account (family and friends): the activity feed (of people who leave it on),
//    shared reviews, recommendations, book clubs and public lists.
//  - Family only: gift ideas (wishlists) and the family reading-time board.
import crypto from 'node:crypto';

const DAY_MS = 86400000;
// Today's date (YYYY-MM-DD) in the server's time zone (TZ in Docker).
export const localDay = (d = new Date()) => d.toLocaleDateString('en-CA');
const addDays = (day, n) => localDay(new Date(Date.parse(`${day}T12:00:00`) + n * DAY_MS));
const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };

export function createSocial(ctx) {
  const { db, requireUser, requireFamily, readJson, HttpError, cleanText, getSetting, setSetting, lookup } = ctx;

  // ----- helpers -----
  const surname = (author) => String(author || '').split(',')[0].trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).pop() || '';
  const bookKey = (title, author) => `${lookup.mainTitleKey(title)}|${surname(author)}`;
  const realIsbn = (b) => (b.editions || []).map(e => String(e.isbn || '').replace(/[^0-9X]/gi, '')).find(i => i.length === 13 || i.length === 10) || null;
  // A small, shareable picture of a book (saved covers stay private to the family, so use a public one).
  const snapshot = (b, bookId) => {
    const isbn = realIsbn(b);
    const external = /^https:\/\//.test(b.customCoverUrl || '') ? b.customCoverUrl : null;
    return {
      title: b.workTitle, author: b.author, isbn, bookId: bookId || null,
      cover: external || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null)
    };
  };
  const cleanBook = (b) => {
    const title = cleanText(b?.title, 300);
    const author = cleanText(b?.author, 200);
    if (!title || !author) throw new HttpError(400, 'Which book?');
    const cover = cleanText(b?.cover, 1000);
    return {
      title, author,
      isbn: cleanText(b?.isbn, 20).replace(/[^0-9X]/gi, '') || null,
      cover: /^https:\/\//.test(cover) ? cover : null,
      workKey: /^\/works\/OL\d+W$/.test(b?.workKey || '') ? b.workKey : null
    };
  };
  const users = () => new Map(db.prepare('SELECT id, display_name, color, circle, role FROM users').all().map(u => [u.id, u]));
  const person = (u) => (u ? { id: u.id, displayName: u.display_name, color: u.color } : null);
  const activityOn = (userId) => getSetting(`activity:${userId}`) !== 'off';
  const booksOf = (userId) => db.prepare('SELECT id, data FROM books WHERE user_id = ?').all(userId).map(r => ({ id: r.id, ...json(r.data, {}) }));
  const markReadingDay = (userId, day = localDay()) =>
    db.prepare('INSERT OR IGNORE INTO reading_days (user_id, day) VALUES (?, ?)').run(userId, day);

  const addActivity = (userId, type, book, detail = null) => {
    db.prepare('INSERT INTO activity (id, user_id, type, book_id, book, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), userId, type, book.bookId || null, JSON.stringify(book), detail ? JSON.stringify(detail) : null);
  };

  // Called whenever someone adds or changes a book: writes feed events and marks reading days.
  const recordBookChange = (userId, before, after, bookId) => {
    const snap = snapshot(after, bookId);
    const was = before?.readingStatus;
    const now = after.readingStatus;
    if (!before && after.owned !== false && now !== 'Completed') addActivity(userId, 'added', snap);
    if (!before && after.owned === false) addActivity(userId, 'wishlisted', snap);
    if (now === 'Reading' && was !== 'Reading') addActivity(userId, 'started', snap);
    if (now === 'Completed' && was !== 'Completed') {
      addActivity(userId, 'finished', snap, { rating: after.rating || null });
      // Adding a book you finished long ago isn't reading today; finishing one you had is.
      if (before) markReadingDay(userId);
    }
    if (now === 'DNF' && was !== 'DNF') addActivity(userId, 'dnf', snap);
    if (before && was === 'Completed' && now === 'Completed' && after.rating && after.rating !== before.rating) {
      addActivity(userId, 'rated', snap, { rating: after.rating });
    }
    const review = after.review;
    if (review?.public && review.text && (!before?.review?.public || before.review.text !== review.text)) {
      addActivity(userId, 'reviewed', snap, { rating: after.rating || null, text: review.text.slice(0, 600) });
    }
    const newUpdates = (after.updates || []).length - (before?.updates || []).length;
    if (before && newUpdates > 0) {
      const u = after.updates[after.updates.length - 1];
      const pages = Number(after.editions?.[0]?.pageCount) || null;
      addActivity(userId, 'update', snap, { page: u.page, pages, text: u.text });
      markReadingDay(userId);
    }
    if (before && Number(after.currentPage) > Number(before.currentPage || 0)) markReadingDay(userId);
  };

  // ----- streaks -----
  const streaks = (userId) => {
    const days = new Set([
      ...db.prepare('SELECT day FROM reading_days WHERE user_id = ?').all(userId).map(r => r.day),
      ...db.prepare('SELECT day FROM reading_log WHERE user_id = ? AND minutes > 0').all(userId).map(r => r.day)
    ]);
    const sorted = [...days].sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const d of sorted) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    // The current streak can still continue today if you read yesterday.
    const today = localDay();
    let current = 0;
    let cursor = days.has(today) ? today : addDays(today, -1);
    while (days.has(cursor)) { current++; cursor = addDays(cursor, -1); }
    return { current, longest, days: sorted.filter(d => d >= addDays(today, -365)) };
  };

  // ----- clubs -----
  const clubView = (club, me, all = users()) => {
    const book = json(club.book, {});
    const key = bookKey(book.title, book.author);
    const members = db.prepare('SELECT user_id FROM club_members WHERE club_id = ? ORDER BY joined_at').all(club.id).map(({ user_id }) => {
      const u = all.get(user_id);
      if (!u) return null;
      const theirs = booksOf(user_id).find(b => bookKey(b.workTitle, b.author) === key);
      const pages = Number(theirs?.editions?.[0]?.pageCount) || null;
      return {
        ...person(u), isMe: u.id === me.id,
        status: theirs ? theirs.readingStatus || 'Unread' : null,
        page: theirs?.readingStatus === 'Completed' ? pages : Number(theirs?.currentPage) || null,
        pages
      };
    }).filter(Boolean);
    return {
      id: club.id, name: club.name, book, createdAt: club.created_at,
      createdBy: person(all.get(club.created_by))?.displayName || null,
      canDelete: club.created_by === me.id || me.role === 'Owner',
      joined: members.some(m => m.isMe),
      postCount: db.prepare('SELECT COUNT(*) AS n FROM club_posts WHERE club_id = ?').get(club.id).n,
      members
    };
  };
  const getClub = (id) => {
    const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);
    if (!club) throw new HttpError(404, 'That book club no longer exists.');
    return club;
  };

  // ----- lists -----
  const listView = (row, me, all = users()) => ({
    id: row.id, name: row.name, description: row.description, isPublic: Boolean(row.is_public),
    items: json(row.items, []), updatedAt: row.updated_at, owner: person(all.get(row.user_id)), mine: row.user_id === me.id
  });
  const cleanItems = (items) => (Array.isArray(items) ? items : []).slice(0, 500).map(it => {
    const b = cleanBook(it);
    return { ...b, note: cleanText(it?.note, 500) || null };
  });

  // ----- gifts -----
  const giftSharing = (userId) => getSetting(`giftshare:${userId}`) === 'true';

  // ----- wishlist checks (library availability and ebook prices) -----
  const checkWishlist = async (userId) => {
    const prefs = json(getSetting(`prefs:${userId}`) || '{}', {});
    const wish = booksOf(userId).filter(b => b.owned === false).slice(0, 60);
    const results = {};
    for (const b of wish) {
      const isbn13 = realIsbn(b)?.length === 13 ? realIsbn(b) : '';
      const [library, price] = await Promise.all([
        prefs.libbyLibrary ? lookup.libraryAvailability({ library: prefs.libbyLibrary, title: b.workTitle, author: b.author }) : null,
        lookup.ebookPrice({ isbn13, title: b.workTitle, author: b.author })
      ]);
      results[b.id] = { library, price };
    }
    const saved = { checkedAt: new Date().toISOString(), library: prefs.libbyLibrary || null, results };
    setSetting(`wishcheck:${userId}`, JSON.stringify(saved));
    return saved;
  };
  // Once a day, for everyone with a wishlist.
  const checkAllWishlists = async () => {
    for (const { id } of db.prepare('SELECT id FROM users').all()) {
      if (booksOf(id).some(b => b.owned === false)) await checkWishlist(id).catch(() => {});
    }
  };

  const routes = {
    // People you can recommend books to or see in clubs.
    'GET /api/people': (req) => {
      const me = requireUser(req);
      const list = [...users().values()].filter(u => u.id !== me.id).map(u => ({ ...person(u), circle: u.circle === 'friend' ? 'friend' : 'family' }));
      return { status: 200, body: { people: list } };
    },

    // ----- activity feed -----
    'GET /api/feed': (req) => {
      const me = requireUser(req);
      const all = users();
      const rows = db.prepare('SELECT * FROM activity ORDER BY created_at DESC, rowid DESC LIMIT 400').all()
        .filter(r => r.user_id === me.id || activityOn(r.user_id)).slice(0, 150);
      return {
        status: 200,
        body: {
          activityOn: activityOn(me.id),
          items: rows.map(r => ({
            id: r.id, type: r.type, at: `${r.created_at.replace(' ', 'T')}Z`, user: person(all.get(r.user_id)), isMe: r.user_id === me.id,
            book: json(r.book, {}), detail: json(r.detail, null)
          })).filter(i => i.user)
        }
      };
    },
    'GET /api/me/social': (req) => {
      const me = requireUser(req);
      return { status: 200, body: { activityOn: activityOn(me.id), giftSharing: me.circle !== 'friend' && giftSharing(me.id) } };
    },
    'PUT /api/me/activity': async (req) => {

      const me = requireUser(req);
      const on = (await readJson(req)).on !== false;
      setSetting(`activity:${me.id}`, on ? 'on' : 'off');
      return { status: 200, body: { activityOn: on } };
    },

    // ----- reviews and ratings from people you know, for one book -----
    'GET /api/reviews': (req) => {
      const me = requireUser(req);
      const q = new URL(req.url, 'http://localhost').searchParams;
      const key = bookKey(q.get('title'), q.get('author'));
      const isbn = String(q.get('isbn') || '').replace(/[^0-9X]/gi, '');
      const all = users();
      const out = [];
      for (const u of all.values()) {
        if (u.id === me.id) continue;
        for (const b of booksOf(u.id)) {
          if (bookKey(b.workTitle, b.author) !== key && !(isbn && realIsbn(b) === isbn)) continue;
          const review = b.review?.public && b.review.text ? b.review : null;
          // Ratings show when the person shares their activity; written reviews when they made them public.
          if (!review && !(activityOn(u.id) && b.rating)) continue;
          out.push({ user: person(u), rating: activityOn(u.id) || review ? b.rating || null : null, text: review?.text || null, on: review?.updatedOn || null, status: b.readingStatus || null });
          break;
        }
      }
      return { status: 200, body: { reviews: out } };
    },

    // ----- recommendations -----
    'GET /api/recommendations': (req) => {
      const me = requireUser(req);
      const all = users();
      const view = (r) => ({ id: r.id, book: json(r.book, {}), note: r.note, status: r.status, at: `${r.created_at.replace(' ', 'T')}Z`, from: person(all.get(r.from_user)), to: person(all.get(r.to_user)) });
      return {
        status: 200,
        body: {
          inbox: db.prepare("SELECT * FROM recommendations WHERE to_user = ? AND status = 'new' ORDER BY created_at DESC").all(me.id).map(view),
          sent: db.prepare('SELECT * FROM recommendations WHERE from_user = ? ORDER BY created_at DESC LIMIT 50').all(me.id).map(view)
        }
      };
    },
    'POST /api/recommendations': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const to = db.prepare('SELECT id FROM users WHERE id = ?').get(String(body.toUserId || ''));
      if (!to || to.id === me.id) throw new HttpError(400, 'Who is it for?');
      const book = cleanBook(body.book);
      db.prepare('INSERT INTO recommendations (id, from_user, to_user, book, note) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), me.id, to.id, JSON.stringify(book), cleanText(body.note, 1000) || null);
      return { status: 201, body: { ok: true } };
    },

    // ----- book clubs -----
    'GET /api/clubs': (req) => {
      const me = requireUser(req);
      const all = users();
      return { status: 200, body: { clubs: db.prepare('SELECT * FROM clubs ORDER BY created_at DESC').all().map(c => clubView(c, me, all)) } };
    },
    'POST /api/clubs': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const name = cleanText(body.name, 80);
      if (!name) throw new HttpError(400, 'Give the club a name.');
      const book = cleanBook(body.book);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO clubs (id, name, book, created_by) VALUES (?, ?, ?, ?)').run(id, name, JSON.stringify(book), me.id);
      db.prepare('INSERT INTO club_members (club_id, user_id) VALUES (?, ?)').run(id, me.id);
      return { status: 201, body: { club: clubView(getClub(id), me) } };
    },

    // ----- lists -----
    'GET /api/lists': (req) => {
      const me = requireUser(req);
      const all = users();
      const rows = db.prepare('SELECT * FROM lists WHERE user_id = ? OR is_public = 1 ORDER BY updated_at DESC').all(me.id);
      return { status: 200, body: { lists: rows.map(r => listView(r, me, all)) } };
    },
    'POST /api/lists': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const name = cleanText(body.name, 100);
      if (!name) throw new HttpError(400, 'Give the list a name.');
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO lists (id, user_id, name, description, is_public, items) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, me.id, name, cleanText(body.description, 1000) || null, body.isPublic ? 1 : 0, JSON.stringify(cleanItems(body.items)));
      return { status: 201, body: { list: listView(db.prepare('SELECT * FROM lists WHERE id = ?').get(id), me) } };
    },

    // ----- reading log, streaks and stats -----
    'GET /api/me/reading-log': (req) => {
      const me = requireUser(req);
      const since = addDays(localDay(), -400);
      return {
        status: 200,
        body: {
          today: localDay(),
          goal: Number(getSetting(`readgoal:${me.id}`)) || 20,
          days: db.prepare('SELECT day, minutes FROM reading_log WHERE user_id = ? AND day >= ? ORDER BY day').all(me.id, since),
          streak: streaks(me.id)
        }
      };
    },
    // Add minutes read: { minutes, day? } (negative minutes fix a mistake)
    'POST /api/me/reading-log': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const minutes = Math.round(Number(body.minutes));
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) && body.day <= localDay() ? body.day : localDay();
      if (!Number.isFinite(minutes) || minutes === 0 || Math.abs(minutes) > 1440) throw new HttpError(400, 'How many minutes?');
      // Add to the day's total (taking minutes away to fix a mistake never goes below zero).
      const changed = db.prepare('UPDATE reading_log SET minutes = MIN(1440, MAX(0, minutes + ?)) WHERE user_id = ? AND day = ?').run(minutes, me.id, day);
      if (!changed.changes && minutes > 0) db.prepare('INSERT INTO reading_log (user_id, day, minutes) VALUES (?, ?, ?)').run(me.id, day, minutes);
      return routes['GET /api/me/reading-log'](req);
    },
    'PUT /api/me/reading-goal': async (req) => {
      const me = requireUser(req);
      const goal = Math.round(Number((await readJson(req)).minutes));
      if (!(goal >= 1 && goal <= 600)) throw new HttpError(400, 'Choose between 1 and 600 minutes a day.');
      setSetting(`readgoal:${me.id}`, String(goal));
      return { status: 200, body: { goal } };
    },
    // Family reading time this week (Monday to Sunday). Family only.
    'GET /api/family/reading-time': (req) => {
      const me = requireFamily(req);
      const today = localDay();
      const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7; // Monday = 0
      const start = addDays(today, -dow);
      const board = db.prepare("SELECT id, display_name, color FROM users WHERE circle != 'friend'").all().map(u => ({
        ...person(u), isMe: u.id === me.id,
        minutes: db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM reading_log WHERE user_id = ? AND day >= ? AND day <= ?').get(u.id, start, today).m,
        streak: streaks(u.id).current
      })).sort((a, b) => b.minutes - a.minutes);
      return { status: 200, body: { weekStart: start, board } };
    },

    // ----- gift ideas (family only) -----
    'GET /api/gifts': (req) => {
      const me = requireFamily(req);
      const all = users();
      const members = [...all.values()]
        .filter(u => u.id !== me.id && u.circle !== 'friend' && giftSharing(u.id))
        .map(u => ({
          ...person(u),
          wishlist: booksOf(u.id).filter(b => b.owned === false).map(b => {
            const claim = db.prepare('SELECT claimed_by FROM gift_claims WHERE book_id = ?').get(b.id);
            return {
              bookId: b.id, ...snapshot(b, b.id), series: b.series || null, seriesNumber: b.seriesNumber ?? null,
              claimedByMe: claim?.claimed_by === me.id,
              claimedBy: claim ? person(all.get(claim.claimed_by))?.displayName || 'Someone' : null
            };
          })
        }));
      return { status: 200, body: { sharing: giftSharing(me.id), members } };
    },
    'PUT /api/me/gift-sharing': async (req) => {
      const me = requireFamily(req);
      const on = (await readJson(req)).on === true;
      setSetting(`giftshare:${me.id}`, on ? 'true' : 'false');
      return { status: 200, body: { sharing: on } };
    },

    // ----- discover: loved by people you know, and more in genres you love -----
    'GET /api/discover': async (req) => {
      const me = requireUser(req);
      const mine = booksOf(me.id);
      const have = new Set(mine.map(b => lookup.mainTitleKey(b.workTitle)));
      const dismissed = new Set(json(getSetting(`dismissed:${me.id}`) || '[]', []));
      const all = users();
      const loved = new Map();
      for (const u of all.values()) {
        if (u.id === me.id || !activityOn(u.id)) continue;
        for (const b of booksOf(u.id)) {
          if (!(b.rating >= 4)) continue;
          const key = lookup.mainTitleKey(b.workTitle);
          if (have.has(key) || dismissed.has(`p-${key}`)) continue;
          const snap = snapshot(b);
          const entry = loved.get(key) || { id: `p-${key}`, title: b.workTitle, author: b.author, cover: snap.cover, isbn13: snap.isbn, by: [], best: 0 };
          entry.by.push({ name: u.display_name, rating: b.rating });
          entry.best = Math.max(entry.best, b.rating);
          loved.set(key, entry);
        }
      }
      // Your favourite genres: from books you rated 4+ (or finished, if you don't rate).
      const counts = new Map();
      for (const b of mine) {
        if (!(b.rating >= 4 || (!b.rating && b.readingStatus === 'Completed'))) continue;
        for (const g of b.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
      }
      const topGenres = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
      const byGenre = [];
      for (const genre of topGenres) {
        const books = (await lookup.booksInGenre(genre)).filter(x => !have.has(x.titleKey) && !dismissed.has(x.id)).slice(0, 10)
          .map(({ titleKey, ...x }) => x);
        if (books.length) byGenre.push({ genre, books });
      }
      return {
        status: 200,
        body: {
          loved: [...loved.values()].sort((a, b) => b.by.length - a.by.length || b.best - a.best).slice(0, 30).map(({ best, ...x }) => x),
          byGenre,
          genresKnown: counts.size > 0
        }
      };
    },

    // ----- authors you follow (their new books show in New for You) -----
    'GET /api/me/follows': (req) => {
      const me = requireUser(req);
      return { status: 200, body: { authors: json(getSetting(`follows:${me.id}`) || '[]', []) } };
    },
    'PUT /api/me/follows': async (req) => {
      const me = requireUser(req);
      const body = await readJson(req);
      const name = cleanText(body.name, 120);
      if (!name) throw new HttpError(400, 'Which author?');
      const list = json(getSetting(`follows:${me.id}`) || '[]', []).filter(a => a.name.toLowerCase() !== name.toLowerCase());
      if (body.follow !== false) list.push({ name, key: /^OL\d+A$/.test(body.key || '') ? body.key : null });
      setSetting(`follows:${me.id}`, JSON.stringify(list.slice(-200)));
      return { status: 200, body: { authors: list } };
    },

    // ----- wishlist: library availability and ebook prices -----
    'GET /api/wishlist/check': (req) => {
      const me = requireUser(req);
      return { status: 200, body: json(getSetting(`wishcheck:${me.id}`) || 'null', null) || { checkedAt: null, results: {} } };
    },
    'POST /api/wishlist/check': async (req) => {
      const me = requireUser(req);
      return { status: 200, body: await checkWishlist(me.id) };
    }
  };

  // Routes with an id in the address.
  const handle = async (req, pathname) => {
    const m = (re) => pathname.match(re);
    let r;
    if ((r = m(/^\/api\/recommendations\/([0-9a-f-]{36})\/(added|dismissed)$/)) && req.method === 'POST') {
      const me = requireUser(req);
      const changed = db.prepare("UPDATE recommendations SET status = ? WHERE id = ? AND to_user = ?").run(r[2], r[1], me.id);
      if (!changed.changes) throw new HttpError(404, 'Recommendation not found.');
      return routes['GET /api/recommendations'](req);
    }
    if ((r = m(/^\/api\/clubs\/([0-9a-f-]{36})$/))) {
      const me = requireUser(req);
      const club = getClub(r[1]);
      if (req.method === 'GET') {
        const all = users();
        const posts = db.prepare('SELECT * FROM club_posts WHERE club_id = ? ORDER BY created_at, rowid').all(club.id).map(p => ({
          id: p.id, text: p.text, page: p.page, at: `${p.created_at.replace(' ', 'T')}Z`, user: person(all.get(p.user_id)), mine: p.user_id === me.id,
          canDelete: p.user_id === me.id || me.role === 'Owner'
        }));
        return { status: 200, body: { club: clubView(club, me, all), posts } };
      }
      if (req.method === 'DELETE') {
        if (club.created_by !== me.id && me.role !== 'Owner') throw new HttpError(403, 'Only the person who started this club (or the Owner) can delete it.');
        db.prepare('DELETE FROM clubs WHERE id = ?').run(club.id);
        return routes['GET /api/clubs'](req);
      }
    }
    if ((r = m(/^\/api\/clubs\/([0-9a-f-]{36})\/(join|leave)$/)) && req.method === 'POST') {
      const me = requireUser(req);
      const club = getClub(r[1]);
      if (r[2] === 'join') db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id) VALUES (?, ?)').run(club.id, me.id);
      else db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, me.id);
      return { status: 200, body: { club: clubView(club, me) } };
    }
    if ((r = m(/^\/api\/clubs\/([0-9a-f-]{36})\/posts$/)) && req.method === 'POST') {
      const me = requireUser(req);
      const club = getClub(r[1]);
      if (!db.prepare('SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?').get(club.id, me.id)) throw new HttpError(403, 'Join the club to post.');
      const body = await readJson(req);
      const text = cleanText(body.text, 4000);
      if (!text) throw new HttpError(400, 'Write something first.');
      const page = Math.round(Number(body.page));
      db.prepare('INSERT INTO club_posts (id, club_id, user_id, text, page) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), club.id, me.id, text, page > 0 && page <= 100000 ? page : null);
      return handle({ ...req, method: 'GET', headers: req.headers, url: req.url }, `/api/clubs/${club.id}`);
    }
    if ((r = m(/^\/api\/clubs\/([0-9a-f-]{36})\/posts\/([0-9a-f-]{36})$/)) && req.method === 'DELETE') {
      const me = requireUser(req);
      const post = db.prepare('SELECT * FROM club_posts WHERE id = ? AND club_id = ?').get(r[2], r[1]);
      if (!post) throw new HttpError(404, 'Post not found.');
      if (post.user_id !== me.id && me.role !== 'Owner') throw new HttpError(403, 'You can only delete your own posts.');
      db.prepare('DELETE FROM club_posts WHERE id = ?').run(post.id);
      return handle({ ...req, method: 'GET', headers: req.headers, url: req.url }, `/api/clubs/${r[1]}`);
    }
    if ((r = m(/^\/api\/lists\/([0-9a-f-]{36})$/))) {
      const me = requireUser(req);
      const row = db.prepare('SELECT * FROM lists WHERE id = ?').get(r[1]);
      if (!row || (row.user_id !== me.id && !row.is_public)) throw new HttpError(404, 'List not found.');
      if (req.method === 'GET') return { status: 200, body: { list: listView(row, me) } };
      if (row.user_id !== me.id) throw new HttpError(403, 'Only the person who made this list can change it.');
      if (req.method === 'PUT') {
        const body = await readJson(req);
        const name = body.name !== undefined ? cleanText(body.name, 100) : row.name;
        if (!name) throw new HttpError(400, 'Give the list a name.');
        db.prepare("UPDATE lists SET name = ?, description = ?, is_public = ?, items = ?, updated_at = datetime('now') WHERE id = ?").run(
          name,
          body.description !== undefined ? cleanText(body.description, 1000) || null : row.description,
          body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : row.is_public,
          body.items !== undefined ? JSON.stringify(cleanItems(body.items)) : row.items,
          row.id
        );
        return { status: 200, body: { list: listView(db.prepare('SELECT * FROM lists WHERE id = ?').get(row.id), me) } };
      }
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM lists WHERE id = ?').run(row.id);
        return { status: 200, body: { ok: true } };
      }
    }
    if ((r = m(/^\/api\/gifts\/([0-9a-f-]{36})\/claim$/)) && (req.method === 'POST' || req.method === 'DELETE')) {
      const me = requireFamily(req);
      const book = db.prepare('SELECT user_id, data FROM books WHERE id = ?').get(r[1]);
      if (!book || book.user_id === me.id || !giftSharing(book.user_id) || json(book.data, {}).owned !== false) throw new HttpError(404, 'That book is not on a shared wishlist.');
      const claim = db.prepare('SELECT claimed_by FROM gift_claims WHERE book_id = ?').get(r[1]);
      if (req.method === 'POST') {
        if (claim && claim.claimed_by !== me.id) throw new HttpError(409, 'Someone else is already getting this one.');
        db.prepare('INSERT OR IGNORE INTO gift_claims (book_id, claimed_by) VALUES (?, ?)').run(r[1], me.id);
      } else if (claim?.claimed_by === me.id) {
        db.prepare('DELETE FROM gift_claims WHERE book_id = ?').run(r[1]);
      }
      return routes['GET /api/gifts'](req);
    }
    return null;
  };

  return { routes, handle, recordBookChange, streaks, checkAllWishlists, localDay };
}
