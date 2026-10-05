// The island renderer's view of the world's geometry. The shape itself (coast,
// height, paths, doors) lives in src/world/geo.ts and is shared with every
// other renderer; this adds what only a 3D scene needs: label heights, pointer
// hit volumes and how close you must be for the "go in" prompt.

import { readGeo, readWorld } from '../../../world/client';
import type { Archetype } from '../../../world/schema';

export type PlaceKind = Exclude<Archetype, 'plaza'>;

export interface Place {
  /** Place id: a project slug, or 'blog' / 'contact' / 'workshop' / 'westfield' / 'synergy-tower'. */
  id: string;
  kind: PlaceKind;
  /** The page it opens (null for a memory or a folly, which has a room and no page). */
  href: string | null;
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
  /** Where the walls end and the roof begins, above the ground (for opening it up to show the room inside). */
  eaves: number;
  /** The level ground round it: the radius it's flat out to. */
  clearing: number;
}

/**
 * Per-archetype 3D metrics: where the label floats, how big the click target
 * is, and where the eaves are (the roof lifts off from there when the house
 * opens up; the lighthouse's whole tower does).
 */
const METRICS: Record<PlaceKind, { labelY: number; hitR: number; hitH: number; range?: number; eaves?: number }> = {
  tree: { labelY: 8.6, hitR: 4.2, hitH: 10.5 },
  cabin: { labelY: 3.5, hitR: 3.2, hitH: 4.8, eaves: 2.6 },
  schoolhouse: { labelY: 4.3, hitR: 3.0, hitH: 6.2, eaves: 2.66 },
  taproom: { labelY: 3.7, hitR: 3.2, hitH: 4.6, eaves: 2.75 },
  depot: { labelY: 3.1, hitR: 3.2, hitH: 4.0, eaves: 2.5 },
  mall: { labelY: 4.5, hitR: 3.9, hitH: 4.3, eaves: 2.45 },
  // Very tall: the label floats over the lobby, and the whole tower lifts off when you go in.
  skyscraper: { labelY: 4.2, hitR: 3.4, hitH: 20, eaves: 2.55 },
  workshop: { labelY: 4.0, hitR: 2.9, hitH: 5.0 },
  library: { labelY: 5.4, hitR: 3.2, hitH: 7.4, eaves: 2.86 },
  lighthouse: { labelY: 8.2, hitR: 2.4, hitH: 10, eaves: 0.6 },
  pier: { labelY: 2.7, hitR: 1.6, hitH: 3, range: 2.6 },
  bottle: { labelY: 1.4, hitR: 1.6, hitH: 1.6, range: 2.4 },
};

const world = readWorld();
const geo = readGeo();

export const { coastRadius, rockiness, heightAt, groundAt, isWalkable, pathDist, isOpenGround, depthAt, swimRoom, isSwimmable, islandOf, owner, nextStop, swimEdge, clearOfBridges, landing, signDist } = geo;
/** Big standing letters on the hills (FOSS HILL), each laid out, and the small flags. */
export const SIGNS = geo.signs;
export const FLAGS = geo.flags;
/** The main island (0) and the islets off it, and the footbridges out to them. */
export const ISLANDS = geo.islands;
export const BRIDGES = geo.bridges;
/** The gates across the bridges (shut until their games are passed). */
export const GATES = geo.gates;

/** The outline of all the land: every island's coast, a point every few degrees, and the end of the pier. */
export const LAND_OUTLINE = (() => {
  const pts = ISLANDS.flatMap((s) =>
    Array.from({ length: 96 }, (_, k) => {
      const th = (k / 96) * Math.PI * 2;
      const r = s.coast(th);
      return { x: s.x + Math.cos(th) * r, z: s.z + Math.sin(th) * r };
    }),
  );
  pts.push({ x: geo.pier.x, z: geo.pier.end });
  return pts;
})();

/** A circle round all the land: the middle the sun looks at. */
export const LAND = (() => {
  const pts = LAND_OUTLINE;
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { x, z, r: Math.max(...pts.map((p) => Math.hypot(p.x - x, p.z - z))) };
})();
export { SWIM_REACH } from '../../../world/geo';
export const PLAZA = geo.hub.at;
/** The hub: where you are when you're on the plaza and not at any place. */
export const HUB = { id: geo.hub.id, radius: Math.max(geo.hub.clearing, 2.5) };
export const SPAWN = geo.spawn;
export const SEA_LEVEL = 0;
export const PIER = geo.pier;

const bottle = world.places.find((p) => p.archetype === 'bottle');
export const BOTTLE = bottle ? { x: bottle.at.x, z: bottle.at.z, theta: Math.atan2(bottle.at.z, bottle.at.x) } : null;

/** On the pier's deck (or its foot), where nothing grows. */
export const onPier = (x: number, z: number) => Math.abs(x - PIER.x) < PIER.width / 2 + 0.1 && z > PIER.start - 0.3;

const colorOf = (id: string) => world.places.find((p) => p.id === id)?.color ?? '#d9461f';

/** Where each lost word lies, tinted with its place's color. */
export const WORDS = world.lostWords.map((w) => ({ id: w.id, word: w.word, place: w.place, color: colorOf(w.place), x: w.at.x, z: w.at.z }));
export type WordSpot = (typeof WORDS)[number];

/** Things to do on the island: fishing off the pier, the portal, the mini-games. */
export const ACTIVITIES = world.activities.map((a) => ({ id: a.id, kind: a.kind, game: a.game, place: a.place, name: a.name, description: a.description, x: a.at.x, z: a.at.z }));
export type ActivitySpot = (typeof ACTIVITIES)[number];

export const PLACES: Place[] = world.places
  .filter((p) => p.kind !== 'hub' && p.archetype !== 'plaza')
  .map((p) => {
    const kind = p.archetype as PlaceKind;
    const m = METRICS[kind];
    return {
      id: p.id,
      kind,
      href: p.href ?? null,
      color: p.color,
      name: p.name,
      kicker: p.title,
      blurb: p.blurb,
      x: p.at.x,
      z: p.at.z,
      yaw: geo.facing(p),
      radius: p.footprint,
      hitRadius: m.hitR,
      hitHeight: m.hitH,
      labelY: m.labelY,
      stand: geo.door(p),
      enterRange: m.range ?? p.footprint + 2.6,
      eaves: m.eaves ?? m.hitH,
      clearing: p.clearing,
    };
  });

/** The world's place, with its room if it's a building you can walk into. */
export const placeOf = (id: string) => world.places.find((p) => p.id === id) ?? null;
