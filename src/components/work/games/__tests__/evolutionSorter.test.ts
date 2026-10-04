import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { BRANCHES, SPECIES, TREE } from '../evolutionSorterData';
import { ROUND_SIZE, TRAY_SIZE, cladogram, dealRound, feedback, isCorrect, isDone, place, startSort, tally, verdict } from '../evolutionSorter';

describe('data', () => {
  it('every species sits on a real branch, with a fact', () => {
    const ids = new Set(BRANCHES.map((b) => b.id));
    for (const s of SPECIES) {
      expect(ids.has(s.branch), s.id).toBe(true);
      expect(s.fact.length).toBeGreaterThan(10);
    }
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });
  it('every branch has at least two species, and the tree uses every branch once', () => {
    for (const b of BRANCHES) expect(SPECIES.filter((s) => s.branch === b.id).length).toBeGreaterThanOrEqual(2);
    expect(cladogram(TREE, 900, 100).leaves).toEqual(BRANCHES.map((b) => b.id));
  });
});

describe('dealRound', () => {
  it('deals distinct species with at most two per branch', () => {
    for (let seed = 0; seed < 30; seed++) {
      const deck = dealRound(SPECIES, makeRng(seed));
      expect(deck).toHaveLength(ROUND_SIZE);
      expect(new Set(deck.map((s) => s.id)).size).toBe(ROUND_SIZE);
      const counts: Record<string, number> = {};
      for (const s of deck) counts[s.branch] = (counts[s.branch] ?? 0) + 1;
      expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    }
  });
  it('is repeatable for a seed', () => {
    expect(dealRound(SPECIES, makeRng(9)).map((s) => s.id)).toEqual(dealRound(SPECIES, makeRng(9)).map((s) => s.id));
  });
});

describe('placing', () => {
  const deck = dealRound(SPECIES, makeRng(4));

  it('checks the branch', () => {
    const whale = SPECIES.find((s) => s.id === 'blue-whale')!;
    expect(isCorrect(whale, 'mammals')).toBe(true);
    expect(isCorrect(whale, 'fish')).toBe(false);
  });

  it('refills the tray in place and finishes when everything is placed', () => {
    let state = startSort(deck);
    expect(state.tray).toHaveLength(TRAY_SIZE);
    const second = state.tray[1];
    const r = place(state, state.tray[0].id, 'fish')!;
    expect(r.state.tray[0].id).toBe(deck[TRAY_SIZE].id);
    expect(r.state.tray[1]).toBe(second);
    expect(place(state, 'not-a-species', 'fish')).toBeNull();
    state = r.state;
    while (!isDone(state)) state = place(state, state.tray[0].id, state.tray[0].branch)!.state;
    expect(state.placed).toHaveLength(ROUND_SIZE);
    const t = tally(state.placed);
    expect(t.total).toBe(ROUND_SIZE);
    expect(t.correct).toBe(ROUND_SIZE - (deck[0].branch === 'fish' ? 0 : 1));
  });

  it('explains a miss', () => {
    const bats = SPECIES.find((s) => s.id === 'bats')!;
    expect(feedback({ species: bats, chosen: 'birds', correct: false }, BRANCHES)).toBe('Not quite: Bats goes with Mammals, not Birds.');
    expect(feedback({ species: bats, chosen: 'mammals', correct: true }, BRANCHES)).toBe('Yes! Bats goes with Mammals.');
    expect(verdict(12, 12)).toMatch(/perfect/i);
  });
});

describe('cladogram', () => {
  it('lines leaves up with equal columns and stays inside the box', () => {
    const { segments } = cladogram(TREE, 900, 120);
    const bottoms = segments.filter((s) => s.y2 === 120).map((s) => s.x1).sort((a, b) => a - b);
    expect(bottoms).toEqual(BRANCHES.map((_, i) => (i + 0.5) * 100));
    for (const s of segments) {
      for (const v of [s.x1, s.x2]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(900);
      for (const v of [s.y1, s.y2]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(120);
    }
  });
});
