// The island renderer's view of the world's geometry. The shape itself (coast,
// height, paths, doors) lives in src/world/geo.ts and is shared with every
// other renderer; this adds what only a 3D scene needs: label heights, pointer
// hit volumes and how close you must be for the "go in" prompt.

import { readGeo, readWorld } from '../../../world/client';
import type { Archetype } from '../../../world/schema';

export type PlaceKind = Exclude<Archetype, 'plaza'>;

export interface Place {
  /** Place id: a project slug, or 'blog' / 'contact'. */
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

/** Per-archetype 3D metrics: where the label floats and how big the click target is. */
const METRICS: Record<PlaceKind, { labelY: number; hitR: number; hitH: number; range?: number }> = {
  tree: { labelY: 8.6, hitR: 4.2, hitH: 10.5 },
  cabin: { labelY: 3.5, hitR: 3.2, hitH: 4.8 },
  schoolhouse: { labelY: 4.3, hitR: 3.0, hitH: 6.2 },
  taproom: { labelY: 3.7, hitR: 3.2, hitH: 4.6 },
  depot: { labelY: 3.1, hitR: 3.2, hitH: 4.0 },
  library: { labelY: 5.4, hitR: 3.2, hitH: 7.4 },
  lighthouse: { labelY: 8.2, hitR: 2.4, hitH: 10 },
  pier: { labelY: 2.7, hitR: 1.6, hitH: 3, range: 2.6 },
  bottle: { labelY: 1.4, hitR: 1.6, hitH: 1.6, range: 2.4 },
};

const world = readWorld();
const geo = readGeo();

export const { coastRadius, rockiness, heightAt, groundAt, isWalkable, pathDist, isOpenGround } = geo;
export const PLAZA = geo.hub.at;
export const SPAWN = geo.spawn;
export const SEA_LEVEL = 0;
export const PIER = geo.pier;

const bottle = world.places.find((p) => p.archetype === 'bottle');
export const BOTTLE = bottle ? { x: bottle.at.x, z: bottle.at.z, theta: Math.atan2(bottle.at.z, bottle.at.x) } : null;

export const PLACES: Place[] = world.places
  .filter((p) => p.kind !== 'hub' && p.archetype !== 'plaza')
  .map((p) => {
    const kind = p.archetype as PlaceKind;
    const m = METRICS[kind];
    return {
      id: p.id,
      kind,
      href: p.href!,
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
    };
  });
