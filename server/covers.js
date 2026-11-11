// Saving book covers on the server, so they never break or change because a website moved them.
// Covers are stored as image files in DATA_DIR/covers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1000; // smaller than this is a "no cover" placeholder, not a real cover
const DOWNLOAD_TIMEOUT_MS = 10000;

export class CoverError extends Error {}

// Work out the image type from its first bytes (never trust the file name or the website).
export function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString())) return 'gif';
  return null;
}

export const COVER_CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// Refuse to download from addresses inside the home network (so a pasted link can't be
// used to poke at the router or other servers).
export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

const defaultResolve = async (hostname) => (await dns.lookup(hostname, { all: true })).map(r => r.address);

export function createCoverStore({ dataDir, fetchImpl = globalThis.fetch, resolveHost = defaultResolve }) {
  const dir = path.join(dataDir, 'covers');
  fs.mkdirSync(dir, { recursive: true });

  const checkUrl = async (rawUrl) => {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new CoverError('That image link is not a valid web address.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CoverError('Image links must start with https://');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [host] : await resolveHost(host).catch(() => []);
    if (addresses.length === 0) throw new CoverError('Could not find that website.');
    if (addresses.some(isPrivateAddress)) throw new CoverError('Images can only be downloaded from public websites.');
    return url;
  };

  const download = async (rawUrl) => {
    let url = await checkUrl(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      for (let hop = 0; hop < 5; hop++) {
        const res = await fetchImpl(url.href, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'PersonalLibrary/1.0 (self-hosted book tracker)' }
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          url = await checkUrl(new URL(res.headers.get('location'), url).href);
          continue;
        }
        if (!res.ok) throw new CoverError('That cover image could not be downloaded.');
        const declared = Number(res.headers.get('content-length') || 0);
        if (declared > MAX_IMAGE_BYTES) throw new CoverError('That image is too large (over 5 MB).');
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES) throw new CoverError('That image is too large (over 5 MB).');
        return buffer;
      }
      throw new CoverError('That image link redirects too many times.');
    } catch (err) {
      if (err instanceof CoverError) throw err;
      throw new CoverError('That cover image could not be downloaded.');
    } finally {
      clearTimeout(timer);
    }
  };

  const store = (buffer) => {
    const type = detectImageType(buffer);
    if (!type) throw new CoverError('That file is not a picture (JPEG, PNG, WebP or GIF).');
    if (buffer.length < MIN_IMAGE_BYTES) throw new CoverError('There is no cover image at that address.');
    const file = `${crypto.randomUUID()}.${type}`;
    fs.writeFileSync(path.join(dir, file), buffer);
    return file;
  };

  return {
    // Save a cover from a web address; returns the stored file name.
    async saveFromUrl(url) {
      return store(await download(url));
    },
    // Save a photo sent from the browser as a "data:image/...;base64,..." string.
    saveFromDataUrl(dataUrl) {
      const match = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
      if (!match) throw new CoverError('The photo could not be read. Please try another picture.');
      return store(Buffer.from(match[1], 'base64'));
    },
    filePath(file) {
      if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(file)) return null;
      const full = path.join(dir, file);
      return fs.existsSync(full) ? full : null;
    },
    remove(file) {
      const full = file && this.filePath(file);
      if (full) fs.rmSync(full, { force: true });
    }
  };
}
