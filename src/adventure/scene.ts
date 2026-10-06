// Wesleyan in 3D: the ground and Foss Hill, the streets, Andrus Field, the
// campus buildings, its three big landmarks (Usdan with Fayerweather beside
// it, Olin and Exley), trees in their autumn colors, the race gates and the
// car. Built with the island's modelling kit, so it shares its hand-made,
// flat-shaded look. Everything here is drawing: positions come from campus.ts.

import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  type Object3D,
} from 'three';
import { Kit } from '../renderers/island/world/kit';
import { rng } from '../renderers/island/util/math';
import { boxes, bounds, course, gates, roadHalf, streetLines } from './campus';
import { distanceToBox, type Gate } from './track';
import { andrusField, buildings, groundHeight, SCALE, toWorld, type Style } from './wesleyan';

const C = {
  grass: '#93bf6c',
  field: '#86bd5e',
  fieldStripe: '#94c96b',
  dirt: '#c49466',
  road: '#6e6963',
  kerb: '#d8ccb5',
  line: '#f1e3c2',
  brick: '#a5503c',
  brownstone: '#7e5444',
  stone: '#cdbfa8',
  white: '#ece2d0',
  slate: '#5c6064',
  glass: '#3e4a55',
  trim: '#efe6d6',
  concrete: '#d2b39e',
  trunk: '#6b4a33',
};
const WALL: Record<Style, string> = { brick: C.brick, brownstone: C.brownstone, stone: C.stone, white: C.white };

/** Move and turn a part into a building's place: `angle` is a Box's angle. */
const place = (x: number, z: number, angle: number, y = 0) =>
  new Matrix4().makeTranslation(x, y, z).multiply(new Matrix4().makeRotationY(-angle));

function ground(): Mesh {
  const w = bounds.x1 - bounds.x0 + 120;
  const d = bounds.z1 - bounds.z0 + 120;
  const g = new PlaneGeometry(w, d, 140, 140);
  g.rotateX(-Math.PI / 2);
  g.translate((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)) - 0.02);
  g.computeVertexNormals();
  const m = new Mesh(g, new MeshStandardMaterial({ color: C.grass, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

function streets(k: Kit) {
  const flat = { jitter: 0 };
  for (const line of streetLines) {
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      k.cyl(roadHalf + 0.6, roadHalf + 0.6, 0.04, C.kerb, { ...flat, p: [a.x, 0.02, a.z] }, 20);
      k.cyl(roadHalf, roadHalf, 0.06, C.road, { ...flat, p: [a.x, 0.04, a.z] }, 20);
      if (i === line.length - 1) break;
      const b = line[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      const mid: [number, number, number] = [(a.x + b.x) / 2, 0.02, (a.z + b.z) / 2];
      k.box(roadHalf * 2 + 1.2, 0.04, len, C.kerb, { ...flat, p: mid, r: [0, h, 0] });
      k.box(roadHalf * 2, 0.06, len, C.road, { ...flat, p: [mid[0], 0.04, mid[2]], r: [0, h, 0] });
    }
  }
  // Dashes down the middle of the course.
  for (let s = 0; s < course.length; s += 5) {
    const p = course.pointAt(s);
    k.box(0.22, 0.02, 2, C.line, { ...flat, p: [p.x, 0.08, p.z], r: [0, p.heading, 0] });
  }
  // A checkered start line.
  const g0 = gates[0];
  const n = 8;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      const u = (i - (n - 1) / 2) * ((roadHalf * 2) / n);
      const v = (j - 0.5) * 1;
      const x = g0.x + Math.cos(g0.heading) * u + Math.sin(g0.heading) * v;
      const z = g0.z - Math.sin(g0.heading) * u + Math.cos(g0.heading) * v;
      k.box((roadHalf * 2) / n, 0.02, 1, (i + j) % 2 ? '#3a3632' : C.line, { ...flat, p: [x, 0.085, z], r: [0, g0.heading, 0] });
    }
  }
}

function field(k: Kit) {
  const c = toWorld(andrusField.at);
  const w = andrusField.w * SCALE;
  const d = andrusField.d * SCALE;
  const stripes = 9;
  for (let i = 0; i < stripes; i++) {
    k.box(w / stripes, 0.03, d, i % 2 ? C.field : C.fieldStripe, { jitter: 0, p: [c.x - w / 2 + (i + 0.5) * (w / stripes), 0.015, c.z] });
  }
  // A baseball diamond in the southwest corner, as the map draws it.
  k.box(9, 0.035, 9, C.dirt, { jitter: 0, p: [c.x - w / 4, 0.03, c.z + d / 6], r: [0, Math.PI / 4, 0] });
  k.box(6, 0.04, 6, C.field, { jitter: 0, p: [c.x - w / 4, 0.035, c.z + d / 6], r: [0, Math.PI / 4, 0] });
}

/** A plain campus building: walls, a band of windows on each floor, and a roof to suit its style. */
function plain(k: Kit, w: number, d: number, h: number, style: Style) {
  const wall = WALL[style];
  k.box(w, h, d, wall, { p: [0, h / 2, 0] });
  const floors = Math.max(1, Math.floor(h / 3));
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * 3;
    if (y > h - 0.8) break;
    k.box(w * 0.86, 1.1, d + 0.1, C.glass, { p: [0, y, 0], jitter: 0.02 });
    k.box(w + 0.1, 1.1, d * 0.8, C.glass, { p: [0, y, 0], jitter: 0.02 });
  }
  if (style === 'stone') {
    k.box(w + 0.4, 0.4, d + 0.4, '#b3a690', { p: [0, h + 0.2, 0] });
  } else {
    k.box(w + 0.3, 0.3, d + 0.3, style === 'brick' ? C.trim : '#d9cdb8', { p: [0, h + 0.15, 0] });
    const ridgeAlongZ = d >= w;
    if (ridgeAlongZ) k.roof(w, Math.min(3, w * 0.4), d, h + 0.3, C.slate, { overhang: 0.3 });
    else k.within(new Matrix4().makeRotationY(Math.PI / 2), () => k.roof(d, Math.min(3, d * 0.4), w, h + 0.3, C.slate, { overhang: 0.3 }));
  }
}

/** Exley: a low glass base and, above it, a tall square tower of pinkish concrete fins. */
function exley(k: Kit, w: number, d: number) {
  const base = 4;
  k.box(w, base, d, C.glass, { p: [0, base / 2, 0] });
  k.box(w + 0.6, 0.7, d + 0.6, C.concrete, { p: [0, base + 0.35, 0] });
  for (let x = -w / 2 + 1; x <= w / 2 - 1; x += 3) {
    k.box(0.6, base, 0.6, C.concrete, { p: [x, base / 2, d / 2 + 0.2] });
    k.box(0.6, base, 0.6, C.concrete, { p: [x, base / 2, -d / 2 - 0.2] });
  }
  const s = 15;
  const h = 26;
  const tz = -1;
  k.box(s - 1, h, s - 1, '#5b5550', { p: [0, base + h / 2, tz] });
  // The grid: fins all the way up, and a band at every floor.
  const fins = 7;
  for (let i = 0; i <= fins; i++) {
    const u = -s / 2 + (i * s) / fins;
    for (const side of [-1, 1]) {
      k.box(0.55, h, 0.9, C.concrete, { p: [u, base + h / 2, tz + side * (s / 2 - 0.2)] });
      k.box(0.9, h, 0.55, C.concrete, { p: [side * (s / 2 - 0.2), base + h / 2, tz + u] });
    }
  }
  for (let y = base + 3.2; y < base + h; y += 3.2) {
    k.box(s + 0.2, 0.45, s + 0.2, C.concrete, { p: [0, y, tz] });
  }
  k.box(s + 0.4, 1.2, s + 0.4, C.concrete, { p: [0, base + h + 0.6, tz] });
}

/** Usdan: red brick below, a long band of clerestory glass, and wide grey roofs. */
function usdan(k: Kit, w: number, d: number) {
  k.box(w, 4.2, d, C.brick, { p: [0, 2.1, 0] });
  for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += 2.6) k.box(1.4, 2.4, 0.1, C.glass, { p: [x, 1.6, d / 2 + 0.03] });
  k.box(w + 1.6, 0.35, d + 1.6, '#9aa0a4', { p: [0, 4.4, 0] });
  k.box(w * 0.86, 1.6, d * 0.7, '#a9c3cf', { p: [0, 5.4, 0], jitter: 0.01 });
  k.within(new Matrix4().makeRotationY(Math.PI / 2), () => {
    k.roof(d * 0.78, 2.2, w * 0.92, 6.1, C.slate, { overhang: 0.8 });
  });
  k.box(w * 0.35, 1.6, 2.4, '#dcd8cf', { p: [-w * 0.1, 9.4, 0] });
}

/** Fayerweather: brick, a steep slate roof, and two round turrets with pointed caps facing the field. */
function fayerweather(k: Kit, w: number, d: number) {
  k.box(w, 1.4, d, '#8a5a48', { p: [0, 0.7, 0] });
  k.box(w, 7.6, d, C.brick, { p: [0, 1.4 + 3.8, 0] });
  for (let z = -d / 2 + 2; z < d / 2 - 1; z += 2.4) {
    for (const side of [-1, 1]) k.box(0.1, 1.8, 0.9, C.glass, { p: [side * (w / 2 + 0.03), 5, z] });
  }
  k.roof(w, 3.4, d, 9, C.slate, { overhang: 0.4 });
  for (const x of [-w / 4 - 0.4, w / 4 + 0.4]) {
    const z = d / 2 + 0.4;
    k.cyl(1.5, 1.6, 1.6, '#8a5a48', { p: [x, 0.8, z] }, 14);
    k.cyl(1.4, 1.4, 10.4, C.brick, { p: [x, 1.6 + 5.2, z] }, 14);
    k.cyl(1.6, 1.6, 0.4, C.trim, { p: [x, 11.9, z] }, 14);
    k.cone(1.75, 4.6, '#5f7a6c', { p: [x, 14.4, z] }, 14);
    k.cyl(0.08, 0.08, 1.2, '#7f9c8b', { p: [x, 17.2, z] }, 5);
    for (const y of [4.5, 8]) k.box(0.4, 1.1, 0.1, C.glass, { p: [x, y, z + 1.42] });
  }
}

/** Olin: brick with a white cornice, tall arched windows, and a white columned porch toward Church Street. */
function olin(k: Kit, w: number, d: number) {
  const h = 8;
  k.box(w, h, d, C.brick, { p: [0, h / 2, 0] });
  k.box(w + 0.5, 0.7, d + 0.5, C.trim, { p: [0, h + 0.35, 0] });
  k.box(w + 0.3, 0.6, d + 0.3, C.trim, { p: [0, 0.3, 0] });
  k.box(w * 0.7, 1.6, d * 0.7, '#9aa0a4', { p: [0, h + 1.5, 0] });
  for (let x = -w / 2 + 2; x <= w / 2 - 2; x += 2.6) {
    if (Math.abs(x) < 4.5) continue;
    for (const side of [-1, 1]) {
      const z = side * (d / 2 + 0.03);
      k.box(1.3, 4, 0.1, C.glass, { p: [x, 3.6, z] });
      k.cyl(0.65, 0.65, 0.1, C.glass, { p: [x, 5.6, z], r: [Math.PI / 2, 0, 0] }, 12);
      k.box(1.6, 0.2, 0.14, C.trim, { p: [x, 1.5, z] });
    }
  }
  // The porch: steps, six columns and a pediment.
  const pz = d / 2 + 2;
  k.box(10, 0.5, 4, C.trim, { p: [0, 0.25, pz] });
  k.box(10.6, 0.25, 4.6, C.trim, { p: [0, 0.12, pz + 0.2] });
  for (let i = 0; i < 6; i++) k.cyl(0.35, 0.4, 6.6, C.trim, { p: [-4 + i * 1.6, 3.8, pz + 1.2] }, 10);
  k.box(10, 0.8, 3.4, C.trim, { p: [0, 7.5, pz + 0.4] });
  k.within(new Matrix4().makeTranslation(0, 7.9, pz + 0.4).multiply(new Matrix4().makeRotationY(Math.PI / 2)), () => {
    k.gable(3.4, 2, 10.4, C.trim);
  });
}

function campus(k: Kit) {
  for (const [i, b] of buildings.entries()) {
    const box = boxes[i];
    const w = box.hw * 2;
    const d = box.hd * 2;
    k.within(place(box.x, box.z, box.angle), () => {
      if (b.landmark === 'exley') exley(k, w, d);
      else if (b.landmark === 'usdan') usdan(k, w, d);
      else if (b.landmark === 'fayerweather') fayerweather(k, w, d);
      else if (b.landmark === 'olin') olin(k, w, d);
      else plain(k, w, d, b.h, b.style);
    });
  }
}

function trees(k: Kit) {
  const rand = rng(1831);
  const leaves = ['#5f9a4c', '#6fa553', '#4f8a45', '#7aab50', '#d8913a', '#c9672f', '#e0b043', '#5f9a4c'];
  const fc = toWorld(andrusField.at);
  const fw = (andrusField.w * SCALE) / 2 + 2;
  const fd = (andrusField.d * SCALE) / 2 + 2;
  const keep = (x: number, z: number) => {
    if (Math.abs(x - fc.x) < fw && Math.abs(z - fc.z) < fd) return false;
    for (const line of streetLines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < roadHalf + 2.2) return false;
      }
    }
    for (const b of boxes) if (distanceToBox({ x, z }, b) < 2.5) return false;
    return true;
  };
  for (let x = bounds.x0; x < bounds.x1; x += 7) {
    for (let z = bounds.z0; z < bounds.z1; z += 7) {
      if (rand() < 0.45) continue;
      const tx = x + (rand() - 0.5) * 6;
      const tz = z + (rand() - 0.5) * 6;
      if (!keep(tx, tz)) continue;
      const y = groundHeight(tx, tz);
      const s = 0.8 + rand() * 0.7;
      const leaf = leaves[Math.floor(rand() * leaves.length)];
      k.cyl(0.25 * s, 0.35 * s, 2.4 * s, C.trunk, { p: [tx, y + 1.2 * s, tz] }, 5);
      k.ico(1.7 * s, leaf, { p: [tx, y + 3.2 * s, tz], s: [1, 1.15, 1], jitter: 0.06 });
      if (rand() < 0.5) k.ico(1.2 * s, leaf, { p: [tx + 0.6 * s, y + 4.3 * s, tz - 0.3 * s], jitter: 0.06 });
    }
  }
}

export type GateMesh = { gate: Gate; banner: MeshStandardMaterial; group: Group };

function gateMeshes(color: string): GateMesh[] {
  return gates.map((g) => {
    const k = new Kit(40 + g.i);
    const span = roadHalf + 0.9;
    k.within(place(g.x, g.z, -g.heading + Math.PI / 2), () => {
      for (const side of [-1, 1]) {
        k.cyl(0.25, 0.3, 5.6, C.trim, { p: [0, 2.8, side * span] }, 8);
        k.sphere(0.35, C.trim, { p: [0, 5.7, side * span] }, 8, 6);
      }
    });
    const group = k.build();
    const banner = new MeshStandardMaterial({ color, roughness: 0.7, transparent: true, opacity: 1 });
    const bk = new Kit(90 + g.i);
    bk.within(place(g.x, g.z, -g.heading + Math.PI / 2), () => bk.box(0.18, 1.2, span * 2, '#ffffff', { p: [0, 5, 0], jitter: 0 }));
    const b = bk.build();
    b.traverse((o) => { if (o instanceof Mesh) o.material = banner; });
    group.add(b);
    return { gate: g, banner, group };
  });
}

/** The car: a small hatchback in cardinal red. Its nose points along +z. */
export function carModel(color = '#b5283a'): Object3D {
  const k = new Kit(7);
  k.rbox(2, 0.75, 3.9, 0.25, color, { p: [0, 0.75, 0] });
  k.rbox(1.7, 0.7, 2.1, 0.25, color, { p: [0, 1.45, -0.35] });
  k.box(1.6, 0.5, 0.08, '#bfe4f1', { p: [0, 1.48, 0.72], r: [-0.5, 0, 0], jitter: 0 });
  k.box(1.6, 0.45, 0.08, '#bfe4f1', { p: [0, 1.48, -1.42], r: [0.4, 0, 0], jitter: 0 });
  for (const side of [-1, 1]) k.box(0.08, 0.42, 1.7, '#bfe4f1', { p: [side * 0.86, 1.5, -0.35], jitter: 0 });
  for (const x of [-0.95, 0.95]) {
    for (const z of [-1.25, 1.25]) {
      k.cyl(0.42, 0.42, 0.34, '#2c2b33', { p: [x, 0.42, z], r: [0, 0, Math.PI / 2] }, 12);
      k.cyl(0.2, 0.2, 0.36, '#c9c3b8', { p: [x, 0.42, z], r: [0, 0, Math.PI / 2] }, 8);
    }
  }
  k.box(1.9, 0.22, 0.12, '#3a3632', { p: [0, 0.48, 1.96] });
  k.box(1.9, 0.22, 0.12, '#3a3632', { p: [0, 0.48, -1.96] });
  for (const x of [-0.7, 0.7]) {
    k.addGlow(new PlaneGeometry(0.4, 0.2), '#fff4d6', { p: [x, 0.85, 1.97] });
    k.addGlow(new PlaneGeometry(0.4, 0.2), '#e5484d', { p: [x, 0.85, -1.97], r: [0, Math.PI, 0] });
  }
  const g = k.build();
  return g;
}

export type CampusScene = {
  scene: Scene;
  sun: DirectionalLight;
  gates: GateMesh[];
  car: Object3D;
};

export function buildScene(color: string): CampusScene {
  const scene = new Scene();
  scene.background = new Color('#bfdfe9');
  scene.fog = new Fog('#d7e6e3', 110, 300);
  scene.add(new HemisphereLight('#e6f1f4', '#9c8a66', 1.5));
  const sun = new DirectionalLight('#fff0d6', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  scene.add(ground());
  const flat = new Kit(3);
  streets(flat);
  field(flat);
  const lay = flat.build({ castShadow: false, receiveShadow: true });
  scene.add(lay);

  const kb = new Kit(11);
  campus(kb);
  scene.add(kb.build());
  const kt = new Kit(13);
  trees(kt);
  scene.add(kt.build());

  const gm = gateMeshes(color);
  for (const g of gm) scene.add(g.group);

  const car = carModel(color);
  scene.add(car);
  return { scene, sun, gates: gm, car };
}
