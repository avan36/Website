import { describe, expect, it } from 'vitest';
import { findPath, isOpen, lineOfSight, nearestOpen, smooth, type Grid, type Pt } from '../path';

/** A grid from rows of '.' (open) and '#' (blocked). */
function grid(rows: string[]): Grid {
  const h = rows.length;
  const w = rows[0].length;
  const blocked = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (blocked[y * w + x] = c === '#' ? 1 : 0)));
  return { w, h, blocked };
}

const steps = (p: Pt[]) => p.slice(1).every((q, i) => Math.max(Math.abs(q.x - p[i].x), Math.abs(q.y - p[i].y)) === 1);

describe('findPath', () => {
  it('walks straight across open ground', () => {
    const g = grid(['.....', '.....', '.....']);
    const p = findPath(g, 0, 1, 4, 1)!;
    expect(p).toHaveLength(5);
    expect(p[0]).toEqual({ x: 0, y: 1 });
    expect(p.at(-1)).toEqual({ x: 4, y: 1 });
  });

  it('goes around a wall, one step at a time, never through it', () => {
    const g = grid([
      '.......',
      '...#...',
      '...#...',
      '...#...',
      '.......',
    ]);
    const p = findPath(g, 0, 2, 6, 2)!;
    expect(p).not.toBeNull();
    expect(steps(p)).toBe(true);
    expect(p.every((c) => isOpen(g, c.x, c.y))).toBe(true);
  });

  it("doesn't squeeze diagonally between two blocked corners", () => {
    const g = grid([
      '.#',
      '#.',
    ]);
    expect(findPath(g, 0, 0, 1, 1)).toBeNull();
  });

  it('says so when the goal is cut off, or blocked', () => {
    const g = grid([
      '..#..',
      '..#..',
      '..#..',
    ]);
    expect(findPath(g, 0, 0, 4, 0)).toBeNull();
    expect(findPath(g, 0, 0, 2, 0)).toBeNull();
  });

  it('finds its way out of a bay, by the only opening', () => {
    const g = grid([
      '.........',
      '.#######.',
      '.#.......',
      '.#.......',
    ]);
    const p = findPath(g, 2, 3, 0, 3)!;
    expect(steps(p)).toBe(true);
    expect(p.some((c) => c.x === 8)).toBe(true);
    // Round the end of the wall and back, hugging it: 20 cells is the least it can be.
    expect(p).toHaveLength(20);
  });
});

describe('nearestOpen', () => {
  const g = grid([
    '#####',
    '#####',
    '##..#',
  ]);
  it('returns the cell itself when open', () => expect(nearestOpen(g, 2, 2)).toEqual({ x: 2, y: 2 }));
  it('finds the closest open cell when blocked', () => expect(nearestOpen(g, 2, 0)).toEqual({ x: 2, y: 2 }));
  it('gives up beyond its radius', () => expect(nearestOpen(grid(['###', '###']), 1, 1, 3)).toBeNull());
});

describe('lineOfSight and smooth', () => {
  const g = grid([
    '..........',
    '..........',
    '....##....',
    '....##....',
    '..........',
  ]);
  const los = (a: Pt, b: Pt) => lineOfSight(g, a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5);

  it('sees across open ground but not through a block', () => {
    expect(lineOfSight(g, 0.5, 0.5, 9.5, 0.5)).toBe(true);
    expect(lineOfSight(g, 0.5, 2.5, 9.5, 2.5)).toBe(false);
  });

  it('pulls a path tight, keeping both ends and only the corners', () => {
    const raw = findPath(g, 0, 3, 9, 3)!;
    const s = smooth(raw, los);
    expect(s[0]).toEqual(raw[0]);
    expect(s.at(-1)).toEqual(raw.at(-1));
    expect(s.length).toBeLessThan(raw.length);
    for (let i = 1; i < s.length; i++) expect(los(s[i - 1], s[i])).toBe(true);
  });

  it('leaves a straight path as two points', () => {
    const raw = findPath(g, 0, 0, 9, 0)!;
    expect(smooth(raw, los)).toEqual([raw[0], raw.at(-1)]);
  });
});
