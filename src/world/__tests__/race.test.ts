import { describe, expect, it } from 'vitest';
import { createGeo, SWIM_REACH } from '../geo';
import { crossed, formatGap, formatLap, GATE_HALF, ghostAt, GATES, Lap, raceCourse, readGhost, type Ghost } from '../race';
import { world } from './fixtures';

const w = world();
const geo = createGeo(w);
const boat = w.activities.find((a) => a.kind === 'boat')!;
const course = raceCourse(geo, boat);

/** Drive the middle of the course from the start, in small steps, through every gate. */
function driveLap(lap: Lap, skip: number | null = null) {
  const events = [];
  let t = 0;
  let prev = course.start;
  const pts = [...course.line, course.line[0]];
  // From the start position up to the start line, then round the loop and back over it.
  const path = [course.start, ...pts, ...pts.slice(1, 10)];
  for (const p of path) {
    // Steer round the gate we're skipping, outside its far post.
    let q = p;
    if (skip !== null) {
      const g = course.gates[skip];
      if (Math.hypot(p.x - g.x, p.z - g.z) < g.half + 2) q = { x: g.x + g.tz * (g.half + 3), z: g.z - g.tx * (g.half + 3) };
    }
    t += Math.hypot(q.x - prev.x, q.z - prev.z) / 10;
    const e = lap.step(prev.x, prev.z, q.x, q.z, t);
    if (e) events.push(e);
    prev = { x: q.x, z: q.z, yaw: 0 };
  }
  return events;
}

describe('the boat', () => {
  it('is moored in deep enough water, beside the end of the pier', () => {
    expect(boat.place).toBe('blog');
    expect(geo.depthAt(boat.at.x, boat.at.z)).toBeGreaterThan(1);
    expect(Math.abs(boat.at.x - geo.pier.x)).toBeLessThan(geo.pier.width + 1);
    expect(boat.at.z).toBeGreaterThan(geo.pier.start);
  });
});

describe('the course', () => {
  it('runs right round the island, out past the swimming water', () => {
    for (let k = 0; k < 720; k++) {
      const th = (k / 720) * Math.PI * 2;
      const edge = geo.coastRadius(th) + SWIM_REACH;
      // The inner post of a gate stepped in toward the island still floats past the buoys.
      expect(course.radius(th) - GATE_HALF - 2, `bearing ${th.toFixed(2)}`).toBeGreaterThan(edge + 1);
    }
    // And round the islets: every point of it clear of all the swimming water, a gate's width and more.
    for (const p of course.line) expect(geo.swimRoom(p.x, p.z), `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeLessThan(-(GATE_HALF + 2));
    // Round Synergy Isle too, out past Boardwalk Isle, so a little longer than it once was.
    expect(course.length).toBeGreaterThan(200);
    // Little London grew and Synergy Isle is far out: the course goes round both.
    expect(course.length).toBeLessThan(500);
  });

  it('keeps every gate, posts and all, in deep water clear of the buoys', () => {
    expect(course.gates).toHaveLength(GATES);
    for (const g of course.gates) {
      for (const s of [-1, 1]) {
        const x = g.x - g.tz * g.half * s;
        const z = g.z + g.tx * g.half * s;
        expect(geo.depthAt(x, z), `gate ${g.i}`).toBeGreaterThan(2);
        expect(geo.swimRoom(x, z), `gate ${g.i}`).toBeLessThan(-1);
      }
    }
  });

  it('starts just short of the start line, facing through it', () => {
    const g = course.gates[0];
    const ahead = (g.x - course.start.x) * g.tx + (g.z - course.start.z) * g.tz;
    expect(ahead).toBeGreaterThan(4);
    expect(Math.hypot(Math.sin(course.start.yaw) - g.tx, Math.cos(course.start.yaw) - g.tz)).toBeLessThan(0.3);
  });

  it('gates follow one another round the ring, clockwise on the map', () => {
    const angles = course.gates.map((g) => Math.atan2(g.z, g.x));
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      expect(d).toBeGreaterThan(0.3);
    }
  });

  it('is the same course every time (ghosts depend on it)', () => {
    expect(raceCourse(geo, boat).sig).toBe(course.sig);
  });
});

describe('crossing a gate', () => {
  const g = { i: 0, x: 0, z: 0, tx: 0, tz: 1, half: 4 };
  it('counts going through forwards, between the posts', () => {
    expect(crossed(g, 0, -1, 0, 1)).toBe(1);
    expect(crossed(g, 3.5, -0.2, 3.5, 0.2)).toBe(1);
  });
  it('knows backwards from forwards, and a miss from a hit', () => {
    expect(crossed(g, 0, 1, 0, -1)).toBe(-1);
    expect(crossed(g, 5, -1, 5, 1)).toBe(0);
    expect(crossed(g, 0, -2, 0, -1)).toBe(0);
  });
});

describe('a lap', () => {
  it('goes through every gate in order and finishes on the start line', () => {
    const lap = new Lap(course);
    const events = driveLap(lap);
    expect(events.map((e) => (e.type === 'gate' ? e.gate : 'finish'))).toEqual([...Array.from({ length: GATES - 1 }, (_, i) => i + 1), 'finish']);
    const finish = events[events.length - 1];
    expect(finish.type === 'finish' && finish.splits).toHaveLength(GATES);
    expect(lap.done).toBe(true);
  });

  it("doesn't count the start line on the way out, and won't finish with a gate missed", () => {
    const lap = new Lap(course);
    const events = driveLap(lap, 4);
    expect(events.map((e) => e.type === 'gate' && e.gate)).toEqual([1, 2, 3]);
    expect(lap.done).toBe(false);
    expect(lap.next).toBe(4);
  });
});

describe('ghosts', () => {
  const ghost: Ghost = { v: 1, sig: course.sig, time: 0.25, dt: 0.1, splits: [0.25], x: [0, 1, 2], z: [0, 0, 2], yaw: [3, -3, 0] };
  it('replay a lap in between their samples', () => {
    expect(ghostAt(ghost, 0.05)).toEqual({ x: 0.5, z: 0, yaw: expect.closeTo(3 + (2 * Math.PI - 6) / 2, 5) });
    expect(ghostAt(ghost, 0.2)?.x).toBe(2);
    expect(ghostAt(ghost, 0.3)).toBe(null);
  });
  it('are only read back whole, and for this course', () => {
    expect(readGhost(JSON.parse(JSON.stringify(ghost)), course.sig)).toEqual(ghost);
    expect(readGhost(ghost, 'another course')).toBe(null);
    expect(readGhost({ ...ghost, x: [0, 'a', 1] }, course.sig)).toBe(null);
    expect(readGhost(null, course.sig)).toBe(null);
  });
});

describe('lap times', () => {
  it('read like a stopwatch', () => {
    expect(formatLap(42.07)).toBe('0:42.07');
    expect(formatLap(65.5)).toBe('1:05.50');
    expect(formatLap(59.999)).toBe('1:00.00');
    expect(formatGap(-0.42)).toBe('-0.42');
    expect(formatGap(1.3)).toBe('+1.30');
  });
});
