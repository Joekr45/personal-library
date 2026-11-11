// Looks books up in online catalogs and combines what they say.
//
// Sources (checked at the same time):
//  - Open Library (openlibrary.org): free, huge, great for older books and covers, slow to add new releases.
//  - Google Books: free, good for new releases. Works without a key; set GOOGLE_BOOKS_API_KEY for higher limits.
//
// Results are cached in memory for a day so repeated lookups are instant and we stay polite to the catalogs.

import { isbn13to10 as isbn13ToIsbn10 } from '../shared/isbn.js';

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

// Catalog language tags are often missing or wrong (a Spanish translation tagged as English,
// or not tagged at all), so we also look at the title itself.
const FOREIGN_WORDS = new Set([
  // Spanish / Portuguese
  'el', 'los', 'las', 'del', 'una', 'unos', 'y', 'por', 'para', 'con', 'sin', 'sobre', 'entre', 'hasta', 'como', 'mundo',
  'um', 'uma', 'dos', 'das', 'na', 'nas', 'nos', 'em', 'pelo', 'pela', 'sem',
  // French
  'le', 'les', 'des', 'du', 'et', 'une', 'dans', 'sur', 'pour', 'avec', 'sans', 'aux', 'au', 'est',
  // German
  'der', 'das', 'und', 'ein', 'eine', 'einer', 'im', 'vom', 'zum', 'zur', 'mit', 'von', 'aus', 'auf', 'nicht', 'ist', 'dem', 'den',
  // Italian
  'il', 'lo', 'gli', 'della', 'delle', 'dei', 'di', 'nel', 'nella', 'senza', 'per', 'tra', 'fra',
  // Dutch / Scandinavian
  'het', 'een', 'van', 'op', 'och', 'att', 'af', 'og', 'til', 'fra', 'med', 'ikke', 'och', 'av', 'paa', 'pa',
  // shared
  'la', 'de', 'en', 'un'
]);
const ENGLISH_WORDS = new Set([
  'the', 'of', 'and', 'to', 'for', 'from', 'with', 'by', 'at', 'is', 'are', 'was', 'my', 'your', 'his', 'her', 'their',
  'our', 'into', 'over', 'under', 'after', 'before', 'without', 'night', 'day', 'man', 'world', 'time', 'love', 'house',
  'war', 'fire', 'water', 'blood', 'dead', 'death', 'last', 'first', 'black', 'white', 'secret', 'lies', 'lie', 'down',
  'key', 'eye', 'needle', 'fall', 'giants', 'winter', 'edge', 'eternity', 'evening', 'morning', 'column', 'code', 'zero'
]);

export function looksEnglish(title, languages) {
  const text = String(title || '');
  // Other alphabets: Cyrillic, Greek, Hebrew, Arabic, Asian scripts…
  if (/[\u0370-\u03ff\u0400-\u04ff\u0590-\u06ff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) return false;
  if (Array.isArray(languages) && languages.length > 0 && !languages.includes('eng')) return false;
  const words = text.toLowerCase().replace(/['’]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foreign = words.filter(w => FOREIGN_WORDS.has(w)).length;
  const english = words.filter(w => ENGLISH_WORDS.has(w)).length;
  const accented = /[àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿœßğış]/i.test(text);
  if (accented && english === 0) return false;
  if (foreign > 0 && foreign >= english) return false;
  return true;
}

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

  // ---------- cover choices ----------

  const findWorkKey = async (title, author) => {
    if (!title) return null;
    const params = new URLSearchParams({ title, limit: '1', fields: 'key' });
    if (author) params.set('author', author);
    const data = await getJson(`https://openlibrary.org/search.json?${params}`);
    return data?.docs?.[0]?.key || null;
  };

  const yearOf = (date) => (String(date || '').match(/\d{4}/) || [null])[0];

  // Every cover we can find for a book: first the exact edition (by ISBN), then other
  // editions of the same book from Open Library and Google Books, each labelled with its
  // language, year and publisher so the right one can be picked.
  const getCoverOptions = ({ isbn13 = '', workKey = '', title = '', author = '', language = '' }) =>
    cached(`covers:${isbn13}|${workKey}|${title.toLowerCase()}|${author.toLowerCase()}`, async () => {
      const options = [];
      const seen = new Set();
      const add = (option) => {
        if (!option.url || seen.has(option.url)) return;
        seen.add(option.url);
        options.push(option);
      };

      let edition = null;
      if (isbn13) {
        edition = await lookupIsbn(isbn13, isbn13ToIsbn10(isbn13));
        const editionCovers = edition?.covers || [];
        // Open Library serves the same picture by cover number and by ISBN; show it once.
        const hasNumberedCover = editionCovers.some(c => c.url.includes('/b/id/'));
        for (const c of editionCovers.filter(c => !(hasNumberedCover && c.url.includes('/b/isbn/')))) {
          add({
            url: c.url,
            source: c.source,
            thisEdition: true,
            language: edition.language,
            year: yearOf(edition.publishedDate),
            publisher: edition.publisher,
            format: edition.format,
            isbn13
          });
        }
      }

      const bookTitle = title || edition?.title || '';
      const bookAuthor = author || edition?.authors?.[0] || '';
      const key = workKey || edition?.workKey || (await findWorkKey(bookTitle, bookAuthor));

      const [olEditions, google] = await Promise.all([
        key ? getJson(`https://openlibrary.org${key}/editions.json?limit=100`) : null,
        bookTitle ? getJson(googleUrl(`intitle:${bookTitle}${bookAuthor ? ` inauthor:${bookAuthor}` : ''}`, '&maxResults=20&printType=books')) : null
      ]);

      for (const e of olEditions?.entries || []) {
        const coverId = (e.covers || []).find(id => id > 0);
        if (!coverId) continue;
        add({
          url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
          source: 'Open Library',
          thisEdition: Boolean(isbn13 && (e.isbn_13 || []).includes(isbn13)),
          language: languageName(e.languages?.[0]?.key),
          year: yearOf(e.publish_date),
          publisher: (e.publishers || [])[0] || null,
          format: e.physical_format || null,
          isbn13: (e.isbn_13 || [])[0] || null,
          title: e.title || null
        });
      }

      const wantedTitle = normalizeTitle(bookTitle);
      for (const item of google?.items || []) {
        const v = item.volumeInfo || {};
        // Only other editions of the same book (Google's search is loose)
        if (wantedTitle && !normalizeTitle(v.title).startsWith(wantedTitle) && !wantedTitle.startsWith(normalizeTitle(v.title))) continue;
        const url = googleCover(v.imageLinks);
        if (!url) continue;
        const ids = v.industryIdentifiers || [];
        const itemIsbn = ids.find(i => i.type === 'ISBN_13')?.identifier || null;
        add({
          url,
          source: 'Google Books',
          thisEdition: Boolean(isbn13 && itemIsbn === isbn13),
          language: languageName(v.language),
          year: yearOf(v.publishedDate),
          publisher: v.publisher || null,
          format: null,
          isbn13: itemIsbn,
          title: v.title || null
        });
      }

      const preferred = language || edition?.language || 'English';
      const rank = (o) => (o.thisEdition ? 0 : o.language === preferred ? 1 : !o.language ? 2 : 3);
      const sorted = options
        .map((o, i) => ({ o, i }))
        .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
        .map(({ o }) => o)
        .slice(0, 48);
      const languages = [...new Set(sorted.map(o => o.language).filter(Boolean))];
      return sorted.length ? { options: sorted, languages, workKey: key || null } : null;
    });

  // ---------- authors ----------

  // Find authors by name. Several people can share a name, so return a short list to pick from.
  const searchAuthors = (name) => cached(`authors:${name.toLowerCase()}`, async () => {
    const data = await getJson(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=10`);
    return (data?.docs || [])
      .filter(d => d.key && d.name)
      .map(d => ({
        key: String(d.key).replace('/authors/', ''),
        name: d.name,
        birthDate: d.birth_date || null,
        deathDate: d.death_date || null,
        topWork: d.top_work || null,
        workCount: d.work_count || 0
      }))
      .sort((a, b) => b.workCount - a.workCount);
  });

  // Titles that are not really "a book by this author": box sets, study guides, summaries...
  const JUNK_TITLE = /\b(box(ed)?[\s-]*set|\d+[\s-]*books?[\s-]*(set|collection|bundle)|books?\s+\d+\s*[-–&]\s*\d+|(study|reading|reader'?s|teacher'?s)\s+guide|summary|summaries|sparknotes|cliff'?s?\s*notes|analysis of|unofficial|trivia|quiz|workbook|colou?ring book|calendar|(audio|e)[\s-]?book|unabridged|large print)\b/i;

  // The main part of a title, used to spot the same book listed twice
  // ("Fall of Giants: Book One of the Century Trilogy" -> "fallofgiants").
  const mainTitleKey = (title) => normalizeTitle(String(title || '').split(/\s*[:(\[]\s*|\s+[-–—]\s+/)[0]);

  const isEnglishOrUnknown = (langs) => !Array.isArray(langs) || langs.length === 0 || langs.includes('eng');

  // Everything an author wrote, one entry per book, newest releases included.
  const authorWorks = (authorKey) => cached(`works:${authorKey}`, async () => {
    const author = await getJson(`https://openlibrary.org/authors/${authorKey}.json`);
    const name = author?.name || author?.personal_name || '';

    // "lang=en" asks Open Library to pick each work's English edition when there is one, and
    // "editions.*" returns that edition's title and language.
    const fields = 'key,title,subtitle,first_publish_year,cover_i,edition_count,language,author_key,author_name,editions,editions.title,editions.language';
    const pages = await Promise.all([1, 2].map(page =>
      getJson(`https://openlibrary.org/search.json?author_key=${encodeURIComponent(authorKey)}&fields=${fields}&lang=en&limit=500&page=${page}&sort=old`)
    ));
    const docs = pages.flatMap(p => p?.docs || []);

    const google = name
      ? await getJson(googleUrl(`inauthor:"${name}"`, '&maxResults=40&orderBy=newest&printType=books'))
      : null;

    const books = new Map();
    const addBook = (entry) => {
      if (!entry.title || JUNK_TITLE.test(entry.title) || JUNK_TITLE.test(entry.subtitle || '')) return;
      const key = mainTitleKey(entry.title);
      if (!key) return;
      const existing = books.get(key);
      if (!existing) {
        books.set(key, entry);
        return;
      }
      // Same book listed twice: keep the best details from both.
      if (!existing.sources.includes(entry.sources[0])) existing.sources.push(entry.sources[0]);
      if (entry.year && (!existing.year || entry.year < existing.year)) existing.year = entry.year;
      if (entry.editionCount > existing.editionCount) {
        existing.cover = entry.cover || existing.cover;
        existing.workKey = entry.workKey || existing.workKey;
        existing.title = entry.title.length < existing.title.length ? entry.title : existing.title;
      }
      existing.editionCount = Math.max(existing.editionCount, entry.editionCount);
      existing.cover = existing.cover || entry.cover;
      existing.workKey = existing.workKey || entry.workKey;
      existing.isbn13 = existing.isbn13 || entry.isbn13;
      existing.coAuthors = existing.coAuthors.length ? existing.coAuthors : entry.coAuthors;
    };

    for (const d of docs) {
      // Translations that Open Library lists as separate works (no English edition) are skipped;
      // they appear as editions when choosing a cover instead.
      const edition = d.editions?.docs?.[0];
      const editionLangs = (edition?.language || []).map(l => String(l).replace('/languages/', ''));
      let title = d.title;
      if (editionLangs.length > 0) {
        // Open Library told us which edition it would show: trust its language.
        if (!editionLangs.includes('eng')) continue;
        title = edition.title || d.title;
        if (!looksEnglish(title, ['eng'])) continue;
      } else if (!isEnglishOrUnknown(d.language) || !looksEnglish(d.title, d.language)) {
        continue;
      }
      addBook({
        id: String(d.key || '').replace('/works/', ''),
        workKey: d.key || null,
        title,
        subtitle: d.subtitle || null,
        year: d.first_publish_year ? String(d.first_publish_year) : null,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        editionCount: d.edition_count || 0,
        isbn13: null,
        coAuthors: (d.author_name || []).filter(n => n !== name),
        sources: ['Open Library']
      });
    }

    const surname = (n) => String(n || '').toLowerCase().split(/\s+/).pop();
    for (const item of google?.items || []) {
      const v = item.volumeInfo || {};
      // Only books actually credited to this author, in English
      if (!(v.authors || []).some(a => surname(a) === surname(name) && a.toLowerCase().includes(name.toLowerCase().split(/\s+/)[0]))) continue;
      if ((v.language && v.language !== 'en') || !looksEnglish(v.title)) continue;
      addBook({
        id: `g-${item.id}`,
        workKey: null,
        title: v.title,
        subtitle: v.subtitle || null,
        year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
        cover: googleCover(v.imageLinks),
        editionCount: 0,
        isbn13: (v.industryIdentifiers || []).find(i => i.type === 'ISBN_13')?.identifier || null,
        coAuthors: (v.authors || []).filter(a => surname(a) !== surname(name)),
        sources: ['Google Books']
      });
    }

    const list = Array.from(books.values())
      // A book only one obscure catalog record knows about, with no year, is usually noise.
      .filter(b => b.year || b.cover || b.editionCount > 1 || b.sources.length > 1)
      .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    if (!name && list.length === 0) return null;
    return {
      author: { key: authorKey, name, birthDate: author?.birth_date || null, deathDate: author?.death_date || null },
      books: list
    };
  });

  return { lookupIsbn, searchBooks, getCoverOptions, searchAuthors, authorWorks };
}
