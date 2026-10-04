import { describe, expect, it } from 'vitest';
import { countAt, countSteps, formatWords, jarCapacity, jarFill, parseSeen, plan, publishedShelf, sinceNote } from '../life';
import { journalWords, journalWordsUpdated, shelf } from '../../../data/life';

describe('word jar', () => {
  it('formats with grouping', () => {
    expect(formatWords(330000)).toBe('330,000');
    expect(formatWords(0)).toBe('0');
    expect(formatWords(-5)).toBe('0');
  });

  it('sizes the jar to the next 100k so it is never full', () => {
    expect(jarCapacity(330000)).toBe(400000);
    expect(jarCapacity(400000)).toBe(500000);
    expect(jarCapacity(0)).toBe(100000);
    expect(jarFill(330000)).toBeCloseTo(0.825);
    expect(jarFill(5, 0)).toBe(0);
  });

  it('parses only sane remembered values', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('')).toBeNull();
    expect(parseSeen('abc')).toBeNull();
    expect(parseSeen('-3')).toBeNull();
    expect(parseSeen('Infinity')).toBeNull();
    expect(parseSeen('329000')).toBe(329000);
  });

  it('counts up only from an older value', () => {
    expect(plan(null, 330000)).toEqual({ from: 330000, to: 330000, added: 0 });
    expect(plan(330000, 330000)).toEqual({ from: 330000, to: 330000, added: 0 });
    expect(plan(340000, 330000)).toEqual({ from: 330000, to: 330000, added: 0 });
    expect(plan(328800, 330000)).toEqual({ from: 328800, to: 330000, added: 1200 });
  });

  it('animates monotonically and lands exactly on the target', () => {
    const steps = countSteps(328800, 330000, 60);
    expect(steps).toHaveLength(60);
    expect(steps.at(-1)).toBe(330000);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    expect(countAt(0, 100, 0)).toBe(0);
    expect(countAt(0, 100, 2)).toBe(100);
    expect(countSteps(1, 2, 0)).toEqual([2]);
  });

  it('writes the since-last-visit note', () => {
    expect(sinceNote(0)).toBe('');
    expect(sinceNote(1)).toBe('+1 word since your last visit');
    expect(sinceNote(1200)).toBe('+1,200 words since your last visit');
  });

  it('ships a valid count', () => {
    expect(journalWords).toBeGreaterThan(0);
    expect(journalWordsUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shelf', () => {
  it('never publishes drafts', () => {
    const s = publishedShelf({
      watching: [{ title: 'A', kind: 'tv', draft: true }],
      takes: [{ title: 'B', kind: 'film', take: 'x' }, { title: 'C', kind: 'film', draft: true }],
    });
    expect(s.watching).toEqual([]);
    expect(s.takes.map((e) => e.title)).toEqual(['B']);
    expect(s.empty).toBe(false);
    expect(publishedShelf({ watching: [], takes: [{ title: 'D', kind: 'tv', draft: true }] }).empty).toBe(true);
  });

  it('keeps placeholders out of the real shelf', () => {
    const { watching, takes } = publishedShelf(shelf);
    for (const e of [...watching, ...takes]) {
      expect(`${e.title} ${e.take ?? ''}`).not.toMatch(/placeholder/i);
    }
  });
});
