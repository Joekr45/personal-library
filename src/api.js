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
