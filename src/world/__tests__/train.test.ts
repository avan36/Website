import { describe, expect, it } from 'vitest';
import { createGeo } from '../geo';
import { CAR_GAP, CAR_LEN, createTrain } from '../train';
import { world } from './fixtures';

const geo = createGeo(world());
const run = (t: ReturnType<typeof createTrain>, seconds: number, running: boolean, player: { x: number; z: number } | null = null) => {
  for (let i = 0; i < seconds * 20; i++) t.update(0.05, running, player);
};

describe('the commuter train', () => {
  it('starts out waiting at the platform', () => {
    const t = createTrain(geo);
    expect(t.exists).toBe(true);
    expect(t.state().atStation).toBe(true);
    run(t, 30, false);
    expect(t.state().atStation).toBe(true);
    expect(t.state().v).toBe(0);
  });

  it('pulls away when in service and comes round to stop at the platform again', () => {
    const t = createTrain(geo);
    run(t, 3, true);
    expect(t.state().atStation).toBe(false);
    expect(t.state().v).toBeGreaterThan(0);
    // A lap is about 53 units at 3.4 a second, plus pulling away and braking.
    let stopped = false;
    for (let i = 0; i < 40 * 20 && !stopped; i++) {
      t.update(0.05, true, null);
      stopped = t.state().atStation && t.state().dwell > 0;
    }
    expect(stopped).toBe(true);
  });

  it('finishes its lap and waits when service ends for the night', () => {
    const t = createTrain(geo);
    run(t, 6, true);
    expect(t.state().atStation).toBe(false);
    run(t, 60, false);
    expect(t.state().atStation).toBe(true);
    expect(t.state().v).toBe(0);
  });

  it('stops for someone standing on the line ahead', () => {
    const t = createTrain(geo);
    run(t, 4, true);
    const front = t.cars()[0];
    // Stand on the track a little way ahead of the locomotive.
    const s = t.state().s;
    const ahead = geo.rail!.at(s + 3.3 * 1.5 + 0.4 + 2.5);
    run(t, 6, true, { x: ahead.x, z: ahead.z });
    expect(t.state().v).toBe(0);
    expect(Math.hypot(t.cars()[0].x - front.x, t.cars()[0].z - front.z)).toBeLessThan(4);
  });

  it('keeps every car on the track', () => {
    const t = createTrain(geo);
    for (let k = 0; k < 10; k++) {
      run(t, 2, true);
      for (const c of t.cars()) expect(geo.railDist(c.x, c.z)).toBeLessThan(0.25);
    }
  });
  it('goes all the way round the loop, every part of it, lap after lap', () => {
    const t = createTrain(geo);
    const length = geo.rail!.length;
    const bins = new Set<number>();
    let laps = 0;
    let wasAway = false;
    for (let i = 0; i < 120 * 20; i++) {
      t.update(0.05, true, null);
      const st = t.state();
      bins.add(Math.floor((st.s / length) * 40));
      if (!st.atStation) wasAway = true;
      else if (wasAway && st.dwell > 0) (laps++, (wasAway = false));
    }
    expect(bins.size).toBe(40);
    expect(laps).toBeGreaterThanOrEqual(4);
  });

  it('spends most of its time moving, with only a short stop at the platform', () => {
    const t = createTrain(geo);
    let moving = 0;
    let longestStop = 0;
    let stop = 0;
    const steps = 180 * 20;
    for (let i = 0; i < steps; i++) {
      t.update(0.05, true, null);
      if (t.state().v > 0) (moving++, (stop = 0));
      else longestStop = Math.max(longestStop, (stop += 0.05));
    }
    expect(moving / steps).toBeGreaterThan(0.7);
    expect(longestStop).toBeLessThan(8);
  });

  it('moves smoothly, never jumping along the track', () => {
    const t = createTrain(geo);
    let prev = t.cars();
    for (let i = 0; i < 90 * 20; i++) {
      t.update(0.05, true, null);
      const now = t.cars();
      now.forEach((c, k) => expect(Math.hypot(c.x - prev[k].x, c.z - prev[k].z)).toBeLessThan(3.4 * 0.05 + 0.02));
      prev = now;
    }
  });

  it('faces each car along the track and keeps them coupled round the curves', () => {
    const t = createTrain(geo);
    const rail = geo.rail!;
    for (let k = 0; k < 40; k++) {
      run(t, 0.7, true);
      const cars = t.cars();
      for (const c of cars) {
        // The nearest point on the loop, and which way the track runs there.
        let best = 0;
        let bestD = Infinity;
        for (let s = 0; s < rail.length; s += 0.05) {
          const p = rail.at(s);
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d < bestD) (bestD = d), (best = s);
        }
        const along = rail.at(best - 0.175).yaw; // at() looks 0.35 ahead
        const turn = Math.atan2(Math.sin(c.yaw - along), Math.cos(c.yaw - along));
        expect(Math.abs(turn)).toBeLessThan(0.2);
      }
      for (let i = 1; i < cars.length; i++) {
        const gap = Math.hypot(cars[i].x - cars[i - 1].x, cars[i].z - cars[i - 1].z);
        expect(gap).toBeGreaterThan((CAR_LEN + CAR_GAP) * 0.85);
        expect(gap).toBeLessThan((CAR_LEN + CAR_GAP) * 1.02);
      }
    }
  });
});
