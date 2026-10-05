import { describe, expect, it } from 'vitest';
import { headingOf, seedOf, turnBetween, walkClock, walker, type Walk } from '../wander';
import { world } from './fixtures';

/** A 4 by 4 square, walked at 2 a second with a second's pause at each corner: 3 seconds a side, 12 a lap. */
const square: Walk = {
  id: 'square',
  walk: [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 4 },
    { x: 0, z: 4 },
  ],
  pace: 2,
  pause: 1,
};

describe('walking a loop', () => {
  const w = walker(square);
  const off = seedOf('square') * w.period;
  /** Where they are `t` seconds after the lap starts at the first waypoint. */
  const at = (t: number) => w.at(t - off);

  it('takes a lap as long as the walking and the pauses together', () => {
    expect(w.period).toBeCloseTo(12);
    expect(w.legs.map((l) => l.len)).toEqual([4, 4, 4, 4]);
  });

  it('pauses at each waypoint, then walks the leg at its pace', () => {
    expect(at(0.5)).toMatchObject({ x: 0, z: 0, moving: false, leg: 0 });
    const mid = at(2);
    expect(mid.moving).toBe(true);
    expect(mid.x).toBeCloseTo(2);
    expect(mid.z).toBeCloseTo(0);
    expect(at(3.5)).toMatchObject({ x: 4, z: 0, moving: false, leg: 1 });
    expect(at(5).z).toBeCloseTo(2);
  });

  it('faces the way it walks: east along the first leg, south down the second', () => {
    expect(at(2).heading).toBeCloseTo(Math.PI / 2);
    expect(at(5).heading).toBeCloseTo(0);
  });

  it('turns while it pauses: still facing the way it came at first, then round to the next leg', () => {
    expect(at(3.05).heading).toBeCloseTo(Math.PI / 2);
    expect(at(3.99).heading).toBeCloseTo(0, 1);
    const half = at(3.7).heading;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(Math.PI / 2);
  });

  it('goes round and round, for any time at all', () => {
    for (const t of [0.3, 2.2, 7.9, 11.4]) {
      const a = at(t);
      const b = at(t + w.period * 1000);
      const c = at(t - w.period * 37);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(c.z).toBeCloseTo(a.z, 6);
    }
  });

  it('never strays off the loop', () => {
    for (let t = 0; t < w.period; t += 0.05) {
      const p = at(t);
      const onEdge = Math.min(Math.abs(p.x), Math.abs(p.x - 4), Math.abs(p.z), Math.abs(p.z - 4));
      expect(onEdge, t.toFixed(2)).toBeLessThan(1e-9);
    }
  });

  it('starts everyone somewhere different, and the same place every visit', () => {
    expect(seedOf('dad')).toBe(seedOf('dad'));
    expect(seedOf('dad')).not.toBe(seedOf('mom'));
    for (const id of ['a', 'pushkar', 'the-protector']) {
      expect(seedOf(id)).toBeGreaterThanOrEqual(0);
      expect(seedOf(id)).toBeLessThan(1);
    }
  });

  it('measures headings the way places face, and turns the short way round', () => {
    expect(headingOf({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0);
    expect(headingOf({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(turnBetween(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
    expect(walkClock(5000)).toBe(5);
  });
});

describe('the walks on the island', () => {
  const w = world();

  it('keep everyone walking more than they stand about', () => {
    for (const v of w.wanderers) {
      const lap = walker(v);
      let moving = 0;
      for (let t = 0; t < lap.period; t += 0.5) if (lap.at(t).moving) moving++;
      expect(moving / (lap.period / 0.5), v.id).toBeGreaterThan(0.4);
    }
  });
});
