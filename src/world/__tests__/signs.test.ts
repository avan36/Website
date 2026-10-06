import { describe, expect, it } from 'vitest';
import { createGeo, signLetters } from '../geo';
import { checkWorld, parseWorld } from '../schema';
import { world } from './fixtures';

const clone = <T>(v: T): T => structuredClone(v);

describe('Foss Hill', () => {
  const w = world();
  const geo = createGeo(w);
  const sign = geo.signs.find((s) => s.id === 'foss-hill')!;
  const lighthouse = w.places.find((p) => p.archetype === 'lighthouse')!;

  it('spells FOSS HILL on the hill by the lighthouse', () => {
    expect(sign.text).toBe('FOSS HILL');
    expect(sign.name).toBe('Foss Hill');
    expect(sign.place).toBe(lighthouse.id);
    expect(sign.letters.map((l) => l.ch).join('')).toBe('FOSSHILL');
    for (const l of sign.letters) {
      expect(Math.hypot(l.x - lighthouse.at.x, l.z - lighthouse.at.z), l.ch).toBeLessThan(12);
      expect(geo.heightAt(l.x, l.z), l.ch).toBeGreaterThan(0.8);
    }
  });

  it('faces the island and the usual camera, which looks from the south', () => {
    const front = { x: Math.sin(sign.faces), z: Math.cos(sign.faces) };
    const toPlaza = { x: geo.hub.at.x - sign.at.x, z: geo.hub.at.z - sign.at.z };
    expect(front.x * toPlaza.x + front.z * toPlaza.z).toBeGreaterThan(0);
    expect(front.z).toBeGreaterThan(0.9);
    // Read from in front, F is on the left (west) and the last L on the right.
    expect(sign.letters[0].x).toBeLessThan(sign.letters.at(-1)!.x);
  });

  it('stands its letters on open ground, off every path and clear of the lost words', () => {
    for (const l of sign.letters) {
      expect(geo.isOpenGround(l.x, l.z), l.ch).toBe(true);
      for (const lw of w.lostWords) expect(Math.hypot(lw.at.x - l.x, lw.at.z - l.z), `${l.ch} by ${lw.id}`).toBeGreaterThan(1.5);
    }
  });

  it('is described in words, letters and all', () => {
    expect(lighthouse.description).toMatch(/Foss Hill/);
    expect(lighthouse.description).toMatch(/FOSS HILL/);
    expect(lighthouse.scenery.some((s) => s.names.includes('foss hill'))).toBe(true);
  });
});

describe('signLetters', () => {
  it('lays the letters out in a row round the middle, leaving room for the space', () => {
    const l = signLetters({ text: 'AB CD', at: { x: 10, z: 5 }, faces: 0, height: 2 });
    expect(l.map((x) => x.ch).join('')).toBe('ABCD');
    // Facing south, the row runs west to east along z = 5, centred on x = 10.
    for (const x of l) expect(x.z).toBeCloseTo(5);
    expect((l[0].x + l[3].x) / 2).toBeCloseTo(10);
    // The gap across the space is wider than the one between letters in a word.
    expect(l[2].x - l[1].x).toBeGreaterThan(l[1].x - l[0].x + 0.5);
  });

  it('turns the row with the way the sign faces', () => {
    const l = signLetters({ text: 'AB', at: { x: 0, z: 0 }, faces: Math.PI / 2, height: 1 });
    // Facing east, you read it looking west: from south to north.
    expect(l[0].x).toBeCloseTo(0);
    expect(l[0].z).toBeGreaterThan(l[1].z);
  });
});

describe('the small flag', () => {
  const w = world();
  const geo = createGeo(w);
  const lighthouse = w.places.find((p) => p.archetype === 'lighthouse')!;

  it('stands on Foss Hill, near the lighthouse, on open ground', () => {
    expect(geo.flags).toHaveLength(1);
    const f = geo.flags[0];
    expect(Math.hypot(f.x - lighthouse.at.x, f.z - lighthouse.at.z)).toBeLessThan(6);
    expect(geo.isOpenGround(f.x, f.z)).toBe(true);
    expect(geo.signDist(f.x, f.z)).toBeGreaterThan(1);
  });
});

describe('signs and flags hold together (validation)', () => {
  const base = world();
  const text = (x: typeof base) => checkWorld(x).map((i) => i.message).join('\n');

  it('catches a sign in the sea, on a path, or by a place that is not there', () => {
    const a = clone(base);
    a.geography.signs[0].at = { x: 40, z: -25 };
    expect(text(a)).toMatch(/Sign "foss-hill"'s F at .* is in the sea: move the sign onto land/);
    const b = clone(base);
    b.geography.signs[0].at = { x: 0, z: 4.5 };
    expect(text(b)).toMatch(/Sign "foss-hill"'s . at .* is in the way of a path, a place or a bridge/);
    const c = clone(base);
    c.geography.signs[0].place = 'nowhere';
    expect(text(c)).toMatch(/Sign "foss-hill" stands by unknown place "nowhere"/);
  });

  it('catches a sign on top of a lost word, and two signs with one id', () => {
    const a = clone(base);
    const word = a.lostWords.find((l) => l.id === 'uhtcearu')!;
    const f = geoOf(a).signs[0].letters[0];
    word.at = { x: f.x, z: f.z };
    expect(text(a)).toMatch(/Sign "foss-hill"'s F at .* stands on the lost word "uhtcearu": keep it 1.5 clear/);
    const b = clone(base);
    b.geography.signs.push(clone(b.geography.signs[0]));
    expect(text(b)).toMatch(/Two signs share the id "foss-hill"/);
  });

  it('catches a sign that hides a lost word from the camera', () => {
    const a = clone(base);
    // Straight in front of the word, with the first S just south of it.
    const word = a.lostWords.find((l) => l.id === 'uhtcearu')!;
    Object.assign(a.geography.signs[0], { at: { x: word.at.x + 2.4, z: word.at.z + 2 }, faces: -0.1, height: 1.8 });
    expect(text(a)).toMatch(/Sign "foss-hill"'s S at .* hides the lost word "uhtcearu" from the camera/);
  });

  it('only takes capital letters and single spaces', () => {
    for (const bad of ['Foss Hill', 'FOSS  HILL', ' FOSS', 'FOSS-HILL']) {
      const a = clone(base);
      a.geography.signs[0].text = bad;
      expect(() => parseWorld(a), bad).toThrow(/sign text is capital letters/);
    }
  });

  it('catches a flag in the sea or in the letters', () => {
    const a = clone(base);
    a.geography.flags[0].at = { x: 40, z: -25 };
    expect(text(a)).toMatch(/Flag 0 at \(40, -25\) is in the sea/);
    const b = clone(base);
    const l = geoOf(b).signs[0].letters[3];
    b.geography.flags[0].at = { x: l.x, z: l.z };
    expect(text(b)).toMatch(/Flag 0 at .* is in a sign's letters/);
  });
});

function geoOf(w: ReturnType<typeof world>) {
  return createGeo(w);
}
