// Street furniture for Little London: an old iron lamp post (on Tower Bridge
// too), a red telephone box, a red pillar box and a bench. Small sprites in
// the map's hand, facing south like everything else; the lamps and the
// telephone box light up after dark.

import { HEX } from './palette';
import { col, nightData, Pix, type Color } from './pixels';
import type { Sprite } from './sprites';

const INK = col(HEX.ink);
const SHADOW = col('#2a1d10', 46);
const IRON = col('#34363c');
const IRON_LIGHT = col('#5a5d66');
const GOLD = col('#f2c14e');
const RED = col('#d42a2f');
const RED_LIGHT = col('#ec5148');
const RED_DARK = col('#a51d22');
const WOOD = col('#b98352');
const WOOD_LIGHT = col('#d2a06a');
const WOOD_DARK = col('#8a5a36');
// Lit after dark.
const LAMP = col('#ffe7a6');
const LAMP_CORE = col('#fff6d8');
const PANE = col('#a9d3e2');
const PANE_SHINE = col('#e2f3f8');
const SIGN = col('#f6f1e4');
const LIGHTS = new Map<Color, Color>([
  [LAMP, col('#ffe27a')],
  [LAMP_CORE, col('#fffbe6')],
  [PANE, col('#ffd98a')],
  [PANE_SHINE, col('#fff0c0')],
  [SIGN, col('#fffbe8')],
]);

function finish(p: Pix, ax: number, ay: number, shadow = 0): Sprite {
  p.outline(INK);
  if (shadow) {
    const s = new Pix(p.w, p.h);
    s.ellipse(ax + 0.5, ay, shadow, 1.6, SHADOW);
    s.stamp(p, 0, 0);
    p.data.set(s.data);
  }
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data, LIGHTS)), data: p.data };
}

/** An old iron lamp post with a lantern on top. */
export function streetLamp(): Sprite {
  const p = new Pix(9, 23);
  // The base, the post and a little crossbar.
  p.hline(3, 5, 21, IRON);
  p.hline(3, 5, 20, IRON);
  p.vline(4, 8, 19, IRON);
  p.px(5, 12, IRON_LIGHT);
  p.hline(3, 5, 8, IRON);
  // The lantern: a finial, a cap and its glass.
  p.px(4, 1, GOLD);
  p.hline(3, 5, 2, IRON);
  p.hline(2, 6, 3, IRON);
  p.rect(2, 4, 5, 3, LAMP);
  p.vline(4, 4, 6, LAMP_CORE);
  p.hline(2, 6, 7, IRON);
  return finish(p, 4, 21);
}

/** A red telephone box: a domed roof with a crown, a lit sign under it, and a door of little panes. */
export function phoneBox(): Sprite {
  const p = new Pix(14, 28);
  const L = 2;
  const R = 11;
  // The roof: a crown on a shallow dome.
  p.px(6, 1, GOLD);
  p.px(7, 1, GOLD);
  p.hline(5, 8, 2, RED);
  p.hline(L + 1, R - 1, 3, RED_LIGHT);
  p.hline(L, R, 4, RED);
  // The sign, lit from inside.
  p.hline(L, R, 5, RED_DARK);
  p.rect(L + 1, 6, R - L - 1, 2, SIGN);
  for (let x = L + 2; x < R - 1; x += 2) p.px(x, 6, INK);
  p.hline(L, R, 8, RED_DARK);
  // The body: posts at the corners, the door between them, glazed in rows of little panes.
  p.rect(L, 9, R - L + 1, 15, RED);
  p.vline(L, 9, 23, RED_LIGHT);
  p.vline(R, 9, 23, RED_DARK);
  for (let y = 10; y < 22; y += 2) {
    for (let x = L + 2; x <= R - 2; x += 2) p.px(x, y, (x + y) % 6 === 0 ? PANE_SHINE : PANE);
    for (let x = L + 3; x <= R - 3; x += 2) p.px(x, y, (x + y) % 5 === 0 ? PANE_SHINE : PANE);
  }
  p.px(R - 2, 16, GOLD); // the handle
  // A plinth.
  p.hline(L - 1, R + 1, 24, RED_DARK);
  p.hline(L - 1, R + 1, 25, RED_DARK);
  return finish(p, 7, 25, 6);
}

/** A red pillar box with a dark cap and a slot. */
export function pillarBox(): Sprite {
  const p = new Pix(11, 16);
  p.hline(3, 7, 1, RED_DARK);
  p.hline(2, 8, 2, RED_DARK);
  p.hline(2, 8, 3, RED);
  p.rect(2, 4, 7, 9, RED);
  p.vline(3, 3, 12, RED_LIGHT);
  p.vline(8, 4, 12, RED_DARK);
  p.hline(3, 7, 5, INK); // the slot
  p.rect(4, 8, 3, 2, SIGN); // the collection plate
  p.hline(1, 9, 13, RED_DARK);
  return finish(p, 5, 13, 4);
}

/** A slatted wooden bench on iron ends, seen from the front. */
export function bench(): Sprite {
  const p = new Pix(18, 11);
  // The back: two slats on iron uprights.
  p.hline(2, 15, 1, WOOD_LIGHT);
  p.hline(2, 15, 2, WOOD_DARK);
  p.hline(2, 15, 3, WOOD);
  p.hline(2, 15, 4, WOOD_DARK);
  // The seat.
  p.hline(1, 16, 6, WOOD_LIGHT);
  p.hline(1, 16, 7, WOOD);
  // The iron ends, curling down to the ground.
  for (const x of [2, 15]) {
    p.vline(x, 1, 9, IRON);
    p.px(x + (x < 9 ? -1 : 1), 9, IRON);
  }
  return finish(p, 9, 9, 7);
}
