// The boat race round the island, as pure math: where the course runs, where
// its gates stand, when a boat has gone through one, and how a lap is timed.
// No rendering and no clock in here, so the 3D island, the map and the tests
// all agree about the course, and a lap can be driven in a test.
//
// The course is a ring out in the open sea, past the furthest anyone can swim
// (geo's SWIM_REACH, where the buoys float), following the coast's general
// shape but smoothed, so it swings wide round the lighthouse's headland
// instead of copying every ripple of the shore. It runs clockwise on the map
// (south, then west, north and east), starting and finishing off the pier.

import { SWIM_REACH, type Geo, type Vec2 } from './geo';
import type { Activity } from './schema';

const TAU = Math.PI * 2;

/** How far past the edge of the swimming water the middle of the course runs. */
export const COURSE_OUT = 8;
/** How many gates make a lap (the first is the start and finish line). */
export const GATES = 10;
/** Half the width of a gate: the gap between its two posts is twice this. */
export const GATE_HALF = 4;
/** Gates step in and out of the ring by this much, alternately, so the lap weaves a little. */
const WEAVE = 2;
/** Where a race starts: this far back along the course from the start line. */
export const START_BACK = 7;
/** How far out past the course the open sea turns a boat back. */
export const OPEN_SEA = 16;
/** Samples round the ring. */
const N = 360;

export type Gate = {
  /** 0 is the start and finish line. */
  i: number;
  x: number;
  z: number;
  /** The way through it (unit vector, the direction of travel). */
  tx: number;
  tz: number;
  /** Half its width. */
  half: number;
};

export type Course = {
  gates: Gate[];
  /** The middle of the course, as a closed loop (first point not repeated), in the direction of travel. */
  line: Vec2[];
  length: number;
  /** Where a race starts, and which way the boat faces (yaw: 0 faces +z, south). */
  start: { x: number; z: number; yaw: number };
  /** The course's radius at a bearing (atan2(z, x)): the middle of the ring. */
  radius(theta: number): number;
  /** A short fingerprint, so a ghost saved for one course isn't replayed on another. */
  sig: string;
};

const wrap = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

/** Build the course round the island, starting off the boat's mooring. */
export function raceCourse(geo: Pick<Geo, 'coastRadius'>, boat: Pick<Activity, 'at'>): Course {
  // The ring: the coast's furthest reach nearby (so headlands are given room),
  // pushed out past the swimming water, then smoothed into an easy curve.
  const coast = Array.from({ length: N }, (_, k) => geo.coastRadius((k / N) * TAU));
  const span = Math.round(N * 0.07);
  let r = coast.map((_, k) => {
    let m = 0;
    for (let d = -span; d <= span; d++) m = Math.max(m, coast[(k + d + N) % N]);
    return m + SWIM_REACH + COURSE_OUT;
  });
  for (let pass = 0; pass < 4; pass++) {
    const w = 8;
    r = r.map((_, k) => {
      let s = 0;
      for (let d = -w; d <= w; d++) s += r[(k + d + N) % N];
      return s / (2 * w + 1);
    });
  }
  const radius = (theta: number) => {
    const f = ((((theta / TAU) % 1) + 1) % 1) * N;
    const k = Math.floor(f);
    const t = f - k;
    return r[k % N] * (1 - t) + r[(k + 1) % N] * t;
  };

  // Walk round it from the mooring's bearing, with theta rising (south → west → north → east).
  const theta0 = Math.atan2(boat.at.z, boat.at.x);
  const at = (theta: number): Vec2 => {
    const rr = radius(theta);
    return { x: Math.cos(theta) * rr, z: Math.sin(theta) * rr };
  };
  const line: Vec2[] = [];
  const along: number[] = [];
  let length = 0;
  for (let k = 0; k < N; k++) {
    const p = at(theta0 + (k / N) * TAU);
    if (k) length += Math.hypot(p.x - line[k - 1].x, p.z - line[k - 1].z);
    along.push(length);
    line.push(p);
  }
  length += Math.hypot(line[0].x - line[N - 1].x, line[0].z - line[N - 1].z);

  /** The point and the direction of travel at a distance along the course. */
  const sample = (s: number) => {
    s = ((s % length) + length) % length;
    let k = 0;
    while (k < N - 1 && along[k + 1] <= s) k++;
    const a = line[k];
    const b = line[(k + 1) % N];
    const seg = (k + 1 < N ? along[k + 1] : length) - along[k];
    const t = seg > 0 ? (s - along[k]) / seg : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx * t, z: a.z + dz * t, tx: dx / d, tz: dz / d };
  };

  const gates: Gate[] = [];
  for (let i = 0; i < GATES; i++) {
    const p = sample((i / GATES) * length);
    // Out from the island is to the left of the direction of travel (it runs clockwise on the map).
    const ox = p.tz;
    const oz = -p.tx;
    const weave = i === 0 ? 0 : i % 2 ? WEAVE : -WEAVE;
    gates.push({ i, x: p.x + ox * weave, z: p.z + oz * weave, tx: p.tx, tz: p.tz, half: GATE_HALF });
  }
  const s0 = sample(-START_BACK);
  const start = { x: s0.x, z: s0.z, yaw: Math.atan2(s0.tx, s0.tz) };
  const sig = `${GATES}:${gates.map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`).join(';')}`;
  return { gates, line, length, start, radius, sig };
}

/**
 * Did a boat moving from a to b go through this gate? 1 if forwards, -1 if
 * backwards, 0 if it missed it (went round a post, or didn't reach it).
 */
export function crossed(g: Gate, ax: number, az: number, bx: number, bz: number): 1 | -1 | 0 {
  const sa = (ax - g.x) * g.tx + (az - g.z) * g.tz;
  const sb = (bx - g.x) * g.tx + (bz - g.z) * g.tz;
  if ((sa < 0) === (sb < 0) || sa === sb) return 0;
  const t = sa / (sa - sb);
  const px = ax + (bx - ax) * t;
  const pz = az + (bz - az) * t;
  // Across the gate: perpendicular to the way through.
  const across = (px - g.x) * -g.tz + (pz - g.z) * g.tx;
  if (Math.abs(across) > g.half) return 0;
  return sb >= 0 ? 1 : -1;
}

export type LapEvent =
  | { type: 'gate'; gate: number; /** How many of the lap's gates are done (the finish is the last). */ done: number; time: number }
  | { type: 'finish'; time: number; splits: number[] };

/**
 * One lap: through gates 1, 2, … in order, then back through the start line.
 * Only the next gate counts; miss one and you have to go back for it.
 */
export class Lap {
  /** The gate to go through next (0, the finish, comes last). */
  next = 1;
  /** Seconds since the start, at each gate passed (the finish last). */
  readonly splits: number[] = [];
  done = false;
  constructor(readonly course: Pick<Course, 'gates'>) {}

  get total() {
    return this.course.gates.length;
  }

  /** The boat moved from a to b, arriving `time` seconds into the lap. */
  step(ax: number, az: number, bx: number, bz: number, time: number): LapEvent | null {
    if (this.done) return null;
    const g = this.course.gates[this.next];
    if (crossed(g, ax, az, bx, bz) !== 1) return null;
    this.splits.push(time);
    if (this.next === 0) {
      this.done = true;
      return { type: 'finish', time, splits: [...this.splits] };
    }
    this.next = (this.next + 1) % this.course.gates.length;
    return { type: 'gate', gate: g.i, done: this.splits.length, time };
  }
}

// ---------- Ghosts ----------

/** A lap as it was driven: the boat's place every `dt` seconds, for a ghost to replay. */
export type Ghost = { v: 1; sig: string; time: number; dt: number; splits: number[]; x: number[]; z: number[]; yaw: number[] };

export const GHOST_DT = 0.1;

/** Where a ghost is `t` seconds into its lap (null once it has finished). */
export function ghostAt(g: Ghost, t: number): { x: number; z: number; yaw: number } | null {
  const n = g.x.length;
  if (!n || t < 0 || t > g.time) return null;
  const f = Math.min(t / g.dt, n - 1);
  const k = Math.min(Math.floor(f), n - 1);
  const k1 = Math.min(k + 1, n - 1);
  const u = f - k;
  return {
    x: g.x[k] + (g.x[k1] - g.x[k]) * u,
    z: g.z[k] + (g.z[k1] - g.z[k]) * u,
    yaw: g.yaw[k] + wrap(g.yaw[k1] - g.yaw[k]) * u,
  };
}

/** A ghost read back from storage, if it is whole and was driven on this course. */
export function readGhost(raw: unknown, sig: string): Ghost | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Partial<Ghost>;
  const nums = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
  if (g.v !== 1 || g.sig !== sig || !nums(g.x) || !nums(g.z) || !nums(g.yaw) || !nums(g.splits)) return null;
  if (typeof g.time !== 'number' || !(g.time > 0) || typeof g.dt !== 'number' || !(g.dt > 0)) return null;
  if (g.x.length !== g.z.length || g.x.length !== g.yaw.length || g.x.length < 2) return null;
  return g as Ghost;
}

// ---------- Words ----------

/** A lap time as a stopwatch shows it: 42.07 → "0:42.07". */
export function formatLap(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** A gap to the best, signed: -0.42 → "-0.42", 1.3 → "+1.30". */
export function formatGap(seconds: number) {
  const v = Math.round(seconds * 100) / 100;
  return `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(2)}`;
}
