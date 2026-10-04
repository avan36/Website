// Pure logic for the "From the writing desk" section on the middle place page:
// the word-count jar and the film & TV shelf. No DOM, so it's tested in node.
import type { ShelfEntry } from '../../data/life';

export const JAR_STORAGE_KEY = 'av:journal-words-seen';

/** 330000 → "330,000". Always en-US grouping so server and client agree. */
export const formatWords = (n: number): string => Math.max(0, Math.round(n)).toLocaleString('en-US');

/** The jar is sized to the next round 100k above the count, so it's never full. */
export function jarCapacity(words: number, step = 100_000): number {
  return (Math.floor(Math.max(0, words) / step) + 1) * step;
}

/** How full the jar looks, 0..1. */
export const jarFill = (words: number, capacity = jarCapacity(words)): number =>
  capacity <= 0 ? 0 : Math.min(1, Math.max(0, words / capacity));

/** Parses what localStorage remembered; anything odd counts as "never seen". */
export function parseSeen(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * What a visitor should see: where the counter starts, and how many words
 * were added since they last looked. Only counts up; if the number somehow
 * went down (a correction), it just shows the new number.
 */
export function plan(seen: number | null, now: number): { from: number; to: number; added: number } {
  if (seen == null || seen >= now) return { from: now, to: now, added: 0 };
  return { from: seen, to: now, added: now - seen };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** The counter's value at progress t (0..1), eased, as a whole number. */
export function countAt(from: number, to: number, t: number): number {
  const k = easeOutCubic(Math.min(1, Math.max(0, t)));
  return t >= 1 ? to : Math.round(from + (to - from) * k);
}

/** Every frame of a count-up, ending exactly on `to`. Never decreases. */
export function countSteps(from: number, to: number, frames: number): number[] {
  const n = Math.max(1, Math.floor(frames));
  return Array.from({ length: n }, (_, i) => countAt(from, to, (i + 1) / n));
}

/** "+1,200 words since your last visit", or '' when nothing changed. */
export const sinceNote = (added: number): string =>
  added > 0 ? `+${formatWords(added)} ${added === 1 ? 'word' : 'words'} since your last visit` : '';

/** The shelf as published: drafts dropped, plus whether anything is left. */
export function publishedShelf(shelf: { watching: ShelfEntry[]; takes: ShelfEntry[] }) {
  const watching = shelf.watching.filter((e) => !e.draft);
  const takes = shelf.takes.filter((e) => !e.draft);
  return { watching, takes, empty: watching.length === 0 && takes.length === 0 };
}
