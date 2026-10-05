import { describe, expect, it } from 'vitest';
import { createEngine } from '../engine';
import { walker } from '../../../world/wander';
import { engine, geo, NOW, play, world } from './helpers';

/** Where someone out walking is at the tests' moment: the place whose door is nearest them. */
const byPlace = (id: string, t = NOW) => {
  const v = world.wanderers.find((x) => x.id === id)!;
  const at = walker(v).at(t);
  return geo.nearestPlace(at.x, at.z).place.id;
};

describe('people out walking, in words', () => {
  it('says who is about when you look around, in their own words', () => {
    for (const v of world.wanderers) {
      const at = byPlace(v.id);
      const text = play(at, 'look').text;
      expect(text, v.id).toMatch(new RegExp(`${v.name} is ${v.doing}(, | nearby)`, 'i'));
      expect(text, v.id).toMatch(/ nearby\. You could talk to /);
    }
  });

  it('lets you talk to them, and they say their lines in turn', () => {
    const dad = world.wanderers.find((v) => v.id === 'dad')!;
    const at = byPlace('dad');
    const r = play(at, 'talk to dad', 'talk to dad', 'say hello to dad');
    expect(r.results[0].out.length).toBeGreaterThan(0);
    expect(r.all).toContain(dad.lines[0]);
    expect(r.all).toContain(dad.lines[1]);
    expect(r.text).toContain(dad.lines[2]);
    expect(r.state.chats.dad).toBe(3);
  });

  it('finds them by name, alias or "the"', () => {
    const at = byPlace('protector');
    for (const said of ['talk to the protector', 'talk to protector', 'protector']) expect(play(at, said).text, said).toMatch(/^The protector: /);
    const mom = byPlace('mom');
    expect(play(mom, 'talk to my mom').text).toMatch(/^Mom: /);
    expect(play(mom, 'x mum').text).toMatch(/rose pink scarf/);
  });

  it('says where someone is when they are not by you, and takes you there', () => {
    const at = byPlace('pushkar');
    const other = world.places.find((p) => p.id !== at && p.kind !== 'hub' && !geo.islandOf(p.at.x, p.at.z) === !geo.islandOf(geo.place(at)!.at.x, geo.place(at)!.at.z))!;
    const text = play(other.id, 'talk to pushkar').text;
    expect(text).toMatch(new RegExp(`Pushkar is out for a walk by the ${geo.place(at)!.title.replace(/^The /, '').toLowerCase()}`, 'i'));
    expect(play(other.id, 'go to pushkar').state.at).toBe(at);
  });

  it('keeps them outdoors: from inside a building, they are not in here', () => {
    const r = play('etymon', 'enter', 'talk to isaac');
    expect(r.text).toMatch(/Not in here\. Isaac is out for a walk by/);
  });

  it('offers a chip to talk to whoever is about', () => {
    const at = byPlace('jeremy');
    expect(engine.suggest(engine.initial(at)).map((c) => c.cmd)).toContain('talk to jeremy');
  });

  it('follows the clock: as people walk on, someone else is about', () => {
    const where = new Set<string>();
    const v = world.wanderers.find((x) => x.id === 'protector')!;
    const lap = walker(v);
    for (let t = 0; t < lap.period; t += lap.period / 12) {
      const e = createEngine(world, geo, { random: () => 0.5, now: () => NOW + t });
      const at = byPlace('protector', NOW + t);
      expect(e.run(e.initial(at), 'look').out.length).toBeGreaterThan(0);
      where.add(at);
    }
    expect(where.size).toBeGreaterThan(3);
  });

  it('has nobody to talk to where nobody is walking by', () => {
    const empty = world.places.find((p) => !p.interior && !world.wanderers.some((v) => byPlace(v.id) === p.id))!;
    expect(play(empty.id, 'talk').text).toMatch(/nobody out here to talk to just now/);
  });
});
