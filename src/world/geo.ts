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
  const shores = (g.shores ?? []).map((s) => ({ theta: Math.atan2(s.toward.z, s.toward.x), reach: s.reach, spread: s.spread }));

  function coastRadius(theta: number) {
    let r = g.coast.radius;
    for (const w of g.coast.ripples) r += w.amp * Math.sin(w.freq * theta + w.phase);
    for (const h of [...headlands, ...shores]) {
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

  // Plots kept for places still to come are levelled just like a place's clearing.
  const plots = (g.plots ?? []).map((p) => ({ id: p.id, x: p.at.x, z: p.at.z, r: p.clearing }));
  for (const p of plots) pads.push({ x: p.x, z: p.z, r: p.r, blend: PAD_BLEND, h: rawHeight(p.x, p.z) });

  // ---------- The railway ----------
  const rw = g.railway;
  const rail = rw ? railLoop(rw) : null;
  const railSegs: Segment[] = rail ? rail.points.map((p, i) => { const q = rail.points[(i + 1) % rail.points.length]; return { ax: p.x, az: p.z, bx: q.x, bz: q.z }; }) : [];
  /** Distance to the railway's centre line (Infinity if there isn't one). */
  function railDist(x: number, z: number) {
    if (!rail) return Infinity;
    // Cheap reject: far outside the loop's box.
    if (Math.abs(x - rw!.center.x) > rw!.rx + 6 || Math.abs(z - rw!.center.z) > rw!.rz + 6) return 6;
    return segDist(railSegs, x, z);
  }

  // ---------- The quay ----------
  const qy = g.quay;
  const quay = qy ? { x0: Math.min(qy.x0, qy.x1), x1: Math.max(qy.x0, qy.x1), z0: Math.min(qy.z0, qy.z1), z1: Math.max(qy.z0, qy.z1), deck: qy.deck, bus: qy.bus, faces: qy.faces } : null;
  /** How far outside the quay's deck a point is (negative inside). */
  function quayDist(x: number, z: number) {
    if (!quay) return Infinity;
    const dx = Math.max(quay.x0 - x, 0, x - quay.x1);
    const dz = Math.max(quay.z0 - z, 0, z - quay.z1);
    if (dx === 0 && dz === 0) return -Math.min(x - quay.x0, quay.x1 - x, z - quay.z0, quay.z1 - z);
    return Math.hypot(dx, dz);
  }

  /** Ground height of the island (without the pier deck). */
  function heightAt(x: number, z: number) {
    let h = rawHeight(x, z);
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.blend) h = lerp(h, p.h, 1 - smoothstep(p.r, p.r + p.blend, d));
    }
    // The railway runs on a level bed that eases into the land either side.
    if (rail) {
      const d = railDist(x, z);
      if (d < RAIL_BED + RAIL_BLEND) h = lerp(h, rw!.bed, 1 - smoothstep(RAIL_BED, RAIL_BLEND + RAIL_BED, d));
    }
    // The quay is a stone deck with a short, steep wall down to the sea.
    if (quay) {
      const d = quayDist(x, z);
      if (d < 0.9) h = lerp(h, quay.deck, 1 - smoothstep(0, 0.9, d));
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
    if (railDist(x, z) < 1.6 + margin) return false;
    if (quayDist(x, z) < 0.8 + margin) return false;
    // A plot keeps a little more than its clearing free, so no canopy hangs over it.
    for (const p of plots) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.2 + margin) return false;
    if (station && Math.hypot(x - station.x, z - station.z) < 3.2 + margin) return false;
    return true;
  }

  // ---------- Level crossings and the station ----------
  /** Where a paved path crosses the railway, and which way the path runs there. */
  const crossings: { x: number; z: number; along: number }[] = [];
  for (const s of segments) {
    for (const r of railSegs) {
      const hit = intersect(s, r);
      if (hit && !crossings.some((c) => Math.hypot(c.x - hit.x, c.z - hit.z) < 2)) crossings.push({ ...hit, along: Math.atan2(s.bx - s.ax, s.bz - s.az) });
    }
  }
  /** The station platform: beside the track, on the outside of the loop. */
  const station = rail && rw ? (() => {
    const p = rail.at(rw.station * rail.length);
    const ox = p.x + Math.cos(p.yaw) * 2.2 * p.out;
    const oz = p.z - Math.sin(p.yaw) * 2.2 * p.out;
    return { x: ox, z: oz, yaw: p.yaw, s: rw.station * rail.length };
  })() : null;
  // The platform stands on level ground at the height of the rails.
  if (station && rw) pads.push({ x: station.x, z: station.z, r: 2.4, blend: 2, h: rw.bed });

  /** Compass bearing from one point to another: 0 = north, π/2 = east. */
  const bearing = (a: Vec2, b: Vec2) => Math.atan2(b.x - a.x, -(b.z - a.z));

  return {
    hub,
    pier,
    /** The railway loop (null if the island has none): sample it with at(s). */
    rail,
    railDist,
    crossings,
    station,
    quay,
    quayDist,
    plots,
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

/** Half-width of the railway's level bed, and how far it blends into the land. */
const RAIL_BED = 1.5;
const RAIL_BLEND = 2.2;

function segDist(segs: Segment[], x: number, z: number) {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function intersect(a: Segment, b: Segment): Vec2 | null {
  const rx = a.bx - a.ax, rz = a.bz - a.az, sx = b.bx - b.ax, sz = b.bz - b.az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.ax - a.ax) * sz - (b.az - a.az) * sx) / den;
  const u = ((b.ax - a.ax) * rz - (b.az - a.az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.ax + rx * t, z: a.az + rz * t } : null;
}

type RailSpec = { center: Vec2; rx: number; rz: number; square: number };

/**
 * A railway loop as a closed polyline, evenly spaced, plus at(s): the point
 * s units along it (wrapping), the way it heads there (yaw: 0 = south, π/2 =
 * east, like a place's `faces`) and which side is outside the loop (out: ±1
 * along the yaw's right-hand normal). It runs clockwise seen from above.
 */
export function railLoop(r: RailSpec) {
  const N = 240;
  const e = 2 / r.square;
  const raw: Vec2[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU; // clockwise from above: +x then +z (south)
    const c = Math.cos(a);
    const s = Math.sin(a);
    raw.push({ x: r.center.x + r.rx * Math.sign(c) * Math.abs(c) ** e, z: r.center.z + r.rz * Math.sign(s) * Math.abs(s) ** e });
  }
  // Respace evenly by arc length so a train moves at a steady speed.
  const cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(raw[i % N].x - raw[i - 1].x, raw[i % N].z - raw[i - 1].z));
  const length = cum[N];
  const sample = (s: number): Vec2 => {
    s = ((s % length) + length) % length;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    const a = raw[lo], b = raw[(lo + 1) % N];
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
  };
  const M = 160;
  const points = Array.from({ length: M }, (_, i) => sample((i / M) * length));
  return {
    points,
    length,
    at(s: number) {
      const p = sample(s);
      const q = sample(s + 0.35);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z);
      // Heading clockwise, the right-hand side (x: cos, z: -sin of yaw) points out of the loop.
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const out = (p.x - r.center.x) * rx + (p.z - r.center.z) * rz > 0 ? 1 : -1;
      return { x: p.x, z: p.z, yaw, out };
    },
  };
}

/** Eight-point compass name for a bearing (0 = north, clockwise). */
export function compass(rad: number) {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
  return names[((Math.round(rad / (Math.PI / 4)) % 8) + 8) % 8];
}
