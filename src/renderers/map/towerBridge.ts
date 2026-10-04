// Tower Bridge, in pixels. The deck is painted into the ground like the
// footbridges (a road with pavements and railings, walked like any deck);
// what stands up from it is sprites, drawn side on as seen from the south:
// two stone towers in the water with an arch the road runs through, corner
// turrets with slate roofs and gold tips, two walkways high between them, and
// chains swooping down to either end. Each piece is y-sorted on its own, so
// the explorer walks in front of the far side of the bridge and behind the
// near side, and through each tower's arch.
//
// It's drawn for a bridge running east and west (the one in the world does);
// the deck is painted along any bearing, but the towers always face south.

import type { Bridge } from '../../world/geo';
import { HEX } from './palette';
import { col, nightData, Pix, type Color } from './pixels';
import { hash2 } from './rng';
import type { Sprite } from './sprites';

/** Where along the bridge (as a share of its length) the two towers stand. */
const AT = [0.32, 0.68];
/** A tower's pier: half its length along the bridge, and how far past the railings it reaches either side. */
const TOWER_HL = 1.45;
const TOWER_OUT = 0.45;
/** Pavement width, and the railing's, in world units. */
const PAVEMENT = 0.62;
const RAIL = 0.22;
/** How far onto the quay (or land) the road carries on before the deck starts. */
const APPROACH = 0.7;
const TEX = 8;

export interface TowerBridgePlan {
  bridge: Bridge;
  /** The towers' middles, and how far along the bridge each is. */
  towers: { x: number; z: number; along: number }[];
  /** Half a tower's pier along the bridge, and across it (railings and all). */
  hl: number;
  hd: number;
  /** Lamps on the railings, lit at night: where they stand, and which side (1 south, -1 north). */
  lamps: { x: number; z: number; side: number }[];
}

export function planTowerBridge(b: Bridge): TowerBridgePlan {
  const at = (along: number, across = 0) => ({ x: b.ax + b.ux * along + b.uz * across, z: b.az + b.uz * along - b.ux * across });
  const towers = AT.map((t) => ({ ...at(b.length * t), along: b.length * t }));
  const hw = b.width / 2;
  const lamps: TowerBridgePlan['lamps'] = [];
  // A pair at each end, either side of the road as you come on.
  const spots = [0.3, b.length - 0.3];
  for (const along of spots) for (const side of [-1, 1]) lamps.push({ ...at(along, -side * (hw - 0.12)), side });
  return { bridge: b, towers, hl: TOWER_HL, hd: hw + TOWER_OUT, lamps };
}

// ---------- The deck ----------

const ROAD = col('#676a71');
const ROAD_LIGHT = col('#73767d');
const ROAD_DARK = col('#55585e');
const LINE = col('#f3eedf');
const PAVE = col('#d9d1c3');
const PAVE_LIGHT = col('#e6dfd2');
const KERB = col('#b3aa9b');
const RAIL_BLUE = col('#7cb4d8');
const RAIL_TOP = col('#e9f5fc');
const RAIL_POST = col('#4f86ad');
const PIER = col('#cfc3ad');
const PIER_DARK = col('#a99c85');
const SHADE = col(HEX.sea);

/**
 * Paint a tower bridge's deck into the ground: `deck` gets 1 where you can
 * walk and 2 for the railings and the towers' piers (which nothing crosses).
 */
export function paintTowerDeck(plan: TowerBridgePlan, pix: Pix, ground: Uint8Array, deck: Uint8Array, rect: { x0: number; z0: number }, codes: { water: number; pier: number }) {
  const b = plan.bridge;
  const W = pix.w;
  const H = pix.h;
  const hw = b.width / 2;
  const wx = (i: number) => rect.x0 + (i + 0.5) / TEX;
  const wz = (j: number) => rect.z0 + (j + 0.5) / TEX;
  const xs = [b.ax - b.ux * APPROACH, b.bx].map((x) => (x - rect.x0) * TEX);
  const zs = [b.az - b.uz * APPROACH, b.bz].map((z) => (z - rect.z0) * TEX);
  const pad = (plan.hd + 0.4) * TEX;
  for (let j = Math.max(0, Math.floor(Math.min(...zs) - pad)); j < Math.min(H, Math.ceil(Math.max(...zs) + pad)); j++) {
    for (let i = Math.max(0, Math.floor(Math.min(...xs) - pad)); i < Math.min(W, Math.ceil(Math.max(...xs) + pad)); i++) {
      const k = j * W + i;
      const rx = wx(i) - b.ax;
      const rz = wz(j) - b.az;
      const along = rx * b.ux + rz * b.uz;
      const across = rx * b.uz - rz * b.ux; // + is to the right of the way it runs (south, for one running east)
      const ax = Math.abs(across);
      if (along < -APPROACH || along > b.length || ax > plan.hd + 0.2) continue;
      // The towers' piers, out in the water either side: stone, with a darker lip.
      const tower = plan.towers.find((t) => Math.abs(along - t.along) < plan.hl + 0.12);
      if (tower && ax >= hw - RAIL && along >= 0) {
        const lip = ax > plan.hd - 0.05 || Math.abs(along - tower.along) > plan.hl - 0.05;
        pix.data[k] = lip ? PIER_DARK : PIER;
        ground[k] = codes.pier;
        deck[k] = 2;
        continue;
      }
      if (ax >= hw) {
        // Outside the railing: its shadow on the water to the south.
        if (along >= 0 && ground[k] === codes.water && across > 0 && ax < hw + 0.25) pix.data[k] = SHADE;
        continue;
      }
      ground[k] = codes.pier;
      const d = hw - ax; // in from the railing
      if (along >= 0 && d < RAIL) {
        deck[k] = 2;
        const post = Math.abs((along % 1.1) - 0.55) > 0.47;
        pix.data[k] = post ? RAIL_POST : d > RAIL - 0.09 ? RAIL_TOP : RAIL_BLUE;
        continue;
      }
      deck[k] = 1;
      if (d < RAIL + PAVEMENT) {
        // The pavement, in flags, with a kerb along the road.
        const flag = (Math.floor(along * 2.5) + (across > 0 ? 0 : 1)) % 2;
        pix.data[k] = d > RAIL + PAVEMENT - 0.11 ? KERB : Math.floor(along * TEX) % 5 === 0 ? KERB : flag ? PAVE : PAVE_LIGHT;
        continue;
      }
      // The road: a dashed line down the middle, and the seam where the bascules meet.
      const seam = Math.abs(along - b.length / 2) < 0.07;
      const dash = ax < 0.07 && Math.floor(along * 1.6) % 2 === 0;
      const n = hash2(i, j, 71);
      pix.data[k] = seam ? ROAD_DARK : dash ? LINE : n < 0.06 ? ROAD_DARK : n > 0.94 ? ROAD_LIGHT : ROAD;
    }
  }
}

// ---------- The sprites ----------

const INK = col(HEX.ink);
const STONE = col('#e2d8c4');
const STONE_LIGHT = col('#efe7d6');
const STONE_DARK = col('#c4b79f');
const STONE_DEEP = col('#a3967f');
const SLATE = col('#53718f');
const SLATE_LIGHT = col('#7393b0');
const SLATE_DARK = col('#3d5670');
const GOLD = col('#f2c14e');
const GOLD_LIGHT = col('#ffe58a');
const BLUE = col('#7cb4d8');
const BLUE_DARK = col('#5a93bd');
const WHITE = col('#f7fbff');
const FOAM = col(HEX.foam);
const INSIDE = col('#4a4f5a');
const INSIDE_DARK = col('#363a44');
// Tower windows and the lamps: lit after dark.
const WINDOW = col('#5f7a96');
const WINDOW_SHINE = col('#9fbcd6');
const LAMP = col('#ffe7a6');
const LAMP_CORE = col('#fff6d8');
const LIGHTS = new Map<Color, Color>([
  [WINDOW, col('#ffcf6e')],
  [WINDOW_SHINE, col('#ffe6a2')],
  [LAMP, col('#ffe27a')],
  [LAMP_CORE, col('#fffbe6')],
]);

/** One of the bridge's sprites, and where it stands in the world (its sort key). */
export interface BridgePiece {
  x: number;
  z: number;
  sprite: Sprite;
}

/**
 * Trim a painting to what's painted (and a few pixels round it), keeping its
 * anchor on the same pixel, and outline it. `fine` adds details after the
 * outline, in the painting's own pixels, so they stay one pixel thin.
 */
function finish(p: Pix, ax: number, ay: number, fine?: (px: (x: number, y: number, c: Color) => void) => void): Sprite {
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!p.data[y * p.w + x]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) (x0 = y0 = 0), (x1 = y1 = 0);
  const M = 3;
  const q = new Pix(x1 - x0 + 1 + M * 2, y1 - y0 + 1 + M * 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) q.data[(y - y0 + M) * q.w + (x - x0 + M)] = p.data[y * p.w + x];
  q.outline(INK);
  fine?.((x, y, c) => q.px(x - x0 + M, y - y0 + M, c));
  return { w: q.w, h: q.h, ax: ax - x0 + M, ay: ay - y0 + M, day: q.canvas(), night: q.canvas(nightData(q.data, LIGHTS)), data: q.data };
}

/**
 * The bridge's sprites. Everything is painted in one frame (8 pixels to the
 * unit, like the ground) and then cut into pieces, each anchored where it
 * stands: the far side of the bridge (its walkway and chains) behind the deck,
 * the near side in front of it, and each tower in two: what you see through
 * its arch, behind you as you walk through, and the tower itself, in front.
 */
export function paintTowerBridge(plan: TowerBridgePlan): BridgePiece[] {
  const b = plan.bridge;
  const hw = b.width / 2;
  const zc = (b.az + b.bz) / 2;
  const x0 = Math.min(b.ax, b.bx) - 1.5;
  const x1 = Math.max(b.ax, b.bx) + 1.5;
  const FW = Math.ceil((x1 - x0) * TEX);
  const TOP = 104; // room above the deck's middle for the towers' tips
  const FH = TOP + Math.ceil((plan.hd + 1) * TEX);
  const cx = (x: number) => Math.round((x - x0) * TEX);
  /** The frame's row for ground at z, `h` pixels up. */
  const row = (z: number, h = 0) => TOP + Math.round((z - zc) * TEX) - h;
  const frame = () => new Pix(FW, FH);
  const pieces: BridgePiece[] = [];
  const add = (p: Pix, z: number, fine?: Parameters<typeof finish>[3]) => pieces.push({ x: x0, z, sprite: finish(p, 0, row(z), fine) });

  // Heights, in pixels above each piece's own ground.
  const FACE = 60; // a tower's stone face, from the water to its cornice
  const WALK = 44; // the walkways' underside, above the near railing
  const WALK_H = 7;
  const BACK = 9; // how much higher the far side is drawn than the near
  const LOW = 8; // where the chains come down to at the ends
  const tw = Math.round(plan.hl * TEX); // half a tower's width, in pixels
  const southBase = row(zc + plan.hd); // a tower's south face meets the water here
  const nearBase = row(zc + hw + 0.05);
  const farBase = row(zc - hw - 0.05);
  const tx = plan.towers.map((t) => cx(t.x));
  const ends = [cx(b.ax) + 2, cx(b.bx) - 2];

  /** A lattice girder from column a to column b, its top at row y. */
  const girder = (p: Pix, a: number, c: number, y: number, light: boolean) => {
    const main = light ? BLUE : BLUE_DARK;
    p.hline(a, c, y, main);
    p.hline(a, c, y + 1, light ? WHITE : main);
    p.hline(a, c, y + WALK_H - 2, main);
    p.hline(a, c, y + WALK_H - 1, light ? BLUE_DARK : SLATE_DARK);
    for (let x = a; x <= c; x++) {
      for (let k = 2; k < WALK_H - 2; k++) {
        const u = (x - a) % 6;
        if (u === k - 1 || 6 - u === k - 1 || u === 0) p.px(x, y + k, light ? WHITE : BLUE);
      }
    }
  };
  /** A chain from the low end (xl, yl) up to (xh, yh), sagging; with hangers down to row `deckY`. */
  const chain = (p: Pix, xl: number, yl: number, xh: number, yh: number, deckY: number, light: boolean) => {
    const n = Math.abs(xh - xl);
    const dir = Math.sign(xh - xl);
    let prev = yl;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const y = Math.round(yl + (yh - yl) * t * t);
      const x = xl + dir * s;
      // Hangers every few pixels, from the chain down to the deck.
      if (s % 5 === 3 && s < n - 3) p.vline(x, y + 3, deckY, light ? BLUE : BLUE_DARK);
      for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) {
        p.px(x, yy, light ? WHITE : BLUE);
        p.px(x, yy + 1, light ? WHITE : BLUE);
        p.px(x, yy + 2, light ? BLUE : BLUE_DARK);
        p.px(x, yy + 3, BLUE_DARK);
      }
      prev = y;
    }
  };
  /** A little stone post where a chain comes down, at column x, standing on row y. */
  const pylon = (p: Pix, x: number, y: number) => {
    p.rect(x - 2, y - 11, 5, 11, STONE);
    p.vline(x + 2, y - 11, y - 1, STONE_DARK);
    p.hline(x - 2, x + 2, y - 11, STONE_LIGHT);
    p.rect(x - 1, y - 14, 3, 3, SLATE);
    p.px(x, y - 15, GOLD);
  };

  // ---------- The far side: its walkway and its chains ----------
  {
    const p = frame();
    const yWalk = farBase - WALK - WALK_H + (row(zc + hw) - row(zc - hw)) - BACK;
    girder(p, tx[0] + tw - 1, tx[1] - tw + 1, yWalk, false);
    const yTop = yWalk + 1;
    for (const [k, end] of [[0, ends[0]], [1, ends[1]]] as const) {
      const xh = k === 0 ? tx[0] - tw + 1 : tx[1] + tw - 1;
      chain(p, end, farBase - LOW, xh, yTop, farBase - 4, false);
      pylon(p, end, farBase - 2);
    }
    add(p, zc - hw - 0.05);
  }

  // ---------- The near side ----------
  {
    const p = frame();
    const yWalk = nearBase - WALK - WALK_H;
    girder(p, tx[0] + tw - 1, tx[1] - tw + 1, yWalk, true);
    for (const [k, end] of [[0, ends[0]], [1, ends[1]]] as const) {
      const xh = k === 0 ? tx[0] - tw + 1 : tx[1] + tw - 1;
      chain(p, end, nearBase - LOW, xh, yWalk + 1, nearBase - 4, true);
      pylon(p, end, nearBase + 1);
    }
    add(p, zc + hw + 0.05);
  }

  // ---------- The towers ----------
  const AW = 6; // half the arch's width
  const ARCH = 38; // the arch's height, from the water
  for (const x of tx) {
    // Through the arch: the passage's far wall, behind whoever walks through.
    {
      const p = frame();
      const yFloor = row(zc - hw + 0.1);
      for (let y = southBase - ARCH - 2; y <= yFloor; y++) {
        for (let i = x - AW; i <= x + AW; i++) p.px(i, y, y > yFloor - 3 ? INSIDE_DARK : (i + (y >> 2)) % 7 === 0 ? INSIDE_DARK : INSIDE);
      }
      // A lamp on the wall in there.
      p.rect(x - 1, yFloor - 9, 3, 3, LAMP);
      p.px(x, yFloor - 8, LAMP_CORE);
      add(p, zc - plan.hd + 0.05);
    }
    // The tower.
    {
      const p = frame();
      const yb = southBase;
      const yt = yb - FACE;
      // The face: courses of pale stone, shaded on the right.
      for (let y = yt; y <= yb; y++) {
        for (let i = x - tw; i <= x + tw; i++) {
          const course = (y - yt) % 4 === 3;
          const joint = (i + ((y - yt) >> 2) * 3) % 6 === 0 && (y - yt) % 4 !== 3;
          p.px(i, y, course || joint ? STONE_DARK : i > x + tw - 3 ? STONE_DARK : i < x - tw + 2 ? STONE_LIGHT : STONE);
        }
      }
      // The plinth in the water, darker, with the waterline and a lick of foam.
      for (let y = yb - 3; y <= yb; y++) p.hline(x - tw - 1, x + tw + 1, y, y === yb ? STONE_DEEP : STONE_DARK);
      // The arch the road runs through: a pointed opening, cut right out (you see the deck through it).
      for (let y = yb - ARCH; y <= yb - 4; y++) {
        const up = yb - 4 - y;
        const spring = ARCH - 4 - 2 * AW; // where the arch starts to close
        const half = up < spring ? AW : Math.round(AW * Math.sqrt(Math.max(0, 1 - ((up - spring) / (2 * AW)) ** 2)) - (up - spring) * 0.18);
        if (half < 0) continue;
        for (let i = x - half; i <= x + half; i++) p.px(i, y, 0);
        // A rim of darker stone round it.
        p.px(x - half - 1, y, STONE_DEEP);
        p.px(x + half + 1, y, STONE_DEEP);
      }
      // Windows: a row of three small arched ones over the arch, and a tall pair above.
      const win = (wx: number, wy: number, w: number, h: number) => {
        p.rect(wx, wy, w, h, WINDOW);
        p.px(wx, wy, STONE_DARK);
        p.px(wx + w - 1, wy, STONE_DARK);
        p.px(wx + (w >> 1), wy + 1, WINDOW_SHINE);
      };
      for (const dx of [-6, -1, 4]) win(x + dx, yb - ARCH - 8, 3, 5);
      win(x - 4, yt + 6, 3, 8);
      win(x + 2, yt + 6, 3, 8);
      // A cornice along the top.
      p.hline(x - tw - 1, x + tw + 1, yt, STONE_LIGHT);
      p.hline(x - tw - 1, x + tw + 1, yt + 1, STONE_DEEP);
      for (let i = x - tw; i <= x + tw; i += 2) p.px(i, yt - 1, STONE);
      // The roofs: two turrets behind, the steep middle roof, and the two at the front corners.
      const spire = (sx: number, sy: number, half: number, height: number, back: boolean) => {
        for (let k = 0; k < height; k++) {
          const w = Math.max(0, Math.round(half * (1 - k / height)));
          p.hline(sx - w, sx + w, sy - k, back ? SLATE_DARK : k % 3 === 2 ? SLATE_DARK : SLATE);
          if (!back && w > 0) p.px(sx - w, sy - k, SLATE_LIGHT);
        }
        p.vline(sx, sy - height - 2, sy - height, GOLD);
        p.px(sx, sy - height - 3, GOLD_LIGHT);
      };
      for (const dx of [-tw + 3, tw - 3]) {
        p.rect(x + dx - 2, yt - 10, 5, 9, STONE_DARK);
        spire(x + dx, yt - 11, 3, 9, true);
      }
      // The middle roof, with a dormer.
      for (let k = 0; k < 22; k++) {
        const w = Math.round((tw - 3) * (1 - k / 24));
        p.hline(x - w, x + w, yt - 2 - k, k % 4 === 3 ? SLATE_DARK : SLATE);
        p.px(x - w, yt - 2 - k, SLATE_LIGHT);
        p.px(x + w, yt - 2 - k, SLATE_DARK);
      }
      p.vline(x, yt - 28, yt - 23, GOLD);
      p.px(x, yt - 29, GOLD_LIGHT);
      p.hline(x - 1, x + 1, yt - 26, GOLD);
      p.rect(x - 2, yt - 9, 5, 5, STONE_LIGHT);
      p.rect(x - 1, yt - 8, 3, 3, WINDOW);
      // The corner turrets run the full height, a little proud of the face.
      for (const dx of [-tw, tw - 3]) {
        for (let y = yt - 4; y <= yb - 3; y++) {
          const course = (y - yt) % 4 === 3;
          p.hline(x + dx - 1, x + dx + 3, y, course ? STONE_DARK : dx < 0 ? STONE_LIGHT : STONE);
          p.px(x + dx + 3, y, STONE_DARK);
        }
        p.vline(x + dx + 1, yt + 10, yt + 13, WINDOW);
        p.vline(x + dx + 1, yt + 26, yt + 29, WINDOW);
        spire(x + dx + 1, yt - 5, 3, 11, false);
      }
      add(p, zc + plan.hd, (px) => {
        for (let i = x - tw - 3; i <= x + tw + 3; i++) if ((i * 7) % 5 !== 0) px(i, yb + 2, FOAM);
      });
    }
  }
  return pieces;
}
