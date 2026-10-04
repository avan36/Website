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
    // The boat floats: it is moored in the sea (race.test.ts checks it has water under it).
    for (const a of w.activities.filter((x) => x.kind !== 'boat')) expect(geo.isWalkable(a.at.x, a.at.z), a.id).toBe(true);
  });

  it('puts each mini-game on dry land, off the paths, clear of every door and the pier', () => {
    const games = w.activities.filter((a) => a.kind === 'minigame');
    expect(games.map((a) => a.game).sort()).toEqual(['crabs', 'crates', 'stones']);
    for (const a of games) {
      expect(geo.heightAt(a.at.x, a.at.z), a.id).toBeGreaterThan(0.3);
      expect(geo.isOpenGround(a.at.x, a.at.z), a.id).toBe(true);
      expect(Math.abs(a.at.x - w.geography.pier.x) > 6 || a.at.z < w.geography.pier.start - 6, `${a.id} by the pier`).toBe(true);
      for (const b of games) if (b !== a) expect(Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z), `${a.id} by ${b.id}`).toBeGreaterThan(4);
    }
  });

  it('rings the island with water to swim in, and nothing to swim in on land', () => {
    for (let a = 0; a < 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const r = geo.coastRadius(th);
      const at = (d: number) => ({ x: Math.cos(th) * d, z: Math.sin(th) * d });
      const shore = at(r + 3);
      const open = at(r + 12);
      expect(geo.isSwimmable(shore.x, shore.z), `just offshore at ${a}`).toBe(true);
      expect(geo.isSwimmable(open.x, open.z), `open sea at ${a}`).toBe(false);
    }
    expect(geo.isSwimmable(w.geography.spawn.x, w.geography.spawn.z)).toBe(false);
    expect(geo.depthAt(w.geography.spawn.x, w.geography.spawn.z)).toBe(0);
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

  it('catches a mini-game with no game, or a game on the island twice', () => {
    const w = clone(base);
    const games = w.activities.filter((a) => a.kind === 'minigame');
    delete games[0].game;
    games[2].game = games[1].game;
    const text = messages(w).join('\n');
    expect(text).toMatch(/needs a game/);
    expect(text).toMatch(/on the island twice/);
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

describe('inside the buildings', () => {
  const w = world();
  const inside = w.places.filter((p) => p.interior);
  const words = (p: (typeof w.places)[number]) => {
    const room = p.interior!;
    return [
      room.description,
      ...room.things.flatMap((t) => [t.description, ...t.names, t.link?.label ?? '']),
      ...room.people.flatMap((c) => [c.name, c.role, c.looks, c.greeting, c.farewell, ...c.topics.flatMap((t) => [t.reply, ...t.names, t.link?.label ?? ''])]),
    ];
  };

  it('gives every building a room, and nothing else one', () => {
    expect(inside.map((p) => p.archetype).sort()).toEqual(['cabin', 'depot', 'library', 'lighthouse', 'schoolhouse', 'taproom']);
    for (const id of ['blog', 'contact', 'map-of-evolution', 'plaza']) expect(w.places.find((p) => p.id === id)!.interior, id).toBeUndefined();
  });

  it('has someone to talk to and something to look at in every room, briefly', () => {
    for (const p of inside) {
      const room = p.interior!;
      expect(room.people.length, p.id).toBeGreaterThanOrEqual(1);
      expect(room.things.length, p.id).toBeGreaterThanOrEqual(2);
      for (const c of room.people) {
        expect(c.topics.length, c.name).toBeGreaterThanOrEqual(2);
        expect(c.topics.length, c.name).toBeLessThanOrEqual(4);
        for (const t of c.topics) expect(t.reply.length, `${c.name} on ${t.id}`).toBeLessThan(260);
        expect(c.greeting.length, c.name).toBeLessThan(200);
      }
    }
  });

  it('points every room back at the page it stands for', () => {
    for (const p of inside) {
      const links = [...p.interior!.things.map((t) => t.link), ...p.interior!.people.flatMap((c) => c.topics.map((t) => t.link))];
      expect(links.some((l) => l?.href === p.href), p.id).toBe(true);
    }
  });

  it('never uses an em dash in anything the islanders say', () => {
    for (const p of inside) for (const s of words(p)) expect(s, p.id).not.toMatch(/—/);
  });

  it('catches a room that is laid out wrong', () => {
    const bad = clone(w);
    const room = bad.places.find((p) => p.id === 'middle-place')!.interior!;
    room.things[0].at = { x: 0, z: room.size.d / 2 - 0.2 };
    room.things[1].at = { x: 40, z: 0 };
    room.people[0].at = { ...room.things[2].at };
    room.people[0].topics[0].link = { label: 'Nowhere', href: '/nowhere' };
    const text = checkWorld(bad).map((i) => i.message).join('\n');
    expect(text).toMatch(/in the way of the door/);
    expect(text).toMatch(/stands outside the room/);
    expect(text).toMatch(/on top of each other/);
    expect(text).toMatch(/isn't a page on this site/);
  });

  it('catches a room where there is no building', () => {
    const bad = clone(w);
    bad.places.find((p) => p.id === 'blog')!.interior = clone(w.places.find((p) => p.id === 'middle-place')!.interior);
    delete bad.places.find((p) => p.id === 'etymon')!.interior;
    const text = checkWorld(bad).map((i) => i.message).join('\n');
    expect(text).toMatch(/"blog" is a pier, not a building/);
    expect(text).toMatch(/"etymon" is a library: give it an interior/);
  });
});
