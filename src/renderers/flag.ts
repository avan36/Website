// The small flag's stripes, top to bottom, read from tokens.css so every view
// draws the same colors: pink, purple and blue, in the ratio 2:1:2.

import tokens from '../styles/tokens.css?raw';

const NAMES = ['flag-pink', 'flag-purple', 'flag-blue'] as const;
const SHARES = [2, 1, 2];

/** The stripes, top to bottom: each one's color and where it starts and ends (0 at the top, 1 at the bottom). */
export function flagStripes(css: string = tokens) {
  const total = SHARES.reduce((a, b) => a + b, 0);
  let at = 0;
  return NAMES.map((name, i) => {
    const color = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))?.[1];
    if (!color) throw new Error(`flag.ts: tokens.css has no --${name} color`);
    const from = at / total;
    at += SHARES[i];
    return { color: color.toLowerCase(), from, to: at / total };
  });
}

let stripes: ReturnType<typeof flagStripes> | null = null;
/** The site's own stripes, read once. */
export const flagColors = () => (stripes ??= flagStripes());
