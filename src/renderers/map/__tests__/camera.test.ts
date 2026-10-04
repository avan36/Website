import { describe, expect, it } from 'vitest';
import { BOX_SIDE } from '../../room';
import { between, clampAxis, damp, ease, frameOn, pickScale, roomArea, type View } from '../camera';

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

describe('ease', () => {
  it('starts and ends where it should, and only goes forward', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    for (let k = 0; k < 1; k += 0.05) expect(ease(k + 0.05)).toBeGreaterThanOrEqual(ease(k));
  });
});

describe('roomArea', () => {
  it('keeps a wide screen clear of the HUD and the box docked to the right', () => {
    const a = roomArea(1440, 900, 1);
    expect(a.y).toBeGreaterThanOrEqual(120);
    expect(a.x + a.w).toBeLessThanOrEqual(1440 - BOX_SIDE);
    expect(a.y + a.h).toBeLessThan(900);
  });

  it('keeps a phone clear of the sheet along the bottom', () => {
    const a = roomArea(390, 844, 1);
    expect(a.y + a.h).toBeLessThanOrEqual(844 * 0.54);
    expect(a.w).toBeGreaterThan(350);
  });

  it('is in device pixels', () => {
    const one = roomArea(390, 844, 1);
    const three = roomArea(390, 844, 3);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(three[k]).toBeCloseTo(one[k] * 3);
  });
});

describe('frameOn', () => {
  it('puts the middle of the rect in the middle of the area', () => {
    const area = { x: 0, y: 132, w: 950, h: 748 };
    const r = { x: 400, y: 250, w: 120, h: 130 };
    const v = frameOn(r, area, 5);
    expect(v.z).toBe(5);
    // Where the rect's middle lands on screen, in device pixels.
    expect((r.x + r.w / 2 - v.l) * v.z).toBeCloseTo(area.x + area.w / 2);
    expect((r.y + r.h / 2 - v.t) * v.z).toBeCloseTo(area.y + area.h / 2);
  });
});

describe('between', () => {
  const a: View = { z: 3, l: 100, t: 50 };
  const b: View = { z: 6, l: 300, t: 200 };
  const ax = 360;
  const ay = 330;
  const onScreen = (v: View) => ({ x: (ax - v.l) * v.z, y: (ay - v.t) * v.z });

  it('starts at one view and ends at the other', () => {
    expect(between(a, b, ax, ay, 0)).toEqual(a);
    expect(between(a, b, ax, ay, 1)).toEqual(b);
  });

  it('zooms by the same factor each step', () => {
    expect(between(a, b, ax, ay, 0.5).z).toBeCloseTo(Math.sqrt(3 * 6));
    expect(between(a, b, ax, ay, 0.25).z / a.z).toBeCloseTo(between(a, b, ax, ay, 0.5).z / between(a, b, ax, ay, 0.25).z);
  });

  it('slides the anchor straight across the screen', () => {
    const p0 = onScreen(a);
    const p1 = onScreen(b);
    for (const e of [0.2, 0.5, 0.9]) {
      const p = onScreen(between(a, b, ax, ay, e));
      expect(p.x).toBeCloseTo(p0.x + (p1.x - p0.x) * e);
      expect(p.y).toBeCloseTo(p0.y + (p1.y - p0.y) * e);
    }
  });
});
