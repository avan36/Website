// One builder per landmark. Each returns a Group modelled around its own
// origin (ground level, front facing +z), the part that should squash and
// bounce, and an optional per-frame update for its idle animation.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { Kit, litMaterial, type V3 } from '../world/kit';
import type { Puffs } from '../world/particles';
import { PIER } from '../world/shape';
import { damp, easeOutBack, Spring } from '../util/math';

export interface LandmarkCtx {
  t: number;
  dt: number;
  near: boolean;
  hover: boolean;
  puffs: Puffs;
  /** Convert a local point of this landmark to world space. */
  toWorld: (v: Vector3) => Vector3;
}

/** [x, y, z, size] in the landmark's own space. */
export type Glow = [number, number, number, number];

export interface Built {
  group: Group;
  bouncy: Object3D;
  update?: (ctx: LandmarkCtx) => void;
  /** Called once when the explorer comes within range. */
  onNear?: () => string | void;
  /** What lights up at night: halos around lamps and windows, and pools of lamplight on the ground. */
  glows?: { halos: Glow[]; pools: Glow[] };
  /** Night falling, from 0 (day) to 1 (night): turn up a beam, warm the windows. */
  night?: (n: number) => void;
  /** Solid ground it stands on beyond its footprint's circle, as [x, z, radius] in its own space (a long building's ends). */
  solid?: [number, number, number][];
  /** Free anything it made that the scene's own clean-up won't (a painted sign's texture). */
  dispose?: () => void;
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
  const glows = {
    halos: [[-0.75, 1.85, D / 2 + 0.45, 1.5], [-1.35, 1.5, D / 2 + 0.4, 1.5], [1.35, 1.5, D / 2 + 0.4, 1.5], [W / 2 + 0.45, 1.5, 0, 1.2], [-W / 2 - 0.45, 1.5, 0.5, 1.2]] as Glow[],
    pools: [[0, 0.5, D / 2 + 1.0, 3.2], [W / 2 + 1.2, 0.05, 0, 1.8], [-W / 2 - 1.2, 0.05, 0.5, 1.8]] as Glow[],
  };
  const chimney = new Vector3(-1.25, 4.9, -0.8);
  let smoke = 0;
  const base = new Color('#ffffff');
  return {
    group,
    bouncy: group,
    glows,
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

  const glows = {
    halos: [
      [-1.5, 0.75, D / 2 + 0.35, 1.3], [1.5, 0.75, D / 2 + 0.35, 1.3], [-1.5, 1.95, D / 2 + 0.3, 1.1], [1.5, 1.95, D / 2 + 0.3, 1.1], [W / 2 + 0.4, 1.0, 0, 1.1],
      ...bulbs.map((b): Glow => [b.x, b.y, b.z, 0.55]),
    ] as Glow[],
    pools: [[0, 0.05, D / 2 + 2.0, 3.6], [W / 2 + 1.0, 0.05, 0, 1.6]] as Glow[],
  };
  const swing = new Spring(0, 40, 2.2);
  let wasHover = false;
  return {
    group,
    bouncy: group,
    glows,
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

  const opacity = bm.uniforms.uOpacity.value as number;
  return {
    group,
    bouncy: group,
    glows: { halos: [[0, gy + 0.72, 0, 5.5]], pools: [] },
    night: (n) => {
      bm.uniforms.uOpacity.value = opacity + n * 0.34;
    },
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
  k.addGlow(new CylinderGeometry(0.24, 0.24, 0.06, 14), '#ffffff', { p: [0, top + 0.6, D / 2 + 0.05], r: [Math.PI / 2, 0, 0] });
  // Doors, steps, windows
  k.rbox(1.15, 1.6, 0.14, 0.04, shade(color, -0.12), { p: [0, 0.36 + 0.8, D / 2 + 0.04] });
  k.box(0.04, 1.5, 0.05, TRIM, { p: [0, 1.16, D / 2 + 0.12] });
  k.sphere(0.05, '#f2c14e', { p: [-0.15, 1.15, D / 2 + 0.14] }, 6, 4);
  k.sphere(0.05, '#f2c14e', { p: [0.15, 1.15, D / 2 + 0.14] }, 6, 4);
  k.rbox(1.6, 0.18, 0.5, 0.04, STONE, { p: [0, 0.27, D / 2 + 0.45] });
  k.rbox(1.4, 0.18, 0.4, 0.04, STONE_DARK, { p: [0, 0.1, D / 2 + 0.8] });
  // The glass is white in a sky-blue material, so night can warm it without touching the day look.
  windowAt(k, -1.35, 1.6, D / 2 + 0.06, { w: 0.62, h: 0.8, glow: '#ffffff' });
  windowAt(k, 1.35, 1.6, D / 2 + 0.06, { w: 0.62, h: 0.8, glow: '#ffffff' });
  for (const z of [-0.8, 0.8]) {
    windowAt(k, W / 2 + 0.06, 1.6, z, { w: 0.62, h: 0.8, ry: Math.PI / 2, glow: '#ffffff' });
    windowAt(k, -W / 2 - 0.06, 1.6, z, { w: 0.62, h: 0.8, ry: -Math.PI / 2, glow: '#ffffff' });
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

  const glass = glowMat('#cfeaff');
  const glassDay = glass.color.clone();
  const glassNight = new Color('#ffd590');
  const group = k.build({ glowMaterial: glass });

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
    glows: {
      halos: [[-1.35, 1.6, D / 2 + 0.4, 1.4], [1.35, 1.6, D / 2 + 0.4, 1.4], [0, top + 0.6, D / 2 + 0.35, 0.9], ...[-0.8, 0.8].flatMap((z): Glow[] => [[W / 2 + 0.4, 1.6, z, 1.2], [-W / 2 - 0.4, 1.6, z, 1.2]])],
      pools: [[0, 0.05, D / 2 + 1.5, 3.0], [W / 2 + 1.1, 0.05, 0, 1.8], [-W / 2 - 1.1, 0.05, 0, 1.8]],
    },
    night: (n) => {
      glass.color.lerpColors(glassDay, glassNight, n);
    },
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
    // Nobody works the belt after dark, but a lamp is left on under the roof.
    glows: { halos: [[0, 2.3, 0.4, 2.4]], pools: [[0, 0.22, 0.6, 3.2]] },
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

// ---------------------------------------------------------------- library

const SANDSTONE = '#dccaa6';
const SANDSTONE_DARK = '#c3ad88';
const BOOK_COLORS = ['#e5484d', '#ffbe0b', '#2e9c8f', '#fff3df', '#7d5134', '#ff8fab', '#6c5ce7', '#4caf6a'];

/** An arched window: stone surround, warm glass with a round top, one mullion and a sill. */
function archWindow(k: Kit, x: number, y: number, z: number, opts: { w?: number; h?: number; ry?: number; glow?: string; frame?: string } = {}) {
  const w = opts.w ?? 0.56;
  const h = opts.h ?? 0.8; // height of the straight part; the arch sits on top
  const ry = opts.ry ?? 0;
  const frame = opts.frame ?? SANDSTONE_DARK;
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  const at = (d: number): V3 => [x + nx * d, y, z + nz * d];
  const top = (d: number): V3 => [x + nx * d, y + h / 2, z + nz * d];
  // Half-discs, axis along +z, flat side down.
  const half = (r: number, depth: number) => {
    const g = new CylinderGeometry(r, r, depth, 12, 1, false, Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    return g;
  };
  k.box(w + 0.2, h, 0.12, frame, { p: at(0), r: [0, ry, 0] });
  k.add(half(w / 2 + 0.1, 0.12), frame, { p: top(0), r: [0, ry, 0] });
  k.addGlow(new BoxGeometry(w, h, 0.06), opts.glow ?? GLOW, { p: at(0.05), r: [0, ry, 0] });
  k.addGlow(half(w / 2, 0.06), opts.glow ?? GLOW, { p: top(0.05), r: [0, ry, 0] });
  k.box(0.05, h + w / 2 - 0.04, 0.04, frame, { p: [x + nx * 0.09, y + w / 4 - 0.02, z + nz * 0.09], r: [0, ry, 0] });
  k.box(w, 0.05, 0.04, frame, { p: [x + nx * 0.09, y + h * 0.1, z + nz * 0.09], r: [0, ry, 0] });
  k.box(w + 0.34, 0.1, 0.24, frame, { p: [x + nx * 0.08, y - h / 2 - 0.05, z + nz * 0.08], r: [0, ry, 0] });
}

/** Little 3D letters for the idle animation: A, E, O and the Old English thorn (Þ). */
export function letterGeometries() {
  const T = 0.07;
  const make = (f: (q: Kit) => void) => {
    const q = new Kit(901);
    f(q);
    return q.geometry();
  };
  return [
    make((q) => {
      q.box(T, 0.46, T, '#ffffff', { p: [-0.085, 0, 0], r: [0, 0, -0.36], jitter: 0 });
      q.box(T, 0.46, T, '#ffffff', { p: [0.085, 0, 0], r: [0, 0, 0.36], jitter: 0 });
      q.box(0.18, T * 0.9, T, '#ffffff', { p: [0, -0.06, 0], jitter: 0 });
    }),
    make((q) => {
      q.box(T, 0.44, T, '#ffffff', { p: [-0.09, 0, 0], jitter: 0 });
      q.box(0.24, T, T, '#ffffff', { p: [0.03, 0.185, 0], jitter: 0 });
      q.box(0.18, T, T, '#ffffff', { p: [0, 0, 0], jitter: 0 });
      q.box(0.24, T, T, '#ffffff', { p: [0.03, -0.185, 0], jitter: 0 });
    }),
    make((q) => {
      q.torus(0.15, 0.042, '#ffffff', { s: [0.85, 1.2, 1], jitter: 0 }, 4, 14);
    }),
    make((q) => {
      q.box(T, 0.5, T, '#ffffff', { p: [-0.09, -0.02, 0], jitter: 0 });
      q.torus(0.095, 0.036, '#ffffff', { p: [-0.07, 0.02, 0], r: [0, 0, -Math.PI / 2], s: [1.25, 1, 1], jitter: 0 }, 4, 10, Math.PI);
    }),
  ];
}

export function buildLibrary(color: string): Built {
  const k = new Kit(909);
  const W = 4.0;
  const D = 3.2;
  const WALL = 2.5;
  const base = 0.36;
  const top = base + WALL;
  const slate = shade(color, -0.1);
  const slateLight = shade(color, 0.08);

  // Plinth and stone walls with darker quoins at the corners.
  k.rbox(W + 0.5, base, D + 0.5, 0.08, STONE, { p: [0, base / 2, 0] });
  k.rbox(W, WALL, D, 0.05, SANDSTONE, { p: [0, base + WALL / 2, 0], jitter: 0.03 });
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) {
    for (let i = 0; i < 5; i++) {
      const long = i % 2 === 0;
      k.box(long ? 0.34 : 0.22, 0.42, long ? 0.22 : 0.34, SANDSTONE_DARK, { p: [x + (long ? Math.sign(x) * -0.04 : 0), base + 0.25 + i * 0.5, z + (long ? 0 : Math.sign(z) * -0.04)] });
    }
  }
  // A few proud stones so the walls read as masonry, kept clear of the door, window and noticeboard.
  const busy = (x: number, y: number) =>
    Math.abs(x) < 0.85 || x < -1.15 || (x > 0.95 && x < 1.75 && y > base + 0.65) || (x < -0.55 && y > base + 0.55 && y < base + 1.35);
  for (let i = 0, n = 0; i < 80 && n < 8; i++) {
    const x = (k.rand() - 0.5) * (W - 0.5);
    const y = base + 0.2 + k.rand() * (WALL - 0.45);
    if (busy(x, y)) continue;
    n++;
    k.box(0.28 + k.rand() * 0.18, 0.15, 0.05, n % 2 ? SANDSTONE_DARK : '#e8d9ba', { p: [x, y, D / 2 + 0.02] });
  }
  for (const [side, y, z] of [[1, 0.6, 0.65], [1, 2.45, -0.5], [1, 2.5, 1.05], [-1, 0.6, -1.1], [-1, 2.45, -0.25], [-1, 0.65, -0.15]]) {
    k.box(0.05, 0.15, 0.32, z > 0 ? '#e8d9ba' : SANDSTONE_DARK, { p: [side * (W / 2 + 0.02), y, z] });
  }
  // A band of darker stone under the eaves.
  k.box(W + 0.12, 0.14, D + 0.12, SANDSTONE_DARK, { p: [0, top - 0.07, 0] });

  // Buttresses down the sides.
  for (const [x, z] of [[W / 2, -0.15], [W / 2, -D / 2 + 0.35], [-W / 2, -0.55]] as [number, number][]) {
    const s = Math.sign(x);
    k.box(0.34, 1.6, 0.42, SANDSTONE_DARK, { p: [x + s * 0.17, base + 0.8, z] });
    k.box(0.26, 0.9, 0.36, SANDSTONE_DARK, { p: [x + s * 0.13, base + 1.9, z], r: [0, 0, s * 0.18] });
  }

  // Front gable roof in blue slate, with rows of slates picked out.
  const RH = 1.7;
  const over = 0.45;
  const thick = 0.22;
  const RD = D + 0.7;
  k.gable(W, RH, D, SANDSTONE, { p: [0, top, 0] });
  k.roof(W, RH, RD, top, color, { overhang: over, thick });
  const a = Math.atan2(RH, W / 2);
  for (const s of [-1, 1]) {
    const ex = s * (W / 2 + over * Math.cos(a));
    const ey = top - over * Math.sin(a);
    for (const t of [0.2, 0.42, 0.64, 0.84]) {
      const px = ex + (0 - ex) * t + s * Math.sin(a) * (thick + 0.02);
      const py = ey + (top + RH - ey) * t + Math.cos(a) * (thick + 0.02);
      k.box(0.1, 0.05, RD - 0.1, t > 0.5 ? slateLight : slate, { p: [px, py, 0], r: [0, 0, -s * a], jitter: 0.02 });
    }
  }
  // Chimney at the back (the letters drift out of it).
  k.box(0.62, 1.9, 0.62, SANDSTONE_DARK, { p: [1.3, top + 1.1, -0.95] });
  k.box(0.78, 0.2, 0.78, STONE_DARK, { p: [1.3, top + 2.1, -0.95] });

  // Rose window in the front gable.
  const rz = D / 2 + 0.03;
  const ry0 = top + 0.66;
  k.cyl(0.46, 0.46, 0.1, SANDSTONE_DARK, { p: [0, ry0, rz], r: [Math.PI / 2, 0, 0] }, 16);
  k.addGlow(new CylinderGeometry(0.36, 0.36, 0.06, 16), '#ffd58a', { p: [0, ry0, rz + 0.04], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) k.box(0.72, 0.05, 0.04, SANDSTONE_DARK, { p: [0, ry0, rz + 0.08], r: [0, 0, (i * Math.PI) / 4], jitter: 0 });
  k.cyl(0.09, 0.09, 0.06, SANDSTONE_DARK, { p: [0, ry0, rz + 0.1], r: [Math.PI / 2, 0, 0] }, 8);

  // Arched double door with a stone surround and steps.
  const dz = D / 2;
  const doorH = 1.15;
  const doorW = 1.0;
  k.box(doorW + 0.32, doorH + 0.1, 0.16, SANDSTONE_DARK, { p: [0, base + doorH / 2 + 0.05, dz + 0.02] });
  k.cyl(doorW / 2 + 0.16, doorW / 2 + 0.16, 0.16, SANDSTONE_DARK, { p: [0, base + doorH + 0.05, dz + 0.02], r: [Math.PI / 2, 0, 0] }, 14);
  k.box(doorW, doorH, 0.12, '#5b3a24', { p: [0, base + doorH / 2, dz + 0.08] });
  k.cyl(doorW / 2, doorW / 2, 0.12, '#5b3a24', { p: [0, base + doorH, dz + 0.08], r: [Math.PI / 2, 0, 0] }, 14);
  k.box(0.04, doorH + doorW / 2 - 0.06, 0.04, '#3f2818', { p: [0, base + (doorH + doorW / 2) / 2, dz + 0.15], jitter: 0 });
  for (const y of [0.45, 1.05]) k.box(doorW - 0.08, 0.06, 0.03, '#3d3a36', { p: [0, base + y, dz + 0.155], jitter: 0 });
  k.sphere(0.055, '#f2c14e', { p: [-0.13, base + 0.72, dz + 0.18] }, 6, 4);
  k.sphere(0.055, '#f2c14e', { p: [0.13, base + 0.72, dz + 0.18] }, 6, 4);
  k.rbox(1.7, 0.18, 0.55, 0.04, STONE, { p: [0, 0.27, dz + 0.5] });
  k.rbox(1.5, 0.18, 0.42, 0.04, STONE_DARK, { p: [0, 0.1, dz + 0.9] });
  // Lanterns either side of the door.
  for (const x of [-0.92, 0.92]) {
    k.box(0.05, 0.05, 0.22, '#3d3a36', { p: [x, base + 1.55, dz + 0.12] });
    k.box(0.16, 0.05, 0.16, '#3d3a36', { p: [x, base + 1.58, dz + 0.24] });
    k.addGlow(new BoxGeometry(0.12, 0.2, 0.12), '#ffd27a', { p: [x, base + 1.45, dz + 0.24] });
    k.add(new ConeGeometry(0.12, 0.12, 4), '#3d3a36', { p: [x, base + 1.66, dz + 0.24], r: [0, Math.PI / 4, 0] });
  }

  // Windows: one on the front, tall arches down both sides.
  archWindow(k, 1.35, base + 1.2, dz + 0.02, { w: 0.56, h: 0.85 });
  archWindow(k, W / 2 + 0.02, base + 1.2, 0.62, { ry: Math.PI / 2 });
  archWindow(k, W / 2 + 0.02, base + 1.2, -0.95, { ry: Math.PI / 2 });
  archWindow(k, -W / 2 - 0.02, base + 1.2, -1.2, { ry: -Math.PI / 2 });
  archWindow(k, -W / 2 - 0.02, base + 1.2, 0.2, { ry: -Math.PI / 2 });
  // A noticeboard of pinned pages between the tower and the door.
  k.box(0.5, 0.62, 0.06, WOOD, { p: [-0.92, base + 0.95, dz + 0.04] });
  for (const [x, y, r] of [[-1.03, 1.05, 0.08], [-0.83, 1.08, -0.1], [-0.95, 0.83, 0.04], [-0.8, 0.86, 0.12]] as V3[]) {
    k.box(0.16, 0.2, 0.02, '#fffaf0', { p: [x, base + y, dz + 0.08], r: [0, 0, r], jitter: 0 });
  }

  // Round tower on the front-left corner, with a tall slate cone.
  const tx = -W / 2 - 0.05;
  const tz = D / 2 - 0.85;
  const TR = 0.95;
  const TH = 4.1;
  k.cyl(TR + 0.1, TR + 0.16, 0.42, STONE, { p: [tx, 0.21, tz] }, 14);
  k.cyl(TR, TR + 0.04, TH, SANDSTONE, { p: [tx, 0.4 + TH / 2, tz], jitter: 0.03 }, 14);
  k.cyl(TR + 0.08, TR + 0.08, 0.14, SANDSTONE_DARK, { p: [tx, 0.4 + 2.35, tz] }, 14);
  k.cyl(TR + 0.14, TR + 0.08, 0.22, SANDSTONE_DARK, { p: [tx, 0.4 + TH + 0.06, tz] }, 14);
  k.cone(TR + 0.38, 1.85, color, { p: [tx, 0.4 + TH + 1.07, tz] }, 14);
  k.cyl(0.03, 0.03, 0.45, '#3d3a36', { p: [tx, 0.4 + TH + 2.18, tz] }, 4);
  k.sphere(0.1, '#f2c14e', { p: [tx, 0.4 + TH + 2.05, tz] }, 8, 6);
  // Tower windows face front and to the side; a slit lower down.
  const tw = (ang: number, y: number, w: number, h: number) =>
    archWindow(k, tx + Math.sin(ang) * (TR - 0.01), y, tz + Math.cos(ang) * (TR - 0.01), { w, h, ry: ang });
  tw(0.35, 0.4 + 3.2, 0.42, 0.5);
  tw(-1.1, 0.4 + 3.2, 0.42, 0.5);
  tw(0.15, 0.4 + 1.45, 0.3, 0.55);
  // Ivy climbing the tower.
  for (const [ang, y, s] of [[-0.95, 0.7, 1.1], [-0.7, 1.2, 0.9], [-1.15, 1.55, 0.8], [-0.85, 2.0, 0.7], [-1.3, 2.3, 0.6], [1.6, 0.6, 0.9], [1.3, 1.0, 0.7]] as V3[]) {
    k.ico(0.26 * s, ang > 1 ? '#4fae55' : '#5cb85a', { p: [tx + Math.sin(ang) * (TR + 0.05), y, tz + Math.cos(ang) * (TR + 0.05)], s: [1, 1, 0.6], r: [0, ang, 0] });
  }

  // Bench by the tower with a stack of books.
  const bx = -1.3;
  const bz = D / 2 + 1.25;
  k.rbox(1.3, 0.09, 0.42, 0.03, WOOD, { p: [bx, 0.5, bz] });
  k.box(1.3, 0.34, 0.07, WOOD, { p: [bx, 0.78, bz - 0.2], r: [-0.12, 0, 0] });
  for (const x of [-0.5, 0.5]) {
    k.box(0.08, 0.46, 0.36, WOOD_DARK, { p: [bx + x, 0.23, bz] });
  }
  const stack: [string, number, number][] = [['#e5484d', 0.48, 0.1], [color, 0.42, -0.15], ['#ffbe0b', 0.38, 0.25]];
  stack.forEach(([c, w, r], i) => {
    k.box(w, 0.09, w * 0.72, c, { p: [bx - 0.3, 0.6 + i * 0.09, bz + 0.02], r: [0, r, 0] });
    k.box(w - 0.06, 0.07, w * 0.72 - 0.04, '#fff7e6', { p: [bx - 0.29, 0.6 + i * 0.09, bz + 0.03], r: [0, r, 0], jitter: 0 });
  });
  // ...and one left open, face down.
  for (const s of [-1, 1]) k.box(0.26, 0.03, 0.34, '#2e9c8f', { p: [bx + 0.3 + s * 0.11, 0.58, bz + 0.03], r: [0, 0, -s * 0.35] });

  // A little outdoor bookshelf in front of the tower, open at the front.
  const sx = -W / 2 - 0.75;
  const sz = D / 2 + 0.75;
  const sYaw = 0.35;
  const sc = Math.cos(sYaw);
  const ss = Math.sin(sYaw);
  const sp = (x: number, y: number, z: number): V3 => [sx + x * sc + z * ss, y, sz - x * ss + z * sc];
  k.box(0.07, 1.5, 0.42, WOOD_DARK, { p: sp(-0.44, 0.75, 0), r: [0, sYaw, 0] });
  k.box(0.07, 1.5, 0.42, WOOD_DARK, { p: sp(0.44, 0.75, 0), r: [0, sYaw, 0] });
  k.box(0.95, 0.06, 0.42, WOOD_DARK, { p: sp(0, 1.47, 0), r: [0, sYaw, 0] });
  k.box(0.88, 1.44, 0.05, '#5b3a24', { p: sp(0, 0.75, -0.19), r: [0, sYaw, 0] });
  k.add(new ConeGeometry(0.75, 0.34, 4), color, { p: sp(0, 1.66, 0), r: [0, Math.PI / 4 + sYaw, 0], s: [1, 1, 0.48] });
  for (let row = 0; row < 3; row++) {
    const y0 = 0.08 + row * 0.46;
    k.box(0.82, 0.05, 0.38, WOOD, { p: sp(0, y0, 0), r: [0, sYaw, 0] });
    let x = -0.38;
    let i = row * 3;
    while (x < 0.3) {
      const w = 0.07 + ((i * 37) % 5) * 0.012;
      const h = 0.26 + ((i * 53) % 4) * 0.03;
      const lean = i % 7 === 3 ? 0.25 : 0;
      k.box(w, h, 0.28, BOOK_COLORS[(i * 5) % BOOK_COLORS.length], { p: sp(x + w / 2, y0 + 0.025 + h / 2, 0.02), r: [0, sYaw, -lean] });
      x += w + 0.015 + lean * 0.3;
      i++;
    }
  }

  // A giant open book on a stone lectern: its pages turn, and letters lift off them.
  const lx = 1.5;
  const lz = D / 2 + 1.75;
  k.rbox(0.62, 0.62, 0.5, 0.06, STONE, { p: [lx, 0.31, lz] });
  k.box(0.4, 0.34, 0.32, STONE_DARK, { p: [lx, 0.78, lz] });
  const book = new Group();
  book.position.set(lx, 1.02, lz);
  book.rotation.set(0.42, -0.2, 0);
  const PW = 0.7;
  const PD = 0.92;
  const bkK = new Kit(911);
  for (const s of [-1, 1]) {
    bkK.box(PW + 0.06, 0.06, PD + 0.08, color, { p: [s * (PW / 2 + 0.02), 0, 0], r: [0, 0, s * 0.12] });
    bkK.box(PW - 0.04, 0.1, PD - 0.04, '#fff3df', { p: [s * (PW / 2 + 0.01), 0.07, 0], r: [0, 0, s * 0.12], jitter: 0.01 });
    for (let l = 0; l < 5; l++) {
      bkK.box(PW * (l === 4 ? 0.4 : 0.66), 0.012, 0.035, '#6f6457', { p: [s * (PW / 2 + 0.02) - (l === 4 ? s * 0.1 : 0), 0.125 + s * 0.0, -PD / 2 + 0.2 + l * 0.13], r: [0, 0, s * 0.12], jitter: 0 });
    }
  }
  bkK.box(0.08, 0.08, PD + 0.1, shade(color, -0.15), { p: [0, -0.02, 0] });
  // A ribbon bookmark hanging over the edge.
  bkK.box(0.05, 0.01, 0.3, '#e5484d', { p: [0.08, 0.13, PD / 2 + 0.08], r: [0.9, 0, 0], jitter: 0 });
  book.add(bkK.build());
  // The turning leaf: two hinged halves so it curls as it turns.
  const leaf = new Group();
  leaf.position.set(0, 0.12, 0);
  const leafA = new Group();
  const leafB = new Group();
  const lk = new Kit(912);
  lk.box(PW * 0.5, 0.012, PD - 0.06, '#fffaf0', { p: [PW * 0.25, 0, 0], jitter: 0 });
  lk.box(PW * 0.3, 0.006, 0.03, '#8a7e70', { p: [PW * 0.28, 0.008, -0.15], jitter: 0 });
  lk.box(PW * 0.3, 0.006, 0.03, '#8a7e70', { p: [PW * 0.28, 0.008, 0.05], jitter: 0 });
  leafA.add(lk.build({ castShadow: false }));
  const lk2 = new Kit(913);
  lk2.box(PW * 0.48, 0.012, PD - 0.06, '#fffaf0', { p: [PW * 0.24, 0, 0], jitter: 0 });
  lk2.box(PW * 0.3, 0.006, 0.03, '#8a7e70', { p: [PW * 0.2, 0.008, -0.15], jitter: 0 });
  lk2.box(PW * 0.3, 0.006, 0.03, '#8a7e70', { p: [PW * 0.2, 0.008, 0.05], jitter: 0 });
  leafB.add(lk2.build({ castShadow: false }));
  leafB.position.x = PW * 0.5;
  leafA.add(leafB);
  leaf.add(leafA);
  book.add(leaf);

  const glow = glowMat();
  const group = k.build({ glowMaterial: glow });
  group.add(book);

  // Floating letters: one instanced mesh per glyph, popping in and shrinking away like the puffs.
  const glyphs = letterGeometries();
  const PER = 6;
  const letterMat = litMaterial();
  const meshes = glyphs.map((g) => {
    const m = new InstancedMesh(g, letterMat, PER);
    m.castShadow = false;
    m.frustumCulled = false;
    group.add(m);
    return m;
  });
  const palette = ['#fff3df', '#f2c14e', '#ffffff', shade(color, 0.22)].map((c) => new Color(c));
  type Letter = { alive: boolean; age: number; life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; wind: number; spin: number; phase: number; size: number };
  const letters: Letter[][] = glyphs.map(() => Array.from({ length: PER }, () => ({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wind: 0, spin: 0, phase: 0, size: 1 })));
  const o = new Object3D();
  const hide = () => {
    o.position.set(0, -50, 0);
    o.scale.setScalar(0);
    o.updateMatrix();
  };
  hide();
  meshes.forEach((m) => {
    for (let i = 0; i < PER; i++) {
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, palette[i % palette.length]);
    }
  });
  let nextGlyph = 0;
  const spawn = (x: number, y: number, z: number, o2: { vy: number; spread: number; life: number; size: number; wind?: number }) => {
    nextGlyph = (nextGlyph + 1 + Math.floor(Math.random() * 2)) % glyphs.length;
    const pool = letters[nextGlyph];
    const i = pool.findIndex((l) => !l.alive);
    if (i < 0) return;
    const l = pool[i];
    const a = Math.random() * Math.PI * 2;
    Object.assign(l, {
      alive: true, age: 0, life: o2.life * (0.85 + Math.random() * 0.3),
      x, y, z,
      vx: Math.cos(a) * o2.spread, vy: o2.vy * (0.85 + Math.random() * 0.3), vz: Math.sin(a) * o2.spread, wind: o2.wind ?? 0,
      spin: (Math.random() - 0.5) * 2.4, phase: Math.random() * 6, size: o2.size * (0.85 + Math.random() * 0.3),
    });
    meshes[nextGlyph].setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
    if (meshes[nextGlyph].instanceColor) meshes[nextGlyph].instanceColor!.needsUpdate = true;
  };
  const chimney = new Vector3(1.3, top + 2.25, -0.95);
  const page = new Vector3(lx, 1.25, lz);
  const fromBook = (n: number) => {
    for (let i = 0; i < n; i++) spawn(page.x + (Math.random() - 0.5) * 0.6, page.y, page.z + (Math.random() - 0.5) * 0.3, { vy: 0.75, spread: 0.22, life: 2.6, size: 1.1 });
  };

  const glows = {
    halos: [
      [-0.92, base + 1.45, dz + 0.4, 1.2], [0.92, base + 1.45, dz + 0.4, 1.2], [1.35, base + 1.3, dz + 0.35, 1.3], [0, ry0, rz + 0.3, 1.1],
      [W / 2 + 0.35, base + 1.3, 0.62, 1.1], [W / 2 + 0.35, base + 1.3, -0.95, 1.1], [-W / 2 - 0.35, base + 1.3, -1.2, 1.1], [-W / 2 - 0.35, base + 1.3, 0.2, 1.1],
      [tx + Math.sin(0.35) * (TR + 0.3), 0.4 + 3.3, tz + Math.cos(0.35) * (TR + 0.3), 0.9],
    ] as Glow[],
    pools: [[0, 0.05, dz + 1.3, 3.2], [W / 2 + 1.0, 0.05, -0.2, 1.8]] as Glow[],
  };
  let chimT = 0.4;
  let bookT = 1.2;
  let turnT = -1;
  let nextTurn = 2.5;
  const base0 = new Color('#ffffff');
  const turn = (t: number) => {
    // 0..1 → the leaf sweeps from the right-hand page to the left, curling as it goes.
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    leafA.rotation.z = 0.12 + e * (Math.PI - 0.24);
    leafB.rotation.z = -Math.sin(e * Math.PI) * 0.55;
    leaf.position.y = 0.12 + Math.sin(e * Math.PI) * 0.03;
  };
  turn(0);
  return {
    group,
    bouncy: group,
    glows,
    onNear: () => {
      if (turnT < 0) turnT = 0;
      fromBook(5);
    },
    update: (c) => {
      // Letters drift out of the chimney like smoke, and lift off the open book.
      chimT -= c.dt;
      if (chimT <= 0) {
        chimT = 0.75 + Math.random() * 0.35;
        spawn(chimney.x + (Math.random() - 0.5) * 0.2, chimney.y, chimney.z, { vy: 0.8, spread: 0.1, life: 3.6, size: 1.5, wind: 0.45 });
      }
      bookT -= c.dt * (c.near || c.hover ? 2.2 : 1);
      if (bookT <= 0) {
        bookT = 1.3 + Math.random() * 0.6;
        fromBook(1);
      }
      // Turn a page every few seconds (more often when someone is close).
      if (turnT < 0) {
        nextTurn -= c.dt * (c.near || c.hover ? 2 : 1);
        if (nextTurn <= 0) turnT = 0;
      } else {
        turnT += c.dt / 1.5;
        if (turnT >= 1) {
          turnT = -1;
          nextTurn = 4 + Math.random() * 2;
          turn(0); // the turned leaf is now part of the left page; start a fresh one on the right
          fromBook(2);
        } else turn(turnT);
      }

      const wv = new Vector3();
      for (let g = 0; g < glyphs.length; g++) {
        const pool = letters[g];
        const m = meshes[g];
        for (let i = 0; i < PER; i++) {
          const l = pool[i];
          if (!l.alive) continue;
          l.age += c.dt;
          const t = l.age / l.life;
          if (t >= 1) {
            l.alive = false;
            hide();
            m.setMatrixAt(i, o.matrix);
            continue;
          }
          l.x += (l.vx + l.wind + Math.sin(c.t * 1.7 + l.phase) * 0.25) * c.dt;
          l.y += l.vy * c.dt;
          l.z += (l.vz + Math.cos(c.t * 1.3 + l.phase) * 0.18) * c.dt;
          l.vx *= 1 - c.dt * 0.6;
          l.vz *= 1 - c.dt * 0.6;
          const sIn = easeOutBack(Math.min(1, t * 5), 2.2);
          const sOut = 1 - Math.max(0, (t - 0.55) / 0.45) ** 2;
          wv.set(l.x, l.y, l.z);
          o.position.copy(wv);
          o.rotation.set(Math.sin(c.t * 2 + l.phase) * 0.35, l.phase + l.age * l.spin, Math.sin(c.t * 1.6 + l.phase) * 0.25);
          o.scale.setScalar(Math.max(0.0001, l.size * sIn * sOut));
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
      // Reading-lamp glow, breathing gently.
      const f = 0.94 + 0.06 * Math.sin(c.t * 1.3) * Math.sin(c.t * 2.9 + 1);
      glow.color.copy(base0).multiplyScalar(f);
    },
  };
}

// ---------------------------------------------------------------- pier

/** The rowboat tied alongside, in the pier's frame (x across, z from its foot): swimmers bump into it. */
export const ROWBOAT = { x: 1.65, fromEnd: 3.2, halfWidth: 0.52, halfLength: 1.25 };

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
  boat.position.set(ROWBOAT.x, 0.05, L - ROWBOAT.fromEnd);
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
    glows: { halos: [[-PIER.width / 2 + 0.36, deckY + 1.6, L - 3.6, 1.6]], pools: [[-0.25, deckY + 0.02, L - 3.6, 1.25]] },
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
    glows: { halos: [[0, 0.3, 0, 1.0]], pools: [] },
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

// ---------------------------------------------------------------- workshop

/** A box whose top slopes from `hFront` (at +z) down to `hBack` (at -z), standing on y = 0. */
function slantBox(w: number, hFront: number, hBack: number, d: number) {
  const g = new BoxGeometry(w, 1, d);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.5) pos.setY(i, pos.getZ(i) > 0 ? hFront : hBack);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** A sawhorse: a beam on two splayed pairs of legs, along x. */
function sawhorse(k: Kit, x: number, z: number, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  k.box(0.9, 0.1, 0.12, WOOD_LIGHT, { p: at(0, 0.62, 0), r: [0, ry, 0] });
  for (const lx of [-0.34, 0.34]) for (const side of [-1, 1]) {
    k.box(0.07, 0.66, 0.07, WOOD, { p: at(lx, 0.3, side * 0.12), r: [side * 0.3, ry, 0] });
  }
}

/** The workshop: a plank shed with a mono-pitch roof, a big window with a monitor glowing
 *  inside, a workbench under the window, sawhorses and a saw that works on its own. */
export function buildWorkshop(color: string): Built {
  const k = new Kit(909);
  const W = 3.8;
  const D = 2.6;
  const zc = -0.45; // the shed sits back, leaving room for the bench out front
  const zf = zc + D / 2; // front wall
  const hF = 2.75;
  const hB = 2.05;
  const base = 0.24;
  const PLANK = '#c9955f';
  const BATTEN = '#a8743f';
  // Concrete apron, then the plank walls.
  k.rbox(W + 1.4, base, D + 1.9, 0.06, '#d3ccbf', { p: [0, base / 2, zc + 0.5] });
  k.add(slantBox(W, hF, hB, D), PLANK, { p: [0, base, zc] });
  // Battens down the front and sides.
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + (i * W) / 8;
    k.box(0.06, hF, 0.05, BATTEN, { p: [x, base + hF / 2, zf + 0.02], jitter: 0.02 });
  }
  for (const sx of [-1, 1]) {
    for (let i = 1; i < 5; i++) {
      const z = zc - D / 2 + (i * D) / 5;
      const h = hB + ((z - (zc - D / 2)) / D) * (hF - hB);
      k.box(0.05, h, 0.06, BATTEN, { p: [sx * (W / 2 + 0.02), base + h / 2, z], jitter: 0.02 });
    }
  }
  // Corner trim.
  for (const sx of [-1, 1]) {
    k.box(0.12, hF, 0.12, TRIM, { p: [sx * W / 2, base + hF / 2, zf] });
    k.box(0.12, hB, 0.12, TRIM, { p: [sx * W / 2, base + hB / 2, zc - D / 2] });
  }
  // Mono-pitch roof in the accent, high over the window and low at the back.
  const slope = Math.atan2(hF - hB, D);
  const roofLen = Math.hypot(D, hF - hB) + 0.9;
  k.rbox(W + 0.7, 0.2, roofLen, 0.06, color, { p: [0, base + (hF + hB) / 2 + 0.12, zc + 0.12], r: [-slope, 0, 0] });
  k.rbox(W + 0.74, 0.1, 0.16, 0.04, shade(color, -0.12), { p: [0, base + hF + 0.24, zf + 0.5] });
  // Stovepipe out of the back of the roof.
  k.cyl(0.11, 0.11, 1.1, '#6f6a64', { p: [1.15, base + hB + 0.75, zc - 0.55] }, 8);
  k.cyl(0.18, 0.12, 0.14, '#5a5550', { p: [1.15, base + hB + 1.34, zc - 0.55] }, 8);

  // The big window, left of the door: four bars round a dark interior.
  const wx = -0.75;
  const wy = base + 1.5;
  const ww = 1.75;
  const wh = 1.25;
  const fz = zf + 0.05;
  k.box(ww + 0.2, 0.12, 0.16, TRIM, { p: [wx, wy + wh / 2 + 0.06, fz] });
  k.box(ww + 0.32, 0.1, 0.3, TRIM, { p: [wx, wy - wh / 2 - 0.05, fz + 0.06] }); // sill
  for (const sx of [-1, 1]) k.box(0.12, wh, 0.16, TRIM, { p: [wx + sx * (ww / 2 + 0.04), wy, fz] });
  k.box(ww + 0.08, 0.05, 0.1, TRIM, { p: [wx, wy + wh / 2 - 0.26, fz], jitter: 0 }); // transom
  k.addGlow(new BoxGeometry(ww, wh, 0.02), '#ffffff', { p: [wx, wy, zf + 0.01] });
  // The monitor, on a desk, seen through the glass.
  const mx = wx + 0.15;
  const my = wy - 0.08;
  k.box(1.5, 0.06, 0.12, '#7d5134', { p: [wx, wy - wh / 2 + 0.2, zf + 0.04] }); // the desk inside
  k.box(0.08, 0.2, 0.04, '#3d3a36', { p: [mx, my - 0.28, zf + 0.05] });
  k.rbox(0.72, 0.5, 0.05, 0.02, '#2b2a2e', { p: [mx, my, zf + 0.055] });
  // A mug and a lamp beside it.
  k.cyl(0.06, 0.05, 0.12, '#fff3df', { p: [wx - 0.55, wy - wh / 2 + 0.29, zf + 0.06] }, 8);
  k.cyl(0.015, 0.015, 0.3, '#3d3a36', { p: [wx + 0.68, wy - wh / 2 + 0.38, zf + 0.06], r: [0, 0, -0.3] }, 4);

  // The door, propped open into the dark, right of the window.
  const dx = 1.05;
  const dw = 0.95;
  const dh = 1.9;
  k.box(dw, dh, 0.04, '#3b2a1f', { p: [dx, base + dh / 2, zf + 0.01], jitter: 0 });
  for (const sx of [-1, 1]) k.box(0.1, dh + 0.1, 0.12, TRIM, { p: [dx + sx * (dw / 2 + 0.03), base + dh / 2, zf + 0.04] });
  k.box(dw + 0.26, 0.1, 0.12, TRIM, { p: [dx, base + dh + 0.05, zf + 0.04] });
  // The open leaf, swung out on its right-hand hinge.
  const leafA = 1.25;
  const hingeX = dx + dw / 2;
  k.rbox(dw - 0.04, dh - 0.04, 0.07, 0.02, shade(color, -0.1), { p: [hingeX - Math.cos(leafA) * (dw / 2), base + dh / 2, zf + 0.06 + Math.sin(leafA) * (dw / 2)], r: [0, leafA, 0] });
  k.sphere(0.045, '#f2c14e', { p: [hingeX - Math.cos(leafA) * (dw - 0.14), base + 1.0, zf + 0.1 + Math.sin(leafA) * (dw - 0.14)] }, 6, 4);
  k.rbox(1.2, 0.14, 0.45, 0.04, STONE, { p: [dx, base + 0.03, zf + 0.3] }); // step
  // A lamp over the door.
  k.box(0.05, 0.05, 0.3, '#3d3a36', { p: [dx, base + dh + 0.4, zf + 0.15] });
  k.cone(0.16, 0.14, '#3d3a36', { p: [dx, base + dh + 0.35, zf + 0.3] }, 8);
  k.addGlow(new SphereGeometry(0.08, 8, 6), '#ffd27a', { p: [dx, base + dh + 0.27, zf + 0.3] });

  // The workbench under the window.
  const bz = zf + 0.55;
  const by = base + 0.92;
  k.rbox(2.0, 0.12, 0.62, 0.03, WOOD_LIGHT, { p: [wx, by, bz] });
  for (const lx of [-0.88, 0.88]) for (const lz of [-0.24, 0.24]) k.box(0.09, by - base, 0.09, WOOD_DARK, { p: [wx + lx, base + (by - base) / 2, bz + lz] });
  k.box(1.8, 0.06, 0.5, WOOD, { p: [wx, base + 0.22, bz] }); // shelf
  for (let i = 0; i < 3; i++) k.rbox(0.3, 0.12, 0.22, 0.03, ['#c8a172', '#3a86ff', '#e5484d'][i], { p: [wx - 0.6 + i * 0.45, base + 0.31, bz + (i % 2) * 0.06] });
  // A vice at one end, with half a lighthouse clamped in it.
  k.box(0.2, 0.16, 0.18, '#5c636b', { p: [wx - 0.85, by + 0.13, bz + 0.12] });
  k.box(0.04, 0.04, 0.3, '#9aa1ab', { p: [wx - 0.85, by + 0.13, bz + 0.3] });
  k.cyl(0.07, 0.09, 0.32, '#fff6ec', { p: [wx - 0.85, by + 0.37, bz + 0.12] }, 8);
  k.cyl(0.075, 0.08, 0.08, '#e5484d', { p: [wx - 0.85, by + 0.36, bz + 0.12] }, 8);
  // Blueprints: one unrolled under a mug and a pencil, one still rolled.
  k.box(0.7, 0.012, 0.48, '#2f6db5', { p: [wx + 0.05, by + 0.066, bz], r: [0, 0.12, 0], jitter: 0 });
  for (let i = 0; i < 3; i++) k.box(0.5 - i * 0.12, 0.004, 0.02, '#dfeaff', { p: [wx + 0.02, by + 0.074, bz - 0.12 + i * 0.12], r: [0, 0.12, 0], jitter: 0 });
  k.box(0.02, 0.004, 0.3, '#dfeaff', { p: [wx - 0.18, by + 0.074, bz + 0.02], r: [0, 0.12, 0], jitter: 0 });
  k.cyl(0.035, 0.035, 0.24, '#ffbe0b', { p: [wx + 0.32, by + 0.09, bz + 0.12], r: [Math.PI / 2, 0, 0.9] }, 6);
  k.cyl(0.06, 0.06, 0.62, '#4f86c9', { p: [wx + 0.68, by + 0.12, bz - 0.12], r: [0, 0, Math.PI / 2] }, 8);
  // A hammer.
  k.cyl(0.025, 0.025, 0.34, WOOD_DARK, { p: [wx + 0.6, by + 0.08, bz + 0.14], r: [Math.PI / 2, 0, -0.5] }, 5);
  k.box(0.07, 0.07, 0.16, '#5c636b', { p: [wx + 0.68, by + 0.09, bz + 0.29], r: [0, -0.5, 0] });

  // A pinboard of prompts on the side wall.
  const px = -W / 2 - 0.05;
  k.box(0.05, 0.75, 1.05, '#c8955c', { p: [px, base + 1.55, zc + 0.1] });
  k.box(0.06, 0.82, 0.06, WOOD_DARK, { p: [px, base + 1.55, zc + 0.64] });
  k.box(0.06, 0.82, 0.06, WOOD_DARK, { p: [px, base + 1.55, zc - 0.44] });
  const CARDS = ['#fff3df', '#ffd166', '#ffffff', '#ff9eb5', '#bde3ff', '#fff3df', '#c9f2c7'];
  CARDS.forEach((c, i) => {
    const cz = zc + 0.1 - 0.36 + (i % 4) * 0.24 + (i > 3 ? 0.12 : 0);
    const cy = base + 1.72 - (i > 3 ? 0.32 : 0) + ((i * 37) % 5) * 0.01;
    k.box(0.02, 0.16, 0.2, c, { p: [px - 0.03, cy, cz], r: [((i * 13) % 7) * 0.04 - 0.12, 0, 0], jitter: 0 });
    k.sphere(0.02, i % 2 ? '#e5484d' : '#3a86ff', { p: [px - 0.05, cy + 0.06, cz] }, 5, 3);
  });

  // Sawhorses with a plank across, and sawdust under it.
  const sx0 = 2.35;
  const sz0 = 0.75;
  sawhorse(k, sx0, sz0 - 0.55, Math.PI / 2);
  sawhorse(k, sx0, sz0 + 0.55, Math.PI / 2);
  k.box(0.32, 0.05, 1.7, '#e2bb85', { p: [sx0, base + 0.43, sz0], r: [0, 0.04, 0] });
  k.box(0.012, 0.052, 0.1, '#3d3a36', { p: [sx0, base + 0.43, sz0 + 0.15], jitter: 0 }); // the pencil line
  for (let i = 0; i < 7; i++) {
    const a = i * 2.1;
    k.ico(0.08 + (i % 3) * 0.03, '#efd5a6', { p: [sx0 + Math.cos(a) * 0.3, base + 0.02, sz0 + 0.15 + Math.sin(a) * 0.32], s: [1, 0.35, 1] });
  }
  // Offcuts by the wall.
  k.box(0.5, 0.1, 0.12, '#e2bb85', { p: [-W / 2 - 0.35, base + 0.05, zf + 0.15], r: [0, 0.6, 0] });
  k.box(0.35, 0.1, 0.12, '#d6a86f', { p: [-W / 2 - 0.2, base + 0.15, zf + 0.25], r: [0, -0.3, 0] });

  // The window's interior is white in a dusky material, so night can warm it.
  const glass = glowMat('#4a5664');
  const glassDay = glass.color.clone();
  const glassNight = new Color('#ffcf85');
  const group = k.build({ glowMaterial: glass });

  // The screen and its cursor glow on their own, day and night.
  const sk = new Kit(910);
  sk.addGlow(new BoxGeometry(0.62, 0.4, 0.01), '#1c3b33', { p: [mx, my, zf + 0.085] });
  const LINES = [0.42, 0.3, 0.48, 0.22, 0.36];
  LINES.forEach((l, i) => sk.addGlow(new BoxGeometry(l, 0.035, 0.01), i === 2 ? '#ffd27a' : '#8ff0be', { p: [mx - 0.27 + l / 2, my + 0.14 - i * 0.06, zf + 0.09] }));
  group.add(sk.build({ glowMaterial: glowMat() }));
  const ck = new Kit(911);
  ck.addGlow(new BoxGeometry(0.05, 0.045, 0.01), '#eafff3', { p: [0, 0, 0] });
  const cursor = ck.build({ glowMaterial: glowMat() });
  cursor.position.set(mx - 0.27 + 0.05, my + 0.14 - 5 * 0.06, zf + 0.095);
  group.add(cursor);

  // A saw on the plank that saws away now and then, spitting sawdust.
  const saw = new Group();
  const swk = new Kit(912);
  swk.add(new BoxGeometry(0.03, 0.16, 0.55), '#c9ced4', { p: [0, 0.08, 0], jitter: 0.01 });
  swk.rbox(0.06, 0.14, 0.16, 0.03, '#e5484d', { p: [0, 0.16, 0.33] });
  saw.add(swk.build());
  saw.position.set(sx0, base + 0.42, sz0 + 0.15);
  saw.rotation.x = -0.35;
  group.add(saw);
  const dust = new Vector3(sx0, base + 0.42, sz0 + 0.15);
  let sawT = 1.5;
  let dustT = 0;

  return {
    group,
    bouncy: group,
    glows: {
      halos: [[wx, wy, zf + 0.35, 1.9], [dx, base + dh + 0.27, zf + 0.42, 1.3], [mx, my, zf + 0.3, 0.8]],
      pools: [[wx, 0.05, zf + 1.1, 2.6], [dx, 0.05, zf + 1.2, 2.2]],
    },
    night: (n) => {
      glass.color.lerpColors(glassDay, glassNight, n);
    },
    onNear: () => {
      sawT = 0;
    },
    update: (c) => {
      cursor.visible = Math.floor(c.t * 1.8) % 2 === 0;
      // Saw in bursts: a couple of seconds of strokes, then a rest.
      sawT += c.dt;
      if (c.hover && sawT > 2.6) sawT = 0;
      if (sawT > 7) sawT = 0;
      const sawing = sawT < 2.4;
      saw.position.z = sz0 + 0.15 + (sawing ? Math.sin(sawT * 11) * 0.12 : 0);
      saw.position.y = base + 0.42 - (sawing ? Math.min(sawT, 2.4) * 0.012 : 0);
      if (sawing) {
        dustT -= c.dt;
        if (dustT <= 0) {
          dustT = 0.12;
          const w = c.toWorld(dust.clone());
          c.puffs.spawn(w.x + (Math.random() - 0.5) * 0.1, w.y, w.z, {
            vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.6,
            size: 0.05 + Math.random() * 0.03, life: 0.9, drag: 1.2, gravity: -2.4, grow: 0.2, color: '#efd5a6',
          });
        }
      }
    },
  };
}

// ---------------------------------------------------------------- mall

/** Lettering painted on a canvas in the display font, as a texture (painted again once the font is in). */
function painted(w: number, h: number, paint: (g: CanvasRenderingContext2D, font: string) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    paint(g, getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif');
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw).catch(() => {});
  return tex;
}

/** A flat quad from four corners (counter-clockwise seen from its front), for glass that follows a curve. */
function quad(a: V3, b: V3, c: V3, d: V3) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
  return g;
}

/**
 * The shopping centre over Tower Bridge: long and low, pale panels and a
 * glass front, under a big glass roof that rolls like a wave. WESTFIELD in
 * big letters over the entrance, whose glass doors slide open as you come
 * near; at one end, a Five Guys in red and white tiles. After dark the glass
 * glows warm, roof and all.
 */
export function buildMall(color: string): Built {
  const k = new Kit(1010);
  const gk = new Kit(1011);
  const W = 7.0;
  const D = 4.4;
  const hw = W / 2;
  const hd = D / 2;
  const base = 0.25;
  const top = 2.4;
  const PANEL = '#f1eee8';
  const PANEL_SHADE = '#dbd5ca';
  const FIN = '#fbfbf9';
  const STEEL = '#dfe2e5';
  const RED = '#d22630';
  /** The roof's height over (x, z): two swells along its length, a dip over the entrance, and a ripple across. */
  const roofY = (x: number, z: number) => 3.0 - 0.3 * Math.cos(x * 1.37) * (0.8 + 0.2 * Math.cos(z * 0.9)) + 0.1 * Math.sin(z * 1.3 - x * 0.7);

  // ---------- Ground, plinth and walls ----------
  k.rbox(W + 0.9, 0.14, D + 2.3, 0.05, '#ddd6ca', { p: [0, 0.07, 0.6] });
  for (let i = 0; i < 8; i++) k.box(0.03, 0.142, D + 2.2, '#cfc7b9', { p: [-hw - 0.2 + i * 1.07, 0.07, 0.6], jitter: 0 });
  k.box(W + 0.1, base, D + 0.1, PANEL_SHADE, { p: [0, base / 2, 0] });
  k.box(W, top - base, 0.24, PANEL, { p: [0, (base + top) / 2, -hd + 0.12] });
  for (const s of [-1, 1]) {
    k.box(0.24, top - base, D, PANEL, { p: [s * (hw - 0.12), (base + top) / 2, 0] });
    // Panel joints on the ends, and a fin up each corner.
    for (const z of [-1.1, 1.1]) k.box(0.02, top - base, 0.04, PANEL_SHADE, { p: [s * hw, (base + top) / 2, z], jitter: 0 });
    for (const z of [-hd, hd]) k.box(0.16, roofY(s * hw, z) - base, 0.16, FIN, { p: [s * hw, (base + roofY(s * hw, z)) / 2, z] });
    // A band of glass along each end.
    gk.addGlow(new BoxGeometry(0.04, 0.8, 2.6), '#eef6fb', { p: [s * hw, 1.45, 0] });
    for (const z of [-1.3, -0.43, 0.43, 1.3]) k.box(0.06, 0.88, 0.06, FIN, { p: [s * (hw + 0.02), 1.45, z], jitter: 0 });
    for (const y of [1.03, 1.87]) k.box(0.07, 0.06, 2.66, FIN, { p: [s * (hw + 0.02), y, 0], jitter: 0 });
  }
  // A band round the top of the walls.
  k.box(W + 0.1, 0.12, 0.3, PANEL_SHADE, { p: [0, top - 0.04, -hd + 0.12] });
  k.box(W + 0.1, 0.12, 0.18, PANEL_SHADE, { p: [0, top - 0.04, hd - 0.02] });
  for (const s of [-1, 1]) k.box(0.3, 0.12, D, PANEL_SHADE, { p: [s * (hw - 0.12), top - 0.04, 0] });

  // ---------- The glass roof ----------
  // A rolling sheet of glass panes on a white grid, a little over the walls, with glass between its edge and the walls' top.
  const RX0 = -hw - 0.3;
  const RX1 = hw + 0.3;
  const RZ0 = -hd - 0.25;
  const RZ1 = hd + 0.05;
  const N = 14;
  const M = 5;
  const gx = (i: number) => RX0 + ((RX1 - RX0) * i) / N;
  const gz = (j: number) => RZ0 + ((RZ1 - RZ0) * j) / M;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const [x0, x1, z0, z1] = [gx(i), gx(i + 1), gz(j), gz(j + 1)];
      // Each pane catches the sky a little differently as the roof rolls.
      const tilt = roofY(x1, (z0 + z1) / 2) - roofY(x0, (z0 + z1) / 2);
      const tone = (i * 7 + j * 3) % 9 === 0 ? '#ffffff' : tilt > 0.06 ? '#f2f9fd' : tilt < -0.06 ? '#d3e5f1' : '#e3eff7';
      gk.addGlow(quad([x0, roofY(x0, z0), z0], [x0, roofY(x0, z1), z1], [x1, roofY(x1, z1), z1], [x1, roofY(x1, z0), z0]), tone);
    }
  }
  const rib = (x0: number, z0: number, x1: number, z1: number, t: number) => k.beam([x0, roofY(x0, z0) + 0.03, z0], [x1, roofY(x1, z1) + 0.03, z1], t, t, FIN, 0);
  for (let j = 0; j <= M; j++) for (let i = 0; i < N; i++) rib(gx(i), gz(j), gx(i + 1), gz(j), j === 0 || j === M ? 0.12 : 0.055);
  for (let i = 0; i <= N; i++) for (let j = 0; j < M; j++) rib(gx(i), gz(j), gx(i), gz(j + 1), i === 0 || i === N ? 0.12 : 0.055);
  // Glass from the top of the walls up to the roof, all the way round.
  const band = (ax: number, az: number, bx: number, bz: number, n: number) => {
    for (let s = 0; s < n; s++) {
      const [x0, z0] = [ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n];
      const [x1, z1] = [ax + ((bx - ax) * (s + 1)) / n, az + ((bz - az) * (s + 1)) / n];
      gk.addGlow(quad([x0, top, z0], [x1, top, z1], [x1, roofY(x1, z1), z1], [x0, roofY(x0, z0), z0]), s % 2 ? '#e6f1f8' : '#dcebf5');
    }
  };
  band(-hw, hd, hw, hd, 10);
  band(hw, hd, hw, -hd, 6);
  band(hw, -hd, -hw, -hd, 10);
  band(-hw, -hd, -hw, hd, 6);

  // ---------- The front: shop windows on the right ----------
  const fz = hd - 0.04;
  const panes = [1.45, 1.94, 2.43, 2.92, hw - 0.1];
  const shops = ['#fff0d2', '#e8f4fc', '#ffe4ea', '#eaf7e6'];
  for (let i = 0; i < panes.length - 1; i++) {
    const [x0, x1] = [panes[i], panes[i + 1]];
    gk.addGlow(new BoxGeometry(x1 - x0 - 0.02, 1.25, 0.04), shops[i % shops.length], { p: [(x0 + x1) / 2, base + 0.625, fz] });
    gk.addGlow(new BoxGeometry(x1 - x0 - 0.02, top - base - 1.3, 0.04), '#e9f3f9', { p: [(x0 + x1) / 2, (base + 1.3 + top) / 2, fz] });
  }
  for (const x of panes) k.box(0.07, roofY(x, hd) - base, 0.08, FIN, { p: [x, (base + roofY(x, hd)) / 2, hd], jitter: 0 });
  k.box(hw - 1.4, 0.07, 0.09, FIN, { p: [(1.4 + hw) / 2, base + 1.28, hd], jitter: 0 });
  // Little displays in the windows: a stand of colour in each.
  for (const [x, c] of [[1.7, '#ff8fab'], [2.2, '#3a86ff'], [2.68, '#ffbe0b'], [3.17, '#2e9c8f']] as const) k.rbox(0.26, 0.42, 0.06, 0.03, c, { p: [x, base + 0.36, fz + 0.04] });

  // ---------- Five Guys, at the other end ----------
  const fx0 = -hw;
  const fx1 = -1.45;
  const fcx = (fx0 + fx1) / 2;
  k.box(fx1 - fx0, top - base, 0.2, '#fbfaf7', { p: [fcx, (base + top) / 2, hd - 0.1] });
  // Red and white checked tiles, waist high.
  const cols = 9;
  const tile = (fx1 - fx0 - 0.2) / cols;
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) k.box(tile - 0.012, tile - 0.012, 0.03, (r + c) % 2 ? RED : '#ffffff', { p: [fx0 + 0.1 + (c + 0.5) * tile, base + 0.06 + (r + 0.5) * tile, hd + 0.015], jitter: 0.01 });
  // A window into the warm inside, framed in red, and the red sign band over it.
  gk.addGlow(new BoxGeometry(fx1 - fx0 - 0.4, 0.62, 0.04), '#fff1d8', { p: [fcx, base + 1.36, hd + 0.01] });
  for (const y of [base + 1.02, base + 1.7]) k.box(fx1 - fx0 - 0.3, 0.07, 0.07, RED, { p: [fcx, y, hd + 0.03], jitter: 0 });
  for (const x of [fx0 + 0.18, fcx, fx1 - 0.18]) k.box(0.07, 0.72, 0.07, RED, { p: [x, base + 1.36, hd + 0.03], jitter: 0 });
  k.box(fx1 - fx0, 0.42, 0.12, RED, { p: [fcx, 2.16, hd + 0.03] });

  // ---------- The entrance ----------
  // Two pillars and a deep white beam, standing proud of the front, with WESTFIELD across it.
  const ez = hd + 0.35;
  for (const s of [-1, 1]) k.box(0.34, 3.56, 0.72, STEEL, { p: [s * 1.28, 1.78, ez] });
  k.box(3.0, 0.62, 0.76, FIN, { p: [0, 3.25, ez] });
  k.box(3.04, 0.06, 0.8, PANEL_SHADE, { p: [0, 2.92, ez], jitter: 0 });
  // The vestibule: glass over the doors and either side of them, a mat, and the sensor.
  gk.addGlow(new BoxGeometry(2.2, 0.82, 0.04), '#e6f1f8', { p: [0, 2.5, ez + 0.25] });
  for (const s of [-1, 1]) gk.addGlow(new BoxGeometry(0.34, 1.78, 0.04), '#e6f1f8', { p: [s * 0.94, base + 0.89, ez + 0.27] });
  for (const s of [-1, 1]) k.box(0.06, 1.8, 0.08, '#8b9198', { p: [s * 0.76, base + 0.9, ez + 0.27], jitter: 0 });
  k.box(2.2, 0.07, 0.08, '#8b9198', { p: [0, base + 1.82, ez + 0.27], jitter: 0 });
  k.box(1.5, 0.08, 0.06, '#3d3a36', { p: [0, base + 1.92, ez + 0.3], jitter: 0 });
  k.box(1.7, 0.03, 1.0, '#5b5f66', { p: [0, 0.15, ez + 0.75], jitter: 0 });
  k.box(2.3, 0.04, 0.72, '#cfd3d6', { p: [0, base + 0.02, ez], jitter: 0 });
  // Planters either side, with clipped bushes.
  for (const s of [-1, 1]) {
    k.rbox(0.72, 0.46, 0.62, 0.05, '#8d939a', { p: [s * 2.0, 0.37, hd + 0.5] });
    k.ico(0.3, '#5cb85a', { p: [s * 2.0 - 0.12, 0.78, hd + 0.48] }, 1);
    k.ico(0.24, '#4fae55', { p: [s * 2.0 + 0.16, 0.74, hd + 0.55] }, 1);
  }

  const glass = new MeshBasicMaterial({ vertexColors: true, color: '#bfe2f2', toneMapped: false });
  const glassDay = glass.color.clone();
  const glassNight = new Color('#ffd28c');
  const group = k.build();
  group.add(gk.build({ glowMaterial: glass }));

  // The sliding doors: glass in thin dark frames, opening as you come near.
  const doors = [-1, 1].map((s) => {
    const dk = new Kit(1020 + s);
    dk.addGlow(new BoxGeometry(0.7, 1.74, 0.03), '#eaf4fa', { p: [0, 0, 0] });
    for (const x of [-0.36, 0.36]) dk.addGlow(new BoxGeometry(0.05, 1.8, 0.05), '#2c3036', { p: [x, 0, 0.01] });
    for (const y of [-0.88, 0.88]) dk.addGlow(new BoxGeometry(0.76, 0.05, 0.05), '#2c3036', { p: [0, y, 0.01] });
    dk.addGlow(new BoxGeometry(0.04, 0.3, 0.05), '#9aa1a8', { p: [-s * 0.27, 0.05, 0.04] });
    const g = dk.build({ glowMaterial: glass });
    g.position.set(s * 0.37, base + 0.89, ez + 0.2);
    group.add(g);
    return { g, s };
  });

  // The signs: WESTFIELD in big red letters on the beam, FIVE GUYS in white on its red band.
  const signTex = painted(1024, 160, (g, font) => {
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 132px ${font}`;
    g.fillText('WESTFIELD', 512, 86, 990);
  });
  const fiveTex = painted(512, 128, (g, font) => {
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 92px ${font}`;
    g.fillText('FIVE GUYS', 256, 68, 480);
  });
  const signMat = new MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.6, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 });
  const sign = new Mesh(new PlaneGeometry(2.8, 0.44), signMat);
  sign.position.set(0, 3.25, ez + 0.39);
  group.add(sign);
  const fiveMat = new MeshStandardMaterial({ map: fiveTex, transparent: true, roughness: 0.6, emissive: '#ffffff', emissiveMap: fiveTex, emissiveIntensity: 0.3 });
  const five = new Mesh(new PlaneGeometry(1.7, 0.42), fiveMat);
  five.position.set(fcx, 2.16, hd + 0.095);
  group.add(five);

  let open = 0;
  return {
    group,
    bouncy: group,
    glows: {
      halos: [
        [0, 1.2, ez + 0.6, 2.4], [2.4, 1.3, hd + 0.35, 1.9], [fcx, base + 1.36, hd + 0.35, 1.5], [0, 3.25, ez + 0.6, 1.8],
        [-2.3, 3.3, 0, 2.6], [2.3, 3.4, 0, 2.6], [hw + 0.35, 1.45, 0, 1.6], [-hw - 0.35, 1.45, 0, 1.6],
      ],
      pools: [[0, 0.16, ez + 1.4, 3.2], [2.4, 0.16, hd + 1.4, 2.2], [fcx, 0.16, hd + 1.4, 2.0], [hw + 1.0, 0.1, 0, 1.8]],
    },
    night: (n) => {
      glass.color.lerpColors(glassDay, glassNight, n);
      signMat.emissiveIntensity = 0.25 + n * 0.7;
      fiveMat.emissiveIntensity = 0.3 + n * 0.6;
    },
    // Long, so its ends and corners reach past the footprint's circle.
    solid: [[-2.35, 0, 2.2], [2.35, 0, 2.2], [-2.95, -1.6, 0.9], [2.95, -1.6, 0.9], [-2.95, 1.6, 0.9], [2.95, 1.6, 0.9], [-2.0, hd + 0.5, 0.45], [2.0, hd + 0.5, 0.45]],
    update: (c) => {
      open = damp(open, c.near ? 1 : 0, 4, c.dt);
      for (const d of doors) d.g.position.x = d.s * (0.37 + open * 0.42);
    },
    dispose() {
      signTex.dispose();
      fiveTex.dispose();
    },
  };
}

export const BUILDERS = {
  cabin: buildCabin,
  taproom: buildTaproom,
  tree: buildTree,
  library: buildLibrary,
  lighthouse: buildLighthouse,
  schoolhouse: buildSchoolhouse,
  depot: buildDepot,
  mall: buildMall,
  workshop: buildWorkshop,
  pier: buildPier,
  bottle: buildBottle,
} as const;
