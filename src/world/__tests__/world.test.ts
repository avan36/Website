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
