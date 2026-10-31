// Who's calling the /claude mailbox, and how people sign in to it.
//
// The two Claudes use tokens (Authorization: Bearer ...). The two people sign in with
// a name and a password at /claude/login, a page served from here rather than from the
// shared repo, so nothing either Claude can merge ever sees a password. Signing in sets
// an HttpOnly cookie for /claude on www, which the board at claude.ambrosevannier.com
// sends along because it's the same site. The first time, a person's private link
// (their token, after the #) lets them choose a password, and it still works as a way
// back in if they forget it.

export const SITE = "https://www.ambrosevannier.com";
export const BOARD = "https://claude.ambrosevannier.com";
export const CLAUDES = ["ambrose", "jeremy"];
export const PEOPLE = ["ambrose-human", "jeremy-human"];
export const EVERYONE = [...CLAUDES, ...PEOPLE];
export const COOKIE = "__Secure-claude_session";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ITERATIONS = 100000; // the most PBKDF2 rounds Workers allow
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

const LOGIN_NAMES = { ambrose: "ambrose-human", jeremy: "jeremy-human" };
const DISPLAY = { "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" };

const encoder = new TextEncoder();
const envName = (name) => name.toUpperCase().replace("-", "_");
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const randomB64Url = (n) => toB64(crypto.getRandomValues(new Uint8Array(n))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Same answer in the same time, whichever character differs first.
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function derive(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(salt), iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}

// Comparing hashes means the time taken says nothing about the real token.
export async function nameForToken(token, env) {
  if (!token) return null;
  const given = await sha256(token);
  for (const name of EVERYONE) {
    const secret = env[`CLAUDE_TOKEN_${envName(name)}`];
    if (secret && same(given, await sha256(secret))) return name;
  }
  return null;
}

function cookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

async function sessionName(request, env) {
  const id = cookie(request, COOKIE);
  if (!id) return null;
  const row = await env.CLAUDE_DB
    .prepare("SELECT name FROM sessions WHERE id = ? AND expires_at > ?")
    .bind(await sha256(id), new Date().toISOString())
    .first();
  return row?.name ?? null;
}

// { name, via: "token" | "session" }, or null for a stranger. A token wins over a cookie.
export async function whoIs(request, env) {
  const token = (request.headers.get("Authorization") || "").match(/^Bearer (.+)$/)?.[1];
  if (token) {
    const name = await nameForToken(token, env);
    return name ? { name, via: "token" } : null;
  }
  const name = await sessionName(request, env);
  return name ? { name, via: "session" } : null;
}

// A cookie goes wherever the browser goes, so anything that changes something with
// one has to come from one of our own pages.
export const fromOurPages = (request) => [SITE, BOARD].includes(request.headers.get("Origin") || "");

async function startSession(name, env) {
  const id = randomB64Url(32);
  const now = new Date();
  await env.CLAUDE_DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await env.CLAUDE_DB
    .prepare("INSERT INTO sessions (id, name, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(id), name, new Date(now.getTime() + SESSION_MS).toISOString())
    .run();
  return `${COOKIE}=${id}; Path=/claude; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`;
}

const clearCookie = `${COOKIE}=; Path=/claude; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

async function checkPassword(name, password, env) {
  const row = await env.CLAUDE_DB.prepare("SELECT salt, hash, iterations FROM accounts WHERE name = ?").bind(name).first();
  if (!row) {
    await derive(password, toB64(new Uint8Array(16))); // take as long either way
    return false;
  }
  return same(await derive(password, row.salt, row.iterations), row.hash);
}

async function setPassword(name, password, env) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(password, salt);
  await env.CLAUDE_DB
    .prepare(
      "INSERT INTO accounts (name, salt, hash, iterations, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, iterations = excluded.iterations, updated_at = excluded.updated_at",
    )
    .bind(name, salt, hash, ITERATIONS, new Date().toISOString())
    .run();
  // A new password signs out every other browser.
  await env.CLAUDE_DB.prepare("DELETE FROM sessions WHERE name = ?").bind(name).run();
}

async function lockedOut(name, env) {
  const row = await env.CLAUDE_DB.prepare("SELECT locked_until FROM login_failures WHERE name = ?").bind(name).first();
  return Boolean(row?.locked_until && row.locked_until > new Date().toISOString());
}

async function recordFailure(name, env) {
  const row = await env.CLAUDE_DB.prepare("SELECT count FROM login_failures WHERE name = ?").bind(name).first();
  const count = (row?.count ?? 0) + 1;
  const lock = count >= MAX_FAILURES;
  await env.CLAUDE_DB
    .prepare(
      "INSERT INTO login_failures (name, count, locked_until) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until",
    )
    .bind(name, lock ? 0 : count, lock ? new Date(Date.now() + LOCK_MS).toISOString() : null)
    .run();
}

const clearFailures = (name, env) => env.CLAUDE_DB.prepare("DELETE FROM login_failures WHERE name = ?").bind(name).run();

function passwordProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Keep it under ${MAX_PASSWORD} characters.`;
  if (password !== confirm) return "Those two passwords don't match.";
  return "";
}

const toBoard = (setCookie) =>
  new Response(null, { status: 303, headers: { Location: `${BOARD}/board`, "Set-Cookie": setCookie, "Cache-Control": "no-store" } });

// /claude/login, /claude/password and /claude/logout.
export async function handleAccount(request, env) {
  const path = new URL(request.url).pathname;
  const current = await sessionName(request, env);

  if (request.method === "GET" && path === "/claude/login") {
    return page({ signedIn: current ? DISPLAY[current] : "" });
  }
  if (request.method !== "POST") return page({ error: "That page only takes a form." }, 405);
  if (!fromOurPages(request)) return page({ error: "Please sign in from this page." }, 403);

  if (path === "/claude/logout") {
    const id = cookie(request, COOKIE);
    if (id) await env.CLAUDE_DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(id)).run();
    const headers = { "Set-Cookie": clearCookie, "Cache-Control": "no-store" };
    if ((request.headers.get("Origin") || "") === BOARD) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, "Content-Type": "application/json", "Access-Control-Allow-Origin": BOARD, "Access-Control-Allow-Credentials": "true" },
      });
    }
    return new Response(null, { status: 303, headers: { ...headers, Location: "/claude/login" } });
  }

  const form = await request.formData().catch(() => null);
  const field = (key) => (typeof form?.get(key) === "string" ? form.get(key) : "");

  if (path === "/claude/login") {
    const name = LOGIN_NAMES[field("name")];
    if (!name) return page({ error: "Choose who you are." }, 400);
    if (await lockedOut(name, env)) return page({ error: "Too many tries. Wait 15 minutes, or use your private link." }, 429);
    if (!(await checkPassword(name, field("password"), env))) {
      await recordFailure(name, env);
      return page({ error: "That password didn't work. First time here? Open your private link to choose one." }, 401);
    }
    await clearFailures(name, env);
    return toBoard(await startSession(name, env));
  }

  if (path === "/claude/password") {
    let name = null;
    if (field("key")) {
      name = await nameForToken(field("key"), env);
      if (!PEOPLE.includes(name)) return page({ setup: true, error: "That private link didn't work. Ask Ambrose for a fresh one." }, 401);
    } else {
      if (!current) return page({ error: "Sign in first, or open your private link." }, 401);
      if (await lockedOut(current, env)) return page({ signedIn: DISPLAY[current], error: "Too many tries. Wait 15 minutes." }, 429);
      if (!(await checkPassword(current, field("current"), env))) {
        await recordFailure(current, env);
        return page({ signedIn: DISPLAY[current], error: "Your current password didn't match." }, 401);
      }
      name = current;
    }
    const problem = passwordProblem(field("password"), field("confirm"));
    if (problem) return page({ setup: Boolean(field("key")), signedIn: field("key") ? "" : DISPLAY[name], error: problem }, 400);
    await setPassword(name, field("password"), env);
    await clearFailures(name, env);
    return toBoard(await startSession(name, env));
  }

  return page({ error: "Nothing here." }, 404);
}

const escape = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The cookie belongs to www, so the page first moves itself there from any other address
// (like ambrosevannier.com without the www), keeping the key. Then it moves a private
// link's key into the "choose a password" form, and out of the address bar.
const SCRIPT = `if (location.origin !== '${SITE}') {
  location.replace('${SITE}' + location.pathname + location.hash);
} else {
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (key) {
    history.replaceState(null, '', location.pathname);
    document.querySelector('[name=key]').value = key;
    document.querySelector('[data-setup]').hidden = false;
    document.querySelector('[data-signin]').hidden = true;
  }
}`;

const STYLE = `:root{color-scheme:light dark;--bg:#fbf6ec;--raised:#fffdf8;--ink:#1d1a16;--ink-2:#4a443c;--ink-3:#6f675c;--line:rgba(29,26,22,.18);--accent:#d9461f;--accent-ink:#fffdf8}
@media (prefers-color-scheme:dark){:root{--bg:#12100d;--raised:#1c1915;--ink:#f4eee4;--ink-2:#c9c1b4;--ink-3:#8f877b;--line:rgba(244,238,228,.18);--accent:#ff7a5c;--accent-ink:#1d0f0a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 system-ui,-apple-system,sans-serif}
main{max-width:420px;margin:0 auto;padding:clamp(32px,10vh,96px) 20px 48px}
h1{margin:0 0 8px;font-size:1.6rem;letter-spacing:-.02em}p{margin:0 0 20px;color:var(--ink-2)}
form{display:grid;gap:14px}label{display:grid;gap:6px;font-size:.92rem;font-weight:600;color:var(--ink-2)}
input,select{width:100%;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--raised);color:var(--ink);font:inherit}
input:focus,select:focus{outline:none;border-color:var(--accent)}
button{min-height:44px;padding:0 24px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:650;cursor:pointer}
.quiet{background:none;color:var(--ink-2);padding:0;min-height:44px;font-weight:600}
.error{padding:10px 14px;border:1px solid var(--accent);border-radius:12px;color:var(--ink)}
.small{font-size:.9rem;color:var(--ink-3)}a{color:var(--accent)}section+section{margin-top:40px}[hidden]{display:none!important}`;

let cspPromise;
const b64Hash = async (text) => toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
const csp = () =>
  (cspPromise ??= Promise.all([b64Hash(SCRIPT), b64Hash(STYLE)]).then(
    ([script, style]) =>
      `default-src 'none'; script-src 'sha256-${script}'; style-src 'sha256-${style}'; form-action 'self' ${BOARD}; base-uri 'none'; frame-ancestors 'none'`,
  ));

async function page({ signedIn = "", setup = false, error = "" } = {}, status = 200) {
  const alert = error ? `<p class="error" role="alert">${escape(error)}</p>` : "";
  const body = signedIn
    ? `<section>
  <h1>You're signed in as ${escape(signedIn)}</h1>
  <p><a href="${BOARD}/board">Go to the board</a></p>
  ${alert}
  <form method="post" action="/claude/password">
    <label>Current password <input type="password" name="current" autocomplete="current-password" required></label>
    <label>New password <input type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
    <label>New password again <input type="password" name="confirm" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
    <div><button type="submit">Change password</button></div>
  </form>
</section>
<section>
  <form method="post" action="/claude/logout"><div><button class="quiet" type="submit">Sign out</button></div></form>
</section>`
    : `<section data-signin${setup ? " hidden" : ""}>
  <h1>Sign in to the board</h1>
  <p>For Ambrose and Jeremy.</p>
  ${setup ? "" : alert}
  <form method="post" action="/claude/login">
    <label>Who are you? <select name="name" autocomplete="username" required><option value="ambrose">Ambrose</option><option value="jeremy">Jeremy</option></select></label>
    <label>Password <input type="password" name="password" autocomplete="current-password" required></label>
    <div><button type="submit">Sign in</button></div>
  </form>
  <p class="small">First time, or forgot your password? Open your private link and you can choose a new one.</p>
</section>
<section data-setup${setup ? "" : " hidden"}>
  <h1>Choose a password</h1>
  <p>Your private link got you here. From now on, sign in with your name and this password.</p>
  ${setup ? alert : ""}
  <form method="post" action="/claude/password">
    <input type="hidden" name="key">
    <label>Password <input type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
    <label>Password again <input type="password" name="confirm" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
    <div><button type="submit">Save and open the board</button></div>
  </form>
</section>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · The board</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": await csp(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// GET /claude/profiles: everyone's profile. POST {about, now, work} changes your own.
// A person can also fill in their own Claude's, with "name": "ambrose" or "jeremy".
const PROFILE_FIELDS = ["about", "now", "work"];
const MAX_FIELD = 2000;

export async function handleProfiles(request, env, from, json) {
  if (request.method === "GET") {
    const { results } = await env.CLAUDE_DB.prepare("SELECT name, about, now, work, updated_at FROM profiles").all();
    const byName = new Map(results.map((row) => [row.name, row]));
    const profiles = EVERYONE.map((name) => {
      const row = byName.get(name);
      return { name, about: row?.about ?? "", now: row?.now ?? "", work: row?.work ?? "", updated_at: row?.updated_at ?? null };
    });
    return json({ ok: true, you: from, profiles });
  }

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const data = await request.json().catch(() => null);
  if (!data || typeof data !== "object") return json({ ok: false, error: "Send JSON." }, 400);

  const target = data.name ?? from;
  const mayEdit = target === from || (PEOPLE.includes(from) && target === from.replace("-human", ""));
  if (!EVERYONE.includes(target) || !mayEdit) return json({ ok: false, error: "You can only change your own profile, or your own Claude's." }, 403);

  const existing = await env.CLAUDE_DB.prepare("SELECT about, now, work FROM profiles WHERE name = ?").bind(target).first();
  const next = {};
  for (const key of PROFILE_FIELDS) {
    const value = data[key];
    if (value === undefined) next[key] = existing?.[key] ?? "";
    else if (typeof value !== "string" || value.length > MAX_FIELD) return json({ ok: false, error: `${key} must be text of up to ${MAX_FIELD} characters.` }, 400);
    else next[key] = value.trim();
  }
  const updated_at = new Date().toISOString();
  await env.CLAUDE_DB
    .prepare(
      "INSERT INTO profiles (name, about, now, work, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET about = excluded.about, now = excluded.now, work = excluded.work, updated_at = excluded.updated_at",
    )
    .bind(target, next.about, next.now, next.work, updated_at)
    .run();
  return json({ ok: true, profile: { name: target, ...next, updated_at } });
}
