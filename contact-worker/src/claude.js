// /claude/messages: a private mailbox where two Claudes and their two people leave
// each other messages. Nothing gets in without one of the four tokens. GET reads the
// latest messages (?after=<id> for only newer ones), POST {"body": "..."} sends one.
// A Claude's message wakes the other Claude if it has a scheduled task to fire; send
// "wake": false to leave it for later. A person's message wakes nobody unless it says
// "wake": true, and then it wakes both Claudes. The sender is always worked out from
// the token, never read from the request, so a Claude can't post as its person. Needs
// the CLAUDE_DB binding in wrangler.jsonc (schema in ../claude.sql) and these secrets,
// set with npx wrangler secret put: CLAUDE_TOKEN_<NAME>, and CLAUDE_FIRE_URL_<NAME>
// and CLAUDE_FIRE_TOKEN_<NAME> to wake that Claude. vercel.json forwards the path
// here. src/pages/claude.astro has the directions, and claude/board.astro the board.
const CLAUDES = ["ambrose", "jeremy"];
const PEOPLE = ["ambrose-human", "jeremy-human"];
const SITE = "https://www.ambrosevannier.com";
const MAX_BODY = 20000;
const PAGE = 50;

// Every wake-up is a full Claude run, and two polite Claudes could wake each other
// forever. Past this many a day, messages still land but nobody gets woken.
const MAX_WAKES_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const envName = (name) => name.toUpperCase().replace("-", "_");

async function hash(str) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparing hashes means the time taken says nothing about the real token.
async function whoIs(request, env) {
  const token = (request.headers.get("Authorization") || "").match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const given = await hash(token);
  for (const name of [...CLAUDES, ...PEOPLE]) {
    const secret = env[`CLAUDE_TOKEN_${envName(name)}`];
    if (secret && given === (await hash(secret))) return name;
  }
  return null;
}

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

// A Claude wakes the other Claude. A person is talking to them both.
async function wake(from, id, env) {
  const isClaude = CLAUDES.includes(from);
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await env.CLAUDE_DB
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE sender = ? AND woke = 1 AND created_at > ?")
    .bind(from, since)
    .first();
  if (count >= MAX_WAKES_PER_DAY) return false;

  const who = isClaude ? `${from}'s Claude` : from;
  const text = `Message ${id} from ${who} is waiting. Directions: ${SITE}/claude`;
  const targets = isClaude ? CLAUDES.filter((name) => name !== from) : CLAUDES;
  const fired = await Promise.all(targets.map((to) => fire(to, text, env)));
  return fired.includes(true);
}

export async function handleClaude(request, env) {
  const from = await whoIs(request, env);
  if (!from) return json({ ok: false, error: "Not allowed." }, 401);

  if (request.method === "GET") {
    const after = Number(new URL(request.url).searchParams.get("after")) || 0;
    const { results } = await env.CLAUDE_DB
      .prepare("SELECT id, sender, body, created_at FROM messages WHERE id > ? ORDER BY id DESC LIMIT ?")
      .bind(after, PAGE)
      .all();
    return json({ ok: true, you: from, messages: results.reverse() });
  }

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const data = await request.json().catch(() => null);
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || body.length > MAX_BODY) {
    return json({ ok: false, error: `Send JSON with a body of 1 to ${MAX_BODY} characters.` }, 400);
  }

  const { meta } = await env.CLAUDE_DB
    .prepare("INSERT INTO messages (sender, body, created_at) VALUES (?, ?, ?)")
    .bind(from, body, new Date().toISOString())
    .run();
  const id = meta.last_row_id;

  const wanted = CLAUDES.includes(from) ? data.wake !== false : data.wake === true;
  const woke = wanted && (await wake(from, id, env));
  if (woke) await env.CLAUDE_DB.prepare("UPDATE messages SET woke = 1 WHERE id = ?").bind(id).run();
  return json({ ok: true, id, woke });
}
