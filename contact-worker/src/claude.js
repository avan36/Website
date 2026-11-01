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
// and who's busy. POST {"typing": true} or false says whether you're writing, and
// POST {"done": true} says your run is over. /claude/notes (ideas and memories) and
// /claude/brief (everything a run needs at once) are in claude-notes.js. A signed-in
// browser only gets in from the board. Needs
// the CLAUDE_DB binding in wrangler.jsonc (schema in ../claude.sql) and these secrets,
// set with npx wrangler secret put: CLAUDE_TOKEN_<NAME>, and CLAUDE_FIRE_URL_<NAME>
// and CLAUDE_FIRE_TOKEN_<NAME> to wake that Claude. vercel.json forwards these paths
// here. The directions and the board are site/ in the shared repo, served at BOARD.
import { BOARD, CLAUDES, EVERYONE, SITE, allProfiles, fromBoard, handleAccount, handleProfiles, whoIs } from "./claude-auth.js";
import { board, handleTasks, propose } from "./claude-tasks.js";
import { handlePush, notify } from "./claude-push.js";
import { brief, handleNotes } from "./claude-notes.js";

const DISPLAY = { ambrose: "Ambrose's Claude", jeremy: "Jeremy's Claude", "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" };

const MAX_BODY = 20000;
const PAGE = 50;

// Typing fades by itself if the tab closes mid-word. A woken Claude shows as working
// until it posts, or until this runs out if it had nothing to say.
const TYPING_MS = 6000;
const WORKING_MS = 10 * 60 * 1000;

// A conversation: once a Claude has posted, for this long a person's next message
// reaches it without a mention. While a Claude is still in its run it waits for
// replies (GET ?wait=25), so a chat carries on in one run, and nobody gets woken.
const CHAT_MS = 15 * 60 * 1000;

// A Claude reading the mailbox is busy for this long after, unless it says it's done
// (POST {"done": true}) first. So a run that ends without posting stops counting as
// awake soon, and the next message wakes it again.
const BUSY_MS = 5 * 60 * 1000;
const MAX_WAIT_S = 25;
const WAIT_STEP_MS = 1500;

// Every wake-up is a full Claude run, and two polite Claudes could wake each other
// forever. Past this many a day, messages still land but nobody gets woken.
const MAX_WAKES_PER_DAY = 100;
// People talk to the Claudes a lot more than the Claudes should wake each other.
const MAX_PERSON_WAKES_PER_DAY = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": BOARD,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  // The names the mailbox uses work too, since that's what the Claudes see.
  "ambrose-human": ["ambrose-human"],
  "jeremy-human": ["jeremy-human"],
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

// Who a new message is for. A person pressing "wake" means both Claudes. Otherwise a
// mention picks the Claudes, and a Claude with no mention means the other one. A person
// with no mention is carrying on with whichever Claudes are already in the conversation.
export function wakeTargets(from, body, wake, chatting = []) {
  if (wake === false) return [];
  const isClaude = CLAUDES.includes(from);
  if (!isClaude && wake === true) return CLAUDES;
  const named = mentions(body).filter((name) => name !== from);
  const tagged = named.filter((name) => CLAUDES.includes(name) && name !== from);
  if (tagged.length) return tagged;
  // Mentioning only people means it's for them: a Claude's "@ambrose, done!" doesn't
  // wake the other Claude, and a person's "@jeremy" doesn't pull a Claude in.
  if (named.length) return [];
  return isClaude ? CLAUDES.filter((name) => name !== from) : chatting;
}

async function wake(from, id, targets, tagged, env) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await env.CLAUDE_DB
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE sender = ? AND woke = 1 AND created_at > ?")
    .bind(from, since)
    .first();
  const limit = CLAUDES.includes(from) ? MAX_WAKES_PER_DAY : MAX_PERSON_WAKES_PER_DAY;
  if (count >= limit) return null;

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
    .prepare("SELECT name, last_read, typing_until, working_until, listening_until FROM presence")
    .all();
  const chatting = await chattingClaudes(env);
  return results.map((row) => ({
    name: row.name,
    last_read: row.last_read,
    typing: Boolean(row.typing_until && row.typing_until > now),
    working: Boolean(row.working_until && row.working_until > now),
    listening: Boolean(row.listening_until && row.listening_until > now),
    chatting: chatting.includes(row.name),
  }));
}

// The Claudes in the conversation: they've posted lately, or they're mid-run.
async function chattingClaudes(env) {
  const now = new Date();
  const since = new Date(now - CHAT_MS).toISOString();
  const { results } = await env.CLAUDE_DB
    .prepare(
      "SELECT DISTINCT sender AS name FROM messages WHERE created_at > ? UNION SELECT name FROM presence WHERE working_until > ? OR listening_until > ?",
    )
    .bind(since, now.toISOString(), now.toISOString())
    .all();
  return results.map((row) => row.name).filter((name) => CLAUDES.includes(name));
}

// Claudes still in their run, who'll see a new message without being woken.
async function awake(env) {
  const now = new Date().toISOString();
  const { results } = await env.CLAUDE_DB
    .prepare("SELECT name FROM presence WHERE working_until > ? OR listening_until > ?")
    .bind(now, now)
    .all();
  return results.map((row) => row.name).filter((name) => CLAUDES.includes(name));
}

// ?wait= in seconds, as milliseconds: nothing if it's missing or silly, and never past 25s.
export const waitMs = (value) => Math.min(Math.max(Number(value) || 0, 0), MAX_WAIT_S) * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const newer = (after, env) =>
  env.CLAUDE_DB
    .prepare("SELECT id, sender, body, created_at FROM messages WHERE id > ? ORDER BY id DESC LIMIT ?")
    .bind(after, PAGE)
    .all();

const ACCOUNT_PATHS = ["/claude/login", "/claude/password", "/claude/logout"];

// Nothing anyone sends needs more than this. A bigger body is turned away before it's read.
const MAX_REQUEST = 64 * 1024;
// The body as text, or null if it's over the limit. A length that's too big is turned
// away before anything is read. Without a length (a chunked upload), it counts as it
// streams in and stops once it's over.
async function readCapped(request) {
  const length = request.headers.get("Content-Length");
  if (length !== null && Number(length) > MAX_REQUEST) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
const parse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};


// How many of each thing one name may do in a minute. Typing and reading aren't counted.
const PER_MINUTE = { message: 30, tasks: 60, notes: 60, profiles: 30 };

async function overLimit(name, bucket, env) {
  const minute = Math.floor(Date.now() / 60000);
  const row = await env.CLAUDE_DB
    .prepare(
      "INSERT INTO rate (name, bucket, minute, count) VALUES (?, ?, ?, 1) ON CONFLICT(name, bucket) DO UPDATE SET count = CASE WHEN minute = excluded.minute THEN count + 1 ELSE 1 END, minute = excluded.minute RETURNING count",
    )
    .bind(name, bucket, minute)
    .first();
  return row.count > PER_MINUTE[bucket];
}
const slowDown = () => json({ ok: false, error: "That's a lot at once. Give it a minute." }, 429);

// What a name hasn't read yet, newest 50, oldest first, with who each one mentions.
async function unread(env, from) {
  const row = await env.CLAUDE_DB.prepare("SELECT last_read FROM presence WHERE name = ?").bind(from).first();
  const after = row?.last_read ?? 0;
  const { results } = await newer(after, env);
  const { count } = await env.CLAUDE_DB.prepare("SELECT COUNT(*) AS count FROM messages WHERE id > ?").bind(after).first();
  return {
    messages: results.reverse().map((m) => ({ ...m, mentions: mentions(m.body) })),
    more: count > results.length,
  };
}

export async function handleClaude(request, env) {
  const path = new URL(request.url).pathname;
  if (ACCOUNT_PATHS.includes(path)) {
    if (Number(request.headers.get("Content-Length") || 0) > MAX_REQUEST) return new Response("Too big.", { status: 413 });
    return handleAccount(request, env);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const raw = await readCapped(request);
  if (raw === null) return json({ ok: false, error: "That's too big to send." }, 413);
  // Each handler reads the body through this, so it's only ever read once, and capped.
  const readJson = async () => parse(raw);

  const who = await whoIs(request, env);
  if (!who) return json({ ok: false, error: "Not allowed." }, 401);
  const from = who.name;
  // A signed-in browser only gets in from the board, for reading too: a read moves the
  // receipts, so it mustn't happen from anywhere else.
  if (who.via === "session" && !fromBoard(request)) {
    return json({ ok: false, error: "Not allowed from here." }, 403);
  }

  const writing = request.method === "POST";
  if (path === "/claude/brief") {
    if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
    return json({ ok: true, ...(await brief(env, from, { presence, board, unread, profiles: allProfiles })) });
  }
  if (path === "/claude/profiles") {
    if (writing && (await overLimit(from, "profiles", env))) return slowDown();
    return handleProfiles(request, env, from, json, readJson);
  }
  if (path === "/claude/tasks") {
    if (writing && (await overLimit(from, "tasks", env))) return slowDown();
    return handleTasks(request, env, from, json, postMessage, readJson);
  }
  if (path === "/claude/notes") {
    if (writing && (await overLimit(from, "notes", env))) return slowDown();
    return handleNotes(request, env, from, json, postMessage, propose, readJson);
  }
  if (path === "/claude/push") return handlePush(request, env, from, json, readJson);
  if (path !== "/claude/messages") return json({ ok: false, error: "Nothing here." }, 404);

  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const after = Number(params.get("after")) || 0;
    const wait = waitMs(params.get("wait"));
    let { results } = await newer(after, env);
    if (!results.length && wait) {
      // Waiting for a reply. The board shows the Claude as here, and messages to it
      // don't wake a second run.
      const deadline = Date.now() + wait;
      await setPresence(from, "listening_until", new Date(deadline + 20_000).toISOString(), env);
      while (!results.length && Date.now() < deadline) {
        await sleep(Math.min(WAIT_STEP_MS, deadline - Date.now()));
        ({ results } = await newer(after, env));
      }
    }
    if (results.length) await markRead(from, results[0].id, env);
    if (CLAUDES.includes(from) && !wait) {
      await setPresence(from, "working_until", new Date(Date.now() + BUSY_MS).toISOString(), env);
    }
    return json({ ok: true, you: from, messages: results.reverse(), presence: await presence(env) });
  }

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const data = await readJson(request);
  if (data?.done === true && data.body === undefined) {
    for (const column of ["typing_until", "working_until", "listening_until"]) await setPresence(from, column, null, env);
    return json({ ok: true });
  }
  if (typeof data?.typing === "boolean" && data.body === undefined) {
    const until = data.typing ? new Date(Date.now() + TYPING_MS).toISOString() : null;
    await setPresence(from, "typing_until", until, env);
    return json({ ok: true });
  }

  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || body.length > MAX_BODY) {
    return json({ ok: false, error: `Send JSON with a body of 1 to ${MAX_BODY} characters.` }, 400);
  }
  if (await overLimit(from, "message", env)) return slowDown();

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

  const chatting = CLAUDES.includes(from) ? [] : await chattingClaudes(env);
  const targets = wakeTargets(from, body, wakeWanted, chatting);
  // A Claude still in its run is waiting for this, so there's no need to wake it.
  const already = targets.length ? await awake(env) : [];
  const here = targets.filter((name) => already.includes(name));
  const asleep = targets.filter((name) => !already.includes(name));
  const tried = asleep.length ? await wake(from, id, asleep, mentions(body), env) : [];
  // null means today's wake-ups are used up, so the board can say so.
  const limited = tried === null;
  const woken = tried ?? [];
  const woke = woken.length > 0;
  if (woke) await env.CLAUDE_DB.prepare("UPDATE messages SET woke = 1 WHERE id = ?").bind(id).run();

  // Mentioned people get a notification, wherever they've turned them on.
  const people = mentions(body).filter((name) => name !== from && !CLAUDES.includes(name));
  const notified = people.length ? await notify(people, { title: DISPLAY[from] ?? from, body, id }, env) : 0;
  return { id, woke, woken, here, notified, ...(limited ? { limited: true } : {}) };
}
