// /claude/tasks: the shared task board, so a short run moves a project forward instead
// of starting from scratch. A Claude (or a person) proposes a project with its tasks.
// A person approves it, and that wakes both Claudes. Each Claude claims the next open
// task, builds it on a branch, and moves it to review with the pull request link, which
// wakes the other Claude to review. When every task is done, a Claude asks for the
// project to go live, and a person says yes or not yet.
//
// GET answers { projects, next, review }: next is the task you should work on (yours
// first, then the oldest open one), and review is what's waiting for your review.
// POST takes { action, ... }: propose, decide, add, claim, update or ready.
import { CLAUDES, PEOPLE } from "./claude-auth.js";

const MAX_TITLE = 200;
const MAX_TEXT = 4000;
const MAX_TASKS = 30;
const MAX_HANDOFF = 2000;
const MAX_TASKS_PER_PROJECT = 60;
const PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
const LINK = /^https:\/\/[^\s<>"]+$/;

const now = () => new Date().toISOString();
const handle = (name) => (CLAUDES.includes(name) ? `@${name}-claude` : `@${name.replace("-human", "")}`);
const otherClaudes = (name) => CLAUDES.filter((c) => c !== name);

class Refusal extends Error {
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

const id = (value, name) => (Number.isInteger(value) && value > 0 ? value : refuse(400, `${name} must be a number.`));

async function project(env, projectId) {
  const row = await env.CLAUDE_DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
  return row ?? refuse(404, `There's no project ${projectId}.`);
}

async function task(env, taskId) {
  const row = await env.CLAUDE_DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first();
  return row ?? refuse(404, `There's no task ${taskId}.`);
}

async function addTasks(env, projectId, list, from) {
  for (const item of list) {
    const title = text(item?.title, "A task's title", MAX_TITLE, true);
    const detail = text(item?.detail, "A task's detail", MAX_TEXT);
    const at = now();
    await env.CLAUDE_DB
      .prepare("INSERT INTO tasks (project_id, title, detail, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?, ?)")
      .bind(projectId, title, detail, from, at, at)
      .run();
  }
}

const setProject = (env, projectId, fields) => {
  const keys = Object.keys(fields);
  return env.CLAUDE_DB
    .prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), now(), projectId)
    .run();
};

export async function board(env, from) {
  const { results: projects } = await env.CLAUDE_DB.prepare("SELECT * FROM projects ORDER BY id").all();
  const { results: tasks } = await env.CLAUDE_DB.prepare("SELECT * FROM tasks ORDER BY id").all();
  const active = new Set(projects.filter((p) => p.status === "active").map((p) => p.id));
  const live = tasks.filter((t) => active.has(t.project_id));
  const next =
    live.find((t) => t.owner === from && t.status === "claimed") ?? live.find((t) => t.status === "open") ?? null;
  const review = live.filter((t) => t.status === "review" && t.owner !== from);
  return {
    projects: projects.map((p) => ({ ...p, tasks: tasks.filter((t) => t.project_id === p.id) })),
    next,
    review,
  };
}

const actions = {
  // Anyone can propose. A person's own proposal needs nobody's approval, so it starts
  // straight away and wakes both Claudes.
  async propose(data, from, env, post) {
    const title = text(data.title, "title", MAX_TITLE, true);
    const summary = text(data.summary, "summary", MAX_TEXT);
    const list = data.tasks ?? [];
    if (!Array.isArray(list) || list.length > MAX_TASKS) refuse(400, `tasks must be a list of up to ${MAX_TASKS}.`);
    const byPerson = PEOPLE.includes(from);
    const at = now();
    const { meta } = await env.CLAUDE_DB
      .prepare("INSERT INTO projects (title, summary, status, proposed_by, decided_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(title, summary, byPerson ? "active" : "proposed", from, byPerson ? from : null, at, at)
      .run();
    const projectId = meta.last_row_id;
    await addTasks(env, projectId, list, from);
    const count = `${list.length} ${list.length === 1 ? "task" : "tasks"}`;
    if (byPerson) {
      await post(from, `New project ${projectId}: ${title} (${count}).\n${summary}\n@claudes it's yours, go ahead.`.replace("\n\n", "\n"), undefined, env);
    } else {
      await post(from, `Proposal ${projectId}: ${title} (${count}).\n${summary}\n@ambrose @jeremy, approve it or say not yet on the board.`.replace("\n\n", "\n"), false, env);
    }
    return { project: projectId };
  },

  // A person's yes or not yet, on a new proposal or on going live.
  async decide(data, from, env, post) {
    if (!PEOPLE.includes(from)) refuse(403, "Only Ambrose and Jeremy can decide.");
    const p = await project(env, id(data.project, "project"));
    const yes = data.approve === true;
    const note = text(data.note, "note", MAX_TEXT);
    const said = note ? `\n${note}` : "";
    if (p.status === "proposed") {
      await setProject(env, p.id, { status: yes ? "active" : "declined", decided_by: from, note });
      if (yes) await post(from, `Approved project ${p.id}: ${p.title}. @claudes go ahead.${said}`, undefined, env);
      else await post(from, `Not yet on project ${p.id}: ${p.title}.${said}`, false, env);
    } else if (p.status === "ready") {
      await setProject(env, p.id, { status: yes ? "live" : "active", decided_by: from, note });
      if (yes) await post(from, `Project ${p.id} is live: ${p.title}. Lovely work. @claudes${said}`, false, env);
      else await post(from, `Not live yet, project ${p.id}: ${p.title}. @claudes${said}`, undefined, env);
    } else {
      refuse(409, `Project ${p.id} isn't waiting for a decision.`);
    }
    return { project: p.id, status: (await project(env, p.id)).status };
  },

  async add(data, from, env) {
    const p = await project(env, id(data.project, "project"));
    if (!["proposed", "active"].includes(p.status)) refuse(409, `Project ${p.id} is ${p.status}, so it takes no new tasks.`);
    if (p.status === "proposed" && p.proposed_by !== from) refuse(403, "Only whoever proposed it can add tasks before it's approved.");
    const { count } = await env.CLAUDE_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?").bind(p.id).first();
    if (count >= MAX_TASKS_PER_PROJECT) refuse(409, `Project ${p.id} already has ${MAX_TASKS_PER_PROJECT} tasks.`);
    await addTasks(env, p.id, [{ title: data.title, detail: data.detail }], from);
    const { id: taskId } = await env.CLAUDE_DB.prepare("SELECT MAX(id) AS id FROM tasks").first();
    return { task: taskId };
  },

  // One UPDATE that only matches an open task in an active project. If two Claudes try
  // at once, one changes the row and the other changes nothing and is told who won.
  async claim(data, from, env) {
    const taskId = id(data.task, "task");
    const { meta } = await env.CLAUDE_DB
      .prepare(
        "UPDATE tasks SET status = 'claimed', owner = ?, updated_at = ? WHERE id = ? AND status = 'open' AND project_id IN (SELECT id FROM projects WHERE status = 'active')",
      )
      .bind(from, now(), taskId)
      .run();
    if (meta.changes === 1) return { task: taskId };
    const t = await task(env, taskId);
    const p = await project(env, t.project_id);
    if (p.status !== "active") refuse(409, `Project ${p.id} is ${p.status}, so its tasks can't be claimed.`);
    refuse(409, t.owner ? `Task ${taskId} is already ${t.owner === from ? "yours" : `claimed by ${t.owner}`}.` : `Task ${taskId} is ${t.status}.`);
  },

  // Owners move their own tasks. Review needs the pull request, and wakes the other
  // Claude to review it. Anyone can mark a task in review as done once it's merged.
  // Tasks only move forward through claimed, review and done, or back to open, and only
  // in an active project. Reopening a finished task is for Ambrose and Jeremy.
  // A "note" leaves a hand-off on the task: where you stopped and what's left. It can
  // come with a status, or on its own.
  async update(data, from, env, post) {
    const t = await task(env, id(data.task, "task"));
    const p = await project(env, t.project_id);
    if (p.status !== "active") refuse(409, `Project ${p.id} is ${p.status}, so its tasks don't move.`);
    const status = data.status;
    const mine = t.owner === from || PEOPLE.includes(from);
    const note = data.note === undefined ? null : text(data.note, "note", MAX_HANDOFF);
    if (note !== null) {
      if (!mine && t.owner) refuse(403, "Only whoever claimed it can leave its hand-off note.");
      await env.CLAUDE_DB.prepare("UPDATE tasks SET handoff = ?, updated_at = ? WHERE id = ?").bind(note, now(), t.id).run();
      if (status === undefined) return { task: t.id, status: t.status, handoff: note };
    }
    if (status === "open") {
      if (!mine) refuse(403, "Only whoever claimed it can let it go.");
      if (t.status === "done" && !PEOPLE.includes(from)) refuse(403, "Only Ambrose or Jeremy can reopen a finished task.");
      await env.CLAUDE_DB.prepare("UPDATE tasks SET status = 'open', owner = NULL, updated_at = ? WHERE id = ?").bind(now(), t.id).run();
    } else if (status === "review") {
      if (!mine) refuse(403, "Only whoever claimed it can send it for review.");
      if (!["claimed", "review"].includes(t.status)) refuse(409, `Task ${t.id} is ${t.status}. Claim it first.`);
      const pr = text(data.pr ?? t.pr, "pr", 300);
      if (!PR.test(pr)) refuse(400, "pr must be a GitHub pull request link.");
      await env.CLAUDE_DB.prepare("UPDATE tasks SET status = 'review', pr = ?, updated_at = ? WHERE id = ?").bind(pr, now(), t.id).run();
      const reviewers = CLAUDES.includes(from) ? otherClaudes(from) : CLAUDES;
      await post(from, `Ready for review, task ${t.id}: ${t.title}\n${pr}\n${reviewers.map(handle).join(" ")} please review, and approve it on GitHub if it's good.`, undefined, env);
    } else if (status === "done") {
      if (t.status === "open") refuse(409, `Task ${t.id} is open. Claim it first.`);
      if (!mine && t.status !== "review") refuse(403, "Only whoever claimed it can finish it before review.");
      await env.CLAUDE_DB.prepare("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?").bind(now(), t.id).run();
    } else {
      refuse(400, "status must be open, review or done.");
    }
    return { task: t.id, status };
  },

  // Every task done: ask the people to put it live.
  async ready(data, from, env, post) {
    const p = await project(env, id(data.project, "project"));
    if (p.status !== "active") refuse(409, `Project ${p.id} is ${p.status}.`);
    const { count } = await env.CLAUDE_DB
      .prepare("SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND status != 'done'")
      .bind(p.id)
      .first();
    if (count > 0) refuse(409, `Project ${p.id} still has ${count} unfinished ${count === 1 ? "task" : "tasks"}.`);
    const link = text(data.link, "link", 300);
    if (link && !LINK.test(link)) refuse(400, "link must be an https link.");
    await setProject(env, p.id, { status: "ready", link });
    await post(from, `Project ${p.id} is ready to go live: ${p.title}${link ? `\n${link}` : ""}\n@ambrose @jeremy, put it live or say not yet on the board.`, false, env);
    return { project: p.id, status: "ready" };
  },
};

// So an idea on the notes board can become a project the same way.
export const propose = (data, from, env, post) => actions.propose(data, from, env, post);

export async function handleTasks(request, env, from, json, post, readJson) {
  if (request.method === "GET") return json({ ok: true, you: from, ...(await board(env, from)) });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const data = await readJson(request);
  const action = actions[data?.action];
  if (!action || !Object.hasOwn(actions, data.action)) {
    return json({ ok: false, error: `action must be one of: ${Object.keys(actions).join(", ")}.` }, 400);
  }
  try {
    return json({ ok: true, ...(await action(data, from, env, post)) });
  } catch (error) {
    if (error instanceof Refusal) return json({ ok: false, error: error.message }, error.status);
    throw error;
  }
}
