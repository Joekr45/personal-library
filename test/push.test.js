// Notifications: the test plays the part of a phone, decrypting what the server sends
// (RFC 8291) and checking the server's signature (VAPID, RFC 8292).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';
import { encryptPayload } from '../server/push.js';

// A pretend browser subscription with its own keys.
const makeDevice = (name) => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ecdh, authSecret: auth,
    subscription: { endpoint: `https://push.example/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }
  };
};
// What the phone does on receiving a push: undo the encryption.
const decrypt = (device, body) => {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const shared = device.ecdh.computeSecret(asPublic);
  const hk = (s, ikm, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const ikm = hk(device.authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), device.ecdh.getPublicKey(), asPublic]), 32);
  const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'ends with the padding marker');
  assert.equal(body.readUInt32BE(16), 4096);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
};

test('encryption matches the worked example in the standard (RFC 8291, section 5)', () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'));
  const out = encryptPayload('When I grow up, I want to be a watermelon', {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg'
  }, { serverEcdh: ecdh, salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') });
  assert.equal(out.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('encryption: a phone can decrypt the message', () => {
  const device = makeDevice('x');
  const body = encryptPayload(JSON.stringify({ title: 'Hello', body: 'Café ☕' }), device.subscription.keys);
  assert.deepEqual(decrypt(device, body), { title: 'Hello', body: 'Café ☕' });
  assert.throws(() => encryptPayload('x', { p256dh: 'short', auth: 'short' }));
});

let server, base, dataDir, a, b, sent = [], gone = new Set();
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};
const fakeFetch = async (url, options = {}) => {
  url = String(url);
  if (url.startsWith('https://push.example/')) {
    sent.push({ url, headers: options.headers, body: Buffer.from(options.body) });
    return { ok: !gone.has(url), status: gone.has(url) ? 410 : 201, json: async () => ({}) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
const phoneA = makeDevice('a');
const phoneB = makeDevice('b');
const waitFor = async (check) => { for (let i = 0; i < 50 && !check(); i++) await new Promise(r => setTimeout(r, 20)); };

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-push-'));
  server = createServer({ dataDir, distDir: dataDir, signupMode: 'open', fetchImpl: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const register = async (email, displayName) => (await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'longpassword', displayName })
  })).headers.get('set-cookie').split(';')[0];
  a = await register('a@example.com', 'Ann');
  b = await register('b@example.com', 'Ben');
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('turning notifications on, and the test message (signed and encrypted)', async () => {
  const info = (await call('GET', '/api/push', undefined, a)).body;
  assert.equal(Buffer.from(info.publicKey, 'base64url').length, 65);
  assert.equal(info.devices, 0);
  assert.equal(info.prefs.recommendations, true);
  assert.equal(info.prefs.activity, false);
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://insecure', keys: {} } }, a)).status, 400);
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: phoneA.subscription }, a)).body.devices, 1);
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: phoneB.subscription }, b)).body.devices, 1);

  sent = [];
  assert.equal((await call('POST', '/api/push/test', undefined, a)).body.sent, 1);
  const msg = sent[0];
  assert.equal(msg.url, phoneA.subscription.endpoint);
  assert.equal(msg.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(decrypt(phoneA, msg.body).title, 'Personal Library');
  // The signature checks out with the public key the server handed out.
  const [, jwt, k] = msg.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, info.publicKey);
  const [h, c, sig] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).aud, 'https://push.example');
  const raw = Buffer.from(k, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('a recommendation notifies the person it is for; switching that kind off stops it', async () => {
  const people = (await call('GET', '/api/people', undefined, a)).body.people;
  const benId = people.find(p => p.displayName === 'Ben').id;
  sent = [];
  await call('POST', '/api/recommendations', { toUserId: benId, book: { title: 'Rebecca', author: 'du Maurier' }, note: 'So good' }, a);
  await waitFor(() => sent.length > 0);
  const msg = decrypt(phoneB, sent[0].body);
  assert.equal(msg.title, 'Ann recommended a book');
  assert.match(msg.body, /Rebecca.*So good/);
  assert.equal(msg.url, '/?section=activity');

  assert.equal((await call('PUT', '/api/push/prefs', { recommendations: false, bogus: true }, b)).body.prefs.recommendations, false);
  sent = [];
  await call('POST', '/api/recommendations', { toUserId: benId, book: { title: 'Emma', author: 'Austen' } }, a);
  await new Promise(r => setTimeout(r, 150));
  assert.equal(sent.length, 0);
});

test('club posts notify other members without spoilers', async () => {
  const club = (await call('POST', '/api/clubs', { name: 'Buddies', book: { title: 'Rebecca', author: 'du Maurier' } }, a)).body.club;
  await call('POST', `/api/clubs/${club.id}/join`, undefined, b);
  sent = [];
  await call('POST', `/api/clubs/${club.id}/posts`, { text: 'The butler did it!', page: 300 }, a);
  await waitFor(() => sent.length > 0);
  assert.equal(sent.length, 1, 'only the other member');
  const msg = decrypt(phoneB, sent[0].body);
  assert.equal(msg.title, 'Ann posted in Buddies');
  assert.ok(!msg.body.includes('butler'), 'no spoilers in the notification');
  assert.match(msg.body, /page 300/);
});

test('a phone that turned notifications off is forgotten', async () => {
  gone.add(phoneA.subscription.endpoint);
  await call('POST', '/api/push/test', undefined, a);
  assert.equal((await call('GET', '/api/push', undefined, a)).body.devices, 0);
});
