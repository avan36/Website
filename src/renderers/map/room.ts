// Inside a building, on the map: a little pixel room in the same palette and
// the same hand as the overworld. The back wall and everything that hangs on
// it is painted once into the background; what stands on the floor (desks,
// the lens, the cat, the islanders) are sprites, y-sorted with the explorer.
// Twelve map pixels to the metre (the overworld has eight), so a room is a
// close-up: furniture gets a little more detail than a whole building does.
//
// Geometry, reach and pathfinding are roomPlan.ts's, shared with the island.

import type { Place, Prop, Thing } from '../../world/schema';
import { planRoom, type RoomPlan, type Spot } from '../roomPlan';
import { paintExplorer, type ExplorerSprites } from './explorer';
import { HEX } from './palette';
import { col, nightData, Pix, shade, type Color } from './pixels';
import { hash2 } from './rng';
import type { Sprite } from './sprites';

/** Map pixels per room unit. */
export const RTEX = 12;
/** The back wall's height, the side walls' and the front wall's thickness, in pixels. */
const WALL_H = 38;
const SIDE = 6;
const FRONT = 8;

const INK = col(HEX.ink);
const SHADOW = col('#2a1d10', 50);
const WOOD = col('#b98352');
const WOOD_LIGHT = col('#d2a06a');
const WOOD_DARK = col('#8a5a36');
const WOOD_DEEP = col('#6b4228');
const STONE = col('#bdb5a8');
const STONE_LIGHT = col('#d8d1c4');
const STONE_DARK = col('#958c80');
const CREAM = col('#fff3df');
const PAPER = col('#f6e7c4');
const GOLD = col('#f2c14e');
const GOLD_DARK = col('#c8952e');
const IRON = col('#4a4540');
const IRON_LIGHT = col('#6d665e');
const SLATE = col('#2f4a3c');
const SLATE_LIGHT = col('#3d5c4b');
const CHALK = col('#eef3e8');
const GLASS = col('#9cd2e8');
const GLASS_SHINE = col('#d4eef7');
const SKY_NIGHT = col('#22305c');
const STAR = col('#fff6c8');
const RED = col('#e5484d');
const WHITE = col('#ffffff');
const GINGER = col('#f0913a');
const GINGER_DARK = col('#c46a24');
const ROPE = col('#d9b77a');
const ROPE_DARK = col('#b08a4e');
const CARD = col('#d7a768');
const CARD_DARK = col('#b5844a');
const BLUE = col('#3f7fd6');
const GREEN = col('#5cb85a');

const ramp = (hex: string) => [shade(hex, 0.18), shade(hex, 0.08), hex, shade(hex, -0.1), shade(hex, -0.2)].map((h) => col(h));

/** How each kind of building does its walls and floor. */
type Style = { wall: 'logs' | 'plaster' | 'paper' | 'glass' | 'wainscot' | 'metal'; floor: 'planks' | 'dark' | 'parquet' | 'iron' | 'concrete'; wallHex: string };
const STYLES: Record<string, Style> = {
  cabin: { wall: 'logs', floor: 'planks', wallHex: '#c08a56' },
  taproom: { wall: 'plaster', floor: 'dark', wallHex: '#f3e2c4' },
  library: { wall: 'paper', floor: 'parquet', wallHex: '#3a6fd8' },
  lighthouse: { wall: 'glass', floor: 'iron', wallHex: '#e9e4dc' },
  schoolhouse: { wall: 'wainscot', floor: 'planks', wallHex: '#f4ead2' },
  depot: { wall: 'metal', floor: 'concrete', wallHex: '#a9b2b0' },
};

export interface RoomSprite {
  spot: Spot;
  sprite: Sprite | null;
  /** For islanders: their frames, and which way they face. */
  islander?: ExplorerSprites;
  facing: 'down' | 'up' | 'left' | 'right';
}

export interface MapRoom {
  place: Place;
  plan: RoomPlan;
  /** The painted room, in map pixels. */
  w: number;
  h: number;
  bg: { day: HTMLCanvasElement; night: HTMLCanvasElement };
  sprites: RoomSprite[];
  /** Room units to room pixels, and back. */
  px(x: number): number;
  py(z: number): number;
  ux(px: number): number;
  uz(py: number): number;
  /** What's drawn at a room pixel: someone, something, the doorway, or nothing. */
  hit(px: number, py: number): Spot | 'door' | null;
  /** The animated bits (the fire, the lens's glow, the scanner's light), drawn over the background. */
  animate(c: CanvasRenderingContext2D, time: number, motion: boolean): void;
}

function finish(p: Pix, ax: number, ay: number, shadow = true): Sprite {
  p.outline(INK);
  if (shadow) {
    const s = new Pix(p.w, p.h);
    s.ellipse(ax, ay - 1, Math.max(4, p.w / 2 - 1), 2.5, SHADOW);
    s.stamp(p, 0, 0);
    p.data.set(s.data);
  }
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data)), data: p.data };
}

// ---------- Floor things ----------

function desk(arch: string, accent: string): { pix: Pix; ax: number; ay: number } {
  const R = ramp(accent);
  if (arch === 'schoolhouse') {
    // Two rows of little desks, a tablet propped on each.
    const p = new Pix(36, 26);
    for (const [x, y] of [[1, 2], [13, 2], [25, 2], [1, 14], [13, 14], [25, 14]]) {
      p.rect(x, y + 3, 10, 4, WOOD_LIGHT);
      p.hline(x, x + 9, y + 3, col('#e2b47e'));
      p.rect(x, y + 7, 10, 2, WOOD_DARK);
      p.vline(x + 1, y + 9, y + 10, WOOD_DEEP);
      p.vline(x + 8, y + 9, y + 10, WOOD_DEEP);
      p.rect(x + 3, y, 5, 4, IRON);
      p.rect(x + 4, y + 1, 3, 2, (x + y) % 3 ? GLASS : R[1]);
    }
    return { pix: p, ax: 18, ay: 25 };
  }
  const p = new Pix(30, 20);
  p.rect(0, 4, 30, 6, WOOD_LIGHT);
  p.hline(0, 29, 4, col('#e2b47e'));
  p.rect(0, 10, 30, 6, WOOD);
  p.hline(0, 29, 10, WOOD_DARK);
  p.rect(11, 12, 8, 3, WOOD_DARK);
  p.px(15, 13, GOLD);
  p.vline(1, 16, 19, WOOD_DEEP);
  p.vline(28, 16, 19, WOOD_DEEP);
  if (arch === 'lighthouse') {
    // The logbook: open wide, ruled, with a lamp beside it.
    p.rect(6, 3, 14, 6, CREAM);
    p.vline(13, 3, 8, PAPER);
    for (let y = 4; y < 8; y += 2) (p.hline(7, 11, y, STONE_DARK), p.hline(15, 19, y, STONE_DARK));
    p.px(10, 5, RED);
    p.px(17, 7, GREEN);
    p.rect(23, 0, 4, 2, GOLD_DARK);
    p.rect(23, 2, 4, 4, col('#ffe7a6'));
    p.hline(22, 27, 7, IRON);
  } else {
    // The journal, open, in its own color; a pencil, an inkwell and a candle.
    p.rect(6, 4, 12, 5, R[2]);
    p.rect(7, 4, 10, 4, CREAM);
    p.vline(12, 4, 7, PAPER);
    p.hline(8, 11, 5, STONE_DARK);
    p.hline(13, 16, 6, STONE_DARK);
    p.hline(19, 23, 6, GOLD);
    p.px(24, 6, IRON);
    p.rect(25, 3, 3, 3, IRON);
    p.px(26, 3, IRON_LIGHT);
    p.rect(2, 2, 2, 5, CREAM);
    p.px(2, 1, col('#ffd166'));
  }
  return { pix: p, ax: 15, ay: 19 };
}

function counter(accent: string): { pix: Pix; ax: number; ay: number } {
  const R = ramp(accent);
  const p = new Pix(40, 22);
  // Brass taps along the back of the counter.
  for (let x = 4; x < 36; x += 6) {
    p.vline(x, 2, 6, GOLD);
    p.px(x + 1, 2, GOLD_DARK);
    p.rect(x - 1, 0, 3, 2, x === 16 ? IRON : R[1]);
  }
  p.rect(0, 7, 40, 5, WOOD_LIGHT);
  p.hline(0, 39, 7, col('#e2b47e'));
  p.rect(0, 12, 40, 9, WOOD_DARK);
  for (let x = 3; x < 40; x += 5) p.vline(x, 13, 20, WOOD_DEEP);
  p.hline(0, 39, 12, WOOD_DEEP);
  // Two mugs: one full, one empty.
  p.rect(7, 4, 3, 3, CREAM);
  p.hline(7, 9, 4, WHITE);
  p.px(10, 5, CREAM);
  p.rect(28, 4, 3, 3, GOLD);
  p.hline(28, 30, 4, WHITE);
  p.px(31, 5, GOLD);
  return { pix: p, ax: 20, ay: 21 };
}

function lens(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(24, 36);
  // A brass pedestal, and the great ringed glass on top.
  p.rect(6, 28, 12, 7, GOLD_DARK);
  p.hline(6, 17, 28, GOLD);
  p.rect(4, 33, 16, 2, IRON);
  for (let y = 4; y < 28; y++) {
    const k = (y - 4) / 24;
    const half = Math.round(5 + Math.sin(k * Math.PI) * 6);
    p.hline(12 - half, 11 + half, y, y % 3 === 0 ? col('#fff1b8') : y % 3 === 1 ? GLASS_SHINE : GLASS);
  }
  p.rect(9, 1, 6, 3, GOLD_DARK);
  p.hline(9, 14, 1, GOLD);
  p.rect(10, 13, 4, 6, col('#ffe7a6'));
  p.rect(11, 14, 2, 4, col('#fffbe6'));
  return { pix: p, ax: 12, ay: 35 };
}

function cat(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(18, 11);
  p.ellipse(9, 7.5, 8.5, 3.5, ROPE);
  for (let x = 2; x < 17; x += 3) p.px(x, 7, ROPE_DARK);
  p.ellipse(9, 5, 5.5, 3, GINGER);
  p.hline(6, 11, 4, GINGER_DARK);
  p.rect(12, 2, 4, 4, GINGER);
  p.px(12, 1, GINGER);
  p.px(15, 1, GINGER);
  p.px(13, 3, INK);
  p.px(15, 3, INK);
  p.px(14, 5, col('#ff9e9e'));
  p.hline(3, 6, 7, GINGER_DARK);
  p.px(13, 6, BLUE);
  return { pix: p, ax: 9, ay: 10 };
}

function globe(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(14, 24);
  p.ellipse(7, 7, 6, 6, BLUE);
  p.rect(3, 4, 3, 3, GREEN);
  p.rect(8, 7, 3, 4, GREEN);
  p.px(5, 9, GREEN);
  p.px(4, 3, GLASS_SHINE);
  for (let a = 0; a < 20; a++) {
    const t = (a / 20) * Math.PI * 2;
    p.px(Math.round(7 + Math.cos(t) * 7), Math.round(7 + Math.sin(t) * 7), GOLD);
  }
  p.vline(7, 14, 19, WOOD_DARK);
  p.hline(3, 11, 20, WOOD);
  p.px(2, 21, WOOD_DEEP);
  p.px(12, 21, WOOD_DEEP);
  p.px(7, 21, WOOD_DEEP);
  return { pix: p, ax: 7, ay: 22 };
}

function scanner(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(32, 22);
  // A sorting bench: boxes to check, and the scanner on its hook.
  p.rect(0, 9, 32, 4, WOOD_LIGHT);
  p.hline(0, 31, 9, col('#e2b47e'));
  p.rect(0, 13, 32, 2, WOOD_DARK);
  p.vline(1, 15, 21, IRON);
  p.vline(30, 15, 21, IRON);
  p.hline(1, 30, 19, IRON_LIGHT);
  p.rect(3, 3, 7, 6, CARD);
  p.hline(3, 9, 5, CARD_DARK);
  p.rect(11, 5, 5, 4, col('#7fb6d8'));
  p.rect(18, 4, 6, 5, CARD);
  p.vline(21, 4, 8, CARD_DARK);
  // The handheld scanner: a grey grip and a red window.
  p.rect(25, 3, 5, 3, IRON);
  p.rect(26, 6, 2, 3, IRON_LIGHT);
  p.px(29, 4, RED);
  return { pix: p, ax: 16, ay: 21 };
}

function crates(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(26, 30);
  const bale = (x: number, y: number, w: number, h: number) => {
    p.rect(x, y, w, h, CARD);
    p.hline(x, x + w - 1, y, col('#e6bd84'));
    for (let j = y + 2; j < y + h; j += 2) p.hline(x + 1, x + w - 2, j, CARD_DARK);
    p.vline(x + (w >> 1), y, y + h - 1, col('#8a6a3e'));
  };
  bale(0, 19, 13, 10);
  bale(13, 19, 13, 10);
  bale(2, 9, 13, 10);
  bale(14, 10, 11, 9);
  bale(6, 0, 13, 9);
  return { pix: p, ax: 13, ay: 29 };
}

function floorThing(prop: Prop, arch: string, accent: string) {
  switch (prop) {
    case 'desk':
      return desk(arch, accent);
    case 'counter':
      return counter(accent);
    case 'lens':
      return lens();
    case 'cat':
      return cat();
    case 'globe':
      return globe();
    case 'scanner':
      return scanner();
    case 'crates':
      return crates();
    default:
      return null;
  }
}

// ---------- The walls and what hangs on them ----------

function paintBackground(place: Place, plan: RoomPlan, night: boolean): Pix {
  const { w, d } = plan;
  const arch = place.archetype;
  const style = STYLES[arch] ?? STYLES.cabin;
  const W = Math.round(w * RTEX) + SIDE * 2;
  const H = WALL_H + Math.round(d * RTEX) + FRONT;
  const p = new Pix(W, H);
  const fx0 = SIDE;
  const fx1 = W - SIDE - 1;
  const fy0 = WALL_H;
  const fy1 = WALL_H + Math.round(d * RTEX) - 1;
  const R = ramp(place.color);
  const WR = ramp(style.wallHex);

  // The floor.
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const lx = x - fx0;
      const ly = y - fy0;
      let c: Color;
      const n = hash2(x, y, 7);
      switch (style.floor) {
        case 'planks': {
          const row = Math.floor(ly / 6);
          const seam = ly % 6 === 5 || (lx + row * 17) % 31 === 0;
          c = seam ? WOOD_DARK : row % 2 ? WOOD : WOOD_LIGHT;
          if (!seam && n < 0.04) c = WOOD_DARK;
          break;
        }
        case 'dark': {
          const row = Math.floor(ly / 6);
          const seam = ly % 6 === 5 || (lx + row * 13) % 27 === 0;
          c = seam ? WOOD_DEEP : row % 2 ? WOOD_DARK : col('#9a6a42');
          break;
        }
        case 'parquet': {
          const bx = Math.floor(lx / 8);
          const by = Math.floor(ly / 8);
          const along = (bx + by) % 2 === 0;
          const stripe = along ? ly % 8 === 7 || lx % 3 === 0 : lx % 8 === 7 || ly % 3 === 0;
          c = stripe ? WOOD_DARK : along ? WOOD_LIGHT : WOOD;
          break;
        }
        case 'iron': {
          const ring = Math.hypot(lx - (fx1 - fx0) / 2, ly - (fy1 - fy0) / 2.4);
          c = Math.floor(ring) % 10 === 0 ? STONE_DARK : n < 0.5 ? STONE : STONE_LIGHT;
          if ((lx + ly) % 23 === 0) c = STONE_DARK;
          break;
        }
        default: {
          c = n < 0.08 ? col('#9aa19f') : n > 0.96 ? col('#c9cfcc') : col('#b5bcb9');
          if (ly % 24 === 23 || lx % 32 === 31) c = col('#8f9694');
        }
      }
      p.px(x, y, c);
    }
  }
  // A rug in the place's own color, in front of whoever's here.
  const rugW = Math.min(fx1 - fx0 - 20, 54);
  const rx = Math.round((fx0 + fx1) / 2 - rugW / 2);
  const ry = fy1 - 26;
  p.rect(rx, ry, rugW, 14, R[2]);
  p.rect(rx + 2, ry + 2, rugW - 4, 10, R[1]);
  p.rect(rx + 4, ry + 4, rugW - 8, 6, R[3]);
  for (let x = rx; x < rx + rugW; x += 2) (p.px(x, ry - 1, CREAM), p.px(x, ry + 14, CREAM));

  // The back wall.
  for (let y = 0; y < fy0; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const lx = x - fx0;
      let c: Color;
      switch (style.wall) {
        case 'logs': {
          const band = Math.floor(y / 5);
          c = y % 5 === 4 ? WOOD_DEEP : band % 2 ? WOOD : WOOD_LIGHT;
          if (y % 5 === 0 && hash2(x, band, 3) < 0.12) c = WOOD_DARK;
          break;
        }
        case 'plaster':
          c = lx % 34 < 3 || y < 4 ? WOOD_DEEP : hash2(x, y, 5) < 0.05 ? WR[3] : WR[2];
          if (y >= 18 && y < 21) c = WOOD_DEEP;
          break;
        case 'paper':
          c = y >= fy0 - 12 ? (y === fy0 - 12 ? WOOD_LIGHT : (lx % 10 === 0 ? WOOD_DEEP : WOOD_DARK)) : lx % 6 < 3 ? col(shade(style.wallHex, 0.28)) : col(shade(style.wallHex, 0.2));
          break;
        case 'glass': {
          // The lamp room: glass all round, white frames, sky through it.
          const frame = lx % 18 < 2 || y < 4 || y >= fy0 - 8;
          c = frame ? (y >= fy0 - 8 ? col('#c94a4a') : WR[1]) : night ? (hash2(x, y, 11) < 0.012 ? STAR : SKY_NIGHT) : y < 14 ? GLASS_SHINE : GLASS;
          if (y === fy0 - 8) c = WHITE;
          break;
        }
        case 'wainscot':
          c = y >= fy0 - 12 ? (y === fy0 - 12 ? col('#e9f1e2') : lx % 8 === 0 ? col('#6f9a7a') : col('#86b28f')) : hash2(x, y, 9) < 0.04 ? WR[3] : WR[2];
          break;
        default:
          c = lx % 6 < 2 ? col('#8e9795') : lx % 6 < 4 ? col('#b9c1bf') : col('#a3acaa');
          if (y < 3) c = IRON;
      }
      p.px(x, y, c);
    }
  }
  p.hline(fx0, fx1, fy0 - 1, INK);
  p.hline(fx0, fx1, fy0, col('#5a4033'));

  // Windows, wherever the wall is free (not the lamp room: it's all window).
  const hung = plan.spots.filter((s) => s.kind === 'thing' && (s.hang || s.prop === 'bookshelf' || s.prop === 'hearth' || s.prop === 'cabinet'));
  const free = (x0: number, x1: number) => hung.every((s) => x1 < SIDE + (s.x - s.hw + w / 2) * RTEX - 2 || x0 > SIDE + (s.x + s.hw + w / 2) * RTEX + 2);
  if (style.wall !== 'glass') {
    let made = 0;
    for (const k of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const wx = Math.round(fx0 + (fx1 - fx0) * k - 8);
      if (made >= 2 || !free(wx, wx + 16)) continue;
      made++;
      const wy = 7;
      p.rect(wx, wy, 16, 15, col('#fffaf2'));
      for (let y = wy + 1; y < wy + 14; y++) for (let x = wx + 1; x < wx + 15; x++) p.px(x, y, night ? (hash2(x, y, 4) < 0.03 ? STAR : SKY_NIGHT) : y < wy + 5 ? GLASS_SHINE : GLASS);
      p.vline(wx + 8, wy, wy + 14, col('#fffaf2'));
      p.hline(wx, wx + 15, wy + 7, col('#fffaf2'));
      p.hline(wx - 1, wx + 16, wy + 15, WOOD_DEEP);
      // A sill with a little pot plant on it.
      p.px(wx + 2, wy + 13, col('#c96f4a'));
      p.px(wx + 3, wy + 13, col('#c96f4a'));
      p.px(wx + 2, wy + 12, GREEN);
      p.px(wx + 3, wy + 11, GREEN);
    }
  }

  // Things against the back wall.
  for (const s of hung) {
    const cx = Math.round(SIDE + (s.x + w / 2) * RTEX);
    const width = Math.round(s.hw * 2 * RTEX);
    const x0 = cx - (width >> 1);
    switch (s.prop) {
      case 'frame': {
        const y0 = 8;
        const h = 16;
        p.rect(x0, y0, width, h, GOLD_DARK);
        p.hline(x0, x0 + width - 1, y0, GOLD);
        p.vline(x0, y0, y0 + h - 1, GOLD);
        const ix = x0 + 2;
        const iy = y0 + 2;
        const iw = width - 4;
        const ih = h - 4;
        if (arch === 'cabin') {
          // A phone, a long thread of messages on it.
          p.rect(ix, iy, iw, ih, col('#efe4cf'));
          const ph = cx - 4;
          p.rect(ph, iy, 9, ih, IRON);
          p.rect(ph + 1, iy + 1, 7, ih - 2, CREAM);
          for (let y = iy + 2, k = 0; y < iy + ih - 2; y += 2, k++) p.hline(k % 2 ? ph + 2 : ph + 4, k % 2 ? ph + 4 : ph + 6, y, k % 2 ? STONE : R[2]);
        } else if (arch === 'depot') {
          // A blue ribbon.
          p.rect(ix, iy, iw, ih, CREAM);
          p.ellipse(cx, iy + 4, 3.5, 3.5, BLUE);
          p.px(cx, iy + 4, GOLD);
          p.vline(cx - 2, iy + 7, iy + ih - 1, BLUE);
          p.vline(cx + 2, iy + 7, iy + ih - 1, BLUE);
        } else {
          // A palate, mapped: two axes and a scatter of dots.
          p.rect(ix, iy, iw, ih, CREAM);
          p.vline(ix + 2, iy + 1, iy + ih - 2, IRON);
          p.hline(ix + 2, ix + iw - 2, iy + ih - 2, IRON);
          for (let k = 0; k < 8; k++) p.px(ix + 4 + Math.floor(hash2(k, 1, 2) * (iw - 6)), iy + 1 + Math.floor(hash2(k, 2, 2) * (ih - 4)), k % 3 ? R[2] : RED);
        }
        p.hline(x0 + 1, x0 + width - 2, y0 + h, SHADOW);
        break;
      }
      case 'board': {
        const y0 = 5;
        const h = 24;
        p.rect(x0, y0, width, h, WOOD_DARK);
        p.hline(x0, x0 + width - 1, y0, WOOD_LIGHT);
        const ix = x0 + 2;
        const iy = y0 + 2;
        const iw = width - 4;
        const ih = h - 5;
        if (arch === 'library') {
          // A map, with a red thread pinned from city to city.
          p.rect(ix, iy, iw, ih, PAPER);
          for (let k = 0; k < 40; k++) p.px(ix + Math.floor(hash2(k, 5) * iw), iy + Math.floor(hash2(k, 6) * ih), col('#d9c49a'));
          p.ellipse(ix + iw * 0.3, iy + ih * 0.45, 6, 4, col('#cfe0c0'));
          p.ellipse(ix + iw * 0.7, iy + ih * 0.55, 7, 5, col('#cfe0c0'));
          const pins = [[0.12, 0.7], [0.3, 0.35], [0.5, 0.6], [0.68, 0.3], [0.86, 0.55]].map(([a, b]) => [Math.round(ix + a * iw), Math.round(iy + b * ih)]);
          for (let k = 0; k < pins.length - 1; k++) {
            const [ax, ay] = pins[k];
            const [bx, by] = pins[k + 1];
            const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
            for (let t = 0; t <= n; t++) p.px(Math.round(ax + ((bx - ax) * t) / n), Math.round(ay + ((by - ay) * t) / n), RED);
          }
          for (const [x, y] of pins) (p.px(x, y - 1, GOLD), p.px(x, y, IRON));
        } else {
          // A slate, chalked: lines of writing, and (at the taproom) a score by every drink.
          p.rect(ix, iy, iw, ih, SLATE);
          for (let y = iy + 2; y < iy + ih - 1; y += 3) {
            const len = Math.floor(iw * (0.45 + hash2(y, x0, 1) * 0.3));
            for (let x = ix + 2; x < ix + 2 + len; x++) if (hash2(x, y, 3) > 0.25) p.px(x, y, CHALK);
            if (arch === 'taproom') p.hline(ix + iw - 7, ix + iw - 7 + Math.round(2 + hash2(y, 2) * 3), y, (y >> 1) % 2 ? GOLD : R[1]);
            else if (hash2(y, 9) > 0.5) p.px(ix + iw - 4, y, GOLD);
          }
          p.px(ix + 1, iy + 1, SLATE_LIGHT);
          p.hline(ix, ix + iw - 1, iy + ih, WOOD_LIGHT);
          p.rect(ix + 3, iy + ih, 3, 1, CHALK);
        }
        p.hline(x0 + 1, x0 + width - 2, y0 + h, SHADOW);
        break;
      }
      case 'bookshelf': {
        const top = 2;
        const bottom = fy0 + Math.round(s.hd * 2 * RTEX) - 2;
        p.rect(x0, top, width, bottom - top, WOOD_DARK);
        p.rect(x0 + 2, top + 2, width - 4, bottom - top - 4, WOOD_DEEP);
        const SPINES = ['#c0392b', '#3a6fd8', '#2e9c8f', '#e9b949', '#7a4e2d', '#8e7cc3', '#4caf6a', '#f3e2c4'].map((h) => col(h));
        for (let shelf = top + 2, k = 0; shelf + 8 < bottom - 2; shelf += 9, k++) {
          for (let x = x0 + 2; x < x0 + width - 2; ) {
            const bw = 2 + Math.floor(hash2(x, k, 8) * 2);
            const bh = 5 + Math.floor(hash2(x, k, 9) * 3);
            const c = SPINES[Math.floor(hash2(x, k, 10) * SPINES.length)];
            // The shelf of lost words is mostly empty.
            if (!(k === 1 && x > x0 + 6)) p.rect(x, shelf + 8 - bh, bw, bh, c);
            x += bw + (hash2(x, k, 12) < 0.15 ? 1 : 0);
          }
          p.hline(x0 + 2, x0 + width - 3, shelf + 8, WOOD_LIGHT);
        }
        break;
      }
      case 'hearth': {
        const top = 4;
        const bottom = fy0 + Math.round(s.hd * 2 * RTEX) - 2;
        for (let y = top; y < bottom; y++) for (let x = x0; x < x0 + width; x++) {
          const brick = ((y >> 2) % 2 ? x + 3 : x) % 7 === 0 || y % 4 === 0;
          p.px(x, y, brick ? STONE_DARK : hash2(x, y, 1) < 0.3 ? STONE_LIGHT : STONE);
        }
        p.rect(x0 - 2, top + 8, width + 4, 3, WOOD_DARK);
        p.hline(x0 - 2, x0 + width + 1, top + 8, WOOD_LIGHT);
        const ow = width - 12;
        p.rect(x0 + 6, bottom - 16, ow, 16, col('#2b1d17'));
        p.rect(x0 + 7, bottom - 15, ow - 2, 2, col('#3b2a20'));
        // The kettle on its hook.
        p.vline(cx, bottom - 16, bottom - 11, IRON);
        p.rect(cx - 3, bottom - 10, 7, 5, IRON_LIGHT);
        p.hline(cx - 2, cx + 2, bottom - 10, col('#8c847a'));
        p.px(cx + 4, bottom - 9, IRON_LIGHT);
        break;
      }
      case 'cabinet': {
        const top = 8;
        const bottom = fy0 + Math.round(s.hd * 2 * RTEX) - 2;
        p.rect(x0, top, width, bottom - top, WOOD);
        p.hline(x0, x0 + width - 1, top, WOOD_LIGHT);
        for (let y = top + 2; y + 4 < bottom; y += 5) {
          for (let x = x0 + 2; x + 4 < x0 + width; x += 5) {
            p.rect(x, y, 4, 4, WOOD_LIGHT);
            p.px(x + 1, y + 2, GOLD);
            p.px(x + 2, y + 2, GOLD);
          }
        }
        break;
      }
    }
  }

  // Side walls, and the front wall with the doorway in it.
  const wallTop = col(shade(style.wallHex === '#3a6fd8' ? '#6b4a3a' : style.wallHex, -0.32));
  const wallEdge = col(shade(style.wallHex === '#3a6fd8' ? '#6b4a3a' : style.wallHex, -0.15));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < SIDE; x++) {
      p.px(x, y, x === SIDE - 1 ? wallEdge : wallTop);
      p.px(W - 1 - x, y, x === SIDE - 1 ? wallEdge : wallTop);
    }
  }
  const doorL = Math.round(SIDE + (-0.8 + w / 2) * RTEX);
  const doorR = Math.round(SIDE + (0.8 + w / 2) * RTEX) - 1;
  for (let y = fy1 + 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= doorL && x <= doorR) {
        // Through the doorway: the island outside, lit (or moonlit).
        p.px(x, y, night ? col('#33415f') : y - fy1 < 3 ? col('#f0d69c') : col('#a4dc6e'));
        continue;
      }
      p.px(x, y, y === fy1 + 1 ? wallEdge : wallTop);
    }
  }
  // A doormat just inside, in the place's color.
  p.rect(doorL + 2, fy1 - 5, doorR - doorL - 3, 5, R[3]);
  for (let x = doorL + 3; x < doorR - 1; x += 2) p.px(x, fy1 - 3, R[1]);
  p.vline(doorL - 1, fy1 - 2, H - 1, WOOD_DEEP);
  p.vline(doorR + 1, fy1 - 2, H - 1, WOOD_DEEP);
  // The outline round the whole room.
  for (let x = 0; x < W; x++) (p.px(x, 0, INK), p.px(x, H - 1, x >= doorL && x <= doorR ? p.get(x, H - 1) : INK));
  for (let y = 0; y < H; y++) (p.px(0, y, INK), p.px(W - 1, y, INK));
  return p;
}

/** Paint a building's room for the map. */
export function paintRoom(place: Place): MapRoom {
  const plan = planRoom(place.interior!, place.archetype);
  const day = paintBackground(place, plan, false);
  const nite = paintBackground(place, plan, true);
  const { w } = plan;
  const W = day.w;
  const H = day.h;
  const px = (x: number) => Math.round(SIDE + (x + w / 2) * RTEX);
  const py = (z: number) => Math.round(WALL_H + (z + plan.d / 2) * RTEX);
  const ux = (x: number) => (x - SIDE) / RTEX - w / 2;
  const uz = (y: number) => (y - WALL_H) / RTEX - plan.d / 2;
  const things = new Map<string, Thing>(place.interior!.things.map((t) => [t.id, t]));

  const sprites: RoomSprite[] = [];
  for (const spot of plan.spots) {
    if (spot.kind === 'person') {
      sprites.push({ spot, sprite: null, islander: paintExplorer(spot.color), facing: 'down' });
      continue;
    }
    const t = things.get(spot.id)!;
    const art = floorThing(t.prop, place.archetype, place.color);
    if (art) sprites.push({ spot, sprite: finish(art.pix, art.ax, art.ay), facing: 'down' });
  }

  // For taps: which pixels belong to what. Floor things and people by their
  // painted pixels; wall things by the rectangle they take on the wall.
  const hit = (x: number, y: number): Spot | 'door' | null => {
    if (y >= H - FRONT - 6 && Math.abs(ux(x)) < 0.8) return 'door';
    let best: Spot | null = null;
    let bestZ = -Infinity;
    for (const s of sprites) {
      const sx = px(s.spot.x);
      const sy = py(s.spot.z + (s.spot.kind === 'person' ? 0 : s.spot.hd));
      const sw = s.sprite?.w ?? (s.islander?.w ?? 14) + 4;
      const sh = s.sprite?.h ?? (s.islander?.h ?? 17) + 2;
      const ax = s.sprite?.ax ?? sw >> 1;
      const ay = s.sprite?.ay ?? sh;
      const lx = x - (sx - ax);
      const ly = y - (sy - ay);
      if (lx < 0 || ly < 0 || lx >= sw || ly >= sh) continue;
      if (s.sprite && s.sprite.data[ly * s.sprite.w + lx] >>> 24 < 100) continue;
      if (s.spot.z > bestZ) (best = s.spot), (bestZ = s.spot.z);
    }
    if (best) return best;
    for (const s of plan.spots) {
      if (s.kind !== 'thing' || !(s.hang || s.prop === 'bookshelf' || s.prop === 'hearth' || s.prop === 'cabinet')) continue;
      if (Math.abs(ux(x) - s.x) <= s.hw && y < WALL_H + s.hd * 2 * RTEX && y > 2) return s;
    }
    return null;
  };

  const hearth = plan.spots.find((s) => s.prop === 'hearth');
  const lensSpot = plan.spots.find((s) => s.prop === 'lens');
  const scan = plan.spots.find((s) => s.prop === 'scanner');
  const FIRE = ['#ffd166', '#ff9f43', '#ff6b3d', '#fff1b8'];
  const animate = (c: CanvasRenderingContext2D, time: number, motion: boolean) => {
    if (hearth) {
      // Flames that flicker, a pixel at a time.
      const cx = px(hearth.x);
      const base = WALL_H + Math.round(hearth.hd * 2 * RTEX) - 3;
      const f = motion ? Math.floor(time * 8) : 0;
      for (let i = -5; i <= 5; i++) {
        const h = Math.max(1, Math.round(6 - Math.abs(i) * 0.9 + hash2(i, f, 3) * 3));
        for (let j = 0; j < h; j++) {
          c.fillStyle = FIRE[Math.min(3, Math.floor((j / h) * 3) + (hash2(i, j + f, 5) < 0.15 ? 1 : 0))];
          c.fillRect(cx + i, base - j, 1, 1);
        }
      }
    }
    if (lensSpot && motion) {
      // The light, turning: a bright band sweeping round the glass.
      const cx = px(lensSpot.x);
      const top = py(lensSpot.z + lensSpot.hd) - 32;
      const k = (time * 0.6) % 1;
      c.globalAlpha = 0.75;
      c.fillStyle = '#fffbe6';
      c.fillRect(cx - 7 + Math.round(k * 14), top + 4, 2, 22);
      c.globalAlpha = 1;
    }
    if (scan && motion && Math.floor(time * 2) % 3 === 0) {
      c.fillStyle = '#ff5a52';
      c.fillRect(px(scan.x) + 13, py(scan.z + scan.hd) - 17, 1, 1);
      c.fillRect(px(scan.x) + 13, py(scan.z + scan.hd) - 15, 5, 1);
    }
  };

  return { place, plan, w: W, h: H, bg: { day: day.canvas(), night: nite.canvas() }, sprites, px, py, ux, uz, hit, animate };
}

