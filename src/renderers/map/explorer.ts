// The explorer, in pixels: the same round marshmallow as on the 3D island,
// with its orange scarf, sprout and backpack. Four facings, a three-frame
// walk (stand, left foot, stand, right foot), a breathing idle bob, a hop,
// and a pose for holding something up (a found word) or a fishing rod.

import { HEX } from './palette';
import { col, nightData, Pix, type Color } from './pixels';

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

/** Per frame: how far each foot drops (left, right) and how the body bobs. */
const STEPS: { l: number; r: number; dy: number }[] = [
  { l: 0, r: 0, dy: 0 }, // standing
  { l: 0, r: -1, dy: -1 }, // up on the left foot
  { l: 0, r: 0, dy: 0 },
  { l: -1, r: 0, dy: -1 }, // up on the right foot
  { l: 0, r: 0, dy: 1 }, // breathing out (idle)
];

function frame(body: string[], facing: Facing, step: number, hold: 'none' | 'up') {
  const p = new Pix(W, H);
  const { l, r, dy } = STEPS[step];
  // Feet first, peeking out under the body.
  const foot = (x: number, drop: number) => {
    const y = 14 + drop;
    p.hline(x, x + 2, y, PAL.o);
    p.px(x + 1, y, PAL.b);
    p.hline(x, x + 2, y + 1, PAL.o);
  };
  foot(3, l);
  foot(8, r);
  p.map(body, PAL, 0, 1 + dy);
  if (hold === 'up') {
    // Arms up: little nubs either side of the head.
    for (const [x, d] of [[1, -1], [12, 1]] as const) {
      p.px(x, 7, PAL.o);
      p.px(x, 6, PAL.w);
      p.px(x + d, 6, PAL.o);
      p.px(x, 5, PAL.o);
    }
  }
  if (facing === 'left') {
    const q = new Pix(W, H);
    q.stamp(p, 0, 0, true);
    return q;
  }
  return p;
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

export function paintExplorer(): ExplorerSprites {
  const bodies: Record<Facing, string[]> = { down: DOWN, up: UP, left: SIDE, right: SIDE };
  const frames = {} as Record<Facing, HTMLCanvasElement[]>;
  const framesNight = {} as Record<Facing, HTMLCanvasElement[]>;
  for (const f of ['down', 'up', 'left', 'right'] as Facing[]) {
    const pix = STEPS.map((_, s) => frame(bodies[f], f, s, 'none'));
    frames[f] = pix.map((p) => p.canvas());
    framesNight[f] = pix.map((p) => p.canvas(nightData(p.data)));
  }
  const cheer = frame(DOWN, 'down', 0, 'up');
  return { w: W, h: H, frames, framesNight, cheer: cheer.canvas(), cheerNight: cheer.canvas(nightData(cheer.data)) };
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
