// Looks books up in online catalogs and combines what they say.
//
// Sources (checked at the same time):
//  - Open Library (openlibrary.org): free, huge, great for older books and covers, slow to add new releases.
//  - Google Books: free, good for new releases. Works without a key; set GOOGLE_BOOKS_API_KEY for higher limits.
//
// Results are cached in memory for a day so repeated lookups are instant and we stay polite to the catalogs.

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const LANGUAGE_NAMES = {
  eng: 'English', en: 'English',
  spa: 'Spanish', es: 'Spanish',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  ita: 'Italian', it: 'Italian',
  por: 'Portuguese', pt: 'Portuguese',
  dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
  heb: 'Hebrew', he: 'Hebrew', iw: 'Hebrew',
  rus: 'Russian', ru: 'Russian',
  jpn: 'Japanese', ja: 'Japanese',
  chi: 'Chinese', zho: 'Chinese', zh: 'Chinese',
  pol: 'Polish', pl: 'Polish',
  swe: 'Swedish', sv: 'Swedish'
};

export function languageName(code) {
  if (!code) return null;
  const key = String(code).replace('/languages/', '').toLowerCase().split('-')[0];
  return LANGUAGE_NAMES[key] || key.toUpperCase();
}

const https = (url) => (url ? String(url).replace(/^http:\/\//, 'https://') : url);

// Google's thumbnails come with a curled-page effect and a tiny size; ask for a cleaner, bigger one.
const googleCover = (imageLinks) => {
  const url = imageLinks?.thumbnail || imageLinks?.smallThumbnail;
  if (!url) return null;
  return https(url).replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=1');
};

export const normalizeTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // é -> e
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]/g, '');

const authorKey = (name) => {
  const parts = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s.,]+/).filter(Boolean);
  return parts[parts.length - 1] || '';
};

export function createLookup({ fetchImpl = globalThis.fetch, googleApiKey = '' } = {}) {
  const cache = new Map();

  const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    // Don't remember "nothing found" — it may just mean a catalog was briefly unreachable.
    if (value === null || (Array.isArray(value) && value.length === 0)) return value;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  };

  // Fetch JSON, giving up after a few seconds. Returns null on any problem so one slow or
  // broken catalog never stops the others from answering.
  const getJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PersonalLibrary/1.0 (self-hosted book tracker)' }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const googleUrl = (query, extra = '') =>
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}${extra}` +
    (googleApiKey ? `&key=${encodeURIComponent(googleApiKey)}` : '');

  // ---------- ISBN lookup ----------

  const openLibraryByIsbn = async (isbn13, isbn10) => {
    const keys = [`ISBN:${isbn13}`, ...(isbn10 ? [`ISBN:${isbn10}`] : [])];
    const data = await getJson(`https://openlibrary.org/api/books?bibkeys=${keys.join(',')}&format=json&jscmd=details`);
    const entry = data && keys.map(k => data[k]).find(Boolean);
    const d = entry?.details;
    if (!d || !d.title) return null;

    let authors = (d.authors || []).map(a => a.name).filter(Boolean);
    if (authors.length === 0 && Array.isArray(d.authors) && d.authors.length > 0) {
      // Some records only link to the author; fetch their names.
      const found = await Promise.all(d.authors.slice(0, 3).map(a => a.key ? getJson(`https://openlibrary.org${a.key}.json`) : null));
      authors = found.map(a => a?.name).filter(Boolean);
    }
    if (authors.length === 0 && d.by_statement) authors = [String(d.by_statement).replace(/^by\s+/i, '').replace(/[.;]\s*$/, '')];

    const covers = [];
    (d.covers || []).filter(id => id > 0).forEach(id => covers.push({ url: `https://covers.openlibrary.org/b/id/${id}-L.jpg`, source: 'Open Library' }));
    covers.push({ url: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`, source: 'Open Library' });

    return {
      source: 'Open Library',
      title: d.title,
      subtitle: d.subtitle || null,
      authors,
      publisher: (d.publishers || [])[0] || null,
      publishedDate: d.publish_date || null,
      language: languageName(d.languages?.[0]?.key),
      pageCount: d.number_of_pages || null,
      format: d.physical_format || null,
      description: null,
      workKey: d.works?.[0]?.key || null,
      editionKey: d.key || null,
      covers
    };
  };

  const googleByIsbn = async (isbn13, isbn10) => {
    const data = await getJson(googleUrl(`isbn:${isbn13}`));
    // Google sometimes returns loosely related books; only accept one whose ISBN really matches.
    const item = (data?.items || []).find(it =>
      (it.volumeInfo?.industryIdentifiers || []).some(id => id.identifier === isbn13 || (isbn10 && id.identifier === isbn10))
    );
    const v = item?.volumeInfo;
    if (!v || !v.title) return null;
    const cover = googleCover(v.imageLinks);
    return {
      source: 'Google Books',
      title: v.title,
      subtitle: v.subtitle || null,
      authors: v.authors || [],
      publisher: v.publisher || null,
      publishedDate: v.publishedDate || null,
      language: languageName(v.language),
      pageCount: v.pageCount || null,
      format: null,
      description: v.description || null,
      workKey: null,
      editionKey: null,
      covers: cover ? [{ url: cover, source: 'Google Books' }] : []
    };
  };

  const lookupIsbn = (isbn13, isbn10) => cached(`isbn:${isbn13}`, async () => {
    const [ol, google] = await Promise.all([openLibraryByIsbn(isbn13, isbn10), googleByIsbn(isbn13, isbn10)]);
    if (!ol && !google) return null;
    const first = (field) => (ol && ol[field]) || (google && google[field]) || null;
    const seen = new Set();
    const covers = [...(ol?.covers || []), ...(google?.covers || [])].filter(c => !seen.has(c.url) && seen.add(c.url));
    return {
      title: first('title'),
      subtitle: first('subtitle'),
      authors: (ol?.authors?.length ? ol.authors : google?.authors) || [],
      publisher: first('publisher'),
      publishedDate: first('publishedDate'),
      language: first('language') || 'English',
      pageCount: first('pageCount'),
      format: first('format'),
      description: google?.description || null,
      workKey: first('workKey'),
      editionKey: first('editionKey'),
      isbn13,
      isbn10: isbn10 || null,
      covers,
      sources: [ol && 'Open Library', google && 'Google Books'].filter(Boolean)
    };
  });

  // ---------- title / author search ----------

  const openLibrarySearch = async (title, author) => {
    const params = new URLSearchParams({
      limit: '20',
      fields: 'key,title,subtitle,author_name,first_publish_year,cover_i,edition_count,isbn,language'
    });
    if (title) params.set('title', title);
    if (author) params.set('author', author);
    const data = await getJson(`https://openlibrary.org/search.json?${params}`);
    return (data?.docs || []).filter(d => d.title).map(d => ({
      source: 'Open Library',
      title: d.title,
      subtitle: d.subtitle || null,
      authors: d.author_name || [],
      year: d.first_publish_year ? String(d.first_publish_year) : null,
      publisher: null,
      isbn13: null, // a work has many editions; the exact ISBN is chosen when scanning or editing
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      workKey: d.key || null,
      popularity: d.edition_count || 0,
      language: Array.isArray(d.language) && d.language.includes('eng') ? 'English' : languageName(d.language?.[0]) || null
    }));
  };

  const googleSearch = async (title, author) => {
    const parts = [];
    if (title) parts.push(`intitle:${title}`);
    if (author) parts.push(`inauthor:${author}`);
    const data = await getJson(googleUrl(parts.join(' '), '&maxResults=20&printType=books'));
    return (data?.items || []).filter(it => it.volumeInfo?.title).map(it => {
      const v = it.volumeInfo;
      const ids = v.industryIdentifiers || [];
      return {
        source: 'Google Books',
        title: v.title,
        subtitle: v.subtitle || null,
        authors: v.authors || [],
        year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
        publisher: v.publisher || null,
        isbn13: ids.find(i => i.type === 'ISBN_13')?.identifier || null,
        cover: googleCover(v.imageLinks),
        workKey: null,
        popularity: 0,
        language: languageName(v.language)
      };
    });
  };

  const searchBooks = ({ title = '', author = '' }) => {
    title = title.trim();
    author = author.trim();
    return cached(`search:${title.toLowerCase()}|${author.toLowerCase()}`, async () => {
      const [ol, google] = await Promise.all([openLibrarySearch(title, author), googleSearch(title, author)]);

      // Combine results that are the same book (same title and same author surname).
      const merged = new Map();
      for (const r of [...ol, ...google]) {
        const key = `${normalizeTitle(r.title)}|${authorKey(r.authors[0])}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...r, sources: [r.source] });
          continue;
        }
        if (!existing.sources.includes(r.source)) existing.sources.push(r.source);
        existing.isbn13 = existing.isbn13 || r.isbn13;
        existing.cover = existing.cover || r.cover;
        existing.publisher = existing.publisher || r.publisher;
        existing.workKey = existing.workKey || r.workKey;
        existing.popularity = Math.max(existing.popularity, r.popularity);
        // Prefer the earliest year (first publication)
        if (r.year && (!existing.year || r.year < existing.year)) existing.year = r.year;
        if (existing.authors.length === 0) existing.authors = r.authors;
      }

      const wanted = normalizeTitle(title);
      const score = (r) =>
        (wanted && normalizeTitle(r.title) === wanted ? 1000 : 0) +
        (wanted && normalizeTitle(r.title).startsWith(wanted) ? 200 : 0) +
        (r.language === 'English' || !r.language ? 100 : 0) +
        (r.cover ? 50 : 0) +
        (r.sources.length > 1 ? 30 : 0) +
        Math.min(r.popularity, 100);

      return Array.from(merged.values())
        .sort((a, b) => score(b) - score(a))
        .slice(0, 20)
        .map(({ popularity, source, ...rest }) => rest);
    });
  };

  return { lookupIsbn, searchBooks };
}
