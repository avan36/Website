import { describe, expect, it } from 'vitest';
import { createGeo } from '../../../world/geo';
import { world } from '../../../world/__tests__/fixtures';
import { Pix } from '../pixels';
import { RECT, TEX } from '../terrain';
import { paintTowerDeck, planTowerBridge } from '../towerBridge';

const geo = createGeo(world());
const bridge = geo.bridges.find((b) => b.style === 'tower')!;
const plan = planTowerBridge(bridge);
const hw = bridge.width / 2;
/** A point `along` the bridge from its `a` end and `across` it (to the right of the way it runs). */
const on = (along: number, across = 0) => ({ x: bridge.ax + bridge.ux * along + bridge.uz * across, z: bridge.az + bridge.uz * along - bridge.ux * across });

describe('planTowerBridge', () => {
  it('stands its two towers a third of the way in from either end, on the deck', () => {
    expect(plan.towers.map((t) => t.along / bridge.length)).toEqual([0.32, 0.68]);
    for (const t of plan.towers) expect(geo.deckAt(t.x, t.z)).toBe(bridge.i);
  });

  it('puts its lamps on the railings, out of the way of anyone walking over', () => {
    expect(plan.lamps.length).toBeGreaterThan(0);
    for (const l of plan.lamps) {
      expect(geo.deckAt(l.x, l.z, -0.05)).toBe(bridge.i);
      expect(geo.deckAt(l.x, l.z, 0.3)).toBe(-1);
    }
  });
});

describe('paintTowerDeck', () => {
  // Painted into a blank map the size of the real one.
  const W = (RECT.x1 - RECT.x0) * TEX;
  const H = (RECT.z1 - RECT.z0) * TEX;
  const pix = new Pix(W, H);
  const ground = new Uint8Array(W * H);
  const deck = new Uint8Array(W * H);
  paintTowerDeck(plan, pix, ground, deck, RECT, { water: 0, pier: 9 });
  const at = (along: number, across: number) => {
    const p = on(along, across);
    return deck[Math.floor((p.z - RECT.z0) * TEX) * W + Math.floor((p.x - RECT.x0) * TEX)];
  };

  it('leaves the deck walkable from end to end, through both towers', () => {
    for (let along = 0.1; along < bridge.length - 0.1; along += 0.1) {
      for (const across of [-hw + 0.5, 0, hw - 0.5]) expect(at(along, across), `${along.toFixed(1)}, ${across}`).toBe(1);
    }
  });

  it('fences it in, and makes the towers solid out in the water either side', () => {
    expect(at(3, hw - 0.1)).toBe(2);
    expect(at(3, -hw + 0.1)).toBe(2);
    for (const t of plan.towers) {
      expect(at(t.along, plan.hd - 0.1)).toBe(2);
      expect(at(t.along, -plan.hd + 0.1)).toBe(2);
      expect(at(t.along + plan.hl - 0.2, hw + 0.2)).toBe(2);
    }
    // Away from the towers, the water beside the deck is still water.
    expect(at(3, hw + 0.4)).toBe(0);
  });
});
