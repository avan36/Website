// Foss Hill on the pixel map: FOSS HILL in standing letters on the slope below
// the lighthouse (the map's pixel font, two pixels to a dot, propped up from
// behind), and a small pink, purple and blue flag on a pole on the hilltop,
// flapping between two frames. Where they stand comes from the world.

import type { Geo } from '../../world/geo';
import { flagColors } from '../flag';
import { FONT_H, glyph } from './font';
import { HEX } from './palette';
import { col, nightData, Pix } from './pixels';
import type { Sprite } from './sprites';

const INK = col(HEX.ink);
const LETTER = col('#f4efe2');
const LETTER_SHADE = col('#d8cfbd');
const PROP = col('#8a7f70');
const POLE = col('#6e6458');
const KNOB = col('#f2c14e');

function sprite(p: Pix, ax: number, ay: number, fine?: (p: Pix) => void): Sprite {
  p.outline(INK);
  fine?.(p);
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data)), data: p.data };
}

/** Standing letters: each dot of the font two pixels square, a shaded bottom edge, and props poking out below. */
export function hillLetters(text: string): Sprite {
  const S = 2;
  const gaps = (ch: string) => (ch === ' ' ? 2 : (glyph(ch)?.[0].length ?? 0)) + 1;
  const w = ([...text].reduce((a, ch) => a + gaps(ch), 0) - 1) * S;
  const p = new Pix(w + 2, FONT_H * S + 4);
  let x = 1;
  const legs: number[] = [];
  for (const ch of text) {
    const g = glyph(ch);
    if (g) {
      g.forEach((row, j) => [...row].forEach((c, i) => c === '#' && p.rect(x + i * S, 1 + j * S, S, S, j === g.length - 1 ? LETTER_SHADE : LETTER)));
      legs.push(x + Math.floor((g[0].length * S) / 2));
    }
    x += gaps(ch) * S;
  }
  const base = 1 + FONT_H * S;
  return sprite(p, (w >> 1) + 1, base + 1, (q) => {
    for (const lx of legs) q.vline(lx, base, base + 1, PROP);
  });
}

/** The flag on its pole, in one of two frames: the free end up a pixel, or down. */
export function smallFlag(frame: number): Sprite {
  const p = new Pix(11, 15);
  const rows = flagColors().flatMap((s) => Array.from({ length: Math.round((s.to - s.from) * 5) }, () => col(s.color)));
  // The cloth ripples: a wave runs along it, two frames apart.
  const wave = frame ? [0, 1, 1, 0, 0, 0, 1] : [0, 0, 0, 1, 1, 1, 0];
  rows.forEach((c, j) => wave.forEach((dy, i) => p.px(2 + i, 1 + j + dy, c)));
  return sprite(p, 1, 14, (q) => {
    q.vline(1, 1, 14, POLE);
    q.px(1, 0, KNOB);
  });
}

/** Where Foss Hill's letters and flags stand on the map, what to draw there, and the ground they take up. */
export function layoutFossHill(geo: Geo) {
  const letters = geo.signs.map((s) => ({ x: s.at.x, z: s.at.z, sprite: hillLetters(s.text) }));
  const flags = geo.flags.map((f) => ({ x: f.x, z: f.z }));
  /** The ground they stand on, for the explorer to walk round. */
  const blocks = [
    ...geo.signs.flatMap((s) => s.letters.map((l) => ({ x: l.x, z: l.z, r: Math.max(0.3, l.width * 0.45) }))),
    ...flags.map((f) => ({ ...f, r: 0.25 })),
  ];
  return { letters, flags, blocks, flagArt: [smallFlag(0), smallFlag(1)] };
}
