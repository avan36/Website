// Pure game logic for Etymology Race (EtymologyRace.astro): building a round,
// picking fair wrong answers, timing and scoring. No DOM here; see the tests in
// __tests__/etymologyRace.test.ts.

import { shuffle, type Rng } from './rng';
import type { RaceWord } from './etymologyRaceData';

export type QuestionKind = 'origin' | 'ancestor';

export type Question = {
  kind: QuestionKind;
  word: RaceWord;
  /** Button labels, already shuffled. */
  options: string[];
  /** Small caption under each option (the language of an ancestor form). */
  hints?: string[];
  /** Index into `options` of the right answer. */
  answer: number;
};

export const ROUND_LENGTH = 10;
export const CHOICES = 4;
/** Seconds on the clock for each kind of question. */
export const TIME_LIMIT: Record<QuestionKind, number> = { origin: 15, ancestor: 20 };
/** Every Nth question asks for the oldest ancestor instead of the source language. */
export const ANCESTOR_EVERY = 3;

/** Languages a player could reasonably mix up: one wrong answer comes from here. */
const FAMILIES: string[][] = [
  ['Old English', 'Old Norse', 'Dutch', 'German', 'Yiddish'],
  ['French', 'Latin', 'Italian', 'Spanish', 'Portuguese', 'Greek'],
  ['Hindi', 'Sanskrit', 'Tamil', 'Malay', 'Japanese'],
  ['Scottish Gaelic', 'Irish', 'Welsh'],
  ['Hawaiian', 'Tahitian'],
];

const NON_LATIN = /[^\u0000-ɏ̀-ͯḀ-ỿ -⁯₀-₟]/;

/**
 * How to show a form: "κόσμος (kosmos)" → big "kosmos", small "κόσμος".
 * Forms already in the Latin alphabet are left alone.
 */
export function readableForm(form: string): { text: string; native?: string } {
  const m = form.trim().match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m && m[1].trim() && NON_LATIN.test(m[1]) && !NON_LATIN.test(m[2])) return { text: m[2].trim(), native: m[1].trim() };
  return { text: form.trim() };
}

const bare = (s: string) => s.toLowerCase().replace(/[*\-.\s]/g, '').normalize('NFD').replace(/\p{M}/gu, '');

/** The oldest stage of a word's journey. */
export const oldest = (w: RaceWord) => w.path[0];

/** An ancestor question only makes sense when the oldest form isn't just the word itself. */
export function hasAncestorQuestion(w: RaceWord): boolean {
  return w.path.length >= 2 && bare(readableForm(oldest(w).form).text) !== bare(w.word);
}

/** Every answer label in the data, in first-seen order. */
export function originLabels(words: readonly RaceWord[]): string[] {
  return [...new Set(words.map((w) => w.origin))];
}

/** Three (or `count`) wrong source languages: one near miss from the same family when there is one. */
export function originDistractors(correct: string, labels: readonly string[], rng: Rng, count = CHOICES - 1): string[] {
  const others = labels.filter((l) => l !== correct);
  const family = FAMILIES.find((f) => f.includes(correct)) ?? [];
  const near = shuffle(others.filter((l) => family.includes(l)), rng).slice(0, 1);
  const rest = shuffle(others.filter((l) => !near.includes(l)), rng);
  return [...near, ...rest].slice(0, count);
}

/** Wrong ancestors: oldest forms of other words, preferring ones from the same language (no free hints). */
export function ancestorDistractors(word: RaceWord, words: readonly RaceWord[], rng: Rng, count = CHOICES - 1): RaceWord[] {
  const mine = bare(readableForm(oldest(word).form).text);
  const seen = new Set([mine]);
  const pool = words.filter((w) => w !== word && hasAncestorQuestion(w));
  const same = shuffle(pool.filter((w) => oldest(w).lang === oldest(word).lang), rng);
  const other = shuffle(pool.filter((w) => oldest(w).lang !== oldest(word).lang), rng);
  const out: RaceWord[] = [];
  for (const w of [...same, ...other]) {
    const key = bare(readableForm(oldest(w).form).text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length === count) break;
  }
  return out;
}

export function makeQuestion(kind: QuestionKind, word: RaceWord, words: readonly RaceWord[], rng: Rng, langName: (code: string) => string = (c) => c): Question {
  if (kind === 'ancestor') {
    const picks = shuffle([word, ...ancestorDistractors(word, words, rng)], rng);
    return {
      kind,
      word,
      options: picks.map((w) => readableForm(oldest(w).form).text),
      hints: picks.map((w) => langName(oldest(w).lang)),
      answer: picks.indexOf(word),
    };
  }
  const options = shuffle([word.origin, ...originDistractors(word.origin, originLabels(words), rng)], rng);
  return { kind, word, options, answer: options.indexOf(word.origin) };
}

/** Ten questions from distinct words; every third one asks for the oldest ancestor when the word has one. */
export function buildRound(words: readonly RaceWord[], rng: Rng, length = ROUND_LENGTH, langName?: (code: string) => string): Question[] {
  const pool = shuffle(words, rng);
  const n = Math.min(length, words.length);
  const out: Question[] = [];
  for (let i = 0; i < n; i++) {
    const wantsAncestor = (i + 1) % ANCESTOR_EVERY === 0;
    const k = wantsAncestor ? Math.max(0, pool.findIndex(hasAncestorQuestion)) : 0;
    const [w] = pool.splice(k, 1);
    out.push(makeQuestion(wantsAncestor && hasAncestorQuestion(w) ? 'ancestor' : 'origin', w, words, rng, langName));
  }
  return out;
}

/** Streak multiplier: +25% per answer already in a row, capped at ×2. */
export const multiplier = (streak: number) => 1 + 0.25 * Math.min(Math.max(streak, 0), 4);

/**
 * Points for one answer: 100 for being right, up to 100 more for speed
 * (none when the clock is off), times the streak multiplier.
 */
export function pointsFor(correct: boolean, secondsLeft: number | null, limit: number, streak: number): number {
  if (!correct) return 0;
  const speed = secondsLeft == null || limit <= 0 ? 0 : Math.round((100 * Math.min(Math.max(secondsLeft, 0), limit)) / limit);
  return Math.round((100 + speed) * multiplier(streak));
}

export type RaceState = { index: number; score: number; streak: number; bestStreak: number; correct: number };

export const startState = (): RaceState => ({ index: 0, score: 0, streak: 0, bestStreak: 0, correct: 0 });

/** Apply an answer (`choice` null = the clock ran out). Returns the next state and what this answer was worth. */
export function answer(state: RaceState, q: Question, choice: number | null, secondsLeft: number | null): { state: RaceState; right: boolean; points: number } {
  const right = choice === q.answer;
  const points = pointsFor(right, secondsLeft, TIME_LIMIT[q.kind], state.streak);
  const streak = right ? state.streak + 1 : 0;
  return {
    right,
    points,
    state: {
      index: state.index + 1,
      score: state.score + points,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      correct: state.correct + (right ? 1 : 0),
    },
  };
}

/** A title for the end screen. */
export function rank(correct: number, total: number): string {
  const r = total ? correct / total : 0;
  if (r === 1) return 'Walking dictionary';
  if (r >= 0.8) return 'Word historian';
  if (r >= 0.6) return 'Keen etymologist';
  if (r >= 0.4) return 'Curious reader';
  return 'Fresh apprentice';
}

/** "c. 4,000 BCE" / "c. 700" / "1590", as Etymon writes years. */
export function formatYear(y: number): string {
  const s = y < 0 ? `${Math.abs(y).toLocaleString('en-US')} BCE` : String(y);
  return y <= 1000 ? `c. ${s}` : s;
}
