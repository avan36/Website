import { describe, expect, it } from 'vitest';
import { BUS_LEN, createBus, DWELL } from '../bus';
import { createGeo } from '../geo';
import { checkWorld } from '../schema';
import { world } from './fixtures';

const geo = createGeo(world());
const run = (b: ReturnType<typeof createBus>, seconds: number, player: { x: number; z: number } | null = null) => {
  for (let i = 0; i < seconds * 20; i++) b.update(0.05, player);
};
const isle = geo.islands.findIndex((s) => s.id === 'little-london');

describe('the London bus', () => {
  it('has a road round Little London, with its stop on the kerb outside the loop', () => {
    const road = geo.road!;
    expect(road).not.toBeNull();
    for (let s = 0; s < road.length; s += 0.5) {
      const p = road.at(s);
      expect(geo.islandOf(p.x, p.z), `road at ${s}`).toBe(isle);
      expect(geo.isOpenGround(p.x, p.z)).toBe(false); // nothing grows on it
    }
    const stop = geo.busStop!;
    expect(geo.islandOf(stop.shelter.x, stop.shelter.z)).toBe(isle);
    expect(geo.roadDist(stop.shelter.x, stop.shelter.z)).toBeGreaterThan(1.6);
    // Outside the loop: further from its middle than the road is.
    const c = world().geography.busRoute!.center;
    expect(Math.hypot(stop.shelter.x - c.x, stop.shelter.z - c.z)).toBeGreaterThan(Math.hypot(stop.x - c.x, stop.z - c.z));
    // The road is level, at its bed's height, so the bus never tips.
    for (let s = 0; s < road.length; s += 2) {
      const p = road.at(s);
      expect(geo.heightAt(p.x, p.z)).toBeCloseTo(world().geography.busRoute!.bed, 5);
    }
  });

  it('starts at the stop, waits, then pulls away', () => {
    const b = createBus(geo);
    expect(b.exists).toBe(true);
    expect(b.state().atStop).toBe(true);
    expect(b.state().dwell).toBeGreaterThan(0);
    run(b, DWELL / 2 + 3);
    expect(b.state().atStop).toBe(false);
    expect(b.state().v).toBeGreaterThan(0);
  });

  it('drives the whole loop and stops at the stop every time round', () => {
    const b = createBus(geo);
    let stops = 0;
    let was = true;
    let travelled = 0;
    let last = b.state().s;
    for (let i = 0; i < 120 * 20; i++) {
      b.update(0.05, null);
      const st = b.state();
      const d = (st.s - last + b.length) % b.length;
      travelled += d;
      last = st.s;
      const waiting = st.atStop && st.v === 0;
      if (waiting && !was) stops++;
      was = waiting;
    }
    // Two minutes is three laps or more, with a stop at the end of each.
    expect(travelled / b.length).toBeGreaterThan(2.5);
    expect(stops).toBeGreaterThanOrEqual(2);
  });

  it('eases in and out: never faster than it can pull away or brake', () => {
    const b = createBus(geo);
    let v = b.state().v;
    for (let i = 0; i < 60 * 20; i++) {
      b.update(0.05, null);
      const nv = b.state().v;
      if (nv !== 0) expect(Math.abs(nv - v)).toBeLessThan(0.2);
      v = nv;
    }
  });

  it('faces the way it drives, clockwise from above', () => {
    const b = createBus(geo);
    run(b, DWELL / 2 + 2);
    const a = b.pose()!;
    run(b, 0.5);
    const c = b.pose()!;
    const heading = Math.atan2(c.x - a.x, c.z - a.z);
    const d = Math.atan2(Math.sin(heading - a.yaw), Math.cos(heading - a.yaw));
    expect(Math.abs(d)).toBeLessThan(0.3);
    // The stop is on the south side, so pulling away it heads west.
    expect(c.x).toBeLessThan(a.x);
  });

  it('stops for anyone in the road ahead, and goes on once they step off', () => {
    const b = createBus(geo);
    run(b, DWELL / 2 + 4);
    const road = geo.road!;
    const ahead = road.at(b.state().s + BUS_LEN / 2 + 2.5);
    run(b, 3, ahead);
    expect(b.state().v).toBe(0);
    expect(b.state().held).toBe(true);
    const s = b.state().s;
    run(b, 5, ahead);
    expect(b.state().s).toBe(s);
    run(b, 2, null);
    expect(b.state().v).toBeGreaterThan(0);
  });

  it('gives the explorer a body to bump into, down its length', () => {
    const b = createBus(geo);
    const p = b.pose()!;
    const body = b.body();
    expect(body).toHaveLength(3);
    expect(Math.hypot(body[1].x - p.x, body[1].z - p.z)).toBeLessThan(1e-9);
    expect(Math.hypot(body[2].x - body[0].x, body[2].z - body[0].z)).toBeCloseTo(2.9, 5);
  });
});

describe('the bus road check', () => {
  const base = world();
  const text = (w: typeof base) => checkWorld(w).map((i) => i.message).join('\n');

  it('passes as it is', () => {
    expect(text(base)).toBe('');
  });

  it('catches a road that runs into the sea, or into a building', () => {
    const w = structuredClone(base);
    w.geography.busRoute!.rx = 14;
    expect(text(w)).toMatch(/The bus's road leaves the dry land of islet "little-london"/);
    const w2 = structuredClone(base);
    w2.geography.busRoute!.rx = 5;
    w2.geography.busRoute!.rz = 5;
    expect(text(w2)).toMatch(/The bus's road goes too close to "(westfield|no-12)"/);
  });

  it('catches anyone walking across the road', () => {
    const w = structuredClone(base);
    w.wanderers.find((v) => v.id === 'mom')!.walk[0] = { x: 60, z: 20 };
    expect(text(w)).toMatch(/Mom's walk from waypoint 0 to 1 crosses the bus's road/);
  });
});
