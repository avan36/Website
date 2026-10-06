// Wesleyan in 3D: the ground and Foss Hill, the streets, Andrus Field, the
// campus buildings, its three big landmarks (Usdan with Fayerweather beside
// it, Olin and Exley), trees in their autumn colors, the race gates and the
// car. Built with the island's modelling kit, so it shares its hand-made,
// flat-shaded look. Everything here is drawing: positions come from campus.ts.

import {
  BackSide,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderer,
} from 'three';
import { clouds } from './effects';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Kit } from '../renderers/island/world/kit';
import { rng } from '../renderers/island/util/math';
import { fbm } from '../world/noise';
import { boxes, bounds, course, gates, laneClearance, lanes, roadHalf } from './campus';
import { distanceToBox, type Gate } from './track';
import { andrusField, buildings, courts, groundHeight, SCALE, toWorld, type Style } from './wesleyan';

const C = {
  grass: '#93bf6c',
  field: '#86bd5e',
  fieldStripe: '#94c96b',
  dirt: '#c49466',
  road: '#6a6560',
  kerb: '#d8ccb5',
  path: '#d9c9a8',
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
  hedge: '#4f7f3f',
  lamp: '#2f3335',
  court: '#5f9a6a',
  track: '#b4553f',
};
const WALL: Record<Style, string> = { brick: C.brick, brownstone: C.brownstone, stone: C.stone, white: C.white };

/** Move and turn a part into a building's place: `angle` is a Box's angle. */
const place = (x: number, z: number, angle: number, y = 0) =>
  new Matrix4().makeTranslation(x, y, z).multiply(new Matrix4().makeRotationY(-angle));

/** The ground: grass in soft patches of light and shade, rising into Foss Hill. */
function ground(): Mesh {
  const w = bounds.x1 - bounds.x0 + 200;
  const d = bounds.z1 - bounds.z0 + 200;
  const g = new PlaneGeometry(w, d, 220, 220);
  g.rotateX(-Math.PI / 2);
  g.translate((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const base = new Color(C.grass);
  const dry = new Color('#b4c477');
  const deep = new Color('#6f9f55');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y - 0.02);
    const n = fbm(x * 0.02, z * 0.02, 4, 5);
    const m = fbm(x * 0.09, z * 0.09, 2, 9);
    c.copy(base).lerp(n > 0.5 ? dry : deep, Math.min(1, Math.abs(n - 0.5) * 1.6)).multiplyScalar(0.94 + m * 0.12);
    // Worn a little near the edges of the roads, where people walk.
    const edge = laneClearance({ x, z });
    if (edge < 1.6 && edge > 0) c.lerp(new Color('#a9a77a'), 0.25 * (1 - edge / 1.6));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** The sky: a dome, pale at the horizon and deeper blue overhead. */
function sky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new Color('#5d9bd0') }, mid: { value: new Color('#cfe2ea') }, bottom: { value: new Color('#f2e2c8') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 1.6, 0.0, 1.0), 0.8)) : mix(mid, bottom, clamp(-h * 6.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  const m = new Mesh(new SphereGeometry(700, 32, 16), mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

function streets(k: Kit) {
  const flat = { jitter: 0 };
  // Paths first and lowest, then kerbs, then the roads over both.
  const layer = (kind: 'road' | 'path', half: (h: number) => number, y: number, color: string, h = 0.06) => {
    for (const l of lanes) {
      if (l.kind !== kind) continue;
      const r = half(l.half);
      for (let i = 0; i < l.pts.length; i++) {
        const a = l.pts[i];
        k.cyl(r, r, h, color, { ...flat, p: [a.x, y, a.z] }, 20);
        if (i === l.pts.length - 1) break;
        const b = l.pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const hd = Math.atan2(b.x - a.x, b.z - a.z);
        k.box(r * 2, h, len, color, { ...flat, p: [(a.x + b.x) / 2, y, (a.z + b.z) / 2], r: [0, hd, 0] });
      }
    }
  };
  layer('path', (h) => h, 0.03, C.path);
  layer('road', (h) => h + 0.9, 0.06, C.kerb, 0.14);
  layer('road', (h) => h, 0.13, C.road);
  // Dashes down the middle of the course.
  for (let s = 0; s < course.length; s += 5) {
    const p = course.pointAt(s);
    k.box(0.22, 0.02, 2, C.line, { ...flat, p: [p.x, 0.17, p.z], r: [0, p.heading, 0] });
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
      k.box((roadHalf * 2) / n, 0.02, 1, (i + j) % 2 ? '#3a3632' : C.line, { ...flat, p: [x, 0.175, z], r: [0, g0.heading, 0] });
    }
  }
}

function field(k: Kit) {
  const c = toWorld(andrusField.at);
  const w = andrusField.w * SCALE;
  const d = andrusField.d * SCALE;
  const stripes = 11;
  for (let i = 0; i < stripes; i++) {
    k.box(w / stripes, 0.03, d, i % 2 ? C.field : C.fieldStripe, { jitter: 0, p: [c.x - w / 2 + (i + 0.5) * (w / stripes), 0.015, c.z] });
  }
  // A baseball diamond in the southwest corner, as the map draws it.
  const dx = c.x - w / 4;
  const dz = c.z + d / 6;
  k.box(12, 0.035, 12, C.dirt, { jitter: 0, p: [dx, 0.03, dz], r: [0, Math.PI / 4, 0] });
  k.box(8.4, 0.04, 8.4, C.field, { jitter: 0, p: [dx, 0.035, dz], r: [0, Math.PI / 4, 0] });
  k.cyl(0.9, 0.9, 0.05, C.dirt, { jitter: 0, p: [dx, 0.045, dz] }, 12);

  // The tennis courts, each green with white lines and a net.
  const t = toWorld(courts.at);
  const tw = courts.w * SCALE;
  const td = courts.d * SCALE;
  k.box(tw + 2, 0.03, td + 2, '#6c8f78', { jitter: 0, p: [t.x, 0.02, t.z] });
  const each = td / courts.rows;
  for (let i = 0; i < courts.rows; i++) {
    const z = t.z - td / 2 + (i + 0.5) * each;
    k.box(tw - 1, 0.04, each - 1.4, C.court, { jitter: 0, p: [t.x, 0.03, z] });
    k.box(tw - 3, 0.05, 0.12, C.trim, { jitter: 0, p: [t.x, 0.035, z - each / 2 + 1.3] });
    k.box(tw - 3, 0.05, 0.12, C.trim, { jitter: 0, p: [t.x, 0.035, z + each / 2 - 1.3] });
    k.box(0.06, 1, each - 2.6, '#2f3335', { jitter: 0, p: [t.x, 0.5, z] });
  }
  // Infield of the running track: grass with a field marked out.
  k.box(46, 0.03, 18, C.fieldStripe, { jitter: 0, p: [toWorld([250, 1555]).x, 0.015, toWorld([250, 1555]).z] });
}

/** Windows all the way along a wall of length `len`, at height y, set into the face at distance `out` along +z. */
function windowRow(k: Kit, len: number, y: number, out: number, style: Style, tall = 1.5) {
  const n = Math.max(1, Math.floor(len / 2));
  const step = len / n;
  const frame = style === 'brick' || style === 'brownstone' ? C.trim : '#b9ad99';
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * step;
    k.box(0.95, tall, 0.12, C.glass, { p: [x, y, out], jitter: 0.04 });
    k.box(1.15, 0.14, 0.2, frame, { p: [x, y - tall / 2 - 0.05, out + 0.03] });
    k.box(0.08, tall, 0.16, frame, { p: [x, y, out + 0.02] });
  }
}

/** A plain campus building: walls on a plinth, a row of real windows on every floor, a door, and a roof to suit its style. */
function plain(k: Kit, w: number, d: number, h: number, style: Style) {
  const wall = WALL[style];
  k.box(w + 0.3, 0.7, d + 0.3, style === 'white' ? '#b9ad99' : '#8a7a6a', { p: [0, 0.35, 0] });
  k.box(w, h, d, wall, { p: [0, h / 2, 0] });
  const floors = Math.max(1, Math.floor((h - 0.6) / 3));
  for (let f = 0; f < floors; f++) {
    const y = 1.9 + f * 3;
    if (y > h - 0.8) break;
    for (const side of [-1, 1]) {
      k.within(new Matrix4().makeRotationY(side > 0 ? 0 : Math.PI), () => windowRow(k, w - 1.2, y, d / 2, style));
      k.within(new Matrix4().makeRotationY(side > 0 ? Math.PI / 2 : -Math.PI / 2), () => windowRow(k, d - 1.2, y, w / 2, style));
    }
  }
  // A door in the middle of the front, with a little step.
  k.box(1.4, 2.2, 0.14, '#4a3a30', { p: [0, 1.1, d / 2 + 0.02] });
  k.box(2.2, 0.25, 1, '#b9ad99', { p: [0, 0.12, d / 2 + 0.5] });
  if (style === 'stone') {
    k.box(w + 0.4, 0.5, d + 0.4, '#b3a690', { p: [0, h + 0.25, 0] });
    k.box(w * 0.3, 1.2, d * 0.3, '#a59a86', { p: [w * 0.15, h + 1.1, 0] });
  } else {
    k.box(w + 0.35, 0.35, d + 0.35, style === 'brick' ? C.trim : '#d9cdb8', { p: [0, h + 0.17, 0] });
    const ridgeAlongZ = d >= w;
    if (ridgeAlongZ) k.roof(w, Math.min(3.2, w * 0.4), d, h + 0.35, C.slate, { overhang: 0.35 });
    else k.within(new Matrix4().makeRotationY(Math.PI / 2), () => k.roof(d, Math.min(3.2, d * 0.4), w, h + 0.35, C.slate, { overhang: 0.35 }));
    // A chimney or two.
    k.box(0.8, 2.4, 0.8, style === 'white' ? '#9d5a45' : wall, { p: [w * 0.3, h + 1.8, d * 0.15] });
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
  const s = 18;
  const h = 30;
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
  const leaves = ['#5f9a4c', '#6fa553', '#4f8a45', '#7aab50', '#d8913a', '#c9672f', '#e0b043', '#5f9a4c', '#a7442c'];
  const fc = toWorld(andrusField.at);
  const fw = (andrusField.w * SCALE) / 2 + 2;
  const fd = (andrusField.d * SCALE) / 2 + 2;
  const tc = toWorld(courts.at);
  const tw = (courts.w * SCALE) / 2 + 2;
  const td = (courts.d * SCALE) / 2 + 2;
  const keep = (x: number, z: number) => {
    if (Math.abs(x - fc.x) < fw && Math.abs(z - fc.z) < fd) return false;
    if (Math.abs(x - tc.x) < tw && Math.abs(z - tc.z) < td) return false;
    if (laneClearance({ x, z }) < 2.2) return false;
    for (const b of boxes) if (distanceToBox({ x, z }, b) < 2.8) return false;
    return true;
  };
  for (let x = bounds.x0; x < bounds.x1; x += 8) {
    for (let z = bounds.z0; z < bounds.z1; z += 8) {
      if (rand() < 0.42) continue;
      const tx = x + (rand() - 0.5) * 7;
      const tz = z + (rand() - 0.5) * 7;
      if (!keep(tx, tz)) continue;
      const y = groundHeight(tx, tz);
      const s = 0.85 + rand() * 0.8;
      const leaf = leaves[Math.floor(rand() * leaves.length)];
      if (rand() < 0.18) {
        // A conifer: stacked cones.
        k.cyl(0.22 * s, 0.3 * s, 1.4 * s, C.trunk, { p: [tx, y + 0.7 * s, tz] }, 6);
        for (let i = 0; i < 3; i++) k.cone((1.9 - i * 0.5) * s, 2.2 * s, '#3f6e42', { p: [tx, y + (1.9 + i * 1.3) * s, tz], jitter: 0.05 }, 7);
        continue;
      }
      k.cyl(0.22 * s, 0.34 * s, 2.6 * s, C.trunk, { p: [tx, y + 1.3 * s, tz] }, 6);
      k.ico(1.8 * s, leaf, { p: [tx, y + 3.4 * s, tz], s: [1, 1.1, 1], jitter: 0.07 }, 1);
      k.ico(1.25 * s, leaf, { p: [tx + 0.8 * s, y + 4.4 * s, tz - 0.4 * s], jitter: 0.07 }, 1);
      if (rand() < 0.5) k.ico(1.1 * s, leaf, { p: [tx - 0.9 * s, y + 3.9 * s, tz + 0.5 * s], jitter: 0.07 }, 1);
    }
  }
}

/** Street lamps along both sides of the course, and low hedges along the fronts of the named buildings. */
function furniture(k: Kit) {
  for (let s = 0, side = 1; s < course.length; s += 22, side = -side) {
    const p = course.pointAt(s);
    const ox = Math.cos(p.heading) * (roadHalf + 1.3) * side;
    const oz = -Math.sin(p.heading) * (roadHalf + 1.3) * side;
    const x = p.x + ox;
    const z = p.z + oz;
    if (boxes.some((b) => distanceToBox({ x, z }, b) < 1)) continue;
    k.cyl(0.32, 0.4, 0.4, C.lamp, { p: [x, 0.2, z] }, 8);
    k.cyl(0.1, 0.13, 4.6, C.lamp, { p: [x, 2.5, z] }, 6);
    k.cyl(0.3, 0.2, 0.7, C.lamp, { p: [x, 5, z] }, 6);
    k.addGlow(new SphereGeometry(0.26, 10, 8), '#fff1cf', { p: [x, 5.05, z] });
    k.cone(0.42, 0.4, C.lamp, { p: [x, 5.55, z] }, 6);
  }
  for (const [i, b] of buildings.entries()) {
    if (!b.landmark) continue;
    const box = boxes[i];
    k.within(place(box.x, box.z, box.angle), () => {
      for (const side of [-1, 1]) {
        const n = Math.floor((box.hw * 2) / 1.4);
        for (let j = 0; j < n; j++) {
          const x = -box.hw + (j + 0.5) * ((box.hw * 2) / n);
          if (Math.abs(x) < 3) continue;
          k.ico(0.75, C.hedge, { p: [x, 0.55, side * (box.hd + 1.1)], s: [1.1, 0.8, 1], jitter: 0.08 });
        }
      }
    });
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

/** The car: a small hatchback in cardinal red, nose along +z, with wheels that turn and steer. */
export function carModel(color = '#b5283a'): { car: Group; wheels: Group[]; front: Group[]; tail: MeshBasicMaterial } {
  const k = new Kit(7);
  k.rbox(2, 0.62, 3.9, 0.24, color, { p: [0, 0.72, 0] });
  k.rbox(1.72, 0.66, 2.1, 0.28, color, { p: [0, 1.38, -0.3] });
  k.box(1.56, 0.5, 0.06, '#9fc7d6', { p: [0, 1.42, 0.78], r: [-0.55, 0, 0], jitter: 0 });
  k.box(1.56, 0.44, 0.06, '#9fc7d6', { p: [0, 1.42, -1.38], r: [0.45, 0, 0], jitter: 0 });
  for (const side of [-1, 1]) {
    k.box(0.06, 0.42, 1.8, '#9fc7d6', { p: [side * 0.87, 1.44, -0.3], jitter: 0 });
    k.box(0.06, 0.08, 3.4, '#2c2b33', { p: [side * 1.01, 0.62, 0] });
    k.box(0.12, 0.12, 0.26, color, { p: [side * 0.95, 1.18, 0.5] });
  }
  k.box(1.96, 0.24, 0.16, '#3a3632', { p: [0, 0.45, 1.96] });
  k.box(1.96, 0.24, 0.16, '#3a3632', { p: [0, 0.45, -1.96] });
  k.box(1.1, 0.16, 0.06, '#2c2b33', { p: [0, 0.8, 1.96] });
  k.box(1.5, 0.06, 0.9, '#2c2b33', { p: [0, 1.73, -0.3] });
  const car = k.build();
  const head = new MeshBasicMaterial({ color: new Color('#fff4d6').multiplyScalar(2.2) });
  const tail = new MeshBasicMaterial({ color: new Color('#e5484d') });
  for (const x of [-0.72, 0.72]) {
    const h = new Mesh(new PlaneGeometry(0.42, 0.2), head);
    h.position.set(x, 0.82, 1.975);
    const t = new Mesh(new PlaneGeometry(0.42, 0.2), tail);
    t.position.set(x, 0.82, -1.975);
    t.rotation.y = Math.PI;
    car.add(h, t);
  }
  const wheels: Group[] = [];
  const front: Group[] = [];
  for (const x of [-0.95, 0.95]) {
    for (const z of [-1.25, 1.25]) {
      const wk = new Kit(9);
      wk.cyl(0.42, 0.42, 0.32, '#2c2b33', { r: [0, 0, Math.PI / 2] }, 14);
      wk.cyl(0.22, 0.22, 0.34, '#c9c3b8', { r: [0, 0, Math.PI / 2] }, 8);
      wk.box(0.35, 0.08, 0.36, '#9a948a', {});
      const spin = wk.build();
      const hub = new Group();
      hub.position.set(x, 0.42, z);
      hub.add(spin);
      car.add(hub);
      wheels.push(spin);
      if (z > 0) front.push(hub);
    }
  }
  return { car, wheels, front, tail };
}

export type CampusScene = {
  scene: Scene;
  sun: DirectionalLight;
  gates: GateMesh[];
  car: Group;
  wheels: Group[];
  front: Group[];
  /** The tail lights: brighter when you brake. */
  tail: MeshBasicMaterial;
  dispose(): void;
};

export function buildScene(color: string, renderer: WebGLRenderer, shadowSize = 2048): CampusScene {
  const scene = new Scene();
  scene.background = new Color('#cfe0e6');
  scene.fog = new Fog('#e2ddd0', 150, 460);
  // Soft light from a bright room all round, for gentle shading on every face.
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  scene.add(new HemisphereLight('#dfeef4', '#9c8a66', 1.0));
  // A late-afternoon sun: low and warm, for long shadows across the lawns.
  const sun = new DirectionalLight('#ffe2b8', 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  scene.add(sky());
  scene.add(ground());
  const flat = new Kit(3);
  streets(flat);
  field(flat);
  scene.add(flat.build({ castShadow: false, receiveShadow: true }));

  const kb = new Kit(11);
  campus(kb);
  scene.add(kb.build());
  const kt = new Kit(13);
  trees(kt);
  furniture(kt);
  // Lamp globes brighter than white, so the bloom catches them.
  const glow = new MeshBasicMaterial({ vertexColors: true, color: new Color(2.4, 2.2, 1.9) });
  scene.add(kt.build({ glowMaterial: glow }));
  scene.add(clouds());

  const gm = gateMeshes(color);
  for (const g of gm) scene.add(g.group);

  const { car, wheels, front, tail } = carModel(color);
  scene.add(car);
  return { scene, sun, gates: gm, car, wheels, front, tail, dispose: () => env.dispose() };
}
