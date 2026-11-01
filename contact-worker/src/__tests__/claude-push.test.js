import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude } from '../claude.js';
import { b64url, encrypt, fromB64url, vapid } from '../claude-push.js';

const enc = new TextEncoder();
const hkdf = async (salt, ikm, info, length) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
};

// A pretend browser: its own keys, and RFC 8291 decryption done the browser's way.
async function browser() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = { p256dh: b64url(publicRaw), auth: b64url(auth) };
  async function decrypt(body) {
    const salt = body.slice(0, 16);
    const idlen = body[20];
    const serverKey = body.slice(21, 21 + idlen);
    const sealed = body.slice(21 + idlen);
    const theirs = await crypto.subtle.importKey('raw', serverKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, keys.privateKey, 256));
    const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...publicRaw, ...serverKey]);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
    expect(plain.at(-1)).toBe(2);
    return new TextDecoder().decode(plain.slice(0, -1));
  }
  return { subscription, decrypt };
}

async function vapidKeys() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  return { publicKey: b64url(raw), privateKey: await crypto.subtle.exportKey('jwk', privateKey), verifyKey: publicKey };
}

describe('web push, by the book', () => {
  it('encrypts so only the browser that subscribed can read it', async () => {
    const b = await browser();
    const body = await encrypt('{"title":"Jeremy\'s Claude","body":"hi"}', b.subscription);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await b.decrypt(body)).toBe('{"title":"Jeremy\'s Claude","body":"hi"}');
    const other = await browser();
    await expect(other.decrypt(body)).rejects.toThrow();
  });

  it('signs each push with a VAPID token for that push service', async () => {
    const keys = await vapidKeys();
    const header = await vapid('https://web.push.apple.com/abc', keys);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(k).toBe(keys.publicKey);
    const [head, body, signature] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(body)))).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://www.ambrosevannier.com' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.verifyKey, fromB64url(signature), enc.encode(`${head}.${body}`));
    expect(ok).toBe(true);
  });
});

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../claude.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const result = db.prepare(sql).run(...args);
      return { meta: { last_row_id: Number(result.lastInsertRowid), changes: result.changes } };
    },
  });
  return { db, prepare: (sql) => statement(sql) };
}

describe('notifications', () => {
  let env;
  let pushes;
  let status;
  beforeEach(async () => {
    const keys = await vapidKeys();
    env = {
      CLAUDE_DB: d1(),
      CLAUDE_TOKEN_AMBROSE: 'token-a',
      CLAUDE_TOKEN_JEREMY: 'token-j',
      CLAUDE_TOKEN_AMBROSE_HUMAN: 'token-ah',
      CLAUDE_TOKEN_JEREMY_HUMAN: 'token-jh',
      VAPID_KEYS: JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }),
    };
    pushes = [];
    status = 201;
    vi.stubGlobal('fetch', async (url, init) => {
      pushes.push({ url: String(url), init });
      return new Response(null, { status });
    });
  });

  const call = async (token, path, method = 'GET', body) => {
    const res = await handleClaude(
      new Request(`https://w.example${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
    return { code: res.status, ...(await res.json()) };
  };

  const subscribe = async (token, b, endpoint = 'https://web.push.apple.com/QGx') =>
    call(token, '/claude/push', 'POST', { subscription: { endpoint, keys: { p256dh: b.subscription.p256dh, auth: b.subscription.auth } } });

  it('hands out the public key', async () => {
    expect((await call('token-ah', '/claude/push')).publicKey).toBe(JSON.parse(env.VAPID_KEYS).publicKey);
  });

  it("notifies the people a message mentions, in words their browser can read", async () => {
    const jeremy = await browser();
    expect((await subscribe('token-jh', jeremy)).code).toBe(200);
    const res = await call('token-a', '/claude/messages', 'POST', { body: '@jeremy the garden is ready to try', wake: false });
    expect(res.notified).toBe(1);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].url).toBe('https://web.push.apple.com/QGx');
    expect(pushes[0].init.headers['Content-Encoding']).toBe('aes128gcm');
    const note = JSON.parse(await jeremy.decrypt(new Uint8Array(pushes[0].init.body)));
    expect(note).toMatchObject({ title: "Ambrose's Claude", body: '@jeremy the garden is ready to try', id: 1 });
    expect(note.url).toBe('https://claude.ambrosevannier.com/board#m1');
  });

  it("notifies nobody who isn't mentioned, and never the sender", async () => {
    const ambrose = await browser();
    await subscribe('token-ah', ambrose);
    await call('token-a', '/claude/messages', 'POST', { body: 'no mentions here', wake: false });
    await call('token-ah', '/claude/messages', 'POST', { body: 'note to self @ambrose' });
    expect(pushes).toHaveLength(0);
    await call('token-jh', '/claude/messages', 'POST', { body: '@everyone dinner?' });
    expect(pushes).toHaveLength(1);
  });

  it('forgets a browser the push service says is gone', async () => {
    await subscribe('token-jh', await browser());
    status = 410;
    await call('token-a', '/claude/messages', 'POST', { body: '@jeremy hi', wake: false });
    expect(env.CLAUDE_DB.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n).toBe(0);
  });

  it('only takes real push services, and only from the people', async () => {
    const b = await browser();
    expect((await subscribe('token-ah', b, 'https://evil.example/collect')).code).toBe(400);
    expect((await subscribe('token-a', b)).code).toBe(403);
    expect((await subscribe('token-ah', b, 'https://fcm.googleapis.com/fcm/send/abc')).code).toBe(200);
  });

  it('lets a browser turn notifications off', async () => {
    await subscribe('token-jh', await browser());
    await call('token-jh', '/claude/push', 'DELETE', { endpoint: 'https://web.push.apple.com/QGx' });
    await call('token-a', '/claude/messages', 'POST', { body: '@jeremy hi', wake: false });
    expect(pushes).toHaveLength(0);
  });

  it("still saves the message when notifications aren't set up", async () => {
    delete env.VAPID_KEYS;
    expect(await call('token-a', '/claude/messages', 'POST', { body: '@jeremy hi', wake: false })).toMatchObject({ id: 1, notified: 0 });
  });

  it("won't hand one person's device to the other", async () => {
    const b = await browser();
    expect((await subscribe('token-ah', b)).code).toBe(200);
    expect((await subscribe('token-jh', b)).code).toBe(409);
    expect(env.CLAUDE_DB.db.prepare('SELECT name FROM push_subscriptions').get().name).toBe('ambrose-human');
  });
});
