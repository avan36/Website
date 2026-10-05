// Inside a building, on the map: a little pixel room in the same palette and
// the same hand as the overworld. The back wall and everything that hangs on
// it is painted once into the background; what stands on the floor (desks,
// the lens, the cat, the islanders) are sprites, y-sorted with the explorer.
// Twelve map pixels to the metre (the overworld has eight), so a room is a
// close-up: furniture gets a little more detail than a whole building does.
//
// Geometry, reach and pathfinding are roomPlan.ts's, shared with the island.

import type { Outfit, Place, Prop, Thing } from '../../world/schema';
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

// The mall: bright tiles, steel, and the lit shops along the back.
const TILE = col('#f5f0e7');
const TILE_ALT = col('#ece5d9');
const TILE_GROUT = col('#d9d0c2');
const TILE_SHINE = col('#fffcf5');
const STEEL = col('#c3cad0');
const STEEL_LIGHT = col('#e4e9ec');
const STEEL_DARK = col('#8f989f');
const HANDRAIL = col('#26282c');
const TREAD = col('#6f767d');
const TREAD_LIGHT = col('#868d94');
const TREAD_LINE = col('#4d5359');
const SHOP_LIT = col('#fff4d6');
const SHOP_DEEP = col('#f3dfb3');
const CHECK_RED = col('#d42a32');
const CHECK_WHITE = col('#fbf5ea');

/** How each kind of building does its walls and floor. */
type Style = { wall: 'logs' | 'plaster' | 'paper' | 'glass' | 'wainscot' | 'metal' | 'mall'; floor: 'planks' | 'dark' | 'parquet' | 'iron' | 'concrete' | 'tiles'; wallHex: string };
const STYLES: Record<string, Style> = {
  cabin: { wall: 'logs', floor: 'planks', wallHex: '#c08a56' },
  taproom: { wall: 'plaster', floor: 'dark', wallHex: '#f3e2c4' },
  library: { wall: 'paper', floor: 'parquet', wallHex: '#3a6fd8' },
  lighthouse: { wall: 'glass', floor: 'iron', wallHex: '#e9e4dc' },
  schoolhouse: { wall: 'wainscot', floor: 'planks', wallHex: '#f4ead2' },
  depot: { wall: 'metal', floor: 'concrete', wallHex: '#a9b2b0' },
  mall: { wall: 'mall', floor: 'tiles', wallHex: '#f3efe8' },
  townhouse: { wall: 'plaster', floor: 'planks', wallHex: '#e3e6d6' },
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
  /** The tops of its walls, and their inner edge (for drawing it part open). */
  rim: { top: string; edge: string };
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

/** The burger counter's size, and the row its hot plate is on (the steam rises from there). */
const GRILL = { w: 42, h: 45, plate: 21 };
/** The burger counter: a menu board hung over it, a grill behind it with burgers on, a steel top, and red and white tiles down the front. */
function grill(): { pix: Pix; ax: number; ay: number } {
  const { w, h, plate } = GRILL;
  const p = new Pix(w, h);
  const BOARD = col('#2b2d33');
  // The menu board on its wires: a red header, the menu in white, prices in gold.
  p.vline(9, 0, 2, IRON);
  p.vline(32, 0, 2, IRON);
  p.rect(4, 3, 34, 12, BOARD);
  p.rect(4, 3, 34, 2, CHECK_RED);
  for (let y = 7; y < 14; y += 2) {
    const len = 9 + Math.floor(hash2(y, 3, 4) * 10);
    p.hline(7, 7 + len, y, CHECK_WHITE);
    p.hline(31, 34, y, GOLD);
  }
  // The grill behind the counter: a steel splashback and the hot plate, burgers sizzling on it.
  p.rect(2, 16, 38, plate - 16, STEEL_LIGHT);
  p.hline(2, 39, 16, WHITE);
  p.rect(3, plate, 36, 3, IRON);
  for (const x of [6, 11, 16, 23, 28]) {
    p.rect(x, plate, 3, 2, col('#7a4a2a'));
    p.px(x + 1, plate, col('#9c6236'));
  }
  // The steel top, with an order waiting: a burger in foil and a cup of fries.
  p.rect(0, 24, w, 3, STEEL);
  p.hline(0, w - 1, 24, STEEL_LIGHT);
  p.hline(0, w - 1, 26, STEEL_DARK);
  p.rect(30, 21, 4, 3, STEEL_LIGHT);
  p.px(31, 21, WHITE);
  p.rect(35, 21, 3, 3, CHECK_RED);
  p.hline(35, 37, 20, GOLD);
  p.px(36, 19, GOLD);
  // Red and white tiles down the front, and a dark kick plate.
  for (let y = 27; y < h - 1; y++) for (let x = 0; x < w; x++) p.px(x, y, (Math.floor(x / 3) + Math.floor((y - 27) / 3)) % 2 ? CHECK_WHITE : CHECK_RED);
  p.hline(0, w - 1, h - 1, IRON);
  return { pix: p, ax: 21, ay: h - 1 };
}

/** Sacks of potatoes, stacked two and one, with a couple of potatoes rolled out. */
function sacks(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(19, 20);
  const BURLAP = col('#c9a66b');
  const BURLAP_LIGHT = col('#ddbf88');
  const BURLAP_DARK = col('#a5844e');
  const POTATO = col('#b98a4e');
  const sack = (x: number, y: number) => {
    p.rect(x + 1, y + 2, 7, 8, BURLAP);
    p.rect(x, y + 4, 9, 5, BURLAP);
    p.vline(x + 1, y + 3, y + 8, BURLAP_LIGHT);
    p.vline(x + 7, y + 3, y + 9, BURLAP_DARK);
    p.hline(x + 1, x + 7, y + 6, CHECK_RED); // a red band printed round it
    p.rect(x + 3, y, 3, 2, BURLAP_DARK); // the tied neck
    p.px(x + 4, y + 2, ROPE_DARK);
  };
  sack(0, 9);
  sack(9, 9);
  sack(5, 1);
  p.rect(2, 18, 2, 2, POTATO);
  p.rect(14, 18, 2, 1, POTATO);
  return { pix: p, ax: 9, ay: 19 };
}

/** Two armchairs facing each other across a rug; a closed notepad on the far one's arm. */
function armchairs(accent: string): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(40, 22);
  const CLOTH = col('#d9c8ad');
  const CLOTH_LIGHT = col('#e8dcc6');
  const CLOTH_DARK = col('#bba582');
  const rug = col(shade(accent, 0.22));
  p.rect(9, 12, 22, 9, rug);
  p.rect(11, 13, 18, 7, col(shade(accent, 0.34)));
  const chair = (x: number, back: 'left' | 'right') => {
    // Seen from the front and above: arms front and back, a cushion, the back on the outer side.
    p.rect(x, 6, 12, 14, CLOTH_DARK);
    p.rect(x + 1, 9, 10, 8, CLOTH);
    p.hline(x + 1, x + 10, 9, CLOTH_LIGHT);
    p.rect(x, 5, 12, 3, CLOTH_DARK);
    p.hline(x, x + 11, 5, CLOTH);
    p.rect(x, 18, 12, 2, CLOTH_DARK);
    const bx = back === 'left' ? x : x + 9;
    p.rect(bx, 1, 3, 18, CLOTH_DARK);
    p.vline(back === 'left' ? bx : bx + 2, 1, 18, CLOTH);
    p.rect(back === 'left' ? x + 3 : x + 6, 8, 3, 6, col(shade(accent, 0.1)));
    p.px(x + 1, 20, WOOD_DEEP);
    p.px(x + 10, 20, WOOD_DEEP);
  };
  chair(0, 'left');
  chair(28, 'right');
  // The notepad on the far chair's arm, and a pen.
  p.rect(29, 4, 4, 3, CREAM);
  p.hline(29, 32, 7, col(shade(accent, -0.1)));
  p.hline(33, 35, 5, IRON);
  return { pix: p, ax: 20, ay: 21 };
}

/** A little round table with a lamp, lit, and a box of tissues, one pulled up. */
function sidetable(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(14, 22);
  p.ellipse(7, 12, 6, 2, WOOD_LIGHT);
  p.hline(2, 12, 13, WOOD);
  p.vline(7, 14, 20, WOOD_DARK);
  p.hline(4, 10, 21, WOOD_DEEP);
  // The lamp: a gold stem and a warm shade.
  p.vline(4, 5, 11, GOLD_DARK);
  p.rect(1, 1, 7, 4, col('#ffe2b0'));
  p.hline(2, 6, 0, col('#ffeccb'));
  p.hline(1, 7, 5, col('#e8c48e'));
  // The tissues.
  p.rect(8, 8, 5, 3, col('#a9c4d8'));
  p.hline(8, 12, 8, col('#c3d8e6'));
  p.px(10, 7, WHITE);
  p.px(10, 6, WHITE);
  p.px(11, 6, WHITE);
  return { pix: p, ax: 7, ay: 21 };
}

/** A narrow shelf on a stand, with a little clock on it, its face turned to the far chair. */
function clock(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(12, 22);
  p.rect(1, 9, 10, 2, WOOD);
  p.hline(1, 10, 9, WOOD_LIGHT);
  p.vline(5, 11, 20, WOOD_DARK);
  p.vline(6, 11, 20, WOOD_DEEP);
  p.hline(3, 8, 21, WOOD_DEEP);
  // The clock, side on: a wooden case and a sliver of its face to the right.
  p.rect(3, 2, 5, 7, WOOD_DARK);
  p.hline(3, 7, 2, WOOD);
  p.vline(8, 3, 7, CREAM);
  p.px(9, 5, CREAM);
  return { pix: p, ax: 6, ay: 21 };
}

/** A leafy plant in a clay pot. */
function plant(): { pix: Pix; ax: number; ay: number } {
  const p = new Pix(14, 22);
  const POT = col('#c47a4e');
  p.rect(3, 14, 8, 7, POT);
  p.hline(2, 11, 13, col('#b06a42'));
  p.hline(4, 9, 21, col('#a05e3a'));
  const LEAF = [col('#6fc06a'), col('#5fae5a'), col('#4f9c4d')];
  for (const [x, y, k] of [[7, 3, 0], [4, 6, 1], [10, 6, 2], [6, 8, 1], [3, 10, 0], [11, 10, 1], [8, 10, 2], [5, 12, 2], [9, 12, 0]] as const) p.ellipse(x, y, 2.4, 1.6, LEAF[k]);
  p.vline(7, 5, 12, col('#4f7a3a'));
  return { pix: p, ax: 7, ay: 21 };
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
    case 'grill':
      return grill();
    case 'sacks':
      return sacks();
    case 'armchairs':
      return armchairs(accent);
    case 'sidetable':
      return sidetable();
    case 'clock':
      return clock();
    case 'plant':
      return plant();
    default:
      return null;
  }
}

// ---------- The walls and what hangs on them ----------

/** Things painted into the back wall (rather than standing as sprites): what hangs on it, and what stands right against it. */
const onWall = (s: Spot) => s.kind === 'thing' && (s.hang || s.prop === 'bookshelf' || s.prop === 'hearth' || s.prop === 'cabinet' || s.prop === 'escalator');

/** The tops of the walls, seen from above, and their inner edge. */
function wallRim(style: Style) {
  const hex = style.wallHex === '#3a6fd8' ? '#6b4a3a' : style.wallHex;
  return { top: shade(hex, -0.32), edge: shade(hex, -0.15) };
}

/** The mall's directory: a lit map of the centre, shops in every color round its corridors, and the red dot. */
const DIRECTORY = { y0: 11, h: 24 };
function directory(p: Pix, x0: number, width: number, R: Color[]) {
  const { y0, h } = DIRECTORY;
  p.rect(x0, y0, width, h, STEEL_DARK);
  p.hline(x0, x0 + width - 1, y0, STEEL_LIGHT);
  const ix = x0 + 2;
  const iy = y0 + 2;
  const iw = width - 4;
  const ih = h - 4;
  p.rect(ix, iy, iw, ih, WHITE);
  p.rect(ix, iy, iw, 2, R[2]);
  // Two rows of shops either side of a corridor, a cross corridor, and the escalators' square.
  const SHOPS = ['#3a86ff', '#2e9c8f', '#ffbe0b', '#ff7a45', '#8e7cc3', '#4caf6a', '#e0559a', '#7fb6d8', '#f0a92e'].map((h) => col(h));
  const hall = iy + 2 + Math.floor((ih - 2) / 2);
  p.rect(ix, hall - 1, iw, 3, col('#e3e7ea'));
  let k = 0;
  for (const [top, bottom] of [[iy + 3, hall - 2], [hall + 2, iy + ih - 2]]) {
    for (let x = ix + 1; x < ix + iw - 1; ) {
      const w = 4 + Math.floor(hash2(k, top, 21) * 4);
      const right = Math.min(ix + iw - 2, x + w - 1);
      if (k === 3) p.rect(x, top, right - x + 1, bottom - top + 1, col('#e3e7ea'));
      else p.rect(x, top, right - x + 1, bottom - top + 1, SHOPS[k % SHOPS.length]);
      x = right + 2;
      k++;
    }
  }
  // YOU ARE HERE: a red dot in a white ring, on the corridor.
  const dot = directoryDot(x0, width);
  p.rect(dot.x - 2, dot.y - 2, 5, 5, WHITE);
  p.rect(dot.x - 1, dot.y - 1, 3, 3, RED);
  p.hline(x0 + 1, x0 + width - 2, y0 + h, SHADOW);
}
/** Where the directory's red dot is. */
const directoryDot = (x0: number, width: number) => ({ x: x0 + Math.round(width * 0.36), y: DIRECTORY.y0 + 2 + 2 + Math.floor((DIRECTORY.h - 6) / 2) });

/** A row of shops along the mall's back wall: blank signs, striped awnings, lit windows and open doors. No names. */
function shopfronts(p: Pix, x0: number, width: number, floor: number) {
  const top = 11;
  const n = Math.max(1, Math.round(width / 19));
  const sw = Math.floor(width / n);
  const COLORS = [
    ['#2e9c8f', '#d9f2ec'],
    ['#e0559a', '#ffe0ee'],
    ['#f0a92e', '#fff0cc'],
  ].map((pair) => pair.map((h) => col(h)));
  for (let k = 0; k < n; k++) {
    const sx = x0 + k * sw;
    const ex = k === n - 1 ? x0 + width - 1 : sx + sw - 1;
    const [a, b] = COLORS[k % COLORS.length];
    // The unit's frame, and its sign: a plain board in its own color.
    p.rect(sx, top, ex - sx + 1, floor - top, col('#e8e3da'));
    p.rect(sx + 1, top + 1, ex - sx - 1, 3, a);
    p.hline(sx + 3, ex - 3, top + 2, b);
    // A striped awning with a scalloped edge.
    for (let y = top + 5; y < top + 10; y++) for (let x = sx + 1; x < ex; x++) p.px(x, y, ((x - sx) >> 1) % 2 ? b : a);
    for (let x = sx + 1; x < ex; x += 2) p.px(x, top + 10, a);
    // The window, lit, and an open door to one side.
    const wy = top + 12;
    const door = ex - 6;
    p.rect(sx + 1, wy, door - sx - 2, floor - wy - 2, SHOP_LIT);
    p.rect(door, wy + 2, 5, floor - wy - 2, SHOP_DEEP);
    p.hline(door, door + 4, floor - 1, SHOP_LIT);
    // What's in the window: clothes on a rail, shoes on shelves, or a stack of gift boxes.
    const ix = sx + 2;
    const iw = door - sx - 4;
    if (k % 3 === 0) {
      p.hline(ix, ix + iw - 1, wy + 2, IRON_LIGHT);
      for (let x = ix + 1, c = 0; x + 2 < ix + iw; x += 4, c++) {
        const cl = [BLUE, RED, GREEN, GOLD][c % 4];
        p.rect(x, wy + 3, 3, 6, cl);
        p.px(x - 1, wy + 4, cl);
        p.px(x + 3, wy + 4, cl);
      }
    } else if (k % 3 === 1) {
      for (const y of [wy + 6, wy + 11]) {
        p.hline(ix, ix + iw - 1, y, WOOD_DARK);
        for (let x = ix + 1, c = 0; x + 2 < ix + iw; x += 4, c++) p.rect(x, y - 2, 3, 2, [IRON, RED, WOOD, BLUE][(c + y) % 4]);
      }
    } else {
      const boxes: [number, number, number, number, Color][] = [[0, 9, 5, 4, RED], [5, 10, 4, 3, BLUE], [1, 5, 4, 4, GREEN], [6, 6, 3, 4, GOLD], [3, 2, 3, 3, col('#e0559a')]];
      for (const [x, y, w, h, c] of boxes) if (x + w <= iw) (p.rect(ix + x, wy + y, w, h, c), p.vline(ix + x + (w >> 1), wy + y, wy + y + h - 1, WHITE));
    }
    // A pillar between units.
    p.vline(sx, top, floor - 1, STEEL);
  }
  p.vline(x0 + width - 1, top, floor - 1, STEEL);
  p.hline(x0, x0 + width - 1, top, STEEL_LIGHT);
}

/** The escalator, against the back wall: steel sides, black handrails, and steps climbing toward the wall and up out of the room. */
function escalator(p: Pix, x0: number, width: number, bottom: number) {
  for (let y = 0; y <= bottom; y++) {
    for (let x = x0; x < x0 + width; x++) {
      const i = x - x0;
      const side = i < 4 || i >= width - 4;
      const up = bottom - y;
      p.px(x, y, side ? (i === 0 || i === width - 1 ? STEEL_DARK : i === 1 || i === width - 2 ? STEEL_LIGHT : STEEL) : up % 3 === 0 ? TREAD_LINE : up % 3 === 1 ? TREAD_LIGHT : TREAD);
    }
    p.px(x0 + 3, y, HANDRAIL);
    p.px(x0 + width - 4, y, HANDRAIL);
  }
  // Up through the ceiling.
  p.rect(x0 - 1, 0, width + 2, 4, col('#3b4047'));
  // The landing plate at the foot, and the handrails curling round at the bottom.
  p.rect(x0 + 4, bottom - 3, width - 8, 4, STEEL_LIGHT);
  for (let x = x0 + 5; x < x0 + width - 5; x += 2) p.vline(x, bottom - 2, bottom, STEEL);
  for (const x of [x0 + 3, x0 + width - 4]) p.vline(x, bottom - 1, bottom + 1, HANDRAIL);
  // Its shadow on the floor beside it.
  for (let y = WALL_H; y <= bottom; y++) p.px(x0 - 1, y, SHADOW);
}
/** The part of the escalator where the steps run (for moving them). */
const escalatorSteps = (x0: number, width: number, bottom: number) => ({ x: x0 + 4, w: width - 8, y: 4, h: bottom - 3 - 4 });

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
        case 'tiles': {
          // Big pale tiles, polished: a soft glint runs across them.
          const grout = lx % 12 === 11 || ly % 12 === 11;
          c = grout ? TILE_GROUT : (Math.floor(lx / 12) + Math.floor(ly / 12)) % 2 ? TILE_ALT : TILE;
          if (!grout && (lx - ly + 600) % 46 < 2) c = TILE_SHINE;
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
  // A rug in the place's own color, in front of whoever's here (a mall's floor is all tiles).
  if (style.floor !== 'tiles') {
    const rugW = Math.min(fx1 - fx0 - 20, 54);
    const rx = Math.round((fx0 + fx1) / 2 - rugW / 2);
    const ry = fy1 - 26;
    p.rect(rx, ry, rugW, 14, R[2]);
    p.rect(rx + 2, ry + 2, rugW - 4, 10, R[1]);
    p.rect(rx + 4, ry + 4, rugW - 8, 6, R[3]);
    for (let x = rx; x < rx + rugW; x += 2) (p.px(x, ry - 1, CREAM), p.px(x, ry + 14, CREAM));
  }

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
        case 'mall':
          // A band of the glass roof along the top, pale panels, and a steel skirting.
          if (y < 9) c = lx % 16 === 0 || y === 0 ? STEEL_LIGHT : night ? (hash2(x, y, 11) < 0.012 ? STAR : SKY_NIGHT) : y < 4 ? GLASS_SHINE : GLASS;
          else if (y === 9) c = STEEL_DARK;
          else if (y >= fy0 - 3) c = y === fy0 - 3 ? STEEL_LIGHT : STEEL;
          else c = lx % 26 === 0 ? WR[3] : hash2(x, y, 9) < 0.03 ? WR[1] : WR[2];
          break;
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

  // Windows, wherever the wall is free (not the lamp room: it's all window; nor the mall: it has its roof).
  const hung = plan.spots.filter(onWall);
  const free = (x0: number, x1: number) => hung.every((s) => x1 < SIDE + (s.x - s.hw + w / 2) * RTEX - 2 || x0 > SIDE + (s.x + s.hw + w / 2) * RTEX + 2);
  if (style.wall !== 'glass' && style.wall !== 'mall') {
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
        } else if (arch === 'townhouse') {
          // A calm sea at dusk: a warm sky, a low sun, a long horizon.
          p.rect(ix, iy, iw, ih >> 1, col('#f3d9b8'));
          p.rect(ix, iy + (ih >> 1), iw, ih - (ih >> 1), col('#7fa6b8'));
          p.hline(ix, ix + iw - 1, iy + (ih >> 1), col('#5f8597'));
          p.ellipse(cx + 2, iy + (ih >> 1) - 1, 2, 1.5, col('#f7b26b'));
          p.hline(ix + 2, ix + iw - 4, iy + (ih >> 1) + 3, col('#9cc0cf'));
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
        if (arch === 'mall') {
          directory(p, x0, width, R);
          break;
        }
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
      case 'shopfront':
        shopfronts(p, x0, width, fy0);
        break;
      case 'escalator':
        escalator(p, x0, width, fy0 + Math.round(s.hd * 2 * RTEX) - 2);
        break;
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
  const rim = wallRim(style);
  const wallTop = col(rim.top);
  const wallEdge = col(rim.edge);
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

/**
 * Paint a building's room for the map. `outfits` (the world's) dresses its
 * islanders: anyone whose looks mention a piece from this place's wardrobe
 * wears it (the fry cook's red cap).
 */
export function paintRoom(place: Place, outfits: readonly Outfit[] = []): MapRoom {
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
      const looks = place.interior!.people.find((c) => c.id === spot.id)?.looks.toLowerCase() ?? '';
      const worn = outfits.filter((o) => o.place === place.id && looks.includes(o.name.toLowerCase()));
      sprites.push({ spot, sprite: null, islander: paintExplorer(worn, spot.color), facing: 'down' });
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
      if (!onWall(s)) continue;
      if (Math.abs(ux(x) - s.x) <= s.hw && y < WALL_H + s.hd * 2 * RTEX && y > 2) return s;
    }
    return null;
  };

  const hearth = plan.spots.find((s) => s.prop === 'hearth');
  const lensSpot = plan.spots.find((s) => s.prop === 'lens');
  const scan = plan.spots.find((s) => s.prop === 'scanner');
  const wallX = (s: Spot) => px(s.x) - (Math.round(s.hw * 2 * RTEX) >> 1);
  const esc = plan.spots.find((s) => s.prop === 'escalator');
  const steps = esc ? escalatorSteps(wallX(esc), Math.round(esc.hw * 2 * RTEX), WALL_H + Math.round(esc.hd * 2 * RTEX) - 2) : null;
  const map = place.archetype === 'mall' ? plan.spots.find((s) => s.prop === 'board') : undefined;
  const dot = map ? directoryDot(wallX(map), Math.round(map.hw * 2 * RTEX)) : null;
  const grillSpot = plan.spots.find((s) => s.prop === 'grill');
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
    if (steps) {
      // The escalator's steps, climbing.
      const f = motion ? Math.floor(time * 5) % 3 : 0;
      for (let y = steps.y; y < steps.y + steps.h; y++) {
        const up = steps.y + steps.h - y + f;
        c.fillStyle = up % 3 === 0 ? '#4d5359' : up % 3 === 1 ? '#868d94' : '#6f767d';
        c.fillRect(steps.x, y, steps.w, 1);
      }
    }
    if (dot && (!motion || Math.floor(time * 2) % 2 === 0)) {
      // YOU ARE HERE, blinking.
      c.fillStyle = '#ff6b70';
      c.fillRect(dot.x - 1, dot.y - 1, 3, 3);
      c.fillStyle = '#fff2f2';
      c.fillRect(dot.x, dot.y - 1, 1, 1);
    }
    if (grillSpot && motion) {
      // Steam off the grill.
      const gx = px(grillSpot.x) - 21;
      const gy = py(grillSpot.z + grillSpot.hd) - GRILL.h + 1 + GRILL.plate;
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.8 + i / 3) % 1;
        c.globalAlpha = 1 - k;
        c.fillRect(gx + 8 + i * 9 + Math.round(Math.sin(time * 3 + i) * 1.5), gy - 2 - Math.round(k * 7), 2, 1);
      }
      c.globalAlpha = 1;
    }
    if (scan && motion && Math.floor(time * 2) % 3 === 0) {
      c.fillStyle = '#ff5a52';
      c.fillRect(px(scan.x) + 13, py(scan.z + scan.hd) - 17, 1, 1);
      c.fillRect(px(scan.x) + 13, py(scan.z + scan.hd) - 15, 5, 1);
    }
  };

  const rim = wallRim(STYLES[place.archetype] ?? STYLES.cabin);
  return { place, plan, w: W, h: H, bg: { day: day.canvas(), night: nite.canvas() }, rim, sprites, px, py, ux, uz, hit, animate };
}

