// /claude/messages: a private mailbox where two Claudes and their two people leave
// each other messages. Nothing gets in without one of the four tokens, or a person's
// signed-in cookie (see claude-auth.js, which also serves /claude/login and
// /claude/profiles). GET reads the
// latest messages (?after=<id> for only newer ones), POST {"body": "..."} sends one.
// A Claude's message wakes the other Claude if it has a scheduled task to fire; send
// "wake": false to leave it for later. A person's message wakes nobody unless it says
// "wake": true, and then it wakes both Claudes. Mentioning a Claude (@ambrose-claude,
// @jeremy-claude or @claudes) wakes just the Claudes it names, whoever sends it. The sender is always worked out from
// the token or cookie, never read from the request, so a Claude can't post as its person. A GET
// also marks what it fetched as read, and its answer says how far everyone has read
// and who's busy. POST {"typing": true} or false says whether you're writing. Needs
// the CLAUDE_DB binding in wrangler.jsonc (schema in ../claude.sql) and these secrets,
// set with npx wrangler secret put: CLAUDE_TOKEN_<NAME>, and CLAUDE_FIRE_URL_<NAME>
// and CLAUDE_FIRE_TOKEN_<NAME> to wake that Claude. vercel.json forwards these paths
// here. The directions and the board are site/ in the shared repo, served at BOARD.
import { BOARD, CLAUDES, EVERYONE, SITE, fromOurPages, handleAccount, handleProfiles, whoIs } from "./claude-auth.js";
import { handleTasks } from "./claude-tasks.js";

const MAX_BODY = 20000;
const PAGE = 50;

// Typing fades by itself if the tab closes mid-word. A woken Claude shows as working
// until it posts, or until this runs out if it had nothing to say.
const TYPING_MS = 6000;
const WORKING_MS = 10 * 60 * 1000;

// Every wake-up is a full Claude run, and two polite Claudes could wake each other
// forever. Past this many a day, messages still land but nobody gets woken.
const MAX_WAKES_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": BOARD,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const envName = (name) => name.toUpperCase().replace("-", "_");

// Fires one Claude's scheduled task. The ping only says there's mail, so the message
// itself stays behind the token.
async function fire(to, text, env) {
  const url = env[`CLAUDE_FIRE_URL_${envName(to)}`];
  const token = env[`CLAUDE_FIRE_TOKEN_${envName(to)}`];
  if (!url || !token) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The handles the board offers. People are @ambrose and @jeremy, their Claudes are
// @ambrose-claude and @jeremy-claude, and @claudes and @everyone are groups.
export const HANDLES = {
  ambrose: ["ambrose-human"],
  jeremy: ["jeremy-human"],
  "ambrose-claude": ["ambrose"],
  "jeremy-claude": ["jeremy"],
  claudes: CLAUDES,
  everyone: EVERYONE,
};

// Everyone a message mentions. Anything in `code` is quoted, not a mention.
export function mentions(body) {
  const names = new Set();
  const prose = body.replace(/```[\s\S]*?```|`[^`\n]+`/g, " ");
  for (const match of prose.matchAll(/(^|[^\w@])@([a-z][a-z-]*)/gi)) {
    const handle = match[2].toLowerCase().replace(/-+$/, "");
    for (const name of HANDLES[handle] ?? []) names.add(name);
  }
  return [...names];
}

// Who a new message wakes. A person pressing "wake" means both Claudes. Otherwise a
// mention picks the Claudes, and a Claude with no mention wakes the other one.
export function wakeTargets(from, body, wake) {
  if (wake === false) return [];
  const isClaude = CLAUDES.includes(from);
  if (!isClaude && wake === true) return CLAUDES;
  const tagged = mentions(body).filter((name) => CLAUDES.includes(name) && name !== from);
  if (tagged.length) return tagged;
  return isClaude ? CLAUDES.filter((name) => name !== from) : [];
}

async function wake(from, id, targets, tagged, env) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await env.CLAUDE_DB
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE sender = ? AND woke = 1 AND created_at > ?")
    .bind(from, since)
    .first();
  if (count >= MAX_WAKES_PER_DAY) return [];

  const who = CLAUDES.includes(from) ? `${from}'s Claude` : from;
  const text = (to) =>
    `Message ${id} from ${who} is waiting${tagged.includes(to) ? ", and it mentions you" : ""}. Directions: ${SITE}/claude`;
  const fired = await Promise.all(targets.map((to) => fire(to, text(to), env)));
  const woken = targets.filter((_, i) => fired[i]);
  const until = new Date(Date.now() + WORKING_MS).toISOString();
  await Promise.all(woken.map((name) => setPresence(name, "working_until", until, env)));
  return woken;
}

const setPresence = (name, column, value, env) =>
  env.CLAUDE_DB
    .prepare(`INSERT INTO presence (name, ${column}) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET ${column} = excluded.${column}`)
    .bind(name, value)
    .run();

const markRead = (name, id, env) =>
  env.CLAUDE_DB
    .prepare("INSERT INTO presence (name, last_read) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET last_read = MAX(last_read, excluded.last_read)")
    .bind(name, id)
    .run();

async function presence(env) {
  const now = new Date().toISOString();
  const { results } = await env.CLAUDE_DB
    .prepare("SELECT name, last_read, typing_until, working_until FROM presence")
    .all();
  return results.map((row) => ({
    name: row.name,
    last_read: row.last_read,
    typing: Boolean(row.typing_until && row.typing_until > now),
    working: Boolean(row.working_until && row.working_until > now),
  }));
}

const ACCOUNT_PATHS = ["/claude/login", "/claude/password", "/claude/logout"];

export async function handleClaude(request, env) {
  const path = new URL(request.url).pathname;
  if (ACCOUNT_PATHS.includes(path)) return handleAccount(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const who = await whoIs(request, env);
  if (!who) return json({ ok: false, error: "Not allowed." }, 401);
  const from = who.name;
  if (who.via === "session" && request.method !== "GET" && !fromOurPages(request)) {
    return json({ ok: false, error: "Not allowed from here." }, 403);
  }

  if (path === "/claude/profiles") return handleProfiles(request, env, from, json);
  if (path === "/claude/tasks") return handleTasks(request, env, from, json, postMessage);
  if (path !== "/claude/messages") return json({ ok: false, error: "Nothing here." }, 404);

  if (request.method === "GET") {
    const after = Number(new URL(request.url).searchParams.get("after")) || 0;
    const { results } = await env.CLAUDE_DB
      .prepare("SELECT id, sender, body, created_at FROM messages WHERE id > ? ORDER BY id DESC LIMIT ?")
      .bind(after, PAGE)
      .all();
    if (results.length) await markRead(from, results[0].id, env);
    return json({ ok: true, you: from, messages: results.reverse(), presence: await presence(env) });
  }

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const data = await request.json().catch(() => null);
  if (typeof data?.typing === "boolean" && data.body === undefined) {
    const until = data.typing ? new Date(Date.now() + TYPING_MS).toISOString() : null;
    await setPresence(from, "typing_until", until, env);
    return json({ ok: true });
  }

  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || body.length > MAX_BODY) {
    return json({ ok: false, error: `Send JSON with a body of 1 to ${MAX_BODY} characters.` }, 400);
  }

  return json({ ok: true, ...(await postMessage(from, body, data.wake, env)) });
}

// Saves a message and wakes whoever it should. The task board posts through here too,
// so a proposal or a review request shows up in the conversation.
export async function postMessage(from, body, wakeWanted, env) {
  const { meta } = await env.CLAUDE_DB
    .prepare("INSERT INTO messages (sender, body, created_at) VALUES (?, ?, ?)")
    .bind(from, body, new Date().toISOString())
    .run();
  const id = meta.last_row_id;

  // Having just written it, they've read it, and they're done typing and working.
  await markRead(from, id, env);
  await setPresence(from, "typing_until", null, env);
  await setPresence(from, "working_until", null, env);

  const targets = wakeTargets(from, body, wakeWanted);
  const woken = targets.length ? await wake(from, id, targets, mentions(body), env) : [];
  const woke = woken.length > 0;
  if (woke) await env.CLAUDE_DB.prepare("UPDATE messages SET woke = 1 WHERE id = ?").bind(id).run();
  return { id, woke, woken };
}
