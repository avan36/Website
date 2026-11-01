import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude } from '../claude.js';

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
afterEach(() => vi.unstubAllGlobals());

const call = async (token, path, body, { method, headers = {} } = {}) => {
  const res = await handleClaude(
    new Request(`https://w.example${path}`, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),
    env,
  );
  return { ...(await res.json()), code: res.status };
};
const notes = (token, query = '') => call(token, `/claude/notes${query}`);
const act = (token, data) => call(token, '/claude/notes', data);
const said = () => env.CLAUDE_DB.db.prepare('SELECT sender, body FROM messages ORDER BY id').all();

describe('ideas and memories', () => {
  it('lets anyone add one, and everyone read it', async () => {
    const { note } = await act('token-a', { action: 'add', kind: 'memory', title: 'Small PRs', body: 'Jeremy likes one change per PR.', tags: ['Habits', '#review'] });
    expect(note).toMatchObject({ id: 1, kind: 'memory', author: 'ambrose', tags: ['habits', 'review'], pinned: 0, status: 'open' });
    const { notes: list, you } = await notes('token-jh');
    expect(you).toBe('jeremy-human');
    expect(list.map((n) => n.title)).toEqual(['Small PRs']);
  });

  it('says a new idea in the conversation without waking anyone', async () => {
    await act('token-j', { action: 'add', kind: 'idea', title: 'A tiny weather toy' });
    expect(said().at(-1)).toMatchObject({ sender: 'jeremy' });
    expect(said().at(-1).body).toContain('New idea 1: A tiny weather toy');
    expect(fired).toEqual([]);
    // A memory is quiet.
    await act('token-j', { action: 'add', kind: 'memory', title: 'x' });
    expect(said()).toHaveLength(1);
  });

  it('refuses bad input', async () => {
    expect((await act('token-a', { action: 'add', kind: 'secret', title: 'x' })).code).toBe(400);
    expect((await act('token-a', { action: 'add', kind: 'idea', title: '  ' })).code).toBe(400);
    expect((await act('token-a', { action: 'add', kind: 'idea', title: 'x'.repeat(201) })).code).toBe(400);
    expect((await act('token-a', { action: 'add', kind: 'idea', title: 'x', body: 'y'.repeat(4001) })).code).toBe(400);
    expect((await act('token-a', { action: 'add', kind: 'idea', title: 'x', tags: ['has space'] })).code).toBe(400);
    expect((await act('token-a', { action: 'add', kind: 'idea', title: 'x', tags: Array(9).fill('a') })).code).toBe(400);
    expect((await act('token-a', { action: 'toString' })).code).toBe(400);
    expect((await act('token-a', { action: 'edit', id: 99 })).code).toBe(404);
  });

  it('finds notes by kind, words and tag, treating % and _ as plain text', async () => {
    await act('token-a', { action: 'add', kind: 'memory', title: 'Deploy on Fridays', tags: ['ops'] });
    await act('token-a', { action: 'add', kind: 'idea', title: 'A garden map', body: 'Grow 100% real tomatoes' });
    await act('token-a', { action: 'add', kind: 'idea', title: 'Music box', tags: ['toys'] });
    const titles = async (q) => (await notes('token-a', q)).notes.map((n) => n.title);
    expect(await titles('?kind=idea')).toEqual(['Music box', 'A garden map']);
    expect(await titles('?q=garden')).toEqual(['A garden map']);
    expect(await titles('?q=100%25')).toEqual(['A garden map']);
    expect(await titles('?q=%25')).toEqual(['A garden map']);
    expect(await titles('?tag=toys')).toEqual(['Music box']);
    expect(await titles('?tag=toy')).toEqual([]);
    expect((await notes('token-a', '?kind=nope')).code).toBe(400);
  });

  it('lets the author or a person change or archive it, and nobody else', async () => {
    await act('token-a', { action: 'add', kind: 'memory', title: 'Old' });
    expect((await act('token-j', { action: 'edit', id: 1, title: 'Mine now' })).code).toBe(403);
    expect((await act('token-a', { action: 'edit', id: 1, title: 'New', tags: ['x'] })).note).toMatchObject({ title: 'New', tags: ['x'] });
    expect((await act('token-jh', { action: 'edit', id: 1, body: 'Fixed by Jeremy.' })).note).toMatchObject({ title: 'New', body: 'Fixed by Jeremy.' });
    expect((await act('token-j', { action: 'archive', id: 1 })).code).toBe(403);
    expect((await act('token-a', { action: 'archive', id: 1 })).note.status).toBe('archived');
    expect((await notes('token-a')).notes).toEqual([]);
    expect((await notes('token-a', '?all=1')).notes).toHaveLength(1);
    expect((await act('token-a', { action: 'archive', id: 1, restore: true })).note.status).toBe('open');
  });

  it('lets only people pin, and puts pinned ones first', async () => {
    await act('token-a', { action: 'add', kind: 'memory', title: 'First' });
    await act('token-a', { action: 'add', kind: 'memory', title: 'Second' });
    expect((await act('token-a', { action: 'pin', id: 1 })).code).toBe(403);
    expect((await act('token-ah', { action: 'pin', id: 1 })).note.pinned).toBe(1);
    expect((await notes('token-a')).notes.map((n) => n.title)).toEqual(['First', 'Second']);
    expect((await act('token-ah', { action: 'pin', id: 1, pinned: false })).note.pinned).toBe(0);
  });

  it('takes one +1 per name on an idea, and takes it back', async () => {
    await act('token-a', { action: 'add', kind: 'idea', title: 'Kites' });
    expect(await act('token-j', { action: 'vote', id: 1 })).toMatchObject({ votes: 1, voted: true });
    expect(await act('token-ah', { action: 'vote', id: 1 })).toMatchObject({ votes: 2, voted: true });
    expect(await act('token-j', { action: 'vote', id: 1 })).toMatchObject({ votes: 1, voted: false });
    const [kites] = (await notes('token-ah')).notes;
    expect(kites).toMatchObject({ votes: 1, voted: true });
    await act('token-a', { action: 'add', kind: 'memory', title: 'm' });
    expect((await act('token-a', { action: 'vote', id: 2 })).code).toBe(400);
  });

  it('turns an idea into a project once, for a person only', async () => {
    await act('token-j', { action: 'add', kind: 'idea', title: 'Tide clock', body: 'Shows the tide.' });
    expect((await act('token-j', { action: 'adopt', id: 1 })).code).toBe(403);
    fired = [];
    expect(await act('token-jh', { action: 'adopt', id: 1 })).toMatchObject({ project_id: 1 });
    expect((await act('token-ah', { action: 'adopt', id: 1 })).code).toBe(409);
    const { projects } = await call('token-a', '/claude/tasks');
    expect(projects[0]).toMatchObject({ title: 'Tide clock', status: 'active', proposed_by: 'jeremy-human' });
    expect(projects[0].summary).toContain('From idea 1, first shared by @jeremy-claude.');
    expect(fired.sort()).toEqual(['ambrose', 'jeremy']);
    const [idea] = (await notes('token-a', '?all=1')).notes;
    expect(idea).toMatchObject({ status: 'adopted', project_id: 1 });
  });
});

describe('the brief', () => {
  it('has everything a run needs, and marks nothing read', async () => {
    await call('token-ah', '/claude/messages', { body: 'Morning @ambrose-claude', wake: false });
    await call('token-jh', '/claude/messages', { body: 'Hi all', wake: false });
    await act('token-j', { action: 'add', kind: 'idea', title: 'Kites' });
    await act('token-a', { action: 'vote', id: 1 });
    await act('token-j', { action: 'add', kind: 'memory', title: 'Pinned fact' });
    await act('token-j', { action: 'add', kind: 'memory', title: 'Recent fact' });
    await act('token-ah', { action: 'pin', id: 2 });

    const b = await call('token-a', '/claude/brief');
    expect(b).toMatchObject({ ok: true, you: 'ambrose', unread_more: false });
    expect(b.unread.map((m) => m.body)).toEqual(['Morning @ambrose-claude', 'Hi all', expect.stringContaining('New idea 1')]);
    expect(b.mentions_you).toEqual([1]);
    expect(b.memories.map((n) => n.title)).toEqual(['Pinned fact', 'Recent fact']);
    expect(b.ideas[0]).toMatchObject({ title: 'Kites', votes: 1, voted: true });
    expect(b.tasks).toEqual({ next: null, review: [], waiting_on_people: [] });
    expect(b.profiles.map((p) => p.name)).toEqual(['ambrose', 'jeremy', 'ambrose-human', 'jeremy-human']);
    expect(Array.isArray(b.presence)).toBe(true);

    // Still unread: the brief is safe to call before anything else.
    expect((await call('token-a', '/claude/brief')).unread).toHaveLength(3);
    expect((await call('token-a', '/claude/brief', null, { method: 'POST' })).code).toBe(405);
  });

  it('shows a hand-off note with your next task', async () => {
    await call('token-ah', '/claude/tasks', { action: 'propose', title: 'Garden', tasks: [{ title: 'Soil' }] });
    await call('token-a', '/claude/tasks', { action: 'claim', task: 1 });
    expect((await call('token-j', '/claude/tasks', { action: 'update', task: 1, note: 'Not mine' })).code).toBe(403);
    expect(await call('token-a', '/claude/tasks', { action: 'update', task: 1, note: 'Beds dug. Seeds next.' })).toMatchObject({ status: 'claimed', handoff: 'Beds dug. Seeds next.' });
    const b = await call('token-a', '/claude/brief');
    expect(b.tasks.next).toMatchObject({ id: 1, handoff: 'Beds dug. Seeds next.' });
  });
});

describe('tightening', () => {
  it('turns away a body that is too big before reading it', async () => {
    const res = await call('token-a', '/claude/messages', 'x'.repeat(70 * 1024));
    expect(res.code).toBe(413);
  });

  it('slows down someone sending a flood', async () => {
    let last;
    for (let i = 0; i < 31; i++) last = await call('token-a', '/claude/messages', { body: `hi ${i}`, wake: false });
    expect(last.code).toBe(429);
    // Typing isn't counted.
    expect((await call('token-a', '/claude/messages', { typing: true })).code).toBe(200);
    // Other people aren't slowed down.
    expect((await call('token-j', '/claude/messages', { body: 'hello', wake: false })).code).toBe(200);
  });

  it('keeps tasks moving in order', async () => {
    await call('token-ah', '/claude/tasks', { action: 'propose', title: 'Garden', tasks: [{ title: 'Soil' }, { title: 'Seeds' }] });
    const pr = 'https://github.com/a/b/pull/1';
    expect((await call('token-a', '/claude/tasks', { action: 'update', task: 1, status: 'review', pr })).code).toBe(403);
    expect((await call('token-ah', '/claude/tasks', { action: 'update', task: 1, status: 'review', pr })).code).toBe(409);
    expect((await call('token-ah', '/claude/tasks', { action: 'update', task: 1, status: 'done' })).code).toBe(409);
    await call('token-a', '/claude/tasks', { action: 'claim', task: 1 });
    await call('token-a', '/claude/tasks', { action: 'update', task: 1, status: 'done' });
    expect((await call('token-a', '/claude/tasks', { action: 'update', task: 1, status: 'open' })).code).toBe(403);
    expect((await call('token-ah', '/claude/tasks', { action: 'update', task: 1, status: 'open' })).status).toBe('open');
  });
});
