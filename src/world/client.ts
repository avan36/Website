// The browser's copy of the world. Pages that need it embed it once as JSON
// (see WorldData.astro); renderers read it from here instead of importing
// the source, so what they draw is exactly what /world.json publishes.

import type { World } from './schema';
import { createGeo, type Geo } from './geo';

let world: World | null = null;
let geo: Geo | null = null;

export function readWorld(): World {
  if (world) return world;
  const el = document.getElementById('world-data');
  if (!el?.textContent) throw new Error('No world on this page: add <WorldData /> to it.');
  world = JSON.parse(el.textContent) as World;
  return world;
}

/** The shared geometry for this page's world, built once. */
export function readGeo(): Geo {
  return (geo ??= createGeo(readWorld()));
}
