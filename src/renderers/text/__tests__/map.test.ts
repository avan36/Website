import { describe, expect, it } from 'vitest';
import { drawIsland, glyphs, GROUND, MAP_COLS, MAP_ROWS } from '../map';
import { engine, geo, play, world } from './helpers';
import type { Block } from '../output';

const mapOf = (at: string) => play(at, 'map').last.out.find((b): b is Extract<Block, { kind: 'map' }> => b.kind === 'map')!;

describe('the map', () => {
  it(`is ${MAP_COLS} by ${MAP_ROWS}`, () => {
    const m = mapOf('plaza');
    expect(m.rows).toHaveLength(MAP_ROWS);
    for (const row of m.rows) expect(row).toHaveLength(MAP_COLS);
  });

  it('gives every place its own letter, and shows them all', () => {
    const g = glyphs(world);
    expect(new Set(g.values()).size).toBe(world.places.length);
    for (const v of g.values()) expect(v).toMatch(/^[A-Z]$/);
    const text = mapOf('plaza').rows.join('\n');
    for (const p of world.places) expect(text, p.id).toContain(g.get(p.id));
  });

  it('marks where you are with exactly one @, wherever you are', () => {
    for (const p of world.places) {
      const text = mapOf(p.id).rows.join('');
      expect(text.split(GROUND.you).length - 1, p.id).toBe(1);
    }
  });

  it('puts the @ next to your own place (on the main island: the islets are off the map)', () => {
    for (const p of world.places.filter((x) => !geo.islandOf(x.at.x, x.at.z))) {
      const m = mapOf(p.id);
      const g = glyphs(world).get(p.id)!;
      const find = (ch: string) => {
        const r = m.rows.findIndex((row) => row.includes(ch));
        return { r, c: m.rows[r].indexOf(ch) };
      };
      const you = find(GROUND.you);
      const it = find(g);
      expect(Math.abs(you.r - it.r) + Math.abs(you.c - it.c), p.id).toBeLessThanOrEqual(4);
    }
  });

  it("draws the main island only: the islets are over bridges words can't cross", () => {
    const m = drawIsland(world, geo);
    for (const s of geo.islands.slice(1)) {
      const { c, r } = m.toCell(s.x, s.z);
      expect([GROUND.sea, ' '], s.id).toContain(m.rows[r][c]);
    }
  });

  it('runs Tower Bridge out toward the edge, with the mall at the end of it, and you on it when you are there', () => {
    const m = drawIsland(world, geo);
    const F = m.glyph.get('westfield')!;
    const r = m.rows.findIndex((row) => row.includes(F));
    expect(r).toBeGreaterThan(0);
    const row = m.rows[r].join('');
    expect(row).toMatch(new RegExp(`={3,}${F}`));
    expect(row.indexOf(F)).toBeGreaterThan(MAP_COLS * 0.75);
    const you = mapOf('westfield');
    const at = you.rows.findIndex((x) => x.includes(GROUND.you));
    expect(Math.abs(at - r)).toBeLessThanOrEqual(2);
  });

  it('draws sea all round, and land, paths and the pier inside', () => {
    const { rows } = drawIsland(world, geo);
    const edge = [...rows[0], ...rows[rows.length - 1], ...rows.map((r) => r[0]), ...rows.map((r) => r[r.length - 1])];
    expect(edge.every((c) => c === GROUND.sea || c === ' ')).toBe(true);
    const all = rows.flat().join('');
    for (const g of [GROUND.sand, GROUND.grass, GROUND.path, GROUND.pier]) expect(all).toContain(g);
  });

  it('puts the pier out at sea, and the lighthouse and the depot out over their bridge, like the island does', () => {
    const { rows, glyph, toCell } = drawIsland(world, geo);
    const all = rows.flat();
    const around = (id: string) => {
      const p = geo.place(id)!;
      const { c, r } = toCell(p.at.x, p.at.z);
      return [rows[r - 1]?.[c], rows[r + 1]?.[c], rows[r][c - 1], rows[r][c + 1]].join('');
    };
    for (const id of ['privacy-research', 'eqoscan']) expect(all, id).toContain(glyph.get(id));
    expect(around('blog')).toMatch(/[~=@ ]/);
    expect(glyph.get('blog')).toBeTruthy();
  });

  it('comes with a legend that names every place, and a summary for screen readers', () => {
    const m = mapOf('etymon');
    expect(m.legend.map((l) => l.title)).toEqual(world.places.map((p) => p.title));
    expect(m.legend.find((l) => l.here)?.title).toBe('The old library');
    expect(m.summary).toMatch(/You are at the old library/);
    expect(engine.map(engine.initial('plaza'))[0].kind).toBe('map');
  });
});
