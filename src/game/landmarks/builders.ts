// One builder per landmark. Each returns a Group modelled around its own
// origin (ground level, front facing +z), the part that should squash and
// bounce, and an optional per-frame update for its idle animation.

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { Kit, litMaterial } from '../world/kit';
import type { Puffs } from '../world/particles';
import { PIER } from '../world/shape';
import { Spring } from '../util/math';

export interface LandmarkCtx {
  t: number;
  dt: number;
  near: boolean;
  hover: boolean;
  puffs: Puffs;
  /** Convert a local point of this landmark to world space. */
  toWorld: (v: Vector3) => Vector3;
}

export interface Built {
  group: Group;
  bouncy: Object3D;
  update?: (ctx: LandmarkCtx) => void;
  /** Called once when the explorer comes within range. */
  onNear?: () => string | void;
}

const WOOD = '#b98352';
const WOOD_LIGHT = '#d6a86f';
const WOOD_DARK = '#7d5134';
const STONE = '#bcb5a9';
const STONE_DARK = '#a1998e';
const CREAM = '#fff3df';
const TRIM = '#fffaf2';
const GLOW = '#ffd27a';

function glowMat(color = '#ffffff') {
  return new MeshBasicMaterial({ vertexColors: true, color, toneMapped: false });
}

/** Shades a hex color lighter (+) or darker (-) in HSL lightness. */
function shade(hex: string, dl: number) {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, 'srgb');
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + dl)), 'srgb');
  return '#' + c.getHexString('srgb');
}

function windowAt(k: Kit, x: number, y: number, z: number, opts: { w?: number; h?: number; ry?: number; glow?: string; frame?: string } = {}) {
  const w = opts.w ?? 0.7;
  const h = opts.h ?? 0.62;
  const ry = opts.ry ?? 0;
  const frame = opts.frame ?? TRIM;
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  k.rbox(w + 0.18, h + 0.18, 0.1, 0.04, frame, { p: [x, y, z], r: [0, ry, 0] });
  k.addGlow(new BoxGeometry(w, h, 0.06), opts.glow ?? GLOW, { p: [x + nx * 0.04, y, z + nz * 0.04], r: [0, ry, 0] });
  // mullions
  k.box(0.05, h, 0.04, frame, { p: [x + nx * 0.09, y, z + nz * 0.09], r: [0, ry, 0] });
  k.box(w, 0.05, 0.04, frame, { p: [x + nx * 0.09, y, z + nz * 0.09], r: [0, ry, 0] });
}

// ---------------------------------------------------------------- cabin

export function buildCabin(color: string): Built {
  const k = new Kit(101);
  const W = 4.2;
  const D = 3.4;
  k.rbox(W + 0.5, 0.36, D + 0.5, 0.08, STONE, { p: [0, 0.18, 0] });
  // Wall core, then logs on top for the silhouette.
  k.box(W - 0.1, 2.1, D - 0.1, '#9a6a42', { p: [0, 0.36 + 1.05, 0] });
  for (let i = 0; i < 6; i++) {
    const y = 0.55 + i * 0.36;
    const c = i % 2 ? WOOD : '#a8744a';
    k.cyl(0.19, 0.19, W + 0.5, c, { p: [0, y, D / 2], r: [0, 0, Math.PI / 2] }, 8);
    k.cyl(0.19, 0.19, W + 0.5, c, { p: [0, y, -D / 2], r: [0, 0, Math.PI / 2] }, 8);
    k.cyl(0.18, 0.18, D + 0.5, c, { p: [W / 2, y + 0.18, 0], r: [Math.PI / 2, 0, 0] }, 8);
    k.cyl(0.18, 0.18, D + 0.5, c, { p: [-W / 2, y + 0.18, 0], r: [Math.PI / 2, 0, 0] }, 8);
  }
  const top = 0.55 + 6 * 0.36 - 0.1;
  k.gable(W + 0.2, 1.55, D + 0.3, '#a8744a', { p: [0, top, 0] });
  k.roof(W + 0.2, 1.55, D + 1.1, top, color, { overhang: 0.5, thick: 0.24 });
  // Chimney
  k.rbox(0.8, 3.2, 0.8, 0.08, STONE, { p: [-1.25, 3.0, -0.8] });
  k.rbox(0.95, 0.24, 0.95, 0.06, STONE_DARK, { p: [-1.25, 4.6, -0.8] });
  // Door + windows on the front
  k.rbox(0.95, 1.55, 0.14, 0.06, '#6b4228', { p: [0, 0.36 + 0.78, D / 2 + 0.2] });
  k.sphere(0.06, '#f2c14e', { p: [0.3, 1.1, D / 2 + 0.3] }, 6, 4);
  windowAt(k, -1.35, 1.5, D / 2 + 0.22, { glow: '#ffcf70' });
  windowAt(k, 1.35, 1.5, D / 2 + 0.22, { glow: '#ffcf70' });
  windowAt(k, W / 2 + 0.22, 1.5, 0, { ry: Math.PI / 2, glow: '#ffcf70' });
  windowAt(k, -W / 2 - 0.22, 1.5, 0.5, { ry: -Math.PI / 2, glow: '#ffcf70' });
  // Flower boxes
  for (const x of [-1.35, 1.35]) {
    k.box(0.9, 0.2, 0.25, WOOD_DARK, { p: [x, 1.08, D / 2 + 0.36] });
    for (let i = 0; i < 4; i++) k.ico(0.1, i % 2 ? '#ff7b9c' : '#ffd166', { p: [x - 0.3 + i * 0.2, 1.24, D / 2 + 0.38] });
  }
  // Porch with table and journal
  k.box(W + 0.5, 0.16, 1.5, WOOD_LIGHT, { p: [0, 0.4, D / 2 + 0.95] });
  for (let i = 0; i < 6; i++) k.box(0.04, 0.17, 1.5, '#c08f5a', { p: [-2.1 + i * 0.84, 0.41, D / 2 + 0.95] });
  for (const x of [-(W / 2 + 0.1), W / 2 + 0.1]) {
    k.cyl(0.08, 0.08, 1.0, WOOD_DARK, { p: [x, 0.95, D / 2 + 1.6] }, 6);
    k.box(0.08, 0.08, 1.4, WOOD, { p: [x, 1.3, D / 2 + 0.95] });
  }
  // Table
  k.cyl(0.42, 0.42, 0.07, WOOD, { p: [1.45, 1.05, D / 2 + 1.0] }, 12);
  k.cyl(0.06, 0.08, 0.6, WOOD_DARK, { p: [1.45, 0.75, D / 2 + 1.0] }, 6);
  // Journal: cover in the project color, cream pages, an orange band and a pencil.
  k.rbox(0.42, 0.07, 0.3, 0.02, color, { p: [1.42, 1.13, D / 2 + 1.0], r: [0, 0.35, 0] });
  k.box(0.38, 0.05, 0.27, '#fff7e6', { p: [1.43, 1.16, D / 2 + 1.0], r: [0, 0.35, 0], jitter: 0 });
  k.box(0.05, 0.09, 0.31, '#ff5a36', { p: [1.52, 1.14, D / 2 + 0.97], r: [0, 0.35, 0], jitter: 0 });
  k.cyl(0.02, 0.02, 0.32, '#ffbe0b', { p: [1.3, 1.17, D / 2 + 1.12], r: [Math.PI / 2, 0, 1.1] }, 6);
  k.cyl(0.13, 0.11, 0.12, '#ffffff', { p: [1.7, 1.15, D / 2 + 1.2] }, 8);
  // Chair
  k.rbox(0.5, 0.08, 0.5, 0.03, WOOD, { p: [0.75, 0.82, D / 2 + 1.05] });
  k.rbox(0.5, 0.55, 0.08, 0.03, WOOD, { p: [0.75, 1.1, D / 2 + 0.82] });
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.box(0.06, 0.36, 0.06, WOOD_DARK, { p: [0.75 + dx, 0.62, D / 2 + 1.05 + dz] });
  // Lantern by the door
  k.box(0.05, 0.3, 0.05, '#3d3a36', { p: [-0.75, 2.05, D / 2 + 0.3] });
  k.addGlow(new SphereGeometry(0.13, 8, 6), '#ffd27a', { p: [-0.75, 1.85, D / 2 + 0.32] });
  // Firewood
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3 - r; c++) {
    k.cyl(0.16, 0.16, 0.9, c % 2 ? '#c99a62' : '#b98352', { p: [W / 2 + 0.55, 0.36 + 0.16 + r * 0.3, -0.9 + c * 0.33 + r * 0.16], r: [0, 0, Math.PI / 2] }, 7);
  }
  const glow = glowMat();
  const group = k.build({ glowMaterial: glow });
  const chimney = new Vector3(-1.25, 4.9, -0.8);
  let smoke = 0;
  const base = new Color('#ffffff');
  return {
    group,
    bouncy: group,
    update: (c) => {
      smoke -= c.dt;
      if (smoke <= 0) {
        smoke = 0.32;
        const w = c.toWorld(chimney.clone());
        c.puffs.spawn(w.x + (Math.random() - 0.5) * 0.15, w.y, w.z, {
          vy: 0.9 + Math.random() * 0.3, vx: 0.35, vz: 0.12,
          size: 0.22 + Math.random() * 0.08, life: 2.6, drag: 0.4, grow: 2.2, color: '#f6f2ee',
        });
      }
      // firelight flicker
      const f = 0.92 + 0.08 * Math.sin(c.t * 9.1) * Math.sin(c.t * 5.3 + 1);
      glow.color.copy(base).multiplyScalar(f);
    },
  };
}

// ---------------------------------------------------------------- taproom

export function buildTaproom(color: string): Built {
  const k = new Kit(202);
  const W = 4.6;
  const D = 3.4;
  k.rbox(W + 0.3, 1.15, D + 0.3, 0.1, STONE, { p: [0, 0.58, 0] });
  k.rbox(W, 1.6, D, 0.06, CREAM, { p: [0, 1.15 + 0.8, 0] });
  // Timber frame on the front
  const fz = D / 2 + 0.04;
  for (const x of [-2.2, -0.75, 0.75, 2.2]) k.box(0.16, 1.6, 0.08, '#6e4a30', { p: [x, 1.95, fz] });
  k.box(W, 0.16, 0.08, '#6e4a30', { p: [0, 1.2, fz] });
  k.box(W, 0.16, 0.08, '#6e4a30', { p: [0, 2.7, fz] });
  k.box(0.12, 1.2, 0.07, '#6e4a30', { p: [-1.5, 1.95, fz], r: [0, 0, 0.75] });
  k.box(0.12, 1.2, 0.07, '#6e4a30', { p: [1.5, 1.95, fz], r: [0, 0, -0.75] });
  // Roof: ridge runs side to side so the slope faces the front.
  const roofG = new Group();
  const rk = new Kit(203);
  rk.gable(D + 0.1, 1.3, W, CREAM, { p: [0, 2.75, 0] });
  rk.roof(D + 0.1, 1.3, W + 0.7, 2.75, color, { overhang: 0.55, thick: 0.24 });
  rk.rbox(0.55, 0.9, 0.55, 0.06, STONE_DARK, { p: [0.9, 3.85, 1.4] });
  const roof = rk.build();
  roof.rotation.y = Math.PI / 2;
  roofG.add(roof);
  // Door (arched) and windows
  k.rbox(1.0, 1.3, 0.14, 0.05, '#6b3f22', { p: [0, 0.65 + 0.15, D / 2 + 0.2] });
  k.cyl(0.5, 0.5, 0.14, '#6b3f22', { p: [0, 1.45, D / 2 + 0.2], r: [Math.PI / 2, 0, 0] }, 12);
  k.sphere(0.06, '#f2c14e', { p: [0.3, 0.9, D / 2 + 0.3] }, 6, 4);
  windowAt(k, -1.5, 0.75, D / 2 + 0.18, { w: 0.8, h: 0.5, glow: '#ffbf5e' });
  windowAt(k, 1.5, 0.75, D / 2 + 0.18, { w: 0.8, h: 0.5, glow: '#ffbf5e' });
  windowAt(k, -1.5, 1.95, D / 2 + 0.12, { w: 0.55, h: 0.55, glow: '#ffd58a', frame: '#6e4a30' });
  windowAt(k, 1.5, 1.95, D / 2 + 0.12, { w: 0.55, h: 0.55, glow: '#ffd58a', frame: '#6e4a30' });
  windowAt(k, W / 2 + 0.18, 1.0, 0, { w: 0.8, h: 0.5, ry: Math.PI / 2, glow: '#ffbf5e' });
  // Barrels
  const barrel = (x: number, y: number, z: number, lying = false) => {
    const pts: [number, number][] = [[0, 0], [0.3, 0], [0.36, 0.2], [0.39, 0.42], [0.36, 0.64], [0.3, 0.84], [0, 0.84]];
    const r: [number, number, number] = lying ? [0, 0, Math.PI / 2] : [0, 0, 0];
    const p: [number, number, number] = lying ? [x + 0.42, y, z] : [x, y, z];
    k.lathe(pts, '#b8743f', { p, r }, 12);
    for (const hy of [0.16, 0.68]) {
      const bp: [number, number, number] = lying ? [x + 0.42 - hy, y, z] : [x, y + hy, z];
      k.torus(0.37, 0.03, '#5d5650', { p: bp, r: lying ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0] }, 4, 14);
    }
  };
  barrel(W / 2 + 0.6, 0, 0.4);
  barrel(W / 2 + 0.6, 0, -0.45);
  barrel(W / 2 + 0.6, 0.86, 0);
  barrel(-W / 2 - 0.65, 0.38, 1.0, true);
  // Barrel table + stools + mugs out front
  barrel(-1.7, 0, D / 2 + 1.5);
  k.cyl(0.48, 0.48, 0.08, WOOD_DARK, { p: [-1.7, 0.88, D / 2 + 1.5] }, 12);
  for (const [x, z] of [[-2.45, D / 2 + 1.7], [-1.0, D / 2 + 1.9]]) {
    k.cyl(0.24, 0.24, 0.08, WOOD, { p: [x, 0.5, z] }, 10);
    k.cyl(0.05, 0.05, 0.46, WOOD_DARK, { p: [x, 0.25, z] }, 5);
  }
  for (const [x, z] of [[-1.85, D / 2 + 1.45], [-1.5, D / 2 + 1.6]]) {
    k.cyl(0.1, 0.09, 0.24, color, { p: [x, 1.04, z] }, 8);
    k.ico(0.11, '#fffaf0', { p: [x, 1.18, z], s: [1, 0.6, 1] });
  }
  // Light poles
  const poles: [number, number, number][] = [[-W / 2 - 0.4, 2.7, D / 2 + 2.3], [W / 2 + 0.4, 2.7, D / 2 + 2.3]];
  for (const [x, , z] of poles) k.cyl(0.07, 0.09, 2.75, WOOD_DARK, { p: [x, 1.37, z] }, 6);
  // Sign bracket
  k.box(0.1, 0.1, 1.0, '#3d3a36', { p: [W / 2 - 0.6, 2.45, D / 2 + 0.5] });
  const group = k.build({ glowMaterial: glowMat() });
  group.add(roofG);

  // Swinging sign
  const sign = new Group();
  sign.position.set(W / 2 - 0.6, 2.42, D / 2 + 0.9);
  const sk = new Kit(204);
  sk.box(0.03, 0.18, 0.03, '#3d3a36', { p: [0, -0.1, 0] });
  sk.rbox(0.12, 0.8, 0.68, 0.04, WOOD_DARK, { p: [0, -0.6, 0] });
  sk.rbox(0.14, 0.66, 0.54, 0.04, color, { p: [0, -0.6, 0] });
  for (const side of [-1, 1]) {
    sk.rbox(0.05, 0.3, 0.2, 0.03, '#fff3d6', { p: [side * 0.09, -0.66, -0.02] });
    sk.ico(0.1, '#ffffff', { p: [side * 0.09, -0.48, -0.02], s: [0.5, 0.7, 1.2] });
    sk.torus(0.07, 0.025, '#fff3d6', { p: [side * 0.09, -0.66, 0.12], r: [0, Math.PI / 2, 0] }, 4, 10);
  }
  const signMesh = sk.build();
  sign.add(signMesh);
  group.add(sign);

  // String lights: a sagging wire between the poles and the facade.
  const wireK = new Kit(205);
  const bulbs: Vector3[] = [];
  const span = (a: Vector3, b: Vector3, sag: number, n: number) => {
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const len = prev.distanceTo(p);
      const dir = p.clone().sub(prev).normalize();
      const g = new CylinderGeometry(0.015, 0.015, len, 3);
      const o = new Object3D();
      o.position.copy(mid);
      o.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      o.updateMatrix();
      g.applyMatrix4(o.matrix);
      wireK.add(g, '#3d3a36', { jitter: 0 });
      if (i < n) bulbs.push(p.clone().add(new Vector3(0, -0.07, 0)));
      prev = p;
    }
  };
  const pl = new Vector3(...poles[0]);
  const pr = new Vector3(...poles[1]);
  span(pl, pr, 0.55, 12);
  span(pl, new Vector3(-W / 2 + 0.1, 2.72, D / 2 + 0.1), 0.35, 6);
  span(pr, new Vector3(W / 2 - 0.1, 2.72, D / 2 + 0.1), 0.35, 6);
  group.add(wireK.build({ castShadow: false }));
  const bulbMat = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const bulbMesh = new InstancedMesh(new IcosahedronGeometry(0.075, 0), bulbMat, bulbs.length);
  const o = new Object3D();
  bulbs.forEach((b, i) => {
    o.position.copy(b);
    o.updateMatrix();
    bulbMesh.setMatrixAt(i, o.matrix);
  });
  const palette = ['#fff1b8', '#ffd166', '#ff9f6b', '#fff8e0', '#ffc2d1'].map((c) => new Color(c));
  const tmp = new Color();
  bulbs.forEach((_, i) => bulbMesh.setColorAt(i, palette[i % palette.length]));
  group.add(bulbMesh);

  const swing = new Spring(0, 40, 2.2);
  let wasHover = false;
  return {
    group,
    bouncy: group,
    update: (c) => {
      if (c.hover && !wasHover) swing.kick(2.5);
      wasHover = c.hover;
      swing.update(c.dt);
      sign.rotation.x = 0.08 * Math.sin(c.t * 1.4) + swing.value * 0.25;
      for (let i = 0; i < bulbs.length; i++) {
        const tw = 0.75 + 0.25 * Math.sin(c.t * 2.2 + i * 1.7);
        bulbMesh.setColorAt(i, tmp.copy(palette[i % palette.length]).multiplyScalar(tw));
      }
      if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- ancient tree

export function buildTree(color: string): Built {
  const k = new Kit(303);
  const bark = ['#8b5e3c', '#7a5133', '#946644'];
  k.cyl(1.25, 1.75, 1.2, bark[0], { p: [0, 0.6, 0] }, 9);
  k.cyl(1.0, 1.25, 2.2, bark[1], { p: [0.05, 2.3, 0], r: [0, 0.3, 0.03] }, 9);
  k.cyl(0.85, 1.0, 2.0, bark[2], { p: [0.12, 4.3, 0.02], r: [0, 0.6, 0.05] }, 9);
  // Roots
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    k.add(new ConeGeometry(0.42, 2.4, 6), bark[i % 3], {
      p: [Math.cos(a) * 1.55, 0.25, Math.sin(a) * 1.55],
      r: [0, -a, Math.PI / 2 - 0.2],
      s: [1, 1, 0.75],
    });
  }
  // Branches
  const branch = (x: number, y: number, z: number, rz: number, rx: number, len: number) =>
    k.cyl(0.18, 0.42, len, bark[1], { p: [x, y, z], r: [rx, 0, rz] }, 7);
  branch(1.3, 5.6, 0.2, -0.85, 0.1, 2.6);
  branch(-1.2, 5.5, -0.2, 0.9, -0.1, 2.4);
  branch(0.2, 5.6, -1.1, 0.1, -0.8, 2.2);
  branch(0.3, 5.5, 1.2, -0.1, 0.8, 2.0);
  // Little round door
  k.cyl(0.42, 0.42, 0.16, '#5d3a22', { p: [0, 0.75, 1.42], r: [Math.PI / 2 - 0.12, 0, 0] }, 14);
  k.torus(0.44, 0.06, '#c9a46a', { p: [0, 0.75, 1.44], r: [-0.12, 0, 0] }, 4, 14);
  k.sphere(0.05, '#f2c14e', { p: [0.2, 0.72, 1.55] }, 6, 4);
  k.rbox(0.9, 0.12, 0.45, 0.04, STONE, { p: [0, 0.06, 1.75] });
  // Mushrooms
  for (const [x, z, s] of [[1.8, 1.2, 1], [2.2, 0.6, 0.7], [-1.9, 1.3, 0.85], [-1.5, 1.8, 0.6]]) {
    k.cyl(0.07 * s, 0.09 * s, 0.3 * s, '#fff3df', { p: [x, 0.15 * s, z] }, 6);
    k.sphere(0.2 * s, '#e5484d', { p: [x, 0.3 * s, z], s: [1, 0.6, 1] }, 8, 5);
    k.ico(0.04 * s, '#ffffff', { p: [x + 0.08 * s, 0.4 * s, z + 0.05 * s] });
  }
  const trunk = k.build();

  // Canopy (its own group so it can breathe)
  const canopy = new Group();
  const ck = new Kit(304);
  const g1 = shade(color, -0.12);
  const g2 = color;
  const g3 = shade(color, 0.08);
  const g4 = shade(color, 0.16);
  ck.add(new IcosahedronGeometry(3.3, 1), g2, { p: [0, 7.3, 0], s: [1.15, 0.72, 1.05] });
  ck.add(new IcosahedronGeometry(2.3, 1), g1, { p: [2.7, 6.5, 0.6], s: [1, 0.75, 1] });
  ck.add(new IcosahedronGeometry(2.2, 1), g1, { p: [-2.6, 6.6, -0.4], s: [1, 0.75, 1] });
  ck.add(new IcosahedronGeometry(2.0, 1), g3, { p: [0.4, 6.6, 2.4], s: [1, 0.7, 1] });
  ck.add(new IcosahedronGeometry(2.0, 1), g1, { p: [-0.4, 6.8, -2.5], s: [1, 0.7, 1] });
  ck.add(new IcosahedronGeometry(2.3, 1), g3, { p: [0.3, 8.9, 0.1], s: [1.1, 0.75, 1.1] });
  ck.add(new IcosahedronGeometry(1.4, 1), g4, { p: [-0.6, 10.1, -0.2], s: [1, 0.8, 1] });
  ck.add(new IcosahedronGeometry(1.2, 1), g4, { p: [1.6, 9.2, 1.4] });
  // fruit-like blossoms
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4;
    const r = 2.6 + (i % 3) * 0.6;
    ck.ico(0.16, i % 2 ? '#ffd166' : '#ff8fab', { p: [Math.cos(a) * r, 6.4 + (i % 4) * 0.9, Math.sin(a) * r] });
  }
  canopy.add(ck.build());

  // Swing hanging from the right branch
  const swingG = new Group();
  swingG.position.set(2.35, 6.0, 0.9);
  const swk = new Kit(305);
  swk.cyl(0.02, 0.02, 3.6, '#e9dcc0', { p: [0, -1.8, -0.28] }, 4);
  swk.cyl(0.02, 0.02, 3.6, '#e9dcc0', { p: [0, -1.8, 0.28] }, 4);
  swk.rbox(0.42, 0.08, 0.74, 0.03, '#ff5a36', { p: [0, -3.6, 0] });
  swingG.add(swk.build());

  const group = new Group();
  group.add(trunk, canopy, swingG);

  // Floating motes around the canopy
  const N = 26;
  const motes = new InstancedMesh(new OctahedronGeometry(0.07, 0), new MeshBasicMaterial({ color: '#f9ffbf', toneMapped: false }), N);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: i * 2.39, r: 2.2 + (i % 5) * 0.7, y: 2.2 + (i % 7) * 1.1, s: 0.3 + (i % 4) * 0.12 }));
  group.add(motes);
  const o = new Object3D();

  return {
    group,
    bouncy: group,
    update: (c) => {
      canopy.rotation.z = Math.sin(c.t * 0.7) * 0.012;
      canopy.rotation.x = Math.sin(c.t * 0.55 + 1) * 0.01;
      const sc = 1 + Math.sin(c.t * 1.1) * 0.008;
      canopy.scale.set(sc, 1 / sc, sc);
      swingG.rotation.z = Math.sin(c.t * 1.25) * 0.22;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        const a = s.a + c.t * s.s;
        o.position.set(Math.cos(a) * s.r, s.y + Math.sin(c.t * 1.3 + i) * 0.35, Math.sin(a) * s.r);
        o.rotation.set(c.t + i, c.t * 0.7, 0);
        o.scale.setScalar(0.7 + 0.5 * Math.sin(c.t * 3 + i * 1.3) ** 2);
        o.updateMatrix();
        motes.setMatrixAt(i, o.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- lighthouse

function beamMaterial() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#fff1b0') }, uOpacity: { value: 0.32 } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vT = position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float along = clamp(vT / 12.0 + 0.5, 0.0, 1.0); // 1 at the lamp, 0 far
        float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        gl_FragColor = vec4(uColor, uOpacity * pow(along, 2.2) * rim);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

export function buildLighthouse(color: string): Built {
  const k = new Kit(404);
  // Rocks
  const rocks: [number, number, number, number][] = [[1.6, 0.2, 1.2, 1.1], [-1.5, 0.1, 1.0, 1.0], [0.4, 0.1, -1.8, 1.3], [-1.3, 0.0, -1.2, 0.9], [1.9, 0.0, -0.6, 0.8], [0.2, -0.1, 2.0, 0.7]];
  for (const [x, y, z, s] of rocks) k.dodeca(s, STONE_DARK, { p: [x, y, z], r: [x, z, 0.4], s: [1.2, 0.75, 1.1], jitter: 0.06 });
  k.cyl(1.75, 1.95, 0.55, STONE, { p: [0, 0.3, 0] }, 16);
  // Striped tower
  const bands = 4;
  const H = 6.2;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = 1.3 - t0 * 0.42;
    const r1 = 1.3 - t1 * 0.42;
    k.cyl(r1, r0, H / bands, i % 2 ? color : '#fff6ec', { p: [0, 0.55 + (t0 + t1) / 2 * H, 0], jitter: 0.015 }, 18);
  }
  // Door and little windows
  k.rbox(0.7, 1.15, 0.2, 0.08, '#5d3a22', { p: [0, 1.15, 1.22] });
  k.cyl(0.35, 0.35, 0.2, '#5d3a22', { p: [0, 1.72, 1.22], r: [Math.PI / 2, 0, 0] }, 10);
  for (const y of [3.2, 4.8]) {
    const r = 1.3 - ((y - 0.55) / H) * 0.42;
    k.rbox(0.36, 0.5, 0.12, 0.05, '#3a4a66', { p: [0, y, r + 0.02] });
  }
  // Gallery
  const gy = 0.55 + H;
  k.cyl(1.25, 1.0, 0.24, '#3d3a36', { p: [0, gy + 0.12, 0] }, 18);
  k.torus(1.15, 0.045, '#3d3a36', { p: [0, gy + 0.62, 0], r: [Math.PI / 2, 0, 0] }, 4, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.cyl(0.03, 0.03, 0.5, '#3d3a36', { p: [Math.cos(a) * 1.15, gy + 0.37, Math.sin(a) * 1.15] }, 4);
  }
  // Lantern room
  k.addGlow(new CylinderGeometry(0.66, 0.66, 0.95, 10), '#fff3b8', { p: [0, gy + 0.72, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.box(0.07, 0.95, 0.07, '#3d3a36', { p: [Math.cos(a) * 0.68, gy + 0.72, Math.sin(a) * 0.68] });
  }
  k.cone(0.98, 0.85, color, { p: [0, gy + 1.62, 0] }, 12);
  k.sphere(0.13, '#3d3a36', { p: [0, gy + 2.1, 0] }, 8, 6);
  k.cyl(0.02, 0.02, 0.5, '#3d3a36', { p: [0, gy + 2.35, 0] }, 4);
  const group = k.build({ glowMaterial: glowMat() });

  // The beam: two soft cones sweeping round.
  const beam = new Group();
  beam.position.set(0, gy + 0.72, 0);
  const bm = beamMaterial();
  for (const side of [1, -1]) {
    const cone = new Mesh(new CylinderGeometry(0.25, 2.6, 12, 18, 1, true), bm);
    cone.position.x = side * 6;
    cone.rotation.z = (side * Math.PI) / 2;
    cone.renderOrder = 3;
    beam.add(cone);
  }
  group.add(beam);
  // Weather vane
  const vane = new Group();
  vane.position.set(0, gy + 2.55, 0);
  const vk = new Kit(405);
  vk.box(0.7, 0.03, 0.03, '#3d3a36', {});
  vk.add(new ConeGeometry(0.08, 0.2, 4), '#3d3a36', { p: [0.38, 0, 0], r: [0, 0, -Math.PI / 2] });
  vk.box(0.02, 0.18, 0.2, '#3d3a36', { p: [-0.33, 0, 0] });
  vane.add(vk.build({ castShadow: false }));
  group.add(vane);

  return {
    group,
    bouncy: group,
    update: (c) => {
      beam.rotation.y = c.t * 0.9;
      vane.rotation.y = Math.sin(c.t * 0.4) * 0.6 + 0.4;
    },
  };
}

// ---------------------------------------------------------------- schoolhouse

export function buildSchoolhouse(color: string): Built {
  const k = new Kit(505);
  const W = 4.0;
  const D = 3.4;
  k.rbox(W + 0.4, 0.36, D + 0.4, 0.08, STONE, { p: [0, 0.18, 0] });
  k.rbox(W, 2.3, D, 0.05, CREAM, { p: [0, 0.36 + 1.15, 0] });
  // Clapboard lines
  for (let i = 1; i < 7; i++) {
    k.box(W + 0.02, 0.03, D + 0.02, '#f1e2c8', { p: [0, 0.36 + i * 0.33, 0], jitter: 0 });
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) k.box(0.16, 2.3, 0.16, TRIM, { p: [x, 1.51, z] });
  const top = 0.36 + 2.3;
  k.gable(W, 1.5, D, CREAM, { p: [0, top, 0] });
  k.roof(W, 1.5, D + 0.6, top, color, { overhang: 0.45, thick: 0.22 });
  // Round attic window
  k.cyl(0.32, 0.32, 0.08, TRIM, { p: [0, top + 0.6, D / 2 + 0.02], r: [Math.PI / 2, 0, 0] }, 14);
  k.addGlow(new CylinderGeometry(0.24, 0.24, 0.06, 14), '#cfeaff', { p: [0, top + 0.6, D / 2 + 0.05], r: [Math.PI / 2, 0, 0] });
  // Doors, steps, windows
  k.rbox(1.15, 1.6, 0.14, 0.04, shade(color, -0.12), { p: [0, 0.36 + 0.8, D / 2 + 0.04] });
  k.box(0.04, 1.5, 0.05, TRIM, { p: [0, 1.16, D / 2 + 0.12] });
  k.sphere(0.05, '#f2c14e', { p: [-0.15, 1.15, D / 2 + 0.14] }, 6, 4);
  k.sphere(0.05, '#f2c14e', { p: [0.15, 1.15, D / 2 + 0.14] }, 6, 4);
  k.rbox(1.6, 0.18, 0.5, 0.04, STONE, { p: [0, 0.27, D / 2 + 0.45] });
  k.rbox(1.4, 0.18, 0.4, 0.04, STONE_DARK, { p: [0, 0.1, D / 2 + 0.8] });
  windowAt(k, -1.35, 1.6, D / 2 + 0.06, { w: 0.62, h: 0.8, glow: '#cfeaff' });
  windowAt(k, 1.35, 1.6, D / 2 + 0.06, { w: 0.62, h: 0.8, glow: '#cfeaff' });
  for (const z of [-0.8, 0.8]) {
    windowAt(k, W / 2 + 0.06, 1.6, z, { w: 0.62, h: 0.8, ry: Math.PI / 2, glow: '#cfeaff' });
    windowAt(k, -W / 2 - 0.06, 1.6, z, { w: 0.62, h: 0.8, ry: -Math.PI / 2, glow: '#cfeaff' });
  }
  // An apple on the step
  k.sphere(0.12, '#e5484d', { p: [0.55, 0.47, D / 2 + 0.42] }, 8, 6);
  k.box(0.02, 0.08, 0.02, WOOD_DARK, { p: [0.55, 0.61, D / 2 + 0.42] });
  k.ico(0.05, '#5aae4f', { p: [0.6, 0.62, D / 2 + 0.42], s: [1, 0.4, 0.6] });
  // Chalkboard A-frame
  for (const s of [-1, 1]) {
    k.rbox(0.72, 0.9, 0.06, 0.02, WOOD, { p: [1.6, 0.5, D / 2 + 1.2 + s * 0.14], r: [s * 0.28, 0, 0] });
    k.box(0.6, 0.72, 0.03, '#2f5a46', { p: [1.6, 0.52, D / 2 + 1.2 + s * 0.18], r: [s * 0.28, 0, 0], jitter: 0 });
  }
  k.box(0.32, 0.04, 0.02, '#ffffff', { p: [1.55, 0.7, D / 2 + 1.38], r: [0.28, 0, 0.1], jitter: 0 });
  k.box(0.22, 0.04, 0.02, '#ffffff', { p: [1.6, 0.55, D / 2 + 1.42], r: [0.28, 0, -0.08], jitter: 0 });
  k.box(0.28, 0.04, 0.02, '#ffd166', { p: [1.58, 0.4, D / 2 + 1.46], r: [0.28, 0, 0.05], jitter: 0 });

  // Bell tower on the front of the ridge
  const ty = top + 1.25;
  const tz = D / 2 - 0.55;
  k.rbox(0.95, 0.7, 0.95, 0.05, CREAM, { p: [0, ty + 0.1, tz] });
  for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) k.box(0.1, 0.85, 0.1, TRIM, { p: [x, ty + 0.85, tz + z] });
  k.rbox(1.1, 0.12, 1.1, 0.04, TRIM, { p: [0, ty + 1.32, tz] });
  k.add(new ConeGeometry(0.85, 0.85, 4), color, { p: [0, ty + 1.8, tz], r: [0, Math.PI / 4, 0] });
  k.sphere(0.08, '#f2c14e', { p: [0, ty + 2.27, tz] }, 6, 4);
  // Flagpole
  k.cyl(0.04, 0.05, 4.4, '#f4f1ea', { p: [W / 2 + 0.9, 2.2, D / 2 + 0.3] }, 6);
  k.sphere(0.08, '#f2c14e', { p: [W / 2 + 0.9, 4.45, D / 2 + 0.3] }, 6, 4);
  k.rbox(0.4, 0.2, 0.4, 0.05, STONE, { p: [W / 2 + 0.9, 0.1, D / 2 + 0.3] });

  const group = k.build({ glowMaterial: glowMat() });

  const bell = new Group();
  bell.position.set(0, ty + 1.24, tz);
  const bk = new Kit(506);
  const pts = [new Vector2(0, -0.5), new Vector2(0.34, -0.52), new Vector2(0.3, -0.42), new Vector2(0.24, -0.2), new Vector2(0.18, -0.05), new Vector2(0, 0)];
  bk.add(new LatheGeometry(pts, 12), '#f2c14e', {});
  bk.sphere(0.08, '#b8862a', { p: [0, -0.5, 0] }, 6, 4);
  bk.box(0.12, 0.08, 0.12, '#3d3a36', { p: [0, 0.02, 0] });
  bell.add(bk.build());
  group.add(bell);

  const flag = new Group();
  flag.position.set(W / 2 + 0.9, 4.15, D / 2 + 0.3);
  const fk = new Kit(507);
  fk.add(new ConeGeometry(0.28, 1.1, 3), color, { p: [0.55, 0, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.12], jitter: 0 });
  flag.add(fk.build({ castShadow: true }));
  group.add(flag);

  const swing = new Spring(0, 30, 1.6);
  return {
    group,
    bouncy: group,
    onNear: () => {
      swing.kick(4.5);
      return 'bell';
    },
    update: (c) => {
      if (c.hover && Math.abs(swing.vel) < 0.2 && Math.abs(swing.value) < 0.02) swing.kick(1.2);
      swing.update(c.dt);
      bell.rotation.x = swing.value * 0.35;
      flag.rotation.y = Math.sin(c.t * 2.4) * 0.25 - 0.2;
      flag.scale.y = 1 + Math.sin(c.t * 4.2) * 0.06;
    },
  };
}

// ---------------------------------------------------------------- depot

export function buildDepot(color: string): Built {
  const k = new Kit(606);
  const W = 4.8;
  const D = 3.0;
  k.rbox(W + 0.6, 0.2, D + 1.6, 0.06, '#dcd5c8', { p: [0, 0.1, 0.5] });
  // Open-fronted shed
  k.rbox(W, 2.5, 0.22, 0.05, '#eef0e6', { p: [0, 1.35, -D / 2] });
  k.rbox(0.22, 2.5, D, 0.05, '#e3e8dc', { p: [-W / 2, 1.35, 0] });
  k.rbox(0.22, 2.5, D, 0.05, '#e3e8dc', { p: [W / 2, 1.35, 0] });
  k.rbox(W + 0.6, 0.18, D + 0.9, 0.05, color, { p: [0, 2.68, 0.15], r: [0.1, 0, 0] });
  for (let i = 0; i < 9; i++) k.cyl(0.05, 0.05, D + 0.9, shade(color, -0.08), { p: [-W / 2 + 0.1 + i * 0.6, 2.8, 0.15], r: [Math.PI / 2 + 0.1, 0, 0] }, 4);
  // Recycling badge on the back wall: three chasing arrows
  k.cyl(0.62, 0.62, 0.06, color, { p: [0, 1.95, -D / 2 + 0.14], r: [Math.PI / 2, 0, 0] }, 20);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    k.box(0.36, 0.08, 0.03, '#ffffff', { p: [Math.cos(a) * 0.28, 1.95 + Math.sin(a) * 0.28, -D / 2 + 0.18], r: [0, 0, a + Math.PI / 2], jitter: 0 });
    k.add(new ConeGeometry(0.1, 0.16, 3), '#ffffff', {
      p: [Math.cos(a + 0.75) * 0.28, 1.95 + Math.sin(a + 0.75) * 0.28, -D / 2 + 0.18],
      r: [0, 0, a + 0.75 + Math.PI],
      s: [1, 1, 0.3],
      jitter: 0,
    });
  }
  // Colored bins along the back
  const bins = ['#3a86ff', color, '#ffbe0b', '#ff7a45'];
  bins.forEach((c, i) => {
    const x = -1.7 + i * 1.13;
    k.rbox(0.82, 1.0, 0.78, 0.08, c, { p: [x, 0.7, -0.75] });
    k.rbox(0.9, 0.12, 0.86, 0.05, shade(c, -0.1), { p: [x, 1.25, -0.8], r: [-0.12, 0, 0] });
    k.box(0.36, 0.3, 0.02, '#ffffff', { p: [x, 0.75, -0.35], jitter: 0 });
    k.sphere(0.07, '#3d3a36', { p: [x - 0.3, 0.2, -0.3] }, 6, 4);
    k.sphere(0.07, '#3d3a36', { p: [x + 0.3, 0.2, -0.3] }, 6, 4);
  });
  // Conveyor out front
  const cz = 1.45;
  for (const x of [-1.9, 1.5]) for (const z of [-0.32, 0.32]) k.box(0.1, 0.8, 0.1, '#6b7280', { p: [x, 0.6, cz + z] });
  k.rbox(3.6, 0.1, 0.12, 0.03, '#9aa1ab', { p: [-0.2, 1.05, cz - 0.36] });
  k.rbox(3.6, 0.1, 0.12, 0.03, '#9aa1ab', { p: [-0.2, 1.05, cz + 0.36] });
  k.rbox(3.5, 0.08, 0.62, 0.03, '#3d3a36', { p: [-0.2, 1.0, cz] });
  // Dumpster at the end of the belt
  k.rbox(1.25, 1.0, 1.1, 0.08, shade(color, -0.06), { p: [2.45, 0.7, cz] });
  k.rbox(1.3, 0.1, 0.6, 0.04, shade(color, -0.16), { p: [2.45, 1.3, cz - 0.6], r: [0.9, 0, 0] });
  // Crates
  k.rbox(0.6, 0.6, 0.6, 0.04, '#c8a172', { p: [-2.9, 0.5, 1.4], r: [0, 0.3, 0] });
  k.rbox(0.45, 0.45, 0.45, 0.04, '#d4b07e', { p: [-2.85, 1.02, 1.35], r: [0, -0.2, 0] });
  const group = k.build();

  // Rollers + moving items
  const rollers: Mesh[] = [];
  const rk = new Kit(607);
  rk.cyl(0.08, 0.08, 0.66, '#9aa1ab', { r: [Math.PI / 2, 0, 0] }, 8);
  const rollerGeo = rk.geometry();
  for (const x of [-1.95, 1.55]) {
    const m = new Mesh(rollerGeo, litMaterial());
    m.castShadow = true;
    m.position.set(x, 1.0, cz);
    rollers.push(m);
    group.add(m);
  }
  const items: Group[] = [];
  const kinds = [
    (q: Kit) => q.rbox(0.32, 0.26, 0.3, 0.03, '#c8a172', { p: [0, 0.13, 0] }),
    (q: Kit) => { q.cyl(0.09, 0.1, 0.34, '#7fd3b0', { p: [0, 0.17, 0] }, 8); q.cyl(0.04, 0.05, 0.1, '#7fd3b0', { p: [0, 0.38, 0] }, 6); },
    (q: Kit) => { q.cyl(0.09, 0.09, 0.24, '#e5484d', { p: [0, 0.12, 0] }, 10); q.cyl(0.09, 0.09, 0.03, '#d6d3cf', { p: [0, 0.255, 0] }, 10); },
    (q: Kit) => q.rbox(0.26, 0.3, 0.16, 0.03, '#fff3df', { p: [0, 0.15, 0] }),
  ];
  kinds.forEach((f, i) => {
    const q = new Kit(610 + i);
    f(q);
    const g = q.build();
    items.push(g);
    group.add(g);
  });
  const belt0 = -1.9;
  const belt1 = 1.5;
  const loop = 5.2;
  return {
    group,
    bouncy: group,
    update: (c) => {
      for (const r of rollers) r.rotation.z = -c.t * 3;
      items.forEach((it, i) => {
        const u = (c.t * 0.55 + i * (loop / items.length)) % loop;
        const x = belt0 + u;
        if (x < belt1) {
          it.position.set(x, 1.04, cz);
          it.rotation.set(0, i, 0);
          it.scale.setScalar(Math.min(1, u * 3));
        } else {
          const f = x - belt1; // falling into the dumpster
          const ft = f / (loop - (belt1 - belt0));
          it.position.set(belt1 + f * 0.9, 1.04 + f * 0.8 - f * f * 2.4, cz);
          it.rotation.set(f * 3, i, f * 2);
          it.scale.setScalar(Math.max(0, 1 - ft * 2.2));
        }
      });
    },
  };
}

// ---------------------------------------------------------------- pier

export function buildPier(color: string): Built {
  const L = PIER.end - PIER.start;
  const k = new Kit(707);
  const deckY = PIER.deck;
  for (let z = 0.4; z < L; z += 1.7) {
    for (const x of [-PIER.width / 2 + 0.08, PIER.width / 2 - 0.08]) k.cyl(0.12, 0.13, 3.0, WOOD_DARK, { p: [x, deckY - 1.5, z] }, 7);
  }
  let i = 0;
  for (let z = 0.1; z < L - 0.1; z += 0.38) {
    k.rbox(PIER.width, 0.1, 0.33, 0.02, i++ % 3 === 0 ? WOOD_LIGHT : WOOD, { p: [0, deckY - 0.05, z], r: [0, 0, (Math.random() - 0.5) * 0.03] });
  }
  for (const x of [-PIER.width / 2 - 0.02, PIER.width / 2 + 0.02]) k.box(0.1, 0.14, L, WOOD_DARK, { p: [x, deckY - 0.16, L / 2] });
  // Rope posts at the end
  for (const x of [-PIER.width / 2 + 0.05, PIER.width / 2 - 0.05]) {
    k.cyl(0.1, 0.1, 0.8, WOOD_DARK, { p: [x, deckY + 0.4, L - 0.15] }, 7);
    k.sphere(0.11, WOOD_DARK, { p: [x, deckY + 0.82, L - 0.15] }, 7, 5);
  }
  k.torus(0.09, 0.035, '#e9dcc0', { p: [PIER.width / 2 - 0.05, deckY + 0.6, L - 0.15], r: [Math.PI / 2, 0, 0] }, 4, 10);
  // Lantern post
  k.cyl(0.06, 0.07, 1.8, WOOD_DARK, { p: [-PIER.width / 2 + 0.05, deckY + 0.9, L - 3.6] }, 6);
  k.box(0.4, 0.05, 0.05, WOOD_DARK, { p: [-PIER.width / 2 + 0.2, deckY + 1.78, L - 3.6] });
  k.addGlow(new SphereGeometry(0.13, 8, 6), '#ffd27a', { p: [-PIER.width / 2 + 0.36, deckY + 1.6, L - 3.6] });
  const group = k.build({ glowMaterial: glowMat() });

  // Post box at the end of the pier (the part that bounces)
  const box = new Group();
  box.position.set(0, deckY, L - 1.1);
  const bk = new Kit(708);
  bk.box(0.14, 1.0, 0.14, WOOD_DARK, { p: [0, 0.5, 0] });
  bk.rbox(0.56, 0.42, 0.8, 0.06, color, { p: [0, 1.15, 0] });
  bk.cyl(0.28, 0.28, 0.8, color, { p: [0, 1.36, 0], r: [Math.PI / 2, 0, 0] }, 12);
  bk.rbox(0.5, 0.56, 0.06, 0.03, shade(color, -0.1), { p: [0, 1.27, -0.41] });
  bk.sphere(0.04, '#f2c14e', { p: [0, 1.4, -0.45] }, 6, 4);
  // A letter peeking out
  bk.box(0.32, 0.03, 0.22, '#fffaf0', { p: [0.05, 1.56, -0.45], r: [0.3, 0.2, 0] });
  box.add(bk.build());
  const flag = new Group();
  flag.position.set(0.3, 1.2, 0.15);
  const fk = new Kit(709);
  fk.box(0.04, 0.5, 0.06, '#ff5a36', { p: [0, 0.25, 0] });
  fk.box(0.04, 0.16, 0.24, '#ff5a36', { p: [0, 0.42, 0.1] });
  flag.add(fk.build());
  box.add(flag);
  group.add(box);

  // A little rowboat tied alongside
  const boat = new Group();
  boat.position.set(1.65, 0.05, L - 3.2);
  const rk = new Kit(710);
  rk.lathe([[0, -0.3], [0.38, -0.24], [0.5, 0.0], [0.52, 0.18], [0, 0.18]], '#fffaf0', { s: [1, 1, 2.4] }, 12);
  rk.torus(0.52, 0.06, color, { p: [0, 0.18, 0], r: [Math.PI / 2, 0, 0], s: [1, 2.4, 1] }, 4, 18);
  rk.box(0.8, 0.06, 0.24, WOOD, { p: [0, 0.1, 0.2] });
  rk.box(0.06, 0.06, 1.2, WOOD_LIGHT, { p: [0.25, 0.22, -0.1], r: [0, 0.2, 0.3] });
  boat.add(rk.build());
  group.add(boat);

  const flagS = new Spring(0, 90, 7);
  return {
    group,
    bouncy: box,
    update: (c) => {
      flagS.target = c.near || c.hover ? -Math.PI / 2 : 0;
      flagS.update(c.dt);
      flag.rotation.x = flagS.value;
      boat.position.y = 0.05 + Math.sin(c.t * 1.3) * 0.06;
      boat.rotation.z = Math.sin(c.t * 1.1) * 0.06;
      boat.rotation.x = Math.sin(c.t * 0.9 + 1) * 0.04;
    },
  };
}

// ---------------------------------------------------------------- bottle

export function buildBottle(color: string): Built {
  const group = new Group();
  const bottle = new Group();
  bottle.position.y = 0.2;
  bottle.rotation.set(0, 0, Math.PI / 2 - 0.12);
  const glass = new MeshStandardMaterial({ color: '#9fe3cf', transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0, flatShading: true });
  const pts = [[0, 0], [0.26, 0], [0.3, 0.05], [0.3, 0.72], [0.26, 0.84], [0.13, 0.98], [0.1, 1.22], [0.12, 1.27], [0.1, 1.3]].map(([x, y]) => new Vector2(x, y - 0.65));
  const glassMesh = new Mesh(new LatheGeometry(pts, 12), glass);
  glassMesh.castShadow = true;
  glassMesh.renderOrder = 2;
  const ik = new Kit(808);
  ik.cyl(0.13, 0.11, 0.62, '#fff3d6', { p: [0, -0.2, 0] }, 10);
  ik.torus(0.135, 0.03, color, { p: [0, -0.2, 0], r: [Math.PI / 2, 0, 0] }, 4, 12);
  ik.cyl(0.095, 0.085, 0.22, '#b5835a', { p: [0, 0.7, 0] }, 8);
  bottle.add(ik.build(), glassMesh);
  const holder = new Group();
  holder.add(bottle);
  group.add(holder);

  const k = new Kit(809);
  // Starfish and a few shells
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(new ConeGeometry(0.09, 0.32, 4), '#ff9f7a', { p: [-0.9 + Math.cos(a) * 0.14, 0.04, 0.7 + Math.sin(a) * 0.14], r: [Math.PI / 2, 0, -a + Math.PI / 2], s: [1, 1, 0.45] });
  }
  k.sphere(0.09, '#fff1e0', { p: [0.9, 0.03, 0.6], s: [1, 0.5, 1.2] }, 8, 5);
  k.sphere(0.07, '#ffd6e0', { p: [0.65, 0.03, 0.95], s: [1, 0.5, 1.2] }, 8, 5);
  group.add(k.build());

  // A glint that twinkles on the glass
  const glint = new Group();
  const gm = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const g1 = new Mesh(new OctahedronGeometry(0.16, 0), gm);
  g1.scale.set(0.18, 1, 0.18);
  const g2 = g1.clone();
  g2.rotation.z = Math.PI / 2;
  glint.add(g1, g2);
  glint.position.set(-0.15, 0.55, 0.15);
  group.add(glint);

  // Crab that scuttles about
  const crab = new Group();
  const ck = new Kit(810);
  ck.sphere(0.2, '#ff6b5b', { p: [0, 0.16, 0], s: [1.3, 0.6, 1] }, 10, 6);
  for (const s of [-1, 1]) {
    ck.cyl(0.02, 0.02, 0.16, '#ff6b5b', { p: [s * 0.08, 0.3, 0.12] }, 4);
    ck.sphere(0.05, '#ffffff', { p: [s * 0.08, 0.39, 0.12] }, 6, 4);
    ck.sphere(0.025, '#1d1a16', { p: [s * 0.08, 0.4, 0.165] }, 5, 4);
    ck.sphere(0.08, '#ff7a6b', { p: [s * 0.3, 0.16, 0.2], s: [1, 0.7, 1.2] }, 6, 4);
    for (let l = 0; l < 3; l++) ck.box(0.18, 0.03, 0.03, '#e5484d', { p: [s * 0.25, 0.08, -0.06 - l * 0.08], r: [0, 0, s * -0.5] });
  }
  crab.add(ck.build());
  crab.position.set(1.2, 0, -0.4);
  group.add(crab);

  return {
    group,
    bouncy: holder,
    update: (c) => {
      bottle.rotation.x = Math.sin(c.t * 1.6) * 0.12;
      bottle.position.y = 0.2 + Math.abs(Math.sin(c.t * 1.6)) * 0.02;
      const tw = Math.max(0, Math.sin(c.t * 2.3)) ** 6;
      glint.scale.setScalar(0.2 + tw * 1.1);
      glint.rotation.z = c.t * 0.8;
      const walk = Math.sin(c.t * 0.6);
      crab.position.x = 1.2 + walk * 0.7;
      crab.position.y = Math.abs(Math.sin(c.t * 14)) * 0.03;
      crab.rotation.y = Math.sin(c.t * 0.3) * 0.3;
    },
  };
}

export const BUILDERS = {
  cabin: buildCabin,
  taproom: buildTaproom,
  tree: buildTree,
  lighthouse: buildLighthouse,
  schoolhouse: buildSchoolhouse,
  depot: buildDepot,
  pier: buildPier,
  bottle: buildBottle,
} as const;
