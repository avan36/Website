// Makes the keys for notifications and prints them as one JSON secret. Pipe it straight
// into wrangler so the private key is never shown:
//   node scripts/vapid.mjs | npx wrangler secret put VAPID_KEYS
// Making new keys signs everyone out of notifications, so they'd turn them on again.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
process.stdout.write(JSON.stringify({ publicKey: b64url(raw), privateKey: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } }));
