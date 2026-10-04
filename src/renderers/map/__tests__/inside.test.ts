import { describe, expect, it } from 'vitest';
import { fitFrame, openRect } from '../inside';

describe('fitFrame', () => {
  it('finds the biggest whole scale that fits, and centres it on whole pixels', () => {
    const f = fitFrame(120, 130, { x: 12, y: 132, w: 928, h: 748 });
    expect(f.scale).toBe(5);
    expect(Number.isInteger(f.x) && Number.isInteger(f.y)).toBe(true);
    expect(f.x).toBeGreaterThanOrEqual(12);
    expect(f.x + 120 * f.scale).toBeLessThanOrEqual(12 + 928);
    expect(f.y).toBeGreaterThanOrEqual(132);
    expect(f.y + 130 * f.scale).toBeLessThanOrEqual(132 + 748);
  });

  it('is held back by whichever side runs out first', () => {
    expect(fitFrame(100, 100, { x: 0, y: 0, w: 1000, h: 250 }).scale).toBe(2);
    expect(fitFrame(100, 100, { x: 0, y: 0, w: 250, h: 1000 }).scale).toBe(2);
  });

  it('never goes below a scale of 1', () => expect(fitFrame(120, 130, { x: 0, y: 0, w: 50, h: 50 }).scale).toBe(1));
});

describe('openRect', () => {
  const from = { x: 30, y: 60, w: 46, h: 70 };
  const to = { x: 0, y: 0, w: 120, h: 130 };

  it('goes from one rect to the other', () => {
    expect(openRect(0, from, to)).toEqual(from);
    expect(openRect(1, from, to)).toEqual(to);
    expect(openRect(-0.5, from, to)).toEqual(from);
    expect(openRect(3, from, to)).toEqual(to);
  });

  it('stays on whole pixels and only ever grows', () => {
    let last = openRect(0, from, to);
    for (let k = 0.05; k <= 1; k += 0.05) {
      const r = openRect(k, from, to);
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
      expect(r.x).toBeLessThanOrEqual(last.x);
      expect(r.y).toBeLessThanOrEqual(last.y);
      expect(r.x + r.w).toBeGreaterThanOrEqual(last.x + last.w);
      expect(r.y + r.h).toBeGreaterThanOrEqual(last.y + last.h);
      last = r;
    }
  });
});
