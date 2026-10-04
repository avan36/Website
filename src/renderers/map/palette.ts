// The map's palette: a small, warm set of colors in the spirit of a Game Boy
// Color overworld, picked to sit next to the 3D island's (same sea, same
// sand, same grass) without trying to match it shade for shade.

import { col } from './pixels';

export const HEX = {
  // Sea, from the open water to the lapping edge.
  deep: '#1d6898',
  sea: '#2b86b4',
  mid: '#3aa2c8',
  shallow: '#56c3cf',
  shallow2: '#7fd9d2',
  foam: '#f4fcf6',
  foam2: '#bdeee6',
  wave: '#86cfea',
  waveDeep: '#5aa9d6',
  star: '#fff6c8',

  // Sand.
  wet: '#d6b47a',
  sand: '#f0d69c',
  sandLight: '#f9e7bd',
  sandDark: '#dcbb80',
  sandShadow: '#cda466',

  // Grass, light to dark, and the bank where it gives way to sand.
  bank: '#bfcf68',
  grass0: '#a4dc6e',
  grass1: '#86cc5c',
  grass2: '#6cb84e',
  grass3: '#56a344',
  grassEdge: '#418a3b',
  tuft: '#3f8838',
  tuftLight: '#c2ea8a',

  // Paths and the plaza.
  path: '#e9c98e',
  pathLight: '#f4dcaa',
  pathEdge: '#d1ad72',
  pebble: '#bd9762',
  pave: '#eed3a0',
  paveLight: '#f8e6c0',
  grout: '#c9a46c',
  paveRim: '#b88f5c',

  // Rock and cliff on the headland.
  rockLight: '#cdc5b8',
  rock: '#aca397',
  rockDark: '#8a8176',
  cliff: '#73695f',
  cliffDark: '#5a514a',

  // Wood.
  plank: '#c99561',
  plankLight: '#dcae78',
  plankDark: '#9b6b42',
  post: '#6e4a30',

  // Flowers.
  petalWhite: '#fffaf0',
  petalPink: '#ff9fb5',
  petalYellow: '#ffd75e',
  petalBlue: '#9cc8ff',

  /** Outlines: a warm near-black, never pure black. */
  ink: '#3a2a24',
  shadow: '#000000',
} as const;

export type Swatch = keyof typeof HEX;

/** Packed versions of every swatch, for painting. */
export const C = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, col(v)])) as Record<Swatch, number>;
