// Small, hand-updated facts about life outside the code, shown on the
// middle place page in the "From the writing desk" section.
//
// Nothing here is private: only a word count and titles. No journal content
// ever goes in this file.

export type ShelfEntry = {
  title: string;
  kind: 'film' | 'tv';
  /** One line, in your own words. Leave it out for a plain spine. */
  take?: string;
  /** Draft entries are never rendered. Placeholders ship as drafts. */
  draft?: boolean;
};

/**
 * HOW TO UPDATE THE WORD JAR
 * Change `journalWords` to the new total (a round number is fine; the page
 * shows it with a "+") and set `journalWordsUpdated` to today (YYYY-MM-DD).
 * Returning visitors see the jar count up from the number they last saw.
 */
export const journalWords = 330000;
export const journalWordsUpdated = '2026-10-04';

/**
 * HOW TO STOCK THE SHELF
 * Add an entry to `watching` (what's on right now) or `takes` (hot takes):
 *
 *   { title: 'Some Film', kind: 'film', take: 'Your one-line opinion.' },
 *   { title: 'Some Show', kind: 'tv' },
 *
 * Entries with `draft: true` are hidden, so the placeholders below never show.
 * Delete them (or remove `draft: true` after rewriting them) once you add real
 * ones. With no non-draft entries, the shelf says it's "being stocked".
 */
export const shelf: { watching: ShelfEntry[]; takes: ShelfEntry[] } = {
  watching: [
    { title: 'PLACEHOLDER: a show you are watching', kind: 'tv', draft: true },
  ],
  takes: [
    { title: 'PLACEHOLDER: a film', kind: 'film', take: 'PLACEHOLDER: your take goes here.', draft: true },
    { title: 'PLACEHOLDER: a reality show', kind: 'tv', take: 'PLACEHOLDER: your take goes here.', draft: true },
  ],
};
