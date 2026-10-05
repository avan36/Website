// Every sprite on the map, painted pixel by pixel at load: one landmark per
// archetype (in the same spirit as the 3D island's, each using its place's
// color as the accent), the scenery scattered between them, and the lost
// words. All of them face south, seen from above and a little in front, the
// way the old overworlds drew towns. Each is a Pix plus an anchor: the pixel
// that stands on the sprite's base point in the world.

import { drawText, textWidth } from './font';
import { HALF_WIDTH, type LandmarkKind } from './layout';
import { HEX } from './palette';
import { CLEAR, col, nightData, Pix, shade, type Color } from './pixels';

export interface Sprite {
  w: number;
  h: number;
  /** The anchor: this pixel sits on the sprite's base point. */
  ax: number;
  ay: number;
  day: HTMLCanvasElement;
  night: HTMLCanvasElement;
  /** The painted pixels, for hit-testing taps. */
  data: Uint32Array;
}

// ---------- Shared colors ----------

const INK = col(HEX.ink);
const SHADOW = col('#2a1d10', 46);
const WOOD = col('#b98352');
const WOOD_LIGHT = col('#d2a06a');
const WOOD_DARK = col('#8a5a36');
const WOOD_DEEP = col('#6b4228');
const STONE = col('#bdb5a8');
const STONE_LIGHT = col('#d8d1c4');
const STONE_DARK = col('#958c80');
const CREAM = col('#fff3df');
const TRIM = col('#fffaf2');
const GOLD = col('#f2c14e');
const IRON = col('#4a4540');
const LEAF = col('#5cb85a');
const LEAF_DARK = col('#3e9a48');
const LEAF_LIGHT = col('#8fd46b');
const RED = col('#e5484d');
const WHITE = col('#ffffff');

// Window glass and lamps: plain by day, lit after dark (see LIGHTS).
const GLASS = col('#9cd2e8');
const GLASS_SHINE = col('#d4eef7');
const LAMP = col('#ffe7a6');
const LAMP_CORE = col('#fff6d8');
const BULBS = ['#fff1b8', '#ffd166', '#ff9f6b', '#ffc2d1'].map((h) => col(h));
// The workshop's dim interior warms up after dark; its monitor glows all the time.
const INTERIOR = col('#46525e');
const SCREEN_BG = col('#1c3b33');
const SCREEN = col('#8ff0be');
const SCREEN_HI = col('#ffd27a');

// The mall's glass: its upper floor and its wavy roof glow softly from inside after dark.
const MALL_GLASS = col('#8cc6dd');
const MALL_GLASS_LIGHT = col('#c3e5f0');
const ROOF_A = col('#bfe5f1');
const ROOF_B = col('#8fc8de');
const ROOF_C = col('#679fbe');
const ROOF_RIB = col('#e3f2f8');
const ROOF_RIM = col('#ffffff');
const MALL_LIGHTS: [Color, Color][] = [
  [MALL_GLASS, col('#ffe2a0')],
  [MALL_GLASS_LIGHT, col('#fff0c8')],
  [ROOF_A, col('#cdb27a')],
  [ROOF_B, col('#b99a62')],
  [ROOF_C, col('#a4854f')],
];

const LIGHTS = new Map<Color, Color>([
  [GLASS, col('#ffcf6e')],
  [GLASS_SHINE, col('#ffe6a2')],
  [LAMP, col('#ffe27a')],
  [LAMP_CORE, col('#fffbe6')],
  ...BULBS.map((b): [Color, Color] => [b, b]),
  [INTERIOR, col('#e8b860')],
  ...[SCREEN_BG, SCREEN, SCREEN_HI].map((c): [Color, Color] => [c, c]),
]);

/** A five-step ramp from an accent color: lightest to darkest. */
const ramp = (hex: string) => [shade(hex, 0.16), shade(hex, 0.07), hex, shade(hex, -0.1), shade(hex, -0.2)].map((h) => col(h));

function finish(p: Pix, ax: number, ay: number, shadow?: { rx: number; ry: number; dy?: number }, fine?: (p: Pix) => void, lights = LIGHTS): Sprite {
  p.outline(INK);
  // Fine details (ropes, poles) go on after the outline so they stay one pixel thin.
  fine?.(p);
  if (shadow) {
    // A soft shadow on the ground, under everything else.
    const s = new Pix(p.w, p.h);
    s.ellipse(ax + 1, ay + (shadow.dy ?? 0), shadow.rx, shadow.ry, SHADOW);
    s.stamp(p, 0, 0);
    p.data.set(s.data);
  }
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data, lights)), data: p.data };
}

// ---------- Building parts ----------

/** A shingled roof band, seen from the south: ridge at the top, eaves at the bottom. */
function roof(p: Pix, x: number, y: number, w: number, h: number, R: Color[]) {
  p.rect(x, y, w, h, R[2]);
  p.hline(x, x + w - 1, y, R[0]);
  p.hline(x, x + w - 1, y + 1, R[1]);
  for (let j = 3; j < h - 1; j += 3) {
    p.hline(x, x + w - 1, y + j, R[3]);
    // Stagger the shingle joints.
    for (let i = (j / 3) % 2 ? 1 : 3; i < w; i += 4) p.px(x + i, y + j - 1, R[3]);
  }
  p.hline(x, x + w - 1, y + h - 1, R[4]);
  p.vline(x, y, y + h - 1, R[3]);
  p.vline(x + w - 1, y, y + h - 1, R[4]);
}

/** A window with a light frame, a cross of mullions and a shine. */
function windowAt(p: Pix, x: number, y: number, w = 7, h = 6, frame = TRIM) {
  p.rect(x, y, w, h, frame);
  p.rect(x + 1, y + 1, w - 2, h - 2, GLASS);
  p.px(x + 1, y + 1, GLASS_SHINE);
  p.px(x + 2, y + 1, GLASS_SHINE);
  p.vline(x + (w >> 1), y + 1, y + h - 2, frame);
  p.hline(x + 1, x + w - 2, y + (h >> 1), frame);
}

/** A plank door, optionally arched, with a brass knob. */
function doorAt(p: Pix, x: number, y: number, w: number, h: number, c: Color, dark: Color, arch = false) {
  p.rect(x, y, w, h, c);
  if (arch) {
    p.px(x, y, CLEAR);
    p.px(x + w - 1, y, CLEAR);
    p.px(x, y + 1, dark);
    p.px(x + w - 1, y + 1, dark);
  }
  for (let i = x + 2; i < x + w - 1; i += 2) p.vline(i, y + (arch ? 2 : 1), y + h - 1, dark);
  p.px(x + w - 2, y + (h >> 1) + 1, GOLD);
}

/** A little lantern: iron cap and a glowing pane. */
function lantern(p: Pix, x: number, y: number) {
  p.hline(x, x + 2, y, IRON);
  p.rect(x, y + 1, 3, 3, LAMP);
  p.px(x + 1, y + 2, LAMP_CORE);
  p.hline(x, x + 2, y + 4, IRON);
}

/** Where windows go along a facade, keeping clear of the door. */
function windowSpots(cands: number[], doorX: number, doorW: number, winW: number, max = 2) {
  return cands.filter((x) => x + winW + 2 < doorX || x > doorX + doorW + 1).slice(0, max);
}

// ---------- Landmarks ----------

export interface Landmark {
  sprite: Sprite;
  /** Where the door is drawn, in pixels from the anchor (for the wipe and the prompt). */
  door: { dx: number; dy: number };
  /** The row where the landmark's silhouette starts (name tags sit above it). */
  top: number;
  /** For a building with a room: the row where its walls start. Everything above is roof, which lifts off as it opens up. */
  roof?: number;
}

/** A snug log cabin: teal roof, a chimney, flower boxes, a porch with the journal. */
function cabin(accent: string, doorDx: number): Landmark {
  const p = new Pix(52, 52);
  const R = ramp(accent);
  const ax = 26;
  const base = 46;
  // Chimney behind the ridge.
  p.rect(36, 1, 6, 12, STONE);
  p.hline(36, 41, 1, STONE_LIGHT);
  for (let y = 3; y < 12; y += 3) p.hline(36, 41, y, STONE_DARK);
  roof(p, 3, 7, 46, 19, R);
  // Log walls: three-pixel logs, with round log ends at the corners.
  const wy = 26;
  for (let y = wy; y < base; y++) {
    const band = Math.floor((y - wy) / 3);
    const c = (y - wy) % 3 === 2 ? WOOD_DARK : band % 2 ? WOOD : WOOD_LIGHT;
    p.hline(5, 46, y, c);
  }
  for (let y = wy; y < base - 1; y += 3) {
    for (const x of [4, 46]) {
      p.px(x, y, WOOD_LIGHT);
      p.px(x, y + 1, WOOD_DEEP);
    }
  }
  // Door and windows.
  const dX = ax + doorDx - 4;
  doorAt(p, dX, base - 13, 8, 13, col('#6b4228'), WOOD_DEEP);
  for (const x of windowSpots([9, 36, 20, 27], dX, 8, 7)) {
    windowAt(p, x, wy + 4, 7, 6);
    // Flower box under each window.
    p.hline(x - 1, x + 7, wy + 10, WOOD_DEEP);
    p.hline(x - 1, x + 7, wy + 11, WOOD_DARK);
    for (let i = 0; i < 4; i++) p.px(x + i * 2, wy + 9, i % 2 ? col('#ff7b9c') : col('#ffd166'));
  }
  lantern(p, dX - 4, wy + 2);
  // Porch: a deck across the front.
  for (let y = base; y < base + 5; y++) p.hline(2, 49, y, y === base + 4 ? WOOD_DEEP : (y - base) % 2 ? WOOD : WOOD_LIGHT);
  for (const x of [2, 49]) p.vline(x, base - 4, base + 4, WOOD_DEEP);
  p.hline(2, 49, base - 4, WOOD_DARK);
  // Table with the journal (accent cover, cream pages) and a mug.
  const tx = dX > ax ? 8 : 38;
  p.rect(tx, base - 1, 8, 2, WOOD_LIGHT);
  p.vline(tx + 1, base + 1, base + 3, WOOD_DEEP);
  p.vline(tx + 6, base + 1, base + 3, WOOD_DEEP);
  p.rect(tx + 1, base - 2, 4, 2, R[2]);
  p.hline(tx + 2, tx + 4, base - 2, CREAM);
  p.px(tx + 6, base - 2, WHITE);
  // Firewood stacked by the wall.
  const fx = dX > ax ? 44 : 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3 - r; c++) {
    p.px(fx + c * 2 + r, base - 2 - r * 2, WOOD_LIGHT);
    p.px(fx + c * 2 + r, base - 1 - r * 2, WOOD_DARK);
  }
  return { sprite: finish(p, ax, base, { rx: 25, ry: 4, dy: 2 }), door: { dx: doorDx, dy: -6 }, top: 1, roof: wy };
}

/** A timber-framed taproom: plaster and beams, an arched door, barrels and a swinging sign. */
function taproom(accent: string, doorDx: number): Landmark {
  const p = new Pix(54, 50);
  const R = ramp(accent);
  const ax = 27;
  const base = 45;
  roof(p, 3, 4, 48, 20, R);
  // A dormer window in the roof.
  p.rect(22, 7, 10, 8, R[3]);
  windowAt(p, 24, 9, 6, 5, col('#6e4a30'));
  const wy = 24;
  const PLASTER = col('#f6e9d0');
  const BEAM = col('#6e4a30');
  p.rect(5, wy, 44, base - wy, PLASTER);
  // Timber frame: posts, rails and two braces.
  for (const x of [5, 16, 37, 48]) p.vline(x, wy, base - 1, BEAM);
  p.hline(5, 48, wy, BEAM);
  p.hline(5, 48, wy + 9, BEAM);
  for (let i = 0; i < 8; i++) {
    p.px(6 + i, wy + 8 - i, BEAM);
    p.px(47 - i, wy + 8 - i, BEAM);
  }
  const dX = ax + doorDx - 5;
  doorAt(p, dX, base - 13, 10, 13, col('#6b3f22'), col('#4f2c16'), true);
  for (const x of windowSpots([8, 39, 19, 29], dX, 10, 8)) windowAt(p, x, wy + 12, 8, 6, BEAM);
  windowAt(p, 20, wy + 2, 6, 5, BEAM);
  windowAt(p, 29, wy + 2, 6, 5, BEAM);
  // Sign on a bracket: a mug in the accent color.
  const sx = dX > ax ? 9 : 42;
  p.hline(sx - 2, sx + 3, wy + 2, IRON);
  p.rect(sx - 2, wy + 3, 6, 6, CREAM);
  p.rect(sx - 1, wy + 4, 3, 4, R[2]);
  p.px(sx + 2, wy + 5, R[3]);
  p.hline(sx - 1, sx + 1, wy + 4, WHITE);
  // Barrels at the side.
  const bx = dX > ax ? 0 : 47;
  for (let k = 0; k < 2; k++) {
    const x = bx + k * 3 - (dX > ax ? 0 : 3);
    p.rect(x, base - 7 + k, 6, 7 - k, col('#b8743f'));
    p.hline(x, x + 5, base - 5 + k, IRON);
    p.hline(x, x + 5, base - 2, IRON);
    p.px(x + 1, base - 6 + k, col('#d4945a'));
  }
  // Step in front of the door.
  p.hline(dX - 1, dX + 10, base, STONE_LIGHT);
  p.hline(dX - 1, dX + 10, base + 1, STONE_DARK);
  return { sprite: finish(p, ax, base, { rx: 26, ry: 4, dy: 1 }), door: { dx: doorDx, dy: -6 }, top: 4, roof: wy };
}

/** The ancient tree: a huge blossoming canopy, roots, a swing and a tiny round door. */
function tree(accent: string): Landmark {
  const p = new Pix(72, 74);
  const ax = 36;
  const base = 66;
  const g = [shade(accent, 0.2), shade(accent, 0.1), accent, shade(accent, -0.1), shade(accent, -0.18)].map((h) => col(h));
  const BARK = col('#8b5e3c');
  const BARK_DARK = col('#6a4428');
  const BARK_LIGHT = col('#a87850');
  // Trunk and roots.
  for (let y = 34; y <= base; y++) {
    const spread = y > base - 6 ? (y - (base - 6)) * 2 : 0;
    const hw = 7 + spread;
    p.hline(ax - hw, ax + hw, y, BARK);
    p.px(ax - hw, y, BARK_DARK);
    p.px(ax + hw, y, BARK_DARK);
  }
  for (let y = 36; y < base; y += 5) for (const x of [ax - 4, ax + 3]) p.vline(x, y, y + 2, BARK_DARK);
  p.vline(ax - 5, 36, base - 4, BARK_LIGHT);
  // Roots spilling out at the base.
  for (const [dx, len] of [[-12, 6], [10, 7], [-17, 4], [15, 4]] as const) {
    p.hline(ax + dx - (dx < 0 ? len : 0), ax + dx + (dx > 0 ? len : 0), base, BARK);
    p.hline(ax + dx - (dx < 0 ? len - 1 : 0), ax + dx + (dx > 0 ? len - 1 : 0), base - 1, BARK_DARK);
  }
  // The little round door.
  p.ellipse(ax + 0.5, base - 6, 3, 4, col('#4f2c16'));
  p.ellipse(ax + 0.5, base - 5.5, 2, 3, col('#7a4a2a'));
  p.px(ax + 2, base - 5, GOLD);
  p.hline(ax - 3, ax + 3, base - 1, STONE_LIGHT);
  // Canopy: overlapping blobs, lit from the top left.
  const blobs: [number, number, number][] = [
    [36, 22, 20], [21, 29, 12], [51, 29, 12], [29, 12, 12], [45, 13, 12], [36, 34, 14], [17, 18, 8], [56, 19, 8],
  ];
  for (const [cx, cy, r] of blobs) p.ellipse(cx, cy + 1.5, r, r * 0.86, g[4]);
  for (const [cx, cy, r] of blobs) p.ellipse(cx, cy, r, r * 0.84, g[3]);
  for (const [cx, cy, r] of blobs) p.ellipse(cx - 2, cy - 2, r * 0.8, r * 0.7, g[2]);
  for (const [cx, cy, r] of blobs) p.ellipse(cx - 4, cy - 4, r * 0.5, r * 0.42, g[1]);
  for (const [cx, cy, r] of blobs.slice(0, 5)) p.ellipse(cx - 6, cy - 6, r * 0.22, r * 0.18, g[0]);
  // Blossom scattered over it.
  const BLOSSOM = [col('#ffd6e4'), col('#ff9fbf'), col('#fffaf0')];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * 72);
    const y = Math.floor(rnd() * 48);
    const c = p.get(x, y);
    if (c === g[2] || c === g[1] || c === g[3]) {
      p.px(x, y, BLOSSOM[i % 3]);
      if (i % 4 === 0) p.px(x + 1, y, BLOSSOM[(i + 1) % 3]);
    }
  }
  // The branch the swing hangs from, to the right.
  p.hline(50, 60, 44, BARK_DARK);
  p.hline(49, 59, 43, BARK);
  // A ring of spotted mushrooms.
  for (const [mx, my] of [[ax - 20, base - 1], [ax - 16, base + 3], [ax + 18, base + 2]] as const) {
    p.rect(mx, my, 4, 2, RED);
    p.px(mx + 1, my, WHITE);
    p.vline(mx + 1, my + 2, my + 3, CREAM);
    p.vline(mx + 2, my + 2, my + 3, CREAM);
  }
  const swing = (q: Pix) => {
    q.vline(52, 45, 55, col('#e9dcc0'));
    q.vline(58, 45, 55, col('#e9dcc0'));
    q.hline(51, 59, 56, WOOD_LIGHT);
    q.hline(51, 59, 57, WOOD_DEEP);
  };
  return { sprite: finish(p, ax, base, { rx: 24, ry: 5, dy: 1 }, swing), door: { dx: 0, dy: -6 }, top: 2 };
}

/** The old library: sandstone, blue slate, an ivy tower with a cone, and a giant open book. */
function library(accent: string, doorDx: number): Landmark {
  const p = new Pix(60, 66);
  const R = ramp(accent);
  const ax = 30;
  const base = 58;
  const SAND = col('#dccaa6');
  const SAND_DARK = col('#c3ad88');
  const SAND_LIGHT = col('#ecdcbc');
  // Main hall: slate roof, then stone walls with masonry courses.
  roof(p, 6, 18, 50, 18, R);
  // Rose window in a little gable.
  p.ellipse(31, 22, 4, 4, SAND);
  p.ellipse(31, 22, 3, 3, GLASS);
  p.px(31, 21, GLASS_SHINE);
  p.px(30, 22, SAND_DARK);
  p.px(32, 22, SAND_DARK);
  const wy = 36;
  p.rect(8, wy, 46, base - wy, SAND);
  for (let y = wy + 2; y < base; y += 3) {
    p.hline(8, 53, y, SAND_DARK);
    for (let x = 8 + ((y / 3) % 2 ? 2 : 5); x < 54; x += 6) p.px(x, y - 1, SAND_DARK);
  }
  p.hline(8, 53, wy, SAND_DARK);
  p.hline(8, 53, wy + 1, SAND_LIGHT);
  // Arched double door in a stone surround, lanterns either side.
  const dX = ax + doorDx - 5;
  p.rect(dX - 2, base - 16, 14, 16, SAND_LIGHT);
  doorAt(p, dX, base - 14, 10, 14, col('#5b3a24'), col('#3f2818'), true);
  p.vline(dX + 5, base - 13, base - 1, col('#3f2818'));
  lantern(p, dX - 5, base - 13);
  lantern(p, dX + 12, base - 13);
  const bx = dX > ax ? 21 : 42;
  for (const x of windowSpots([44, 22, 36], dX - 2, 14, 6).filter((x) => x + 6 < bx - 1 || x > bx + 12)) {
    p.rect(x, wy + 5, 6, 10, SAND_LIGHT);
    p.rect(x + 1, wy + 6, 4, 8, GLASS);
    p.px(x + 1, wy + 6, SAND_LIGHT);
    p.px(x + 4, wy + 6, SAND_LIGHT);
    p.px(x + 2, wy + 7, GLASS_SHINE);
    p.hline(x + 1, x + 4, wy + 10, SAND_LIGHT);
  }
  // The round tower on the front-left, with ivy and a slate cone.
  const tx = 4;
  const tw = 14;
  p.rect(tx, 16, tw, base - 16, SAND);
  for (let y = 18; y < base; y += 3) p.hline(tx, tx + tw - 1, y, SAND_DARK);
  p.vline(tx, 16, base - 1, SAND_DARK);
  p.vline(tx + tw - 1, 16, base - 1, SAND_DARK);
  p.vline(tx + 2, 16, base - 1, SAND_LIGHT);
  windowAt(p, tx + 4, 22, 6, 7, SAND_LIGHT);
  for (let y = 2; y < 17; y++) {
    const hw = Math.round((y - 1) * 0.55);
    p.hline(tx + 7 - hw, tx + 6 + hw, y, y % 3 === 0 ? R[3] : R[2]);
    p.px(tx + 7 - hw, y, R[1]);
  }
  p.vline(tx + 6, 0, 1, IRON);
  p.px(tx + 6, 1, GOLD);
  // Ivy climbing the tower.
  for (let i = 0; i < 34; i++) {
    const y = base - 2 - Math.floor(i * 0.9);
    const x = tx + 1 + Math.round(4 + Math.sin(i * 0.7) * 4);
    p.px(x, y, i % 3 ? LEAF : LEAF_DARK);
    if (i % 2) p.px(x + 1, y, LEAF_LIGHT);
  }
  // The giant open book on its lectern, to one side of the door.
  p.rect(bx + 3, base - 4, 4, 4, STONE);
  p.vline(bx + 3, base - 4, base - 1, STONE_DARK);
  p.rect(bx, base - 9, 11, 5, R[2]);
  p.rect(bx + 1, base - 10, 4, 5, CREAM);
  p.rect(bx + 6, base - 10, 4, 5, CREAM);
  p.vline(bx + 5, base - 10, base - 5, R[4]);
  for (const y of [base - 9, base - 7]) {
    p.hline(bx + 1, bx + 3, y, col('#8a7e70'));
    p.hline(bx + 7, bx + 9, y, col('#8a7e70'));
  }
  p.vline(bx + 6, base - 4, base - 2, RED);
  // Steps.
  p.hline(dX - 2, dX + 11, base, SAND_LIGHT);
  p.hline(dX - 2, dX + 11, base + 1, SAND_DARK);
  return { sprite: finish(p, ax, base, { rx: 28, ry: 4, dy: 1 }), door: { dx: doorDx, dy: -7 }, top: 0, roof: wy };
}

/** The lighthouse: stripes in the accent, a dark gallery, a glowing lamp and a cone cap. */
function lighthouse(accent: string): Landmark {
  const p = new Pix(28, 72);
  const R = ramp(accent);
  const ax = 14;
  const base = 68;
  const STRIPE_W = col('#fff6ec');
  const STRIPE_WD = col('#e6dccd');
  // Tower: tapering, banded, shaded on the right.
  for (let y = 22; y <= base; y++) {
    const hw = Math.round(6 + ((y - 22) / (base - 22)) * 4);
    const band = Math.floor((y - 22) / 8) % 2;
    const light = band ? R[2] : STRIPE_W;
    const dark = band ? R[3] : STRIPE_WD;
    p.hline(ax - hw, ax + hw - 1, y, light);
    p.hline(ax + Math.floor(hw / 2), ax + hw - 1, y, dark);
    p.px(ax - hw + 1, y, band ? R[1] : WHITE);
  }
  // Door and a couple of little windows.
  doorAt(p, ax - 3, base - 9, 6, 9, col('#5d3a22'), col('#3f2818'), true);
  for (const y of [32, 46]) {
    p.rect(ax - 2, y, 3, 4, col('#3a4a66'));
    p.px(ax - 2, y, GLASS_SHINE);
  }
  // Gallery and railing.
  p.rect(ax - 9, 19, 18, 3, IRON);
  p.hline(ax - 9, ax + 8, 19, col('#6b655e'));
  for (let x = ax - 8; x < ax + 8; x += 3) p.vline(x, 15, 18, IRON);
  p.hline(ax - 8, ax + 7, 15, IRON);
  // Lamp room and cap.
  p.rect(ax - 5, 11, 10, 8, LAMP);
  p.rect(ax - 2, 13, 4, 4, LAMP_CORE);
  p.vline(ax - 5, 11, 18, IRON);
  p.vline(ax + 4, 11, 18, IRON);
  p.vline(ax, 11, 18, IRON);
  for (let y = 3; y < 11; y++) {
    const hw = Math.round((y - 2) * 0.85);
    p.hline(ax - hw, ax + hw - 1, y, y > 8 ? R[3] : R[2]);
    p.px(ax - hw, y, R[1]);
  }
  p.vline(ax, 0, 2, IRON);
  p.hline(ax - 3, ax + 2, 1, IRON); // the weather vane
  p.px(ax + 3, 1, IRON);
  return { sprite: finish(p, ax, base, { rx: 11, ry: 3, dy: 1 }), door: { dx: 0, dy: -5 }, top: 0, roof: 19 };
}

/** The schoolhouse: clapboard, a bell tower, a flag and a chalkboard out front. */
function schoolhouse(accent: string, doorDx: number): Landmark {
  const p = new Pix(56, 62);
  const R = ramp(accent);
  const ax = 26;
  const base = 56;
  const BOARD = col('#f6ead2');
  const BOARD_LINE = col('#e2cfaa');
  // Bell tower on the ridge.
  const bx = ax - 5;
  p.rect(bx, 6, 10, 10, BOARD);
  p.rect(bx + 2, 8, 6, 6, col('#4a3a32'));
  p.rect(bx + 3, 9, 4, 4, GOLD);
  p.hline(bx + 3, bx + 6, 12, col('#b8862a'));
  for (let y = 0; y < 6; y++) p.hline(bx + 5 - y - 1, bx + 4 + y + 1, y + 1, y > 3 ? R[3] : R[2]);
  roof(p, 3, 15, 46, 18, R);
  // Round attic window.
  p.ellipse(ax + 0.5, 21, 3, 3, TRIM);
  p.ellipse(ax + 0.5, 21, 2, 2, GLASS);
  const wy = 33;
  p.rect(5, wy, 42, base - wy, BOARD);
  for (let y = wy + 2; y < base; y += 3) p.hline(5, 46, y, BOARD_LINE);
  p.vline(5, wy, base - 1, BOARD_LINE);
  p.vline(46, wy, base - 1, BOARD_LINE);
  // Double door in the darker accent, and tall windows.
  const dX = ax + doorDx - 5;
  doorAt(p, dX, base - 13, 10, 13, R[3], R[4]);
  p.vline(dX + 5, base - 13, base - 1, R[4]);
  p.px(dX + 4, base - 6, GOLD);
  for (const x of windowSpots([9, 37, 20, 29], dX, 10, 7)) windowAt(p, x, wy + 5, 7, 8);
  // Steps and the apple.
  p.hline(dX - 1, dX + 10, base, STONE_LIGHT);
  p.hline(dX - 1, dX + 10, base + 1, STONE_DARK);
  p.rect(dX + 8, base - 2, 2, 2, RED);
  p.px(dX + 9, base - 3, LEAF);
  // Flagpole with the flag in the accent (painted after the outline, below).
  const fx = dX > ax ? 1 : 51;
  const fd = dX > ax ? 1 : -1;
  const flag = (q: Pix) => {
    q.vline(fx, 14, base + 1, col('#f4f1ea'));
    q.vline(fx + fd * -1, 15, base + 1, col('#c9c2b6'));
    q.px(fx, 13, GOLD);
    for (let i = 1; i <= 7; i++) q.vline(fx + fd * i, 15 + (i > 4 ? 1 : 0), 19 - (i > 5 ? 1 : 0), i % 3 === 0 ? R[3] : R[2]);
  };
  // Chalkboard on its A-frame, on the other side of the door.
  const cx = dX > ax ? dX - 12 : dX + 13;
  p.rect(cx, base - 7, 9, 6, col('#2f5a46'));
  p.hline(cx, cx + 8, base - 8, WOOD_DARK);
  p.hline(cx + 1, cx + 4, base - 6, WHITE);
  p.hline(cx + 2, cx + 6, base - 4, WHITE);
  p.hline(cx + 1, cx + 3, base - 3, col('#ffd166'));
  p.vline(cx, base - 1, base + 1, WOOD_DARK);
  p.vline(cx + 8, base - 1, base + 1, WOOD_DARK);
  return { sprite: finish(p, ax, base, { rx: 25, ry: 4, dy: 1 }, flag), door: { dx: doorDx, dy: -6 }, top: 0, roof: wy };
}

/** The recycling depot: an open shed with a badge, a row of bins and a conveyor out front. */
function depot(accent: string, doorDx: number): Landmark {
  const p = new Pix(56, 46);
  const R = ramp(accent);
  const ax = 28;
  const base = 38;
  const WALL = col('#eef0e6');
  const WALL_SIDE = col('#d5dbcc');
  // Corrugated roof in the accent.
  p.rect(2, 4, 52, 14, R[2]);
  for (let x = 3; x < 54; x += 3) p.vline(x, 4, 17, R[3]);
  p.hline(2, 53, 4, R[0]);
  p.hline(2, 53, 17, R[4]);
  // Inside the open front: the back wall with the badge, side walls.
  p.rect(4, 18, 48, base - 18, WALL);
  p.rect(4, 18, 3, base - 18, WALL_SIDE);
  p.rect(49, 18, 3, base - 18, WALL_SIDE);
  p.rect(7, 18, 42, 3, col('#c9cfbf')); // shade under the roof
  // Badge: three chasing arrows round a circle.
  p.ellipse(28.5, 25, 5, 5, R[2]);
  p.ellipse(28.5, 25, 3, 3, WALL);
  p.ellipse(28.5, 25, 2, 2, R[2]);
  for (const [x, y] of [[28, 19], [23, 27], [33, 27]] as const) p.rect(x, y, 2, 2, WALL);
  // Colored bins along the back.
  const bins = [col('#3a86ff'), R[2], col('#ffbe0b'), col('#ff7a45')];
  bins.forEach((c, i) => {
    const x = 9 + i * 10;
    p.rect(x, base - 9, 8, 8, c);
    p.hline(x, x + 7, base - 9, shadeU(c, 0.12));
    p.hline(x + 2, x + 5, base - 6, WHITE);
  });
  // The conveyor out front, on legs.
  p.rect(6, base + 1, 44, 3, col('#3d3a36'));
  p.hline(6, 49, base, col('#9aa1ab'));
  p.hline(6, 49, base + 4, col('#9aa1ab'));
  for (const x of [8, 26, 47]) p.vline(x, base + 5, base + 6, col('#6b7280'));
  // Crates stacked to one side.
  const cx = doorDx < 0 ? 46 : 0;
  p.rect(cx, base - 7, 8, 7, col('#c8a172'));
  p.rect(cx + 1, base - 12, 6, 5, col('#d4b07e'));
  p.hline(cx, cx + 7, base - 4, col('#a8824f'));
  return { sprite: finish(p, ax, base, { rx: 27, ry: 4, dy: 4 }), door: { dx: doorDx, dy: -8 }, top: 3, roof: 18 };
}

/**
 * The shopping centre: a long glass front under a wavy glass roof, its name in
 * big letters over the sliding doors, and at the far end from the doors a
 * little burger bar in red and white tiles. Lit up from inside after dark.
 */
function mall(accent: string, doorDx: number): Landmark {
  const hw = Math.round(HALF_WIDTH.mall * 8);
  const W = hw * 2 + 8;
  const ax = W >> 1;
  const base = 56;
  const p = new Pix(W, base + 5);
  const L = ax - hw;
  const R = ax + hw - 1;
  const RED_SIGN = col(accent);
  const CLAD = col('#f3efe7');
  const CLAD_SHADE = col('#d8d1c4');
  const STEEL = col('#9aa7b0');
  const STEEL_LIGHT = col('#dfe6ea');
  const DOOR_GAP = col('#33424c');
  const SIGN_BG = col('#fdfbf6');
  const FG_RED = col('#d42a32');
  const FG_WHITE = col('#fbf5ea');
  const PAVE = col('#e3ddd2');
  const PAVE_DARK = col('#c4bcae');

  // The roof: a lattice of glass rippling across the whole building, lit on the slopes that face west.
  const eave = 20;
  for (let x = L - 2; x <= R + 2; x++) {
    const a = ((x - L) / 26) * Math.PI * 2 + 0.7;
    const top = Math.round(7 + Math.sin(a) * 2.4);
    const lit = Math.cos(a);
    const c = lit > 0.35 ? ROOF_A : lit < -0.35 ? ROOF_C : ROOF_B;
    for (let y = top; y < eave; y++) {
      const rib = (x + y * 2) % 10 === 0 || (x - y * 2 + 100) % 10 === 0;
      p.px(x, y, y === top ? ROOF_RIM : rib ? ROOF_RIB : c);
    }
  }
  p.hline(L - 2, R + 2, eave, CLAD);
  p.hline(L - 2, R + 2, eave + 1, CLAD_SHADE);

  // The front: a band of cladding, an upper floor of glass, a slab, and shopfronts below.
  const top = 22;
  p.rect(L, top, R - L + 1, base - top, CLAD);
  for (let y = top + 2; y <= 35; y++) {
    for (let x = L + 2; x <= R - 2; x++) {
      const mullion = (x - L - 2) % 6 === 5;
      p.px(x, y, mullion ? STEEL_LIGHT : (x + y) % 13 < 2 ? MALL_GLASS_LIGHT : MALL_GLASS);
    }
  }
  p.hline(L, R, 36, CLAD);
  p.hline(L, R, 37, CLAD_SHADE);
  for (let y = 38; y < base; y++) {
    for (let x = L + 2; x <= R - 2; x++) p.px(x, y, (x - L - 2) % 8 === 7 ? STEEL : y < 40 ? GLASS_SHINE : GLASS);
  }

  // The burger bar, at the far end from the doors: its name on a white board up on the
  // first floor, a lit window, and red and white tiles under it.
  const fw = 19;
  const fx = doorDx <= 0 ? R - 1 - fw : L + 2;
  p.rect(fx, 23, fw, 14, FG_RED);
  p.rect(fx + 1, 24, fw - 2, 12, SIGN_BG);
  drawText(p, 'FIVE', fx + ((fw - textWidth('FIVE')) >> 1), 25, FG_RED);
  drawText(p, 'GUYS', fx + ((fw - textWidth('GUYS')) >> 1), 31, FG_RED);
  p.rect(fx, 38, fw, base - 38, FG_RED);
  p.rect(fx + 1, 39, fw - 2, base - 47, GLASS);
  p.hline(fx + 1, fx + fw - 2, 39, GLASS_SHINE);
  p.hline(fx + 1, fx + fw - 2, base - 9, FG_RED); // the counter inside
  for (let y = base - 7; y < base; y++) for (let x = fx; x < fx + fw; x++) p.px(x, y, ((x - fx) >> 1) % 2 === ((y - base) >> 1) % 2 ? FG_RED : FG_WHITE);

  // The entrance: a tall glass box through the roof with the name across its top,
  // a canopy, and sliding doors (left a crack open).
  const sign = 'WESTFIELD';
  const pw = textWidth(sign) + 6;
  const doorX = ax + doorDx;
  const pl = Math.min(R + 1 - pw, Math.max(L, doorX - (pw >> 1)));
  p.rect(pl, 12, pw, base - 12, CLAD);
  p.rect(pl + 1, 13, pw - 2, 8, SIGN_BG);
  p.hline(pl + 1, pl + pw - 2, 20, CLAD_SHADE);
  drawText(p, sign, pl + 3, 14, RED_SIGN);
  for (let y = 22; y < base - 15; y++) {
    for (let x = pl + 2; x < pl + pw - 2; x++) {
      const bar = (x - pl - 2) % 5 === 4 || (y - 22) % 6 === 5;
      p.px(x, y, bar ? STEEL_LIGHT : (x - y) % 9 === 0 ? GLASS_SHINE : GLASS);
    }
  }
  p.hline(pl - 1, pl + pw, base - 15, CLAD);
  p.hline(pl - 1, pl + pw, base - 14, CLAD_SHADE);
  // Its ground floor is glass too, either side of the doors.
  for (let y = base - 13; y < base; y++) for (let x = pl + 2; x < pl + pw - 2; x++) p.px(x, y, (x - pl - 2) % 6 === 5 ? STEEL : y < base - 11 ? GLASS_SHINE : GLASS);
  const dX = doorX - 6;
  p.rect(dX - 1, base - 13, 14, 13, STEEL);
  p.rect(dX, base - 12, 5, 12, GLASS);
  p.rect(dX + 7, base - 12, 5, 12, GLASS);
  p.rect(dX + 5, base - 12, 2, 12, DOOR_GAP);
  for (let k = 0; k < 4; k++) (p.px(dX + 1 + k, base - 11 + k, GLASS_SHINE), p.px(dX + 8 + k, base - 11 + k, GLASS_SHINE));
  // Shoppers inside, behind the glass on either side of the doors and along the front.
  const coats = [col('#3a86ff'), col('#2f8f6b'), col('#ffbe0b'), col('#8e7cc3'), col('#ff7a45'), col('#e5484d')];
  const free = (x: number) => (x < dX - 2 || x > dX + 13) && (x < fx - 2 || x > fx + fw + 1) && x > L + 3 && x < R - 3;
  for (let i = 0, x = L + 6; x < R - 3; x += 5 + ((i * 7) % 4), i++) {
    if (!free(x) || !free(x + 1) || (i * 5) % 7 === 3) continue;
    const y = base - 2 - (i % 2);
    p.px(x, y - 4, col('#f2c9a0'));
    p.rect(x, y - 3, 2, 3, coats[i % coats.length]);
    if (i % 3 === 1) p.px(x + 2, y - 1, col('#fff3df')); // a shopping bag
  }
  // The pavement out front, and a mat at the doors.
  p.hline(L - 1, R + 1, base, PAVE);
  p.hline(L - 1, R + 1, base + 1, PAVE_DARK);
  p.hline(dX, dX + 11, base, col('#7b7f86'));
  const lights = new Map<Color, Color>([...LIGHTS, ...MALL_LIGHTS, [RED_SIGN, col('#ff4a5c')], [SIGN_BG, col('#fff9e8')], [FG_WHITE, col('#ffe9c8')]]);
  return { sprite: finish(p, ax, base, { rx: hw + 3, ry: 4, dy: 2 }, undefined, lights), door: { dx: doorDx, dy: -7 }, top: 4, roof: top };
}

/**
 * A narrow London townhouse in brick: a slate roof and a chimney, white sash
 * windows on two floors, a green door under a fanlight, a little brass plate
 * by it, a window box of lavender, and two steps between black railings.
 */
function townhouse(accent: string, doorDx: number): Landmark {
  const hw = Math.round(HALF_WIDTH.townhouse * 8);
  const W = hw * 2 + 6;
  const ax = W >> 1;
  const base = 54;
  const p = new Pix(W, base + 4);
  const L = ax - hw;
  const R = ax + hw - 1;
  const BRICK = col('#b8674b');
  const BRICK_DARK = col('#9c543c');
  const BRICK_LIGHT = col('#c97a5c');
  const MORTAR = col('#d8c3ad');
  const SLATE = col('#5b6470');
  const SLATE_LIGHT = col('#737d8a');
  const SLATE_DARK = col('#47505b');
  const DOOR = col(accent);
  const DOOR_DARK = col(shade(accent, -0.12));
  const RAIL = col('#2b2f33');
  const STEP = col('#d8d1c4');
  // The chimney, then the roof: a slate mansard, its ridge at the top.
  p.rect(R - 9, 2, 6, 10, BRICK);
  p.hline(R - 10, R - 2, 2, STONE_LIGHT);
  p.vline(R - 7, 0, 1, col('#c96f4a'));
  p.vline(R - 5, 0, 1, col('#c96f4a'));
  const roofTop = 6;
  const wallTop = 16;
  for (let y = roofTop; y < wallTop; y++) {
    const inset = Math.max(0, 3 - (y - roofTop));
    p.hline(L + inset, R - inset, y, (y - roofTop) % 3 === 0 ? SLATE_LIGHT : (y - roofTop) % 3 === 1 ? SLATE : SLATE_DARK);
  }
  // A dormer window in the roof.
  p.rect(ax - 4, roofTop + 1, 8, 8, SLATE_DARK);
  windowAt(p, ax - 3, roofTop + 2, 6, 6);
  p.hline(L - 1, R + 1, wallTop, STONE_LIGHT);
  // Brick, with the courses showing.
  for (let y = wallTop + 1; y < base; y++) {
    for (let x = L; x <= R; x++) {
      const course = (y - wallTop) % 3 === 0;
      const joint = (x + ((Math.floor((y - wallTop) / 3) % 2) * 3)) % 6 === 0;
      p.px(x, y, course || joint ? MORTAR : (x * 7 + y * 3) % 11 === 0 ? BRICK_LIGHT : (x + y * 5) % 13 === 0 ? BRICK_DARK : BRICK);
    }
  }
  // A white band between the floors.
  p.hline(L, R, 32, TRIM);
  p.hline(L, R, 33, STONE_LIGHT);
  // The door, on its side of the front, with a half-moon fanlight over it.
  const dX = Math.min(R - 9, Math.max(L + 2, ax + doorDx - 4));
  p.rect(dX - 1, base - 18, 10, 18, TRIM);
  p.rect(dX + 1, base - 17, 6, 3, GLASS);
  p.px(dX + 1, base - 17, TRIM);
  p.px(dX + 6, base - 17, TRIM);
  p.px(dX + 3, base - 16, GLASS_SHINE);
  p.rect(dX, base - 13, 8, 13, DOOR);
  p.rect(dX + 1, base - 12, 2, 5, DOOR_DARK);
  p.rect(dX + 5, base - 12, 2, 5, DOOR_DARK);
  p.rect(dX + 1, base - 5, 2, 4, DOOR_DARK);
  p.rect(dX + 5, base - 5, 2, 4, DOOR_DARK);
  p.px(dX + 4, base - 8, GOLD); // the knocker
  // The brass plate by the door.
  const plateX = dX > ax - 4 ? dX - 4 : dX + 10;
  p.rect(plateX, base - 10, 3, 2, GOLD);
  // Sash windows: two upstairs, one downstairs beside the door, with a window box of lavender.
  const sash = (x: number, y: number) => {
    p.rect(x, y, 7, 10, TRIM);
    p.rect(x + 1, y + 1, 5, 8, GLASS);
    p.hline(x + 1, x + 5, y + 4, TRIM);
    p.px(x + 1, y + 1, GLASS_SHINE);
    p.px(x + 2, y + 1, GLASS_SHINE);
    p.hline(x - 1, x + 7, y + 10, STONE_LIGHT);
  };
  sash(L + 4, wallTop + 4);
  sash(R - 10, wallTop + 4);
  const lowX = dX > ax - 4 ? L + 3 : R - 10;
  sash(lowX, base - 16);
  p.hline(lowX - 1, lowX + 7, base - 5, WOOD_DARK);
  p.hline(lowX - 1, lowX + 7, base - 4, WOOD_DEEP);
  for (let i = 0; i < 4; i++) p.px(lowX + i * 2, base - 6, col(i % 2 ? '#9b87d6' : '#b9a4e8'));
  // Two steps up to the door, and black railings either side.
  p.hline(dX - 1, dX + 8, base, STEP);
  p.hline(dX - 2, dX + 9, base + 1, STONE_DARK);
  for (const x of [dX - 3, dX + 10]) {
    p.vline(x, base - 5, base + 1, RAIL);
    p.px(x, base - 6, GOLD);
  }
  p.hline(L - 1, R + 1, base + 2, STONE_LIGHT);
  return { sprite: finish(p, ax, base, { rx: hw + 2, ry: 3, dy: 2 }), door: { dx: doorDx, dy: -6 }, top: 0, roof: wallTop };
}

/**
 * The glass tower on Synergy Isle: very tall, tapering, banded floor by floor
 * (every floor lit after dark), with a rounded crown and a little cloud of its
 * own, on a glass lobby between two shorter office blocks.
 */
function skyscraper(accent: string): Landmark {
  const W = 60;
  const ax = W >> 1;
  const base = 150;
  const p = new Pix(W, base + 4);
  const R = ramp(accent);
  const SPANDREL = col('#6f8fae');
  const SPANDREL_D = col('#5a7896');
  const FIN = col('#eef3f6');
  const STONE_P = col('#e3ddd2');
  const STONE_PD = col('#c4bcae');
  const CLOUD = col('#f7f8fa');
  const CLOUD_D = col('#dfe4ea');
  const lobbyTop = base - 16;

  // Two shorter glass office blocks either side, set back a little.
  const block = (x0: number, x1: number, top: number) => {
    for (let y = top; y < base - 2; y++) {
      const floor = (y - top) % 5;
      p.hline(x0, x1, y, floor === 0 ? SPANDREL : floor === 4 ? SPANDREL_D : GLASS);
      p.px(x1, y, floor ? SPANDREL_D : SPANDREL);
    }
    for (let x = x0 + 3; x < x1; x += 4) p.vline(x, top, base - 3, FIN);
    p.hline(x0, x1, top, FIN);
  };
  block(1, 15, 92);
  block(45, 58, 108);

  // The tower: floor upon floor of glass, tapering as it rises, shaded on the right.
  const t0 = 16;
  for (let y = t0; y < lobbyTop; y++) {
    const t = (lobbyTop - y) / (lobbyTop - t0);
    const hw = Math.round(14 - t * 5);
    const floor = (y - t0) % 4;
    const glass = floor === 0 ? SPANDREL : GLASS;
    p.hline(ax - hw, ax + hw - 1, y, glass);
    p.hline(ax + Math.floor(hw / 2), ax + hw - 1, y, floor === 0 ? SPANDREL_D : glass);
    p.px(ax - hw, y, FIN);
    p.px(ax + hw - 1, y, SPANDREL_D);
    // Fins up the face, catching the light.
    for (let x = ax - hw + 4; x < ax + hw - 2; x += 5) p.px(x, y, FIN);
  }
  // A shine running up the left of the glass.
  for (let y = t0 + 2; y < lobbyTop - 2; y += 4) p.px(ax - 10 + Math.round(((y - t0) / (lobbyTop - t0)) * 4), y + 1, GLASS_SHINE);

  // The crown: an open, rounded top of fins over a lit lantern.
  for (let y = 4; y < t0; y++) {
    const k = (t0 - y) / (t0 - 4);
    const hw = Math.max(1, Math.round(9 * Math.cos(k * 1.35)));
    p.hline(ax - hw, ax + hw - 1, y, y % 3 ? LAMP : LAMP_CORE);
    p.px(ax - hw, y, FIN);
    p.px(ax + hw - 1, y, FIN);
    for (let x = ax - hw + 3; x < ax + hw - 2; x += 3) p.px(x, y, FIN);
  }
  p.hline(ax - 9, ax + 8, t0, FIN);
  p.vline(ax, 1, 4, FIN);

  // The lobby: glass between fins, a canopy in the tower's color and a revolving door.
  p.rect(ax - 18, lobbyTop, 36, base - lobbyTop, GLASS);
  for (let x = ax - 18; x <= ax + 17; x += 4) p.vline(x, lobbyTop, base - 1, FIN);
  p.hline(ax - 19, ax + 18, lobbyTop, FIN);
  p.hline(ax - 19, ax + 18, lobbyTop + 1, STONE_PD);
  p.rect(ax - 7, base - 13, 14, 2, R[2]);
  p.hline(ax - 7, ax + 6, base - 13, R[0]);
  p.rect(ax - 4, base - 10, 8, 10, col('#2f3a44'));
  p.rect(ax - 3, base - 9, 6, 9, GLASS_SHINE);
  p.vline(ax, base - 9, base - 1, FIN);
  // The plaza out front.
  p.hline(1, W - 2, base, STONE_P);
  p.hline(1, W - 2, base + 1, STONE_PD);
  // Planters by the door.
  for (const x of [ax - 12, ax + 10]) {
    p.rect(x, base - 4, 4, 4, STONE_DARK);
    p.ellipse(x + 2, base - 5, 2.5, 2, LEAF);
  }

  // Its own weather: a little cloud drifting by the crown.
  p.ellipse(ax + 17, 9, 6, 3, CLOUD);
  p.ellipse(ax + 13, 8, 4, 3, CLOUD);
  p.ellipse(ax + 21, 10, 4, 2, CLOUD_D);
  const lights = new Map<Color, Color>([...LIGHTS, [SPANDREL, SPANDREL], [CLOUD, col('#c9cfdc')], [CLOUD_D, col('#aeb6c6')]]);
  return { sprite: finish(p, ax, base, { rx: 24, ry: 4, dy: 1 }, undefined, lights), door: { dx: 0, dy: -5 }, top: 0, roof: lobbyTop };
}

/** Where the workshop's big window goes, given its door: on the other side of the front. */
function workshopWindow(doorDx: number) {
  const ax = 30;
  const dX = ax + doorDx - 4;
  const wx = dX < ax ? Math.min(dX + 11, 50 - 22) : Math.max(10, dX - 24);
  return { ax, dX, wx, wy: 22 };
}

/** Where the workshop's cursor blinks, in pixels from the sprite's anchor. */
export function workshopCursor(doorDx: number) {
  const { ax, wx, wy } = workshopWindow(doorDx);
  return { dx: wx + 7 - ax, dy: wy + 8 - 48 };
}

/** The workshop: a plank shed under a mono-pitch roof, a big window with a monitor glowing
 *  inside, a workbench under it, a door propped open and a sawhorse to one side. */
function workshop(accent: string, doorDx: number): Landmark {
  const p = new Pix(60, 54);
  const R = ramp(accent);
  const { ax, dX, wx, wy } = workshopWindow(doorDx);
  const base = 48;
  const BATTEN = col('#a8743f');
  // Stovepipe behind the roof, on the window side.
  const sx = wx + 15;
  p.rect(sx, 1, 3, 8, col('#6f6a64'));
  p.hline(sx - 1, sx + 3, 1, col('#5a5550'));
  // Standing-seam roof in the accent, overhanging the walls.
  p.rect(5, 6, 50, 12, R[2]);
  p.hline(5, 54, 6, R[0]);
  p.hline(5, 54, 7, R[1]);
  for (let x = 7; x < 54; x += 4) p.vline(x, 8, 16, R[3]);
  p.hline(5, 54, 17, R[4]);
  // Plank walls with battens, trimmed at the corners.
  for (let y = 18; y < base; y++) {
    for (let x = 8; x <= 51; x++) p.px(x, y, (x - 8) % 4 === 3 ? BATTEN : ((x - 8) >> 2) % 2 ? WOOD : WOOD_LIGHT);
  }
  p.vline(8, 18, base - 1, TRIM);
  p.vline(51, 18, base - 1, TRIM);
  p.hline(8, 51, 18, WOOD_DARK);
  // The door, propped open on the dark inside, its leaf swung out.
  p.rect(dX, base - 14, 8, 14, col('#2e2119'));
  p.vline(dX - 1, base - 15, base - 1, TRIM);
  p.vline(dX + 8, base - 15, base - 1, TRIM);
  p.hline(dX - 1, dX + 8, base - 15, TRIM);
  const leaf = dX < ax ? dX - 4 : dX + 9;
  p.rect(leaf, base - 14, 3, 14, R[3]);
  p.vline(dX < ax ? leaf : leaf + 2, base - 14, base - 1, R[4]);
  p.px(dX < ax ? leaf + 1 : leaf + 1, base - 7, GOLD);
  lantern(p, dX + 2, 20);
  p.hline(dX - 1, dX + 8, base, STONE_LIGHT);
  p.hline(dX - 1, dX + 8, base + 1, STONE_DARK);
  // The big window: a dim interior, a transom, and a monitor on a desk.
  p.rect(wx, wy, 22, 13, TRIM);
  p.rect(wx + 1, wy + 1, 20, 11, INTERIOR);
  p.hline(wx + 1, wx + 20, wy + 3, TRIM);
  p.hline(wx + 1, wx + 20, wy + 11, WOOD_DEEP); // the desk inside
  p.rect(wx + 6, wy + 4, 9, 6, col('#2b2a2e'));
  p.rect(wx + 7, wy + 5, 7, 4, SCREEN_BG);
  p.hline(wx + 7, wx + 11, wy + 5, SCREEN);
  p.hline(wx + 7, wx + 9, wy + 6, SCREEN);
  p.hline(wx + 7, wx + 12, wy + 7, SCREEN_HI);
  p.px(wx + 10, wy + 10, col('#2b2a2e'));
  p.px(wx + 3, wy + 10, CREAM); // a mug
  p.hline(wx - 1, wx + 22, wy + 13, TRIM); // sill
  // The workbench under the window, blueprints and a vice on top.
  const by = base - 6;
  p.hline(wx - 1, wx + 22, by, WOOD_LIGHT);
  p.hline(wx - 1, wx + 22, by + 1, WOOD_DARK);
  for (const x of [wx, wx + 21]) p.vline(x, by + 2, base, WOOD_DEEP);
  p.hline(wx + 1, wx + 20, base - 2, WOOD_DARK); // shelf
  p.rect(wx + 4, base - 4, 3, 2, col('#3a86ff'));
  p.rect(wx + 9, base - 4, 3, 2, RED);
  p.rect(wx + 6, by - 1, 7, 1, col('#2f6db5'));
  p.px(wx + 8, by - 1, col('#dfeaff'));
  p.px(wx + 10, by - 1, col('#dfeaff'));
  p.rect(wx + 17, by - 2, 3, 2, col('#5c636b'));
  p.rect(wx + 18, by - 4, 1, 2, WHITE); // half a lighthouse in the vice
  p.px(wx + 18, by - 3, RED);
  // A sawhorse with a plank, past the window side, and sawdust under it.
  const hx = dX < ax ? 52 : 1;
  p.hline(hx, hx + 6, base - 4, col('#e2bb85'));
  p.hline(hx, hx + 6, base - 3, WOOD_DARK);
  for (const [x, d] of [[hx + 1, -1], [hx + 5, 1]] as const) {
    p.px(x, base - 2, WOOD);
    p.px(x + d, base - 1, WOOD);
    p.px(x + d, base, WOOD);
  }
  for (const [x, y] of [[0, 1], [2, 2], [4, 1], [5, 2], [3, 1]] as const) p.px(hx + x, base + y, col('#efd5a6'));
  return { sprite: finish(p, ax, base, { rx: 26, ry: 4, dy: 2 }), door: { dx: doorDx, dy: -6 }, top: 1 };
}

const shadeU = (c: Color, dl: number) => col(shade('#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join(''), dl));

/** The post box at the end of the pier, with a letter in the slot. */
function postbox(accent: string): Landmark {
  const p = new Pix(14, 20);
  const R = ramp(accent);
  const ax = 7;
  const base = 18;
  p.rect(5, 12, 4, 7, IRON);
  p.rect(2, 3, 10, 10, R[2]);
  p.hline(3, 10, 2, R[1]);
  p.hline(4, 9, 1, R[1]);
  p.vline(2, 3, 12, R[1]);
  p.vline(11, 3, 12, R[3]);
  p.hline(2, 11, 12, R[4]);
  p.hline(4, 9, 5, IRON);
  p.rect(5, 3, 5, 2, TRIM); // the letter peeking out
  p.px(9, 4, RED);
  p.px(7, 8, GOLD);
  return { sprite: finish(p, ax, base, { rx: 5, ry: 2 }), door: { dx: 0, dy: -10 }, top: 0 };
}

/** The bottle washed up on the beach, with a rolled note inside and a ribbon. */
function bottle(accent: string): Landmark {
  const p = new Pix(22, 12);
  const ax = 10;
  const base = 9;
  const G1 = col('#bdeee0');
  const G2 = col('#8fd8c4');
  const G3 = col('#e8fbf5');
  // Lying on its side, neck to the right.
  p.rect(2, 3, 12, 6, G1);
  p.hline(3, 12, 2, G1);
  p.hline(3, 12, 9, G2);
  p.rect(14, 4, 3, 4, G1);
  p.rect(17, 4, 2, 4, col('#b5835a'));
  p.hline(3, 11, 3, G3);
  p.rect(4, 5, 8, 3, col('#fff3d6'));
  p.vline(7, 5, 7, col(accent));
  p.vline(8, 5, 7, col(accent));
  p.vline(13, 3, 8, G2);
  return { sprite: finish(p, ax, base, { rx: 9, ry: 2, dy: 1 }), door: { dx: 0, dy: -4 }, top: 0 };
}

/** Paint a place's landmark. `doorDx` is where its door is along the front, in map pixels. */
export function paintLandmark(kind: LandmarkKind, accent: string, doorDx: number): Landmark {
  switch (kind) {
    case 'cabin':
      return cabin(accent, doorDx);
    case 'taproom':
      return taproom(accent, doorDx);
    case 'tree':
      return tree(accent);
    case 'library':
      return library(accent, doorDx);
    case 'lighthouse':
      return lighthouse(accent);
    case 'schoolhouse':
      return schoolhouse(accent, doorDx);
    case 'depot':
      return depot(accent, doorDx);
    case 'mall':
      return mall(accent, doorDx);
    case 'townhouse':
      return townhouse(accent, doorDx);
    case 'skyscraper':
      return skyscraper(accent);
    case 'workshop':
      return workshop(accent, doorDx);
    case 'postbox':
      return postbox(accent);
    case 'bottle':
      return bottle(accent);
  }
}

// ---------- Scenery ----------

/** A palm: a curved, ringed trunk and a burst of fronds. */
function palm(variant: number): Sprite {
  const p = new Pix(26, 30);
  const ax = 12;
  const base = 28;
  const lean = variant % 2 ? 1 : -1;
  const TRUNK = col('#b38552');
  const TRUNK_D = col('#8f6640');
  let tx = 0;
  let ty = 0;
  for (let y = base; y >= 10; y--) {
    const t = (base - y) / (base - 10);
    const x = Math.round(ax + lean * t * t * 5);
    p.hline(x - 1, x + 1, y, (base - y) % 3 === 0 ? TRUNK_D : TRUNK);
    p.px(x + 1, y, TRUNK_D);
    tx = x;
    ty = y;
  }
  const F1 = col('#4fb84f');
  const F2 = col('#37963f');
  const F3 = col('#7ccf62');
  // Fronds: arcs drooping out from the crown.
  const fronds: [number, number][] = [[-1, -0.3], [1, -0.3], [-1, 0.5], [1, 0.5], [-0.4, -1], [0.5, -1], [0, 0.9]];
  for (const [dx, dy] of fronds) {
    const len = 10;
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      const x = Math.round(tx + dx * s * 1.05);
      const y = Math.round(ty + dy * s * 0.75 + k * k * 4);
      p.px(x, y, F1);
      p.px(x, y + 1, F2);
      if (s % 3 === 1) p.px(x, y - 1, F3);
    }
  }
  p.rect(tx - 1, ty + 1, 2, 2, col('#6e4a2c')); // coconuts
  p.px(tx + 1, ty + 2, col('#6e4a2c'));
  return finish(p, ax, base, { rx: 6, ry: 2 });
}

/** A round broadleaf tree. */
function roundTree(variant: number): Sprite {
  const p = new Pix(22, 26);
  const ax = 11;
  const base = 24;
  const greens = variant % 2 ? ['#8bd06a', '#6cc35b', '#4fae55', '#3d9248'] : ['#a3d96e', '#7ec95e', '#5bb452', '#46994a'];
  const [g0, g1, g2, g3] = greens.map((h) => col(h));
  p.rect(ax - 2, 16, 4, base - 16 + 1, col('#8a5a3b'));
  p.vline(ax + 1, 16, base, col('#6e4a2c'));
  p.ellipse(ax, 10, 10, 9, g3);
  p.ellipse(ax - 0.5, 9.5, 9, 8, g2);
  p.ellipse(ax - 2, 8, 6.5, 5.5, g1);
  p.ellipse(ax - 3.5, 6, 3, 2.5, g0);
  // A few leaf-clump notches so the edge isn't a perfect circle.
  for (const [x, y] of [[ax + 4, 12], [ax - 5, 13], [ax + 6, 6]] as const) p.px(x, y, g3);
  if (variant % 3 === 0) for (const [x, y] of [[ax - 4, 10], [ax + 3, 8], [ax, 13]] as const) p.px(x, y, col('#ff7b6b'));
  return finish(p, ax, base, { rx: 7, ry: 2 });
}

/** A pine: three stacked tiers. */
function pine(): Sprite {
  const p = new Pix(18, 28);
  const ax = 9;
  const base = 26;
  p.rect(ax - 1, 21, 3, 6, col('#7d5236'));
  const tiers: [number, number, number][] = [[22, 8, 9], [15, 6, 8], [9, 4, 7]];
  const cs = ['#3e9c63', '#4aac6c', '#57ba74'].map((h) => col(h));
  tiers.forEach(([bottom, hw, h], i) => {
    for (let y = 0; y < h; y++) {
      const w = Math.round(((y + 1) / h) * hw);
      p.hline(ax - w, ax + w, bottom - h + y, cs[i]);
      p.hline(ax + Math.ceil(w / 2), ax + w, bottom - h + y, col('#327f52'));
    }
  });
  p.px(ax, 1, cs[2]);
  return finish(p, ax, base, { rx: 6, ry: 2 });
}

/** A bush, sometimes with berries. */
function bush(variant: number): Sprite {
  const p = new Pix(14, 10);
  const ax = 7;
  const base = 9;
  p.ellipse(7, 5.5, 6, 4, col('#46994a'));
  p.ellipse(6.5, 5, 5, 3.4, col('#5bb452'));
  p.ellipse(5, 3.6, 2.6, 1.6, col('#8bd06a'));
  if (variant % 2) for (const [x, y] of [[4, 6], [8, 4], [10, 6]] as const) p.px(x, y, col('#e5484d'));
  return finish(p, ax, base, { rx: 6, ry: 1.5 });
}

/** A rock, round and grey, lit from the top left. */
function rockSprite(size: number): Sprite {
  const w = size ? 12 : 8;
  const h = size ? 9 : 6;
  const p = new Pix(w, h);
  p.ellipse(w / 2, h / 2 + 0.5, w / 2 - 0.5, h / 2 - 0.5, col('#958c80'));
  p.ellipse(w / 2 - 0.5, h / 2, w / 2 - 1.5, h / 2 - 1.2, col('#b5ada3'));
  p.ellipse(w / 2 - 1.5, h / 2 - 1, w / 4 - 0.5, h / 4 - 0.3, col('#d0c9bd'));
  return finish(p, w >> 1, h - 1);
}

/** A rowboat moored by the pier, its stripe in the accent. */
export function rowboat(accent: string): Sprite {
  const p = new Pix(14, 24);
  const ax = 7;
  const base = 22;
  p.ellipse(7, 11.5, 6, 11, col('#fffaf0'));
  p.ellipse(7, 11.5, 4.6, 9.6, col(accent));
  p.ellipse(7, 11.5, 3.6, 8.6, col('#c99561'));
  p.hline(4, 10, 8, col('#9b6b42'));
  p.hline(4, 10, 15, col('#9b6b42'));
  p.rect(5, 10, 5, 2, col('#ff9fb5')); // the damp towel
  return finish(p, ax, base);
}

/** A lantern on a post, at the edge of the pier. */
export function lampPost(): Sprite {
  const p = new Pix(7, 22);
  p.vline(3, 6, 21, col('#6e4a30'));
  p.vline(4, 6, 21, col('#55381f'));
  p.hline(1, 5, 1, IRON);
  p.rect(1, 2, 5, 4, LAMP);
  p.px(3, 3, LAMP_CORE);
  p.hline(1, 5, 6, IRON);
  return finish(p, 3, 21);
}

/** The crab on the beach by the bottle: two frames, claws up and down. */
export function crab(frame: number): Sprite {
  const p = new Pix(11, 7);
  const C1 = col('#ff6b5b');
  const C2 = col('#e5484d');
  p.ellipse(5.5, 4, 3.5, 2.2, C1);
  p.hline(3, 7, 5, C2);
  const up = frame ? 0 : 1;
  p.rect(0, 1 + up, 2, 2, C1);
  p.rect(9, 1 + up, 2, 2, C1);
  p.px(4, 1, WHITE);
  p.px(6, 1, WHITE);
  p.px(4, 2, col('#1d1a16'));
  p.px(6, 2, col('#1d1a16'));
  for (const x of [2, 3, 7, 8]) p.px(x, 6, C2);
  return finish(p, 5, 6);
}

/** A starfish and two shells: little things on the sand. */
export function shells(): Sprite {
  const p = new Pix(16, 8);
  const S = col('#ff9f7a');
  p.px(3, 1, S);
  p.hline(1, 5, 3, S);
  p.vline(3, 2, 4, S);
  p.px(2, 5, S);
  p.px(4, 5, S);
  p.rect(9, 3, 3, 2, col('#fff1e0'));
  p.px(10, 3, col('#f4d8c0'));
  p.rect(13, 5, 2, 2, col('#ffd6e0'));
  return finish(p, 8, 6);
}

// ---------- Lost words ----------

/** A tiny rolled scroll tied with a red ribbon. */
export function scroll(): Sprite {
  const p = new Pix(10, 7);
  const PAPER = col('#f6e6c4');
  const ROLL = col('#d9bb88');
  p.rect(1, 1, 8, 4, PAPER);
  p.vline(1, 1, 4, ROLL);
  p.vline(8, 1, 4, ROLL);
  const RIBBON = col('#c9483c');
  p.hline(2, 7, 4, col('#e8d3a8'));
  p.vline(4, 1, 4, RIBBON);
  p.vline(5, 1, 4, RIBBON);
  p.px(4, 5, RIBBON);
  p.px(6, 5, RIBBON);
  return finish(p, 5, 6, { rx: 4, ry: 1, dy: 0 });
}

/** The portal: a ring of old stones on a plinth, and the swirl inside it (frames, drawn over the ring). */
export interface PortalArt {
  ring: Sprite;
  /** The swirl, frame by frame, the same by day and by night (it's its own light). */
  swirl: HTMLCanvasElement[];
  /** Where the swirl's top-left goes, from the ring's anchor. */
  sx: number;
  sy: number;
  /** The middle of the swirl, from the ring's anchor. */
  cx: number;
  cy: number;
}

export function portal(frames = 12): PortalArt {
  const W = 24;
  const H = 32;
  const ax = 12;
  const ay = 30;
  const p = new Pix(W, H);
  const cx = 12;
  const cy = 14.5;
  // The ring: an ellipse of stone with the middle left open for the swirl.
  const RUNE = col('#c4b5fd');
  const GEM = col('#a78bfa');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / 10;
      const dy = (y + 0.5 - cy) / 13;
      const outer = dx * dx + dy * dy <= 1;
      const ix = (x + 0.5 - cx) / 6.6;
      const iy = (y + 0.5 - cy) / 9.6;
      if (!outer || ix * ix + iy * iy <= 1) continue;
      // Blocks: lit from the top left, a dark seam every few pixels round the ring.
      const a = Math.atan2(dy, dx);
      const seam = Math.abs(((a / (Math.PI * 2)) * 14 + 14) % 1) < 0.1;
      p.px(x, y, seam ? STONE_DARK : dx + dy < -0.35 ? STONE_LIGHT : dx + dy > 0.45 ? STONE_DARK : STONE);
    }
  }
  // Runes on the stones that glow at night, and a gem at the keystone.
  for (const [x, y] of [[3, 9], [3, 18], [20, 9], [20, 18], [7, 3], [16, 3], [6, 25], [17, 25]] as const) p.px(x, y, RUNE);
  p.rect(11, 1, 2, 2, GEM);
  // The plinth: two steps of stone under the ring.
  p.rect(4, 26, 16, 2, STONE);
  p.hline(4, 19, 26, STONE_LIGHT);
  p.rect(2, 28, 20, 2, STONE_DARK);
  p.hline(2, 21, 28, STONE);
  const lights = new Map<Color, Color>([...LIGHTS, [RUNE, col('#e9d5ff')], [GEM, col('#f5d0fe')]]);
  p.outline(INK);
  const shadow = new Pix(W, H);
  shadow.ellipse(ax + 1, ay, 10, 2, SHADOW);
  shadow.stamp(p, 0, 0);
  p.data.set(shadow.data);
  const ring: Sprite = { w: W, h: H, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data, lights)), data: p.data };

  // The swirl: three arms turning slowly inward, bright in the middle, a dark rim with sparks of cyan.
  const SW = 14;
  const SH = 20;
  const sx = Math.round(cx - SW / 2);
  const sy = Math.round(cy - SH / 2);
  const BANDS = ['#f0abfc', '#c084fc', '#8b5cf6', '#7c3aed'].map((h) => col(h));
  const CORE = col('#fdf4ff');
  const RIM = col('#4c1d95');
  const SPARK = col('#67e8f9');
  const swirl: HTMLCanvasElement[] = [];
  for (let f = 0; f < frames; f++) {
    const q = new Pix(SW, SH);
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const dx = (sx + x + 0.5 - cx) / 6.6;
        const dy = (sy + y + 0.5 - cy) / 9.6;
        const r = Math.hypot(dx, dy);
        if (r > 1) continue;
        if (r < 0.2) {
          q.px(x, y, CORE);
          continue;
        }
        if (r > 0.84) {
          const turn = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 + f / frames) % 1;
          q.px(x, y, Math.floor(turn * 9) % 3 === 0 && r > 0.9 ? SPARK : RIM);
          continue;
        }
        const v = (Math.atan2(dy, dx) / (Math.PI * 2)) * 3 + r * 2.4 - f / frames;
        q.px(x, y, BANDS[Math.floor((((v % 1) + 1) % 1) * 4)]);
      }
    }
    swirl.push(q.canvas());
  }
  return { ring, swirl, sx: sx - ax, sy: sy - ay, cx: cx - ax, cy: cy - ay };
}

export type SceneryKind = 'palm' | 'tree' | 'pine' | 'bush' | 'rock' | 'boulder';

/** Every scenery sprite, painted once and shared. */
export function paintScenery() {
  return {
    palm: [palm(0), palm(1)],
    tree: [roundTree(0), roundTree(1), roundTree(3)],
    pine: [pine()],
    bush: [bush(0), bush(1)],
    rock: [rockSprite(0)],
    boulder: [rockSprite(1)],
  } satisfies Record<SceneryKind, Sprite[]>;
}
