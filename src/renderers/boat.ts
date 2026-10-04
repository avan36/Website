// The speedboat at the end of the pier, as every view sees it: one more
// activity in the world, with a race round the island that the 3D view runs
// in full. The map and the text adventure can send you there, straight into
// the boat: they leave a note in sessionStorage and switch to the island,
// which reads it once, as it starts.

import type { Activity, World } from '../world/schema';

/** The boat, if this world has one. */
export const boatOf = (world: World): Activity | null => world.activities.find((a) => a.kind === 'boat') ?? null;

const WISH = 'island:boat';

/** Ask the 3D island to start you in the boat, next time it opens. */
export function wishForBoat() {
  try {
    sessionStorage.setItem(WISH, '1');
  } catch {
    /* storage blocked: you'll start on the pier instead */
  }
}

/** Read (and forget) that wish. */
export function takeBoatWish() {
  try {
    const on = sessionStorage.getItem(WISH) === '1';
    sessionStorage.removeItem(WISH);
    return on;
  } catch {
    return false;
  }
}
