// A tiny pixel font for the map's signs: capitals five pixels tall, most of
// them three wide (I is one, M, N and W are wider), a pixel between letters
// and two for a space. Enough for a shop sign over a door.

import type { Color, Pix } from './pixels';

const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

/** A capital's rows of pixels ('#' lit, '.' not), or null if the font hasn't got it. */
export const glyph = (ch: string): string[] | null => GLYPHS[ch] ?? null;

/** How tall a line of it is, in pixels. */
export const FONT_H = 5;
const SPACE = 2;

/** How wide `text` is, in pixels. */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text.toUpperCase()) w += (ch === ' ' ? SPACE : (GLYPHS[ch]?.[0].length ?? 0)) + 1;
  return Math.max(0, w - 1);
}

/** Letter `text` into `p` with its top-left at (x, y), in one color. */
export function drawText(p: Pix, text: string, x: number, y: number, c: Color) {
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') {
      x += SPACE + 1;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) continue;
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') p.px(x + i, y + j, c);
    x += g[0].length + 1;
  }
}
