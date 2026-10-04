// Pure logic for the guestbook in a bottle: validating a note before it's
// sent, and picking which approved notes wash up on this visit.
// The contact worker repeats these limits (contact-worker/src/index.js); keep
// them in step.
import type { GuestbookEntry } from '../../data/guestbook';

export const GUESTBOOK_MAX_MESSAGE = 140;
export const GUESTBOOK_MAX_NAME = 40;
export const GUESTBOOK_SHOWN = 3;

/** Collapses runs of whitespace (newlines included) into single spaces. */
export const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|info|biz)\b)/i;

export type GuestbookCheck =
  | { ok: true; value: { name: string; message: string } }
  | { ok: false; field: 'name' | 'message'; error: string };

export function checkGuestbook(input: { name?: string; message?: string }): GuestbookCheck {
  const name = oneLine(input.name ?? '');
  const message = oneLine(input.message ?? '');
  if (!message) return { ok: false, field: 'message', error: 'Write a line to put in the bottle.' };
  if ([...message].length > GUESTBOOK_MAX_MESSAGE)
    return { ok: false, field: 'message', error: `Keep it to ${GUESTBOOK_MAX_MESSAGE} characters, so it fits in the bottle.` };
  if (LINK.test(message)) return { ok: false, field: 'message', error: "Links don't fit in the bottle. Just words, please." };
  if ([...name].length > GUESTBOOK_MAX_NAME)
    return { ok: false, field: 'name', error: 'A first name or initials is plenty.' };
  if (LINK.test(name)) return { ok: false, field: 'name', error: 'A first name or initials is plenty.' };
  return { ok: true, value: { name, message } };
}

/**
 * Up to `n` distinct entries in random order (a partial Fisher–Yates), without
 * touching the input. `random` is injectable for tests.
 */
export function pickNotes<T = GuestbookEntry>(entries: readonly T[], n = GUESTBOOK_SHOWN, random: () => number = Math.random): T[] {
  const pool = entries.slice();
  const count = Math.max(0, Math.min(n, pool.length));
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** "— Ana" or "— a passing sailor" when they left no name. */
export const signature = (name?: string): string => `— ${name && name.trim() ? name.trim() : 'a passing sailor'}`;
