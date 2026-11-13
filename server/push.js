// Phone/computer notifications ("Web Push"), with no extra packages.
//
// How it works: each browser that turns notifications on gives us a "subscription" (an address at
// Google/Mozilla/Apple's push service plus two keys). To notify it we encrypt a short message with
// those keys (RFC 8291, "aes128gcm") and send it there, signed with our own key (VAPID, RFC 8292).
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (text) => Buffer.from(String(text || ''), 'base64url');
const hkdf = (salt, ikm, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

// Encrypt a message for one subscription (RFC 8291). Exported for the tests.
export function encryptPayload(plaintext, { p256dh, auth }, { serverEcdh = null, salt = crypto.randomBytes(16) } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Bad subscription keys.');
  const ecdh = serverEcdh || crypto.createECDH('prime256v1');
  if (!serverEcdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export function createPush({ db, getSetting, setSetting, fetchImpl = globalThis.fetch, contact = 'mailto:admin@personal-library.local' }) {
  // Our signing key, made once and kept in the settings table.
  const vapid = () => {
    let saved = getSetting('vapid_keys');
    if (!saved) {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const jwk = publicKey.export({ format: 'jwk' });
      saved = JSON.stringify({
        privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
        publicRaw: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]))
      });
      setSetting('vapid_keys', saved);
    }
    return JSON.parse(saved);
  };
  const publicKey = () => vapid().publicRaw;

  const authorization = (endpoint) => {
    const { privatePem, publicRaw } = vapid();
    const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact }));
    const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: privatePem, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${header}.${claims}.${b64u(signature)}, k=${publicRaw}`;
  };

  const subscribe = (userId, sub) => {
    const endpoint = String(sub?.endpoint || '');
    const p256dh = String(sub?.keys?.p256dh || '');
    const auth = String(sub?.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || fromB64u(p256dh).length !== 65 || fromB64u(auth).length !== 16) {
      throw new Error('That notification subscription looks wrong.');
    }
    db.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(crypto.randomUUID(), userId, endpoint, p256dh, auth);
  };
  const unsubscribe = (userId, endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''));
  const devices = (userId) => db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;

  // What each person wants to hear about (all on by default except family activity).
  const DEFAULTS = { recommendations: true, clubs: true, overdue: true, newReleases: true, activity: false };
  const prefs = (userId) => ({ ...DEFAULTS, ...JSON.parse(getSetting(`notify:${userId}`) || '{}') });
  const setPrefs = (userId, changes) => {
    const next = prefs(userId);
    for (const k of Object.keys(DEFAULTS)) if (typeof changes?.[k] === 'boolean') next[k] = changes[k];
    setSetting(`notify:${userId}`, JSON.stringify(next));
    return next;
  };

  // Send { title, body, url } to every device of a person (if they want this kind of message).
  const notify = async (userId, kind, message) => {
    if (kind && !prefs(userId)[kind]) return 0;
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    let sent = 0;
    for (const s of subs) {
      try {
        const body = encryptPayload(JSON.stringify({ title: message.title, body: message.body || '', url: message.url || '/', tag: message.tag || kind || 'library' }), { p256dh: s.p256dh, auth: s.auth });
        const res = await fetchImpl(s.endpoint, {
          method: 'POST',
          headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Authorization: authorization(s.endpoint) },
          body
        });
        // 404/410: that browser turned notifications off or was uninstalled.
        if (res.status === 404 || res.status === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        else if (res.ok) sent++;
      } catch {
        // the push service couldn't be reached; try again next time
      }
    }
    return sent;
  };
  // Fire-and-forget version for use inside requests.
  const notifySoon = (userId, kind, message) => { notify(userId, kind, message).catch(() => {}); };

  return { publicKey, subscribe, unsubscribe, devices, prefs, setPrefs, notify, notifySoon, DEFAULTS };
}
