// The island in characters. Samples the same height field the 3D island is
// built from, so the coast, the beaches and the paths are
// where they are on every other view. A cell is about twice as tall as it is
// wide in a monospace font, so each row covers twice the ground of a column
// and the island comes out round, not squashed.

import type { Geo } from '../../world/geo';
import type { Archetype, Place, World } from '../../world/schema';

export const MAP_COLS = 56;
export const MAP_ROWS = 24;
/** A monospace cell's width over its height (0.6em wide, 1.2em line). */
const CELL_ASPECT = 0.5;

/** What each kind of ground is drawn with. */
export const GROUND = { sea: '~', sand: '.', grass: '"', rock: '^', path: '#', pier: '=', you: '@' } as const;

/** A letter that looks or sounds like the thing, where we can. */
const PREFERRED: Record<Archetype, string> = {
  plaza: 'P',
  cabin: 'C',
  taproom: 'T',
  tree: 'Y',
  library: 'L',
  lighthouse: 'H',
  schoolhouse: 'S',
  depot: 'D',
  mall: 'F',
  townhouse: 'N',
  skyscraper: 'G',
  workshop: 'M',
  pier: 'W',
  bottle: 'B',
};

/** One distinct capital letter per place: the archetype's own, else one from its title or name. */
export function glyphs(world: World): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const p of world.places) {
    const words = `${p.title} ${p.name}`.toUpperCase().split(/[^A-Z]+/).filter((w) => w && w !== 'THE');
    const pool = [PREFERRED[p.archetype], ...words.map((w) => w[0]), ...words.join(''), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    const g = pool.find((c) => c && !used.has(c))!;
    used.add(g);
    out.set(p.id, g);
  }
  return out;
}

/** Sea depths: solid ~ in the shallows, a lighter weave further out, the odd wave in deep water. */
const SHALLOW = -0.5;
const MID = -2.5;
const DEEP_WAVES = 0.12;
/** A stable 0..1 hash of a cell, for texture that doesn't flicker between draws. */
const hash = (c: number, r: number) => {
  let h = (c * 374761393 + r * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export type IslandMap = {
  /** The ground and the places, without you on it. */
  rows: string[][];
  glyph: Map<string, string>;
  /** World position of the middle of a cell, and the cell under a world position. */
  toWorld(c: number, r: number): { x: number; z: number };
  toCell(x: number, z: number): { c: number; r: number };
};

export function drawIsland(world: World, geo: Geo, cols = MAP_COLS, rowsN = MAP_ROWS): IslandMap {
  // The main island only: the islets are open sea here. Most are over bridges
  // words can't cross yet; each one with places on it (the mall and the
  // townhouse over Tower Bridge, the lighthouse and the depot on Wesleyan Isle)
  // gets its bridge, run out toward the edge, and their letters at the end.
  const heightAt = (x: number, z: number) => (geo.owner(x, z) === 0 ? geo.heightAt(x, z) : -6);
  const away = world.places.filter((p) => geo.islandOf(p.at.x, p.at.z));
  // Frame everything that isn't open sea, plus a little water all round.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let z = -60; z <= 60; z += 1) {
    for (let x = -60; x <= 60; x += 1) {
      if (heightAt(x, z) < -0.6) continue;
      x0 = Math.min(x0, x), x1 = Math.max(x1, x), z0 = Math.min(z0, z), z1 = Math.max(z1, z);
    }
  }
  const extra = [...world.places.filter((p) => !away.includes(p)).map((p) => p.at), { x: geo.pier.x, z: geo.pier.end }];
  for (const p of extra) (x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (z0 = Math.min(z0, p.z)), (z1 = Math.max(z1, p.z));
  const pad = 3;
  const w = x1 - x0 + pad * 2;
  const h = z1 - z0 + pad * 2;
  const ux = Math.max(w / cols, (h / rowsN) * CELL_ASPECT);
  const uz = ux / CELL_ASPECT;
  const left = (x0 + x1) / 2 - (ux * cols) / 2;
  const top = (z0 + z1) / 2 - (uz * rowsN) / 2;
  const toWorld = (c: number, r: number) => ({ x: left + (c + 0.5) * ux, z: top + (r + 0.5) * uz });
  const toCell = (x: number, z: number) => ({
    c: Math.max(0, Math.min(cols - 1, Math.floor((x - left) / ux))),
    r: Math.max(0, Math.min(rowsN - 1, Math.floor((z - top) / uz))),
  });

  // Distance to the nearest paved path, without the hub's round paving (a blob at this size), and
  // with a short spur from each door to the building, so every path visibly reaches its letter.
  const segs = geo.paths.flatMap(({ points }) => points.slice(1).map((b, i) => [points[i], b] as const));
  for (const p of world.places) if (p.kind === 'project' || p.kind === 'colophon') segs.push([geo.door(p), p.at]);
  const pathDist = (x: number, z: number) => {
    let best = Infinity;
    for (const [a, b] of segs) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    return best;
  };
  const pier = geo.pier;
  const pierCol = toCell(pier.x, 0).c;
  const rows: string[][] = [];
  for (let r = 0; r < rowsN; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const { x, z } = toWorld(c, r);
      const ht = heightAt(x, z);
      // Thin things (paths, the pier) are looked for across the whole cell, not just its middle.
      const onPier = c === pierCol && z + uz / 2 > pier.start && z - uz / 2 < pier.end;
      const nearPath = [-uz / 3, 0, uz / 3].some((dz) => pathDist(x, z + dz) < 0.62);
      let g: string;
      if (onPier) g = GROUND.pier;
      else if (nearPath && ht > -0.05) g = GROUND.path;
      else if (ht < -0.02) {
        const n = hash(c, r);
        g = ht > SHALLOW ? GROUND.sea : ht > MID ? ((c + r) % 2 === 0 ? GROUND.sea : ' ') : n < DEEP_WAVES ? GROUND.sea : ' ';
      } else if (geo.rockiness(x, z) > 0.42 && ht > 0.25) g = GROUND.rock;
      else if (ht < 0.6) g = GROUND.sand;
      else g = GROUND.grass;
      row.push(g);
    }
    rows.push(row);
  }

  // Places last, so they sit on top of their paths.
  const glyph = glyphs(world);
  for (const p of world.places) {
    if (away.includes(p)) continue;
    const { c, r } = toCell(p.at.x, p.at.z);
    rows[r][c] = glyph.get(p.id)!;
  }
  // The way out to the places on an islet: its bridge as far as the map goes (stopping short of the edge, which is
  // always sea), and their letters where it ends, the first at the end and the rest stacked by it. An islet further
  // out (past another) gets the first bridge on the way.
  for (const isle of new Set(away.map((p) => geo.islandOf(p.at.x, p.at.z)!))) {
    const here = away.filter((p) => geo.islandOf(p.at.x, p.at.z) === isle);
    const other = (x: (typeof geo.bridges)[number]) => (x.joins[0] === 0 ? x.joins[1] : x.joins[0]);
    const b = geo.bridges.find((x) => x.joins.includes(isle) && x.joins.includes(0)) ?? geo.bridges.find((x) => x.joins.includes(0) && geo.hops(other(x), isle) < geo.hops(0, isle));
    if (!b) continue;
    const [ax, az, dx, dz] = b.joins[0] === 0 ? [b.ax, b.az, b.ux, b.uz] : [b.bx, b.bz, -b.ux, -b.uz];
    let end: { c: number; r: number } | null = null;
    for (let t = 0; t <= b.length + 6; t += 0.3) {
      const x = ax + dx * t;
      const z = az + dz * t;
      const c = Math.floor((x - left) / ux);
      const r = Math.floor((z - top) / uz);
      if (c < 1 || r < 1 || c > cols - 2 || r > rowsN - 2) break;
      if (rows[r][c] === GROUND.sea || rows[r][c] === ' ' || rows[r][c] === GROUND.sand) rows[r][c] = GROUND.pier;
      end = { c, r };
    }
    if (!end) continue;
    const spots = [end, { c: end.c, r: end.r + 1 }, { c: end.c, r: end.r - 1 }, { c: end.c, r: end.r + 2 }].filter((x) => x.r > 0 && x.r < rowsN - 1);
    here.forEach((p, i) => spots[i] && (rows[spots[i].r][spots[i].c] = glyph.get(p.id)!));
  }
  return { rows, glyph, toWorld, toCell };
}

/** The map with you on it: an @ where you'd stand at your place (its door, or the middle of the hub). */
export function mapWithYou(island: IslandMap, geo: Geo, here: Place): { rows: string[]; you: { c: number; r: number } } {
  const stand = geo.door(here);
  const ground = new Set<string>([GROUND.sand, GROUND.grass, GROUND.rock, GROUND.path, GROUND.pier]);
  // The cell nearest where you stand that's dry ground and not already a place's letter.
  let best = { c: 0, r: 0 };
  let bestD = Infinity;
  const { c: c0, r: r0 } = island.toCell(stand.x, stand.z);
  for (let r = r0 - 2; r <= r0 + 2; r++) {
    for (let c = c0 - 3; c <= c0 + 3; c++) {
      if (r < 0 || c < 0 || r >= island.rows.length || c >= island.rows[0].length || !ground.has(island.rows[r][c])) continue;
      const p = island.toWorld(c, r);
      const d = Math.hypot(p.x - stand.x, p.z - stand.z);
      if (d < bestD) (bestD = d), (best = { c, r });
    }
  }
  const rows = island.rows.map((row, r) => (r === best.r ? row.map((g, c) => (c === best.c ? GROUND.you : g)) : row).join(''));
  return { rows, you: best };
}
