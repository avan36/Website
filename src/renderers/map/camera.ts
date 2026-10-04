// How big the map's pixels are, and where the camera may look. Pure, so the
// rules are tested without a screen.

import { BOX_SIDE, boxDocksRight } from '../room';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Device pixels per map pixel. Always a whole number so every map pixel is
 * the same crisp square. Phones get big chunky pixels (about 130 across the
 * short side, like a Game Boy); a desktop sees most of the island at once
 * (about 330 map pixels, 40 world units, top to bottom).
 */
export function pickScale(cssW: number, cssH: number, dpr: number) {
  const short = Math.max(1, Math.min(cssW, cssH));
  const t = clamp((short - 420) / (900 - 420), 0, 1);
  const across = 132 + t * (330 - 132);
  return Math.max(1, Math.round((short / across) * dpr));
}

/**
 * Keep a view of half-size `half` inside [lo, hi] along one axis. A view
 * bigger than the range is centred on it.
 */
export function clampAxis(c: number, half: number, lo: number, hi: number) {
  if (hi - lo <= half * 2) return (lo + hi) / 2;
  return clamp(c, lo + half, hi - half);
}

/** Frame-rate independent easing toward a target (rate per second). */
export const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);

/** Slow, quick, slow: for the camera's moves in and out of a building. */
export const ease = (k: number) => {
  const t = clamp(k, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

// ---------- Inside a building ----------

/** What the camera sees: `z` device pixels to a map pixel, and the view's top-left (l, t) in map pixels. */
export type View = { z: number; l: number; t: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** CSS pixels kept clear of the HUD and the room's bar along the top, and along the bottom. */
const ROOM_TOP = 132;
const ROOM_BOTTOM = 20;
const ROOM_SIDE = 12;

/**
 * Where an open room can go on screen, in device pixels: under the HUD and
 * the room's bar, and clear of the conversation box, which docks right on a
 * wide screen and is a sheet up to 46% of the height along the bottom of a
 * narrow one (see room.ts).
 */
export function roomArea(cssW: number, cssH: number, dpr: number): Rect {
  const side = boxDocksRight(cssW, cssH);
  const under = side ? ROOM_BOTTOM : Math.max(ROOM_BOTTOM, cssH * 0.46 + 8);
  const w = cssW - (side ? BOX_SIDE : 0) - ROOM_SIDE * 2;
  const h = cssH - ROOM_TOP - under;
  return { x: ROOM_SIDE * dpr, y: ROOM_TOP * dpr, w: Math.max(1, w) * dpr, h: Math.max(1, h) * dpr };
}

/** The view, at zoom z, that puts the middle of a rect of the map (map pixels) in the middle of an area of the screen (device pixels). */
export function frameOn(r: Rect, area: Rect, z: number): View {
  return { z, l: r.x + r.w / 2 - (area.x + area.w / 2) / z, t: r.y + r.h / 2 - (area.y + area.h / 2) / z };
}

/**
 * Part way (e from 0 to 1) from one view to another. The zoom changes by the
 * same factor every step, and the anchor (a point on the map) slides in a
 * straight line across the screen, so the camera neither swoops nor drifts.
 */
export function between(a: View, b: View, ax: number, ay: number, e: number): View {
  if (e <= 0) return a;
  if (e >= 1) return b;
  const z = a.z * (b.z / a.z) ** e;
  const sx = (ax - a.l) * a.z + ((ax - b.l) * b.z - (ax - a.l) * a.z) * e;
  const sy = (ay - a.t) * a.z + ((ay - b.t) * b.z - (ay - a.t) * a.z) * e;
  return { z, l: ax - sx / z, t: ay - sy / z };
}
