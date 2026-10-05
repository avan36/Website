import { describe, expect, it } from 'vitest';
import { createGeo, SWIM_REACH } from '../geo';
import { checkWorld } from '../schema';
import { world } from './fixtures';

const clone = <T>(v: T): T => structuredClone(v);

describe('the islets', () => {
  const w = world();
  const geo = createGeo(w);
  const islets = geo.islands.slice(1);

  it('stand out at sea off the main island, with water all round them', () => {
    expect(islets.map((s) => s.id).sort()).toEqual(['boardwalk-isle', 'little-london', 'root-isle', 'synergy-isle']);
    for (const s of islets) {
      expect(geo.islandOf(s.x, s.z), s.id).toBe(s.i);
      expect(geo.heightAt(s.x, s.z), s.id).toBeGreaterThan(0.8);
      // Halfway between it and the main island's coast, the sea.
      const th = Math.atan2(s.z, s.x);
      const coast = geo.coastRadius(th);
      const mid = (Math.hypot(s.x, s.z) - s.coast(th + Math.PI) + coast) / 2;
      expect(geo.heightAt(Math.cos(th) * mid, Math.sin(th) * mid), `${s.id} channel`).toBeLessThan(0);
    }
  });

  it('give each islet a sandy beach and its own swimming water', () => {
    for (const s of islets) {
      for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2;
        const at = (d: number) => ({ x: s.x + Math.cos(th) * d, z: s.z + Math.sin(th) * d });
        const r = s.coast(th);
        const sand = at(r * 0.93);
        const off = at(r + 3);
        if (geo.bridgeDist(sand.x, sand.z) < 2 || geo.bridgeDist(off.x, off.z) < 2) continue;
        expect(geo.heightAt(sand.x, sand.z), `${s.id} beach at ${a}`).toBeGreaterThan(0);
        expect(geo.heightAt(sand.x, sand.z), `${s.id} beach at ${a}`).toBeLessThan(0.62);
        expect(geo.isSwimmable(off.x, off.z), `${s.id} offshore at ${a}`).toBe(true);
        const far = at(r + SWIM_REACH + 1);
        if (geo.islands.every((o) => o === s || Math.hypot(far.x - o.x, far.z - o.z) > o.outer + SWIM_REACH + 1)) expect(geo.swimRoom(far.x, far.z), `${s.id} open sea at ${a}`).toBeLessThan(0);
      }
    }
  });

  it('reach past every islet, for the race to go round', () => {
    for (let a = 0; a < 360; a++) {
      const th = (a / 360) * Math.PI * 2;
      expect(geo.reach(th)).toBeGreaterThanOrEqual(geo.coastRadius(th));
    }
    for (const s of islets) expect(geo.reach(Math.atan2(s.z, s.x)), s.id).toBeGreaterThan(Math.hypot(s.x, s.z) + s.coast(Math.atan2(s.z, s.x)));
  });

  it('edge the swimming water with runs that stay out of every other island’s water', () => {
    const runs = geo.swimEdge(0.7);
    expect(runs.length).toBeGreaterThan(2);
    for (const run of runs) for (const p of run) expect(geo.swimRoom(p.x, p.z)).toBeCloseTo(-0.7, 1);
  });
});

describe('Little London', () => {
  const w = world();
  const geo = createGeo(w);
  const isle = geo.islands.find((s) => s.id === 'little-london')!;
  const on = (p: { x: number; z: number }) => geo.islandOf(p.x, p.z) === isle.i;

  it('is big enough for the mall, the townhouse and five people out walking', () => {
    expect(isle.coast(0)).toBeGreaterThan(12);
    const places = w.places.filter((p) => on(p.at)).map((p) => p.id).sort();
    expect(places).toEqual(['no-12', 'westfield']);
    expect(w.wanderers.filter((v) => v.roams === 'little-london')).toHaveLength(5);
  });

  it('still has Tower Bridge coming ashore on it, from the quay', () => {
    const tower = geo.bridges.find((b) => b.style === 'tower')!;
    expect(tower.joins).toEqual([0, isle.i]);
    const l = geo.landing(tower, 1);
    expect(on(l)).toBe(true);
    expect(geo.isWalkable(l.x, l.z)).toBe(true);
  });
});

describe('the bridges', () => {
  const w = world();
  const geo = createGeo(w);

  it('each join two islands over the sea: the main island to three islets, and Boardwalk Isle on out to Synergy Isle', () => {
    expect(geo.bridges).toHaveLength(4);
    expect(geo.bridges.map((b) => b.joins.map((i) => geo.islands[i].id).join(' to ')).sort()).toEqual([
      'boardwalk-isle to synergy-isle',
      'main to boardwalk-isle',
      'main to little-london',
      'main to root-isle',
    ]);
    for (const b of geo.bridges) {
      const middle = { x: (b.ax + b.bx) / 2, z: (b.az + b.bz) / 2 };
      expect(geo.heightAt(middle.x, middle.z), `bridge ${b.i}`).toBeLessThan(0);
      expect(geo.groundAt(middle.x, middle.z)).toBe(b.deck);
    }
  });

  it('carry you across on a level deck, with no step up or down from the land at either end', () => {
    for (const b of geo.bridges) {
      const a = geo.landing(b, 0);
      const z = geo.landing(b, 1);
      let prev = geo.groundAt(a.x, a.z);
      for (let s = 0; s <= 1; s += 0.01) {
        const x = a.x + (z.x - a.x) * s;
        const zz = a.z + (z.z - a.z) * s;
        expect(geo.isWalkable(x, zz), `bridge ${b.i} at ${s.toFixed(2)}`).toBe(true);
        const h = geo.groundAt(x, zz);
        expect(Math.abs(h - prev), `bridge ${b.i} at ${s.toFixed(2)}`).toBeLessThan(0.12);
        prev = h;
      }
    }
  });

  it('have railings: off the side of the deck over the water is not somewhere you can stand', () => {
    for (const b of geo.bridges) {
      const s = b.length / 2;
      for (const side of [-1, 1]) {
        const x = b.ax + b.ux * s + b.uz * side * (b.width / 2 + 0.2);
        const z = b.az + b.uz * s - b.ux * side * (b.width / 2 + 0.2);
        expect(geo.isWalkable(x, z), `bridge ${b.i}, side ${side}`).toBe(false);
        expect(geo.deckAt(x, z)).toBe(-1);
      }
    }
  });

  it('keep the islets clear of trees and props where you step on and off', () => {
    for (const b of geo.bridges) for (const end of [0, 1] as const) {
      const l = geo.landing(b, end);
      expect(geo.isOpenGround(l.x, l.z), `bridge ${b.i} end ${end}`).toBe(false);
    }
  });
});

describe('walking between islands', () => {
  const w = world();
  const geo = createGeo(w);
  // Buildings are solid, as they are on the island: a step into one is pushed back out (and you slide round).
  const solid = w.places.filter((p) => p.kind !== 'hub' && p.archetype !== 'pier' && p.archetype !== 'bottle').map((p) => ({ ...p.at, r: p.footprint + 0.5 }));
  /** Step toward wherever nextStop says, a little at a time, until there (or lost). */
  const walk = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    let p = { ...from };
    let wet = 0;
    for (let i = 0; i < 2000; i++) {
      const d = Math.hypot(to.x - p.x, to.z - p.z);
      if (d < 0.3) return { arrived: true, wet };
      const stop = geo.nextStop(p, to);
      const dx = stop.x - p.x;
      const dz = stop.z - p.z;
      const k = Math.min(0.25, Math.hypot(dx, dz)) / (Math.hypot(dx, dz) || 1);
      p = { x: p.x + dx * k, z: p.z + dz * k };
      for (const s of solid) {
        const e = Math.hypot(p.x - s.x, p.z - s.z);
        if (e < s.r) p = { x: s.x + ((p.x - s.x) / e) * s.r, z: s.z + ((p.z - s.z) / e) * s.r };
      }
      if (!geo.isWalkable(p.x, p.z)) wet++;
    }
    return { arrived: false, wet };
  };

  it('goes over the bridges to every game on an islet, and back, without getting wet', () => {
    const games = w.activities.filter((a) => a.kind === 'minigame' && geo.islandOf(a.at.x, a.at.z)! > 0);
    expect(games).toHaveLength(5);
    for (const g of games) {
      const there = walk(geo.hub.at, g.at);
      expect(there, g.id).toEqual({ arrived: true, wet: 0 });
      const back = walk(g.at, w.geography.spawn);
      expect(back, g.id).toEqual({ arrived: true, wet: 0 });
    }
    // From one islet to the other, by way of the main island.
    const [a, b] = games.filter((g, i, all) => all.findIndex((x) => geo.islandOf(x.at.x, x.at.z) === geo.islandOf(g.at.x, g.at.z)) === i);
    expect(walk(a.at, b.at)).toEqual({ arrived: true, wet: 0 });
  });

  it('goes round a building in the way instead of walking into it', () => {
    // The schoolhouse stands between the plaza and the bridge out to Boardwalk Isle.
    const school = w.places.find((p) => p.id === 'quizmate')!;
    const behind = { x: school.at.x - school.footprint - 2, z: school.at.z };
    const stop = geo.nextStop({ x: 0, z: school.at.z }, behind);
    expect(Math.hypot(stop.x - school.at.x, stop.z - school.at.z)).toBeGreaterThan(school.footprint + 1);
    expect(walk({ x: 0, z: school.at.z }, behind)).toEqual({ arrived: true, wet: 0 });
  });

  it('heads straight there on the same island, or into the sea', () => {
    expect(geo.nextStop({ x: 0, z: 4.5 }, { x: 10, z: 2 })).toEqual({ x: 10, z: 2 });
    expect(geo.nextStop({ x: 0, z: 4.5 }, { x: -24, z: 0 })).toEqual({ x: -24, z: 0 });
    expect(geo.hops(0, 1)).toBe(1);
    expect(geo.hops(1, 2)).toBe(2);
  });
});

describe('the badge gate', () => {
  const w = world();
  const geo = createGeo(w);
  const isle = (id: string) => geo.islands.findIndex((s) => s.id === id);
  const [gate] = geo.gates;

  it('stands across the long bridge where it leaves Boardwalk Isle, with the sea either side', () => {
    expect(geo.gates).toHaveLength(1);
    expect(gate).toMatchObject({ id: 'badge-gate', game: 'jargon', side: isle('boardwalk-isle'), beyond: [isle('synergy-isle')] });
    const b = geo.bridges[gate.bridge];
    expect(geo.deckAt(gate.x, gate.z)).toBe(b.i);
    for (const s of [-1, 1]) expect(geo.heightAt(gate.x + b.uz * s * (b.width / 2 + 0.3), gate.z - b.ux * s * (b.width / 2 + 0.3)), `side ${s}`).toBeLessThan(0);
  });

  it('stands between Synergy Isle and everywhere else, and nowhere else', () => {
    expect(geo.gatesBetween(0, isle('synergy-isle')).map((g) => g.id)).toEqual(['badge-gate']);
    expect(geo.gatesBetween(isle('synergy-isle'), isle('root-isle')).map((g) => g.id)).toEqual(['badge-gate']);
    expect(geo.gatesBetween(0, isle('boardwalk-isle'))).toEqual([]);
    expect(geo.gatesBetween(isle('little-london'), isle('root-isle'))).toEqual([]);
  });

  it('can only be got round by walking through it: nobody can swim from Boardwalk Isle to Synergy Isle', () => {
    const b = geo.bridges[gate.bridge];
    let dry = 0;
    for (let s = 0; s <= b.length; s += 0.25) if (geo.swimRoom(b.ax + b.ux * s, b.az + b.uz * s) < 0) dry += 0.25;
    // A stretch of open sea under the bridge that no swimmer can cross, with the current turning them back.
    expect(dry).toBeGreaterThan(3);
  });

  it('has its game, the badge desk, on Boardwalk Isle a few steps from it', () => {
    const desk = w.activities.find((a) => a.game === gate.game)!;
    expect(desk.id).toBe('badge-desk');
    expect(geo.islandOf(desk.at.x, desk.at.z)).toBe(gate.side);
    expect(Math.hypot(desk.at.x - gate.x, desk.at.z - gate.z)).toBeLessThan(8);
  });
});

describe('the ground holds together (validation)', () => {
  const base = world();
  const text = (w: typeof base) => checkWorld(w).map((i) => i.message).join('\n');

  it('catches a bridge that starts in the sea, or goes nowhere new', () => {
    const w = clone(base);
    w.geography.bridges[0].from = { x: -22, z: -11 };
    w.geography.bridges[1].to = { x: -14, z: 9 };
    const t = text(w);
    expect(t).toMatch(/Bridge 0 starts in the sea at \(-22, -11\): start it on land/);
    expect(t).toMatch(/Bridge 1 starts and ends on the main island/);
  });

  it('catches an islet with no bridge out to it, and the games stranded on it', () => {
    const w = clone(base);
    w.geography.bridges = w.geography.bridges.slice(1);
    const t = text(w);
    expect(t).toMatch(/Islet "root-isle" can't be reached on foot: add a bridge out to it/);
    expect(t).toMatch(/Activity "etymology-race" is on an islet you can't walk to/);
  });

  it('catches a gate with no game to open it, or its game past it', () => {
    const w = clone(base);
    w.activities = w.activities.filter((a) => a.id !== 'badge-desk');
    expect(text(w)).toMatch(/Gate "badge-gate" opens with "jargon", which isn't played anywhere/);
    const far = clone(base);
    far.activities.find((a) => a.id === 'badge-desk')!.at = { x: -55, z: 45 };
    expect(text(far)).toMatch(/The game that opens gate "badge-gate" is on the far side of it: put "badge-desk" where you stand before the gate/);
    const away = clone(base);
    away.activities.find((a) => a.id === 'badge-desk')!.at = { x: -30, z: 10 };
    expect(text(away)).toMatch(/"badge-desk" is \d+\.\d from gate "badge-gate": keep the game that opens it within 8/);
  });

  it('catches a gate that guards nothing, because there is another way round it', () => {
    const w = clone(base);
    // A second footbridge out to Root Isle, and a gate on the first: you'd just take the other one.
    w.geography.bridges.push({ ...w.geography.bridges[0], gate: undefined });
    w.geography.bridges[0].gate = { id: 'pointless', name: 'a pointless gate', game: 'etymology', pass: 1 };
    expect(text(w)).toMatch(/Gate "pointless" guards nothing: there's another way round to everything past it/);
  });

  it('catches an islet that runs into the main island, and a game left in the sea', () => {
    const w = clone(base);
    w.geography.islets[0].at = { x: -24, z: -10 };
    w.activities.find((a) => a.id === 'ask-the-bartender')!.at = { x: -40.5, z: 13 };
    const t = text(w);
    expect(t).toMatch(/Islet "root-isle" runs into the main island/);
    expect(t).toMatch(/Activity "ask-the-bartender" is in the sea at \(-40.5, 13\)/);
  });
});
