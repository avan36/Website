import { describe, expect, it } from 'vitest';
import { checkWorld, parseWorld, WorldSchema } from '../schema';
import { createGeo, SWIM_REACH } from '../geo';
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
    expect(games.map((a) => a.game).sort()).toEqual(['bartender', 'crabs', 'crates', 'etymology', 'evolution', 'patterns', 'stones']);
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
      // Out past the water round the main island, and round any islet that way.
      let far = r + 12;
      for (const s of geo.islands.slice(1)) {
        const along = s.x * Math.cos(th) + s.z * Math.sin(th);
        const off = Math.abs(-s.x * Math.sin(th) + s.z * Math.cos(th));
        const R = s.outer + SWIM_REACH + 1;
        if (along > 0 && off < R) far = Math.max(far, along + Math.sqrt(R * R - off * off));
      }
      const open = at(far);
      // The stone quay stands out into the water: its deck is walked on, not swum in.
      const q = w.geography.quay;
      const onQuay = !!q && shore.x > Math.min(q.x0, q.x1) - 1 && shore.x < Math.max(q.x0, q.x1) + 1 && shore.z > Math.min(q.z0, q.z1) - 1 && shore.z < Math.max(q.z0, q.z1) + 1;
      // So do the bridges, over the water to the islets.
      const onBridge = geo.bridgeDist(shore.x, shore.z) < 1.3;
      if (!onQuay && !onBridge) expect(geo.isSwimmable(shore.x, shore.z), `just offshore at ${a}`).toBe(true);
      expect(geo.isSwimmable(open.x, open.z), `open sea at ${a}`).toBe(false);
    }
    expect(geo.isSwimmable(w.geography.spawn.x, w.geography.spawn.z)).toBe(false);
    expect(geo.depthAt(w.geography.spawn.x, w.geography.spawn.z)).toBe(0);
  });

  it('has the coast enclose every place but the pier (and its own islet\'s coast, out on one)', () => {
    for (const p of w.places) {
      if (p.archetype === 'pier') continue;
      const isle = geo.islands[geo.islandOf(p.at.x, p.at.z) ?? 0];
      const th = Math.atan2(p.at.z - isle.z, p.at.x - isle.x);
      expect(Math.hypot(p.at.x - isle.x, p.at.z - isle.z), p.id).toBeLessThan(isle.coast(th));
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

  it('catches a mini-game with no game, or a game on the island twice', () => {
    const w = clone(base);
    const games = w.activities.filter((a) => a.kind === 'minigame');
    delete games[0].game;
    games[2].game = games[1].game;
    const text = messages(w).join('\n');
    expect(text).toMatch(/needs a game/);
    expect(text).toMatch(/on the island twice/);
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
    expect(inside.map((p) => p.archetype).sort()).toEqual(['cabin', 'depot', 'library', 'lighthouse', 'mall', 'schoolhouse', 'taproom', 'townhouse']);
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

  it('points every room back at the page it stands for (a memory or a quiet place has none)', () => {
    for (const p of inside.filter((x) => x.kind !== 'memory' && x.kind !== 'quiet')) {
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

describe('the quiet room', () => {
  const w = world();
  const house = w.places.find((p) => p.id === 'no-12')!;
  const room = house.interior!;
  const said = [
    house.name,
    house.title,
    house.blurb,
    house.description,
    ...house.aliases,
    ...house.scenery.flatMap((s) => [s.description, ...s.names]),
    room.description,
    ...room.things.flatMap((t) => [t.description, ...t.names]),
    ...room.people.flatMap((c) => [c.name, c.role, c.looks, c.greeting, c.farewell, ...c.topics.flatMap((t) => [t.reply, ...t.names])]),
  ];

  it('is a townhouse on Little London, with a room and no page to open', () => {
    const geo = createGeo(w);
    expect(house).toMatchObject({ kind: 'quiet', archetype: 'townhouse' });
    expect(house.href).toBeUndefined();
    expect(geo.islands[geo.islandOf(house.at.x, house.at.z)!].id).toBe('little-london');
  });

  it('has the two armchairs, the tissues, the clock, a plant and a calm painting', () => {
    expect(room.things.map((t) => t.prop).sort()).toEqual(['armchairs', 'clock', 'frame', 'plant', 'sidetable']);
    expect(room.people.map((c) => c.farewell)).toContain('We can stop here for today. Be gentle with yourself on the way out.');
    expect(room.people.flatMap((c) => c.topics.map((t) => t.reply)).join(' ')).toMatch(/Take your time\./);
  });

  it('never says what it is', () => {
    for (const s of said) expect(s).not.toMatch(/therap|counsel|psych|session|appointment/i);
  });
});

describe('people out walking', () => {
  const w = world();
  const geo = createGeo(w);
  const isle = (id: string) => (id === 'main' ? 0 : geo.islands.findIndex((s) => s.id === id));

  it('are the people Ambrose asked for, on the island and on Little London', () => {
    const on = (roams: string) => w.wanderers.filter((v) => v.roams === roams).map((v) => v.name);
    expect(on('main')).toEqual(['Pushkar', 'Jeremy', 'Eugene', 'Abdu', 'the protector']);
    expect(on('little-london')).toEqual(['Dad', 'Mom', 'Lucia', 'Andrew', 'Isaac']);
  });

  it('walk on dry land on their own island, never through a building', () => {
    for (const v of w.wanderers) {
      for (const p of v.walk) {
        expect(geo.islandOf(p.x, p.z), v.id).toBe(isle(v.roams));
        expect(geo.isWalkable(p.x, p.z), v.id).toBe(true);
        for (const pl of w.places) if (pl.archetype !== 'pier' && pl.kind !== 'hub') expect(Math.hypot(p.x - pl.at.x, p.z - pl.at.z), `${v.id} in ${pl.id}`).toBeGreaterThan(pl.footprint);
      }
    }
  });

  it('say a few short, plain things, with no em dashes', () => {
    for (const v of w.wanderers) {
      expect(v.lines.length, v.id).toBeGreaterThanOrEqual(3);
      for (const s of [v.looks, v.doing, ...v.lines]) {
        expect(s, v.id).not.toMatch(/—/);
        expect(s.length, v.id).toBeLessThan(160);
      }
    }
  });

  it('keep the scenery off their walks', () => {
    expect(geo.walkDist(w.wanderers[0].walk[0].x, w.wanderers[0].walk[0].z)).toBe(0);
    expect(geo.walkDist(0, 40)).toBeGreaterThan(5);
  });

  it('catch a walk into the sea, through a building, onto an island that is not there, or a name already taken', () => {
    const bad = clone(w);
    bad.wanderers[0].walk[1] = { x: 0, z: 40 };
    const westfield = bad.places.find((p) => p.id === 'westfield')!;
    const dad = bad.wanderers.find((v) => v.id === 'dad')!;
    dad.walk[0] = { x: westfield.at.x - 5, z: westfield.at.z };
    dad.walk[1] = { x: westfield.at.x + 6, z: westfield.at.z };
    bad.wanderers.find((v) => v.id === 'lucia')!.roams = 'atlantis';
    bad.wanderers.find((v) => v.id === 'jeremy')!.name = 'Wren';
    const text = checkWorld(bad).map((i) => i.message).join('\n');
    expect(text).toMatch(/Pushkar's waypoint 1 at \(0, 40\) isn't on the main island: move it onto its land/);
    expect(text).toMatch(/Pushkar's walk from waypoint 0 to 1 leaves the main island/);
    expect(text).toMatch(/Dad's walk from waypoint 0 to 1 goes through "westfield"/);
    expect(text).toMatch(/Lucia roams "atlantis", which isn't an island/);
    expect(text).toMatch(/Wren is out walking, and Wren in "no-12" has the same name/);
  });

  it('catch a walk across the railway or past the end of a bridge', () => {
    const bad = clone(w);
    const rw = bad.geography.railway!;
    bad.wanderers[0].walk = [{ x: rw.center.x - rw.rx - 4, z: rw.center.z }, { x: rw.center.x, z: rw.center.z - 3 }];
    const b = bad.geography.bridges[0];
    bad.wanderers[1].walk = [{ x: b.from.x + 2, z: b.from.z - 2 }, { x: b.from.x + 2, z: b.from.z + 3 }];
    const text = checkWorld(bad).map((i) => i.message).join('\n');
    expect(text).toMatch(/Pushkar's walk from waypoint 0 to 1 crosses the railway/);
    expect(text).toMatch(/Jeremy's walk from waypoint 0 to 1 goes across the end of a bridge/);
  });
});
