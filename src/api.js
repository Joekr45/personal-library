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
  register: (email, password, displayName) =>
    request('POST', '/api/auth/register', { email, password, displayName }).then(d => d.user),
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
