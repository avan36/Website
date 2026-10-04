// Getting around: which way each route leaves a place, and the shortest walk
// between any two. Directions come from the coordinates, so moving a place in
// world.ts moves its exits too.
//
// Eight compass points aren't always enough (the plaza has nine paths), so
// each exit may lean to a neighbouring point when that's within LEAN of the
// truth and frees up a direction. Exits that still share a point are listed
// together, and "north-east" then asks which one you mean.

import type { Geo } from '../../world/geo';
import type { Place, World } from '../../world/schema';
import { DIRS, type Dir } from './parser';

const STEP = Math.PI / 4;
/** How far (radians) an exit may lean off its true bearing to avoid sharing. */
const LEAN = (32 * Math.PI) / 180;

export type Exit = { to: string; dir: Dir; bearing: number; paved: boolean; distance: number };
export type Leg = { from: string; to: string; dir: Dir; paved: boolean };

const wrap = (a: number) => {
  a = (a + Math.PI) % (2 * Math.PI);
  return (a < 0 ? a + 2 * Math.PI : a) - Math.PI;
};
const dirIndex = (rad: number) => ((Math.round(rad / STEP) % 8) + 8) % 8;
/** The nearest of the eight points to a bearing (the same one geo's compass() names). */
export const dirFor = (rad: number): Dir => DIRS[dirIndex(rad)];

/**
 * Pick a direction for each exit: as true as possible, sharing as little as
 * possible. Every exit may take its nearest point, or the next nearest if
 * that's within LEAN; with at most nine exits, trying every mix is instant.
 */
export function assignDirections(bearings: number[]): number[] {
  const options = bearings.map((b) => {
    const near = dirIndex(b);
    const err = (i: number) => Math.abs(wrap(b - i * STEP));
    const other = (near + (wrap(b - near * STEP) > 0 ? 1 : 7)) % 8;
    return err(other) <= LEAN ? [near, other].map((i) => ({ i, err: err(i) })) : [{ i: near, err: err(near) }];
  });
  let best: number[] = options.map((o) => o[0].i);
  let bestCost = Infinity;
  const pick: number[] = [];
  const walk = (k: number, cost: number) => {
    if (cost >= bestCost) return;
    if (k === options.length) {
      const used = new Set(pick).size;
      const total = cost + (options.length - used) * 10; // a shared point costs more than any lean
      if (total < bestCost) (bestCost = total), (best = [...pick]);
      return;
    }
    for (const o of options[k]) {
      pick.push(o.i);
      walk(k + 1, cost + o.err);
      pick.pop();
    }
  };
  walk(0, 0);
  return best;
}

export function createTravel(world: World, geo: Geo) {
  const byId = new Map(world.places.map((p) => [p.id, p]));
  const neighbours = new Map<string, { to: string; paved: boolean; distance: number }[]>(world.places.map((p) => [p.id, []]));
  for (const r of world.routes) {
    const a = byId.get(r.from)!;
    const b = byId.get(r.to)!;
    const distance = Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z);
    neighbours.get(r.from)!.push({ to: r.to, paved: r.paved, distance });
    neighbours.get(r.to)!.push({ to: r.from, paved: r.paved, distance });
  }

  const exitCache = new Map<string, Exit[]>();
  /** The ways out of a place, clockwise from north. */
  function exits(id: string): Exit[] {
    const hit = exitCache.get(id);
    if (hit) return hit;
    const from = byId.get(id)!;
    const raw = (neighbours.get(id) ?? []).map((n) => ({ ...n, bearing: geo.bearing(from.at, byId.get(n.to)!.at) }));
    const dirs = assignDirections(raw.map((r) => r.bearing));
    const list = raw
      .map((r, i) => ({ ...r, dir: DIRS[dirs[i]] }))
      .sort((a, b) => DIRS.indexOf(a.dir) - DIRS.indexOf(b.dir) || a.distance - b.distance);
    exitCache.set(id, list);
    return list;
  }

  /** Shortest walk from one place to another (Dijkstra over the routes). */
  function route(fromId: string, toId: string): Leg[] | null {
    if (fromId === toId) return [];
    const dist = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, string>();
    const open = new Set([fromId]);
    while (open.size) {
      let cur = '';
      for (const id of open) if (!cur || dist.get(id)! < dist.get(cur)!) cur = id;
      open.delete(cur);
      if (cur === toId) break;
      for (const n of neighbours.get(cur) ?? []) {
        const d = dist.get(cur)! + n.distance;
        if (d < (dist.get(n.to) ?? Infinity)) dist.set(n.to, d), prev.set(n.to, cur), open.add(n.to);
      }
    }
    if (!prev.has(toId)) return null;
    const ids = [toId];
    while (ids[0] !== fromId) ids.unshift(prev.get(ids[0])!);
    return ids.slice(1).map((to, i) => {
      const from = ids[i];
      const e = exits(from).find((x) => x.to === to)!;
      return { from, to, dir: e.dir, paved: e.paved };
    });
  }

  /** How far away a place is on foot, in world units. */
  function walkDistance(fromId: string, toId: string) {
    const legs = route(fromId, toId);
    if (!legs) return Infinity;
    return legs.reduce((s, l) => s + Math.hypot(byId.get(l.from)!.at.x - byId.get(l.to)!.at.x, byId.get(l.from)!.at.z - byId.get(l.to)!.at.z), 0);
  }

  /** Which way a place lies from another, as the crow flies. */
  const towards = (from: Place, to: Place): Dir => dirFor(geo.bearing(from.at, to.at));

  return { exits, route, walkDistance, towards };
}

export type Travel = ReturnType<typeof createTravel>;
