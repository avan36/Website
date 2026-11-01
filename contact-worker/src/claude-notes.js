// /claude/notes: ideas and memories the four of you share. An idea is something to
// maybe build. A memory is something worth knowing next run: a decision, a convention,
// a lesson from a bug. Everyone reads everything, Claudes included, so nothing really
// sensitive goes in.
//
// GET ?kind=idea|memory&q=words&tag=name&all=1 lists them, pinned first, then newest.
// POST { action, ... }: add, edit, archive, pin, vote or adopt.
//
// /claude/brief: everything a run needs in one read. Unread messages, who's here, the
// task board, pinned and recent memories, the best ideas and the profiles. It changes
// nothing, so it's safe to call first.
import { PEOPLE } from "./claude-names.js";
import { CORE_TEAM } from "./claude-members.js";

const KINDS = ["idea", "memory"];
const MAX_TITLE = 200;
const MAX_BODY = 4000;
const MAX_TAGS = 8;
const MAX_TAG = 32;
const MAX_OPEN = 500;
const MAX_LIST = 200;
const TAG = /^[a-z0-9][a-z0-9-]*$/;

const now = () => new Date().toISOString();
const handle = (name) => (name.endsWith("-human") ? `@${name.slice(0, -6)}` : `@${name}-claude`);

export class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const refuse = (status, message) => {
  throw new Refusal(status, message);
};

function text(value, name, max, required = false) {
  if (value === undefined || value === null) {
    if (required) refuse(400, `${name} is needed.`);
    return "";
  }
  if (typeof value !== "string" || value.trim().length > max) refuse(400, `${name} must be text of up to ${max} characters.`);
  const clean = value.trim();
  if (required && !clean) refuse(400, `${name} is needed.`);
  return clean;
}

// Tags are stored as ",a,b," so a LIKE '%,a,%' finds one exactly.
function tags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) refuse(400, `tags must be a list of up to ${MAX_TAGS}.`);
  const out = [];
  for (const raw of value) {
    const tag = typeof raw === "string" ? raw.trim().toLowerCase().replace(/^#/, "") : "";
    if (!tag || tag.length > MAX_TAG || !TAG.test(tag)) refuse(400, `A tag is a short word: letters, numbers and dashes, up to ${MAX_TAG}.`);
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}
const packTags = (list) => (list.length ? `,${list.join(",")},` : "");
const unpackTags = (stored) => (stored ? stored.split(",").filter(Boolean) : []);

const noteId = (value) => (Number.isInteger(value) && value > 0 ? value : refuse(400, "id must be a number."));

async function find(env, id) {
  const row = await env.CLAUDE_DB.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
  return row ?? refuse(404, `There's no note ${id}.`);
}

function shape(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    tags: unpackTags(row.tags),
    author: row.author,
    pinned: row.pinned ? 1 : 0,
    status: row.status,
    project_id: row.project_id ?? null,
    votes: row.votes ?? 0,
    voted: Boolean(row.voted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT = `SELECT n.*, (SELECT COUNT(*) FROM note_votes v WHERE v.note_id = n.id) AS votes,
  EXISTS (SELECT 1 FROM note_votes v WHERE v.note_id = n.id AND v.name = ?) AS voted FROM notes n`;

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listNotes(env, from, { kind = "", q = "", tag = "", all = false, order = "recent", limit = MAX_LIST } = {}) {
  const where = [];
  const args = [from];
  if (kind) {
    if (!KINDS.includes(kind)) refuse(400, "kind must be idea or memory.");
    where.push("n.kind = ?");
    args.push(kind);
  }
  if (!all) where.push("n.status = 'open'");
  if (tag) {
    where.push("n.tags LIKE ? ESCAPE '\\'");
    args.push(`%,${escapeLike(tag.toLowerCase())},%`);
  }
  for (const word of q.trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push("(n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(word.slice(0, 60))}%`;
    args.push(like, like, like);
  }
  const sort = order === "votes" ? "votes DESC, n.id DESC" : "n.pinned DESC, n.id DESC";
  const sql = `${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} LIMIT ?`;
  args.push(Math.min(limit, MAX_LIST));
  const { results } = await env.CLAUDE_DB.prepare(sql).bind(...args).all();
  return results.map((row) => shape(row));
}

async function one(env, from, id) {
  const row = await env.CLAUDE_DB.prepare(`${SELECT} WHERE n.id = ?`).bind(from, id).first();
  return shape(row);
}

// Members need the right permission: ideas come with "propose", memories with "memory".
function mayWrite(team, from, kind) {
  if (kind === "memory" && !team.can(from, "memory")) refuse(403, "Ambrose or Jeremy can let you add memories.");
  if (kind === "idea" && !team.can(from, "propose")) refuse(403, "Ambrose or Jeremy can let you add ideas.");
}

// The author can change their own note, and either person can change any.
const mayChange = (note, from) => note.author === from || PEOPLE.includes(from);

const actions = {
  async add(data, from, env, post, propose, team) {
    const kind = data.kind;
    if (!KINDS.includes(kind)) refuse(400, "kind must be idea or memory.");
    mayWrite(team, from, kind);
    const title = text(data.title, "title", MAX_TITLE, true);
    const body = text(data.body, "body", MAX_BODY);
    const list = tags(data.tags);
    const { count } = await env.CLAUDE_DB.prepare("SELECT COUNT(*) AS count FROM notes WHERE status = 'open'").first();
    if (count >= MAX_OPEN) refuse(409, `There are already ${MAX_OPEN} open notes. Archive a few first.`);
    const at = now();
    const { meta } = await env.CLAUDE_DB
      .prepare("INSERT INTO notes (kind, title, body, tags, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(kind, title, body, packTags(list), from, at, at)
      .run();
    const id = meta.last_row_id;
    // An idea is worth a line in the conversation. It wakes nobody.
    if (kind === "idea") await post(from, `New idea ${id}: ${title}\nIt's in Notes on the board. +1 it if you like it.`, false, env);
    return { note: await one(env, from, id) };
  },

  async edit(data, from, env, post, propose, team) {
    const note = await find(env, noteId(data.id));
    mayWrite(team, from, note.kind);
    if (!mayChange(note, from)) refuse(403, "Only whoever wrote it, or Ambrose or Jeremy, can change it.");
    const title = data.title === undefined ? note.title : text(data.title, "title", MAX_TITLE, true);
    const body = data.body === undefined ? note.body : text(data.body, "body", MAX_BODY);
    const packed = data.tags === undefined ? note.tags : packTags(tags(data.tags));
    await env.CLAUDE_DB
      .prepare("UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?")
      .bind(title, body, packed, now(), note.id)
      .run();
    return { note: await one(env, from, note.id) };
  },

  async archive(data, from, env) {
    const note = await find(env, noteId(data.id));
    if (!mayChange(note, from)) refuse(403, "Only whoever wrote it, or Ambrose or Jeremy, can archive it.");
    const back = data.restore === true;
    await env.CLAUDE_DB
      .prepare("UPDATE notes SET status = ?, pinned = 0, updated_at = ? WHERE id = ?")
      .bind(back ? "open" : "archived", now(), note.id)
      .run();
    return { note: await one(env, from, note.id) };
  },

  async pin(data, from, env) {
    if (!PEOPLE.includes(from)) refuse(403, "Only Ambrose and Jeremy can pin.");
    const note = await find(env, noteId(data.id));
    if (note.status !== "open") refuse(409, `Note ${note.id} is ${note.status}.`);
    await env.CLAUDE_DB
      .prepare("UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?")
      .bind(data.pinned === false ? 0 : 1, now(), note.id)
      .run();
    return { note: await one(env, from, note.id) };
  },

  // A +1 on an idea, or taking it back.
  async vote(data, from, env, post, propose, team) {
    if (!team.can(from, "propose")) refuse(403, "You can read the ideas. Ambrose or Jeremy can let you vote too.");
    const note = await find(env, noteId(data.id));
    if (note.kind !== "idea") refuse(400, "Only ideas take a +1.");
    const { meta } = await env.CLAUDE_DB
      .prepare("INSERT INTO note_votes (note_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING")
      .bind(note.id, from)
      .run();
    if (meta.changes === 0) {
      await env.CLAUDE_DB.prepare("DELETE FROM note_votes WHERE note_id = ? AND name = ?").bind(note.id, from).run();
    }
    const shaped = await one(env, from, note.id);
    return { votes: shaped.votes, voted: shaped.voted };
  },

  // A person turns an idea into a project. It goes through the task board's own
  // propose, so it starts straight away the same way a person's proposal does.
  async adopt(data, from, env, post, propose) {
    if (!PEOPLE.includes(from)) refuse(403, "Only Ambrose and Jeremy can turn an idea into a project.");
    const note = await find(env, noteId(data.id));
    if (note.kind !== "idea" || note.status !== "open") refuse(409, `Note ${note.id} isn't an open idea.`);
    // Claim it first, so two clicks can't make two projects.
    const { meta } = await env.CLAUDE_DB
      .prepare("UPDATE notes SET status = 'adopted', updated_at = ? WHERE id = ? AND status = 'open'")
      .bind(now(), note.id)
      .run();
    if (meta.changes !== 1) refuse(409, `Note ${note.id} isn't an open idea.`);
    const summary = `${note.body}${note.body ? "\n" : ""}From idea ${note.id}, first shared by ${handle(note.author)}.`.slice(0, MAX_BODY);
    const { project } = await propose({ title: note.title, summary, tasks: [] }, from, env, post);
    await env.CLAUDE_DB.prepare("UPDATE notes SET project_id = ? WHERE id = ?").bind(project, note.id).run();
    return { project_id: project };
  },
};

export async function handleNotes(request, env, from, json, post, propose, readJson, team = CORE_TEAM) {
  try {
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      // Memories hold what the board knows about everyone, so they're only for those
      // allowed to read them.
      const memory = team.can(from, "memory");
      const asked = params.get("kind") ?? "";
      if (asked === "memory" && !memory) return json({ ok: true, you: from, notes: [] });
      const notes = await listNotes(env, from, {
        kind: memory ? asked : "idea",
        q: params.get("q") ?? "",
        tag: params.get("tag") ?? "",
        all: params.get("all") === "1",
      });
      return json({ ok: true, you: from, notes });
    }
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const data = await readJson(request);
    const action = data && Object.hasOwn(actions, data.action) ? actions[data.action] : null;
    if (!action) return json({ ok: false, error: `action must be one of: ${Object.keys(actions).join(", ")}.` }, 400);
    return json({ ok: true, ...(await action(data, from, env, post, propose, team)) });
  } catch (error) {
    if (error instanceof Refusal) return json({ ok: false, error: error.message }, error.status);
    throw error;
  }
}

// One read for the start of a run. Nothing here marks anything read.
export async function brief(env, from, { presence, board, unread, profiles }, team = CORE_TEAM) {
  const memory = team.can(from, "memory");
  const none = Promise.resolve([]);
  const [people, tasks, messages, everyone, pinned, recent, ideas] = await Promise.all([
    presence(env),
    board(env, from),
    unread(env, from),
    profiles(env, team),
    memory ? listNotes(env, from, { kind: "memory" }).then((all) => all.filter((n) => n.pinned)) : none,
    memory ? listNotes(env, from, { kind: "memory", limit: 20 }) : none,
    listNotes(env, from, { kind: "idea", order: "votes", limit: 10 }),
  ]);
  const memories = [...pinned, ...recent.filter((n) => !n.pinned)];
  const waiting = tasks.projects
    .filter((p) => p.status === "proposed" || p.status === "ready")
    .map(({ id, title, status }) => ({ id, title, status }));
  return {
    you: from,
    unread: messages.messages,
    unread_more: messages.more,
    mentions_you: messages.messages.filter((m) => m.mentions.includes(from)).map((m) => m.id),
    presence: people,
    tasks: { next: tasks.next, review: tasks.review, waiting_on_people: waiting },
    memories,
    ideas,
    profiles: everyone.filter((p) => team.everyone.includes(p.name)),
    can: team.permsOf(from),
  };
}
