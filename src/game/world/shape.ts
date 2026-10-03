// The island's shape as pure math: coastline, height field, paths and where
// every place sits. The terrain mesh, the water shader's height map, the
// character's footing and the vegetation scatter all read from here, so
// everything agrees about where the ground is.

import { projects } from '../../data/projects';
import { fbm, noise2 } from '../util/noise';
import { clamp, lerp, smoothstep, wrapAngle } from '../util/math';

export type PlaceKind = 'cabin' | 'taproom' | 'tree' | 'lighthouse' | 'schoolhouse' | 'depot' | 'pier' | 'bottle';

export interface Place {
  /** Project slug, or 'blog' / 'contact'. */
  id: string;
  kind: PlaceKind;
  href: string;
  color: string;
  name: string;
  kicker: string;
  blurb: string;
  x: number;
  z: number;
  /** Rotation so the landmark's front faces the plaza. */
  yaw: number;
  /** Collider radius. */
  radius: number;
  /** Pointer hit volume. */
  hitRadius: number;
  hitHeight: number;
  /** Height of the floating label anchor above the ground. */
  labelY: number;
  /** Where the explorer stands to go in. */
  stand: { x: number; z: number };
  /** How close the explorer must be for the prompt to open. */
  enterRange: number;
}

export const PLAZA = { x: 0, z: 4.5 };
export const SPAWN = { x: 0, z: 7.5 };
export const SEA_LEVEL = 0;

const LIGHTHOUSE = { x: 18.5, z: -16.5 };
const THETA_L = Math.atan2(LIGHTHOUSE.z, LIGHTHOUSE.x);
const TREE = { x: -1, z: -10.5 };

export function coastRadius(theta: number) {
  let r = 23.5 + 1.4 * Math.sin(3 * theta + 0.7) + 0.9 * Math.sin(5 * theta + 2.3) + 0.45 * Math.sin(8 * theta + 1.1);
  const dl = wrapAngle(theta - THETA_L);
  r += 7.5 * Math.exp(-(dl * dl) / (2 * 0.17 * 0.17));
  return r;
}

/** 0..1, how much of the rocky headland we're on. */
export function rockiness(x: number, z: number) {
  const dl = wrapAngle(Math.atan2(z, x) - THETA_L);
  const d = Math.hypot(x, z);
  return Math.exp(-(dl * dl) / (2 * 0.24 * 0.24)) * smoothstep(12, 18, d);
}

function rawHeight(x: number, z: number) {
  const d = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const t = d / coastRadius(theta);
  const rock = rockiness(x, z);

  // Soft profile: grassy plateau, a sandy bank, a gentle beach, then the shelf.
  let h: number;
  if (t < 0.72) h = 1.3;
  else if (t < 0.86) h = lerp(1.3, 0.5, smoothstep(0.72, 0.86, t));
  else if (t < 1.0) h = lerp(0.5, -0.02, (t - 0.86) / 0.14);
  else h = -0.02 - 2.6 * smoothstep(1.0, 1.32, t) - 3.4 * smoothstep(1.32, 2.1, t);

  // The headland: a higher shelf that ends in a cliff instead of a beach.
  let hr: number;
  if (t < 0.9) hr = lerp(1.3, 2.3, smoothstep(0.55, 0.85, t));
  else hr = lerp(2.3, -2.4, smoothstep(0.9, 1.04, t));
  h = lerp(h, hr, rock);

  const land = 1 - smoothstep(0.62, 0.86, t);
  h += (fbm(x * 0.075 + 3, z * 0.075 - 2, 3, 4) - 0.5) * 1.7 * land;
  h += 0.12 * (noise2(x * 0.5, z * 0.5, 9) - 0.5) * (1 - land); // ripples in the sand
  // A gentle mound for the ancient tree.
  const dt = Math.hypot(x - TREE.x, z - TREE.z);
  h += 1.1 * Math.exp(-(dt * dt) / (2 * 5.5 * 5.5));
  return h;
}

// ---------- Places ----------

type Spot = { x: number; z: number; radius: number; pad: number; labelY: number; hitR: number; hitH: number };
const SPOTS: Record<Exclude<PlaceKind, 'pier' | 'bottle'>, Spot> = {
  tree: { ...TREE, radius: 1.7, pad: 4.5, labelY: 11.2, hitR: 4.2, hitH: 10.5 },
  cabin: { x: -13, z: -3, radius: 2.7, pad: 4.6, labelY: 5.1, hitR: 3.2, hitH: 4.8 },
  schoolhouse: { x: -11, z: 9.5, radius: 2.6, pad: 4.4, labelY: 6.6, hitR: 3.0, hitH: 6.2 },
  taproom: { x: 12.5, z: 7.5, radius: 2.7, pad: 4.6, labelY: 4.9, hitR: 3.2, hitH: 4.6 },
  depot: { x: 12, z: -5.5, radius: 2.5, pad: 4.4, labelY: 4.2, hitR: 3.2, hitH: 4.0 },
  lighthouse: { ...LIGHTHOUSE, radius: 1.7, pad: 3.2, labelY: 10.4, hitR: 2.4, hitH: 10 },
};

const padHeights = new Map<string, number>();
for (const [k, s] of Object.entries(SPOTS)) padHeights.set(k, rawHeight(s.x, s.z));
const PLAZA_H = rawHeight(PLAZA.x, PLAZA.z);

/** Ground height of the island (without the pier deck). */
export function heightAt(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const [k, s] of Object.entries(SPOTS)) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.pad + 3) {
      const w = 1 - smoothstep(s.pad, s.pad + 3, d);
      h = lerp(h, padHeights.get(k)!, w);
    }
  }
  const dp = Math.hypot(x - PLAZA.x, z - PLAZA.z);
  if (dp < 7) h = lerp(h, PLAZA_H, 1 - smoothstep(3.5, 7, dp));
  return h;
}

// Pier: runs straight out to sea from the south beach.
export const PIER = (() => {
  const x = 4;
  let z = 10;
  while (z < 40 && rawHeight(x, z) > 0.55) z += 0.1;
  const start = z - 1.6;
  const end = z + 9.5;
  return { x, start, end, width: 1.9, deck: 0.82 };
})();

export const BOTTLE = (() => {
  const theta = (127 * Math.PI) / 180;
  let r = 14;
  while (r < 40 && heightAt(Math.cos(theta) * r, Math.sin(theta) * r) > 0.2) r += 0.1;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r, theta };
})();

const onPier = (x: number, z: number) =>
  Math.abs(x - PIER.x) < PIER.width / 2 - 0.15 && z > PIER.start + 0.4 && z < PIER.end - 0.2;

/** Where the explorer's feet go. */
export function groundAt(x: number, z: number) {
  const h = heightAt(x, z);
  return onPier(x, z) ? Math.max(h, PIER.deck) : h;
}

export function isWalkable(x: number, z: number) {
  if (onPier(x, z)) return true;
  return heightAt(x, z) > 0.14 && Math.hypot(x, z) < 45;
}

const yawToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

function buildPlaces(): Place[] {
  const list: Place[] = [];
  for (const p of projects) {
    const s = SPOTS[p.landmark];
    // Face the plaza, nudged toward the camera (+z) so fronts read well.
    let yaw = yawToward(s.x, s.z, PLAZA.x, PLAZA.z);
    yaw = lerp(yaw, 0, 0.25);
    if (p.landmark === 'tree') yaw = 0.2;
    if (p.landmark === 'lighthouse') yaw = yawToward(s.x, s.z, 0, 0);
    const standD = s.radius + 1.4;
    list.push({
      id: p.slug,
      kind: p.landmark,
      href: `/work/${p.slug}`,
      color: p.hex,
      name: p.name,
      kicker: p.landmarkName,
      blurb: p.blurb,
      x: s.x,
      z: s.z,
      yaw,
      radius: s.radius,
      hitRadius: s.hitR,
      hitHeight: s.hitH,
      labelY: s.labelY,
      stand: { x: s.x + Math.sin(yaw) * standD, z: s.z + Math.cos(yaw) * standD },
      enterRange: s.radius + 2.6,
    });
  }
  const pierZ = PIER.end - 1.1;
  list.push({
    id: 'blog',
    kind: 'pier',
    href: '/blog',
    color: '#2b8fb8',
    name: 'Writing',
    kicker: 'The pier',
    blurb: 'Notes and essays, posted from the end of the pier.',
    x: PIER.x,
    z: pierZ,
    yaw: Math.PI,
    radius: 0.45,
    hitRadius: 1.6,
    hitHeight: 3,
    labelY: 3.4,
    stand: { x: PIER.x, z: pierZ - 1.5 },
    enterRange: 2.6,
  });
  list.push({
    id: 'contact',
    kind: 'bottle',
    href: '/contact',
    color: '#ff5a36',
    name: 'Contact',
    kicker: 'Message in a bottle',
    blurb: 'Say hello. I read every message.',
    x: BOTTLE.x,
    z: BOTTLE.z,
    yaw: 0.5,
    radius: 0.5,
    hitRadius: 1.6,
    hitHeight: 1.6,
    labelY: 1.9,
    stand: { x: BOTTLE.x + 1.1, z: BOTTLE.z - 0.9 },
    enterRange: 2.4,
  });
  return list;
}

export const PLACES = buildPlaces();

// ---------- Paths ----------

type Seg = { ax: number; az: number; bx: number; bz: number };
const SEGMENTS: Seg[] = (() => {
  const segs: Seg[] = [];
  const curve = (ax: number, az: number, bx: number, bz: number, bend: number) => {
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const dx = bx - ax;
    const dz = bz - az;
    const cx = mx - dz * bend;
    const cz = mz + dx * bend;
    let px = ax;
    let pz = az;
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx;
      const z = u * u * az + 2 * u * t * cz + t * t * bz;
      segs.push({ ax: px, az: pz, bx: x, bz: z });
      px = x;
      pz = z;
    }
  };
  let i = 0;
  for (const p of PLACES) {
    const tx = p.kind === 'pier' ? PIER.x : p.stand.x;
    const tz = p.kind === 'pier' ? PIER.start + 0.6 : p.stand.z;
    if (p.kind === 'bottle') continue; // the bottle is off the beaten track
    curve(PLAZA.x, PLAZA.z, tx, tz, i++ % 2 ? 0.12 : -0.12);
  }
  return segs;
})();

export function pathDist(x: number, z: number) {
  let best = Infinity;
  for (const s of SEGMENTS) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
    if (d < best) best = d;
  }
  return Math.min(best, Math.hypot(x - PLAZA.x, z - PLAZA.z) - 2.6);
}

/** True if a spot is clear of places, paths and the plaza (for scattering props). */
export function isOpenGround(x: number, z: number, margin = 0) {
  if (pathDist(x, z) < 1.4 + margin) return false;
  for (const p of PLACES) {
    const pad = p.kind === 'pier' || p.kind === 'bottle' ? 2.2 : p.radius + 2.6;
    if (Math.hypot(x - p.x, z - p.z) < pad + margin) return false;
    if (Math.hypot(x - p.stand.x, z - p.stand.z) < 1.6 + margin) return false;
  }
  if (Math.abs(x - PIER.x) < 2.2 && z > PIER.start - 2) return false;
  return true;
}
