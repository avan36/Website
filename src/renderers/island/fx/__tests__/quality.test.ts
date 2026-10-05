import { describe, expect, it } from 'vitest';
import { FrameWatch, pickQuality, stepDown } from '../quality';

const base = { search: '', mobile: false, reducedMotion: false };

describe('pickQuality', () => {
  it('gives desktops everything at high, phones lite, and reduced motion none', () => {
    expect(pickQuality(base)).toEqual({ level: 'high', effects: ['bloom', 'tilt', 'grade'], forced: false });
    expect(pickQuality({ ...base, mobile: true }).level).toBe('lite');
    expect(pickQuality({ ...base, reducedMotion: true })).toEqual({ level: 'off', effects: [], forced: false });
  });

  it('lets the address pick a level', () => {
    expect(pickQuality({ ...base, search: '?fx=off' })).toEqual({ level: 'off', effects: [], forced: true });
    expect(pickQuality({ ...base, mobile: true, search: '?fx=HIGH' }).level).toBe('high');
    expect(pickQuality({ ...base, reducedMotion: true, search: '?fx=lite' }).level).toBe('lite');
  });

  it('lets the address pick single effects, ignoring ones it does not know', () => {
    expect(pickQuality({ ...base, search: '?fx=bloom,grade,sparkles' })).toEqual({ level: 'high', effects: ['bloom', 'grade'], forced: true });
    expect(pickQuality({ ...base, search: '?fx=tilt,tilt' }).effects).toEqual(['tilt']);
    expect(pickQuality({ ...base, search: '?fx=none' })).toEqual({ level: 'off', effects: [], forced: true });
  });

  it('falls back to the device when the address makes no sense', () => {
    expect(pickQuality({ ...base, search: '?fx=sparkles' })).toEqual(pickQuality(base));
  });
});

describe('stepDown', () => {
  it('goes high, lite, off, and stays off', () => {
    const q = pickQuality(base);
    const lite = stepDown(q);
    expect(lite.level).toBe('lite');
    expect(lite.effects).toEqual(q.effects);
    const off = stepDown(lite);
    expect(off).toEqual({ level: 'off', effects: [], forced: false });
    expect(stepDown(off)).toEqual(off);
  });
});

describe('FrameWatch', () => {
  const run = (w: FrameWatch, fps: number, seconds: number) => {
    let said = false;
    for (let t = 0; t < seconds; t += 1 / fps) said = w.add(1 / fps) || said;
    return said;
  };

  it('says nothing while frames keep up', () => {
    expect(run(new FrameWatch(40, 3, 3), 60, 20)).toBe(false);
    expect(run(new FrameWatch(40, 3, 3), 45, 20)).toBe(false);
  });

  it('says so once a full window runs slow', () => {
    const w = new FrameWatch(40, 3, 3);
    expect(run(w, 25, 5)).toBe(false); // still settling, then part of a window
    expect(run(w, 25, 2)).toBe(true);
  });

  it('ignores slow frames while settling, and settles again after a reset or a step', () => {
    const w = new FrameWatch(40, 3, 3);
    expect(run(w, 10, 2.9)).toBe(false);
    w.reset();
    expect(run(w, 60, 2.9)).toBe(false);
    expect(run(w, 25, 3.2)).toBe(true);
    // Just stepped down: the next three seconds don't count.
    expect(run(w, 25, 2.9)).toBe(false);
  });

  it('ignores nonsense frame times', () => {
    const w = new FrameWatch(40, 3, 0);
    expect(w.add(0)).toBe(false);
    expect(w.add(Number.NaN)).toBe(false);
    expect(w.add(-1)).toBe(false);
  });
});
