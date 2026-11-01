import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude, waitMs } from '../claude.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../claude.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const result = db.prepare(sql).run(...args);
      return { meta: { last_row_id: Number(result.lastInsertRowid), changes: result.changes } };
    },
  });
  return { db, prepare: (sql) => statement(sql) };
}

let env;
let fired;
beforeEach(() => {
  env = {
    CLAUDE_DB: d1(),
    CLAUDE_TOKEN_AMBROSE: 'token-a',
    CLAUDE_TOKEN_JEREMY: 'token-j',
    CLAUDE_TOKEN_AMBROSE_HUMAN: 'token-ah',
    CLAUDE_TOKEN_JEREMY_HUMAN: 'token-jh',
    CLAUDE_FIRE_URL_AMBROSE: 'https://fire.example/ambrose',
    CLAUDE_FIRE_TOKEN_AMBROSE: 'fire-a',
    CLAUDE_FIRE_URL_JEREMY: 'https://fire.example/jeremy',
    CLAUDE_FIRE_TOKEN_JEREMY: 'fire-j',
  };
  fired = [];
  vi.stubGlobal('fetch', async (url) => {
    fired.push(String(url).split('/').pop());
    return new Response('{}');
  });
});

const call = async (token, body) => {
  const res = await handleClaude(
    new Request('https://w.example/claude/tasks', {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
  return { ...(await res.json()), code: res.status };
};
const said = () => env.CLAUDE_DB.db.prepare('SELECT sender, body FROM messages ORDER BY id').all();

const propose = () =>
  call('token-a', { action: 'propose', title: 'A garden', summary: 'Grow things.', tasks: [{ title: 'Soil' }, { title: 'Seeds', detail: 'Three kinds.' }] });

describe('proposals', () => {
  it('waits for a person, and says so in the conversation without waking anyone', async () => {
    expect((await propose()).project).toBe(1);
    const { projects, next } = await call('token-j');
    expect(projects[0]).toMatchObject({ title: 'A garden', status: 'proposed', proposed_by: 'ambrose' });
    expect(projects[0].tasks.map((t) => t.title)).toEqual(['Soil', 'Seeds']);
    expect(next).toBe(null);
    expect(said().at(-1).body).toContain('Proposal 1: A garden (2 tasks)');
    expect(fired).toEqual([]);
  });

  it('starts when a person approves, and wakes both Claudes', async () => {
    await propose();
    expect((await call('token-j', { action: 'decide', project: 1, approve: true })).code).toBe(403);
    expect(await call('token-ah', { action: 'decide', project: 1, approve: true, note: 'Go!' })).toMatchObject({ status: 'active' });
    expect(said().at(-1)).toMatchObject({ sender: 'ambrose-human' });
    expect(said().at(-1).body).toContain('@claudes go ahead.\nGo!');
    expect(fired.sort()).toEqual(['ambrose', 'jeremy']);
    expect((await call('token-ah', { action: 'decide', project: 1, approve: true })).code).toBe(409);
  });

  it('can be turned down', async () => {
    await propose();
    expect(await call('token-jh', { action: 'decide', project: 1, approve: false, note: 'After exams.' })).toMatchObject({ status: 'declined' });
    expect((await call('token-a', { action: 'claim', task: 1 })).code).toBe(409);
  });

  it("starts straight away when a person proposes it", async () => {
    await call('token-jh', { action: 'propose', title: 'Quick one', tasks: [{ title: 'Do it' }] });
    expect((await call('token-a')).next).toMatchObject({ id: 1, title: 'Do it' });
    expect(fired.sort()).toEqual(['ambrose', 'jeremy']);
  });

  it('refuses a bad proposal', async () => {
    expect((await call('token-a', { action: 'propose' })).code).toBe(400);
    expect((await call('token-a', { action: 'propose', title: 'x', tasks: [{}] })).code).toBe(400);
    expect((await call('token-a', { action: 'nope' })).code).toBe(400);
    expect((await call('token-a', { action: 'constructor' })).code).toBe(400);
  });
});

// As if the Claudes' runs had finished and they'd gone back to sleep.
const asleep = () => env.CLAUDE_DB.db.prepare('UPDATE presence SET working_until = NULL, listening_until = NULL').run();

describe('tasks', () => {
  beforeEach(async () => {
    await propose();
    await call('token-ah', { action: 'decide', project: 1, approve: true });
    asleep();
    fired = [];
  });

  it('hands out the oldest open task, and only one Claude gets it', async () => {
    expect((await call('token-a')).next.id).toBe(1);
    const [a, j] = await Promise.all([call('token-a', { action: 'claim', task: 1 }), call('token-j', { action: 'claim', task: 1 })]);
    expect([a.code, j.code].sort()).toEqual([200, 409]);
    const loser = a.code === 409 ? a : j;
    expect(loser.error).toMatch(/already claimed by/);
  });

  it('keeps pointing a Claude at its own task until it lets go', async () => {
    await call('token-j', { action: 'claim', task: 2 });
    expect((await call('token-j')).next.id).toBe(2);
    expect((await call('token-a')).next.id).toBe(1);
    expect((await call('token-a', { action: 'update', task: 2, status: 'open' })).code).toBe(403);
    await call('token-j', { action: 'update', task: 2, status: 'open' });
    expect((await call('token-j')).next.id).toBe(1);
  });

  it('sends a task for review with its pull request, and wakes the other Claude', async () => {
    await call('token-a', { action: 'claim', task: 1 });
    expect((await call('token-a', { action: 'update', task: 1, status: 'review', pr: 'https://evil.example' })).code).toBe(400);
    const pr = 'https://github.com/avan36/AmbroseJeremyAgentWorkspace/pull/20';
    await call('token-a', { action: 'update', task: 1, status: 'review', pr });
    expect(said().at(-1).body).toContain(`${pr}\n@jeremy-claude please review`);
    expect(fired).toEqual(['jeremy']);
    expect((await call('token-j')).review.map((t) => t.id)).toEqual([1]);
    expect((await call('token-a')).review).toEqual([]);
    expect((await call('token-j', { action: 'update', task: 1, status: 'done' })).code).toBe(200);
  });

  it("won't take a claim on a task that isn't open", async () => {
    await call('token-a', { action: 'claim', task: 1 });
    expect((await call('token-a', { action: 'claim', task: 1 })).error).toMatch(/already yours/);
    expect((await call('token-a', { action: 'claim', task: 99 })).code).toBe(404);
  });

  it('adds tasks to an active project', async () => {
    expect(await call('token-j', { action: 'add', project: 1, title: 'Water' })).toMatchObject({ task: 3 });
  });
});

describe('going live', () => {
  beforeEach(async () => {
    await propose();
    await call('token-ah', { action: 'decide', project: 1, approve: true });
    for (const task of [1, 2]) await call('token-a', { action: 'claim', task });
  });

  it('waits until every task is done, then asks the people', async () => {
    await call('token-a', { action: 'update', task: 1, status: 'done' });
    expect((await call('token-a', { action: 'ready', project: 1 })).error).toMatch(/1 unfinished task/);
    await call('token-a', { action: 'update', task: 2, status: 'done' });
    expect(await call('token-a', { action: 'ready', project: 1, link: 'https://lab.ambrosevannier.com/garden/' })).toMatchObject({ status: 'ready' });
    expect(said().at(-1).body).toContain('@ambrose @jeremy, put it live');
    asleep();
    fired = [];
    expect(await call('token-jh', { action: 'decide', project: 1, approve: false, note: 'Bigger flowers.' })).toMatchObject({ status: 'active' });
    expect(fired.sort()).toEqual(['ambrose', 'jeremy']);
    await call('token-a', { action: 'ready', project: 1 });
    expect(await call('token-ah', { action: 'decide', project: 1, approve: true })).toMatchObject({ status: 'live' });
  });
});

const say = async (token, body, extra = {}) => {
  const res = await handleClaude(
    new Request('https://w.example/claude/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, ...extra }),
    }),
    env,
  );
  return res.json();
};
const read = async (token, query = '') =>
  (await handleClaude(new Request(`https://w.example/claude/messages${query}`, { headers: { Authorization: `Bearer ${token}` } }), env)).json();

describe('conversations', () => {
  it('reaches a Claude you were just talking with, without a mention', async () => {
    await say('token-ah', 'hey @jeremy-claude, got a minute?');
    expect(fired).toEqual(['jeremy']);
    await say('token-j', 'Sure, what is up?', { wake: false });
    asleep();
    fired = [];
    expect(await say('token-ah', 'can you look at the garden idea')).toMatchObject({ woken: ['jeremy'] });
    expect(fired).toEqual(['jeremy']);
  });

  it("doesn't wake a Claude that's still in its run, it just reaches it", async () => {
    await say('token-ah', 'hey @jeremy-claude');
    fired = [];
    expect(await say('token-ah', 'and one more thing')).toMatchObject({ woken: [], here: ['jeremy'] });
    expect(fired).toEqual([]);
  });

  it('wakes a Claude again once it says its run is done, even if it never posted', async () => {
    await say('token-ah', 'morning @claudes', { wake: true });
    await read('token-j');
    fired = [];
    expect(await say('token-ah', 'hey @jeremy-claude')).toMatchObject({ woken: [], here: ['jeremy'] });
    await handleClaude(
      new Request('https://w.example/claude/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-j', 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true }),
      }),
      env,
    );
    expect(await say('token-ah', 'hey @jeremy-claude, you there?')).toMatchObject({ woken: ['jeremy'] });
  });

  it("stops counting a quiet Claude as awake five minutes after it last read", async () => {
    await say('token-ah', 'hey @jeremy-claude');
    await read('token-j');
    const row = env.CLAUDE_DB.db.prepare("SELECT working_until FROM presence WHERE name = 'jeremy'").get();
    const left = new Date(row.working_until) - Date.now();
    expect(left).toBeGreaterThan(4 * 60 * 1000);
    expect(left).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('leaves the Claudes out of a chat between the two people', async () => {
    await say('token-a', 'done for today', { wake: false });
    asleep();
    fired = [];
    expect(await say('token-ah', '@jeremy want to play later?')).toMatchObject({ woken: [] });
    expect(fired).toEqual([]);
  });

  it('lets the conversation end after a quiet spell', async () => {
    await say('token-a', 'done for today', { wake: false });
    env.CLAUDE_DB.db.prepare("UPDATE messages SET created_at = '2000-01-01T00:00:00.000Z'").run();
    asleep();
    fired = [];
    expect(await say('token-ah', 'morning')).toMatchObject({ woken: [] });
  });

  it('waits for a reply, and shows the Claude as here while it does', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const waiting = read('token-j', '?after=0&wait=10');
      await vi.advanceTimersByTimeAsync(3000);
      const { presence } = await read('token-ah');
      expect(presence.find((p) => p.name === 'jeremy')).toMatchObject({ listening: true, chatting: true });
      await say('token-ah', 'still there?');
      await vi.advanceTimersByTimeAsync(2000);
      expect((await waiting).messages.map((m) => m.body)).toEqual(['still there?']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up waiting after the time asked, at most 25 seconds', async () => {
    const started = Date.now();
    expect((await read('token-j', '?wait=1')).messages).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect([waitMs('999'), waitMs('10'), waitMs('-5'), waitMs('soon'), waitMs(null)]).toEqual([25_000, 10_000, 0, 0, 0]);
  });
});
