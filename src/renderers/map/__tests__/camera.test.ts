import { describe, expect, it } from 'vitest';
import { clampAxis, damp, pickScale } from '../camera';

describe('pickScale', () => {
  it('uses whole device pixels', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) expect(Number.isInteger(pickScale(1280, 800, dpr))).toBe(true);
  });

  it('gives a phone big pixels: about 130 across the short side', () => {
    const s = pickScale(390, 844, 3);
    const across = (390 * 3) / s;
    expect(across).toBeGreaterThan(110);
    expect(across).toBeLessThan(150);
  });

  it('lets a desktop see most of the island: all of its width, most of its height', () => {
    const s = pickScale(1440, 900, 1);
    expect(1440 / s / 8).toBeGreaterThan(55); // world units across, at 8 map pixels each
    expect(900 / s / 8).toBeGreaterThan(35);
    expect(s).toBeGreaterThanOrEqual(2); // but never pixels so small they stop reading as pixel art
  });

  it('never goes below one device pixel', () => expect(pickScale(10, 10, 1)).toBe(1));
});

describe('clampAxis', () => {
  it('keeps the view inside the bounds', () => {
    expect(clampAxis(-100, 10, -30, 30)).toBe(-20);
    expect(clampAxis(100, 10, -30, 30)).toBe(20);
    expect(clampAxis(5, 10, -30, 30)).toBe(5);
  });
  it('centres a view wider than the bounds', () => expect(clampAxis(12, 50, -30, 40)).toBe(5));
});

describe('damp', () => {
  it('moves toward the target and never overshoots', () => {
    const v = damp(0, 10, 4, 1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
    expect(damp(0, 10, 4, 100)).toBeCloseTo(10);
  });
});
