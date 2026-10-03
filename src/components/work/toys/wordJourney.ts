// Data and letter-alignment helpers for the Etymon toy (WordJourney.astro).
//
// Every journey below is copied verbatim from the Etymon repo (avan36/Etymology):
// forms, languages, years, meanings and stories come from data/words/seed.json
// (water, nice, salary, disaster) and data/words/germanic.json (window); language
// names from data/languages/core.json; stream colors from src/lib/streams.ts.
// Etymon's etymologies follow the OED, Etymonline and Wiktionary. Don't edit a
// stage here without checking it against the source.

export type Stage = { lang: string; form: string; year: number; meaning?: string };
export type Journey = { id: string; word: string; story: string; path: Stage[] };

/** Etymon's stream colors, keyed by the languages these journeys pass through. */
export const LANGS: Record<string, { name: string; color: string }> = {
  'ine-pro': { name: 'Proto-Indo-European', color: '#8b8172' },
  'gem-pro': { name: 'Proto-Germanic', color: '#e3a008' },
  ang: { name: 'Old English', color: '#e3a008' },
  enm: { name: 'Middle English', color: '#e3a008' },
  en: { name: 'English', color: '#6366f1' },
  non: { name: 'Old Norse', color: '#0ea5e9' },
  la: { name: 'Latin', color: '#e11d48' },
  fro: { name: 'Old French', color: '#9333ea' },
  xno: { name: 'Anglo-Norman', color: '#9333ea' },
  frm: { name: 'Middle French', color: '#9333ea' },
  grc: { name: 'Ancient Greek', color: '#2563eb' },
  it: { name: 'Italian', color: '#db2777' },
};

export const JOURNEYS: Journey[] = [
  {
    id: 'water',
    word: 'water',
    path: [
      { lang: 'ine-pro', form: '*wódr̥', year: -4000 },
      { lang: 'gem-pro', form: '*watōr', year: -500 },
      { lang: 'ang', form: 'wæter', year: 700 },
      { lang: 'enm', form: 'water', year: 1200 },
      { lang: 'en', form: 'water', year: 1500 },
    ],
    story:
      'One of the oldest words you use. Six thousand years ago on the steppe, *wódr̥ already meant water; its descendants include Russian vodka ("little water") and Greek hydor, which gave us hydrogen.',
  },
  {
    id: 'nice',
    word: 'nice',
    path: [
      { lang: 'la', form: 'nescius', meaning: 'ignorant, not knowing', year: -50 },
      { lang: 'fro', form: 'nice', meaning: 'silly, simple', year: 1100 },
      { lang: 'enm', form: 'nice', meaning: 'foolish', year: 1300 },
      { lang: 'en', form: 'nice', meaning: 'fussy, precise', year: 1550 },
      { lang: 'en', form: 'nice', meaning: 'pleasant', year: 1769 },
    ],
    story:
      'Few words have travelled further in meaning: from Latin "ignorant" to "foolish", "shy", "fussy", "precise" (a nice distinction) and finally, in the 1700s, "pleasant".',
  },
  {
    id: 'salary',
    word: 'salary',
    path: [
      { lang: 'ine-pro', form: '*seh₂l-', meaning: 'salt', year: -4000 },
      { lang: 'la', form: 'salārium', meaning: "a soldier's allowance (for salt?)", year: 50 },
      { lang: 'xno', form: 'salarie', year: 1250 },
      { lang: 'enm', form: 'salarie', year: 1300 },
      { lang: 'en', form: 'salary', year: 1500 },
    ],
    story:
      "Latin salārium was a payment to Roman soldiers, and it's built on sal, salt. The popular tale that soldiers were paid in salt is probably a myth — but the salt is really in the word.",
  },
  {
    id: 'disaster',
    word: 'disaster',
    path: [
      { lang: 'ine-pro', form: '*h₂stḗr', meaning: 'star', year: -4000 },
      { lang: 'grc', form: 'ἀστήρ (astēr)', meaning: 'star', year: -700 },
      { lang: 'it', form: 'disastro', meaning: 'ill-starred event', year: 1400 },
      { lang: 'frm', form: 'désastre', year: 1560 },
      { lang: 'en', form: 'disaster', year: 1590 },
    ],
    story:
      'Literally a "bad star". Renaissance Italians blamed calamities on unlucky planets — dis- (bad) + astro (star) — and English borrowed the astrology along with the word.',
  },
  {
    id: 'window',
    word: 'window',
    path: [
      { lang: 'non', form: 'vindauga', meaning: 'wind-eye', year: 900 },
      { lang: 'enm', form: 'windoge', year: 1225 },
      { lang: 'enm', form: 'windowe', year: 1300 },
      { lang: 'en', form: 'window', year: 1500 },
    ],
    story:
      "A 'wind-eye': Old Norse vindauga, from vindr (wind) + auga (eye), a hole in the roof that let smoke out and air in. It replaced the native ēagþyrel, 'eye-hole', and then saw off French fenestre, which hung on in English until the 1500s.",
  },
];

export const MAX_STAGES = Math.max(...JOURNEYS.map((j) => j.path.length));

const NON_LATIN = /[Ͱ-Ͽἀ-῿Ѐ-ӿ]/;

/** "ἀστήρ (astēr)" → draw "astēr" big and keep "ἀστήρ" as the native spelling (as Etymon does). */
export function displayForm(form: string): { text: string; native?: string } {
  const m = form.trim().match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m && m[1].trim() && NON_LATIN.test(m[1]) && !NON_LATIN.test(m[2])) return { text: m[2].trim(), native: m[1].trim() };
  return { text: form.trim() };
}

/** Etymon's year format: approximate before 1000, BCE for negatives. */
export function formatYear(y: number): string {
  const s = y < 0 ? `${Math.abs(y).toLocaleString('en-US')} BCE` : String(y);
  return y <= 1000 ? `c. ${s}` : s;
}

export function spokenYear(y: number): string {
  const s = y < 0 ? `${Math.abs(y).toLocaleString('en-US')} BCE` : String(y);
  return y <= 1000 ? `around ${s}` : `in ${s}`;
}

/** "5,500 years in 5 steps" */
export function spanLabel(j: Journey): string {
  const span = j.path[j.path.length - 1].year - j.path[0].year;
  const round = span >= 1000 ? 100 : 50;
  const years = (Math.round(span / round) * round).toLocaleString('en-US');
  return `${years} years in ${j.path.length} steps`;
}

/* ---------- letters ---------- */

type Segmenter = { segment(s: string): Iterable<{ segment: string }> };
const seg: Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => Segmenter }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** User-perceived characters, so r̥ and ḗ stay whole. */
export function graphemes(s: string): string[] {
  if (seg) return Array.from(seg.segment(s), (x) => x.segment);
  const out: string[] = [];
  for (const c of Array.from(s)) {
    if (/\p{M}/u.test(c) && out.length) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

const RING = '\u0325';

/**
 * Splits text so a letter with a combining ring below (the r̥ of *wódr̥) can be
 * drawn with a CSS ring: few fonts place U+0325 well, and the fallback drifts.
 */
export function ringParts(s: string): { t: string; ring: boolean }[] {
  const out: { t: string; ring: boolean }[] = [];
  for (const g of graphemes(s)) {
    const ring = g.includes(RING);
    const t = ring ? g.replace(RING, '') : g;
    const last = out[out.length - 1];
    if (!ring && last && !last.ring) last.t += t;
    else out.push({ t, ring });
  }
  return out;
}

export const hasRing = (ch: string) => ch.includes(RING);
export const stripRing = (ch: string) => ch.replace(RING, '');

/** The letter "underneath", so ō≈o and æ≈a stay put and just re-ink. */
function baseOf(ch: string): string {
  const c = ch.toLowerCase();
  const map: Record<string, string> = { æ: 'a', œ: 'o', þ: 't', ð: 't', ȝ: 'g', ƿ: 'w' };
  return map[c] ?? (c.normalize('NFD').replace(/\p{M}/gu, '') || c);
}

/**
 * Longest-common-subsequence alignment of two spellings. For each letter of
 * `next`, the index of the letter in `prev` it continues, or -1 if it is new.
 */
export function align(prev: string[], next: string[]): number[] {
  const a = prev.map(baseOf), b = next.map(baseOf);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Array<number>(m).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) out[j++] = i++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}
