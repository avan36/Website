import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude, mentions, wakeTargets } from '../claude.js';

const URL_BASE = 'https://contact-form.example.workers.dev/claude/messages';
const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_jeremy/fire';

// Just enough of D1 for the queries the mailbox makes.
function fakeDb() {
  const rows = [];
  const presence = new Map();
  const seat = (name) => {
    if (!presence.has(name)) presence.set(name, { name, last_read: 0, typing_until: null, working_until: null });
    return presence.get(name);
  };
  return {
    rows,
    prepare: (sql) => ({
      all: async () => ({ results: [...presence.values()] }),
      bind: (...args) => ({
        run: async () => {
          if (sql.includes('presence')) {
            const [name, value] = args;
            const row = seat(name);
            if (sql.includes('(name, last_read)')) row.last_read = Math.max(row.last_read, value);
            if (sql.includes('(name, typing_until)')) row.typing_until = value;
            if (sql.includes('(name, working_until)')) row.working_until = value;
            return { meta: {} };
          }
          if (sql.startsWith('INSERT')) {
            const [sender, body, created_at] = args;
            rows.push({ id: rows.length + 1, sender, body, created_at, woke: 0 });
            return { meta: { last_row_id: rows.length } };
          }
          rows[args[0] - 1].woke = 1;
          return { meta: {} };
        },
        first: async () => ({
          count: rows.filter((r) => r.sender === args[0] && r.woke && r.created_at > args[1]).length,
        }),
        all: async () => ({
          results: rows.filter((r) => r.id > args[0]).slice(-args[1]).reverse(),
        }),
      }),
    }),
  };
}

let env;
let calls;
let respond;

beforeEach(() => {
  env = {
    CLAUDE_DB: fakeDb(),
    CLAUDE_TOKEN_AMBROSE: 'token-a',
    CLAUDE_TOKEN_JEREMY: 'token-j',
    CLAUDE_TOKEN_AMBROSE_HUMAN: 'token-ah',
    CLAUDE_TOKEN_JEREMY_HUMAN: 'token-jh',
    CLAUDE_FIRE_URL_JEREMY: FIRE_URL,
    CLAUDE_FIRE_TOKEN_JEREMY: 'fire-j',
  };
  calls = [];
  respond = () => new Response('{}', { status: 200 });
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return respond();
  });
});
afterEach(() => vi.unstubAllGlobals());

const get = (token, query = '') =>
  handleClaude(new Request(URL_BASE + query, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);

const post = (token, data) =>
  handleClaude(
    new Request(URL_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: typeof data === 'string' ? data : JSON.stringify(data),
    }),
    env,
  );

describe('who gets in', () => {
  it('turns away anyone without a real token and tells them nothing', async () => {
    await post('token-a', { body: 'secret plans' });
    for (const res of [await get(null), await get('wrong'), await post('wrong', { body: 'hi' })]) {
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('secret plans');
    }
    expect(env.CLAUDE_DB.rows).toHaveLength(1);
  });

  it('lets nobody in while the tokens are unset', async () => {
    delete env.CLAUDE_TOKEN_AMBROSE;
    delete env.CLAUDE_TOKEN_JEREMY;
    expect((await get('undefined')).status).toBe(401);
  });

  it('takes the sender from the token, not the request', async () => {
    await post('token-j', { body: 'hello', sender: 'ambrose', from: 'ambrose' });
    const { you, messages } = await (await get('token-j')).json();
    expect(you).toBe('jeremy');
    expect(messages[0].sender).toBe('jeremy');
  });

  it('gives each person a name of their own that a Claude cannot post under', async () => {
    await post('token-ah', { body: 'from me' });
    await post('token-a', { body: 'from my Claude', sender: 'ambrose-human' });
    const { you, messages } = await (await get('token-jh')).json();
    expect(you).toBe('jeremy-human');
    expect(messages.map((m) => m.sender)).toEqual(['ambrose-human', 'ambrose']);
  });
});

describe('messages', () => {
  it('reads oldest first and can skip what it has seen', async () => {
    for (const body of ['one', 'two', 'three']) await post('token-a', { body, wake: false });
    const all = await (await get('token-j')).json();
    expect(all.messages.map((m) => m.body)).toEqual(['one', 'two', 'three']);
    const newer = await (await get('token-j', '?after=2')).json();
    expect(newer.messages.map((m) => m.body)).toEqual(['three']);
  });

  it('refuses a message that is empty, too long or not JSON', async () => {
    for (const bad of [{ body: '   ' }, { body: 'x'.repeat(20001) }, { body: 5 }, {}, 'not json']) {
      expect((await post('token-a', bad)).status).toBe(400);
    }
    expect(env.CLAUDE_DB.rows).toHaveLength(0);
  });

  it('refuses other methods', async () => {
    const res = await handleClaude(
      new Request(URL_BASE, { method: 'DELETE', headers: { Authorization: 'Bearer token-a' } }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

describe('waking the other Claude', () => {
  it('fires their scheduled task with a ping that leaves the message out', async () => {
    const res = await post('token-a', { body: 'the private bit' });
    expect(await res.json()).toMatchObject({ ok: true, id: 1, woke: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(FIRE_URL);
    expect(calls[0].headers.Authorization).toBe('Bearer fire-j');
    expect(calls[0].headers['anthropic-beta']).toBe('experimental-cc-routine-2026-04-01');
    expect(calls[0].body.text).toContain('ambrose');
    expect(calls[0].body.text).not.toContain('the private bit');
  });

  it('lets people talk without waking anyone', async () => {
    const res = await post('token-ah', { body: 'hello Jeremy' });
    expect(await res.json()).toMatchObject({ ok: true, id: 1, woke: false });
    expect(calls).toHaveLength(0);
  });

  it('wakes both Claudes when a person asks', async () => {
    env.CLAUDE_FIRE_URL_AMBROSE = 'https://api.anthropic.com/v1/claude_code/routines/trig_ambrose/fire';
    env.CLAUDE_FIRE_TOKEN_AMBROSE = 'fire-a';
    const res = await post('token-jh', { body: 'time to start', wake: true });
    expect(await res.json()).toMatchObject({ ok: true, id: 1, woke: true });
    expect(calls.map((c) => c.headers.Authorization).sort()).toEqual(['Bearer fire-a', 'Bearer fire-j']);
    expect(calls[0].body.text).toContain('jeremy-human');
    expect(calls[0].body.text).not.toContain('time to start');
  });

  it('leaves them asleep when asked to', async () => {
    const res = await post('token-a', { body: 'thanks, done for now', wake: false });
    expect((await res.json()).woke).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('still keeps the message when the other side has no task to fire', async () => {
    const res = await post('token-j', { body: 'hi' });
    expect(await res.json()).toMatchObject({ ok: true, id: 1, woke: false });
    expect(calls).toHaveLength(0);
  });

  it('still keeps the message when the wake-up fails', async () => {
    respond = () => new Response('{}', { status: 429 });
    expect(await (await post('token-a', { body: 'hi' })).json()).toMatchObject({ ok: true, id: 1, woke: false });
    respond = () => {
      throw new Error('offline');
    };
    expect(await (await post('token-a', { body: 'hi' })).json()).toMatchObject({ ok: true, id: 2, woke: false });
    expect(env.CLAUDE_DB.rows).toHaveLength(2);
  });

  it('stops waking after the daily limit but keeps the messages', async () => {
    for (let i = 0; i < 20; i++) await post('token-a', { body: `message ${i}` });
    expect(calls).toHaveLength(20);
    const res = await post('token-a', { body: 'one too many' });
    expect(await res.json()).toMatchObject({ ok: true, id: 21, woke: false });
    expect(calls).toHaveLength(20);
  });
});

describe('mentions', () => {
  it('finds the people and Claudes a message names', () => {
    expect(mentions('@jeremy-claude can you look? cc @Ambrose.')).toEqual(['jeremy', 'ambrose-human']);
    expect(mentions("@ambrose-claude's turn")).toEqual(['ambrose']);
    expect(mentions('@claudes')).toEqual(['ambrose', 'jeremy']);
  });

  it('skips emails, code and names it does not know', () => {
    expect(mentions('me@jeremy.dev, `@jeremy-claude`, @nobody, @@ambrose')).toEqual([]);
    expect(mentions('```\n@claudes\n```')).toEqual([]);
  });

  it('wakes only the Claudes a message names', () => {
    expect(wakeTargets('ambrose-human', 'hey @jeremy-claude')).toEqual(['jeremy']);
    expect(wakeTargets('ambrose-human', 'hey @jeremy')).toEqual([]);
    expect(wakeTargets('ambrose-human', 'hey @jeremy-claude', true)).toEqual(['ambrose', 'jeremy']);
    expect(wakeTargets('ambrose', 'thanks @jeremy-claude', false)).toEqual([]);
    expect(wakeTargets('ambrose', 'note to self @ambrose-claude')).toEqual(['jeremy']);
    expect(wakeTargets('ambrose', '@ambrose for you')).toEqual(['jeremy']);
  });

  it("tells a mentioned Claude it was mentioned, and says who woke", async () => {
    const res = await post('token-ah', { body: 'can you take this @jeremy-claude' });
    expect(await res.json()).toMatchObject({ woke: true, woken: ['jeremy'] });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toContain('mentions you');
    expect(calls[0].body.text).not.toContain('take this');
  });
});

describe('read receipts', () => {
  const seat = async (token, name) => (await (await get(token)).json()).presence.find((p) => p.name === name);

  it('counts a message as read once someone has fetched it', async () => {
    await post('token-a', { body: 'one', wake: false });
    expect((await (await get('token-a')).json()).presence).toEqual([
      { name: 'ambrose', last_read: 1, typing: false, working: false },
    ]);
    await get('token-jh');
    expect((await seat('token-a', 'jeremy-human')).last_read).toBe(1);
  });

  it('never moves backwards when someone reads older messages', async () => {
    for (const body of ['one', 'two', 'three']) await post('token-a', { body, wake: false });
    await get('token-jh');
    await get('token-jh', '?after=1');
    await get('token-jh', '?after=3');
    expect((await seat('token-a', 'jeremy-human')).last_read).toBe(3);
  });

  it('counts what you send as read', async () => {
    await post('token-a', { body: 'one', wake: false });
    await post('token-jh', { body: 'two' });
    expect((await seat('token-a', 'jeremy-human')).last_read).toBe(2);
  });
});

describe('typing and working', () => {
  afterEach(() => vi.useRealTimers());

  const seat = async (name) =>
    (await (await get('token-ah')).json()).presence.find((p) => p.name === name) ?? {};

  it('shows someone typing, and stops when they send', async () => {
    expect(await (await post('token-jh', { typing: true })).json()).toMatchObject({ ok: true });
    expect((await seat('jeremy-human')).typing).toBe(true);
    await post('token-jh', { body: 'done' });
    expect((await seat('jeremy-human')).typing).toBe(false);
  });

  it('stops when they say so, or when they go quiet', async () => {
    await post('token-jh', { typing: true });
    await post('token-jh', { typing: false });
    expect((await seat('jeremy-human')).typing).toBe(false);

    vi.useFakeTimers({ toFake: ['Date'] });
    await post('token-jh', { typing: true });
    vi.advanceTimersByTime(7000);
    expect((await seat('jeremy-human')).typing).toBe(false);
  });

  it('leaves no message behind, and turns away strangers', async () => {
    await post('token-jh', { typing: true });
    expect(env.CLAUDE_DB.rows).toHaveLength(0);
    expect((await post('wrong', { typing: true })).status).toBe(401);
  });

  it('shows a woken Claude as working until it posts', async () => {
    await post('token-a', { body: 'over to you' });
    expect((await seat('jeremy')).working).toBe(true);
    await post('token-j', { body: 'done', wake: false });
    expect((await seat('jeremy')).working).toBe(false);
  });

  it('stops showing a woken Claude as working if it never posts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await post('token-a', { body: 'over to you' });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect((await seat('jeremy')).working).toBe(false);
  });

  it('only shows Claudes that really woke as working', async () => {
    respond = () => new Response('{}', { status: 429 });
    await post('token-a', { body: 'over to you' });
    expect((await seat('jeremy')).working).toBeFalsy();
  });
});

describe('the board', () => {
  it('can call from its own address, and only that one', async () => {
    const res = await handleClaude(new Request(URL_BASE, { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ambrosevannier.com');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect((await get('token-a')).headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ambrosevannier.com');
  });
});
