// A building's room, as geometry every spatial view shares: how much floor
// each kind of thing takes up, where you can stand, what's within reach, and
// where to stand to talk to someone. Room units, like the world's (about a
// metre): (0, 0) is the middle of the floor, +z runs toward the door, which
// is in the middle of the front wall. Pure, so it's tested without a screen.

import type { Interior, Prop } from '../world/schema';

/** The explorer's radius, indoors. */
export const BODY = 0.36;
/** Half the doorway's width. */
export const DOOR_HW = 0.8;
/** How close you need to be to talk to someone, or to look at something. */
export const TALK_REACH = 1.05;
export const LOOK_REACH = 0.85;

/**
 * Each prop's footprint, as a half-width and half-depth. Things on the wall
 * (`hang`) take no floor at all: you stand under them to look. The rest
 * stand on the floor, against the back wall if they're wall props.
 */
export const FOOT: Record<Prop, { hw: number; hd: number; hang?: boolean; wall?: boolean }> = {
  desk: { hw: 1.15, hd: 0.5 },
  hearth: { hw: 1.25, hd: 0.45, wall: true },
  frame: { hw: 0.8, hd: 0.25, hang: true, wall: true },
  board: { hw: 1.55, hd: 0.25, hang: true, wall: true },
  counter: { hw: 1.6, hd: 0.45 },
  bookshelf: { hw: 1.1, hd: 0.4, wall: true },
  cabinet: { hw: 0.9, hd: 0.4, wall: true },
  lens: { hw: 0.85, hd: 0.75 },
  cat: { hw: 0.5, hd: 0.35 },
  globe: { hw: 0.45, hd: 0.35 },
  scanner: { hw: 1.2, hd: 0.45 },
  crates: { hw: 0.95, hd: 0.65 },
  grill: { hw: 1.7, hd: 0.5 },
  sacks: { hw: 0.6, hd: 0.45 },
  escalator: { hw: 0.75, hd: 1.5, wall: true },
  shopfront: { hw: 2.4, hd: 0.25, hang: true, wall: true },
};
/** The schoolhouse's desks are a little classroom of them. */
const SCHOOL_DESKS = { hw: 1.4, hd: 0.85 };
/** A person's footprint, as a circle. */
export const PERSON_R = 0.42;

export type Spot = {
  kind: 'person' | 'thing';
  id: string;
  /** Where it stands (for wall things: the middle of its footprint, against the wall). */
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Hangs on the back wall: blocks nothing. */
  hang: boolean;
  prop?: Prop;
  color?: string;
};

export type RoomPlan = ReturnType<typeof planRoom>;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function planRoom(room: Interior, archetype = '') {
  const { w, d } = room.size;
  const back = -d / 2;
  const spots: Spot[] = [
    ...room.things.map((t): Spot => {
      const f = archetype === 'schoolhouse' && t.prop === 'desk' ? SCHOOL_DESKS : FOOT[t.prop];
      const wall = !!FOOT[t.prop].wall;
      // Wall things stand (or hang) against the back wall, whatever z says.
      const z = wall ? back + f.hd : t.at.z;
      return { kind: 'thing', id: t.id, x: t.at.x, z, hw: f.hw, hd: f.hd, hang: !!FOOT[t.prop].hang, prop: t.prop };
    }),
    ...room.people.map((c): Spot => ({ kind: 'person', id: c.id, x: c.at.x, z: c.at.z, hw: PERSON_R, hd: PERSON_R, hang: false, color: c.color })),
  ];

  /** How far (x, z) is from a spot's edge (0 inside it). */
  const reach = (s: Spot, x: number, z: number) => {
    if (s.kind === 'person') return Math.max(0, Math.hypot(x - s.x, z - s.z) - PERSON_R);
    const dx = Math.max(0, Math.abs(x - s.x) - s.hw);
    const dz = Math.max(0, Math.abs(z - s.z) - s.hd);
    return Math.hypot(dx, dz);
  };

  /** Can the explorer stand here: on the floor, and not in anything (a step into the doorway is fine). */
  const canStand = (x: number, z: number, r = BODY) => {
    const inDoor = Math.abs(x) <= DOOR_HW - r * 0.5 && z > d / 2 - r - 0.01;
    if (x < -w / 2 + r || x > w / 2 - r || z < back + r) return false;
    if (z > d / 2 - r && !inDoor) return false;
    if (z > d / 2 + 0.6) return false;
    for (const s of spots) if (!s.hang && reach(s, x, z) < r) return false;
    return true;
  };

  /** Whoever or whatever is within reach of (x, z), nearest first; people before things at a tie. */
  const within = (x: number, z: number): Spot | null => {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of spots) {
      // You look at a picture from below it, so wall things reach a little further.
      const limit = s.kind === 'person' ? TALK_REACH : s.hang ? LOOK_REACH + 0.5 : LOOK_REACH;
      const r = reach(s, x, z) - (s.kind === 'person' ? 0.05 : 0);
      if (r < limit && r < bestD) (best = s), (bestD = r);
    }
    return best;
  };

  /** Where to stand to talk to someone or look at something, coming from (fx, fz). */
  const approach = (s: Spot, fx: number, fz: number) => {
    const gap = BODY + 0.22;
    const tries: { x: number; z: number }[] = [];
    if (s.kind === 'person') {
      const a0 = Math.atan2(fz - s.z, fx - s.x);
      const r = PERSON_R + gap;
      for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) tries.push({ x: s.x + Math.cos(a0 + da) * r, z: s.z + Math.sin(a0 + da) * r });
    } else {
      const sx = clamp(fx, s.x - s.hw * 0.6, s.x + s.hw * 0.6);
      tries.push({ x: sx, z: s.z + s.hd + gap }, { x: s.x, z: s.z + s.hd + gap });
      tries.push({ x: s.x - s.hw - gap, z: s.z }, { x: s.x + s.hw + gap, z: s.z }, { x: s.x, z: s.z - s.hd - gap });
      tries.push({ x: s.x - s.hw - gap, z: s.z + s.hd + gap }, { x: s.x + s.hw + gap, z: s.z + s.hd + gap });
    }
    for (const t of tries) if (canStand(t.x, t.z) && within(t.x, t.z) === s) return t;
    for (const t of tries) if (canStand(t.x, t.z)) return t;
    return null;
  };

  /** Standing in the doorway, on the way out. */
  const atDoor = (x: number, z: number) => Math.abs(x) < DOOR_HW && z > d / 2 - 0.08;

  /** Walk (x, z) by (dx, dz), sliding along whatever's in the way. */
  const slide = (x: number, z: number, dx: number, dz: number) => {
    if (canStand(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    if (dx && canStand(x + dx, z)) return { x: x + dx, z };
    if (dz && canStand(x, z + dz)) return { x, z: z + dz };
    return { x, z };
  };

  /**
   * A way across the floor from one point to another, round the furniture:
   * a breadth-first search on a fine grid, then only the corners kept. Null
   * if there's no way (or the goal is somewhere you can't stand).
   */
  const CELL = 0.25;
  const cols = Math.round(w / CELL);
  const rows = Math.round(d / CELL) + 2; // a row or two into the doorway
  const cx = (i: number) => -w / 2 + (i + 0.5) * CELL;
  const cz = (j: number) => back + (j + 0.5) * CELL;
  const open = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) open[j * cols + i] = canStand(cx(i), cz(j)) ? 1 : 0;
  const cellOf = (x: number, z: number) => {
    const i = clamp(Math.floor((x + w / 2) / CELL), 0, cols - 1);
    const j = clamp(Math.floor((z - back) / CELL), 0, rows - 1);
    return j * cols + i;
  };
  /** The nearest open cell to (x, z), within a few cells. */
  const nearestOpen = (x: number, z: number) => {
    const c = cellOf(x, z);
    if (open[c]) return c;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < open.length; k++) {
      if (!open[k]) continue;
      const dd = Math.hypot(cx(k % cols) - x, cz(Math.floor(k / cols)) - z);
      if (dd < bestD) (bestD = dd), (best = k);
    }
    return bestD < 1 ? best : -1;
  };
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let k = 1; k <= n; k++) if (!canStand(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  };
  const path = (fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] | null => {
    if (clear(fx, fz, tx, tz)) return [{ x: tx, z: tz }];
    const a = nearestOpen(fx, fz);
    const b = nearestOpen(tx, tz);
    if (a < 0 || b < 0) return null;
    const prev = new Int32Array(open.length).fill(-1);
    prev[a] = a;
    const queue = [a];
    for (let q = 0; q < queue.length && prev[b] < 0; q++) {
      const c = queue[q];
      const i = c % cols;
      const j = (c - i) / cols;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        // No cutting corners past furniture.
        if (!open[n] || prev[n] >= 0 || (di && dj && (!open[j * cols + ni] || !open[nj * cols + i]))) continue;
        prev[n] = c;
        queue.push(n);
      }
    }
    if (prev[b] < 0) return null;
    const cells: { x: number; z: number }[] = [];
    for (let c = b; c !== a; c = prev[c]) cells.push({ x: cx(c % cols), z: cz(Math.floor(c / cols)) });
    cells.reverse();
    if (canStand(tx, tz)) cells.push({ x: tx, z: tz });
    // Keep only the turns: skip ahead to the furthest point in a straight, clear line.
    const out: { x: number; z: number }[] = [];
    let from = { x: fx, z: fz };
    for (let k = 0; k < cells.length; ) {
      let far = k;
      while (far + 1 < cells.length && clear(from.x, from.z, cells[far + 1].x, cells[far + 1].z)) far++;
      out.push(cells[far]);
      from = cells[far];
      k = far + 1;
    }
    return out;
  };

  return {
    w,
    d,
    spots,
    path,
    reach,
    canStand,
    within,
    approach,
    atDoor,
    slide,
    /** Where you come in, just inside the door. */
    entry: { x: 0, z: d / 2 - 0.75 },
    door: { x: 0, z: d / 2 },
  };
}
