// The red bus on Little London, shared by every view that shows it. Pure: it
// reads the road and the stop from geo.ts and is told each frame how much
// time passed and where the explorer is. It drives the loop clockwise (on the
// left, as in London), eases in to the stop each time round, waits there a
// few seconds with its doors open, and pulls away again. It brakes for anyone
// standing on the road ahead, and waits until they've stepped off. Its wheels
// are two points on the road and it faces from the back pair to the front
// pair, so it leans round the bends like a real one.

import type { Geo } from './geo';

/** How long the bus is, nose to tail, and how far apart its axles are. */
export const BUS_LEN = 4.4;
export const BUS_AXLES = 2.6;
/** How wide it is (for the explorer to bump into). */
export const BUS_W = 1.35;

/** Cruising speed in world units a second, and how hard it pulls away and brakes. */
const CRUISE = 3;
const ACCEL = 1.2;
const BRAKE = 1.8;
/** How long it waits at the stop each time round, in seconds. */
export const DWELL = 5;
/** How far ahead of its nose it looks for someone in the road, and how near the middle of the road counts as in it. */
const LOOK = 3.6;
const IN_ROAD = 1.25;

export function createBus(geo: Geo) {
  const road = geo.road;
  const stopS = geo.busStop?.s ?? 0;
  const length = road?.length ?? 1;
  const wrap = (v: number) => ((v % length) + length) % length;
  /** Distance along the loop from a to b, going forward. */
  const ahead = (a: number, b: number) => wrap(b - a);

  // The middle of the bus, along the road. It starts at the stop, partway through its wait.
  let s = stopS + 0.001;
  let v = 0;
  let dwell = DWELL / 2;
  let held = false;

  const atStop = () => {
    const d = ahead(s, stopS);
    return d < 0.15 || d > length - 0.15;
  };

  /** Is anyone in the road just ahead of the nose? */
  function blockedBy(who: { x: number; z: number }) {
    if (!road) return false;
    const nose = s + BUS_LEN / 2;
    for (let k = 0; k <= LOOK; k += 0.4) {
      const p = road.at(nose + k);
      if (Math.hypot(who.x - p.x, who.z - p.z) < IN_ROAD) return true;
    }
    return false;
  }

  return {
    /** False when there's no road (nothing to draw or drive). */
    exists: !!road,
    /** The length of the loop, for anyone working out a lap. */
    length,
    update(dt: number, player: { x: number; z: number } | null) {
      if (!road || dt <= 0) return;
      held = !!player && blockedBy(player);
      const toStop = ahead(s, stopS);
      let target = 0;
      if (dwell > 0) dwell -= dt;
      else {
        // The fastest it can go and still stop at the stop: v² = 2·a·d.
        // (And a slow creep for the last little bit, so it always gets there.)
        target = Math.min(CRUISE, Math.max(0.4, Math.sqrt(2 * BRAKE * toStop)));
      }
      if (held) target = 0;
      v = target > v ? Math.min(target, v + ACCEL * dt) : Math.max(target, v - BRAKE * 1.5 * dt);
      const step = v * dt;
      if (v > 0 && step >= toStop && toStop < 1) {
        s = stopS + 0.001; // arrived
        v = 0;
        dwell = DWELL;
      } else s = wrap(s + step);
    },
    /** Where it is: its middle, which way it faces (0 = south, π/2 = east), and its front and back axles. Null without a road. */
    pose() {
      if (!road) return null;
      const f = road.at(s + BUS_AXLES / 2);
      const b = road.at(s - BUS_AXLES / 2);
      return { x: (f.x + b.x) / 2, z: (f.z + b.z) / 2, yaw: Math.atan2(f.x - b.x, f.z - b.z), front: { x: f.x, z: f.z }, back: { x: b.x, z: b.z } };
    },
    /** Its body as three circles down its length, for the explorer to bump into. */
    body() {
      const p = this.pose();
      if (!p) return [];
      const ux = Math.sin(p.yaw);
      const uz = Math.cos(p.yaw);
      return [-1.45, 0, 1.45].map((t) => ({ x: p.x + ux * t, z: p.z + uz * t, r: BUS_W / 2 + 0.05 }));
    },
    state: () => ({ s, v, dwell: Math.max(0, dwell), atStop: atStop(), held }),
  };
}

export type Bus = ReturnType<typeof createBus>;
