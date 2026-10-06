// Wesleyan in world units: the map data from wesleyan.ts turned into the
// course, its gates, the streets and paths, and the solid footprints the car
// bumps into. The scene, the race and the tests all start here.

import { buildings, course as coursePts, gates as gateList, PATH_HALF, paths, ROAD_HALF, SCALE, streets, toWorld, BOUNDS } from './wesleyan';
import { Course, distanceToLine, placeGates, type Box, type Vec } from './track';

export const roadHalf = ROAD_HALF * SCALE;
export const pathHalf = PATH_HALF * SCALE;
export const course = new Course(coursePts.map(toWorld));
export const gates = placeGates(
  course,
  gateList.map((g) => ({ at: toWorld(g.at), name: g.name, landmark: g.landmark })),
);

export type Lane = { id: string; pts: Vec[]; half: number; kind: 'road' | 'path' };
/** Every drivable line: the streets, then the footpaths. */
export const lanes: Lane[] = [
  ...streets.map((s) => ({ id: s.id, pts: s.pts.map(toWorld), half: roadHalf, kind: 'road' as const })),
  ...paths.map((s) => ({ id: s.id, pts: s.pts.map(toWorld), half: pathHalf, kind: 'path' as const })),
];
export const streetLines: Vec[][] = lanes.filter((l) => l.kind === 'road').map((l) => l.pts);

export const boxes: Box[] = buildings.map((b) => {
  const c = toWorld(b.at);
  return { x: c.x, z: c.z, hw: (b.w / 2) * SCALE, hd: (b.d / 2) * SCALE, angle: (b.turn * Math.PI) / 180 };
});
const lo = toWorld([BOUNDS.x0, BOUNDS.y0]);
const hi = toWorld([BOUNDS.x1, BOUNDS.y1]);
export const bounds = { x0: lo.x, z0: lo.z, x1: hi.x, z1: hi.z };

/** Is this point on a street or a path (where the car keeps its speed)? */
export function onRoad(p: Vec): boolean {
  for (const l of lanes) if (distanceToLine(p, l.pts) <= l.half) return true;
  return false;
}

/** How far a point is from the nearest street or path's edge (negative on it). */
export function laneClearance(p: Vec): number {
  let best = Infinity;
  for (const l of lanes) best = Math.min(best, distanceToLine(p, l.pts) - l.half);
  return best;
}
