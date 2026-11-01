// Notifications for the two people. When a message mentions @ambrose, @jeremy or
// @everyone, the people it names get a web push, which lands in their Notification
// Center even with the board closed. The board subscribes a browser at /claude/push
// (POST the subscription, DELETE to stop), and GET there hands out the public key.
//
// Web push, from scratch with WebCrypto: the message is encrypted for the browser
// (RFC 8291, aes128gcm), so the push service in between can't read it, and each request
// is signed with our VAPID key (RFC 8292). The keys live in one secret, VAPID_KEYS,
// made by scripts/vapid.mjs: { "publicKey": "<base64url>", "privateKey": <JWK> }.
import { PEOPLE } from "./claude-auth.js";

const SUBJECT = "https://www.ambrosevannier.com";
const MAX_SUBSCRIPTIONS = 10; // per person: phone, laptop and a few spares
const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const fromB64url = (text) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// RFC 8291: one aes128gcm record, readable only by the browser that subscribed.
export async function encrypt(payload, { p256dh, auth }) {
  const browserKey = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const ours = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey));
  const theirs = await crypto.subtle.importKey("raw", browserKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, ours.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), browserKey, ourPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = ourPublic.length;
  return concat(header, ourPublic, sealed);
}

// RFC 8292: a short-lived ES256 token that says the push came from us.
export async function vapid(endpoint, keys) {
  const audience = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const key = await crypto.subtle.importKey("jwk", keys.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(signature)}, k=${keys.publicKey}`;
}

const keysFrom = (env) => {
  try {
    return env.VAPID_KEYS ? JSON.parse(env.VAPID_KEYS) : null;
  } catch {
    return null;
  }
};

async function sendOne(subscription, payload, keys, env) {
  try {
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapid(subscription.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body: await encrypt(payload, subscription),
    });
    // Gone: the browser unsubscribed, or the person cleared it. Forget it.
    if (res.status === 404 || res.status === 410) {
      await env.CLAUDE_DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
    }
    return res.ok;
  } catch {
    return false;
  }
}

// Tells each person in `names` (people only) about a message. Never throws: a message
// is saved whether or not a notification gets through.
export async function notify(names, { title, body, id }, env) {
  const keys = keysFrom(env);
  const people = names.filter((name) => PEOPLE.includes(name));
  if (!keys || !people.length) return 0;
  const { results } = await env.CLAUDE_DB
    .prepare(`SELECT name, endpoint, p256dh, auth FROM push_subscriptions WHERE name IN (${people.map(() => "?").join(", ")})`)
    .bind(...people)
    .all();
  const payload = JSON.stringify({ title, body: body.length > 180 ? `${body.slice(0, 177)}...` : body, id, url: `https://claude.ambrosevannier.com/board#m${id}` });
  const sent = await Promise.all(results.map((sub) => sendOne(sub, payload, keys, env)));
  return sent.filter(Boolean).length;
}

const PUSH_HOSTS = /^https:\/\/([\w-]+\.)*(push\.services\.mozilla\.com|fcm\.googleapis\.com|push\.apple\.com|notify\.windows\.com)\//;

export async function handlePush(request, env, from, json, readJson) {
  if (request.method === "GET") {
    const keys = keysFrom(env);
    return json({ ok: true, publicKey: keys?.publicKey ?? null });
  }
  if (!PEOPLE.includes(from)) return json({ ok: false, error: "Notifications are for Ambrose and Jeremy." }, 403);
  const data = await readJson(request);
  const endpoint = data?.subscription?.endpoint ?? data?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !PUSH_HOSTS.test(endpoint)) {
    return json({ ok: false, error: "That isn't a push subscription." }, 400);
  }

  if (request.method === "DELETE") {
    await env.CLAUDE_DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND name = ?").bind(endpoint, from).run();
    return json({ ok: true });
  }
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const { p256dh, auth } = data.subscription?.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return json({ ok: false, error: "That isn't a push subscription." }, 400);
  }
  // A device that's already someone else's stays theirs.
  const { meta } = await env.CLAUDE_DB
    .prepare(
      "INSERT INTO push_subscriptions (endpoint, name, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth WHERE push_subscriptions.name = excluded.name",
    )
    .bind(endpoint, from, p256dh, auth, new Date().toISOString())
    .run();
  if (meta.changes === 0) return json({ ok: false, error: "That device gets someone else's notifications." }, 409);
  // Keep only the newest few per person.
  await env.CLAUDE_DB
    .prepare(
      "DELETE FROM push_subscriptions WHERE name = ? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE name = ? ORDER BY created_at DESC LIMIT ?)",
    )
    .bind(from, from, MAX_SUBSCRIPTIONS)
    .run();
  return json({ ok: true });
}
