import { describe, expect, it } from 'vitest';
import { GAME_IDS, GAME_INFO, gameSpots, nudge, scoreText } from '../catalog';
import { boopPoints, CrabField, HOLE_KEYS, pace, ROUND } from '../crabs';
import { drop, PERFECT, REGROW, speedFor, startCrates, swingAt, SWING } from '../crates';
import { seeded, type GameEnv } from '../round';
import { hops, MAX_STREAK_BONUS, meterAt, periodFor, startStones, STONES, throwStone, zoneFor } from '../stones';
import { world } from '../../../world/__tests__/fixtures';

const env = (sounds: string[] = []): GameEnv => ({
  reducedMotion: true,
  touch: false,
  sound: (n) => void sounds.push(n),
  announce: () => {},
  random: seeded(7),
  font: 'sans-serif',
});

describe('the catalog', () => {
  it('knows every game the world puts on the island', () => {
    const spots = gameSpots(world());
    expect(spots.map((s) => s.id).sort()).toEqual([...GAME_IDS].sort());
    for (const s of spots) expect(s.place, s.id).not.toBeNull();
  });

  it('counts in words that agree with the number', () => {
    expect(scoreText('stones', 1)).toBe('1 skip');
    expect(scoreText('crabs', 0)).toBe('0 boops');
    expect(scoreText('crates', 12)).toBe('12 crates');
  });

  it('always has something to say to bring you back', () => {
    expect(nudge('stones', 30, 30, true, 22)).toMatch(/8 skips better/);
    expect(nudge('stones', 12, 12, true, 0)).toMatch(/first best/);
    expect(nudge('crabs', 19, 20, false, 20)).toMatch(/So close: 1 boop short/);
    expect(nudge('crates', 3, 40, false, 40)).toMatch(/Your best is 40 crates/);
    expect(nudge('crates', 9, 9, false, 9)).toMatch(/Level with your best/);
  });

  it('writes its copy without em dashes', () => {
    for (const g of Object.values(GAME_INFO)) for (const s of [g.name, g.tagline, g.pitch, g.keys, g.touch]) expect(s).not.toMatch(/—/);
  });
});

describe('skipping stones', () => {
  const zone = { lo: 0.7, hi: 0.8 };

  it('swings the meter up and back down', () => {
    expect(meterAt(0, 1)).toBe(0);
    expect(meterAt(0.25, 1)).toBeCloseTo(0.5);
    expect(meterAt(0.5, 1)).toBeCloseTo(1);
    expect(meterAt(0.75, 1)).toBeCloseTo(0.5);
    expect(meterAt(1.1, 1)).toBeCloseTo(0.2);
  });

  it('skips furthest from dead centre of the band, and further on a streak', () => {
    expect(throwStone(0.75, zone, 0)).toEqual({ skips: 10, perfect: true, quality: 'perfect' });
    expect(throwStone(0.8, zone, 0)).toMatchObject({ skips: 7, perfect: true });
    expect(throwStone(0.75, zone, 3).skips).toBe(13);
    expect(throwStone(0.75, zone, 99).skips).toBe(10 + MAX_STREAK_BONUS);
  });

  it('falls away fast outside the band, down to a plonk', () => {
    const near = throwStone(0.83, zone, 4);
    expect(near.perfect).toBe(false);
    expect(near.skips).toBeLessThan(7);
    expect(throwStone(0.66, zone, 0).quality).toBe('good');
    expect(throwStone(0.1, zone, 0)).toEqual({ skips: 0, perfect: false, quality: 'plonk' });
    // Never better outside than in.
    for (let p = 0; p <= 1; p += 0.01) if (p < zone.lo || p > zone.hi) expect(throwStone(p, zone, 0).skips).toBeLessThan(7);
  });

  it('gets harder: a quicker meter and a narrower band as the round goes on', () => {
    expect(periodFor(4, 0)).toBeLessThan(periodFor(0, 0));
    expect(periodFor(4, 4)).toBeGreaterThanOrEqual(0.7);
    const r = seeded(1);
    const first = zoneFor(0, 0, r);
    const last = zoneFor(4, 3, r);
    expect(last.hi - last.lo).toBeLessThan(first.hi - first.lo);
    for (let i = 0; i < 50; i++) {
      const z = zoneFor(i % 5, i % 4, r);
      expect(z.lo).toBeGreaterThan(0.5);
      expect(z.hi).toBeLessThan(0.96);
    }
  });

  it('spaces the skips out, shorter each time', () => {
    const h = hops(4);
    expect(h).toHaveLength(5);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeLessThan(h[i - 1]);
  });

  it('plays a whole round of five stones, adding up the skips', () => {
    const sounds: string[] = [];
    const round = startStones(env(sounds));
    let thrown = 0;
    for (let guard = 0; guard < 5000 && !round.over; guard++) {
      if (round.hud().info === `Stone ${thrown + 1} of ${STONES}`) {
        round.press(null, 'Space');
        for (let i = 0; i < 30; i++) round.update(1 / 60);
        round.release(null, 'Space');
        thrown++;
      }
      round.update(1 / 60);
    }
    expect(round.over).toBe(true);
    expect(thrown).toBe(STONES);
    expect(round.score).toBe(sounds.filter((s) => s === 'skip').length);
    expect(sounds.filter((s) => s === 'plonk')).toHaveLength(STONES);
  });
});

describe('crab boop', () => {
  it('speeds up over the round', () => {
    expect(pace(ROUND).every).toBeLessThan(pace(0).every);
    expect(pace(ROUND).up).toBeLessThan(pace(0).up);
    expect(pace(ROUND).most).toBeGreaterThan(pace(0).most);
  });

  it('pays more for a streak, triple for gold, and charges for a starfish', () => {
    expect(boopPoints('crab', 0)).toBe(1);
    expect(boopPoints('crab', 5)).toBe(2);
    expect(boopPoints('crab', 12)).toBe(3);
    expect(boopPoints('gold', 0)).toBe(3);
    expect(boopPoints('gold', 5)).toBe(6);
    expect(boopPoints('star', 9)).toBe(-3);
  });

  it('maps keys to holes in the same layout as the screen', () => {
    expect(HOLE_KEYS.Digit1).toBe(0);
    expect(HOLE_KEYS.Digit9).toBe(8);
    expect(HOLE_KEYS.KeyQ).toBe(0);
    expect(HOLE_KEYS.KeyS).toBe(4);
    expect(HOLE_KEYS.KeyC).toBe(8);
    expect(HOLE_KEYS.Numpad7).toBe(0);
    expect(HOLE_KEYS.Numpad3).toBe(8);
  });

  it('boops a crab once, counts the streak, and breaks it when one gets away', () => {
    const f = new CrabField(seeded(3));
    f.holes[4] = { kind: 'crab', age: 0.3, up: 1, booped: false };
    expect(f.boop(4)).toEqual({ points: 1, kind: 'crab' });
    expect(f.boop(4)).toBeNull();
    expect(f.boop(0)).toBeNull();
    expect(f.score).toBe(1);
    expect(f.streak).toBe(1);
    f.holes.fill(null);
    f.holes[2] = { kind: 'crab', age: 0, up: 0.2, booped: false };
    const away = [];
    for (let i = 0; i < 30; i++) away.push(...f.step(1 / 60).filter((e) => e.type === 'away'));
    expect(away).toHaveLength(1);
    expect(f.streak).toBe(0);
  });

  it('never lets a starfish push the score below zero', () => {
    const f = new CrabField(seeded(3));
    f.holes[1] = { kind: 'star', age: 0.2, up: 1, booped: false };
    expect(f.boop(1)?.points).toBe(-3);
    expect(f.score).toBe(0);
  });

  it('never puts two critters in one hole, and stops at the bell', () => {
    const f = new CrabField(seeded(11));
    for (let t = 0; t < ROUND + 2; t += 1 / 60) {
      const ups = f.step(1 / 60).filter((e) => e.type === 'up');
      for (const u of ups) expect(f.holes[u.hole]?.age).toBe(0);
      // Boop everything that shows, like a very good player.
      f.holes.forEach((c, i) => c && c.kind !== 'star' && !c.booped && c.age > 0.2 && f.boop(i));
    }
    expect(f.over).toBe(true);
    expect(f.elapsed).toBe(ROUND);
    expect(f.score).toBeGreaterThan(40);
    expect(f.best).toBeGreaterThan(10);
    expect(f.step(1)).toEqual([]);
  });
});

describe('crate stack', () => {
  const base = { x: 0, w: 1 };

  it('snaps a near-square drop and loses nothing', () => {
    expect(drop(base, { x: PERFECT * 0.9, w: 1 })).toEqual({ placed: { x: 0, w: 1 }, fell: null, perfect: true });
  });

  it('keeps the overlap and drops the overhang', () => {
    const r = drop(base, { x: 0.3, w: 1 });
    expect(r.perfect).toBe(false);
    expect(r.placed!.w).toBeCloseTo(0.7);
    expect(r.placed!.x).toBeCloseTo(0.15);
    expect(r.fell!.w).toBeCloseTo(0.3);
    expect(r.fell!.x).toBeCloseTo(0.65);
    const l = drop(base, { x: -0.4, w: 1 });
    expect(l.placed!.x).toBeCloseTo(-0.2);
    expect(l.fell!.x).toBeCloseTo(-0.7);
    expect(l.placed!.w + l.fell!.w).toBeCloseTo(1);
  });

  it('is over when a crate misses the stack', () => {
    expect(drop(base, { x: 1.2, w: 1 })).toEqual({ placed: null, fell: { x: 1.2, w: 1 }, perfect: false });
  });

  it('swings side to side within reach, faster as the tower grows', () => {
    for (let t = 0; t < 5; t += 0.05) expect(Math.abs(swingAt(t, 2, true))).toBeLessThanOrEqual(SWING + 1e-9);
    expect(swingAt(0, 2, true)).toBe(-SWING);
    expect(swingAt(0, 2, false)).toBe(SWING);
    expect(swingAt(SWING / 2, 2, true)).toBeCloseTo(0);
    expect(swingAt(SWING, 2, true)).toBeCloseTo(SWING);
    expect(swingAt(SWING * 2, 2, true)).toBeCloseTo(-SWING);
    expect(speedFor(20)).toBeGreaterThan(speedFor(0));
    expect(speedFor(500)).toBeLessThanOrEqual(3.4);
  });

  it('stacks a crate for every drop that lands, perfect when dropped dead centre, over on a miss', () => {
    const sounds: string[] = [];
    const round = startCrates(env(sounds));
    const step = 1 / 600;
    for (let level = 0; level < 6; level++) {
      // The crate starts at the side and reaches the middle after SWING / speed seconds.
      for (let t = 0; t + step / 2 < SWING / speedFor(level); t += step) round.update(step);
      round.press(null, 'Space');
      // It lands a moment later, and the next crate sets off from the other side.
      for (let t = 0; t < 1 && round.score === level; t += step) round.update(step);
      expect(round.score).toBe(level + 1);
    }
    expect(sounds.filter((s) => s === 'perfect')).toHaveLength(6);
    expect(sounds.filter((s) => s === 'thud')).toHaveLength(6);
    // Now drop right at the far end of the swing: clean off the stack.
    round.press(null, 'Space');
    for (let t = 0; t < 1.5; t += 1 / 60) round.update(1 / 60);
    expect(round.over).toBe(true);
    expect(round.score).toBe(6);
    expect(REGROW).toBeGreaterThan(0);
  });
});
