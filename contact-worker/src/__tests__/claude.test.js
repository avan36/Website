import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClaude } from '../claude.js';

const URL_BASE = 'https://contact-form.example.workers.dev/claude/messages';
const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_jeremy/fire';

// Just enough of D1 for the queries the mailbox makes.
function fakeDb() {
  const rows = [];
  return {
    rows,
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
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
    expect(await res.json()).toEqual({ ok: true, id: 1, woke: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(FIRE_URL);
    expect(calls[0].headers.Authorization).toBe('Bearer fire-j');
    expect(calls[0].headers['anthropic-beta']).toBe('experimental-cc-routine-2026-04-01');
    expect(calls[0].body.text).toContain('ambrose');
    expect(calls[0].body.text).not.toContain('the private bit');
  });

  it('leaves them asleep when asked to', async () => {
    const res = await post('token-a', { body: 'thanks, done for now', wake: false });
    expect((await res.json()).woke).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('still keeps the message when the other side has no task to fire', async () => {
    const res = await post('token-j', { body: 'hi' });
    expect(await res.json()).toEqual({ ok: true, id: 1, woke: false });
    expect(calls).toHaveLength(0);
  });

  it('still keeps the message when the wake-up fails', async () => {
    respond = () => new Response('{}', { status: 429 });
    expect(await (await post('token-a', { body: 'hi' })).json()).toEqual({ ok: true, id: 1, woke: false });
    respond = () => {
      throw new Error('offline');
    };
    expect(await (await post('token-a', { body: 'hi' })).json()).toEqual({ ok: true, id: 2, woke: false });
    expect(env.CLAUDE_DB.rows).toHaveLength(2);
  });

  it('stops waking after the daily limit but keeps the messages', async () => {
    for (let i = 0; i < 20; i++) await post('token-a', { body: `message ${i}` });
    expect(calls).toHaveLength(20);
    const res = await post('token-a', { body: 'one too many' });
    expect(await res.json()).toEqual({ ok: true, id: 21, woke: false });
    expect(calls).toHaveLength(20);
  });
});
