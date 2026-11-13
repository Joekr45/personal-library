// All communication between the app and its server goes through here.

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    const err = new Error('Could not reach the server. Check your connection and try again.');
    err.status = 0;
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Server error (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  getSession: () => request('GET', '/api/auth/me'),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }).then(d => d.user),
  register: (email, password, displayName, inviteCode) =>
    request('POST', '/api/auth/register', { email, password, displayName, inviteCode }).then(d => d.user),
  logout: () => request('POST', '/api/auth/logout'),

  listBooks: () => request('GET', '/api/books').then(d => d.books),
  createBook: (book) => request('POST', '/api/books', book).then(d => d.book),
  updateBook: (id, changes) => request('PUT', `/api/books/${encodeURIComponent(id)}`, changes).then(d => d.book),
  deleteBook: (id) => request('DELETE', `/api/books/${encodeURIComponent(id)}`)
};

// Catalog lookups (done by our server, which checks Open Library and Google Books)
api.lookupCode = (code) => request('GET', `/api/lookup/isbn/${encodeURIComponent(code)}`);
api.searchCatalog = (title, author) =>
  request('GET', `/api/lookup/search?${new URLSearchParams({ title: title || '', author: author || '' })}`).then(d => d.results);

// Covers
api.getCoverOptions = ({ isbn, workKey, title, author, language }) =>
  request('GET', `/api/lookup/covers?${new URLSearchParams({
    isbn: isbn || '', workKey: workKey || '', title: title || '', author: author || '', language: language || ''
  })}`);
// choice: { url } to save a picture from the web, or { imageData } for a photo from the phone
api.saveCover = (bookId, choice) =>
  request('POST', `/api/books/${encodeURIComponent(bookId)}/cover`, choice).then(d => d.book);

// Authors
api.searchAuthors = (q) => request('GET', `/api/authors/search?${new URLSearchParams({ q })}`).then(d => d.authors);
api.authorWorks = (key) => request('GET', `/api/authors/${encodeURIComponent(key)}/works`);
api.setAuthorBookHidden = (key, bookId, hidden) =>
  request('PUT', `/api/authors/${encodeURIComponent(key)}/hidden`, { bookId, hidden });

// Settings and series (Hardcover)
api.getSettings = () => request('GET', '/api/settings');
api.connectHardcover = (token) => request('PUT', '/api/settings/hardcover', { token }).then(d => d.hardcover);
api.disconnectHardcover = () => request('DELETE', '/api/settings/hardcover').then(d => d.hardcover);
api.findSeries = ({ isbn, title, author }) =>
  request('GET', `/api/series/find?${new URLSearchParams({ isbn: isbn || '', title: title || '', author: author || '' })}`);
api.seriesBooks = (id) => request('GET', `/api/series/${encodeURIComponent(id)}/books`);

// Account, data and owner tools
api.changePassword = (currentPassword, newPassword) => request('PUT', '/api/auth/password', { currentPassword, newPassword });
api.listUsers = () => request('GET', '/api/admin/users');
api.setSignups = (open) => request('PUT', '/api/admin/signups', { open }).then(d => d.signupsOpen);
api.resetUserPassword = (id, password) => request('POST', `/api/admin/users/${encodeURIComponent(id)}/password`, { password });
api.removeUser = (id) => request('DELETE', `/api/admin/users/${encodeURIComponent(id)}`);
api.listBackups = () => request('GET', '/api/admin/backups').then(d => d.backups);
api.backupNow = () => request('POST', '/api/admin/backups').then(d => d.backups);

// Reading goal
api.getGoal = (year) => request('GET', `/api/me/goal?year=${encodeURIComponent(year)}`);
api.setGoal = (year, goal) => request('PUT', '/api/me/goal', { year, goal });

// Family sharing
api.getSharing = () => request('GET', '/api/me/sharing').then(d => d.sharing);
api.setSharing = (sharing) => request('PUT', '/api/me/sharing', { sharing }).then(d => d.sharing);
api.family = () => request('GET', '/api/family');

// Import and new releases
api.bulkAdd = (books) => request('POST', '/api/books/bulk', { books });
api.newReleases = () => request('GET', '/api/new-releases');
api.dismissRelease = (id) => request('POST', '/api/new-releases/dismiss', { id });

// Invites (owner)
api.setSignupMode = (mode) => request('PUT', '/api/admin/signups', { mode });
api.listInvites = () => request('GET', '/api/admin/invites').then(d => d.invites);
api.createInvite = (note, days, circle) => request('POST', '/api/admin/invites', { note, days, circle });
api.setCircle = (userId, circle) => request('PUT', '/api/admin/circle', { userId, circle });
api.revokeInvite = (code) => request('DELETE', `/api/admin/invites/${encodeURIComponent(code)}`);

// Personal preferences (e.g. your public library for Libby)
api.getPrefs = () => request('GET', '/api/me/prefs').then(d => d.prefs);
api.setPrefs = (changes) => request('PUT', '/api/me/prefs', changes).then(d => d.prefs);

// Family reading challenges
api.challenges = () => request('GET', '/api/challenges').then(d => d.challenges);
api.createChallenge = (c) => request('POST', '/api/challenges', c).then(d => d.challenges);
api.joinChallenge = (id) => request('POST', `/api/challenges/${encodeURIComponent(id)}/join`).then(d => d.challenges);
api.leaveChallenge = (id) => request('POST', `/api/challenges/${encodeURIComponent(id)}/leave`).then(d => d.challenges);
api.deleteChallenge = (id) => request('DELETE', `/api/challenges/${encodeURIComponent(id)}`).then(d => d.challenges);

// Book info, people, feed, reviews, recommendations
api.fillBookInfo = (id) => request('POST', `/api/books/${encodeURIComponent(id)}/info`);
api.people = () => request('GET', '/api/people').then(d => d.people);
api.feed = () => request('GET', '/api/feed');
api.mySocial = () => request('GET', '/api/me/social');
api.setActivity = (on) => request('PUT', '/api/me/activity', { on }).then(d => d.activityOn);
api.reviews = ({ title, author, isbn }) => request('GET', `/api/reviews?${new URLSearchParams({ title: title || '', author: author || '', isbn: isbn || '' })}`).then(d => d.reviews);
api.recommendations = () => request('GET', '/api/recommendations');
api.recommend = (toUserId, book, note) => request('POST', '/api/recommendations', { toUserId, book, note });
api.answerRecommendation = (id, status) => request('POST', `/api/recommendations/${encodeURIComponent(id)}/${status}`);

// Book clubs and lists
api.clubs = () => request('GET', '/api/clubs').then(d => d.clubs);
api.club = (id) => request('GET', `/api/clubs/${encodeURIComponent(id)}`);
api.createClub = (name, book) => request('POST', '/api/clubs', { name, book }).then(d => d.club);
api.joinClub = (id) => request('POST', `/api/clubs/${encodeURIComponent(id)}/join`);
api.leaveClub = (id) => request('POST', `/api/clubs/${encodeURIComponent(id)}/leave`);
api.deleteClub = (id) => request('DELETE', `/api/clubs/${encodeURIComponent(id)}`).then(d => d.clubs);
api.postToClub = (id, text, page) => request('POST', `/api/clubs/${encodeURIComponent(id)}/posts`, { text, page });
api.deleteClubPost = (id, postId) => request('DELETE', `/api/clubs/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}`);
api.lists = () => request('GET', '/api/lists').then(d => d.lists);
api.createList = (list) => request('POST', '/api/lists', list).then(d => d.list);
api.updateList = (id, changes) => request('PUT', `/api/lists/${encodeURIComponent(id)}`, changes).then(d => d.list);
api.deleteList = (id) => request('DELETE', `/api/lists/${encodeURIComponent(id)}`);

// Reading log, gifts, discover, follows, wishlist checks
api.readingLog = () => request('GET', '/api/me/reading-log');
api.logMinutes = (minutes, day) => request('POST', '/api/me/reading-log', { minutes, day });
api.setReadingGoal = (minutes) => request('PUT', '/api/me/reading-goal', { minutes }).then(d => d.goal);
api.familyReadingTime = () => request('GET', '/api/family/reading-time');
api.gifts = () => request('GET', '/api/gifts');
api.setGiftSharing = (on) => request('PUT', '/api/me/gift-sharing', { on }).then(d => d.sharing);
api.claimGift = (bookId) => request('POST', `/api/gifts/${encodeURIComponent(bookId)}/claim`);
api.unclaimGift = (bookId) => request('DELETE', `/api/gifts/${encodeURIComponent(bookId)}/claim`);
api.discover = () => request('GET', '/api/discover');
api.follows = () => request('GET', '/api/me/follows').then(d => d.authors);
api.setFollow = (name, follow, key) => request('PUT', '/api/me/follows', { name, follow, key }).then(d => d.authors);
api.wishlistCheck = () => request('GET', '/api/wishlist/check');
api.runWishlistCheck = () => request('POST', '/api/wishlist/check');
api.fixAuthors = () => request('POST', '/api/books/fix-authors');
