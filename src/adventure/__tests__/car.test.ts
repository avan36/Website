import { describe, expect, it } from 'vitest';
import { bump, GRASS, newCar, stepCar, TOP_SPEED } from '../car';

const run = (onRoad: boolean, steer = 0, secs = 10) => {
  let c = newCar(0, 0, 0);
  for (let i = 0; i < secs * 60; i++) c = stepCar(c, { throttle: 1, steer }, 1 / 60, onRoad);
  return c;
};

describe('the car', () => {
  it('speeds up toward its top speed, and drives the way it faces', () => {
    const c = run(true);
    expect(c.speed).toBeGreaterThan(TOP_SPEED * 0.9);
    expect(c.speed).toBeLessThanOrEqual(TOP_SPEED);
    expect(c.z).toBeGreaterThan(100);
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
  });

  it('is slower on the grass', () => {
    expect(run(false).speed).toBeLessThanOrEqual(TOP_SPEED * GRASS);
  });

  it('turns when moving, not when parked', () => {
    expect(run(true, 1, 1).heading).toBeGreaterThan(0.5);
    const parked = stepCar(newCar(0, 0, 0), { throttle: 0, steer: 1 }, 1, true);
    expect(parked.heading).toBe(0);
  });

  it('coasts to a stop', () => {
    let c = { ...newCar(0, 0, 0), speed: 10 };
    for (let i = 0; i < 600; i++) c = stepCar(c, { throttle: 0, steer: 0 }, 1 / 60, true);
    expect(c.speed).toBe(0);
  });

  it('stops dead running head on into a wall', () => {
    const c = bump({ ...newCar(0, 0, 0), speed: 20 }, 0, 0, 0, -1);
    expect(c.speed).toBeCloseTo(0);
  });
});
