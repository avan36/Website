// The explorer, in pixels: the same round marshmallow as on the 3D island,
// with its orange scarf, sprout and backpack. Four facings, a three-frame
// walk (stand, left foot, stand, right foot), a breathing idle frame, and a
// pose for holding something up (a found word). Hops and the fishing rod are
// added when it's drawn. Whatever the visitor wears from the wardrobe is
// painted on top: hats (which push the sprite up a few pixels), glasses, the
// scarf in another color, a vest.

import { HEX } from './palette';
import { col, nightData, Pix, shade, type Color } from './pixels';
import type { Outfit } from '../../world/schema';

/** What the sprite needs to know about a piece of clothing. */
export type Wearable = Pick<Outfit, 'id' | 'slot' | 'color'>;

export type Facing = 'down' | 'up' | 'left' | 'right';

const PAL: Record<string, Color> = {
  o: col(HEX.ink),
  w: col('#fffaf1'),
  s: col('#e9dfcf'),
  k: col('#1f1a17'),
  p: col('#ff9e9e'),
  r: col('#ff5a36'),
  R: col('#d23f1e'),
  g: col('#6fd25e'),
  G: col('#3f9e45'),
  t: col('#e7ac68'),
  T: col('#c08546'),
  b: col('#6b4a3a'),
};

// 14 x 14 bodies: a sprout on top, then a round marshmallow. Feet are added per frame.
const DOWN = [
  '.......gg.....',
  '......Gg......',
  '.....oooo.....',
  '...oowwwwoo...',
  '..owwwwwwwwo..',
  '..owwwwwwwwo..',
  '.owwkwwwwkwwo.',
  '.owwkwwwwkwwo.',
  '.owpwwwwwwpwo.',
  '.orrrrrrrrrro.',
  '.owwwwRrwwwso.',
  '..owwwRwwwso..',
  '...oowwwssoo..',
  '.....oooo.....',
];
const UP = [
  '......gg......',
  '.......gG.....',
  '.....oooo.....',
  '...oowwwwoo...',
  '..owwwwwwwwo..',
  '..owwwwwwwwo..',
  '.owwotttowwwo.',
  '.owwtTTTtwwwo.',
  '.owwtTtTtwwwo.',
  '.orrtttttrrro.',
  '.owwtTTTtwwso.',
  '..owwtttwwso..',
  '...oowwwssoo..',
  '.....oooo.....',
];
const SIDE = [
  '.......gg.....',
  '......gG......',
  '.....oooo.....',
  '...oowwwwoo...',
  '..owwwwwwwwo..',
  '..owwwwwwwwo..',
  '.oowwwwwwkwwo.',
  'ottowwwwwkwwo.',
  'otTowwwwwwwpo.',
  'otTorrrrrrrro.',
  '.oooRRwwwwwso.',
  '...oRwwwwwso..',
  '...oowwwssoo..',
  '.....oooo.....',
];

const W = 14;
const H = 17;
/** Extra rows above the head for a hat. */
const HAT_ROOM = 3;

// Hats, 14 wide; the last row sits on the top of the head (body row 3).
// Letters: o outline, A main color, a its shade, plus a few fixed accents.
const HATS: Record<string, string[]> = {
  'hard-hat': ['.....oooo.....', '....oAAAAo....', '...oAAaAAAo...', '..oAAAaAAAAo..', 'oaaaaaaaaaaaao'],
  mortarboard: ['..oooooooooo..', '.oAAAAAAAAAAo.', '..ooaaaaaaooY.', '...oaaaaaao.Y.'],
  'fishing-hat': ['.....oooo.....', '....oAAAAo....', '...oGGGGGGo...', '.oaaaaaaaaaao.'],
  'sailor-hat': ['....oooooo....', '...oAAAAAAo...', '...oBBBBBBo...', '.oaaaaaaaaaao.'],
  'leaf-crown': ['...A..AA..A...', '..AaAAaaAAaA..', '..aPaaAaaaPa..'],
};
const HAT_PAL = { o: col(HEX.ink), Y: col('#f5c542'), G: col('#5b7a4a'), B: col('#2b5fa8'), P: col('#ffb7c9') };

/** Per frame: how far each foot drops (left, right) and how the body bobs. */
const STEPS: { l: number; r: number; dy: number }[] = [
  { l: 0, r: 0, dy: 0 }, // standing
  { l: 0, r: -1, dy: -1 }, // up on the left foot
  { l: 0, r: 0, dy: 0 },
  { l: -1, r: 0, dy: -1 }, // up on the right foot
  { l: 0, r: 0, dy: 1 }, // breathing out (idle)
];

function frame(body: string[], facing: Facing, step: number, hold: 'none' | 'up', worn: readonly Wearable[] = []) {
  const head = worn.find((o) => o.slot === 'head');
  const top = head ? HAT_ROOM : 0;
  const p = new Pix(W, H + top);
  const { l, r, dy } = STEPS[step];
  // Feet first, peeking out under the body.
  const foot = (x: number, drop: number) => {
    const y = 14 + drop + top;
    p.hline(x, x + 2, y, PAL.o);
    p.px(x + 1, y, PAL.b);
    p.hline(x, x + 2, y + 1, PAL.o);
  };
  foot(3, l);
  foot(8, r);
  const oy = 1 + dy + top;
  const neck = worn.find((o) => o.slot === 'neck');
  const pal = neck ? { ...PAL, r: col(neck.color), R: col(shade(neck.color, -0.12)) } : PAL;
  // A hat replaces the sprout (a leaf crown grows round it).
  const sprout = !head || head.id === 'leaf-crown';
  p.map(sprout ? body : body.slice(2), pal, 0, sprout ? oy : oy + 2);
  dressUp(p, worn, facing === 'left' ? 'right' : facing, oy); // left is right, flipped below
  if (hold === 'up') {
    // Arms up: little nubs either side of the head.
    for (const [x, d] of [[1, -1], [12, 1]] as const) {
      p.px(x, 7 + top, PAL.o);
      p.px(x, 6 + top, PAL.w);
      p.px(x + d, 6 + top, PAL.o);
      p.px(x, 5 + top, PAL.o);
    }
  }
  if (facing === 'left') {
    const q = new Pix(W, p.h);
    q.stamp(p, 0, 0, true);
    return q;
  }
  return p;
}

/** Paint the face, body and head pieces over a body drawn at row offset `oy`. */
function dressUp(p: Pix, worn: readonly Wearable[], facing: Facing, oy: number) {
  const body = worn.find((o) => o.slot === 'body');
  if (body) {
    // Recolor the body below the scarf, open at the front.
    const c = col(body.color);
    const d = col(shade(body.color, -0.12));
    const stripe = col('#e9f1dc');
    for (let y = 10; y <= 12; y++) {
      for (let x = 0; x < W; x++) {
        if (facing === 'down' && (x === 6 || x === 7)) continue;
        if (facing === 'right' && x >= 10) continue;
        const v = p.get(x, oy + y);
        if (v === PAL.w || v === PAL.s) p.px(x, oy + y, y === 11 ? stripe : v === PAL.s ? d : c);
      }
    }
  }
  const face = worn.find((o) => o.slot === 'face');
  if (face && facing !== 'up') {
    const c = col(face.color);
    const dark = face.id === 'sunglasses';
    const lens = (x: number) => {
      if (dark) {
        p.rect(x, oy + 6, 3, 2, c);
        p.px(x, oy + 6, col('#8fa3c4'));
      } else {
        p.hline(x, x + 2, oy + 5, c);
        p.px(x, oy + 6, c);
        p.px(x + 2, oy + 6, c);
        p.px(x, oy + 7, c);
        p.px(x + 2, oy + 7, c);
        p.hline(x, x + 2, oy + 8, c);
      }
    };
    if (facing === 'down') {
      lens(3);
      lens(8);
      p.hline(6, 7, oy + 6, c);
    } else {
      // Side on (drawn facing right): one lens over the eye, the arm running back.
      lens(8);
      p.hline(4, 7, oy + 6, c);
    }
  }
  const head = worn.find((o) => o.slot === 'head');
  if (head) {
    const rows = HATS[head.id] ?? HATS['hard-hat'];
    const pal = { ...HAT_PAL, A: col(head.color), a: col(shade(head.color, head.id === 'sailor-hat' ? -0.08 : -0.14)) };
    p.map(rows, pal, 0, oy + 3 - (rows.length - 1));
  }
}

export interface ExplorerSprites {
  w: number;
  h: number;
  /** [facing][step] canvases, by day and by night. */
  frames: Record<Facing, HTMLCanvasElement[]>;
  framesNight: Record<Facing, HTMLCanvasElement[]>;
  /** Holding something up over its head, facing down. */
  cheer: HTMLCanvasElement;
  cheerNight: HTMLCanvasElement;
}

export function paintExplorer(worn: readonly Wearable[] = []): ExplorerSprites {
  const bodies: Record<Facing, string[]> = { down: DOWN, up: UP, left: SIDE, right: SIDE };
  const frames = {} as Record<Facing, HTMLCanvasElement[]>;
  const framesNight = {} as Record<Facing, HTMLCanvasElement[]>;
  for (const f of ['down', 'up', 'left', 'right'] as Facing[]) {
    const pix = STEPS.map((_, s) => frame(bodies[f], f, s, 'none', worn));
    frames[f] = pix.map((p) => p.canvas());
    framesNight[f] = pix.map((p) => p.canvas(nightData(p.data)));
  }
  const cheer = frame(DOWN, 'down', 0, 'up', worn);
  return { w: W, h: cheer.h, frames, framesNight, cheer: cheer.canvas(), cheerNight: cheer.canvas(nightData(cheer.data)) };
}

/** Which way to face for a movement direction (x east, z south). */
export function facingFor(dx: number, dz: number, prev: Facing): Facing {
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return prev;
  // Prefer the current facing on near-diagonals, so it doesn't flicker.
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax > az * 1.15) return dx > 0 ? 'right' : 'left';
  if (az > ax * 1.15) return dz > 0 ? 'down' : 'up';
  if ((prev === 'left' || prev === 'right') && Math.sign(dx) === (prev === 'right' ? 1 : -1)) return prev;
  if ((prev === 'up' || prev === 'down') && Math.sign(dz) === (prev === 'down' ? 1 : -1)) return prev;
  return ax > az ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up';
}
