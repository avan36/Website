// The adventure's race as pure math: a closed course along the streets, gates
// round it, laps and their times, what's road and what's grass, and bumping
// into buildings. No rendering and no clock in here, so the scene, the
// minimap and the tests all agree, and a whole race can be driven in a test.

export type Vec = { x: number; z: number };

/** A rectangle turned about its center: a building's footprint. */
export type Box = { x: number; z: number; hw: number; hd: number; angle: number };

/** The nearest point to p on the segment a to b, and how far along it (0 to 1). */
export function nearestOnSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return { x, z, t, d: Math.hypot(p.x - x, p.z - z) };
}

/** How far p is from a polyline (open, or closed back to its start). */
export function distanceToLine(p: Vec, pts: Vec[], closed = false): number {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]).d);
  return best;
}

export class Course {
  readonly pts: Vec[];
  /** Distance along the course to each point; the last entry is the whole lap. */
  readonly at: number[];
  readonly length: number;

  constructor(pts: Vec[]) {
    if (pts.length < 3) throw new Error('A course needs at least three points.');
    this.pts = pts;
    this.at = [0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.at.push(this.at[i] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.at[pts.length];
  }

  /** The nearest point on the course, how far it is, and how far along the lap it falls. */
  project(p: Vec) {
    let best = { x: 0, z: 0, d: Infinity, s: 0 };
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % this.pts.length];
      const q = nearestOnSegment(p, a, b);
      if (q.d < best.d) best = { x: q.x, z: q.z, d: q.d, s: this.at[i] + (this.at[i + 1] - this.at[i]) * q.t };
    }
    return best;
  }

  /** The point s along the lap (wrapping), and the way the course runs there. */
  pointAt(s: number) {
    s = ((s % this.length) + this.length) % this.length;
    let i = 0;
    while (i < this.pts.length - 1 && this.at[i + 1] < s) i++;
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const seg = this.at[i + 1] - this.at[i];
    const t = seg > 0 ? (s - this.at[i]) / seg : 0;
    const tx = (b.x - a.x) / (seg || 1);
    const tz = (b.z - a.z) / (seg || 1);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz, heading: Math.atan2(tx, tz) };
  }
}

export type Gate = { i: number; x: number; z: number; s: number; heading: number; name: string; landmark?: string };

/** Snap each gate onto the course, keeping its name. */
export function placeGates(course: Course, list: { at: Vec; name: string; landmark?: string }[]): Gate[] {
  return list.map((g, i) => {
    const q = course.project(g.at);
    const p = course.pointAt(q.s);
    return { i, x: p.x, z: p.z, s: q.s, heading: p.heading, name: g.name, landmark: g.landmark };
  });
}

/** How close to a gate's middle counts as going through it. */
export const GATE_RADIUS = 7;

export type RacePhase = 'countdown' | 'racing' | 'done';

export type Race = {
  phase: RacePhase;
  /** Seconds left of the countdown, then seconds since the start. */
  t: number;
  laps: number;
  /** The lap you're on, from 1. */
  lap: number;
  /** The next gate to go through. */
  next: number;
  /** Each finished lap's time. */
  splits: number[];
};

export type RaceEvent =
  | { type: 'go' }
  | { type: 'gate'; gate: number }
  | { type: 'lap'; lap: number; time: number }
  | { type: 'finish'; time: number };

export const COUNTDOWN = 3;

export function newRace(laps = 2): Race {
  return { phase: 'countdown', t: COUNTDOWN, laps, lap: 1, next: 1, splits: [] };
}

/**
 * Move the race on by dt with the car at p. Gates only count in order, so a
 * shortcut across campus just means going back for the gate you missed.
 */
export function stepRace(r: Race, p: Vec, dt: number, gates: Gate[]): { race: Race; events: RaceEvent[] } {
  const events: RaceEvent[] = [];
  if (r.phase === 'done') return { race: r, events };
  if (r.phase === 'countdown') {
    const t = r.t - dt;
    if (t > 0) return { race: { ...r, t }, events };
    events.push({ type: 'go' });
    return { race: { ...r, phase: 'racing', t: -t }, events };
  }
  let race = { ...r, t: r.t + dt };
  const g = gates[race.next];
  if (Math.hypot(p.x - g.x, p.z - g.z) <= GATE_RADIUS) {
    if (race.next === 0) {
      const lapTime = race.t - race.splits.reduce((a, b) => a + b, 0);
      const splits = [...race.splits, lapTime];
      events.push({ type: 'lap', lap: race.lap, time: lapTime });
      if (race.lap >= race.laps) {
        events.push({ type: 'finish', time: race.t });
        race = { ...race, splits, phase: 'done' };
      } else {
        race = { ...race, splits, lap: race.lap + 1, next: 1 };
      }
    } else {
      events.push({ type: 'gate', gate: race.next });
      race = { ...race, next: (race.next + 1) % gates.length };
    }
  }
  return { race, events };
}

/** Where a race starts: on the course, a little way back from the start line, facing along it. */
export function startPose(course: Course, gates: Gate[], back = 12) {
  const p = course.pointAt(gates[0].s - back);
  return { x: p.x, z: p.z, heading: p.heading };
}

/** Push a round thing of radius r out of a box. Returns the way it was pushed, or null if it wasn't touching. */
export function pushOut(p: Vec, r: number, b: Box): { x: number; z: number; nx: number; nz: number } | null {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  // Into the box's own frame.
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx));
  const qz = Math.max(-b.hd, Math.min(b.hd, lz));
  let ox = lx - qx;
  let oz = lz - qz;
  let d = Math.hypot(ox, oz);
  if (d >= r) return null;
  if (d === 0) {
    // The middle is inside: leave by the nearest side.
    const ex = b.hw - Math.abs(lx);
    const ez = b.hd - Math.abs(lz);
    if (ex < ez) { ox = Math.sign(lx) || 1; oz = 0; d = -ex; } else { ox = 0; oz = Math.sign(lz) || 1; d = -ez; }
    const lnx = ox;
    const lnz = oz;
    const nx = lnx * c - lnz * s;
    const nz = lnx * s + lnz * c;
    const push = r - d;
    return { x: p.x + nx * push, z: p.z + nz * push, nx, nz };
  }
  const lnx = ox / d;
  const lnz = oz / d;
  const nx = lnx * c - lnz * s;
  const nz = lnx * s + lnz * c;
  const push = r - d;
  return { x: p.x + nx * push, z: p.z + nz * push, nx, nz };
}

/** Do two boxes overlap (or come within `gap` of each other)? Separating axes. */
export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2];
  const corners = (q: Box) => {
    const c = Math.cos(q.angle);
    const s = Math.sin(q.angle);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({
      x: q.x + u * q.hw * c - v * q.hd * s,
      z: q.z + u * q.hw * s + v * q.hd * c,
    }));
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const ang of axes) {
    const ax = Math.cos(ang);
    const az = Math.sin(ang);
    const pa = ca.map((p) => p.x * ax + p.z * az);
    const pb = cb.map((p) => p.x * ax + p.z * az);
    if (Math.max(...pa) + gap < Math.min(...pb) || Math.max(...pb) + gap < Math.min(...pa)) return false;
  }
  return true;
}

/** The distance from a point to a box's edge (0 inside). */
export function distanceToBox(p: Vec, b: Box): number {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const lx = Math.abs(dx * c + dz * s) - b.hw;
  const lz = Math.abs(-dx * s + dz * c) - b.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}

/** Format seconds as a race clock: 1:04.32. */
export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
