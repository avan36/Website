// Wesleyan in world units: the map data from wesleyan.ts turned into the
// course, its gates, the streets and the solid footprints the car bumps into.
// The scene, the race and the tests all start here.

import { buildings, course as coursePts, gates as gateList, ROAD_HALF, SCALE, streets, toWorld, BOUNDS } from './wesleyan';
import { Course, distanceToLine, placeGates, type Box, type Vec } from './track';

export const roadHalf = ROAD_HALF * SCALE;
export const course = new Course(coursePts.map(toWorld));
export const gates = placeGates(
  course,
  gateList.map((g) => ({ at: toWorld(g.at), name: g.name, landmark: g.landmark })),
);
export const streetLines: Vec[][] = streets.map((s) => s.pts.map(toWorld));
export const boxes: Box[] = buildings.map((b) => {
  const c = toWorld(b.at);
  return { x: c.x, z: c.z, hw: (b.w / 2) * SCALE, hd: (b.d / 2) * SCALE, angle: (b.turn * Math.PI) / 180 };
});
const lo = toWorld([BOUNDS.x0, BOUNDS.y0]);
const hi = toWorld([BOUNDS.x1, BOUNDS.y1]);
export const bounds = { x0: lo.x, z0: lo.z, x1: hi.x, z1: hi.z };

/** Is this point on a street? */
export function onRoad(p: Vec): boolean {
  for (const line of streetLines) if (distanceToLine(p, line) <= roadHalf) return true;
  return false;
}
