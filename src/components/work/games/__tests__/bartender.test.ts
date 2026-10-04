import { describe, expect, it } from 'vitest';
import { AXES, MAX_VIBES, MENU, VIBES, explain, listJoin, preference, rank, reasonText, score, signed, toggleVibe } from '../bartender';

describe('bartender vibes', () => {
  it('uses the busy beer axes and keeps weights in range', () => {
    expect(AXES).toEqual(['Hoppy', 'Malty', 'Sweet', 'Sour', 'Roasty']);
    for (const v of VIBES) {
      expect(v.weights).toHaveLength(5);
      for (const w of v.weights) expect(Math.abs(w)).toBeLessThanOrEqual(3);
    }
    for (const d of MENU) for (const t of d.taste) expect(t).toBeGreaterThanOrEqual(0);
    expect(new Set(VIBES.map((v) => v.id)).size).toBe(VIBES.length);
  });

  it('toggles vibes and caps the pick at three', () => {
    let p: string[] = [];
    for (const id of ['cozy', 'crisp', 'patio', 'fruity']) p = toggleVibe(p, id);
    expect(p).toEqual(['cozy', 'crisp', 'patio']);
    expect(p.length).toBe(MAX_VIBES);
    p = toggleVibe(p, 'crisp');
    expect(p).toEqual(['cozy', 'patio']);
    expect(toggleVibe(p, 'nope')).toEqual(['cozy', 'patio']);
  });

  it('sums weights into a preference', () => {
    expect(preference([])).toEqual([0, 0, 0, 0, 0]);
    expect(preference(['cozy', 'rainy'])).toEqual([-2, 4, 2, -2, 5]);
  });
});

describe('scoring', () => {
  it('is neutral with no vibes and bounded 0..100', () => {
    expect(score([0, 0, 0, 0, 0], [9, 9, 9, 9, 9])).toBe(50);
    expect(score([3, 0, 0, 0, 0], [10, 0, 0, 0, 0])).toBe(100);
    expect(score([3, 0, 0, 0, 0], [0, 0, 0, 0, 0])).toBe(0);
  });

  it('pours sensible winners', () => {
    expect(rank(['cozy', 'rainy', 'nightcap'])[0].id).toBe('stout');
    expect(rank(['adventurous', 'fruity', 'patio'])[0].id).toBe('gose');
    expect(rank(['bitter', 'crisp', 'patio'])[0].id).toBe('wcipa');
  });

  it('ranks best first', () => {
    const r = rank(['fruity', 'sweet', 'patio']);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
  });
});

describe('explanations', () => {
  it('names the axis and the vibes that asked for it', () => {
    const picked = ['cozy', 'rainy', 'bitter'];
    const top = rank(picked)[0];
    const reasons = explain(picked, top);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0].because.length).toBeGreaterThan(0);
    const roasty = explain(picked, MENU.find((d) => d.id === 'stout')!).find((r) => r.axis === 'Roasty')!;
    expect(roasty.direction).toBe('high');
    expect(roasty.because).toEqual(['rainy day', 'cozy', 'bitter is fine']);
    expect(reasonText(roasty)).toBe('High on roasty (9/10) because you chose “rainy day”, “cozy” and “bitter is fine”.');
  });

  it('explains low axes too', () => {
    const r = explain(['crisp'], MENU.find((d) => d.id === 'cider')!);
    expect(r.some((x) => x.direction === 'low' && x.axis === 'Roasty')).toBe(true);
  });

  it('formats helpers', () => {
    expect(listJoin(['a'])).toBe('a');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b and c');
    expect(signed(2)).toBe('+2');
    expect(signed(-1)).toBe('−1');
    expect(signed(0)).toBe('0');
  });
});
