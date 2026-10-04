// A city across the water to the north: a hazy silhouette, one skyline made of
// two. From the west it's London (the Eye, the Houses of Parliament and the
// clock tower, the Gherkin, the Shard), and it runs east into a newer kind of
// downtown: a slim pyramid, a tall rounded obelisk, glass towers. No names on
// anything; it's just the view.
//
// It sits just past the edge of what the play camera sees from the middle of
// the island, so it slides into view as you walk north, and it's there in the
// opening swoop. It is flat-colored and unfogged, mixed toward the horizon
// color so it reads as far away. After dark it turns to a deep blue with lit
// windows and a glowing clock face.

import { BoxGeometry, Color, ConeGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, TorusGeometry, Vector2, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep } from './kit';
import { rng } from '../util/math';

/** How far north the skyline stands, and how much of the horizon it spans. */
const Z = -47;

const DAY = new Color('#9fb0c4');
const NIGHT = new Color('#1d2648');

export function buildSkyline() {
  const group = new Group();
  group.name = 'skyline';
  const rand = rng(4242);
  const parts: BufferGeometry[] = [];
  const lights: BufferGeometry[] = [];
  // Every part is a slightly different shade of the same haze, so shapes read against each other.
  const add = (g: BufferGeometry, shade: number, o: Parameters<typeof prep>[2]) => {
    const c = new Color().setScalar(shade);
    parts.push(prep(g, c.getHex(), { ...o, jitter: 0 }));
  };
  const box = (x: number, w: number, h: number, d: number, shade: number, z = 0, y = 0) => add(boxGeo(w, h, d), shade, { p: [x, y + h / 2, Z + z] });
  /** Windows: a grid of little lit squares on a tower's south face. */
  const windows = (x: number, w: number, h: number, z: number, y0 = 0.6, density = 0.45) => {
    for (let y = y0; y < h - 0.3; y += 0.42) {
      for (let wx = -w / 2 + 0.2; wx < w / 2 - 0.15; wx += 0.3) {
        if (rand() > density) continue;
        lights.push(prep(new PlaneGeometry(0.12, 0.16), '#ffd98a', { p: [x + wx, y, Z + z + 0.01], jitter: 0 }));
      }
    }
  };

  // The far shore everything stands on.
  box(4, 112, 0.5, 4, 0.82, 0, -0.1);

  // ---------- London, from the west ----------
  // The Eye: a rim, spokes and a little A-frame leg.
  const eyeX = -40;
  const eyeY = 3.6;
  add(new TorusGeometry(3.1, 0.08, 4, 40), 0.86, { p: [eyeX, eyeY, Z + 1] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(boxGeo(0.03, 3.1, 0.03), 0.9, { p: [eyeX + Math.cos(a) * 1.55, eyeY + Math.sin(a) * 1.55, Z + 1], r: [0, 0, a - Math.PI / 2] });
    add(boxGeo(0.2, 0.14, 0.14), 0.84, { p: [eyeX + Math.cos(a) * 3.2, eyeY + Math.sin(a) * 3.2, Z + 1] });
  }
  add(boxGeo(0.12, 3.8, 0.12), 0.86, { p: [eyeX - 0.9, eyeY / 2, Z + 1], r: [0, 0, -0.25] });
  add(boxGeo(0.12, 3.8, 0.12), 0.86, { p: [eyeX + 0.9, eyeY / 2, Z + 1], r: [0, 0, 0.25] });

  // The Houses of Parliament: a long low hall with pinnacles, and the clock tower at the end.
  box(-31, 7, 1.3, 1.2, 0.8, 0.5);
  for (let x = -34.2; x < -27.6; x += 0.55) add(coneGeo(0.08, 0.5, 4), 0.8, { p: [x, 1.55, Z + 0.5] });
  box(-35.2, 1.2, 2.6, 1.2, 0.78, 0.3); // the big square tower at the far end
  const benX = -27.4;
  box(benX, 0.75, 4.6, 0.75, 0.76, 0.8);
  box(benX, 0.95, 0.95, 0.95, 0.74, 0.8, 4.6); // the clock stage
  add(coneGeo(0.62, 1.7, 4), 0.72, { p: [benX, 5.55 + 0.85, Z + 0.8], r: [0, Math.PI / 4, 0] });
  add(coneGeo(0.06, 0.5, 4), 0.72, { p: [benX, 7.4, Z + 0.8] });
  // Its clock face glows after dark.
  lights.push(prep(new PlaneGeometry(0.55, 0.55), '#fff1c4', { p: [benX, 5.05, Z + 0.8 + 0.48], jitter: 0 }));

  // Some low London blocks and a dome.
  box(-23.5, 2.6, 2.2, 1.4, 0.8);
  windows(-23.5, 2.6, 2.2, 0.71);
  add(new LatheGeometry([0, 0.3, 0.6, 0.85, 1].map((t) => new Vector2(Math.cos((t * Math.PI) / 2) * 1.05, Math.sin((t * Math.PI) / 2) * 1.05)), 10), 0.78, { p: [-21.2, 1.9, Z] });
  box(-21.2, 1.6, 1.9, 1.6, 0.8);
  add(coneGeo(0.08, 0.7, 4), 0.78, { p: [-21.2, 3.25, Z] });

  // The Gherkin: a rounded bullet.
  const gk: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    gk.push([0.95 * Math.sin(Math.PI * (0.18 + 0.82 * t)) * (1 - t * 0.15) + (t === 1 ? -0.9 : 0), t * 6.2]);
  }
  gk[gk.length - 1][0] = 0;
  add(new LatheGeometry(gk.map(([x, y]) => new Vector2(Math.max(0, x), y)), 12), 0.7, { p: [-17.5, 0, Z - 0.5] });
  windows(-17.5, 1.2, 5.2, 0.3, 0.6, 0.3);
  box(-15.4, 2.2, 3.4, 1.4, 0.76);
  windows(-15.4, 2.2, 3.4, 0.71);

  // The Shard: a tall, splintered glass pyramid.
  add(coneGeo(1.7, 11, 4), 0.68, { p: [-11.4, 5.5, Z - 1], r: [0, Math.PI / 4 + 0.15, 0] });
  add(coneGeo(0.35, 1.4, 4), 0.74, { p: [-11.2, 10.9, Z - 1], r: [0.08, 0.3, 0.12] });
  windows(-11.4, 1.6, 7.5, 0.25, 0.8, 0.35);

  // ---------- Into somewhere newer ----------
  const generic = (x: number, w: number, h: number, shade: number, z = 0) => {
    box(x, w, h, w * 0.9, shade, z);
    windows(x, w, h, z + w * 0.45);
  };
  generic(-8, 1.8, 3.2, 0.78);
  generic(-5.6, 1.4, 4.4, 0.74, -0.6);
  generic(-3.4, 2.2, 2.6, 0.8, 0.4);
  generic(-1, 1.5, 5.6, 0.72, -1);
  generic(1.3, 2.0, 3.8, 0.77);
  generic(3.6, 1.3, 6.4, 0.7, -0.8);

  // A slim four-sided pyramid with a needle on top.
  add(coneGeo(1.2, 9.5, 4), 0.74, { p: [6.8, 4.75, Z], r: [0, Math.PI / 4, 0] });
  add(boxGeo(0.25, 1.3, 0.6), 0.74, { p: [6.15, 5.8, Z] }); // its two little wings
  add(boxGeo(0.25, 1.3, 0.6), 0.74, { p: [7.45, 5.8, Z] });
  add(coneGeo(0.05, 1.5, 4), 0.7, { p: [6.8, 10.2, Z] });

  generic(9.3, 1.7, 4.8, 0.76, -0.5);
  generic(11.3, 2.2, 6.9, 0.69, -1.2);

  // The tallest: a rounded obelisk, wider at the shoulders, with a lit crown.
  const ob: [number, number][] = [[1.25, 0], [1.3, 6], [1.22, 10], [1.05, 12.3], [0.7, 13.3], [0, 13.8]];
  add(new LatheGeometry(ob.map(([x, y]) => new Vector2(x, y)), 14), 0.64, { p: [14.6, 0, Z - 1.5] });
  lights.push(prep(new PlaneGeometry(1.7, 1.1), '#e9f1ff', { p: [14.6, 12.4, Z - 1.5 + 1.08], jitter: 0 }));
  windows(14.6, 1.8, 11.5, -0.2, 0.8, 0.4);

  generic(17.6, 2.4, 5.2, 0.73, -0.4);
  generic(20.3, 1.6, 7.6, 0.68, -1);
  generic(22.6, 2.0, 4.1, 0.76);
  generic(25.2, 1.8, 6.1, 0.71, -0.7);
  generic(27.6, 2.3, 3.3, 0.78, 0.3);
  // Then it thins out into low hills.
  for (let x = 30; x < 58; x += 2.2 + rand() * 1.5) generic(x, 1.4 + rand(), 1 + rand() * 2.5 * (1 - (x - 30) / 30), 0.8 + rand() * 0.04);
  for (let x = -58; x < -44; x += 2.4 + rand() * 1.5) generic(x, 1.4 + rand(), 0.8 + rand() * 1.8, 0.8 + rand() * 0.04);

  const mat = new MeshBasicMaterial({ vertexColors: true, color: DAY.clone(), fog: false });
  const mesh = new Mesh(mergeGeometries(parts, false)!, mat);
  mesh.renderOrder = -0.5;
  parts.forEach((g) => g.dispose());
  const lightMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
  const lit = new Mesh(mergeGeometries(lights, false)!, lightMat);
  lit.visible = false;
  lights.forEach((g) => g.dispose());
  group.add(mesh, lit);

  return {
    group,
    /** Darkness, 0 (day) to 1 (night). */
    night(n: number) {
      mat.color.lerpColors(DAY, NIGHT, n);
      lightMat.opacity = Math.min(1, n * 1.4);
      lit.visible = n > 0.05;
    },
  };
}

const boxGeo = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const coneGeo = (r: number, h: number, seg: number) => new ConeGeometry(r, h, seg);
