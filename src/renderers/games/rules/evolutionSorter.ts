// Rules for Sort the tree of life (Map of Evolution's island game, played in
// ../evolution.ts): dealing a round, checking a placement, scoring, and laying
// out the little cladogram. No DOM here; see __tests__/evolutionSorter.test.ts.

import { shuffle, type Rng } from './rng';
import type { Branch, BranchId, Clade, Species } from './evolutionSorterData';

export const ROUND_SIZE = 12;
/** How many species sit in the tray at once. */
export const TRAY_SIZE = 4;

/**
 * Deal a round: `size` distinct species, no more than `perBranch` from any one
 * branch, so every round is a mix. Order is shuffled.
 */
export function dealRound(species: readonly Species[], rng: Rng, size = ROUND_SIZE, perBranch = 2): Species[] {
  const counts = new Map<BranchId, number>();
  const out: Species[] = [];
  for (const s of shuffle(species, rng)) {
    const n = counts.get(s.branch) ?? 0;
    if (n >= perBranch) continue;
    counts.set(s.branch, n + 1);
    out.push(s);
    if (out.length === size) break;
  }
  return out;
}

export const isCorrect = (s: Species, branch: BranchId): boolean => s.branch === branch;

export type Placement = { species: Species; chosen: BranchId; correct: boolean };

export type SortState = {
  deck: Species[];
  /** Species waiting in the tray, in order. */
  tray: Species[];
  placed: Placement[];
};

export function startSort(deck: readonly Species[], traySize = TRAY_SIZE): SortState {
  return { deck: deck.slice(traySize), tray: deck.slice(0, traySize), placed: [] };
}

/** Place a tray species on a branch; the tray refills from the deck in the same slot. */
export function place(state: SortState, speciesId: string, branch: BranchId): { state: SortState; placement: Placement } | null {
  const i = state.tray.findIndex((s) => s.id === speciesId);
  if (i < 0) return null;
  const species = state.tray[i];
  const placement: Placement = { species, chosen: branch, correct: isCorrect(species, branch) };
  const tray = state.tray.slice();
  const [next, ...deck] = state.deck;
  if (next) tray[i] = next;
  else tray.splice(i, 1);
  return { state: { deck, tray, placed: [...state.placed, placement] }, placement };
}

export const isDone = (state: SortState) => state.tray.length === 0;

export function tally(placed: readonly Placement[]): { correct: number; total: number; misses: Placement[] } {
  const misses = placed.filter((p) => !p.correct);
  return { correct: placed.length - misses.length, total: placed.length, misses };
}

export function verdict(correct: number, total: number): string {
  const r = total ? correct / total : 0;
  if (r === 1) return 'A perfect tree. Darwin would be proud.';
  if (r >= 0.75) return 'A sharp-eyed naturalist.';
  if (r >= 0.5) return 'Not bad: evolution is full of tricks.';
  return 'Nature fooled you this time. Try another round!';
}

/** Placement feedback, one sentence: where it really belongs. */
export function feedback(p: Placement, branches: readonly Branch[]): string {
  const label = (id: BranchId) => branches.find((b) => b.id === id)?.label ?? id;
  return p.correct
    ? `Yes! ${p.species.name} goes with ${label(p.species.branch)}.`
    : `Not quite: ${p.species.name} goes with ${label(p.species.branch)}, not ${label(p.chosen)}.`;
}

/* ---------- the cladogram ---------- */

export type Segment = { x1: number; y1: number; x2: number; y2: number };

/**
 * Elbow-style cladogram for `tree`, with leaves evenly spaced along the bottom
 * (leaf i centred at (i + 0.5) / n of the width) so they line up with a row of
 * equal-width drop targets. Coordinates are in a width × height box; the root
 * sits at the top. Returns the line segments and the leaf order.
 */
export function cladogram(tree: Clade, width: number, height: number): { segments: Segment[]; leaves: BranchId[] } {
  const leaves: BranchId[] = [];
  const collect = (c: Clade) => (typeof c === 'string' ? leaves.push(c) : c.forEach(collect));
  collect(tree);
  const depthOf = (c: Clade): number => (typeof c === 'string' ? 0 : 1 + Math.max(...c.map(depthOf)));
  const levels = depthOf(tree);
  const step = height / (levels + 0.5);
  const col = width / leaves.length;
  const segments: Segment[] = [];

  // Returns the x of this clade's stem; y comes from its depth below the root.
  const walk = (c: Clade, level: number): number => {
    if (typeof c === 'string') return (leaves.indexOf(c) + 0.5) * col;
    const y = step * (level + 0.5);
    const xs = c.map((k) => {
      const x = walk(k, level + 1);
      const yk = typeof k === 'string' ? height : step * (level + 1.5);
      segments.push({ x1: x, y1: y, x2: x, y2: yk });
      return x;
    });
    segments.push({ x1: Math.min(...xs), y1: y, x2: Math.max(...xs), y2: y });
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };
  const rootX = walk(tree, 0);
  segments.push({ x1: rootX, y1: 0, x2: rootX, y2: step * 0.5 });
  return { segments, leaves };
}
