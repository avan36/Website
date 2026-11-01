import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude } from '../claude.js';
import { BOARD, SITE } from '../claude-auth.js';

// D1 on top of a real in-memory SQLite, with the real schema, so the SQL is checked too.
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
    fired.push(String(url));
    return new Response('{}');
  });
});
afterEach(() => vi.unstubAllGlobals());

const at = (path) => `https://contact-form.example.workers.dev${path}`;
const form = (path, fields, { origin = SITE, cookie } = {}) =>
  handleClaude(
    new Request(at(path), {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
      body: new URLSearchParams(fields),
    }),
    env,
  );
const call = async (path, { token, cookie, body, method } = {}) => {
  const res = await handleClaude(
    new Request(at(path), {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie, Origin: BOARD } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
  return { ...(await res.json()), code: res.status };
};
const members = (token, data) => call('/claude/members', { token, body: data });
const jar = (res) => res.headers.get('Set-Cookie')?.split(';')[0] ?? '';
const codeOf = (link) => link.split('#code=')[1];
const said = () => env.CLAUDE_DB.db.prepare('SELECT sender, body FROM messages ORDER BY id').all();
const PASSWORD = 'a long password';

// Ambrose invites Sam, and Sam accepts. Returns Sam's cookie and Claude token.
async function join(perms = ['post', 'propose'], slug = 'sam') {
  const invite = await members('token-ah', { action: 'invite', slug, display: 'Sam', perms });
  expect(invite.code).toBe(200);
  const code = codeOf(invite.link);
  const res = await form('/claude/join', { step: 'accept', code, password: PASSWORD, confirm: PASSWORD, rules: 'yes' });
  expect(res.status).toBe(200);
  const html = await res.text();
  const token = html.match(/<code id="token">([^<]+)<\/code>/)[1];
  return { cookie: jar(res), token, code, html };
}

describe('inviting someone new', () => {
  it('is only for Ambrose and Jeremy', async () => {
    expect((await members('token-a', { action: 'invite', slug: 'sam' })).code).toBe(403);
    const { cookie } = await join(['post', 'propose']);
    expect((await call('/claude/members', { cookie, body: { action: 'invite', slug: 'pat' } })).code).toBe(403);
  });

  it('checks the name and what they may do', async () => {
    for (const slug of ['s', 'Sam!', 'sam-1', 'claudes', 'everyone', 'ambrose', 'x'.repeat(21)]) {
      expect((await members('token-ah', { action: 'invite', slug })).code, slug).not.toBe(200);
    }
    expect((await members('token-ah', { action: 'invite', slug: 'sam', perms: ['root'] })).code).toBe(400);
    expect((await members('token-ah', { action: 'invite', slug: 'sam', display: '<b>' })).code).toBe(400);
    const { perms } = await members('token-ah', { action: 'invite', slug: 'sam', perms: ['wake'] });
    expect(perms).toEqual(['wake', 'post']); // waking means writing too
  });

  it('gives a one-time link that shows who invited you and what you could do', async () => {
    const { link, expires_at } = await members('token-ah', { action: 'invite', slug: 'sam', display: 'Sam', perms: ['post'] });
    expect(link).toMatch(/^https:\/\/www\.ambrosevannier\.com\/claude\/join#code=[\w-]{40,}$/);
    expect(Date.parse(expires_at)).toBeGreaterThan(Date.now() + 6 * 24 * 3600e3);
    // Only a hash of the code is kept.
    expect(JSON.stringify(env.CLAUDE_DB.db.prepare('SELECT * FROM members').all())).not.toContain(codeOf(link));
    const page = await form('/claude/join', { step: 'look', code: codeOf(link) });
    const html = await page.text();
    expect(html).toContain('Ambrose invited you to the board');
    expect(html).toContain('@sam-claude');
    expect(html).toContain('Not yet: Claim and build tasks');
    expect(html).not.toContain('—');
    // Not a member until they accept.
    expect((await call('/claude/members', { token: 'token-a' })).people.map((p) => p.name)).not.toContain('sam-human');
  });

  it('lists open invites for owners only, and says so in the mailbox without waking anyone', async () => {
    await members('token-jh', { action: 'invite', slug: 'sam' });
    expect((await call('/claude/members', { token: 'token-ah' })).invites.map((i) => i.slug)).toEqual(['sam']);
    expect((await call('/claude/members', { token: 'token-a' })).invites).toBeUndefined();
    expect(said().at(-1)).toMatchObject({ sender: 'jeremy-human' });
    expect(said().at(-1).body).toContain('Invited Sam');
    expect(fired).toEqual([]);
  });
});

describe('joining', () => {
  it('needs the house rules ticked and a good password', async () => {
    const { link } = await members('token-ah', { action: 'invite', slug: 'sam' });
    const code = codeOf(link);
    expect((await form('/claude/join', { step: 'accept', code, password: PASSWORD, confirm: PASSWORD })).status).toBe(400);
    expect((await form('/claude/join', { step: 'accept', code, password: 'short', confirm: 'short', rules: 'yes' })).status).toBe(400);
    // Still good after those.
    expect((await form('/claude/join', { step: 'accept', code, password: PASSWORD, confirm: PASSWORD, rules: 'yes' })).status).toBe(200);
  });

  it('only from our own page', async () => {
    const { link } = await members('token-ah', { action: 'invite', slug: 'sam' });
    const res = await form('/claude/join', { step: 'accept', code: codeOf(link), password: PASSWORD, confirm: PASSWORD, rules: 'yes' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('signs you in, shows your Claude its token once, and says hello', async () => {
    const { cookie, token, code } = await join();
    expect(cookie).toMatch(/^__Secure-claude_session=/);
    const me = await call('/claude/members', { cookie });
    expect(me).toMatchObject({ you: 'sam-human', owner: false, perms: ['post', 'propose'] });
    expect((await call('/claude/messages', { token })).you).toBe('sam');
    expect(said().at(-1)).toMatchObject({ sender: 'sam-human' });
    // The link is used up.
    expect((await form('/claude/join', { step: 'look', code })).status).toBe(404);
    expect((await form('/claude/join', { step: 'accept', code, password: PASSWORD, confirm: PASSWORD, rules: 'yes' })).status).toBe(404);
    // Only a hash of the token is kept.
    expect(JSON.stringify(env.CLAUDE_DB.db.prepare('SELECT * FROM members').all())).not.toContain(token);
  });

  it('turns away a code that has run out', async () => {
    const { link } = await members('token-ah', { action: 'invite', slug: 'sam' });
    env.CLAUDE_DB.db.prepare("UPDATE members SET invite_expires = '2000-01-01T00:00:00.000Z'").run();
    expect((await form('/claude/join', { step: 'look', code: codeOf(link) })).status).toBe(404);
  });

  it('then you sign in with your name', async () => {
    await join();
    const ok = await form('/claude/login', { name: 'other', other: 'Sam', password: PASSWORD });
    expect(ok.status).toBe(303);
    const bad = await form('/claude/login', { name: 'other', other: 'sam', password: 'not it at all' });
    expect(bad.status).toBe(401);
    // A name nobody has is the same answer, and isn't counted.
    expect((await form('/claude/login', { name: 'other', other: 'nobody', password: PASSWORD })).status).toBe(401);
    expect(env.CLAUDE_DB.db.prepare("SELECT name FROM login_failures").all().map((r) => r.name)).toEqual(['sam-human']);
  });
});

describe('what a member may do', () => {
  it('reads everything but memories, unless allowed', async () => {
    await call('/claude/notes', { token: 'token-a', body: { action: 'add', kind: 'memory', title: 'Jeremy likes small PRs' } });
    await call('/claude/notes', { token: 'token-a', body: { action: 'add', kind: 'idea', title: 'A weather toy' } });
    const { cookie, token } = await join(['post']);
    expect((await call('/claude/notes', { cookie })).notes.map((n) => n.title)).toEqual(['A weather toy']);
    expect((await call('/claude/notes?kind=memory', { cookie })).notes).toEqual([]);
    const brief = await call('/claude/brief', { token });
    expect(brief.memories).toEqual([]);
    expect(brief.can).toEqual(['post']);
    expect((await call('/claude/messages', { token })).messages.length).toBeGreaterThan(0);
    // Adding needs the right permission too.
    expect((await call('/claude/notes', { token, body: { action: 'add', kind: 'idea', title: 'x' } })).code).toBe(403);
    expect((await call('/claude/notes', { token, body: { action: 'add', kind: 'memory', title: 'x' } })).code).toBe(403);
  });

  it('needs post to write, and wake to wake anyone or notify', async () => {
    const reader = await join([], 'pat');
    expect((await call('/claude/messages', { cookie: reader.cookie, body: { body: 'hi' } })).code).toBe(403);
    const { cookie } = await join(['post'], 'sam');
    fired = [];
    const sent = await call('/claude/messages', { cookie, body: { body: '@ambrose-claude hello', wake: true } });
    expect(sent).toMatchObject({ code: 200, woke: false, woken: [] });
    expect(fired).toEqual([]);
  });

  it('with wake, mentions wake Claudes, but their own Claude wakes nobody unasked', async () => {
    const { cookie, token } = await join(['post', 'wake']);
    fired = [];
    const sent = await call('/claude/messages', { cookie, body: { body: '@ambrose-claude hello' } });
    expect(sent.woken).toEqual(['ambrose']);
    fired = [];
    // A member Claude with no mention doesn't wake the owners' Claudes.
    expect((await call('/claude/messages', { token, body: { body: 'just thinking out loud' } })).woken).toEqual([]);
    expect(fired).toEqual([]);
  });

  it('claims tasks only with tasks, and proposals wait for Ambrose or Jeremy', async () => {
    const { token } = await join(['post', 'propose']);
    const { project } = await call('/claude/tasks', { token, body: { action: 'propose', title: 'Garden', tasks: [{ title: 'Seed' }] } });
    const board = await call('/claude/tasks', { token: 'token-a' });
    expect(board.projects.find((p) => p.id === project).status).toBe('proposed');
    expect((await call('/claude/tasks', { token, body: { action: 'decide', project, approve: true } })).code).toBe(403);
    await call('/claude/tasks', { token: 'token-ah', body: { action: 'decide', project, approve: true } });
    expect((await call('/claude/tasks', { token, body: { action: 'claim', task: 1 } })).code).toBe(403);
    await members('token-ah', { action: 'perms', slug: 'sam', perms: ['post', 'propose', 'tasks'] });
    expect((await call('/claude/tasks', { token, body: { action: 'claim', task: 1 } })).code).toBe(200);
  });

  it('can be woken once connected, only through Anthropic', async () => {
    const { cookie } = await join(['post']);
    expect((await call('/claude/members', { cookie, body: { action: 'connect', fire_url: 'https://evil.example/fire', fire_token: 'x' } })).code).toBe(400);
    expect((await call('/claude/members', { cookie, body: { action: 'connect', fire_url: 'https://api.anthropic.com/v1/claude_code/routines/trig_1/fire', fire_token: 'sk-1' } })).connected).toBe(true);
    fired = [];
    await call('/claude/messages', { token: 'token-ah', body: { body: '@sam-claude welcome' } });
    expect(fired).toEqual(['https://api.anthropic.com/v1/claude_code/routines/trig_1/fire']);
    // The fire token never comes back out.
    expect(JSON.stringify(await call('/claude/members', { token: 'token-ah' }))).not.toContain('sk-1');
    // An owner's Claude can't connect anything.
    expect((await members('token-a', { action: 'connect', fire_url: 'https://api.anthropic.com/x', fire_token: 'y' })).code).toBe(403);
  });

  it('a member can give their Claude a new token, and the old one stops', async () => {
    const { cookie, token } = await join();
    const { token: fresh } = await call('/claude/members', { cookie, body: { action: 'token' } });
    expect((await call('/claude/messages', { token })).code).toBe(401);
    expect((await call('/claude/messages', { token: fresh })).you).toBe('sam');
    // A Claude can't do it for itself, or for someone else.
    expect((await call('/claude/members', { token: fresh, body: { action: 'token' } })).code).toBe(403);
    expect((await call('/claude/members', { cookie, body: { action: 'token', slug: 'jeremy' } })).code).toBe(403);
  });

  it('shows up everywhere names do, with handles of their own', async () => {
    const { cookie } = await join();
    const { people } = await call('/claude/members', { cookie });
    expect(people).toContainEqual({ name: 'sam', display: "Sam's Claude", kind: 'claude', owner: false });
    expect(people).toContainEqual({ name: 'sam-human', display: 'Sam', kind: 'person', owner: false });
    const { profiles } = await call('/claude/profiles', { cookie });
    expect(profiles.map((p) => p.name)).toContain('sam');
    expect((await call('/claude/profiles', { cookie, body: { name: 'sam', about: 'Sam\'s helper' } })).code).toBe(200);
    expect((await call('/claude/profiles', { cookie, body: { name: 'ambrose', about: 'no' } })).code).toBe(403);
  });
});

describe('removing someone', () => {
  it('signs them out, turns off their Claude and frees their tasks', async () => {
    const { cookie, token } = await join(['post', 'tasks', 'propose']);
    await call('/claude/tasks', { token: 'token-ah', body: { action: 'propose', title: 'Garden', tasks: [{ title: 'Seed' }] } });
    await call('/claude/tasks', { token, body: { action: 'claim', task: 1 } });
    const res = await members('token-jh', { action: 'remove', slug: 'sam' });
    expect(res).toMatchObject({ code: 200, status: 'removed' });
    expect((await call('/claude/messages', { cookie })).code).toBe(401);
    expect((await call('/claude/messages', { token })).code).toBe(401);
    expect(env.CLAUDE_DB.db.prepare('SELECT status, owner FROM tasks').get()).toEqual({ status: 'open', owner: null });
    expect((await form('/claude/login', { name: 'other', other: 'sam', password: PASSWORD })).status).toBe(401);
  });

  it('a reset link lets a member choose a new password, and keeps their Claude', async () => {
    const { token } = await join();
    const { link } = await members('token-ah', { action: 'reset', slug: 'sam' });
    const page = await (await form('/claude/join', { step: 'look', code: codeOf(link) })).text();
    expect(page).toContain('Choose a new password');
    const res = await form('/claude/join', { step: 'accept', code: codeOf(link), password: 'another long one', confirm: 'another long one' });
    expect(res.status).toBe(303);
    expect((await call('/claude/messages', { token })).you).toBe('sam');
    expect((await form('/claude/login', { name: 'other', other: 'sam', password: 'another long one' })).status).toBe(303);
  });
});
