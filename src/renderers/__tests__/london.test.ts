import { beforeAll, describe, expect, it } from 'vitest';
import { world } from '../../world/__tests__/fixtures';
import { createGeo } from '../../world/geo';

// The 3D island reads the world off the page: hand it this one.
const w = world();
const geo = createGeo(w);
let spots: { kind: string; x: number; z: number; r: number }[] = [];
beforeAll(async () => {
  (globalThis as { document?: unknown }).document = { getElementById: () => ({ textContent: JSON.stringify(w) }) };
  spots = (await import('../island/world/london')).LONDON_SPOTS;
});

describe("Little London's street furniture on the 3D island", () => {
  it('has its lamps, telephone box, pillar box and bench', () => {
    expect(spots.map((s) => s.kind).sort()).toEqual(['bench', 'lamp', 'lamp', 'phone', 'pillar']);
  });

  it("stands on the islet, off the bus's road, its stop and the paths people walk", () => {
    const isle = geo.islands.findIndex((s) => s.id === 'little-london');
    for (const s of spots) {
      expect(geo.islandOf(s.x, s.z), s.kind).toBe(isle);
      expect(geo.roadDist(s.x, s.z), s.kind).toBeGreaterThan(1.5 + s.r);
      expect(Math.hypot(s.x - geo.busStop!.shelter.x, s.z - geo.busStop!.shelter.z), s.kind).toBeGreaterThan(2);
      expect(geo.walkDist(s.x, s.z), s.kind).toBeGreaterThan(1 + s.r);
    }
  });
});
