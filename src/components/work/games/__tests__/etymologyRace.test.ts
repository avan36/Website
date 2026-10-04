import { describe, expect, it } from 'vitest';
import { makeRng, shuffle } from '../rng';
import { RACE_LANGS, RACE_WORDS } from '../etymologyRaceData';
import {
  ANCESTOR_EVERY,
  CHOICES,
  ROUND_LENGTH,
  TIME_LIMIT,
  answer,
  ancestorDistractors,
  buildRound,
  hasAncestorQuestion,
  makeQuestion,
  multiplier,
  originDistractors,
  originLabels,
  pointsFor,
  rank,
  readableForm,
  startState,
} from '../etymologyRace';

const byWord = (w: string) => RACE_WORDS.find((x) => x.word === w)!;

describe('data', () => {
  it('has a curated 40–80 words, each with a journey and a story', () => {
    expect(RACE_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(RACE_WORDS.length).toBeLessThanOrEqual(80);
    for (const w of RACE_WORDS) {
      expect(w.path.length).toBeGreaterThan(0);
      expect(w.story.length).toBeGreaterThan(20);
      for (const s of w.path) expect(RACE_LANGS[s.lang], `${w.word}: ${s.lang}`).toBeTruthy();
    }
  });
  it('has no duplicate words', () => {
    expect(new Set(RACE_WORDS.map((w) => w.word)).size).toBe(RACE_WORDS.length);
  });
  it('offers enough languages for four choices', () => {
    expect(originLabels(RACE_WORDS).length).toBeGreaterThanOrEqual(CHOICES);
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation for a seed and leaves the input alone', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(xs, makeRng(7));
    expect(a).toEqual(shuffle(xs, makeRng(7)));
    expect([...a].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('readableForm', () => {
  it('draws non-Latin scripts by their transliteration', () => {
    expect(readableForm('κόσμος (kosmos)')).toEqual({ text: 'kosmos', native: 'κόσμος' });
    expect(readableForm('津波 (tsunami)')).toEqual({ text: 'tsunami', native: '津波' });
  });
  it('leaves Latin-script forms (and language notes in brackets) alone', () => {
    expect(readableForm('*wódr̥')).toEqual({ text: '*wódr̥' });
    expect(readableForm('gangurru (Guugu Yimidhirr)')).toEqual({ text: 'gangurru (Guugu Yimidhirr)' });
  });
});

describe('questions', () => {
  it('skips ancestor questions when the oldest form is just the word', () => {
    expect(hasAncestorQuestion(byWord('water'))).toBe(true);
    expect(hasAncestorQuestion(byWord('quiz'))).toBe(false);
    expect(hasAncestorQuestion(byWord('kindergarten'))).toBe(false);
  });

  it('origin distractors are distinct, wrong, and include a near miss', () => {
    const labels = originLabels(RACE_WORDS);
    for (let seed = 0; seed < 50; seed++) {
      const d = originDistractors('Old Norse', labels, makeRng(seed));
      expect(d).toHaveLength(CHOICES - 1);
      expect(new Set(d).size).toBe(d.length);
      expect(d).not.toContain('Old Norse');
      expect(d.some((l) => ['Old English', 'Dutch', 'German', 'Yiddish'].includes(l))).toBe(true);
    }
  });

  it('ancestor distractors never repeat the right form', () => {
    const w = byWord('water');
    for (let seed = 0; seed < 30; seed++) {
      const d = ancestorDistractors(w, RACE_WORDS, makeRng(seed));
      expect(d).toHaveLength(CHOICES - 1);
      expect(d).not.toContain(w);
      const forms = [w, ...d].map((x) => readableForm(x.path[0].form).text);
      expect(new Set(forms).size).toBe(forms.length);
    }
  });

  it('marks the right option', () => {
    const rng = makeRng(3);
    const q = makeQuestion('origin', byWord('sky'), RACE_WORDS, rng);
    expect(q.options[q.answer]).toBe('Old Norse');
    const a = makeQuestion('ancestor', byWord('water'), RACE_WORDS, rng, (c) => RACE_LANGS[c]);
    expect(a.options[a.answer]).toBe('*wódr̥');
    expect(a.hints?.[a.answer]).toBe('Proto-Indo-European');
  });

  it('builds a round of distinct words with an ancestor question every third slot', () => {
    for (let seed = 0; seed < 25; seed++) {
      const round = buildRound(RACE_WORDS, makeRng(seed));
      expect(round).toHaveLength(ROUND_LENGTH);
      expect(new Set(round.map((q) => q.word.word)).size).toBe(ROUND_LENGTH);
      round.forEach((q, i) => {
        expect(q.options).toHaveLength(CHOICES);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.kind).toBe((i + 1) % ANCESTOR_EVERY === 0 ? 'ancestor' : 'origin');
      });
    }
  });
});

describe('scoring', () => {
  it('rewards speed and streaks, and nothing for a miss', () => {
    expect(pointsFor(false, 10, 15, 3)).toBe(0);
    expect(pointsFor(true, 0, 15, 0)).toBe(100);
    expect(pointsFor(true, 15, 15, 0)).toBe(200);
    expect(pointsFor(true, null, 15, 0)).toBe(100);
    expect(pointsFor(true, 15, 15, 2)).toBe(300);
    expect(multiplier(10)).toBe(2);
  });

  it('tracks score, streak and best streak', () => {
    const q = makeQuestion('origin', byWord('sky'), RACE_WORDS, makeRng(1));
    let s = startState();
    s = answer(s, q, q.answer, TIME_LIMIT.origin).state;
    s = answer(s, q, q.answer, 0).state;
    expect(s).toMatchObject({ index: 2, streak: 2, bestStreak: 2, correct: 2, score: 200 + 125 });
    const miss = answer(s, q, null, 5);
    expect(miss.right).toBe(false);
    expect(miss.points).toBe(0);
    expect(miss.state).toMatchObject({ streak: 0, bestStreak: 2, correct: 2, index: 3 });
  });

  it('gives a title', () => {
    expect(rank(10, 10)).toBe('Walking dictionary');
    expect(rank(0, 10)).toBe('Fresh apprentice');
  });
});
