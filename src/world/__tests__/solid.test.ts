import { describe, expect, it } from 'vitest';
import { boxAt, pushOut, touches } from '../solid';

describe('solid boxes', () => {
  // Four long and two wide, facing east (π/2): it runs from x = -2 to 2, z = -1 to 1.
  const east = boxAt({ x: 0, z: 0, yaw: Math.PI / 2 }, 4, 2);

  it('leaves you be when you are clear of it', () => {
    expect(pushOut(0, 2, east, 0.5)).toBeNull();
    expect(pushOut(3, 0, east, 0.5)).toBeNull();
    expect(touches(2.4, 1.4, east, 0.5)).toBe(false);
  });

  it('pushes you back to just touching when you lean on a side', () => {
    const out = pushOut(0.5, 1.2, east, 0.5)!;
    expect(out.x).toBeCloseTo(0.5, 9);
    expect(out.z).toBeCloseTo(1.5, 9);
  });

  it('pushes you round a corner, not along it', () => {
    const out = pushOut(2.2, 1.2, east, 0.5)!;
    expect(Math.hypot(out.x - 2, out.z - 1)).toBeCloseTo(0.5, 9);
  });

  it('takes you out the nearest side when you are inside it', () => {
    const side = pushOut(0.3, 0.6, east, 0.5)!;
    expect(side.x).toBeCloseTo(0.3, 9);
    expect(side.z).toBeCloseTo(1.5, 9);
    const end = pushOut(-1.8, 0.1, east, 0.5)!;
    expect(end.x).toBeCloseTo(-2.5, 9);
    expect(end.z).toBeCloseTo(0.1, 9);
  });

  it('turns with the way it faces', () => {
    // Facing south (yaw 0) its length runs down z instead.
    const south = boxAt({ x: 0, z: 0, yaw: 0 }, 4, 2);
    expect(touches(0, 2.3, south, 0.5)).toBe(true);
    expect(touches(2.3, 0, south, 0.5)).toBe(false);
  });

  it('never lets a walker through, however they come at it', () => {
    // Walking straight across the middle, a step at a time, pushed out each step: you end up on the side you started.
    let x = 0;
    let z = -3;
    for (let i = 0; i < 200; i++) {
      z += 0.05;
      const out = pushOut(x, z, east, 0.5);
      if (out) (x = out.x), (z = out.z);
    }
    expect(z).toBeLessThan(-1.4);
  });
});
