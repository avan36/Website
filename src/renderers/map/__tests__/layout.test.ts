import { describe, expect, it } from 'vitest';
import { createGeo } from '../../../world/geo';
import { world } from '../../../world/__tests__/fixtures';
import { BODY_R, layoutPlaces, polylineDist, scatterProps } from '../layout';

const w = world();
const geo = createGeo(w);
const places = layoutPlaces(w, geo);

describe('layoutPlaces', () => {
  it('lays out every place but the hub', () => {
    expect(places.map((m) => m.place.id).sort()).toEqual(w.places.filter((p) => p.kind !== 'hub').map((p) => p.id).sort());
  });

  it('puts every door where you can stand, clear of every building', () => {
    for (const m of places) {
      expect(geo.isWalkable(m.door.x, m.door.z), m.place.id).toBe(true);
      for (const o of places) {
        for (const c of o.circles) expect(Math.hypot(m.door.x - c.x, m.door.z - c.z), `${m.place.id} door vs ${o.place.id}`).toBeGreaterThan(c.r + BODY_R);
        for (const b of o.boxes) {
          const inside = m.door.x > b.x0 - BODY_R && m.door.x < b.x1 + BODY_R && m.door.z > b.z0 - BODY_R && m.door.z < b.z1 + BODY_R;
          expect(inside, `${m.place.id} door inside ${o.place.id}`).toBe(false);
        }
      }
    }
  });

  it('draws doors along the front wall, on the side the shared door is', () => {
    for (const m of places) {
      if (!m.boxes.length || m.kind === 'lighthouse') continue;
      const side = Math.sign(m.worldDoor.x - m.place.at.x);
      if (Math.abs(m.worldDoor.x - m.place.at.x) > 0.5) expect(Math.sign(m.doorDx), m.place.id).toBe(side);
      expect(m.door.z).toBeGreaterThan(m.base.z);
    }
  });

  it('joins the shared door to the drawn one with a spur that starts and ends at them', () => {
    for (const m of places) {
      if (!m.spur.length) continue;
      expect(polylineDist(m.spur, m.worldDoor.x, m.worldDoor.z)).toBeCloseTo(0);
      expect(polylineDist(m.spur, m.door.x, m.door.z)).toBeCloseTo(0);
    }
  });
});

describe('scatterProps', () => {
  const props = scatterProps(w, geo, places);

  it('grows the same island every time', () => {
    expect(scatterProps(w, geo, places)).toEqual(props);
    expect(props.length).toBeGreaterThan(40);
  });

  it('only plants on dry, open ground', () => {
    for (const p of props) {
      expect(geo.heightAt(p.x, p.z)).toBeGreaterThan(0.2);
      expect(geo.isOpenGround(p.x, p.z)).toBe(true);
    }
  });

  it('never blocks a lost word, a door or the fishing spot', () => {
    for (const p of props) {
      for (const lw of w.lostWords) expect(Math.hypot(p.x - lw.at.x, p.z - lw.at.z), lw.id).toBeGreaterThan(1.4);
      for (const m of places) expect(Math.hypot(p.x - m.door.x, p.z - m.door.z), m.place.id).toBeGreaterThan(2);
      for (const a of w.activities) expect(Math.hypot(p.x - a.at.x, p.z - a.at.z)).toBeGreaterThan(2.5);
    }
  });
});
