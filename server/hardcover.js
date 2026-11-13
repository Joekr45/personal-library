// Talks to Hardcover (hardcover.app), which has much better series information than the
// free catalogs. Needs the library owner's personal API code (from hardcover.app/account/api),
// which is stored on the server only.
//
// Hardcover's API is GraphQL at https://api.hardcover.app/v1/graphql, limited to 60 requests a
// minute and to shallow queries, so every query here is at most three levels deep.

const ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class HardcoverError extends Error {}

// People paste the code with or without the word "Bearer" in front.
export const cleanToken = (token) => String(token || '').trim().replace(/^bearer\s+/i, '').trim();

const normalizeTitle = (title) =>
  String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');

export function createHardcover({ getToken, fetchImpl = globalThis.fetch }) {
  const cache = new Map();

  const query = async (gql, variables = {}, tokenOverride) => {
    const token = cleanToken(tokenOverride ?? getToken());
    if (!token) throw new HardcoverError('Hardcover is not connected.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'PersonalLibrary/1.0 (self-hosted book tracker)'
        },
        body: JSON.stringify({ query: gql, variables })
      });
    } catch {
      throw new HardcoverError('Could not reach Hardcover. Please try again later.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new HardcoverError('Hardcover did not accept the API code. It may be mistyped or expired.');
    if (res.status === 429) throw new HardcoverError('Hardcover is busy (too many requests). Please wait a minute and try again.');
    let data;
    try {
      data = await res.json();
    } catch {
      throw new HardcoverError(`Hardcover sent an unexpected answer (status ${res.status}).`);
    }
    if (data?.errors?.length) {
      const message = data.errors.map(e => e.message).join('; ');
      if (/jwt|token|auth/i.test(message)) throw new HardcoverError('Hardcover did not accept the API code. It may be mistyped or expired.');
      throw new HardcoverError(`Hardcover: ${message}`);
    }
    return data?.data || {};
  };

  const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  };

  // Check a code works. The app only needs catalog access (Hardcover's "read:catalog" permission),
  // so the check is a tiny catalog lookup. The username is shown if the key is allowed to read it.
  // Author names for an ISBN (used when the other catalogs don't know the author).
  const authorsByIsbn = async (isbn13) => {
    if (!cleanToken(getToken())) return [];
    return cached(`authors:${isbn13}`, async () => {
      const data = await query(`query ($isbn: String!) {
        editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) {
          book { title cached_contributors }
        }
      }`, { isbn: isbn13 });
      const contributors = data?.editions?.[0]?.book?.cached_contributors || [];
      return contributors
        .filter(c => !c?.contribution || /author/i.test(c.contribution))
        .map(c => c?.author?.name)
        .filter(Boolean);
    });
  };

  const testToken = async (token) => {
    await query('query { books(limit: 1) { id } }', {}, token);
    try {
      const data = await query('query { me { username } }', {}, token);
      const me = Array.isArray(data.me) ? data.me[0] : data.me;
      return me?.username || null;
    } catch {
      return null; // key works for the catalog but can't see the account — that's fine
    }
  };

  // A book can belong to several series (e.g. a main series and a "complete collection").
  // Pick the main one: a whole-number position, the first listed.
  const pickSeries = (bookSeries) => {
    const withPosition = (bookSeries || []).filter(bs => bs?.series?.id && bs.position !== null && bs.position !== undefined);
    const main = withPosition.find(bs => Number.isInteger(Number(bs.position))) || withPosition[0];
    return main ? { id: main.series.id, name: main.series.name, position: Number(main.position) } : null;
  };

  const BOOK_FIELDS = 'id title book_series { position series { id name } }';

  // Find which series a book belongs to, by ISBN first, then by title and author.
  const findSeries = ({ isbn13, isbn10, title, author }) =>
    cached(`find:${isbn13}|${normalizeTitle(title)}|${String(author || '').toLowerCase()}`, async () => {
      if (isbn13 || isbn10) {
        const ors = [];
        if (isbn13) ors.push({ isbn_13: { _eq: isbn13 } });
        if (isbn10) ors.push({ isbn_10: { _eq: isbn10 } });
        const data = await query(
          `query ($where: books_bool_exp!) { books(where: $where, limit: 3, order_by: { users_count: desc }) { ${BOOK_FIELDS} } }`,
          { where: { editions: { _or: ors } } }
        );
        for (const book of data.books || []) {
          const found = pickSeries(book.book_series);
          if (found) return found;
        }
      }
      if (title) {
        const surname = String(author || '').split(',')[0].trim().split(/\s+/).pop();
        const where = { title: { _eq: title } };
        if (surname) where.contributions = { author: { name: { _ilike: `%${surname}%` } } };
        const data = await query(
          `query ($where: books_bool_exp!) { books(where: $where, limit: 3, order_by: { users_count: desc }) { ${BOOK_FIELDS} } }`,
          { where }
        );
        for (const book of data.books || []) {
          const found = pickSeries(book.book_series);
          if (found) return found;
        }
      }
      return null;
    });

  // All the books in a series, in reading order. Hardcover may list several books at one
  // position (translations, special editions); the most popular one is kept.
  const seriesBooks = (seriesId) => cached(`series:${seriesId}`, async () => {
    const data = await query(
      `query ($id: Int!) {
        series(where: { id: { _eq: $id } }, limit: 1) {
          id
          name
          book_series(where: { position: { _is_null: false } }, order_by: { position: asc }) {
            position
            book { id title release_year users_count compilation }
          }
        }
      }`,
      { id: Number(seriesId) }
    );
    const series = (data.series || [])[0];
    if (!series) return null;

    const byPosition = new Map();
    for (const bs of series.book_series || []) {
      const position = Number(bs.position);
      const book = bs.book;
      // Main books only: whole-number positions, no omnibus/compilation volumes.
      if (!book || !Number.isInteger(position) || position <= 0 || book.compilation) continue;
      const current = byPosition.get(position);
      if (!current || (book.users_count || 0) > (current.users_count || 0)) byPosition.set(position, book);
    }
    const ids = Array.from(byPosition.values()).map(b => b.id);

    // Covers come from a second, shallow query.
    const covers = new Map();
    if (ids.length) {
      try {
        const coverData = await query(
          'query ($ids: [Int!]) { books(where: { id: { _in: $ids } }) { id image { url } } }',
          { ids }
        );
        for (const b of coverData.books || []) if (b.image?.url) covers.set(b.id, b.image.url);
      } catch {
        // covers are optional
      }
    }

    return {
      id: series.id,
      name: series.name,
      books: Array.from(byPosition.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([position, b]) => ({
          position,
          hardcoverId: b.id,
          title: b.title,
          year: b.release_year ? String(b.release_year) : null,
          cover: covers.get(b.id) || null
        }))
    };
  });

  return { testToken, findSeries, seriesBooks, authorsByIsbn, clearCache: () => cache.clear() };
}
