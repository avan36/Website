import { describe, expect, it } from 'vitest';
import { world as makeWorld } from '../../world/__tests__/fixtures';
import { BODY, planRoom } from '../roomPlan';

const world = makeWorld();
const rooms = world.places.filter((p) => p.interior).map((p) => ({ place: p, plan: planRoom(p.interior!, p.archetype) }));

describe('a room as geometry', () => {
  it('lets you in through the door', () => {
    for (const { place, plan } of rooms) {
      expect(plan.canStand(plan.entry.x, plan.entry.z), place.id).toBe(true);
      expect(plan.atDoor(plan.entry.x, plan.entry.z), place.id).toBe(false);
      expect(plan.atDoor(0, plan.d / 2 + 0.2), place.id).toBe(true);
      expect(plan.canStand(0, plan.d / 2 + 0.2), `${place.id} doorway`).toBe(true);
    }
  });

  it('keeps you on the floor and out of the furniture', () => {
    for (const { place, plan } of rooms) {
      expect(plan.canStand(plan.w / 2, 0), place.id).toBe(false);
      expect(plan.canStand(0, -plan.d / 2), place.id).toBe(false);
      expect(plan.canStand(plan.w / 2 - 0.5, plan.d / 2 - 0.05), `${place.id} front wall`).toBe(false);
      for (const s of plan.spots) if (!s.hang) expect(plan.canStand(s.x, s.z), `${place.id} inside ${s.id}`).toBe(false);
    }
  });

  it('can walk from the door to everyone and everything, and reach them from there', () => {
    for (const { place, plan } of rooms) {
      for (const s of plan.spots) {
        const at = plan.approach(s, plan.entry.x, plan.entry.z);
        expect(at, `${place.id}: somewhere to stand by ${s.id}`).not.toBeNull();
        expect(plan.within(at!.x, at!.z)?.id, `${place.id}: ${s.id} within reach`).toBe(s.id);
        const route = plan.path(plan.entry.x, plan.entry.z, at!.x, at!.z);
        expect(route, `${place.id}: a way to ${s.id}`).not.toBeNull();
        // Every leg of the way is clear.
        let from = plan.entry;
        for (const p of route!) {
          for (let k = 1; k <= 20; k++) {
            const x = from.x + ((p.x - from.x) * k) / 20;
            const z = from.z + ((p.z - from.z) * k) / 20;
            expect(plan.canStand(x, z, BODY - 0.02), `${place.id}: on the way to ${s.id}`).toBe(true);
          }
          from = p;
        }
      }
    }
  });

  it('notices nobody from the doorway', () => {
    for (const { place, plan } of rooms) expect(plan.within(plan.entry.x, plan.entry.z), place.id).toBeNull();
  });

  it('slides along what is in the way instead of stopping dead', () => {
    const { plan } = rooms.find((r) => r.place.id === 'middle-place')!;
    const desk = plan.spots.find((s) => s.id === 'desk')!;
    const start = { x: desk.x, z: desk.z + desk.hd + BODY + 0.05 };
    const moved = plan.slide(start.x, start.z, 0.1, -0.1);
    expect(moved.x).toBeCloseTo(start.x + 0.1);
    expect(moved.z).toBeCloseTo(start.z);
  });
});
