// The commuter train's timetable and driving, shared by every view that shows
// it. Pure: it reads the railway from geo.ts and is told each frame how much
// time passed, whether it's in service (src/world/clock.ts: all day, resting
// only in the small hours) and where the explorer is. While the train runs it
// laps the loop, stopping at the platform for a few seconds each time round;
// otherwise it comes round to the platform and waits there. It brakes for
// anyone standing on the line ahead. Every car sits on the track: its bogies
// are two points on the loop and it faces from the back one to the front one,
// so the cars bend round the curves one after another.

import type { Geo } from './geo';

export const CAR_LEN = 3.3;
export const CAR_GAP = 0.25;
/** Cars, front to back: a locomotive, a two-deck coach and a cab car. */
export const CARS = ['loco', 'coach', 'cab'] as const;
export type CarKind = (typeof CARS)[number];

/** Cruising speed in world units a second, and how hard it pulls away and brakes. */
const CRUISE = 3.4;
const ACCEL = 1.1;
const BRAKE = 1.6;
/** How long it waits at the platform on each lap while running, in seconds. */
const DWELL = 6;

export function createTrain(geo: Geo) {
  const rail = geo.rail;
  const stationS = geo.station?.s ?? 0;
  const length = rail?.length ?? 1;
  const trainLen = CARS.length * CAR_LEN + (CARS.length - 1) * CAR_GAP;
  const wrap = (v: number) => ((v % length) + length) % length;
  /** Distance along the loop from a to b, going forward. */
  const ahead = (a: number, b: number) => wrap(b - a);

  // The middle of the train, along the loop. A hair past the platform reads as standing at it.
  let s = stationS + 0.001;
  let v = 0;
  let dwell = 0;

  const atPlatform = () => {
    const d = ahead(s, stationS);
    return d < 0.15 || d > length - 0.15;
  };

  return {
    /** False when the island has no railway (nothing to draw or drive). */
    exists: !!rail,
    update(dt: number, running: boolean, player: { x: number; z: number } | null) {
      if (!rail || dt <= 0) return;
      let blocked = false;
      if (player) {
        const front = s + trainLen / 2;
        for (let k = 0.2; k < 4.5; k += 0.5) {
          const p = rail.at(front + k);
          if (Math.hypot(player.x - p.x, player.z - p.z) < 1.15) {
            blocked = true;
            break;
          }
        }
      }
      const toStop = ahead(s, stationS);
      let target = 0;
      if (dwell > 0) dwell -= dt;
      else {
        // The fastest it can go and still stop at the platform: v² = 2·a·d.
        const brakeTo = Math.sqrt(2 * BRAKE * toStop);
        if (running) target = Math.min(CRUISE, brakeTo);
        else if (!atPlatform()) target = Math.min(CRUISE * 0.7, brakeTo); // come in and wait
      }
      if (blocked) target = 0;
      v = target > v ? Math.min(target, v + ACCEL * dt) : Math.max(target, v - BRAKE * 1.4 * dt);
      const step = v * dt;
      if (v > 0 && step >= toStop && toStop < 1) {
        s = stationS + 0.001; // arrived
        v = 0;
        if (running) dwell = DWELL;
      } else s = wrap(s + step);
    },
    /** Each car, front to back: its middle, which way it faces (0 = south, π/2 = east), and its bogies. */
    cars() {
      if (!rail) return [];
      return CARS.map((kind, i) => {
        const mid = s + trainLen / 2 - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2;
        const f = rail.at(mid + CAR_LEN * 0.32);
        const b = rail.at(mid - CAR_LEN * 0.32);
        return { kind, x: (f.x + b.x) / 2, z: (f.z + b.z) / 2, yaw: Math.atan2(f.x - b.x, f.z - b.z) };
      });
    },
    state: () => ({ s, v, dwell: Math.max(0, dwell), atStation: atPlatform() }),
  };
}

export type Train = ReturnType<typeof createTrain>;
