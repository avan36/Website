// Where things stand on the map. The world gives each place a centre, a
// footprint and a door; the map draws every landmark facing south (the way
// old overworlds drew towns), so it works out where each one's front wall
// stands, where its drawn door is, a short spur of path from the shared door
// (where the island's path ends) round to the drawn one, and what you can't
// walk through. Then it scatters the scenery: palms on the sand, groves of
// trees on the grass, rocks on the headland, all from a fixed seed.

import type { Geo, Vec2 } from '../../world/geo';
import { fbm } from '../../world/noise';
import type { Place, World } from '../../world/schema';
import { mulberry32 } from './rng';

/** How far the explorer's body reaches from its feet, for collisions. */
export const BODY_R = 0.32;

export type LandmarkKind = 'cabin' | 'taproom' | 'tree' | 'library' | 'lighthouse' | 'schoolhouse' | 'depot' | 'postbox' | 'bottle';

/** Half the width of each landmark's front wall, in world units. */
export const HALF_WIDTH: Record<LandmarkKind, number> = {
  cabin: 2.9,
  taproom: 3.0,
  tree: 1.8,
  library: 3.2,
  lighthouse: 1.1,
  schoolhouse: 2.8,
  depot: 3.1,
  postbox: 0.5,
  bottle: 0.6,
};

export type Circle = { x: number; z: number; r: number };
export type Box = { x0: number; z0: number; x1: number; z1: number };

export interface MapPlace {
  place: Place;
  kind: LandmarkKind;
  /** Bottom centre of the landmark: where it meets the ground, and its sort key. */
  base: Vec2;
  /** Where the door is drawn along the front, in world units from the centre. */
  doorDx: number;
  /** Where you stand to go in, on this map. */
  door: Vec2;
  /** Where the shared world says the door is (the island's paths end there). */
  worldDoor: Vec2;
  /** A short path from the world door round to this map's door (empty if they're close). */
  spur: Vec2[];
  circles: Circle[];
  boxes: Box[];
}

const BUILDINGS = new Set<LandmarkKind>(['cabin', 'taproom', 'library', 'schoolhouse', 'depot', 'lighthouse']);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function layoutPlaces(world: World, geo: Geo): MapPlace[] {
  const out: MapPlace[] = [];
  for (const place of world.places) {
    if (place.kind === 'hub') continue;
    const kind: LandmarkKind = place.archetype === 'pier' ? 'postbox' : (place.archetype as LandmarkKind);
    const at = place.at;
    const fp = place.footprint;
    const worldDoor = geo.door(place);
    const hw = HALF_WIDTH[kind];
    let base: Vec2 = { x: at.x, z: at.z };
    let doorDx = 0;
    let door = worldDoor;
    const circles: Circle[] = [{ x: at.x, z: at.z, r: fp }];
    const boxes: Box[] = [];
    if (BUILDINGS.has(kind)) {
      // The front wall stands near the south edge of the footprint; the door
      // goes along it on the side the world's door is on.
      base = { x: at.x, z: at.z + fp * 0.85 };
      doorDx = clamp(worldDoor.x - at.x, -(hw - 1.15), hw - 1.15);
      if (kind === 'lighthouse') doorDx = 0;
      door = { x: at.x + doorDx, z: Math.max(base.z + 0.75, at.z + fp + BODY_R + 0.12) };
      boxes.push({ x0: at.x - hw, z0: base.z - 3.2, x1: at.x + hw, z1: base.z - 0.05 });
    } else if (kind === 'tree') {
      base = { x: at.x, z: at.z + 1.1 };
    }
    // A spur: down (or up) from the world door, then across to this one.
    const far = Math.hypot(door.x - worldDoor.x, door.z - worldDoor.z) > 0.8;
    const spur = far ? [worldDoor, { x: worldDoor.x, z: door.z }, door] : [];
    out.push({ place, kind, base, doorDx, door, worldDoor, spur, circles, boxes });
  }
  return out;
}

/** Distance from a point to a polyline. */
export function polylineDist(pts: Vec2[], x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = dx * dx + dz * dz;
    const t = L ? clamp(((x - a.x) * dx + (z - a.z) * dz) / L, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

// ---------- Scenery ----------

export type PropKind = 'palm' | 'tree' | 'pine' | 'bush' | 'rock' | 'boulder';

export interface Prop {
  kind: PropKind;
  variant: number;
  x: number;
  z: number;
  /** Collision radius at its foot (0: walk right past it). */
  r: number;
}

/** How far up the screen each kind of prop reaches, in world units (it hides what's behind). */
const TALL: Record<PropKind, number> = { palm: 3.6, tree: 3.1, pine: 3.4, bush: 1.1, rock: 0.7, boulder: 1.1 };
const RADIUS: Record<PropKind, number> = { palm: 0.35, tree: 0.4, pine: 0.4, bush: 0.45, rock: 0.3, boulder: 0.55 };

/**
 * Scatter scenery on open ground with a fixed seed: the same world always
 * grows the same trees. Nothing tall stands just in front of a landmark or
 * a lost word, where it would hide it.
 */
export function scatterProps(world: World, geo: Geo, places: MapPlace[], seed = 1337): Prop[] {
  const rnd = mulberry32(seed);
  const props: Prop[] = [];
  const CELL = 2.1;
  const words = world.lostWords.map((w) => w.at);
  const fishing = world.activities.map((a) => a.at);
  const spawn = geo.spawn;

  const hides = (kind: PropKind, x: number, z: number) => {
    const tall = TALL[kind];
    // Something you need to see sits a little north of this prop, within its height.
    const hidden = (p: Vec2, halfW: number) => Math.abs(x - p.x) < halfW && z - p.z > -1 && z - p.z < tall + 0.8;
    if (words.some((w) => hidden(w, 1.6) || Math.hypot(x - w.x, z - w.z) < 1.4)) return true;
    for (const m of places) {
      const hw = HALF_WIDTH[m.kind] + 1.2;
      if (hidden(m.base, hw) || hidden(m.door, 1.6)) return true;
      if (m.spur.length && polylineDist(m.spur, x, z) < 1.5) return true;
      if (Math.hypot(x - m.door.x, z - m.door.z) < 2) return true;
    }
    if (fishing.some((f) => Math.hypot(x - f.x, z - f.z) < 2.5)) return true;
    if (Math.hypot(x - geo.hub.at.x, z - geo.hub.at.z) < 5.5) return true;
    return hidden(spawn, 2) || Math.hypot(x - spawn.x, z - spawn.z) < 2.5;
  };

  for (let gz = -30; gz < 30; gz += CELL) {
    for (let gx = -30; gx < 42; gx += CELL) {
      const x = gx + rnd() * CELL;
      const z = gz + rnd() * CELL;
      const roll = rnd();
      const variant = Math.floor(rnd() * 6);
      const h = geo.heightAt(x, z);
      if (h < 0.2 || !geo.isOpenGround(x, z, 0.3)) continue;
      const rock = geo.rockiness(x, z);
      let kind: PropKind | null = null;
      if (rock > 0.45) kind = roll < 0.22 ? 'boulder' : roll < 0.42 ? 'rock' : null;
      else if (h < 0.62) kind = roll < 0.3 ? 'palm' : roll < 0.36 ? 'rock' : null;
      else {
        // Groves where the noise says so, a lone tree or bush elsewhere.
        const grove = fbm(x * 0.11 + 5, z * 0.11 - 9, 2, 77);
        if (grove > 0.56) kind = roll < 0.62 ? (h > 1.9 && roll < 0.25 ? 'pine' : 'tree') : roll < 0.8 ? 'bush' : null;
        else kind = roll < 0.07 ? 'tree' : roll < 0.15 ? 'bush' : roll < 0.17 ? 'rock' : null;
      }
      if (!kind || hides(kind, x, z)) continue;
      props.push({ kind, variant, x, z, r: RADIUS[kind] });
    }
  }
  return props;
}
