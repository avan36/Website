import { describe, expect, it } from 'vitest';
import { createGeo } from '../../../world/geo';
import { world } from '../../../world/__tests__/fixtures';
import { BODY_R, layoutPlaces, layoutStreet, polylineDist, scatterProps } from '../layout';

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
      // The lighthouse and the glass tower have one door, in the middle of the front.
      if (!m.boxes.length || m.kind === 'lighthouse' || m.kind === 'skyscraper') continue;
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

describe('layoutStreet', () => {
  const street = layoutStreet(geo, places)!;
  const mall = places.find((m) => m.kind === 'mall')!;
  const bridge = geo.bridges.find((b) => b.style === 'tower')!;
  const land = geo.landing(bridge, 1);

  it('gives the islet over Tower Bridge its lamps, telephone box, pillar box and bench', () => {
    expect(street).not.toBeNull();
    expect(street.things.map((t) => t.kind).sort()).toEqual(['bench', 'lamp', 'lamp', 'phone-box', 'pillar-box']);
  });

  it('runs its path from where the bridge comes ashore to the mall door, clear of the building', () => {
    expect(Math.hypot(street.walk[0].x - land.x, street.walk[0].z - land.z)).toBeLessThan(0.01);
    const end = street.walk[street.walk.length - 1];
    expect(Math.hypot(end.x - mall.door.x, end.z - mall.door.z)).toBeLessThan(0.01);
    for (const p of street.walk) {
      expect(geo.isWalkable(p.x, p.z), JSON.stringify(p)).toBe(true);
      for (const b of mall.boxes) expect(p.x < b.x0 - BODY_R || p.x > b.x1 + BODY_R || p.z > b.z1 + BODY_R, JSON.stringify(p)).toBe(true);
    }
  });

  it('keeps everything on dry land, clear of the path, the door, the landing and the building', () => {
    for (const t of street.things) {
      expect(geo.heightAt(t.x, t.z), t.kind).toBeGreaterThan(0.3);
      expect(polylineDist(street.walk, t.x, t.z), t.kind).toBeGreaterThan(1.2 + t.r);
      expect(Math.hypot(t.x - mall.door.x, t.z - mall.door.z), t.kind).toBeGreaterThan(1.4 + t.r);
      expect(Math.hypot(t.x - land.x, t.z - land.z), t.kind).toBeGreaterThan(1.4 + t.r);
      for (const c of mall.circles) expect(Math.hypot(t.x - c.x, t.z - c.z), t.kind).toBeGreaterThan(c.r);
    }
  });

  it('grows no scenery on the path or the street furniture', () => {
    for (const p of scatterProps(w, geo, places)) {
      expect(polylineDist(street.walk, p.x, p.z)).toBeGreaterThan(1.6);
      for (const t of street.things) expect(Math.hypot(p.x - t.x, p.z - t.z)).toBeGreaterThan(t.r + 1.2);
    }
  });
});
