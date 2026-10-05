// The gates across the bridges, on the pixel map: two steel posts at the
// railings and a bar between them in the gate's game's color, with a badge
// reader's light, red while it's shut and green once you're through. Shut, the
// deck between the posts can't be walked; the map stamps it as blocked (see
// cells()) and lifts it again when the store says the gate is open.

import type { Gate, Geo } from '../../world/geo';
import { GAME_INFO, isGame } from '../games/catalog';
import { TEX } from './terrain';

type Thing = { x: number; z: number; sprite: null; after: (c: CanvasRenderingContext2D, sx: number, sy: number) => void };

/** How close you must be to a shut gate for its game's tag to pop up. */
export const GATE_RANGE = 2.2;

export function createMapGates(geo: Geo, isOpen: (id: string) => boolean) {
  const gates = geo.gates.map((gate) => ({ gate, open: isOpen(gate.id), color: isGame(gate.game) ? GAME_INFO[gate.game].color : '#4f7ea8' }));

  const things: Thing[] = gates.map((g) => {
    const { gate } = g;
    // Across the deck, in map pixels from the gate's middle (its x and z on the map are x and y).
    const ax = gate.uz * gate.half * TEX;
    const ay = -gate.ux * gate.half * TEX;
    return {
      x: gate.x,
      z: gate.z,
      sprite: null,
      after: (c, sx, sy) => {
        const post = '#5b6168';
        const ends = [-1, 1].map((s) => ({ x: Math.round(sx + s * ax * 0.92), y: Math.round(sy + s * ay * 0.92) }));
        // The bar: right across while it's shut; just a stub at each post once it's open.
        const n = Math.max(Math.abs(ends[1].x - ends[0].x), Math.abs(ends[1].y - ends[0].y));
        c.fillStyle = g.color;
        for (let t = 0; t <= n; t++) {
          const k = t / n;
          if (g.open && k > 0.18 && k < 0.82) continue;
          c.fillRect(Math.round(ends[0].x + (ends[1].x - ends[0].x) * k), Math.round(ends[0].y + (ends[1].y - ends[0].y) * k) - 4, 1, 2);
        }
        for (const e of ends) {
          c.fillStyle = post;
          c.fillRect(e.x - 1, e.y - 7, 2, 7);
          c.fillStyle = '#c9ced3';
          c.fillRect(e.x - 1, e.y - 7, 1, 7);
        }
        // The reader's light, on the right-hand post.
        c.fillStyle = g.open ? '#3fbf6a' : '#e5484d';
        c.fillRect(ends[1].x - 1, ends[1].y - 9, 2, 2);
      },
    };
  });

  return {
    things,
    /** The shut gate you're close to, if any. */
    near(x: number, z: number): Gate | null {
      return gates.find((g) => !g.open && Math.hypot(x - g.gate.x, z - g.gate.z) < GATE_RANGE)?.gate ?? null;
    },
    /**
     * Points to stamp as blocked while a gate is shut: right across its deck, a
     * little either side of its line, and its bridge's railings made thick
     * enough (out over the water) that a path can't find a way round the gate
     * by slipping between them.
     */
    cells(gate: Gate) {
      const b = geo.bridges[gate.bridge];
      const at = (along: number, across: number) => ({ x: b.ax + b.ux * along + b.uz * across, z: b.az + b.uz * along - b.ux * across });
      const pts: { x: number; z: number }[] = [];
      for (let a = gate.along - 0.5; a <= gate.along + 0.5 + 1e-6; a += 0.1) {
        for (let s = -gate.half - 0.2; s <= gate.half + 0.2 + 1e-6; s += 0.1) pts.push(at(a, s));
      }
      for (let a = 0; a <= b.length; a += 0.1) for (const side of [-1, 1]) for (let s = gate.half - 0.05; s <= gate.half + 0.8; s += 0.1) pts.push(at(a, side * s));
      return pts;
    },
    shut: () => gates.filter((g) => !g.open).map((g) => g.gate),
    /** Open any gate the store says is open now; returns the ones that just opened. */
    sync(): Gate[] {
      const opened: Gate[] = [];
      for (const g of gates) if (!g.open && isOpen(g.gate.id)) (g.open = true), opened.push(g.gate);
      return opened;
    },
    debug: () => gates.map((g) => ({ id: g.gate.id, x: g.gate.x, z: g.gate.z, open: g.open })),
  };
}
