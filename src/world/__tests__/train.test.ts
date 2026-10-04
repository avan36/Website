import { describe, expect, it } from 'vitest';
import { createGeo } from '../geo';
import { createTrain } from '../train';
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

  it('pulls away at rush hour and comes round to stop at the platform again', () => {
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

  it('finishes its lap and waits when rush hour ends', () => {
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
});
