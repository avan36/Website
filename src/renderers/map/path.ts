// Finding a way across the island for click-to-walk: A* over a coarse grid of
// cells that are either open or blocked (sea, buildings, tree trunks), then
// string-pulled into a few straight legs so the explorer doesn't zigzag.
// Pure and allocation-light; the renderer builds the grid once at load.

export interface Grid {
  w: number;
  h: number;
  /** 1 where you can't stand, row-major. */
  blocked: Uint8Array;
  /** How slow each open cell is to cross (1 = walking; swimming costs more). Missing means all 1. */
  cost?: Uint8Array;
}

export type Pt = { x: number; y: number };

const SQRT2 = Math.SQRT2;
// 8 neighbours: dx, dy, cost.
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
] as const;

export const isOpen = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.blocked[y * g.w + x] === 0;

/** The open cell nearest to (x, y), searching outward ring by ring, or null. */
export function nearestOpen(g: Grid, x: number, y: number, maxR = 24): Pt | null {
  x = Math.round(x);
  y = Math.round(y);
  if (isOpen(g, x, y)) return { x, y };
  for (let r = 1; r <= maxR; r++) {
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isOpen(g, x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) (bestD = d), (best = { x: x + dx, y: y + dy });
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Quickest 8-connected path between two open cells (no squeezing diagonally
 * between two blocked cells), weighing each step by the cell's cost. Returns
 * the cells from start to goal inclusive, or null if the goal can't be reached.
 */
export function findPath(g: Grid, sx: number, sy: number, gx: number, gy: number): Pt[] | null {
  if (!isOpen(g, sx, sy) || !isOpen(g, gx, gy)) return null;
  const n = g.w * g.h;
  const start = sy * g.w + sx;
  const goal = gy * g.w + gx;
  if (start === goal) return [{ x: sx, y: sy }];

  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // Binary heap of node indices keyed by f.
  const heap = new Int32Array(n);
  const f = new Float32Array(n);
  let size = 0;
  const h = (i: number) => {
    const dx = Math.abs((i % g.w) - gx);
    const dy = Math.abs(((i / g.w) | 0) - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy); // octile
  };
  const push = (i: number) => {
    let k = size++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[heap[p]] <= f[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < size && f[heap[l]] < f[heap[m]]) m = l;
      if (r < size && f[heap[r]] < f[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
    return top;
  };

  gScore[start] = 0;
  f[start] = h(start);
  push(start);
  while (size) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w;
    const cy = (cur / g.w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isOpen(g, nx, ny)) continue;
      if (dx && dy && (!isOpen(g, cx + dx, cy) || !isOpen(g, cx, cy + dy))) continue;
      const ni = ny * g.w + nx;
      if (closed[ni]) continue;
      const t = gScore[cur] + (g.cost ? cost * g.cost[ni] : cost);
      if (t < gScore[ni]) {
        gScore[ni] = t;
        came[ni] = cur;
        f[ni] = t + h(ni);
        push(ni); // duplicates are skipped by `closed` when popped
      }
    }
  }
  if (came[goal] < 0) return null;
  const out: Pt[] = [];
  for (let i = goal; i !== -1; i = came[i]) out.push({ x: i % g.w, y: (i / g.w) | 0 });
  return out.reverse();
}

/**
 * Straight-line visibility between two points (in grid units, so a cell's
 * centre is i + 0.5), sampled finely enough not to skip a cell.
 */
export function lineOfSight(g: Grid, ax: number, ay: number, bx: number, by: number) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isOpen(g, Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  }
  return true;
}

/**
 * String-pull a path: keep only the points where it has to turn. `clear`
 * says whether a straight walk between two points is unobstructed (the
 * grid's lineOfSight, or something finer).
 */
export function smooth(pts: Pt[], clear: (a: Pt, b: Pt) => boolean): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let anchor = 0;
  // Greedy: walk forward while the anchor can still see the point; when it
  // can't, the previous point is a corner. Linear in the path's length.
  for (let j = 2; j < pts.length; j++) {
    if (clear(pts[anchor], pts[j])) continue;
    anchor = j - 1;
    out.push(pts[anchor]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
