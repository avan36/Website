// Checks on the campus data, like checkWorld does for the island: if one of
// these fails, the sentence says what to move in wesleyan.ts.
import { describe, expect, it } from 'vitest';
import { boxes, bounds, course, gates, onRoad, roadHalf, streetLines } from '../campus';
import { chapters, playableChapters } from '../levels';
import { distanceToBox, distanceToLine, GATE_RADIUS } from '../track';
import { buildings, groundHeight, landmarks } from '../wesleyan';

describe('Wesleyan', () => {
  it('keeps every building off the streets', () => {
    for (const [i, b] of boxes.entries()) {
      for (const line of streetLines) {
        // Sample the street and check none of it runs through the building.
        for (let k = 0; k < line.length - 1; k++) {
          const a = line[k];
          const c = line[k + 1];
          for (let t = 0; t <= 1; t += 0.02) {
            const p = { x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t };
            const d = distanceToBox(p, b);
            expect(d, `building ${i} at map ${buildings[i].at} is ${d.toFixed(1)} from a street: move it or shrink it`).toBeGreaterThan(roadHalf + 0.5);
          }
        }
      }
    }
  });

  it('runs the whole course on the streets', () => {
    for (let s = 0; s < course.length; s += 2) {
      const p = course.pointAt(s);
      expect(onRoad(p), `the course leaves the streets ${s} along the lap`).toBe(true);
    }
  });

  it('puts each gate on the course, apart from the others, and inside the world', () => {
    for (const g of gates) {
      expect(onRoad(g)).toBe(true);
      expect(g.x > bounds.x0 && g.x < bounds.x1 && g.z > bounds.z0 && g.z < bounds.z1).toBe(true);
    }
    const sorted = [...gates].map((g) => g.s).sort((a, b) => a - b);
    expect(sorted).toEqual(gates.map((g) => g.s));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(GATE_RADIUS * 3);
  });

  it('keeps Foss Hill off the streets', () => {
    for (const line of streetLines) {
      for (let k = 0; k < line.length - 1; k++) {
        for (let t = 0; t <= 1; t += 0.02) {
          const p = { x: line[k].x + (line[k + 1].x - line[k].x) * t, z: line[k].z + (line[k + 1].z - line[k].z) * t };
          expect(groundHeight(p.x, p.z)).toBe(0);
        }
      }
    }
  });

  it('names a real landmark for every named building and gate', () => {
    const ids = new Set(landmarks.map((l) => l.id));
    for (const b of buildings) if (b.landmark) expect(ids.has(b.landmark)).toBe(true);
    for (const g of gates) if (g.landmark) expect(ids.has(g.landmark)).toBe(true);
    for (const id of ['usdan', 'olin', 'exley']) expect(gates.some((g) => g.landmark === id), `${id} needs a gate`).toBe(true);
  });

  it('never uses an em dash in anything a visitor reads', () => {
    const text = JSON.stringify([landmarks, chapters, gates.map((g) => g.name)]);
    expect(text).not.toMatch(/—/);
  });

  it('keeps drafts out of the menu', () => {
    const list = [...chapters, { ...chapters[0], id: 'later', n: 1, draft: true }];
    expect(playableChapters(list).map((c) => c.id)).toEqual(chapters.filter((c) => !c.draft).map((c) => c.id));
    expect(distanceToLine({ x: 0, z: 0 }, [{ x: 0, z: 1 }, { x: 1, z: 1 }])).toBe(1);
  });
});
