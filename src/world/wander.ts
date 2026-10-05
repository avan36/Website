// Where someone out walking is at a given moment. Each person walks a loop of
// waypoints (`walk` in world.ts): they stop at a waypoint for `pause` seconds,
// looking the way they came and then turning to the next leg, and walk it at
// `pace` units a second. That's all a pure function of the time, so the 3D
// island, the map and the text adventure put everyone in the same place, and
// switching views mid-stroll finds them where you left them.
//
// Everyone starts somewhere different round their loop: the offset comes from
// their id, so it never changes between visits.

import type { Vec2 } from './geo';

export type Walk = { id: string; walk: Vec2[]; pace: number; pause: number };

/** Where someone is, which way they're facing (0 = south, π/2 = east, like a place's `faces`), and whether they're walking. */
export type Stride = { x: number; z: number; heading: number; moving: boolean; leg: number };

const TAU = Math.PI * 2;

/** The heading from a to b, as a place's `faces` would say it. */
export const headingOf = (a: Vec2, b: Vec2) => Math.atan2(b.x - a.x, b.z - a.z);

/** b - a, the short way round, in -π..π. */
export const turnBetween = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** A steady number in 0..1 from an id (FNV-1a), for where round the loop someone starts. */
export function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** A loop worked out once: its legs, and how long a lap takes. */
export function walker(w: Walk) {
  const n = w.walk.length;
  const legs = w.walk.map((a, i) => {
    const b = w.walk[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { a, b, len, heading: headingOf(a, b), time: w.pause + len / w.pace };
  });
  const period = legs.reduce((s, l) => s + l.time, 0) || 1;
  const offset = seedOf(w.id) * period;

  /** Where they are `t` seconds in (any t, it wraps round the lap). */
  function at(t: number): Stride {
    let u = (((t + offset) % period) + period) % period;
    for (let i = 0; i < n; i++) {
      const leg = legs[i];
      if (u >= leg.time && i < n - 1) {
        u -= leg.time;
        continue;
      }
      if (u < w.pause) {
        // Stopped at the waypoint: facing the way they came for a moment, then turning to go on.
        const from = legs[(i - 1 + n) % n].heading;
        const k = ease(Math.min(1, Math.max(0, (u / Math.max(w.pause, 1e-6) - 0.45) / 0.5)));
        return { x: leg.a.x, z: leg.a.z, heading: from + turnBetween(from, leg.heading) * k, moving: false, leg: i };
      }
      const s = Math.min(1, ((u - w.pause) * w.pace) / (leg.len || 1));
      return { x: leg.a.x + (leg.b.x - leg.a.x) * s, z: leg.a.z + (leg.b.z - leg.a.z) * s, heading: leg.heading, moving: leg.len > 0, leg: i };
    }
    const last = legs[n - 1];
    return { x: last.b.x, z: last.b.z, heading: last.heading, moving: false, leg: n - 1 };
  }

  return { period, legs, at };
}

/** The island clock for walks: seconds since 1970, so every view agrees. */
export const walkClock = (now = Date.now()) => now / 1000;
