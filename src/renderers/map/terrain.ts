// The ground, painted once. geo.ts says how high the land is, where the
// paths run and where the headland turns to rock; this samples it on a grid
// (8 map pixels to a world unit) and quantizes it to the palette, with
// ordered dithering where one color gives way to the next. The result is one
// canvas for the whole island, blitted each frame, plus a few cheap layers
// for the moving water (shore foam) and masks saying where you can walk, wade
// and swim. Past the swimming water the seabed drops away to the deep blue of
// the open sea, which the renderer carries on past the edge of the canvas.

import type { Geo, Vec2 } from '../../world/geo';
import { fbm } from '../../world/noise';
import { paintCommute } from './commute';
import { polylineDist } from './layout';
import { C } from './palette';
import { bayer, nightData, Pix, type Color } from './pixels';
import { hash2 } from './rng';
import { paintTowerDeck, planTowerBridge } from './towerBridge';

/** Map pixels per world unit. */
export const TEX = 8;
/**
 * The world rectangle the map paints: the island (east end and all), the
 * islets off its west coast and their bridges, Little London off its east end
 * and Tower Bridge out to it, Synergy Isle far out past Boardwalk Isle, the
 * water you can swim in round all of them,
 * and the drop-off past it.
 */
export const RECT = { x0: -72, z0: -37, x1: 81, z1: 61 };
/** Deeper than this (world units) you swim; shallower, you wade. */
export const SWIM_DEPTH = 0.45;

/** What each map pixel is. */
export const G = { water: 0, wet: 1, sand: 2, bank: 3, grass: 4, rock: 5, cliff: 6, path: 7, plaza: 8, pier: 9, rail: 10, quay: 11 } as const;

export interface Terrain {
  W: number;
  H: number;
  ground: Uint8Array;
  /**
   * 0 where you can be (land, the pier deck, the water you can swim in), 1
   * where you can't (cliffs, the open sea), and 2 for the water hugging the
   * pier, which you can only cross in the air: off the deck, with a jump.
   * Buildings and trees are added later.
   */
  solid: Uint8Array;
  /** How wet each pixel is: 0 dry, 1 wading, 2 swimming. */
  water: Uint8Array;
  day: HTMLCanvasElement;
  /** The same ground after dark, painted the first time night falls. */
  night(): HTMLCanvasElement;
  /** Shore foam: the lapping line and the wave behind it, by day and by night. */
  foam(night: boolean): [HTMLCanvasElement, HTMLCanvasElement];
  /** Open water away from the shore: 1 where stars show on it at night, 2 where it's deep enough for glints too. */
  open: Uint8Array;
}

/** Give the browser a moment between slow chunks so the loader keeps moving. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** Paint the ground. `spurs` are extra bits of path this map adds (to its doors). */
export async function buildTerrain(geo: Geo, spurs: Vec2[][]): Promise<Terrain> {
  const W = (RECT.x1 - RECT.x0) * TEX;
  const H = (RECT.z1 - RECT.z0) * TEX;
  const wx = (i: number) => RECT.x0 + (i + 0.5) / TEX;
  const wz = (j: number) => RECT.z0 + (j + 0.5) / TEX;

  // ---------- Sample geo on a coarse grid (every 2 map pixels) ----------
  // Height, rock and paths are smooth, so sampling every quarter unit and
  // interpolating is indistinguishable from sampling every pixel, at a
  // quarter of the cost.
  const STEP = 2;
  const NW = W / STEP + 2;
  const NH = H / STEP + 2;
  const nx = (a: number) => RECT.x0 + (a * STEP) / TEX;
  const nz = (b: number) => RECT.z0 + (b * STEP) / TEX;
  const hN = new Float32Array(NW * NH);
  const rN = new Float32Array(NW * NH);
  const tN = new Float32Array(NW * NH);
  const fN = new Float32Array(NW * NH);
  const pN = new Float32Array(NW * NH);
  const sN = new Float32Array(NW * NH);

  // Path distance is the slow one; a 1-unit grid tells us where it's worth asking.
  const QW = RECT.x1 - RECT.x0 + 1;
  const QH = RECT.z1 - RECT.z0 + 1;
  const q = new Float32Array(QW * QH);
  for (let b = 0; b < QH; b++) for (let a = 0; a < QW; a++) q[b * QW + a] = geo.pathDist(RECT.x0 + a, RECT.z0 + b);

  // Each spur's box, two units round: further out than that, it can't make a pixel path.
  const spurBox = spurs.map((sp) => ({
    x0: Math.min(...sp.map((p) => p.x)) - 2,
    x1: Math.max(...sp.map((p) => p.x)) + 2,
    z0: Math.min(...sp.map((p) => p.z)) - 2,
    z1: Math.max(...sp.map((p) => p.z)) + 2,
  }));

  let t0 = performance.now();
  for (let b = 0; b < NH; b++) {
    for (let a = 0; a < NW; a++) {
      const x = nx(a);
      const z = nz(b);
      const k = b * NW + a;
      const room = geo.swimRoom(x, z);
      sN[k] = room;
      if (room < -3) {
        // Far out in the open sea: the depth bands below make it the deepest blue
        // whatever the seabed does, so skip the slow sums (most of the map's corners).
        hN[k] = -4;
        rN[k] = tN[k] = fN[k] = 0;
        pN[k] = 99;
        continue;
      }
      const h = geo.heightAt(x, z);
      hN[k] = h;
      rN[k] = h > -1 ? geo.rockiness(x, z) : 0;
      // Grass tone and flower patches are only read on grass, well up the shore.
      tN[k] = h > -0.3 ? fbm(x * 0.085 + 11, z * 0.085 - 7, 3, 21) : 0;
      fN[k] = h > -0.3 ? fbm(x * 0.21 - 40, z * 0.21 + 3, 2, 33) : 0;
      const qa = Math.min(QW - 1, Math.max(0, Math.round(x - RECT.x0)));
      const qb = Math.min(QH - 1, Math.max(0, Math.round(z - RECT.z0)));
      const lower = q[qb * QW + qa] - 0.72; // pathDist can't fall faster than distance
      let pd = h > -0.8 && lower < 1.6 ? geo.pathDist(x, z) : lower + 0.72;
      for (let s = 0; s < spurs.length; s++) {
        const bb = spurBox[s];
        if (x > bb.x0 && x < bb.x1 && z > bb.z0 && z < bb.z1) pd = Math.min(pd, polylineDist(spurs[s], x, z));
      }
      pN[k] = pd;
    }
    if (performance.now() - t0 > 24) {
      await breathe();
      t0 = performance.now();
    }
  }

  const lerpN = (arr: Float32Array, i: number, j: number) => {
    const u = (i + 0.5) / STEP;
    const v = (j + 0.5) / STEP;
    const a = Math.floor(u);
    const b = Math.floor(v);
    const fu = u - a;
    const fv = v - b;
    const k = b * NW + a;
    return (arr[k] * (1 - fu) + arr[k + 1] * fu) * (1 - fv) + (arr[k + NW] * (1 - fu) + arr[k + NW + 1] * fu) * fv;
  };

  // ---------- Per-pixel fields ----------
  const n = W * H;
  const hgt = new Float32Array(n);
  const rock = new Float32Array(n);
  const path = new Float32Array(n);
  const room = new Float32Array(n);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      hgt[k] = lerpN(hN, i, j);
      rock[k] = lerpN(rN, i, j);
      path[k] = lerpN(pN, i, j);
      room[k] = lerpN(sN, i, j);
    }
  }
  await breathe();
  const hAt = (i: number, j: number) => hgt[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];

  // ---------- Classify and color ----------
  const pix = new Pix(W, H);
  const ground = new Uint8Array(n);
  const hub = geo.hub.at;
  const pier = geo.pier;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const h = hgt[k];
      const d = bayer(i, j) - 0.5;
      const x = wx(i);
      const z = wz(j);
      let c: Color;
      let g: number;

      if (h < 0) {
        // Sea: banded by depth and dithered across each band's edge. Where the
        // swimming water ends the seabed drops away to the open sea's deep
        // blue, so the edge you can swim to is one you can see.
        const edge = Math.min(x - RECT.x0, RECT.x1 - x, z - RECT.z0, RECT.z1 - z);
        const depth = -h + d * 0.4 + Math.max(0, 1 - room[k]) * 1.1 + Math.max(0, 2 - edge) * 2;
        g = G.water;
        c = depth < 0.22 ? C.shallow2 : depth < 0.75 ? C.shallow : depth < 1.7 ? C.mid : depth < 3.4 ? C.sea : C.deep;
        if (depth < 0.75 && hash2(i, j, 5) < 0.012) c = C.shallow2;
      } else {
        const r = rock[k];
        const pd = path[k];
        const hd = Math.hypot(x - hub.x, z - hub.z);
        if (hd < 3.45) {
          g = G.plaza;
          c = C.pave;
        } else if (pd < 0.92 + d * 0.12 && h > 0.06) {
          g = G.path;
          const e = hash2(i, j, 9);
          c = pd > 0.72 && h > 0.5 ? C.pathEdge : e < 0.035 ? C.pebble : e < 0.09 ? C.pathLight : C.path;
        } else if (r > 0.42 + d * 0.22 && h > 0.35) {
          g = G.rock;
          const shadeV = (hAt(i - 2, j - 2) - hAt(i + 2, j + 2)) * 4 + (hash2(i >> 1, j >> 1, 3) - 0.5) * 0.5;
          c = shadeV + d * 0.4 > 0.35 ? C.rockLight : shadeV + d * 0.4 < -0.35 ? C.rockDark : C.rock;
        } else if (h < 0.13) {
          g = G.wet;
          c = C.wet;
        } else if (h < 0.52 + d * 0.16) {
          g = G.sand;
          const e = hash2(i, j, 4);
          c = e < 0.022 ? C.sandLight : e < 0.034 ? C.sandDark : C.sand;
        } else if (h < 0.7 + d * 0.16) {
          g = G.bank;
          c = C.bank;
        } else {
          g = G.grass;
          // Tone: broad fbm patches, lit from the north-west so slopes read.
          const lit = (hAt(i - 3, j - 3) - hAt(i + 3, j + 3)) * 2.2;
          const v = lerpN(tN, i, j) * 1.5 - 0.25 + lit + d * 0.09;
          c = v > 0.72 ? C.grass0 : v > 0.5 ? C.grass1 : v > 0.3 ? C.grass2 : C.grass3;
        }
        // Cliff faces: a steep drop seen from the south, on the headland.
        if (r > 0.2 && g !== G.path) {
          const drop = hAt(i, j - 4) - h;
          if (drop > 0.55 && hAt(i, j - 4) > 0.8) {
            g = G.cliff;
            c = (i + (j >> 2)) % 4 === 0 ? C.cliffDark : C.cliff;
          }
        }
      }
      ground[k] = g;
      pix.data[k] = c;
    }
  }
  await breathe();

  // ---------- Details: edges, tufts, flowers ----------
  const gAt = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? G.water : ground[j * W + i]);
  const green = (g: number) => g === G.grass || g === G.bank;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const g = ground[k];
      const below = gAt(i, j + 1);
      // A dark lip where grass gives way to sand: the land steps down a little.
      if (green(g) && (below === G.sand || below === G.wet)) pix.data[k] = C.grassEdge;
      // Sand in the lip's shadow.
      if ((g === G.sand || g === G.wet) && green(gAt(i, j - 1))) pix.data[k] = C.sandShadow;
      // Paths get a soft edge where they meet grass.
      if (g === G.path && hgt[k] > 0.5 && (green(gAt(i, j - 1)) || green(gAt(i - 1, j)) || green(gAt(i + 1, j)) || green(below))) pix.data[k] = C.pathEdge;
      // Rock rims: a dark line where the rock ends above its cliff.
      if (g === G.rock && below === G.cliff) pix.data[k] = C.rockLight;
      if (g === G.cliff && gAt(i, j + 1) === G.water) pix.data[k] = C.cliffDark;
    }
  }
  const allGrass = (i: number, j: number, w: number, h: number) => {
    for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) if (gAt(x, y) !== G.grass) return false;
    return true;
  };
  const petals = [C.petalWhite, C.petalPink, C.petalYellow, C.petalWhite];
  for (let cj = 0; cj < H; cj += 5) {
    for (let ci = 0; ci < W; ci += 5) {
      const e = hash2(ci, cj, 17);
      const oi = ci + Math.floor(hash2(ci, cj, 18) * 2);
      const oj = cj + Math.floor(hash2(ci, cj, 19) * 2);
      const patch = lerpN(fN, Math.min(W - 1, oi), Math.min(H - 1, oj));
      if (patch > 0.62 && e < 0.3 + (patch - 0.62) * 2 && allGrass(oi - 1, oj - 1, 3, 4)) {
        // A flower: four petals round a bright middle, and its shadow.
        const pc = petals[Math.floor(hash2(ci, cj, 20) * petals.length)];
        pix.px(oi, oj - 1, pc);
        pix.px(oi - 1, oj, pc);
        pix.px(oi + 1, oj, pc);
        pix.px(oi, oj, pc === C.petalYellow ? C.petalWhite : C.petalYellow);
        pix.px(oi, oj + 1, C.grassEdge);
      } else if (e < 0.16 && allGrass(oi - 1, oj - 1, 5, 3)) {
        // A tuft of grass: two little blades and a glint.
        pix.px(oi, oj, C.tuft);
        pix.px(oi + 1, oj - 1, C.tuft);
        pix.px(oi + 2, oj, C.tuft);
        if (e < 0.06) pix.px(oi + 1, oj - 2, C.tuftLight);
      }
    }
  }

  // ---------- The plaza: cobbles in rings, and a compass rose ----------
  for (let j = Math.floor((hub.z - 4 - RECT.z0) * TEX); j < (hub.z + 4 - RECT.z0) * TEX; j++) {
    for (let i = Math.floor((hub.x - 4 - RECT.x0) * TEX); i < (hub.x + 4 - RECT.x0) * TEX; i++) {
      const k = j * W + i;
      if (ground[k] !== G.plaza) continue;
      const dx = wx(i) - hub.x;
      const dz = wz(j) - hub.z;
      const r = Math.hypot(dx, dz);
      // Stones laid in staggered rows of 4x3 pixels.
      const row = Math.floor(j / 3);
      const col = Math.floor((i + (row % 2) * 2) / 4);
      const gx = (i + (row % 2) * 2) % 4 === 0;
      const gy = j % 3 === 0;
      let c = gx || gy ? C.grout : hash2(col, row, 23) < 0.25 ? C.paveLight : C.pave;
      if (!gx && !gy && (i + (row % 2) * 2) % 4 === 1 && j % 3 === 1 && c !== C.paveLight) c = C.paveLight;
      if (r > 3.2) c = (i + j) % 2 ? C.paveRim : C.grout;
      // Compass rose: a four-point star with a ring.
      const ax = Math.abs(dx);
      const az = Math.abs(dz);
      const star = Math.min(ax, az) < 0.32 * (1 - Math.max(ax, az) / 1.9) && Math.max(ax, az) < 1.9;
      if (star) c = dz < 0 || dx > 0 ? (dx * dz > 0 ? C.paveRim : C.sandShadow) : C.paveRim;
      if (Math.abs(r - 1.05) < 0.09) c = C.paveRim;
      if (r < 0.2) c = C.petalYellow;
      pix.data[k] = c;
    }
  }

  // ---------- The pier ----------
  const half = pier.width / 2;
  for (let j = Math.floor((pier.start - RECT.z0) * TEX); j < (pier.end - RECT.z0) * TEX; j++) {
    for (let i = Math.floor((pier.x - half - 0.3 - RECT.x0) * TEX); i < (pier.x + half + 0.3 - RECT.x0) * TEX; i++) {
      const k = j * W + i;
      const dx = wx(i) - pier.x;
      const ax = Math.abs(dx);
      const zz = wz(j);
      // Posts stick out either side every two units, and cast a little shadow.
      const postRow = Math.abs(((zz - pier.start + 1) % 2.2) - 1.1) < 0.18;
      if (ax >= half) {
        if (postRow && ax < half + 0.25) {
          pix.data[k] = C.post;
          ground[k] = G.pier;
        } else if (ground[k] === G.water && dx > 0 && ax < half + 0.25) pix.data[k] = C.sea; // shade on the water
        continue;
      }
      ground[k] = G.pier;
      const edge = ax > half - 0.17;
      const gap = j % 4 === 0;
      const seam = (Math.floor(j / 4) * 7 + 3) % 13 === Math.floor((dx + half) * TEX) % 13;
      pix.data[k] = edge ? C.plankDark : gap ? C.plankDark : seam ? C.plankDark : hash2(i, Math.floor(j / 4), 29) < 0.05 ? C.plankLight : (j % 4 === 1 ? C.plankLight : C.plank);
    }
  }

  // ---------- The footbridges out to the islets ----------
  // Plank decks across the water like the pier's, with a railing down either
  // side (you can't step off) and its posts showing every so often.
  const deck = new Uint8Array(n); // 1: deck you can walk on, 2: its railing
  for (const b of geo.bridges) {
    if (b.style === 'tower') continue; // painted after the quay, below
    const hw = b.width / 2;
    const xs = [b.ax, b.bx].map((x) => (x - RECT.x0) * TEX);
    const zs = [b.az, b.bz].map((z) => (z - RECT.z0) * TEX);
    const pad = (hw + 0.4) * TEX;
    for (let j = Math.max(0, Math.floor(Math.min(...zs) - pad)); j < Math.min(H, Math.ceil(Math.max(...zs) + pad)); j++) {
      for (let i = Math.max(0, Math.floor(Math.min(...xs) - pad)); i < Math.min(W, Math.ceil(Math.max(...xs) + pad)); i++) {
        const k = j * W + i;
        const rx = wx(i) - b.ax;
        const rz = wz(j) - b.az;
        const along = rx * b.ux + rz * b.uz;
        const across = rx * b.uz - rz * b.ux;
        const ax = Math.abs(across);
        if (along < 0 || along > b.length || ax > hw + 0.25) continue;
        const post = Math.abs((along % 1.25) - 0.62) > 0.5;
        if (ax >= hw) {
          // A post sticking out past the rail, or the rail's shadow on the water.
          if (post) (pix.data[k] = C.post), (ground[k] = G.pier), (deck[k] = 2);
          else if (ground[k] === G.water && across > 0) pix.data[k] = C.sea;
          continue;
        }
        ground[k] = G.pier;
        if (ax > hw - 0.22) {
          deck[k] = 2;
          pix.data[k] = post || ax > hw - 0.1 ? C.post : C.plankDark;
          continue;
        }
        deck[k] = 1;
        const plank = Math.floor((along * TEX) / 3);
        const seam = Math.floor(along * TEX) % 3 === 0;
        pix.data[k] = seam ? C.plankDark : hash2(plank, Math.floor((across + hw) * 2), 31) < 0.06 ? C.plankLight : plank % 3 === 1 ? C.plankLight : C.plank;
      }
    }
  }

  // ---------- The railway, the station platform and the quay ----------
  paintCommute(geo, pix, ground, { x0: RECT.x0, z0: RECT.z0, tex: TEX }, { rail: G.rail, quay: G.quay });
  // Tower Bridge: a road with pavements and railings, carried a step onto the quay at its end.
  for (const b of geo.bridges) if (b.style === 'tower') paintTowerDeck(planTowerBridge(b), pix, ground, deck, RECT, { water: G.water, pier: G.pier });
  await breathe();

  // ---------- Where you can be ----------
  const solid = new Uint8Array(n);
  const water = new Uint8Array(n);
  const pierBox = (x: number, z: number) => Math.abs(x - pier.x) < half + 0.5 && z > pier.start - 0.5 && z < pier.end + 0.5;
  // The headland's rim: rock that drops steeply to the sea all round, not just
  // the face drawn on its south side. You can't climb it out of the water.
  const steep = (i: number, j: number, h: number) =>
    Math.max(Math.abs(hAt(i - 4, j) - h), Math.abs(hAt(i + 4, j) - h), Math.abs(hAt(i, j - 4) - h), Math.abs(hAt(i, j + 4) - h)) > 0.45;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const x = wx(i);
      const z = wz(j);
      const h = hgt[k];
      // A bridge's deck is dry and open; its railing isn't.
      if (deck[k]) {
        solid[k] = deck[k] === 2 ? 1 : 0;
        continue;
      }
      if (pierBox(x, z) && !geo.isWalkable(x, z)) {
        solid[k] = 2;
        water[k] = -h < SWIM_DEPTH ? 1 : 2;
      } else if (h > 0.14 || pierBox(x, z)) {
        solid[k] = ground[k] === G.cliff || (rock[k] > 0.2 && steep(i, j, h)) ? 1 : 0;
      } else if (room[k] > 0) {
        water[k] = -h < SWIM_DEPTH ? 1 : 2;
      } else solid[k] = 1;
    }
  }

  // ---------- Moving water ----------
  // Distance to land, a few pixels out, for the foam.
  const dist = new Uint8Array(n).fill(255);
  for (let k = 0; k < n; k++) if (ground[k] !== G.water) dist[k] = 0;
  for (let step = 1; step <= 4; step++) {
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        if (dist[k] !== 255) continue;
        if (dist[k - 1] === step - 1 || dist[k + 1] === step - 1 || dist[k - W] === step - 1 || dist[k + W] === step - 1) dist[k] = step;
      }
    }
  }
  const foamA = new Pix(W, H);
  const foamB = new Pix(W, H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (ground[k] !== G.water) continue;
      if (dist[k] === 1 && !(pierBox(wx(i), wz(j)) && ground[k - W] !== G.water)) foamA.data[k] = C.foam;
      // The wave behind: broken into dashes.
      if (dist[k] === 3 && hash2(i >> 1, j >> 1, 41) < 0.6) foamB.data[k] = C.foam2;
    }
  }

  // Open water, for the glints by day and the stars at night.
  const open = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (ground[k] === G.water && dist[k] === 255) open[k] = hgt[k] < -0.4 ? 2 : 1;

  const day = pix.canvas();
  let nightCv: HTMLCanvasElement | null = null;
  let foamDay: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  let foamNight: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

  return {
    W,
    H,
    ground,
    solid,
    day,
    night: () => (nightCv ??= pix.canvas(nightData(pix.data))),
    foam: (night) =>
      night
        ? (foamNight ??= [foamA.canvas(nightData(foamA.data)), foamB.canvas(nightData(foamB.data))])
        : (foamDay ??= [foamA.canvas(), foamB.canvas()]),
    water,
    open,
  };
}

/** Texel coordinates of a world point. */
export const toTex = (x: number, z: number) => ({ i: (x - RECT.x0) * TEX, j: (z - RECT.z0) * TEX });
