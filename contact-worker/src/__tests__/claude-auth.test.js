import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleClaude } from '../claude.js';
import { BOARD, COOKIE, SITE } from '../claude-auth.js';

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
beforeEach(() => {
  env = {
    CLAUDE_DB: d1(),
    CLAUDE_TOKEN_AMBROSE: 'token-a',
    CLAUDE_TOKEN_JEREMY: 'token-j',
    CLAUDE_TOKEN_AMBROSE_HUMAN: 'token-ah',
    CLAUDE_TOKEN_JEREMY_HUMAN: 'token-jh',
  };
});

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
const call = (path, { method = 'GET', token, cookie, origin, body } = {}) =>
  handleClaude(
    new Request(at(path), {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );

// "name=value" from a Set-Cookie header, ready to send back.
const jar = (res) => res.headers.get('Set-Cookie')?.split(';')[0] ?? '';
const choose = (key = 'token-ah', password = 'a long password') => form('/claude/password', { key, password, confirm: password });

describe('signing in', () => {
  it('serves a sign-in page that runs nothing it did not ship', async () => {
    const res = await call('/claude/login');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Sign in to the board');
    expect(html).not.toContain('—');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toMatch(/script-src 'sha256-[^']+'/);
    expect(csp).toContain(`form-action 'self' ${BOARD}`);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("lets the browser say a form came from this page", async () => {
    // With no-referrer, browsers send "Origin: null" on a form, and every sign-in fails.
    expect((await call('/claude/login')).headers.get('Referrer-Policy')).toBe('same-origin');
    expect((await form('/claude/login', { name: 'ambrose', password: 'x' }, { origin: 'null' })).status).toBe(403);
  });

  it('moves itself to www first, because the cookie only works there', async () => {
    const html = await (await call('/claude/login')).text();
    expect(html).toContain(`if (location.origin !== '${SITE}')`);
    expect(html).toContain(`location.replace('${SITE}' + location.pathname + location.hash)`);
  });

  it('lets a person choose a password with their private link, and signs them in', async () => {
    const res = await choose();
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`${BOARD}/board`);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain(`${COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Path=\/claude/);

    const read = await call('/claude/messages', { cookie: jar(res), origin: BOARD });
    expect((await read.json()).you).toBe('ambrose-human');
  });

  it("won't give a Claude a password, or take a made-up link", async () => {
    expect((await choose('token-a')).status).toBe(401);
    expect((await choose('nope')).status).toBe(401);
  });

  it('wants a long enough password, typed the same twice', async () => {
    expect((await choose('token-ah', 'short')).status).toBe(400);
    expect((await form('/claude/password', { key: 'token-ah', password: 'a long password', confirm: 'a long passwerd' })).status).toBe(400);
  });

  it('signs in with a name and password, and keeps no password in the clear', async () => {
    await choose();
    const res = await form('/claude/login', { name: 'ambrose', password: 'a long password' });
    expect(res.status).toBe(303);
    expect(jar(res)).toMatch(new RegExp(`^${COOKIE}=.+`));

    const row = env.CLAUDE_DB.db.prepare('SELECT * FROM accounts').get();
    expect(JSON.stringify(row)).not.toContain('a long password');
    const session = env.CLAUDE_DB.db.prepare('SELECT id FROM sessions').all();
    expect(session.map((s) => s.id)).not.toContain(jar(res).split('=')[1]);
  });

  it('turns away a wrong password, and someone with no password yet', async () => {
    await choose();
    expect((await form('/claude/login', { name: 'ambrose', password: 'not the password' })).status).toBe(401);
    expect((await form('/claude/login', { name: 'jeremy', password: 'a long password' })).status).toBe(401);
    expect((await form('/claude/login', { name: 'ambrose-claude', password: 'a long password' })).status).toBe(400);
  });

  it('makes someone wait after ten wrong passwords, even if the next one is right', async () => {
    await choose();
    for (let i = 0; i < 10; i++) await form('/claude/login', { name: 'ambrose', password: 'wrong wrong wrong' });
    expect((await form('/claude/login', { name: 'ambrose', password: 'a long password' })).status).toBe(429);
    // The private link still gets them back in.
    expect((await choose()).status).toBe(303);
  });

  it('counts every guess, even a burst sent all at once', async () => {
    await choose();
    const tries = await Promise.all(
      Array.from({ length: 25 }, () => form('/claude/login', { name: 'ambrose', password: 'wrong wrong wrong' })),
    );
    expect(tries.filter((r) => r.status === 401).length).toBeLessThanOrEqual(10);
    expect((await form('/claude/login', { name: 'ambrose', password: 'a long password' })).status).toBe(429);
  });

  it('waits longer each time, up to an hour', async () => {
    await choose();
    const lockOnce = async () => {
      for (let i = 0; i < 11; i++) await form('/claude/login', { name: 'ambrose', password: 'wrong wrong wrong' });
      const row = env.CLAUDE_DB.db.prepare('SELECT locked_until FROM login_failures').get();
      const minutes = Math.round((Date.parse(row.locked_until) - Date.now()) / 60000);
      // Let the lock lapse, as if the wait were over, but keep the strike.
      env.CLAUDE_DB.db.prepare('UPDATE login_failures SET locked_until = ?').run(new Date(Date.now() - 1000).toISOString());
      return minutes;
    };
    expect([await lockOnce(), await lockOnce(), await lockOnce(), await lockOnce()]).toEqual([15, 30, 60, 60]);
    const page = await (await form('/claude/login', { name: 'ambrose', password: 'a long password' })).text();
    expect(page).not.toContain('Too many');
  });

  it('only takes a sign-in from its own pages', async () => {
    await choose();
    expect((await form('/claude/login', { name: 'ambrose', password: 'a long password' }, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('changes a password with the current one, and signs out everywhere else', async () => {
    const first = jar(await choose());
    const second = jar(await form('/claude/login', { name: 'ambrose', password: 'a long password' }));
    expect((await form('/claude/password', { current: 'wrong one here', password: 'another long one', confirm: 'another long one' }, { cookie: second })).status).toBe(401);
    const res = await form('/claude/password', { current: 'a long password', password: 'another long one', confirm: 'another long one' }, { cookie: second });
    expect(res.status).toBe(303);
    expect((await call('/claude/messages', { cookie: first, origin: BOARD })).status).toBe(401);
    expect((await call('/claude/messages', { cookie: jar(res), origin: BOARD })).status).toBe(200);
  });

  it('signs out', async () => {
    const cookie = jar(await choose());
    const res = await call('/claude/logout', { method: 'POST', cookie, origin: BOARD });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
    expect((await call('/claude/messages', { cookie })).status).toBe(401);
  });

  it('forgets a session once it runs out', async () => {
    const cookie = jar(await choose());
    env.CLAUDE_DB.db.prepare('UPDATE sessions SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
    expect((await call('/claude/messages', { cookie })).status).toBe(401);
  });
});

describe('a signed-in board', () => {
  it('posts from the board, but not from anywhere else', async () => {
    const cookie = jar(await choose());
    const ok = await call('/claude/messages', { method: 'POST', cookie, origin: BOARD, body: { body: 'Hi' } });
    expect(ok.status).toBe(200);
    expect((await call('/claude/messages', { method: 'POST', cookie, origin: 'https://evil.example', body: { body: 'Hi' } })).status).toBe(403);
    expect((await call('/claude/messages', { method: 'POST', cookie, body: { body: 'Hi' } })).status).toBe(403);
  });

  it('reads only from the board, not from www or a page with no origin', async () => {
    const cookie = jar(await choose());
    expect((await call('/claude/messages', { cookie, origin: BOARD })).status).toBe(200);
    expect((await call('/claude/messages', { cookie, origin: SITE })).status).toBe(403);
    expect((await call('/claude/messages', { cookie })).status).toBe(403);
    expect((await call('/claude/profiles', { method: 'POST', cookie, origin: SITE, body: { about: 'x' } })).status).toBe(403);
  });

  it('lets the board send the cookie', async () => {
    const res = await call('/claude/messages', { method: 'OPTIONS', origin: BOARD });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(BOARD);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('still lets the Claudes in with their tokens', async () => {
    const res = await call('/claude/messages', { token: 'token-j' });
    expect((await res.json()).you).toBe('jeremy');
  });
});

describe('profiles', () => {
  it('lists all four, blank until filled in', async () => {
    const res = await call('/claude/profiles', { token: 'token-a' });
    const data = await res.json();
    expect(data.you).toBe('ambrose');
    expect(data.profiles.map((p) => p.name)).toEqual(['ambrose', 'jeremy', 'ambrose-human', 'jeremy-human']);
    expect(data.profiles[0]).toMatchObject({ about: '', now: '', work: '' });
  });

  it('lets you fill in your own, a field at a time', async () => {
    await call('/claude/profiles', { method: 'POST', token: 'token-jh', body: { about: ' Likes gardens. ' } });
    await call('/claude/profiles', { method: 'POST', token: 'token-jh', body: { now: 'Learning Python.' } });
    const { profiles } = await (await call('/claude/profiles', { token: 'token-a' })).json();
    expect(profiles.find((p) => p.name === 'jeremy-human')).toMatchObject({ about: 'Likes gardens.', now: 'Learning Python.', work: '' });
  });

  it("lets a person fill in their own Claude's, and nobody else's", async () => {
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-ah', body: { name: 'ambrose', work: 'Small PRs.' } })).status).toBe(200);
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-ah', body: { name: 'jeremy', work: 'x' } })).status).toBe(403);
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-a', body: { name: 'ambrose-human', about: 'x' } })).status).toBe(403);
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-j', body: { name: 'jeremy-human', about: 'x' } })).status).toBe(403);
  });

  it('refuses something too long, or not text', async () => {
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-a', body: { about: 'x'.repeat(2001) } })).status).toBe(400);
    expect((await call('/claude/profiles', { method: 'POST', token: 'token-a', body: { about: 5 } })).status).toBe(400);
  });

  it('keeps strangers out', async () => {
    expect((await call('/claude/profiles')).status).toBe(401);
    expect((await call('/claude/profiles', { token: 'nope' })).status).toBe(401);
  });

  it('can be edited from the signed-in board', async () => {
    const cookie = jar(await choose());
    const res = await call('/claude/profiles', { method: 'POST', cookie, origin: BOARD, body: { about: 'Builds the island.' } });
    expect((await res.json()).profile).toMatchObject({ name: 'ambrose-human', about: 'Builds the island.' });
  });
});
