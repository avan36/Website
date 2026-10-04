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

  it('puts the @ next to your own place', () => {
    for (const p of world.places) {
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

  it('draws sea all round, and land, paths, rocks and the pier inside', () => {
    const { rows } = drawIsland(world, geo);
    const edge = [...rows[0], ...rows[rows.length - 1], ...rows.map((r) => r[0]), ...rows.map((r) => r[r.length - 1])];
    expect(edge.every((c) => c === GROUND.sea || c === ' ')).toBe(true);
    const all = rows.flat().join('');
    for (const g of [GROUND.sand, GROUND.grass, GROUND.rock, GROUND.path, GROUND.pier]) expect(all).toContain(g);
  });

  it('puts the lighthouse on the rocks and the pier out at sea, like the island does', () => {
    const { rows, glyph, toCell } = drawIsland(world, geo);
    const around = (id: string) => {
      const p = geo.place(id)!;
      const { c, r } = toCell(p.at.x, p.at.z);
      return [rows[r - 1]?.[c], rows[r + 1]?.[c], rows[r][c - 1], rows[r][c + 1]].join('');
    };
    expect(around('privacy-research')).toContain(GROUND.rock);
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
