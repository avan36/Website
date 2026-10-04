// The island's geometry, worked out from a World: coastline, height, paths,
// doors, and what's walkable. Pure math with no rendering in it, so the 3D
// island, the 2D map and the tests all agree about where the ground is.
//
// There is the main island, round the origin, and a few islets off its coast,
// each with a coast of its own; footbridges join them. Height is whichever
// island's ground is highest at a point, so their beaches and shelves run
// into one sea, and the swimming water is everywhere near enough to any shore.

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
/** How far past the shore anyone can swim, in world units. */
export const SWIM_REACH = 8;
/** Ground higher than this is land you can stand on; lower, it's the sea. */
const DRY = 0.14;
/** Where you step on and off a bridge: this far past either end of its deck, on land. */
const LANDING = 0.8;

export type Geo = ReturnType<typeof createGeo>;

/** An island: the main one (index 0, round the origin) or an islet, with its coast's radius at a bearing from its middle. */
export type Island = { i: number; id: string; name: string; x: number; z: number; coast(theta: number): number; outer: number };

/** A bridge, worked out: its ends, which way it runs (u, a unit vector from `a` to `b`), and the islands it joins. */
export type Bridge = {
  i: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  ux: number;
  uz: number;
  width: number;
  deck: number;
  /** A plain footbridge, or a tower bridge (two towers in the water, walkways high between them). */
  style: 'footbridge' | 'tower';
  /** Which way it runs from `a` to `b`, like a place's `faces` (0 = south, π/2 = east). */
  yaw: number;
  /** The islands at its `a` end and its `b` end. */
  joins: [number, number];
};

/**
 * Height by how far out from an island's middle you are, as a share of its
 * coast's radius there: a grassy plateau, a sandy bank, a gentle beach, then
 * the shelf dropping away to the open sea.
 */
function shelf(t: number) {
  if (t < 0.72) return 1.3;
  if (t < 0.86) return lerp(1.3, 0.5, smoothstep(0.72, 0.86, t));
  if (t < 1.0) return lerp(0.5, -0.02, (t - 0.86) / 0.14);
  return -0.02 - 2.6 * smoothstep(1.0, 1.32, t) - 3.4 * smoothstep(1.32, 2.1, t);
}

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

  /** The main island's coast: its radius at a bearing from the origin. */
  function coastRadius(theta: number) {
    let r = g.coast.radius;
    for (const w of g.coast.ripples) r += w.amp * Math.sin(w.freq * theta + w.phase);
    for (const h of [...headlands, ...shores]) {
      const d = wrapAngle(theta - h.theta);
      r += h.reach * Math.exp(-(d * d) / (2 * h.spread * h.spread));
    }
    return r;
  }

  // ---------- Islands ----------
  const islets: Island[] = (g.islets ?? []).map((s, k) => ({
    i: k + 1,
    id: s.id,
    name: s.name,
    x: s.at.x,
    z: s.at.z,
    coast: (theta: number) => s.coast.ripples.reduce((r, w) => r + w.amp * Math.sin(w.freq * theta + w.phase), s.coast.radius),
    outer: s.coast.ripples.reduce((r, w) => r + Math.abs(w.amp), s.coast.radius),
  }));
  let mainOuter = 0;
  for (let k = 0; k < 360; k++) mainOuter = Math.max(mainOuter, coastRadius((k / 360) * TAU));
  const islands: Island[] = [{ i: 0, id: 'main', name: hub.name, x: 0, z: 0, coast: coastRadius, outer: mainOuter }, ...islets];

  /** An islet's own ground, or -Infinity well past its shelf (where the sea floor is everyone's). */
  function isletHeight(s: Island, x: number, z: number) {
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    const far = s.outer * 2.15;
    if (d2 > far * far) return -Infinity;
    const t = Math.sqrt(d2) / s.coast(Math.atan2(dz, dx));
    const land = 1 - smoothstep(0.62, 0.86, t);
    // Gentler bumps than the main island's: a small islet with big ones looks lumpy.
    return shelf(t) + (fbm(x * 0.075 + 3, z * 0.075 - 2, 3, 4) - 0.5) * 1.1 * land + 0.12 * (noise2(x * 0.5, z * 0.5, 9) - 0.5) * (1 - land);
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

  /** The main island's own ground. */
  function mainHeight(x: number, z: number) {
    const t = Math.hypot(x, z) / coastRadius(Math.atan2(z, x));
    const rock = rockiness(x, z);

    // Soft profile: grassy plateau, a sandy bank, a gentle beach, then the shelf.
    let h = shelf(t);

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

  /** Whose ground this is: the island whose own height is highest here (land or sea floor), and that height. */
  function owner(x: number, z: number) {
    let i = 0;
    let h = mainHeight(x, z);
    for (const s of islets) {
      const v = isletHeight(s, x, z);
      if (v > h) (h = v), (i = s.i);
    }
    return { i, h };
  }

  /** The ground before anything is levelled: every island's, the highest winning. */
  const rawHeight = (x: number, z: number) => (islets.length ? owner(x, z).h : mainHeight(x, z));

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

  // ---------- The bridges ----------
  const bridges: Bridge[] = (g.bridges ?? []).map((b, i) => {
    const length = Math.hypot(b.to.x - b.from.x, b.to.z - b.from.z) || 1;
    const ux = (b.to.x - b.from.x) / length;
    const uz = (b.to.z - b.from.z) / length;
    return { i, ax: b.from.x, az: b.from.z, bx: b.to.x, bz: b.to.z, length, ux, uz, width: b.width, deck: b.deck, style: b.style ?? 'footbridge', yaw: Math.atan2(ux, uz), joins: [0, 0] };
  });
  // Each end lands on a little level abutment at the height of the deck (an end on the quay has the quay's deck already).
  for (const b of bridges) for (const [x, z] of [[b.ax, b.az], [b.bx, b.bz]]) if (quayDist(x, z) > 0) pads.push({ x, z, r: 1.1, blend: 2.2, h: b.deck });
  /** Which bridge's deck (x, z) is on (-1 for none), `inset` in from its railings. */
  function deckAt(x: number, z: number, inset = 0.15) {
    for (const b of bridges) {
      const rx = x - b.ax;
      const rz = z - b.az;
      const along = rx * b.ux + rz * b.uz;
      if (along < 0 || along > b.length) continue;
      if (Math.abs(rx * b.uz - rz * b.ux) < b.width / 2 - inset) return b.i;
    }
    return -1;
  }
  /** Distance to the nearest bridge's middle line (Infinity with none). */
  const bridgeSegs: Segment[] = bridges.map((b) => ({ ax: b.ax, az: b.az, bx: b.bx, bz: b.bz }));
  const bridgeDist = (x: number, z: number) => (bridges.length ? segDist(bridgeSegs, x, z) : Infinity);
  /** Clear of every bridge, its railings and a step round its ends. */
  const clearOfBridges = (x: number, z: number, margin = 0) => bridges.every((b) => segDist([bridgeSegs[b.i]], x, z) >= b.width / 2 + 1.2 + margin);

  /** Ground height of the island (without the pier deck or the bridges). */
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

  /** Where feet go: the land, the pier deck, or a bridge's. */
  function groundAt(x: number, z: number) {
    const h = heightAt(x, z);
    if (onPier(x, z)) return Math.max(h, pier.deck);
    const k = bridges.length ? deckAt(x, z) : -1;
    return k < 0 ? h : Math.max(h, bridges[k].deck);
  }

  /**
   * How far you could still swim out from here before the current turns you
   * back: positive in the swimming water, negative in the open sea beyond.
   * Near more than one island, the one with the most room wins.
   */
  function swimRoom(x: number, z: number) {
    let room = coastRadius(Math.atan2(z, x)) + SWIM_REACH - Math.hypot(x, z);
    for (const s of islets) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (s.outer + SWIM_REACH - d <= room) continue; // can't beat it from here
      room = Math.max(room, s.coast(Math.atan2(z - s.z, x - s.x)) + SWIM_REACH - d);
    }
    return room;
  }

  function isWalkable(x: number, z: number) {
    if (onPier(x, z) || (bridges.length && deckAt(x, z) >= 0)) return true;
    return heightAt(x, z) > DRY && swimRoom(x, z) > 0;
  }

  /** How deep the sea is here (0 on land). */
  const depthAt = (x: number, z: number) => Math.max(0, -heightAt(x, z));

  /** True in the sea near enough to the shore to swim in (the land, the pier deck and the bridges are not). */
  const isSwimmable = (x: number, z: number) => !isWalkable(x, z) && swimRoom(x, z) > 0;

  // ---------- Which island, and getting between them ----------

  /** The island whose land (x, z) is (its index in `islands`), or null in the sea. A bridge's deck counts as neither. */
  function islandOf(x: number, z: number): number | null {
    if (heightAt(x, z) <= DRY) return null;
    return islets.length ? owner(x, z).i : 0;
  }
  // What a bridge joins is the land its ends stand on before their abutments level it (an end in the sea joins nothing: -1).
  // The quay is the main island's, though it stands out over the water.
  const landUnder = (x: number, z: number) => (quayDist(x, z) <= 0 ? 0 : rawHeight(x, z) > DRY ? owner(x, z).i : -1);
  for (const b of bridges) b.joins = [landUnder(b.ax, b.az), landUnder(b.bx, b.bz)];

  /** Where you step on at either end of a bridge (0: its `a` end, 1: its `b` end): just past the deck, on land. */
  const landing = (b: Bridge, end: 0 | 1): Vec2 =>
    end === 0 ? { x: b.ax - b.ux * LANDING, z: b.az - b.uz * LANDING } : { x: b.bx + b.ux * LANDING, z: b.bz + b.uz * LANDING };

  /** How many bridges it takes to walk from one island to another (Infinity if you can't). */
  function hops(from: number, to: number) {
    const seen = new Map([[from, 0]]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      if (at === to) return seen.get(at)!;
      for (const b of bridges) {
        const next = b.joins[0] === at ? b.joins[1] : b.joins[1] === at ? b.joins[0] : null;
        if (next !== null && next >= 0 && !seen.has(next)) (seen.set(next, seen.get(at)! + 1), queue.push(next));
      }
    }
    return Infinity;
  }

  /** The buildings (and the old tree) a walk has to go round: every place but the hub, the pier and the bottle. */
  const solids = world.places.filter((p) => p !== hub && p.archetype !== 'pier' && p.archetype !== 'bottle').map((p) => ({ x: p.at.x, z: p.at.z, r: p.footprint + 0.6 }));

  /** Heading straight from `a` to `b`: if a building's in the way, a point beside it to step round it by. */
  function around(a: Vec2, b: Vec2): Vec2 {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return b;
    let hit: { x: number; z: number; r: number; t: number; cx: number; cz: number } | null = null;
    for (const s of solids) {
      if (Math.hypot(b.x - s.x, b.z - s.z) < s.r) continue; // going right up to it (its door)
      const t = ((s.x - a.x) * dx + (s.z - a.z) * dz) / L2;
      if (t <= 0 || t >= 1) continue;
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      if (Math.hypot(cx - s.x, cz - s.z) < s.r && (!hit || t < hit.t)) hit = { ...s, t, cx, cz };
    }
    if (!hit) return b;
    // Out to whichever side the line passes, a little past the building's edge.
    let nx = hit.cx - hit.x;
    let nz = hit.cz - hit.z;
    if (Math.hypot(nx, nz) < 1e-3) (nx = -dz), (nz = dx);
    const n = Math.hypot(nx, nz);
    return { x: hit.x + (nx / n) * (hit.r + 0.9), z: hit.z + (nz / n) * (hit.r + 0.9) };
  }

  /**
   * Walking from `from` toward `to`, where to head next: straight there on the
   * same island (or to or from the water), or else over the bridges, one
   * landing at a time; and round any building in the way.
   */
  function nextStop(from: Vec2, to: Vec2): Vec2 {
    return around(from, bridgeStop(from, to));
  }

  /** The next stop on the way over the bridges (or `to` itself, on the same island). */
  function bridgeStop(from: Vec2, to: Vec2): Vec2 {
    if (!bridges.length) return to;
    const goal = islandOf(to.x, to.z);
    if (goal === null) return to;
    const on = deckAt(from.x, from.z, 0);
    if (on >= 0) {
      // On a bridge: off at whichever end is fewer bridges from where you're going.
      const b = bridges[on];
      return hops(b.joins[0], goal) <= hops(b.joins[1], goal) ? landing(b, 0) : landing(b, 1);
    }
    const at = islandOf(from.x, from.z);
    if (at === null || at === goal) return to;
    let best: { b: Bridge; end: 0 | 1; n: number } | null = null;
    for (const b of bridges) {
      for (const end of [0, 1] as const) {
        if (b.joins[end] !== at) continue;
        const n = hops(b.joins[1 - end], goal);
        const d = Math.hypot(from.x - landing(b, end).x, from.z - landing(b, end).z);
        if (n < Infinity && (!best || n < best.n || (n === best.n && d < Math.hypot(from.x - landing(best.b, best.end).x, from.z - landing(best.b, best.end).z)))) best = { b, end, n };
      }
    }
    if (!best) return to;
    const near = landing(best.b, best.end);
    // At its landing already: over you go.
    return Math.hypot(from.x - near.x, from.z - near.z) < 0.9 ? landing(best.b, best.end === 0 ? 1 : 0) : near;
  }

  /**
   * The furthest land from the origin along a bearing, islets and all: the
   * main island's coast, or past it the far shore of an islet in the way.
   */
  function reach(theta: number) {
    let r = coastRadius(theta);
    const cx = Math.cos(theta);
    const cz = Math.sin(theta);
    for (const s of islets) {
      const along = s.x * cx + s.z * cz;
      const off2 = s.x * s.x + s.z * s.z - along * along;
      if (along > 0 && off2 < s.outer * s.outer) r = Math.max(r, along + Math.sqrt(s.outer * s.outer - off2));
    }
    return r;
  }

  /**
   * The edge of the swimming water, pushed `out` further, as runs of points
   * about `step` apart: round each island, leaving out the stretches that fall
   * in another island's water. Each island's runs go round it clockwise on
   * the map (as bearings rise); the main island's start at the bearing
   * `from`, and its first run is the whole ring when nothing breaks it.
   */
  function swimEdge(out = 0, step = 0.5, from = 0): Vec2[][] {
    const runs: Vec2[][] = [];
    for (const s of islands) {
      const n = Math.max(48, Math.ceil((TAU * (s.outer + SWIM_REACH + out)) / step));
      const start = s.i === 0 ? from : 0;
      let run: Vec2[] = [];
      for (let k = 0; k < n; k++) {
        const th = start + (k / n) * TAU;
        const r = s.coast(th) + SWIM_REACH + out;
        const p = { x: s.x + Math.cos(th) * r, z: s.z + Math.sin(th) * r };
        if (islands.every((o) => o === s || roomOf(o, p.x, p.z) < -out)) run.push(p);
        else if (run.length) (runs.push(run), (run = []));
      }
      if (run.length) runs.push(run);
    }
    return runs;
  }
  /** One island's swimming room on its own. */
  const roomOf = (s: Island, x: number, z: number) => s.coast(Math.atan2(z - s.z, x - s.x)) + SWIM_REACH - Math.hypot(x - s.x, z - s.z);

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

  /**
   * True if a spot is clear of places, paths, the pier, the railway and the
   * bridges (for scattering props). `clearBridges: false` leaves the bridges out,
   * for a scatter that keeps its old layout and clears them afterwards.
   */
  function isOpenGround(x: number, z: number, margin = 0, clearBridges = true) {
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
    // Nothing grows on a bridge or its landings.
    if (clearBridges && !clearOfBridges(x, z, margin)) return false;
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
    /** The main island (0) and the islets off it. */
    islands,
    /** The footbridges between them, worked out. */
    bridges,
    deckAt,
    bridgeDist,
    clearOfBridges,
    islandOf,
    /** Whose ground (x, z) is, land or sea floor: the island whose own height is highest there. */
    owner: (x: number, z: number) => (islets.length ? owner(x, z).i : 0),
    landing,
    hops,
    nextStop,
    reach,
    swimEdge,
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
    depthAt,
    swimRoom,
    isSwimmable,
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
