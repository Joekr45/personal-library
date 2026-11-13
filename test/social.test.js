// Checks for the feed, reviews, recommendations, clubs, lists, reading log, gifts, discovery,
// followed authors, wishlist checks and book info (catalogs are replaced by sample answers).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { localDay } from '../server/social.js';

const reply = (body) => ({ ok: true, status: 200, json: async () => body });
const notFound = { ok: false, status: 404, json: async () => ({}) };
const fakeFetch = async (url) => {
  url = String(url);
  if (url.includes('openlibrary.org/works/OL45W.json')) {
    return reply({ description: { value: 'A young woman marries a widower and moves to Manderley.' }, subjects: ['Fiction', 'Gothic fiction', 'Accessible book', 'Psychological fiction', 'nyt:bestsellers'] });
  }
  if (url.includes('openlibrary.org/works/OL45W/ratings.json')) return reply({ summary: { average: 4.1, count: 120 } });
  if (url.includes('googleapis.com/books/v1/volumes') && url.includes('filter=ebooks')) {
    return reply({ items: [{ volumeInfo: { title: 'Wanted Book', authors: ['Ann Author'] }, saleInfo: { saleability: 'FOR_SALE', retailPrice: { amount: 4.99, currencyCode: 'USD' }, buyLink: 'https://play.google.com/x' } }] });
  }
  if (url.includes('googleapis.com/books/v1/volumes') && url.includes('subject')) {
    return reply({ items: [
      { id: 'g1', volumeInfo: { title: 'Jamaica Inn', authors: ['Daphne du Maurier'], language: 'en', categories: ['Fiction'] } },
      { id: 'g2', volumeInfo: { title: 'Rebecca', authors: ['Daphne du Maurier'], language: 'en' } }
    ] });
  }
  if (url.includes('googleapis.com/books/v1/volumes') && url.includes('orderBy=newest')) {
    return reply({ items: [{ id: 'n1', volumeInfo: { title: 'Brand New Novel', authors: ['Followed Writer'], language: 'en', publishedDate: localDay() } }] });
  }
  if (url.includes('googleapis.com/books/v1/volumes') && url.includes('isbn%3A9780380730407')) {
    return reply({ items: [{ volumeInfo: { title: 'Rebecca', authors: ['Daphne du Maurier'], description: '<p>Last night I dreamt&hellip;</p>', categories: ['Fiction / Gothic'], averageRating: 4, ratingsCount: 30 } }] });
  }
  if (url.includes('thunder.api.overdrive.com/v2/libraries/nypl/media')) {
    return reply({ items: [{ title: 'Wanted Book', firstCreatorName: 'Ann Author', isAvailable: true, type: { name: 'eBook' } }, { title: 'Wanted Book', firstCreatorName: 'Ann Author', isAvailable: false, estimatedWaitDays: 14, type: { name: 'Audiobook' } }] });
  }
  return notFound;
};

let server, base, dataDir, mom, kid, pal;
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const addBook = async (cookie, book) => (await call('POST', '/api/books', { editions: [], ...book }, cookie)).body.book;
const update = async (cookie, id, changes) => (await call('PUT', `/api/books/${id}`, changes, cookie)).body.book;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-social-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'open', fetchImpl: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email, displayName) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName })
  })).headers.get('set-cookie').split(';')[0];
  mom = await register('mom@example.com', 'Mom'); // Owner, family
  kid = await register('kid@example.com', 'Kid');
  pal = await register('pal@example.com', 'Pal'); // stays a Friend (open sign-up)
  const people = (await call('GET', '/api/admin/users', undefined, mom)).body.users;
  await call('PUT', '/api/admin/circle', { userId: people.find(u => u.displayName === 'Kid').id, circle: 'family' }, mom);
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('new book fields are cleaned up (DNF, moods, pace, review, updates, target price)', async () => {
  const b = await addBook(kid, {
    workTitle: 'Odd Book', author: 'X', readingStatus: 'Weird', moods: ['Dark', 'dark', ' tense ', ''], pace: 'zippy',
    warnings: ['Violence'], review: { text: '  ', public: true }, updates: [{ page: 'x', text: '' }, { page: 12, text: 'ok', on: '2026-01-02' }],
    targetPrice: '5.50', genres: ['Thriller', 'thriller'], communityRating: { average: 9 }
  });
  assert.equal(b.readingStatus, 'Unread');
  assert.deepEqual(b.moods, ['Dark', 'tense']);
  assert.equal(b.pace, null);
  assert.equal(b.review, null);
  assert.deepEqual(b.updates, [{ page: 12, text: 'ok', on: '2026-01-02' }]);
  assert.equal(b.targetPrice, 5.5);
  assert.deepEqual(b.genres, ['Thriller']);
  assert.equal(b.communityRating, null);
  const dnf = await update(kid, b.id, { readingStatus: 'DNF', dnfOn: '2026-11-01' });
  assert.equal(dnf.readingStatus, 'DNF');
});

test('activity feed: events for started, update, finished, review; hidden when turned off', async () => {
  const b = await addBook(mom, { workTitle: 'Rebecca', author: 'Daphne du Maurier', readingStatus: 'Unread', editions: [{ isbn: '9780380730407', pageCount: 400 }] });
  await update(mom, b.id, { readingStatus: 'Reading' });
  await update(mom, b.id, { currentPage: 120, updates: [{ page: 120, text: 'So creepy!', on: '2026-11-10' }] });
  await update(mom, b.id, { readingStatus: 'Completed', rating: 5, dateFinished: '2026-11-12' });
  await update(mom, b.id, { review: { text: 'A gothic masterpiece.', public: true } });
  await update(mom, b.id, { notes: 'private notes do not make events' });

  const feed = (await call('GET', '/api/feed', undefined, pal)).body;
  const moms = feed.items.filter(i => i.user.displayName === 'Mom').map(i => i.type);
  assert.deepEqual(moms, ['reviewed', 'finished', 'update', 'started', 'added']);
  const upd = feed.items.find(i => i.type === 'update');
  assert.deepEqual(upd.detail, { page: 120, pages: 400, text: 'So creepy!' });
  assert.equal(feed.items.find(i => i.type === 'finished').detail.rating, 5);
  assert.match(upd.book.cover, /covers\.openlibrary\.org\/b\/isbn\/9780380730407/);

  // Mom turns her activity off: others no longer see it, she still sees her own.
  assert.equal((await call('PUT', '/api/me/activity', { on: false }, mom)).body.activityOn, false);
  assert.equal((await call('GET', '/api/feed', undefined, pal)).body.items.filter(i => i.user.displayName === 'Mom').length, 0);
  assert.ok((await call('GET', '/api/feed', undefined, mom)).body.items.some(i => i.isMe));
  await call('PUT', '/api/me/activity', { on: true }, mom);
  assert.deepEqual((await call('GET', '/api/me/social', undefined, mom)).body, { activityOn: true, giftSharing: false });
});

test('reviews: public reviews and ratings from people you know, private ones stay private', async () => {
  const k = await addBook(kid, { workTitle: 'Rebecca (Virago Modern Classics)', author: 'Daphne Du Maurier', readingStatus: 'Completed', rating: 3, review: { text: 'Secret thoughts', public: false } });
  const r = (await call('GET', '/api/reviews?title=Rebecca&author=Daphne%20du%20Maurier', undefined, pal)).body.reviews;
  const byName = Object.fromEntries(r.map(x => [x.user.displayName, x]));
  assert.equal(byName.Mom.text, 'A gothic masterpiece.');
  assert.equal(byName.Mom.rating, 5);
  assert.equal(byName.Kid.text, null, 'private review not shown');
  assert.equal(byName.Kid.rating, 3);
  await call('PUT', '/api/me/activity', { on: false }, kid);
  assert.equal((await call('GET', '/api/reviews?title=Rebecca&author=du%20Maurier', undefined, pal)).body.reviews.some(x => x.user.displayName === 'Kid'), false);
  await call('PUT', '/api/me/activity', { on: true }, kid);
  await call('DELETE', `/api/books/${k.id}`, undefined, kid);
});

test('recommendations: send, receive, add or dismiss', async () => {
  const people = (await call('GET', '/api/people', undefined, mom)).body.people;
  assert.deepEqual(people.map(p => [p.displayName, p.circle]), [['Kid', 'family'], ['Pal', 'friend']]);
  const palId = people.find(p => p.displayName === 'Pal').id;
  assert.equal((await call('POST', '/api/recommendations', { toUserId: palId, book: { title: 'Rebecca', author: 'Daphne du Maurier', cover: 'javascript:x' }, note: 'You will love it' }, mom)).status, 201);
  assert.equal((await call('POST', '/api/recommendations', { toUserId: palId, book: { title: '' } }, mom)).status, 400);
  const inbox = (await call('GET', '/api/recommendations', undefined, pal)).body.inbox;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].from.displayName, 'Mom');
  assert.equal(inbox[0].book.cover, null, 'unsafe links dropped');
  assert.equal((await call('POST', `/api/recommendations/${inbox[0].id}/added`, undefined, kid)).status, 404, 'only the recipient');
  const after = (await call('POST', `/api/recommendations/${inbox[0].id}/added`, undefined, pal)).body;
  assert.equal(after.inbox.length, 0);
  assert.equal((await call('GET', '/api/recommendations', undefined, mom)).body.sent[0].status, 'added');
});

test('book clubs: progress from each member\'s copy, posts need membership, delete rules', async () => {
  const made = (await call('POST', '/api/clubs', { name: 'Gothic buddies', book: { title: 'Rebecca', author: 'Daphne du Maurier' } }, mom)).body.club;
  assert.equal(made.joined, true);
  assert.equal(made.members[0].status, 'Completed');
  assert.equal(made.members[0].page, 400);
  const id = made.id;
  assert.equal((await call('POST', `/api/clubs/${id}/posts`, { text: 'hi' }, pal)).status, 403);
  await call('POST', `/api/clubs/${id}/join`, undefined, pal);
  const posted = (await call('POST', `/api/clubs/${id}/posts`, { text: 'The ending!', page: 380 }, pal)).body;
  assert.equal(posted.posts.length, 1);
  assert.equal(posted.posts[0].page, 380);
  const club = (await call('GET', `/api/clubs/${id}`, undefined, mom)).body;
  assert.equal(club.club.members.find(m => m.displayName === 'Pal').status, null, "Pal doesn't have the book");
  assert.equal(club.posts[0].canDelete, true, 'the Owner can remove posts');
  assert.equal((await call('DELETE', `/api/clubs/${id}`, undefined, pal)).status, 403);
  assert.equal((await call('DELETE', `/api/clubs/${id}/posts/${posted.posts[0].id}`, undefined, pal)).status, 200);
  assert.deepEqual((await call('DELETE', `/api/clubs/${id}`, undefined, mom)).body.clubs, []);
});

test('lists: private ones are yours, public ones everyone can see, only the maker edits', async () => {
  const priv = (await call('POST', '/api/lists', { name: 'Secret list', items: [{ title: 'A', author: 'B' }] }, kid)).body.list;
  const pub = (await call('POST', '/api/lists', { name: 'Beach reads', isPublic: true, items: [{ title: 'Rebecca', author: 'du Maurier', note: 'perfect' }, { title: '' }] }, kid)).status;
  assert.equal(pub, 400, 'every item needs a title and author');
  const okPub = (await call('POST', '/api/lists', { name: 'Beach reads', isPublic: true, items: [{ title: 'Rebecca', author: 'du Maurier', note: 'perfect' }] }, kid)).body.list;
  const seen = (await call('GET', '/api/lists', undefined, pal)).body.lists;
  assert.deepEqual(seen.map(l => l.name), ['Beach reads']);
  assert.equal(seen[0].owner.displayName, 'Kid');
  assert.equal(seen[0].mine, false);
  assert.equal((await call('GET', `/api/lists/${priv.id}`, undefined, pal)).status, 404);
  assert.equal((await call('PUT', `/api/lists/${okPub.id}`, { name: 'Mine now' }, pal)).status, 403);
  const changed = (await call('PUT', `/api/lists/${okPub.id}`, { items: [...okPub.items, { title: 'Jamaica Inn', author: 'du Maurier' }] }, kid)).body.list;
  assert.equal(changed.items.length, 2);
  assert.equal((await call('DELETE', `/api/lists/${priv.id}`, undefined, kid)).status, 200);
});

test('reading log, streaks and the family reading-time board (family only)', async () => {
  const today = localDay();
  const day = (n) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
  await call('POST', '/api/me/reading-log', { minutes: 20, day: day(2) }, kid);
  await call('POST', '/api/me/reading-log', { minutes: 15, day: day(1) }, kid);
  let log = (await call('POST', '/api/me/reading-log', { minutes: 30 }, kid)).body;
  assert.equal(log.days.find(d => d.day === today).minutes, 30);
  assert.equal(log.streak.current, 3);
  assert.ok(log.streak.longest >= 3);
  log = (await call('POST', '/api/me/reading-log', { minutes: -50 }, kid)).body;
  assert.equal(log.days.find(d => d.day === today).minutes, 0, 'never below zero');
  assert.equal(log.streak.current, 2, 'today no longer counts, but yesterday keeps the streak alive');
  assert.equal((await call('POST', '/api/me/reading-log', { minutes: 'lots' }, kid)).status, 400);
  assert.equal((await call('PUT', '/api/me/reading-goal', { minutes: 30 }, kid)).body.goal, 30);
  assert.equal((await call('GET', '/api/me/reading-log', undefined, kid)).body.goal, 30);
  assert.equal((await call('GET', '/api/family/reading-time', undefined, pal)).status, 403);
  const board = (await call('GET', '/api/family/reading-time', undefined, mom)).body.board;
  assert.deepEqual(board.map(b => b.displayName).sort(), ['Kid', 'Mom']);
});

test('gift ideas: family only, opt-in, and the wishlist owner never sees who is buying', async () => {
  const wish = await addBook(kid, { workTitle: 'Wanted Book', author: 'Ann Author', owned: false });
  assert.deepEqual((await call('GET', '/api/gifts', undefined, mom)).body.members, [], 'not shared yet');
  assert.equal((await call('PUT', '/api/me/gift-sharing', { on: true }, pal)).status, 403);
  await call('PUT', '/api/me/gift-sharing', { on: true }, kid);
  await call('PUT', '/api/me/gift-sharing', { on: true }, mom);
  let gifts = (await call('GET', '/api/gifts', undefined, mom)).body;
  assert.deepEqual(gifts.members.map(m => m.displayName), ['Kid']);
  assert.equal(gifts.members[0].wishlist[0].title, 'Wanted Book');
  gifts = (await call('POST', `/api/gifts/${wish.id}/claim`, undefined, mom)).body;
  assert.equal(gifts.members[0].wishlist[0].claimedByMe, true);
  assert.equal((await call('POST', `/api/gifts/${wish.id}/claim`, undefined, kid)).status, 404, "can't claim your own");
  const kidView = (await call('GET', '/api/gifts', undefined, kid)).body;
  assert.ok(!JSON.stringify(kidView).includes(wish.id), "Kid's own wishlist isn't in Kid's gift view");
  assert.equal((await call('GET', '/api/gifts', undefined, pal)).status, 403);
  gifts = (await call('DELETE', `/api/gifts/${wish.id}/claim`, undefined, mom)).body;
  assert.equal(gifts.members[0].wishlist[0].claimedBy, null);
});

test('wishlist check: library availability (Libby) and ebook price', async () => {
  await call('PUT', '/api/me/prefs', { libbyLibrary: 'nypl' }, kid);
  const result = (await call('POST', '/api/wishlist/check', undefined, kid)).body;
  const entry = Object.values(result.results)[0];
  assert.equal(entry.library.available, true);
  assert.deepEqual(entry.library.formats.map(f => [f.type, f.available, f.waitDays]), [['eBook', true, null], ['Audiobook', false, 14]]);
  assert.equal(entry.price.amount, 4.99);
  assert.ok((await call('GET', '/api/wishlist/check', undefined, kid)).body.checkedAt);
});

test('book info: description, genres and readers\' rating are filled in once', async () => {
  const b = await addBook(pal, { workTitle: 'Rebecca', author: 'Daphne du Maurier', workKey: '/works/OL45W', editions: [{ isbn: '0380730405' }] });
  const res = (await call('POST', `/api/books/${b.id}/info`, undefined, pal)).body;
  assert.equal(res.found, true);
  assert.equal(res.book.description, 'Last night I dreamt…');
  assert.deepEqual(res.book.genres, ['Gothic', 'Gothic Fiction', 'Psychological Fiction']);
  assert.deepEqual(res.book.communityRating, { average: 4.1, count: 120, source: 'Open Library' });
  assert.equal(res.book.infoCheckedOn, localDay());
  assert.equal((await call('POST', `/api/books/${b.id}/info`, undefined, kid)).status, 404, 'only your own books');
});

test('discover: books people you know loved, and more in your favourite genres', async () => {
  // Pal rated Rebecca (with genres) highly; Kid owns nothing by du Maurier.
  const palsBooks = (await call('GET', '/api/books', undefined, pal)).body.books;
  await update(pal, palsBooks.find(b => b.workTitle === 'Rebecca').id, { rating: 5, readingStatus: 'Completed' });
  const d = (await call('GET', '/api/discover', undefined, kid)).body;
  const reb = d.loved.find(x => x.title === 'Rebecca');
  assert.deepEqual(reb.by.map(x => x.name).sort(), ['Mom', 'Pal']);
  const palD = (await call('GET', '/api/discover', undefined, pal)).body;
  assert.ok(palD.genresKnown);
  const titles = palD.byGenre.flatMap(g => g.books.map(b => b.title));
  assert.ok(titles.includes('Jamaica Inn'));
  assert.ok(!titles.includes('Rebecca'), 'books you have are left out');
});

test('following an author adds their new books to New for You', async () => {
  const follows = (await call('PUT', '/api/me/follows', { name: 'Followed Writer' }, pal)).body.authors;
  assert.deepEqual(follows.map(a => a.name), ['Followed Writer']);
  const releases = (await call('GET', '/api/new-releases', undefined, pal)).body.releases;
  const r = releases.find(x => x.title === 'Brand New Novel');
  assert.match(r.reason, /you follow/);
  assert.deepEqual((await call('PUT', '/api/me/follows', { name: 'followed writer', follow: false }, pal)).body.authors, []);
});
