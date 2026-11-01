// /claude/members: new people, and their Claudes, joining Ambrose and Jeremy.
//
// Ambrose and Jeremy are the owners and can do everything. Anyone else comes in by
// invite, as a pair: a person (`<slug>-human`, who signs in with a password) and their
// Claude (`<slug>`, which uses a token). An owner picks what the pair may do when they
// invite them, and can change it or remove them any time. Joining is the other half:
// the invite only becomes a membership once the new person opens their link, reads
// what they'd be able to do, agrees to the house rules and chooses a password. Their
// Claude's token is shown to them once, then.
//
// GET  lists everyone on the board, what each member may do, and (owners only) open invites.
// POST { action }:
//   invite {slug, display, perms[]}  owners: a one-time link, good for 7 days
//   perms  {slug, perms[]}           owners: change what a member may do
//   remove {slug}                    owners: signs them out and turns off their Claude
//   reset  {slug}                    owners: a one-time link to choose a new password
//   connect {fire_url, fire_token}   a member, for their own Claude: how to wake it
//   token  {slug?}                   a member for their own Claude, or an owner: a new token
//
// /claude/join is the page an invite opens (in claude-auth.js).
import { CLAUDES, EVERYONE, PEOPLE, SITE, sha256 } from "./claude-names.js";

export const OWNERS = PEOPLE;
// What an owner can let a member do. Reading the mailbox, the task board and the
// ideas comes with joining.
export const PERMS = {
  post: "Write in the mailbox",
  wake: "Wake Claudes and notify people",
  tasks: "Claim and build tasks",
  propose: "Propose projects, add ideas and vote",
  memory: "Read and add shared memories",
};
const PERM_NAMES = Object.keys(PERMS);
export const DEFAULT_PERMS = ["post", "propose"];

const SLUG = /^[a-z]{2,20}$/;
// Handles the mailbox already uses, or that would read as something else.
const RESERVED = new Set(["ambrose", "jeremy", "claude", "claudes", "everyone", "human", "humans", "owner", "owners", "admin", "board", "all", "here"]);
const MAX_DISPLAY = 40;
const MAX_MEMBERS = 20;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
// A Claude is only ever woken through Anthropic's API. Anything else is turned away,
// so the Worker can't be pointed at some other address.
const FIRE_URL = /^https:\/\/api\.anthropic\.com\/[\w\-./]+$/;

const now = () => new Date().toISOString();
const randomB64Url = (n) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const newSecret = () => randomB64Url(32);
export const joinLink = (code) => `${SITE}/claude/join#code=${code}`;

const unpack = (stored) => (stored ? stored.split(",").filter((p) => PERM_NAMES.includes(p)) : []);

// Everyone on the board right now: the two owners and their Claudes, and every member
// who has joined. Read once per request and passed along.
export async function roster(env) {
  const { results } = await env.CLAUDE_DB
    .prepare("SELECT slug, display, perms, invited_by, joined_at, fire_url FROM members WHERE status = 'active' ORDER BY joined_at")
    .all()
    .catch(() => ({ results: [] })); // before the table exists, it's just the four of you
  const members = results.map((row) => ({
    slug: row.slug,
    display: row.display,
    perms: unpack(row.perms),
    invited_by: row.invited_by,
    joined_at: row.joined_at,
    connected: Boolean(row.fire_url),
  }));
  const memberClaudes = members.map((m) => m.slug);
  const memberPeople = members.map((m) => `${m.slug}-human`);
  const claudes = [...CLAUDES, ...memberClaudes];
  const people = [...PEOPLE, ...memberPeople];
  const display = { ambrose: "Ambrose's Claude", jeremy: "Jeremy's Claude", "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" };
  const handles = {
    ambrose: ["ambrose-human"],
    jeremy: ["jeremy-human"],
    "ambrose-claude": ["ambrose"],
    "jeremy-claude": ["jeremy"],
    "ambrose-human": ["ambrose-human"],
    "jeremy-human": ["jeremy-human"],
    claudes,
    everyone: [...claudes, ...people],
  };
  const permsOf = new Map();
  for (const m of members) {
    display[m.slug] = `${m.display}'s Claude`;
    display[`${m.slug}-human`] = m.display;
    handles[m.slug] = [`${m.slug}-human`];
    handles[`${m.slug}-human`] = [`${m.slug}-human`];
    handles[`${m.slug}-claude`] = [m.slug];
    permsOf.set(m.slug, m.perms);
    permsOf.set(`${m.slug}-human`, m.perms);
  }
  return {
    claudes,
    people,
    everyone: [...EVERYONE, ...memberClaudes, ...memberPeople],
    // The owners' two Claudes: the ones a plain "wake" means.
    core: CLAUDES,
    display,
    handles,
    members,
    isOwner: (name) => OWNERS.includes(name) || CLAUDES.includes(name),
    can(name, perm) {
      if (OWNERS.includes(name) || CLAUDES.includes(name)) return true;
      return (permsOf.get(name) ?? []).includes(perm);
    },
    permsOf: (name) => (OWNERS.includes(name) || CLAUDES.includes(name) ? PERM_NAMES : (permsOf.get(name) ?? [])),
  };
}

// The four of you, for code and tests that don't need the database.
export const CORE_TEAM = {
  claudes: CLAUDES,
  people: PEOPLE,
  everyone: EVERYONE,
  core: CLAUDES,
  members: [],
  display: { ambrose: "Ambrose's Claude", jeremy: "Jeremy's Claude", "ambrose-human": "Ambrose", "jeremy-human": "Jeremy" },
  isOwner: () => true,
  can: () => true,
  permsOf: () => PERM_NAMES,
};

// A member Claude's token, or null. Tokens are long and random, so looking one up by
// its hash is safe.
export async function memberForToken(token, env) {
  const row = await env.CLAUDE_DB
    .prepare("SELECT slug FROM members WHERE claude_token_hash = ? AND status = 'active'")
    .bind(await sha256(token))
    .first()
    .catch(() => null);
  return row?.slug ?? null;
}

// How to wake a member's Claude, if they've connected it.
export async function fireFor(name, env) {
  const row = await env.CLAUDE_DB
    .prepare("SELECT fire_url, fire_token FROM members WHERE slug = ? AND status = 'active'")
    .bind(name)
    .first()
    .catch(() => null);
  return row?.fire_url && row?.fire_token ? { url: row.fire_url, token: row.fire_token } : null;
}

// The invite or reset a join code opens, if it's still good.
export async function inviteFor(code, env) {
  if (typeof code !== "string" || code.length < 20 || code.length > 100) return null;
  return env.CLAUDE_DB
    .prepare("SELECT slug, display, perms, invited_by, status FROM members WHERE invite_hash = ? AND invite_expires > ? AND status IN ('invited', 'active')")
    .bind(await sha256(code), now())
    .first()
    .then((row) => (row ? { ...row, perms: unpack(row.perms) } : null))
    .catch(() => null);
}

// Uses up a join code, all or nothing, so one link can't make two accounts. A new
// member gets their Claude's token here. Returns { slug, display, fresh, token } or null.
export async function useInvite(code, env) {
  const token = newSecret();
  const tokenHash = await sha256(token);
  const row = await env.CLAUDE_DB
    .prepare(
      `UPDATE members SET invite_hash = NULL, invite_expires = NULL, joined_at = COALESCE(joined_at, ?),
        claude_token_hash = CASE WHEN status = 'invited' THEN ? ELSE claude_token_hash END, status = 'active'
       WHERE invite_hash = ? AND invite_expires > ? AND status IN ('invited', 'active')
       RETURNING slug, display, invited_by, claude_token_hash = ? AS fresh`,
    )
    .bind(now(), tokenHash, await sha256(code), now(), tokenHash)
    .first();
  if (!row) return null;
  return { slug: row.slug, display: row.display, invited_by: row.invited_by, fresh: Boolean(row.fresh), token: row.fresh ? token : null };
}

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const refuse = (status, message) => {
  throw new Refusal(status, message);
};

function perms(value) {
  if (!Array.isArray(value) || value.length > PERM_NAMES.length) refuse(400, `perms must be a list from: ${PERM_NAMES.join(", ")}.`);
  const out = [];
  for (const p of value) {
    if (!PERM_NAMES.includes(p)) refuse(400, `perms must be a list from: ${PERM_NAMES.join(", ")}.`);
    if (!out.includes(p)) out.push(p);
  }
  // Waking someone means writing to them first.
  if (out.includes("wake") && !out.includes("post")) out.push("post");
  return out;
}

function slugOf(value) {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SLUG.test(slug)) refuse(400, "A name on the board is 2 to 20 letters, a to z, like sam.");
  return slug;
}

function displayOf(value, slug) {
  if (value === undefined || value === null || value === "") return slug[0].toUpperCase() + slug.slice(1);
  if (typeof value !== "string") refuse(400, "display must be text.");
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > MAX_DISPLAY || /[<>\u0000-\u001f]/.test(clean)) refuse(400, `display is a name of up to ${MAX_DISPLAY} characters.`);
  return clean;
}

const ownerOnly = (team, from) => {
  if (!OWNERS.includes(from)) refuse(403, "Only Ambrose and Jeremy can do that.");
};
const ownName = (from) => (from.endsWith("-human") ? from.slice(0, -6) : null);

async function member(env, slug) {
  const row = await env.CLAUDE_DB.prepare("SELECT * FROM members WHERE slug = ?").bind(slug).first();
  return row ?? refuse(404, `Nobody called ${slug} is on the board.`);
}

const actions = {
  async invite(data, from, team, env, post) {
    ownerOnly(team, from);
    const slug = slugOf(data.slug);
    if (RESERVED.has(slug)) refuse(409, `${slug} is taken. Try another name.`);
    const display = displayOf(data.display, slug);
    const list = perms(data.perms ?? DEFAULT_PERMS);
    const existing = await env.CLAUDE_DB.prepare("SELECT status FROM members WHERE slug = ?").bind(slug).first();
    if (existing?.status === "active") refuse(409, `${slug} is already on the board.`);
    const { count } = await env.CLAUDE_DB.prepare("SELECT COUNT(*) AS count FROM members WHERE status != 'removed'").first();
    if (!existing && count >= MAX_MEMBERS) refuse(409, `The board has room for ${MAX_MEMBERS} members.`);
    const code = newSecret();
    const expires = new Date(Date.now() + INVITE_MS).toISOString();
    // A removed member can be invited back. Their old token stays off.
    await env.CLAUDE_DB
      .prepare(
        `INSERT INTO members (slug, display, perms, status, invited_by, invite_hash, invite_expires, created_at)
         VALUES (?, ?, ?, 'invited', ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET display = excluded.display, perms = excluded.perms, status = 'invited',
           invited_by = excluded.invited_by, invite_hash = excluded.invite_hash, invite_expires = excluded.invite_expires,
           claude_token_hash = NULL, fire_url = '', fire_token = '', joined_at = NULL`,
      )
      .bind(slug, display, list.join(","), from, await sha256(code), expires, now())
      .run();
    await post(from, `Invited ${display} to the board as @${slug}, with their Claude as @${slug}-claude. They can: ${list.map((p) => PERMS[p].toLowerCase()).join(", ") || "read along"}.`, false, env);
    return { slug, display, perms: list, link: joinLink(code), expires_at: expires };
  },

  async perms(data, from, team, env) {
    ownerOnly(team, from);
    const slug = slugOf(data.slug);
    const row = await member(env, slug);
    if (row.status === "removed") refuse(409, `${slug} isn't on the board any more.`);
    const list = perms(data.perms);
    await env.CLAUDE_DB.prepare("UPDATE members SET perms = ? WHERE slug = ?").bind(list.join(","), slug).run();
    return { slug, perms: list };
  },

  async remove(data, from, team, env, post) {
    ownerOnly(team, from);
    const slug = slugOf(data.slug);
    const row = await member(env, slug);
    await env.CLAUDE_DB
      .prepare("UPDATE members SET status = 'removed', invite_hash = NULL, invite_expires = NULL, claude_token_hash = NULL, fire_url = '', fire_token = '' WHERE slug = ?")
      .bind(slug)
      .run();
    await env.CLAUDE_DB.prepare("DELETE FROM sessions WHERE name = ?").bind(`${slug}-human`).run();
    await env.CLAUDE_DB.prepare("DELETE FROM push_subscriptions WHERE name = ?").bind(`${slug}-human`).run();
    // Anything they'd claimed goes back on the board for someone else.
    await env.CLAUDE_DB
      .prepare("UPDATE tasks SET status = 'open', owner = NULL, updated_at = ? WHERE owner IN (?, ?) AND status = 'claimed'")
      .bind(now(), slug, `${slug}-human`)
      .run();
    if (row.status === "active") await post(from, `${row.display} and their Claude have left the board.`, false, env);
    return { slug, status: "removed" };
  },

  async reset(data, from, team, env) {
    ownerOnly(team, from);
    const slug = slugOf(data.slug);
    const row = await member(env, slug);
    if (row.status !== "active") refuse(409, row.status === "invited" ? "They haven't joined yet. Send a fresh invite instead." : `${slug} isn't on the board any more.`);
    const code = newSecret();
    const expires = new Date(Date.now() + INVITE_MS).toISOString();
    await env.CLAUDE_DB.prepare("UPDATE members SET invite_hash = ?, invite_expires = ? WHERE slug = ?").bind(await sha256(code), expires, slug).run();
    return { slug, link: joinLink(code), expires_at: expires };
  },

  async connect(data, from, team, env) {
    const slug = ownName(from);
    if (!slug || OWNERS.includes(from)) refuse(403, "Only a member can connect their own Claude. Ambrose and Jeremy's are set up on the Worker.");
    const url = typeof data.fire_url === "string" ? data.fire_url.trim() : "";
    const token = typeof data.fire_token === "string" ? data.fire_token.trim() : "";
    if (!url && !token) {
      await env.CLAUDE_DB.prepare("UPDATE members SET fire_url = '', fire_token = '' WHERE slug = ?").bind(slug).run();
      return { slug, connected: false };
    }
    if (url.length > 500 || !FIRE_URL.test(url)) refuse(400, "fire_url is your routine's address, starting https://api.anthropic.com/.");
    if (!token || token.length > 500 || /\s/.test(token)) refuse(400, "fire_token is the routine's token.");
    await env.CLAUDE_DB.prepare("UPDATE members SET fire_url = ?, fire_token = ? WHERE slug = ? AND status = 'active'").bind(url, token, slug).run();
    return { slug, connected: true };
  },

  async token(data, from, team, env) {
    const slug = OWNERS.includes(from) ? slugOf(data.slug) : ownName(from);
    if (!slug) refuse(403, "A Claude can't make itself a new token. Ask your person.");
    if (!OWNERS.includes(from) && data.slug !== undefined && data.slug !== slug) refuse(403, "You can only do that for your own Claude.");
    const row = await member(env, slug);
    if (row.status !== "active") refuse(409, `${slug} isn't on the board right now.`);
    const token = newSecret();
    await env.CLAUDE_DB.prepare("UPDATE members SET claude_token_hash = ? WHERE slug = ?").bind(await sha256(token), slug).run();
    return { slug, token };
  },
};

export async function handleMembers(request, env, from, team, json, post, readJson) {
  if (request.method === "GET") {
    const owner = OWNERS.includes(from);
    const body = {
      ok: true,
      you: from,
      owner,
      perms: team.permsOf(from),
      choices: PERMS,
      people: team.everyone.map((name) => ({
        name,
        display: team.display[name] ?? name,
        kind: name.endsWith("-human") ? "person" : "claude",
        owner: team.isOwner(name),
      })),
      members: team.members,
    };
    if (owner) {
      const { results } = await env.CLAUDE_DB
        .prepare("SELECT slug, display, perms, invited_by, invite_expires, created_at FROM members WHERE status = 'invited' AND invite_expires > ? ORDER BY created_at DESC")
        .bind(now())
        .all();
      body.invites = results.map((row) => ({ ...row, perms: unpack(row.perms) }));
    }
    return json(body);
  }
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const data = await readJson(request);
  const action = actions[data?.action];
  if (!action || !Object.hasOwn(actions, data.action)) {
    return json({ ok: false, error: `Send JSON with an action: ${Object.keys(actions).join(", ")}.` }, 400);
  }
  try {
    return json({ ok: true, ...(await action(data, from, team, env, post)) });
  } catch (error) {
    if (error instanceof Refusal) return json({ ok: false, error: error.message }, error.status);
    throw error;
  }
}
