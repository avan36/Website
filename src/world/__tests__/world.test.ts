import { describe, expect, it } from 'vitest';
import { checkWorld, parseWorld, WorldSchema } from '../schema';
import { createGeo } from '../geo';
import { world } from './fixtures';

const clone = <T>(v: T): T => structuredClone(v);

describe('the authored world', () => {
  const w = world();
  const geo = createGeo(w);

  it('is valid', () => {
    expect(checkWorld(w)).toEqual([]);
  });

  it('round-trips through JSON (it is data, not code)', () => {
    expect(parseWorld(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });

  it('gives every project exactly one place, opening its page', () => {
    for (const p of w.projects) {
      const places = w.places.filter((x) => x.project === p.slug);
      expect(places).toHaveLength(1);
      expect(places[0].href).toBe(`/work/${p.slug}`);
    }
  });

  it('puts every place on dry land and every door where you can stand', () => {
    for (const p of w.places) {
      if (p.archetype === 'pier') continue; // out over the water by design
      expect(geo.heightAt(p.at.x, p.at.z), p.id).toBeGreaterThan(0);
      const d = geo.door(p);
      expect(geo.isWalkable(d.x, d.z), `${p.id} door`).toBe(true);
    }
  });

  it('hides every lost word somewhere you can walk to, outside every building', () => {
    for (const lw of w.lostWords) {
      expect(geo.isWalkable(lw.at.x, lw.at.z), lw.id).toBe(true);
      for (const p of w.places) {
        expect(Math.hypot(lw.at.x - p.at.x, lw.at.z - p.at.z), `${lw.id} inside ${p.id}`).toBeGreaterThan(p.footprint + 0.5);
      }
    }
  });

  it('keeps activities on walkable ground', () => {
    for (const a of w.activities) expect(geo.isWalkable(a.at.x, a.at.z), a.id).toBe(true);
  });

  it('has the coast enclose every place but the pier', () => {
    for (const p of w.places) {
      if (p.archetype === 'pier') continue;
      expect(Math.hypot(p.at.x, p.at.z), p.id).toBeLessThan(geo.coastRadius(Math.atan2(p.at.z, p.at.x)));
    }
  });

  it('draws a path for every paved route, starting at its trailhead', () => {
    const paved = w.routes.filter((r) => r.paved);
    expect(geo.paths).toHaveLength(paved.length);
    for (const path of geo.paths) expect(path.points.length).toBeGreaterThan(2);
  });
});

describe('the commute: railway, quay and plots', () => {
  const w = world();
  const geo = createGeo(w);
  const rail = geo.rail!;

  it('lays the railway on level land, clear of every place, door and lost word', () => {
    expect(rail).toBeTruthy();
    for (const p of rail.points) {
      expect(geo.heightAt(p.x, p.z)).toBeCloseTo(w.geography.railway!.bed, 1);
      expect(geo.isWalkable(p.x, p.z)).toBe(true);
    }
    for (const p of w.places) {
      const d = geo.railDist(p.at.x, p.at.z);
      expect(d, p.id).toBeGreaterThan(p.footprint + 1.5);
      const door = geo.door(p);
      expect(geo.railDist(door.x, door.z), `${p.id} door`).toBeGreaterThan(1.5);
    }
    for (const lw of w.lostWords) expect(geo.railDist(lw.at.x, lw.at.z), lw.id).toBeGreaterThan(1.5);
  });

  it('samples the loop evenly and closes it', () => {
    const a = rail.at(0);
    const b = rail.at(rail.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    const step = rail.length / rail.points.length;
    for (let i = 1; i < rail.points.length; i++) {
      const d = Math.hypot(rail.points[i].x - rail.points[i - 1].x, rail.points[i].z - rail.points[i - 1].z);
      expect(d).toBeCloseTo(step, 1);
    }
  });

  it('puts the station on dry, open land beside the track', () => {
    const s = geo.station!;
    expect(geo.railDist(s.x, s.z)).toBeGreaterThan(1.6);
    expect(geo.railDist(s.x, s.z)).toBeLessThan(3);
    expect(geo.heightAt(s.x, s.z)).toBeGreaterThan(0.5);
    expect(geo.isOpenGround(s.x, s.z)).toBe(false); // nothing grows on the platform
  });

  it('builds the quay out over the water, walkable, with the bus parked on it', () => {
    const q = geo.quay!;
    expect(geo.isWalkable(q.bus.x, q.bus.z)).toBe(true);
    expect(geo.quayDist(q.bus.x, q.bus.z)).toBeLessThan(-1.2);
    // Its seaward edge drops straight into the sea; its landward edge meets the beach.
    expect(geo.heightAt((q.x0 + q.x1) / 2, q.z1 + 1.5)).toBeLessThan(0);
    expect(geo.isWalkable((q.x0 + q.x1) / 2, q.z0 - 1)).toBe(true);
  });

  // The island as it was before the workshop: the plot inside the loop still reserved.
  const unbuilt = () => {
    const w2 = clone(w);
    const shop = w2.places.find((p) => p.id === 'workshop')!;
    w2.places = w2.places.filter((p) => p !== shop);
    w2.routes = w2.routes.filter((r) => r.from !== shop.id && r.to !== shop.id);
    w2.outfits = w2.outfits.filter((o) => o.place !== shop.id);
    w2.geography.plots = [{ id: 'workshop', at: { ...shop.at }, clearing: shop.clearing }];
    return w2;
  };

  it('keeps a reserved plot level, on the plateau and clear of the railway', () => {
    const w2 = unbuilt();
    expect(checkWorld(w2)).toEqual([]);
    const g2 = createGeo(w2);
    expect(g2.plots.length).toBeGreaterThan(0);
    for (const p of g2.plots) {
      const h = g2.heightAt(p.x, p.z);
      for (let a = 0; a < 6.3; a += 0.5) expect(g2.heightAt(p.x + Math.cos(a) * p.r * 0.9, p.z + Math.sin(a) * p.r * 0.9), p.id).toBeCloseTo(h, 1);
      expect(g2.railDist(p.x, p.z), p.id).toBeGreaterThan(p.r + 1.4);
      expect(g2.isOpenGround(p.x, p.z), p.id).toBe(false);
      expect(h).toBeGreaterThan(0.8);
    }
  });

  it('says so when a place is built on a plot that is still reserved', () => {
    const w2 = unbuilt();
    const cabin = w2.places.find((p) => p.id === 'middle-place')!;
    cabin.at = { ...w2.geography.plots[0].at };
    expect(checkWorld(w2).map((i) => i.message).join('\n')).toMatch(/stands on plot "workshop"/);
    // And when the plot is left in geography after the workshop is built on it.
    const w3 = clone(w);
    w3.geography.plots = unbuilt().geography.plots;
    expect(checkWorld(w3).map((i) => i.message).join('\n')).toMatch(/"workshop" stands on plot "workshop".*remove the plot/);
  });
});

describe('the workshop', () => {
  const w = world();
  const geo = createGeo(w);
  const shop = w.places.find((p) => p.id === 'workshop')!;

  it('stands where the plot was, in the middle of the railway loop', () => {
    expect(w.geography.plots).toEqual([]);
    expect(shop.at).toEqual(w.geography.railway!.center);
    expect(shop.archetype).toBe('workshop');
    expect(shop.kind).toBe('colophon');
    expect(shop.href).toBe('/colophon');
  });

  it('sits on level ground, with its door walkable and clear of the track', () => {
    const h = geo.heightAt(shop.at.x, shop.at.z);
    for (let a = 0; a < 6.3; a += 0.5) expect(geo.heightAt(shop.at.x + Math.cos(a) * shop.footprint, shop.at.z + Math.sin(a) * shop.footprint)).toBeCloseTo(h, 1);
    const door = geo.door(shop);
    expect(geo.isWalkable(door.x, door.z)).toBe(true);
    expect(geo.railDist(door.x, door.z)).toBeGreaterThan(2);
  });

  it('is paved to from the plaza, across the track on a level crossing', () => {
    const path = geo.paths.find((p) => p.from === 'plaza' && p.to === 'workshop')!;
    expect(path).toBeTruthy();
    const crossing = geo.crossings.find((c) => path.points.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 1.5));
    expect(crossing).toBeTruthy();
    for (const c of geo.crossings) expect(geo.railDist(c.x, c.z)).toBeLessThan(0.1);
  });

  it('has a workbench, blueprints, a terminal and a pinboard to examine', () => {
    const ids = shop.scenery.map((s) => s.id);
    for (const id of ['workbench', 'blueprints', 'terminal', 'pinboard', 'sawdust']) expect(ids).toContain(id);
  });
});

describe('the wardrobe', () => {
  const w = world();

  it('keeps one piece at every place but the plaza, so every house has something to give', () => {
    for (const p of w.places) {
      const n = w.outfits.filter((o) => o.place === p.id).length;
      expect(n, p.id).toBe(p.kind === 'hub' ? 0 : 1);
    }
  });

  it("gives the workshop's tool belt for the body", () => {
    const belt = w.outfits.find((o) => o.place === 'workshop')!;
    expect(belt).toMatchObject({ id: 'tool-belt', slot: 'body' });
  });
});

describe('validation explains what is wrong', () => {
  const base = world();
  const messages = (w: unknown) => {
    const r = WorldSchema.safeParse(w);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('catches a project with no place on the island', () => {
    const w = clone(base);
    w.places = w.places.filter((p) => p.project !== 'quizmate');
    expect(messages(w).join('\n')).toMatch(/Project "quizmate" has 0 places/);
  });

  it('catches a place nobody can reach', () => {
    const w = clone(base);
    w.routes = w.routes.filter((r) => r.to !== 'contact' && r.from !== 'contact');
    expect(messages(w).join('\n')).toMatch(/"contact" can't be reached from "plaza"/);
  });

  it('catches two places on top of each other', () => {
    const w = clone(base);
    const cabin = w.places.find((p) => p.id === 'middle-place')!;
    w.places.find((p) => p.id === 'etymon')!.at = { ...cabin.at };
    expect(messages(w).join('\n')).toMatch(/overlap/);
  });

  it('catches a lost word hidden in scenery that is not there', () => {
    const w = clone(base);
    w.lostWords[0].in = 'nowhere';
    expect(messages(w).join('\n')).toMatch(/doesn't have/);
  });

  it('catches an outfit unlocked nowhere, or two at one place', () => {
    const w = clone(base);
    w.outfits[0].place = 'atlantis';
    w.outfits[2].place = w.outfits[1].place;
    const all = messages(w).join('\n');
    expect(all).toMatch(/Outfit "[a-z-]+" is unlocked at unknown place "atlantis"/);
    expect(all).toMatch(/give each place one piece/);
  });

  it('rejects unknown fields instead of silently ignoring them', () => {
    const w = clone(base) as unknown as { places: Record<string, unknown>[] };
    w.places[0].colour = '#fff';
    expect(messages(w).length).toBeGreaterThan(0);
  });

  it('throws one readable error listing every problem', () => {
    const w = clone(base);
    w.routes = [];
    expect(() => parseWorld(w)).toThrow(/The world doesn't hold together:\n {2}• /);
  });
});
