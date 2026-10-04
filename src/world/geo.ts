// The island's geometry, worked out from a World: coastline, height, paths,
// doors, and what's walkable. Pure math with no rendering in it, so the 3D
// island, the 2D map and the tests all agree about where the ground is.

import type { Place, World } from './schema';
import { fbm, noise2 } from './noise';

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

export type Vec2 = { x: number; z: number };
export type Segment = { ax: number; az: number; bx: number; bz: number };

/** How far from a place's footprint you stand at its door. */
const DOOR_GAP = 1.4;
/** Every place's level clearing blends into the land over this distance. */
const PAD_BLEND = 3;

export type Geo = ReturnType<typeof createGeo>;

export function createGeo(world: World) {
  const g = world.geography;
  const byId = new Map(world.places.map((p) => [p.id, p]));
  const hub = world.places.find((p) => p.kind === 'hub')!;

  const headlands = g.headlands.map((h) => {
    const p = byId.get(h.toward)!;
    return { theta: Math.atan2(p.at.z, p.at.x), ...h };
  });
  const hills = g.hills.map((h) => ({ ...byId.get(h.at)!.at, height: h.height, spread: h.spread }));

  function coastRadius(theta: number) {
    let r = g.coast.radius;
    for (const w of g.coast.ripples) r += w.amp * Math.sin(w.freq * theta + w.phase);
    for (const h of headlands) {
      const d = wrapAngle(theta - h.theta);
      r += h.reach * Math.exp(-(d * d) / (2 * h.spread * h.spread));
    }
    return r;
  }

  /** 0..1, how much of a rocky headland we're on. */
  function rockiness(x: number, z: number) {
    const dist = Math.hypot(x, z);
    let best = 0;
    for (const h of headlands) {
      const d = wrapAngle(Math.atan2(z, x) - h.theta);
      best = Math.max(best, Math.exp(-(d * d) / (2 * h.rocks * h.rocks)) * smoothstep(12, 18, dist));
    }
    return best;
  }

  function rawHeight(x: number, z: number) {
    const t = Math.hypot(x, z) / coastRadius(Math.atan2(z, x));
    const rock = rockiness(x, z);

    // Soft profile: grassy plateau, a sandy bank, a gentle beach, then the shelf.
    let h: number;
    if (t < 0.72) h = 1.3;
    else if (t < 0.86) h = lerp(1.3, 0.5, smoothstep(0.72, 0.86, t));
    else if (t < 1.0) h = lerp(0.5, -0.02, (t - 0.86) / 0.14);
    else h = -0.02 - 2.6 * smoothstep(1.0, 1.32, t) - 3.4 * smoothstep(1.32, 2.1, t);

    // A headland is a higher shelf that ends in a cliff instead of a beach.
    let hr: number;
    if (t < 0.9) hr = lerp(1.3, 2.3, smoothstep(0.55, 0.85, t));
    else hr = lerp(2.3, -2.4, smoothstep(0.9, 1.04, t));
    h = lerp(h, hr, rock);

    const land = 1 - smoothstep(0.62, 0.86, t);
    h += (fbm(x * 0.075 + 3, z * 0.075 - 2, 3, 4) - 0.5) * 1.7 * land;
    h += 0.12 * (noise2(x * 0.5, z * 0.5, 9) - 0.5) * (1 - land); // ripples in the sand
    for (const m of hills) {
      const d2 = (x - m.x) ** 2 + (z - m.z) ** 2;
      h += m.height * Math.exp(-d2 / (2 * m.spread * m.spread));
    }
    return h;
  }

  // Level ground: every place with a clearing, then the hub, which blends wider.
  const pads = world.places
    .filter((p) => p.clearing > 0 && p !== hub)
    .map((p) => ({ x: p.at.x, z: p.at.z, r: p.clearing, blend: PAD_BLEND, h: rawHeight(p.at.x, p.at.z) }));
  if (hub.clearing > 0) pads.push({ x: hub.at.x, z: hub.at.z, r: hub.clearing, blend: hub.clearing, h: rawHeight(hub.at.x, hub.at.z) });

  /** Ground height of the island (without the pier deck). */
  function heightAt(x: number, z: number) {
    let h = rawHeight(x, z);
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.blend) h = lerp(h, p.h, 1 - smoothstep(p.r, p.r + p.blend, d));
    }
    return h;
  }

  const pier = g.pier;
  const onPier = (x: number, z: number) => Math.abs(x - pier.x) < pier.width / 2 - 0.15 && z > pier.start + 0.4 && z < pier.end - 0.2;

  /** Where feet go: the land, or the pier deck. */
  function groundAt(x: number, z: number) {
    const h = heightAt(x, z);
    return onPier(x, z) ? Math.max(h, pier.deck) : h;
  }

  function isWalkable(x: number, z: number) {
    if (onPier(x, z)) return true;
    return heightAt(x, z) > 0.14 && Math.hypot(x, z) < 45;
  }

  // ---------- Places ----------

  /** Which way a place's front faces (0 = south, π/2 = east). */
  function facing(p: Place) {
    if (p.faces !== undefined) return p.faces;
    if (p === hub) return 0;
    const toHub = Math.atan2(hub.at.x - p.at.x, hub.at.z - p.at.z);
    return lerp(toHub, 0, 0.25); // nudged toward the south, where the camera usually is
  }

  /** Where you stand to go in. */
  function door(p: Place): Vec2 {
    if (p.door) return p.door;
    const yaw = facing(p);
    const d = p.footprint + DOOR_GAP;
    return { x: p.at.x + Math.sin(yaw) * d, z: p.at.z + Math.cos(yaw) * d };
  }

  /** Where a paved route meets a place: its door, or the foot of the pier. */
  function trailhead(p: Place): Vec2 {
    if (p === hub) return p.at;
    if (p.archetype === 'pier') return { x: pier.x, z: pier.start + 0.6 };
    return door(p);
  }

  // ---------- Paths ----------

  /** Paved routes as polylines: a quadratic curve from one trailhead to the other. */
  const paths: { from: string; to: string; points: Vec2[] }[] = world.routes
    .filter((r) => r.paved)
    .map((r) => {
      const a = trailhead(byId.get(r.from)!);
      const b = trailhead(byId.get(r.to)!);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const cx = (a.x + b.x) / 2 - dz * r.bend;
      const cz = (a.z + b.z) / 2 + dx * r.bend;
      const points: Vec2[] = [a];
      const n = 14;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        points.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z });
      }
      return { from: r.from, to: r.to, points };
    });

  const segments: Segment[] = paths.flatMap(({ points }) =>
    points.slice(1).map((p, i) => ({ ax: points[i].x, az: points[i].z, bx: p.x, bz: p.z })),
  );

  /** Distance to the nearest path (or the edge of the hub's paving). */
  function pathDist(x: number, z: number) {
    let best = Infinity;
    for (const s of segments) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz));
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
      if (d < best) best = d;
    }
    return Math.min(best, Math.hypot(x - hub.at.x, z - hub.at.z) - 2.6);
  }

  /** The place whose door is nearest, and how far away it is. */
  function nearestPlace(x: number, z: number) {
    let best: Place = hub;
    let bestD = Infinity;
    for (const p of world.places) {
      const d = p === hub ? Math.hypot(x - p.at.x, z - p.at.z) : Math.hypot(x - door(p).x, z - door(p).z);
      if (d < bestD) (best = p), (bestD = d);
    }
    return { place: best, distance: bestD };
  }

  /** True if a spot is clear of places, paths, the pier and the hub (for scattering props). */
  function isOpenGround(x: number, z: number, margin = 0) {
    if (pathDist(x, z) < 1.4 + margin) return false;
    for (const p of world.places) {
      if (p === hub) continue;
      const small = p.archetype === 'pier' || p.archetype === 'bottle';
      if (Math.hypot(x - p.at.x, z - p.at.z) < (small ? 2.2 : p.footprint + 2.6) + margin) return false;
      const d = door(p);
      if (Math.hypot(x - d.x, z - d.z) < 1.6 + margin) return false;
    }
    if (Math.abs(x - pier.x) < 2.2 && z > pier.start - 2) return false;
    return true;
  }

  /** Compass bearing from one point to another: 0 = north, π/2 = east. */
  const bearing = (a: Vec2, b: Vec2) => Math.atan2(b.x - a.x, -(b.z - a.z));

  return {
    hub,
    pier,
    spawn: g.spawn,
    place: (id: string) => byId.get(id),
    coastRadius,
    rockiness,
    heightAt,
    groundAt,
    isWalkable,
    facing,
    door,
    paths,
    pathDist,
    nearestPlace,
    isOpenGround,
    bearing,
  };
}

/** Eight-point compass name for a bearing (0 = north, clockwise). */
export function compass(rad: number) {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
  return names[((Math.round(rad / (Math.PI / 4)) % 8) + 8) % 8];
}
