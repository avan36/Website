import { describe, expect, it } from 'vitest';
import { boxesOverlap, clock, Course, distanceToBox, newRace, placeGates, pushOut, startPose, stepRace, type Race } from '../track';

const square = new Course([{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }]);
const gates = placeGates(square, [
  { at: { x: 50, z: -3 }, name: 'start' },
  { at: { x: 103, z: 50 }, name: 'east' },
  { at: { x: 50, z: 104 }, name: 'south' },
  { at: { x: -2, z: 50 }, name: 'west' },
]);

describe('the course', () => {
  it('measures a lap and finds points along it', () => {
    expect(square.length).toBe(400);
    expect(square.pointAt(150)).toMatchObject({ x: 100, z: 50 });
    expect(square.pointAt(-50)).toMatchObject({ x: 0, z: 50 });
    expect(square.project({ x: 40, z: 7 })).toMatchObject({ x: 40, z: 0, d: 7, s: 40 });
  });

  it('snaps gates onto the course, in order', () => {
    expect(gates.map((g) => [g.x, g.z])).toEqual([[50, 0], [100, 50], [50, 100], [0, 50]]);
    expect(gates.map((g) => g.s)).toEqual([50, 150, 250, 350]);
  });

  it('starts you behind the line, facing along the course', () => {
    const p = startPose(square, gates, 10);
    expect(p.x).toBeCloseTo(40);
    expect(p.z).toBeCloseTo(0);
    expect(p.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('the race', () => {
  const drive = (r: Race, path: { x: number; z: number }[]) => {
    const events = [];
    for (const p of path) {
      const out = stepRace(r, p, 1, gates);
      r = out.race;
      events.push(...out.events);
    }
    return { r, events };
  };
  const lap = gates.slice(1).concat(gates[0]);

  it('counts down, then goes', () => {
    const { r, events } = drive(newRace(1), [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }]);
    expect(r.phase).toBe('racing');
    expect(events).toEqual([{ type: 'go' }]);
  });

  it('takes gates only in order', () => {
    let r: Race = { ...newRace(1), phase: 'racing', t: 0 };
    ({ r } = drive(r, [gates[2], gates[3], gates[0]]));
    expect(r.next).toBe(1);
    ({ r } = drive(r, [gates[1]]));
    expect(r.next).toBe(2);
  });

  it('times laps and finishes after the last one', () => {
    let r: Race = { ...newRace(2), phase: 'racing', t: 0 };
    const out = drive(r, [...lap, ...lap]);
    r = out.r;
    expect(r.phase).toBe('done');
    expect(r.splits).toEqual([4, 4]);
    expect(out.events.filter((e) => e.type === 'finish')).toEqual([{ type: 'finish', time: 8 }]);
  });
});

describe('bumping', () => {
  const box = { x: 0, z: 0, hw: 5, hd: 2, angle: 0 };

  it('pushes a car out of the side it hit', () => {
    const hit = pushOut({ x: 0, z: 2.5 }, 1, box)!;
    expect(hit.z).toBeCloseTo(3);
    expect(hit.nz).toBeCloseTo(1);
    expect(pushOut({ x: 0, z: 4 }, 1, box)).toBeNull();
  });

  it('works for a turned box too', () => {
    const turned = { ...box, angle: Math.PI / 2 };
    expect(pushOut({ x: 0, z: 4.5 }, 1, turned)).not.toBeNull();
    expect(pushOut({ x: 4.5, z: 0 }, 1, turned)).toBeNull();
    expect(distanceToBox({ x: 5, z: 0 }, turned)).toBeCloseTo(3);
  });

  it('gets you out even from the middle', () => {
    const hit = pushOut({ x: 4.8, z: 0 }, 1, box)!;
    expect(hit.x).toBeCloseTo(6);
  });

  it('tells overlapping boxes apart', () => {
    expect(boxesOverlap(box, { ...box, x: 9 })).toBe(true);
    expect(boxesOverlap(box, { ...box, x: 11 })).toBe(false);
    expect(boxesOverlap(box, { ...box, x: 11 }, 2)).toBe(true);
  });
});

it('reads a race clock', () => {
  expect(clock(64.321)).toBe('1:04.32');
  expect(clock(5)).toBe('0:05.00');
});
