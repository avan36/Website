import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmSubscription, sendConfirmation } from '../newsletter.js';

const ORIGIN = 'https://contact-form.example.workers.dev';
const env = { RESEND_API_KEY: 're_test', NEWSLETTER_SECRET: 'test-secret', RESEND_SEGMENT_ID: 'seg_1' };

let calls;
let respond;

beforeEach(() => {
  calls = [];
  respond = () => new Response('{}', { status: 200 });
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), body: init.body && JSON.parse(init.body), auth: init.headers.Authorization });
    return respond(String(url));
  });
});
afterEach(() => vi.unstubAllGlobals());

// Signs up and returns the confirmation link from the email that went out.
async function linkFor(email) {
  await sendConfirmation(email, ORIGIN, env);
  const link = new URL(calls.at(-1).body.text.match(/https:\S+/)[0]);
  calls = [];
  return link;
}

describe('sendConfirmation', () => {
  it('emails a confirmation link and adds nobody to the list yet', async () => {
    const result = await sendConfirmation('  You@Example.com ', ORIGIN, env);
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].auth).toBe('Bearer re_test');
    expect(calls[0].body.to).toBe('you@example.com');
    expect(calls[0].body.text).toContain(`${ORIGIN}/newsletter/confirm?email=you%40example.com&token=`);
  });

  it('turns away a bad address without sending anything', async () => {
    const result = await sendConfirmation('not-an-email', ORIGIN, env);
    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('says so when Resend refuses', async () => {
    respond = () => new Response('{}', { status: 429 });
    const result = await sendConfirmation('you@example.com', ORIGIN, env);
    expect(result.status).toBe(502);
    expect(result.body.ok).toBe(false);
  });
});

describe('confirmSubscription', () => {
  it('adds the contact to the segment and sends them back to the writing page', async () => {
    const res = await confirmSubscription(await linkFor('you@example.com'), env);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://ambrosevannier.com/blog#subscribed');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.resend.com/contacts',
      'https://api.resend.com/contacts/you%40example.com/segments/seg_1',
    ]);
    expect(calls[0].body).toEqual({ email: 'you@example.com', unsubscribed: false });
  });

  it('still works when the contact already exists', async () => {
    const link = await linkFor('you@example.com');
    respond = (url) => new Response('{}', { status: url.endsWith('/contacts') ? 409 : 200 });
    expect((await confirmSubscription(link, env)).status).toBe(303);
  });

  it('refuses a link signed for someone else', async () => {
    const link = await linkFor('you@example.com');
    link.searchParams.set('email', 'other@example.com');
    expect((await confirmSubscription(link, env)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('refuses a made-up token', async () => {
    const link = new URL(`${ORIGIN}/newsletter/confirm?email=you%40example.com&token=${'a'.repeat(64)}`);
    expect((await confirmSubscription(link, env)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('refuses a link with no token', async () => {
    const link = new URL(`${ORIGIN}/newsletter/confirm?email=you%40example.com`);
    expect((await confirmSubscription(link, env)).status).toBe(400);
  });

  it('says so when the contact could not be added', async () => {
    const link = await linkFor('you@example.com');
    respond = (url) => new Response('{}', { status: url.includes('/segments/') ? 500 : 200 });
    expect((await confirmSubscription(link, env)).status).toBe(502);
  });
});
