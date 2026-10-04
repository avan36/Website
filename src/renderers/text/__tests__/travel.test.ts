import { describe, expect, it } from 'vitest';
import { assignDirections, createTravel } from '../travel';
import { DIRS } from '../parser';
import { geo, world } from './helpers';

const deg = (d: number) => (d * Math.PI) / 180;
const travel = createTravel(world, geo);

describe('assignDirections', () => {
  it('gives each exit its own compass point when it can', () => {
    expect(assignDirections([deg(0), deg(90), deg(180)])).toEqual([0, 2, 4]);
  });

  it('leans an exit to a free neighbouring point rather than share', () => {
    // Both near north-east; one leans to east, which is free and within reach.
    const [a, b] = assignDirections([deg(40), deg(66)]);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it("won't lean further than the truth allows, so some exits share", () => {
    const [a, b] = assignDirections([deg(44), deg(46)]);
    expect(a).toBe(b);
  });
});

describe('exits', () => {
  it('lists every route out of every place, and nothing else', () => {
    for (const p of world.places) {
      const routes = world.routes.filter((r) => r.from === p.id || r.to === p.id).map((r) => (r.from === p.id ? r.to : r.from));
      expect(travel.exits(p.id).map((e) => e.to).sort(), p.id).toEqual(routes.sort());
    }
  });

  it('points each exit within 45 degrees of where the place really is', () => {
    for (const p of world.places) {
      for (const e of travel.exits(p.id)) {
        const truth = geo.bearing(p.at, geo.place(e.to)!.at);
        const given = DIRS.indexOf(e.dir) * (Math.PI / 4);
        const off = Math.abs(Math.atan2(Math.sin(truth - given), Math.cos(truth - given)));
        expect(off, `${p.id} → ${e.to}`).toBeLessThanOrEqual(deg(45));
      }
    }
  });

  it('derives directions from coordinates (the tree is north of the plaza, the pier south)', () => {
    const at = (to: string) => travel.exits('plaza').find((e) => e.to === to)!.dir;
    expect(at('map-of-evolution')).toBe('n');
    expect(at('blog')).toBe('s');
    expect(at('busy-beer')).toBe('e');
    expect(travel.exits('blog').map((e) => e.dir)).toEqual(['n']);
  });

  it('shares a direction when the plaza has more paths than the compass has points', () => {
    const exits = travel.exits('plaza');
    expect(exits).toHaveLength(9);
    const dirs = exits.map((e) => e.dir);
    expect(new Set(dirs).size).toBeLessThan(dirs.length);
  });
});

describe('route', () => {
  it('walks the shortest way through the route graph', () => {
    const legs = travel.route('contact', 'etymon')!;
    expect(legs.map((l) => l.to)).toEqual(['quizmate', 'middle-place', 'etymon']);
    expect(legs.every((l) => !l.paved)).toBe(true);
  });

  it('goes through the plaza when that is the way', () => {
    expect(travel.route('blog', 'privacy-research')!.map((l) => l.to)).toEqual(['plaza', 'privacy-research']);
  });

  it('is empty for staying put', () => {
    expect(travel.route('plaza', 'plaza')).toEqual([]);
  });
});
