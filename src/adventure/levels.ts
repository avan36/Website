// The adventure: a separate mode, away from the island, where each chapter is
// a place from Ambrose's life you can drive round. Chapters are numbered in
// the order they happened. One that isn't written yet is a draft and never
// shows (placeholders never ship), so the menu only lists finished chapters.

export type Chapter = {
  /** Where it falls in the story. Chapter 3 is Wesleyan. */
  n: number;
  id: string;
  title: string;
  /** A short line under the title: where it is. */
  where: string;
  /** One or two plain sentences for the chapter card, true to the about page. */
  blurb: string;
  /** What you do there. */
  play: string;
  /** Its color, used on its card and its gates. */
  color: string;
  /** Not written yet: kept out of the menu. */
  draft?: boolean;
};

export const chapters: Chapter[] = [
  {
    n: 3,
    id: 'wesleyan',
    title: 'Wesleyan',
    where: 'Middletown, Connecticut',
    blurb: 'I studied Computer Science and History here, and graduated in May 2026.',
    play: 'Two laps of campus by car, through every gate, past Usdan, Olin and Exley.',
    color: '#b5283a',
  },
];

/** The chapters you can play, in story order. */
export function playableChapters(list: Chapter[] = chapters): Chapter[] {
  return list.filter((c) => !c.draft).sort((a, b) => a.n - b.n);
}
