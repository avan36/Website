// A tiny modelling kit: add primitives with a color and a transform, then
// merge them into one vertex-colored, flat-shaded mesh. Each landmark is a
// handful of draw calls instead of dozens.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../util/math';

export type V3 = [number, number, number];
export interface PartOpts {
  p?: V3;
  r?: V3;
  s?: V3 | number;
  /** Per-face lightness jitter, for a hand-made faceted look. */
  jitter?: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _c = new Color();
const _hsl = { h: 0, s: 0, l: 0 };

let sharedLit: MeshStandardMaterial | null = null;
export function litMaterial() {
  if (!sharedLit) {
    sharedLit = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
  }
  return sharedLit;
}
export function resetSharedMaterials() {
  sharedLit?.dispose();
  sharedLit = null;
}

/** Bake a transform and a color into a non-indexed geometry ready to merge. */
export function prep(geo: BufferGeometry, color: string | number, o: PartOpts = {}, rand: () => number = Math.random) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const s = o.s ?? 1;
  const sv = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(...s);
  _e.set(...(o.r ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _m.compose(new Vector3(...(o.p ?? [0, 0, 0])), _q, sv);
  g.applyMatrix4(_m);

  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  const jitter = o.jitter ?? 0.035;
  for (let i = 0; i < n; i += 3) {
    _c.set(color).getHSL(_hsl, 'srgb');
    const l = Math.min(1, Math.max(0, _hsl.l + (rand() - 0.5) * 2 * jitter));
    _c.setHSL(_hsl.h, _hsl.s, l, 'srgb');
    for (let k = 0; k < 3 && i + k < n; k++) {
      col[(i + k) * 3] = _c.r;
      col[(i + k) * 3 + 1] = _c.g;
      col[(i + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

export class Kit {
  private lit: BufferGeometry[] = [];
  private glow: BufferGeometry[] = [];
  readonly rand: () => number;
  constructor(seed = 1) {
    this.rand = rng(seed);
  }

  add(geo: BufferGeometry, color: string | number, o: PartOpts = {}) {
    this.lit.push(prep(geo, color, o, this.rand));
    return this;
  }
  /** Unlit, always-bright parts: windows, bulbs, the lamp. */
  addGlow(geo: BufferGeometry, color: string | number, o: PartOpts = {}) {
    this.glow.push(prep(geo, color, { ...o, jitter: 0 }, this.rand));
    return this;
  }

  // Shorthands. Positions are centers unless noted.
  box(w: number, h: number, d: number, color: string, o: PartOpts = {}) {
    return this.add(new BoxGeometry(w, h, d), color, o);
  }
  rbox(w: number, h: number, d: number, radius: number, color: string, o: PartOpts = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2) * 0.999), color, o);
  }
  cyl(rt: number, rb: number, h: number, color: string, o: PartOpts = {}, seg = 10) {
    return this.add(new CylinderGeometry(rt, rb, h, seg), color, o);
  }
  cone(r: number, h: number, color: string, o: PartOpts = {}, seg = 8) {
    return this.add(new ConeGeometry(r, h, seg), color, o);
  }
  ico(r: number, color: string, o: PartOpts = {}, detail = 0) {
    return this.add(new IcosahedronGeometry(r, detail), color, o);
  }
  dodeca(r: number, color: string, o: PartOpts = {}) {
    return this.add(new DodecahedronGeometry(r, 0), color, o);
  }
  octa(r: number, color: string, o: PartOpts = {}) {
    return this.add(new OctahedronGeometry(r, 0), color, o);
  }
  sphere(r: number, color: string, o: PartOpts = {}, ws = 10, hs = 8) {
    return this.add(new SphereGeometry(r, ws, hs), color, o);
  }
  torus(r: number, tube: number, color: string, o: PartOpts = {}, rs = 6, ts = 16, arc = Math.PI * 2) {
    return this.add(new TorusGeometry(r, tube, rs, ts, arc), color, o);
  }
  lathe(points: [number, number][], color: string, o: PartOpts = {}, seg = 12) {
    return this.add(new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), seg), color, o);
  }

  /** Triangular prism (a gable / attic). `p` is the base center; ridge runs along z. */
  gable(w: number, h: number, d: number, color: string, o: PartOpts = {}) {
    const g = new CylinderGeometry(1, 1, d, 3);
    g.rotateX(-Math.PI / 2);
    g.scale(w / 1.732, h / 1.5, 1);
    g.translate(0, h / 3, 0);
    return this.add(g, color, o);
  }

  /** A pitched roof made of two slabs over a gable of width w and height h, ridge along z. */
  roof(w: number, h: number, d: number, baseY: number, color: string, o: { overhang?: number; thick?: number; z?: number } = {}) {
    const over = o.overhang ?? 0.45;
    const thick = o.thick ?? 0.22;
    const a = Math.atan2(h, w / 2);
    const len = Math.hypot(w / 2, h) + over;
    for (const side of [-1, 1]) {
      const mx = side * (w / 4) + side * Math.cos(a) * (over / 2) + side * Math.sin(a) * (thick / 2);
      const my = baseY + h / 2 - Math.sin(a) * (over / 2) + Math.cos(a) * (thick / 2);
      this.rbox(len, thick, d, 0.06, color, { p: [mx, my, o.z ?? 0], r: [0, 0, -side * a] });
    }
    // ridge cap
    this.rbox(0.3, 0.18, d + 0.04, 0.06, color, { p: [0, baseY + h + thick * 0.9, o.z ?? 0] });
    return this;
  }

  isEmpty() {
    return this.lit.length === 0 && this.glow.length === 0;
  }

  /**
   * Merge everything into a Group of at most two meshes. Each mesh remembers
   * how many vertices each part had (`userData.parts`), so it can be split
   * apart again by whole parts later (a building's roof from its walls).
   */
  build(opts: { castShadow?: boolean; receiveShadow?: boolean; glowMaterial?: Material } = {}) {
    const group = new Group();
    const parts = (list: BufferGeometry[]) => list.map((g) => g.getAttribute('position').count);
    if (this.lit.length) {
      const g = mergeGeometries(this.lit, false)!;
      const m = new Mesh(g, litMaterial());
      m.castShadow = opts.castShadow ?? true;
      m.receiveShadow = opts.receiveShadow ?? true;
      m.userData.parts = parts(this.lit);
      group.add(m);
    }
    if (this.glow.length) {
      const g = mergeGeometries(this.glow, false)!;
      const m = new Mesh(g, opts.glowMaterial ?? new MeshBasicMaterial({ vertexColors: true }));
      m.userData.parts = parts(this.glow);
      group.add(m);
    }
    this.lit.forEach((g) => g.dispose());
    this.glow.forEach((g) => g.dispose());
    this.lit = [];
    this.glow = [];
    return group;
  }

  /** Merge into a single geometry (used for instanced props). */
  geometry() {
    const g = mergeGeometries(this.lit, false)!;
    this.lit.forEach((x) => x.dispose());
    this.lit = [];
    return g;
  }
}
