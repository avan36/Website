// Who's calling the /claude mailbox, and how people sign in to it.
//
// The two Claudes use tokens (Authorization: Bearer ...). The two people sign in with
// a name and a password at /claude/login, a page served from here rather than from the
// shared repo, so nothing either Claude can merge ever sees a password. Signing in sets
// an HttpOnly cookie for /claude on www, which the board at claude.ambrosevannier.com
// sends along because it's the same site. The first time, a person's private link
// (their token, after the #) lets them choose a password, and it still works as a way
// back in if they forget it.

import { BOARD, CLAUDES, EVERYONE, PEOPLE, SITE, sha256 } from "./claude-names.js";
import { CORE_TEAM, PERMS, Refusal, connectClaude, inviteFor, memberForToken, memberInfo, newClaudeToken, roster, useInvite } from "./claude-members.js";
export { BOARD, CLAUDES, EVERYONE, PEOPLE, SITE, sha256 };
export const COOKIE = "__Secure-claude_session";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ITERATIONS = 100000; // the most PBKDF2 rounds Workers allow
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LOGIN_NAMES = { ambrose: "ambrose-human", jeremy: "jeremy-human" };
const DISPLAY = { "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" };

const encoder = new TextEncoder();
const envName = (name) => name.toUpperCase().replace("-", "_");
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const randomB64Url = (n) => toB64(crypto.getRandomValues(new Uint8Array(n))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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
  return memberForToken(token, env);
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
// The mailbox itself only answers a cookie from the board. Not from www: anything that
// ever ran a script there could otherwise read and write the mailbox. And not with no
// Origin at all, so an image or a link on another page can't fake a read receipt.
export const fromBoard = (request) => (request.headers.get("Origin") || "") === BOARD;

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

// Every try is counted before the password is checked, in one statement, so a burst
// of guesses sent all at once still gets only MAX_FAILURES tries. Too many in a row and
// that name waits: 15 minutes, then 30, then an hour at most. Returns the minutes left
// to wait, or 0 if this try may go ahead.
async function takeTry(name, env) {
  const now = new Date();
  const row = await env.CLAUDE_DB
    .prepare(
      "INSERT INTO login_failures (name, count) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET count = count + 1 RETURNING count, locked_until, strikes",
    )
    .bind(name)
    .first();
  if (row.locked_until && row.locked_until > now.toISOString()) {
    return Math.ceil((Date.parse(row.locked_until) - now.getTime()) / 60000);
  }
  if (row.count <= MAX_FAILURES) return 0;
  // Strikes fade after a quiet day, so one bad evening doesn't follow you around.
  const fresh = !row.locked_until || Date.parse(row.locked_until) < now.getTime() - DAY_MS;
  const strikes = fresh ? 0 : row.strikes;
  const wait = Math.min(LOCK_MS * 2 ** strikes, MAX_LOCK_MS);
  await env.CLAUDE_DB
    .prepare("UPDATE login_failures SET count = 0, strikes = ?, locked_until = ? WHERE name = ?")
    .bind(strikes + 1, new Date(now.getTime() + wait).toISOString(), name)
    .run();
  return wait / 60000;
}

const waitNote = (minutes) => `Too many tries. Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

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
  if (path === "/claude/join") return handleJoin(request, env);
  const current = await sessionName(request, env);
  const team = current && !DISPLAY[current] ? await roster(env) : CORE_TEAM;
  const displayOf = (name) => DISPLAY[name] ?? team.display[name] ?? name.replace(/-human$/, "");

  if (request.method === "GET" && path === "/claude/login") {
    return page({ signedIn: current ? displayOf(current) : "", member: current ? await memberInfo(current, env) : null });
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
    const chosen = field("name") === "other" ? field("other").trim().toLowerCase().replace(/^@/, "") : field("name");
    const name = LOGIN_NAMES[chosen] ?? (/^[a-z]{2,20}$/.test(chosen) ? `${chosen}-human` : null);
    if (!name) return page({ who: field("name"), error: field("name") === "other" ? "Type the name you joined with, like sam." : "Choose who you are." }, 400);
    // Only a real member's name is counted, so a stranger typing names can't fill the
    // table. Anyone else just gets the same slow "didn't work".
    const known = Boolean(LOGIN_NAMES[chosen]) || (await roster(env)).people.includes(name);
    if (!known) {
      await checkPassword("", field("password"), env);
      return page({ who: field("name"), other: chosen, error: "That name and password didn't work." }, 401);
    }
    const wait = await takeTry(name, env);
    if (wait) return page({ who: field("name"), other: LOGIN_NAMES[chosen] ? "" : chosen, error: `${waitNote(wait)}, or use your private link.` }, 429);
    if (!(await checkPassword(name, field("password"), env))) {
      return page({ who: field("name"), other: LOGIN_NAMES[chosen] ? "" : chosen, error: LOGIN_NAMES[chosen] ? "That password didn't work. First time here? Open your private link to choose one." : "That name and password didn't work. Forgot it? Ask Ambrose or Jeremy for a reset link." }, 401);
    }
    await clearFailures(name, env);
    return toBoard(await startSession(name, env));
  }

  // A member's own Claude: connect its wake-up, or give it a new token.
  if (path === "/claude/your-claude") {
    if (!current) return page({ error: "Sign in first." }, 401);
    const info = await memberInfo(current, env);
    if (!info) return page({ signedIn: displayOf(current), error: "That's for members who joined by invite." }, 403);
    try {
      if (field("action") === "token") {
        const { token } = await newClaudeToken(info.slug, env);
        return htmlPage("New token", welcome({ slug: info.slug, display: info.display, token }, true));
      }
      const { connected } = await connectClaude(current, field("fire_url"), field("fire_token"), env);
      return page({ signedIn: displayOf(current), member: { ...info, connected }, note: connected ? "Connected. Messages that mention your Claude will wake it." : "Disconnected. Your Claude won't be woken." });
    } catch (error) {
      if (error instanceof Refusal) return page({ signedIn: displayOf(current), member: info, error: error.message }, error.status);
      throw error;
    }
  }

  if (path === "/claude/password") {
    let name = null;
    if (field("key")) {
      name = await nameForToken(field("key"), env);
      if (!PEOPLE.includes(name)) return page({ setup: true, error: "That private link didn't work. Ask Ambrose for a fresh one." }, 401);
    } else {
      if (!current) return page({ error: "Sign in first, or open your private link." }, 401);
      const wait = await takeTry(current, env);
      if (wait) return page({ signedIn: displayOf(current), error: `${waitNote(wait)}.` }, 429);
      if (!(await checkPassword(current, field("current"), env))) {
        return page({ signedIn: displayOf(current), error: "Your current password didn't match." }, 401);
      }
      name = current;
    }
    const problem = passwordProblem(field("password"), field("confirm"));
    if (problem) return page({ setup: Boolean(field("key")), signedIn: field("key") ? "" : displayOf(name), error: problem }, 400);
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
  const hash = new URLSearchParams(location.hash.slice(1));
  const key = hash.get('key');
  const code = hash.get('code');
  const look = document.querySelector('[data-look]');
  if (code && look) {
    history.replaceState(null, '', location.pathname);
    look.querySelector('[name=code]').value = code;
    look.requestSubmit ? look.requestSubmit() : look.submit();
  }
  const other = document.querySelector('[data-other]');
  if (other) {
    const sync = () => {
      const on = document.querySelector('#who-o')?.checked;
      other.hidden = !on;
      other.querySelector('input').required = Boolean(on);
    };
    for (const radio of document.querySelectorAll('[name=name]')) radio.addEventListener('change', () => { sync(); if (radio.value === 'other') other.querySelector('input').focus(); });
    sync();
  }
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copy)?.textContent || '';
      try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; } catch { button.textContent = 'Select it and copy'; }
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    });
  }
  if (key && document.querySelector('[data-setup]')) {
    history.replaceState(null, '', location.pathname);
    document.querySelector('[name=key]').value = key;
    document.querySelector('[data-setup]').hidden = false;
    document.querySelector('[data-signin]').hidden = true;
  }
  for (const toggle of document.querySelectorAll('[data-reveal]')) {
    toggle.addEventListener('click', () => {
      const input = toggle.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(show));
      input.focus();
    });
  }
  const caps = (event) => {
    const hint = event.target.closest('.field')?.querySelector('[data-caps]');
    if (hint && event.getModifierState) hint.hidden = !event.getModifierState('CapsLock');
  };
  for (const input of document.querySelectorAll('input[type=password]')) {
    input.addEventListener('keyup', caps);
    input.addEventListener('keydown', caps);
  }
  for (const form of document.querySelectorAll('form')) {
    form.addEventListener('submit', (event) => {
      if (form.dataset.sent) return event.preventDefault();
      form.dataset.sent = 'true';
      const button = form.querySelector('button[type=submit]');
      if (button) button.setAttribute('aria-busy', 'true');
    });
  }
  addEventListener('pageshow', () => {
    for (const form of document.querySelectorAll('form')) delete form.dataset.sent;
    for (const button of document.querySelectorAll('[aria-busy]')) button.removeAttribute('aria-busy');
  });
  const first = document.querySelector('section:not([hidden]) input:not([type=hidden]):not([type=radio])');
  if (first && matchMedia('(hover: hover)').matches) first.focus();
}`;

const STYLE = `:root{color-scheme:light dark;--bg:#fbf6ec;--raised:rgba(255,253,248,.72);--ink:#1d1a16;--ink-2:#4a443c;--ink-3:#6f675c;--line:rgba(29,26,22,.12);--line-strong:rgba(29,26,22,.22);--accent:#d9461f;--accent-ink:#fffdf8;--a:#e2552f;--j:#2f7de2;--c:#b46cf0;--ease:cubic-bezier(.22,1,.36,1)}
@media (prefers-color-scheme:dark){:root{--bg:#12100d;--raised:rgba(28,25,21,.7);--ink:#f4eee4;--ink-2:#c9c1b4;--ink-3:#8f877b;--line:rgba(244,238,228,.1);--line-strong:rgba(244,238,228,.2);--accent:#ff7a5c;--accent-ink:#1d0f0a}}
*{box-sizing:border-box}
html{min-height:100%;background:var(--bg)}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 20px max(32px,env(safe-area-inset-bottom));color:var(--ink);font:17px/1.55 ui-rounded,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before,body::after{content:"";position:fixed;z-index:-1;width:70vmax;height:70vmax;border-radius:50%;filter:blur(70px);opacity:.38;pointer-events:none}
body::before{top:-30vmax;left:-20vmax;background:radial-gradient(closest-side,var(--a),transparent)}
body::after{bottom:-35vmax;right:-25vmax;background:radial-gradient(closest-side,var(--j),transparent)}
@media (prefers-reduced-motion:no-preference){body::before{animation:drift 22s var(--ease) infinite alternate}body::after{animation:drift 26s var(--ease) infinite alternate-reverse}main{animation:rise .7s var(--ease) both}}
@keyframes drift{to{transform:translate(8vmax,6vmax) scale(1.12)}}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.98)}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@keyframes spin{to{transform:rotate(1turn)}}
main{width:100%;max-width:400px;padding:36px 28px 28px;border:1px solid var(--line);border-radius:28px;background:var(--raised);-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);box-shadow:0 1px 2px rgba(0,0,0,.04),0 24px 60px -24px rgba(29,26,22,.28)}
.mark{display:block;margin:0 auto 20px}
h1{margin:0 0 6px;font-size:1.55rem;line-height:1.2;letter-spacing:-.025em;text-align:center;text-wrap:balance}
p{margin:0 0 22px;color:var(--ink-2);text-align:center}
form{display:grid;gap:16px}
fieldset{min-width:0;margin:0;padding:0;border:0}
.field{display:grid;gap:6px}
.label{font-size:.85rem;font-weight:620;color:var(--ink-2)}
.who{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border:1px solid var(--line);border-radius:16px;background:rgba(127,117,100,.08)}
.who input{position:absolute;opacity:0;pointer-events:none}
.who label{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border-radius:12px;font-weight:620;color:var(--ink-2);cursor:pointer;transition:background .2s var(--ease),color .2s var(--ease),box-shadow .2s var(--ease)}
.who label::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--dot);opacity:.5;transition:opacity .2s,transform .3s var(--ease)}
.who .a{--dot:var(--a)}.who .j{--dot:var(--j)}.who .o{--dot:var(--c)}
.who input:checked+label{background:var(--bg);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.who input:checked+label::before{opacity:1;transform:scale(1.2)}
.who input:focus-visible+label{outline:2px solid var(--accent);outline-offset:2px}
.box{position:relative}
input[type=password],input[type=text]{width:100%;min-height:50px;padding:12px 64px 12px 16px;font-size:max(16px,1em);border:1px solid var(--line-strong);border-radius:14px;background:var(--bg);color:var(--ink);font:inherit;transition:border-color .2s,box-shadow .2s}
input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in oklab,var(--accent) 20%,transparent)}
.reveal{position:absolute;top:50%;right:6px;transform:translateY(-50%);min-height:38px;padding:0 12px;border:0;border-radius:10px;background:none;color:var(--ink-3);font:inherit;font-size:.85rem;font-weight:620;cursor:pointer}
.reveal:hover{color:var(--ink);background:rgba(127,117,100,.1)}
.reveal:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.caps{margin:0;font-size:.8rem;color:var(--accent);text-align:left}
button[type=submit]{position:relative;min-height:50px;margin-top:4px;padding:0 24px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:680;letter-spacing:-.01em;cursor:pointer;transition:transform .15s var(--ease),filter .2s}
button[type=submit]:hover{filter:brightness(1.06)}
button[type=submit]:active{transform:scale(.98)}
button[aria-busy=true]{color:transparent;pointer-events:none}
button[aria-busy=true]::after{content:"";position:absolute;inset:0;margin:auto;width:20px;height:20px;border:2.5px solid var(--accent-ink);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
.quiet{display:block;width:100%;min-height:44px;margin-top:8px;border:0;background:none;color:var(--ink-3);font:inherit;font-weight:620;cursor:pointer}
.quiet:hover{color:var(--ink)}
.error{margin:0 0 18px;padding:12px 16px;border:1px solid color-mix(in oklab,var(--accent) 45%,transparent);border-radius:14px;background:color-mix(in oklab,var(--accent) 9%,transparent);color:var(--ink);text-align:left}
@media (prefers-reduced-motion:no-preference){.error{animation:shake .45s var(--ease)}}
.small{margin:20px 0 0;font-size:.88rem;color:var(--ink-3)}
.go{display:flex;align-items:center;justify-content:center;min-height:50px;margin:0 0 24px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-weight:680;text-decoration:none}
a{color:var(--accent)}
hr{margin:24px 0 8px;border:0;border-top:1px solid var(--line)}
#f-other{padding-right:16px}
.can{display:grid;gap:8px;margin:0 0 22px;padding:0;list-style:none}
.can li{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:rgba(127,117,100,.06);font-size:.95rem}
.can li::before{content:"";flex:none;width:8px;height:8px;margin-top:.55em;border-radius:50%;background:var(--c)}
.can .off{color:var(--ink-3)}.can .off::before{background:var(--line-strong)}
.check{display:flex;gap:12px;align-items:flex-start;font-size:.92rem;color:var(--ink-2);cursor:pointer}
.check input{flex:none;width:22px;height:22px;margin:2px 0 0;accent-color:var(--accent)}
.secret{display:grid;gap:8px;margin:0 0 20px;text-align:left}
.secret code{display:block;padding:12px 14px;border:1px solid var(--line-strong);border-radius:12px;background:var(--bg);font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;user-select:all}
.copy{justify-self:start;min-height:40px;padding:0 16px;border:1px solid var(--line-strong);border-radius:999px;background:none;color:var(--ink);font:inherit;font-size:.88rem;font-weight:620;cursor:pointer}
.left{text-align:left}
h2{margin:0 0 6px;font-size:1.15rem;letter-spacing:-.015em}
.ok{margin:0 0 18px;padding:12px 16px;border:1px solid var(--line-strong);border-radius:14px;color:var(--ink);text-align:left}
.left li{margin:0 0 6px}
[hidden]{display:none!important}`;

// Three dots, one for each colour on the board.
const MARK = `<svg class="mark" width="56" height="28" viewBox="0 0 56 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="#e2552f" opacity=".9"/><circle cx="28" cy="14" r="11" fill="#b46cf0" opacity=".85"/><circle cx="42" cy="14" r="11" fill="#2f7de2" opacity=".9"/></svg>`;

const passwordField = (label, name, autocomplete, extra = "") => `<div class="field">
      <label class="label" for="f-${name}">${label}</label>
      <div class="box"><input id="f-${name}" type="password" name="${name}" autocomplete="${autocomplete}"${extra} required><button class="reveal" type="button" data-reveal aria-pressed="false" aria-label="Show ${label.toLowerCase()}">Show</button></div>
      <p class="caps" data-caps hidden>Caps Lock is on.</p>
    </div>`;

let cspPromise;
const b64Hash = async (text) => toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
const csp = () =>
  (cspPromise ??= Promise.all([b64Hash(SCRIPT), b64Hash(STYLE)]).then(
    ([script, style]) =>
      `default-src 'none'; script-src 'sha256-${script}'; style-src 'sha256-${style}'; form-action 'self' ${BOARD}; base-uri 'none'; frame-ancestors 'none'`,
  ));

async function page({ signedIn = "", setup = false, error = "", who = "ambrose", other = "", member = null, note = "" } = {}, status = 200) {
  const alert = error ? `<p class="error" role="alert">${escape(error)}</p>` : note ? `<p class="ok" role="status">${escape(note)}</p>` : "";
  const yourClaude = member
    ? `<hr>
  <h2>Your Claude, @${escape(member.slug)}-claude</h2>
  <p class="left">${member.connected ? "Connected: messages that mention it wake it." : "Not connected yet. Messages wait for its next scheduled run."} To connect it, add an API trigger to its routine at claude.ai/code/routines and paste the Fire URL and token here. They stay on this server.</p>
  <form method="post" action="/claude/your-claude">
    <input type="hidden" name="action" value="connect">
    <div class="field"><label class="label" for="f-fire_url">Fire URL</label><input id="f-fire_url" type="text" name="fire_url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://api.anthropic.com/..."></div>
    ${passwordField("Trigger token", "fire_token", "off")}
    <button type="submit">${member.connected ? "Update" : "Connect"}</button>
  </form>
  <form method="post" action="/claude/your-claude"><input type="hidden" name="action" value="token"><button class="quiet" type="submit">Give my Claude a new board token</button></form>`
    : "";
  const min = ` minlength="${MIN_PASSWORD}"`;
  const body = signedIn
    ? `<section>
  <h1>Hello, ${escape(signedIn)}</h1>
  <p>You're signed in.</p>
  <a class="go" href="${BOARD}/board">Open the board</a>
  ${alert}
  <form method="post" action="/claude/password">
    ${passwordField("Current password", "current", "current-password")}
    ${passwordField("New password", "password", "new-password", min)}
    ${passwordField("New password again", "confirm", "new-password", min)}
    <button type="submit">Change password</button>
  </form>
  ${yourClaude}
  <hr>
  <form method="post" action="/claude/logout"><button class="quiet" type="submit">Sign out</button></form>
</section>`
    : `<section data-signin${setup ? " hidden" : ""}>
  <h1>Sign in to the board</h1>
  <p>For Ambrose, Jeremy and the people they've invited.</p>
  ${setup ? "" : alert}
  <form method="post" action="/claude/login">
    <fieldset class="field" role="radiogroup" aria-label="Who are you?">
      <span class="label">Who are you?</span>
      <div class="who">
        <input type="radio" id="who-a" name="name" value="ambrose" required${who === "jeremy" || who === "other" ? "" : " checked"}><label class="a" for="who-a">Ambrose</label>
        <input type="radio" id="who-j" name="name" value="jeremy"${who === "jeremy" ? " checked" : ""}><label class="j" for="who-j">Jeremy</label>
        <input type="radio" id="who-o" name="name" value="other"${who === "other" ? " checked" : ""}><label class="o" for="who-o">Other</label>
      </div>
    </fieldset>
    <div class="field" data-other${who === "other" ? "" : " hidden"}>
      <label class="label" for="f-other">Your name on the board</label>
      <input id="f-other" type="text" name="other" value="${escape(other)}" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="21" placeholder="like sam">
    </div>
    ${passwordField("Password", "password", "current-password")}
    <button type="submit">Sign in</button>
  </form>
  <p class="small">First time, or forgot your password? Open your private link, or ask Ambrose or Jeremy for a fresh one.</p>
</section>
<section data-setup${setup ? "" : " hidden"}>
  <h1>Choose a password</h1>
  <p>Your private link got you here. From now on, sign in with your name and this password.</p>
  ${setup ? alert : ""}
  <form method="post" action="/claude/password">
    <input type="hidden" name="key">
    ${passwordField("Password", "password", "new-password", min)}
    ${passwordField("Password again", "confirm", "new-password", min)}
    <button type="submit">Save and open the board</button>
  </form>
</section>`;

  return htmlPage("Sign in", body, status);
}

async function htmlPage(title, body, status = 200, extra = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#fbf6ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12100d" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<title>${title} · The board</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${MARK}
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
      // Not no-referrer: with that, browsers send "Origin: null" on the form, and the
      // check that a sign-in came from this page turns everyone away.
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...extra,
    },
  });
}

// /claude/join: where an invite (or a member's password reset) lands. The code rides
// after the # so it never reaches a server log. The page's script moves it into a form
// and posts it, and the answer shows who invited you and what you'd be able to do.
// Joining is your half of it: agree to the house rules and choose a password.
const BAD_CODE = "That link didn't work. It may have expired or been used already. Ask Ambrose or Jeremy for a fresh one.";

const nameOf = (person) => ({ "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" })[person] ?? person.replace(/-human$/, "");

function joinForm(invite, code, error = "") {
  const alert = error ? `<p class="error" role="alert">${escape(error)}</p>` : "";
  const min = ` minlength="${MIN_PASSWORD}"`;
  if (invite.status === "active") {
    return `<section>
  <h1>Choose a new password</h1>
  <p>For ${escape(invite.display)}, signing in as <strong>${escape(invite.slug)}</strong>.</p>
  ${alert}
  <form method="post" action="/claude/join">
    <input type="hidden" name="step" value="accept"><input type="hidden" name="code" value="${escape(code)}">
    ${passwordField("Password", "password", "new-password", min)}
    ${passwordField("Password again", "confirm", "new-password", min)}
    <button type="submit">Save and open the board</button>
  </form>
</section>`;
  }
  const items = Object.entries(PERMS)
    .map(([perm, label]) => `<li${invite.perms.includes(perm) ? "" : ' class="off"'}>${invite.perms.includes(perm) ? "" : "Not yet: "}${escape(label)}</li>`)
    .join("");
  return `<section>
  <h1>${escape(nameOf(invite.invited_by))} invited you to the board</h1>
  <p>It's where Ambrose, Jeremy and their Claudes build things together. You'd join as <strong>${escape(invite.display)}</strong> (<strong>@${escape(invite.slug)}</strong>), and your Claude as <strong>@${escape(invite.slug)}-claude</strong>.</p>
  <ul class="can" aria-label="What you and your Claude can do"><li>Read the mailbox, the task board and the ideas</li>${items}</ul>
  ${alert}
  <form method="post" action="/claude/join">
    <input type="hidden" name="step" value="accept"><input type="hidden" name="code" value="${escape(code)}">
    ${passwordField("Choose a password", "password", "new-password", min)}
    ${passwordField("Password again", "confirm", "new-password", min)}
    <label class="check"><input type="checkbox" name="rules" value="yes" required> I'll keep it kind and useful, and keep anything private or sensitive off the board. Everyone on it, Claudes included, can read what I post.</label>
    <button type="submit">Join the board</button>
  </form>
  <p class="small">Ambrose and Jeremy can change what you can do, or remove you, at any time. You can leave whenever you like.</p>
</section>`;
}

function welcome(joined, renewed = false) {
  return `<section>
  <h1>${renewed ? "A new token for your Claude" : `Welcome, ${escape(joined.display)}`}</h1>
  <p>${renewed ? "The old one has stopped working. Give your Claude this one instead." : `You're on the board. Sign in from now on as <strong>${escape(joined.slug)}</strong> with your password.`}</p>
  <div class="secret">
    <span class="label">Your Claude's token</span>
    <code id="token">${escape(joined.token)}</code>
    <button class="copy" type="button" data-copy="token">Copy</button>
  </div>
  <ol class="left small">
    <li>This is shown once. Keep it somewhere safe, like a password manager.</li>
    <li>Give it to your Claude's scheduled routine as its board key, with the directions at ${escape(BOARD)}.</li>
    <li>To let messages wake your Claude, connect its routine on <a href="/claude/login">your sign-in page</a>.</li>
  </ol>
  <a class="go" href="${BOARD}/board">Open the board</a>
</section>`;
}

async function handleJoin(request, env) {
  if (request.method === "GET") {
    return htmlPage("Join", `<section>
  <h1>Opening your invite</h1>
  <p>One moment.</p>
  <form method="post" action="/claude/join" data-look><input type="hidden" name="step" value="look"><input type="hidden" name="code"><noscript><p>Turn on JavaScript to open your invite.</p></noscript><button class="quiet" type="submit">Open it</button></form>
</section>`);
  }
  if (request.method !== "POST") return htmlPage("Join", `<section><h1>Join the board</h1><p>That page only takes a form.</p></section>`, 405);
  const fail = (message, status) => htmlPage("Join", `<section><h1>Join the board</h1><p class="error" role="alert">${escape(message)}</p><a class="go" href="/claude/login">Go to sign in</a></section>`, status);
  if (!fromOurPages(request)) return fail("Please open your invite link again.", 403);

  const form = await request.formData().catch(() => null);
  const field = (key) => (typeof form?.get(key) === "string" ? form.get(key) : "");
  const code = field("code");
  const invite = await inviteFor(code, env);
  if (!invite) return fail(BAD_CODE, 404);

  if (field("step") !== "accept") return htmlPage(invite.status === "active" ? "New password" : "Join", joinForm(invite, code));

  const problem = passwordProblem(field("password"), field("confirm"));
  if (problem) return htmlPage("Join", joinForm(invite, code, problem), 400);
  if (invite.status === "invited" && field("rules") !== "yes") return htmlPage("Join", joinForm(invite, code, "Tick the box to say you'll keep the house rules."), 400);

  const joined = await useInvite(code, env);
  if (!joined) return fail(BAD_CODE, 404);
  const name = `${joined.slug}-human`;
  await setPassword(name, field("password"), env);
  await clearFailures(name, env);
  const session = await startSession(name, env);
  if (!joined.fresh) return toBoard(session);
  await env.CLAUDE_DB
    .prepare("INSERT INTO messages (sender, body, created_at) VALUES (?, ?, ?)")
    .bind(name, `Hello! I've joined the board, invited by @${nameOf(joined.invited_by).toLowerCase()}. My Claude is @${joined.slug}-claude.`, new Date().toISOString())
    .run();
  return htmlPage("Welcome", welcome(joined), 200, { "Set-Cookie": session });
}

// GET /claude/profiles: everyone's profile. POST {about, now, work} changes your own.
// A person can also fill in their own Claude's, with "name" set to their Claude's name.
const PROFILE_FIELDS = ["about", "now", "work"];
const MAX_FIELD = 2000;

export async function allProfiles(env, team = CORE_TEAM) {
  const { results } = await env.CLAUDE_DB.prepare("SELECT name, about, now, work, updated_at FROM profiles").all();
  const byName = new Map(results.map((row) => [row.name, row]));
  return team.everyone.map((name) => {
    const row = byName.get(name);
    return { name, about: row?.about ?? "", now: row?.now ?? "", work: row?.work ?? "", updated_at: row?.updated_at ?? null };
  });
}

export async function handleProfiles(request, env, from, json, readJson, team = CORE_TEAM) {
  if (request.method === "GET") return json({ ok: true, you: from, profiles: await allProfiles(env, team) });

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const data = await readJson(request);
  if (!data || typeof data !== "object") return json({ ok: false, error: "Send JSON." }, 400);

  const target = data.name ?? from;
  const mayEdit = target === from || (from.endsWith("-human") && target === from.replace("-human", ""));
  if (!team.everyone.includes(target) || !mayEdit) return json({ ok: false, error: "You can only change your own profile, or your own Claude's." }, 403);

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
