// Palms, round trees, pines, bushes, rocks, grass and flowers. Everything is
// instanced, and one shader patch makes it all sway in the breeze and pop up
// with a staggered springy grow during the intro.

import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  RGBADepthPacking,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { Kit } from './kit';
import { heightAt, isOpenGround, rockiness, PLAZA, PLACES } from './shape';
import { rng } from '../util/math';

export interface SharedUniforms {
  uTime: { value: number };
  uGrow: { value: number };
}

export interface Collider {
  x: number;
  z: number;
  r: number;
}

/** Patch a material so its geometry sways (by height²) and grows in. */
export function swayPatch(uniforms: SharedUniforms, sway: number, speed = 1.3) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGrow = uniforms.uGrow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGrow;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float gh = fract(sin(dot(iPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float gt = clamp(uGrow * 1.9 - gh * 0.9, 0.0, 1.0);
        float gb = gt - 1.0;
        float gs = 1.0 + 2.9 * gb * gb * gb + 1.9 * gb * gb;
        transformed *= gs;
        float hy = max(transformed.y, 0.0);
        float ph = uTime * ${speed.toFixed(3)} + iPos.x * 0.37 + iPos.z * 0.23;
        float sw = sin(ph) + 0.35 * sin(ph * 2.3 + 1.7);
        transformed.x += sw * hy * hy * ${sway.toFixed(5)};
        transformed.z += cos(ph * 0.8) * hy * hy * ${(sway * 0.6).toFixed(5)};`,
      );
  };
}

function swayMaterials(uniforms: SharedUniforms, sway: number, speed?: number, opts: { flat?: boolean } = {}) {
  const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: opts.flat ?? true, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = swayPatch(uniforms, sway, speed);
  mat.customProgramCacheKey = () => `sway-${sway}-${speed}`;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = swayPatch(uniforms, sway, speed);
  depth.customProgramCacheKey = () => `sway-depth-${sway}-${speed}`;
  return { mat, depth };
}

// ---------- Prop geometry ----------

function palmGeometry() {
  const k = new Kit(3);
  const segs = 8;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const r = 0.25 - t * 0.1;
    const h = 0.62;
    const lean = 0.05 + t * t * 0.32;
    k.cyl(r * 0.9, r, h, i % 2 ? '#b38552' : '#9b6f42', { p: [x, y + h / 2, 0], r: [0, 0, -lean] }, 7);
    x += Math.sin(lean) * h;
    y += Math.cos(lean) * h * 0.97;
  }
  const top = [x, y, 0] as const;
  const greens = ['#3fa64a', '#4fb84f', '#37963f', '#5cc457'];
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.2;
    const col = greens[i % greens.length];
    // Inner half rises a little, outer half droops: two flattened cones.
    const len1 = 1.25;
    const len2 = 1.35;
    const up = 0.32 + (i % 3) * 0.08;
    const droop = -0.55 - (i % 2) * 0.2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const mid = [top[0] + dx * len1 * 0.5 * Math.cos(up), top[1] + len1 * 0.5 * Math.sin(up), top[2] + dz * len1 * 0.5 * Math.cos(up)];
    const tip0 = [top[0] + dx * len1 * Math.cos(up), top[1] + len1 * Math.sin(up), top[2] + dz * len1 * Math.cos(up)];
    const mid2 = [tip0[0] + dx * len2 * 0.5 * Math.cos(droop), tip0[1] + len2 * 0.5 * Math.sin(droop), tip0[2] + dz * len2 * 0.5 * Math.cos(droop)];
    // ConeGeometry points along +y; rotate it to lie along the frond direction.
    const yaw = -a;
    k.add(new ConeGeometry(0.34, len1, 4), col, { p: mid as [number, number, number], r: [0, yaw, -(Math.PI / 2 - up)], s: [0.22, 1, 1] });
    k.add(new ConeGeometry(0.3, len2, 4), col, {
      p: mid2 as [number, number, number],
      r: [0, yaw, -(Math.PI / 2 - droop)],
      s: [0.2, 1, 1],
    });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    k.sphere(0.15, '#6e4a2c', { p: [top[0] + Math.cos(a) * 0.2, top[1] - 0.18, Math.sin(a) * 0.2] }, 7, 5);
  }
  return k.geometry();
}

function roundTreeGeometry(variant: number) {
  const k = new Kit(10 + variant);
  k.cyl(0.16, 0.26, 1.7, '#8a5a3b', { p: [0, 0.85, 0] }, 7);
  k.cyl(0.07, 0.1, 0.7, '#8a5a3b', { p: [0.32, 1.55, 0], r: [0, 0, -0.7] }, 5);
  const greens = variant ? ['#4fae55', '#62c060', '#45a04d'] : ['#69c35a', '#7ed166', '#58b452'];
  k.add(new IcosahedronGeometry(1.15, 1), greens[0], { p: [0, 2.45, 0], s: [1, 0.92, 1] });
  k.add(new IcosahedronGeometry(0.85, 1), greens[1], { p: [0.6, 2.15, 0.35] });
  k.add(new IcosahedronGeometry(0.75, 1), greens[2], { p: [-0.55, 2.2, -0.3] });
  k.add(new IcosahedronGeometry(0.62, 1), greens[1], { p: [0.05, 3.25, 0.1] });
  return k.geometry();
}

function pineGeometry() {
  const k = new Kit(21);
  k.cyl(0.12, 0.2, 1.0, '#7d5236', { p: [0, 0.5, 0] }, 6);
  k.cone(1.15, 1.5, '#3e9c63', { p: [0, 1.45, 0] }, 7);
  k.cone(0.92, 1.3, '#4aac6c', { p: [0, 2.2, 0] }, 7);
  k.cone(0.66, 1.1, '#57ba74', { p: [0, 2.9, 0] }, 7);
  return k.geometry();
}

function bushGeometry() {
  const k = new Kit(31);
  k.add(new IcosahedronGeometry(0.55, 1), '#56b04f', { p: [0, 0.38, 0], s: [1, 0.8, 1] });
  k.add(new IcosahedronGeometry(0.42, 1), '#6cc35b', { p: [0.45, 0.3, 0.12], s: [1, 0.85, 1] });
  k.add(new IcosahedronGeometry(0.36, 1), '#4aa449', { p: [-0.38, 0.26, -0.1] });
  return k.geometry();
}

function rockGeometry(seed: number) {
  const k = new Kit(seed);
  k.dodeca(0.6, '#b5ada3', { p: [0, 0.22, 0], s: [1.2, 0.7, 1], r: [0.2, seed, 0.1], jitter: 0.06 });
  k.dodeca(0.34, '#a29a90', { p: [0.55, 0.12, 0.2], s: [1, 0.75, 1.1], r: [0.5, 0.3, 0.2], jitter: 0.06 });
  return k.geometry();
}

function tuftGeometry() {
  const k = new Kit(41);
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const tilt = 0.28 + (i % 2) * 0.12;
    k.add(new ConeGeometry(0.06, 0.48 + (i % 3) * 0.08, 3), i % 2 ? '#78c457' : '#62b24c', {
      p: [Math.cos(a) * 0.07, 0.22, Math.sin(a) * 0.07],
      r: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt],
      jitter: 0.02,
    });
  }
  return k.geometry();
}

function flowerGeometry() {
  const k = new Kit(51);
  k.add(new CylinderGeometry(0.018, 0.022, 0.34, 4), '#5aa548', { p: [0, 0.17, 0] });
  return k.geometry();
}
function petalGeometry() {
  const k = new Kit(52);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(new IcosahedronGeometry(0.075, 0), '#ffffff', { p: [Math.cos(a) * 0.08, 0.36, Math.sin(a) * 0.08], s: [1, 0.45, 1], jitter: 0 });
  }
  k.add(new IcosahedronGeometry(0.055, 0), '#ffd23f', { p: [0, 0.38, 0], jitter: 0 });
  return k.geometry();
}

// ---------- Scatter ----------

type Spot = { x: number; z: number; y: number; s: number; rot: number };

function scatter(
  count: number,
  rand: () => number,
  accept: (x: number, z: number, h: number) => boolean,
  minDist: number,
  taken: Spot[] = [],
  scale: [number, number] = [0.85, 1.2],
) {
  const out: Spot[] = [];
  let tries = 0;
  while (out.length < count && tries < count * 200) {
    tries++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 34;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (!accept(x, z, h)) continue;
    let ok = true;
    for (const o of out) if ((o.x - x) ** 2 + (o.z - z) ** 2 < minDist * minDist) { ok = false; break; }
    if (ok) for (const o of taken) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (minDist * 0.7) ** 2) { ok = false; break; }
    if (!ok) continue;
    out.push({ x, z, y: h, s: scale[0] + rand() * (scale[1] - scale[0]), rot: rand() * Math.PI * 2 });
  }
  return out;
}

function instanced(geo: BufferGeometry, mats: { mat: MeshStandardMaterial; depth: MeshDepthMaterial }, spots: Spot[], cast: boolean, sink = 0.05) {
  const mesh = new InstancedMesh(geo, mats.mat, spots.length);
  mesh.customDepthMaterial = mats.depth;
  const o = new Object3D();
  spots.forEach((s, i) => {
    o.position.set(s.x, s.y - sink, s.z);
    o.rotation.set(0, s.rot, 0);
    o.scale.setScalar(s.s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildNature(uniforms: SharedUniforms, lite = false) {
  const group = new Group();
  group.name = 'nature';
  const rand = rng(7);
  const colliders: Collider[] = [];
  const all: Spot[] = [];
  // Keep a clear sight line in front of each landmark (the camera looks from +z).
  const nearPlaza = (x: number, z: number) => Math.hypot(x - PLAZA.x, z - PLAZA.z) < 7;
  // Tall things stay out of the strip between each place and the camera.
  const blocksView = (x: number, z: number) =>
    PLACES.some((p) => z > p.z && z - p.z < 9 && Math.abs(x - p.x) < 4.5) ||
    (Math.abs(x) < 6 && z > 0 && z < 16) ||
    Math.hypot(x - PLACES.find((p) => p.kind === 'tree')!.x, z - PLACES.find((p) => p.kind === 'tree')!.z) < 8.5;

  const palms = scatter(
    17,
    rand,
    (x, z, h) => h > 0.42 && h < 1.05 && rockiness(x, z) < 0.25 && isOpenGround(x, z, 0.6) && !(z > 10 && Math.abs(x - 2) < 7),
    3.4,
    all,
    [0.85, 1.15],
  );
  all.push(...palms);
  const trees = scatter(
    16,
    rand,
    (x, z, h) => h > 1.0 && rockiness(x, z) < 0.3 && isOpenGround(x, z, 1.4) && !nearPlaza(x, z) && !blocksView(x, z),
    4.2,
    all,
  );
  all.push(...trees);
  const pines = scatter(9, rand, (x, z, h) => h > 1.0 && z < -2 && rockiness(x, z) < 0.5 && isOpenGround(x, z, 1.2) && !blocksView(x, z), 3, all, [0.9, 1.3]);
  all.push(...pines);
  const bushes = scatter(30, rand, (x, z, h) => h > 0.75 && isOpenGround(x, z, 0.4) && !nearPlaza(x, z), 1.8, all, [0.7, 1.3]);
  const rocks = scatter(
    34,
    rand,
    (x, z, h) => (h > 0.0 && h < 0.5 && isOpenGround(x, z, 0)) || (rockiness(x, z) > 0.5 && h > 0.2 && isOpenGround(x, z, -0.6)),
    1.5,
    all,
    [0.6, 1.5],
  );
  const tufts = scatter(lite ? 120 : 230, rand, (x, z, h) => h > 0.7 && isOpenGround(x, z, -0.7), 0.6, [], [0.8, 1.4]);
  const flowers = scatter(lite ? 80 : 120, rand, (x, z, h) => h > 0.85 && isOpenGround(x, z, -0.5) && rockiness(x, z) < 0.3, 0.45, [], [0.8, 1.25]);

  const palmM = swayMaterials(uniforms, 0.0045, 1.1);
  const treeM = swayMaterials(uniforms, 0.006, 1.3);
  const stiffM = swayMaterials(uniforms, 0.0, 1);
  const grassM = swayMaterials(uniforms, 0.35, 2.2);

  group.add(instanced(palmGeometry(), palmM, palms, true, 0.1));
  const half = Math.ceil(trees.length / 2);
  group.add(instanced(roundTreeGeometry(0), treeM, trees.slice(0, half), true));
  group.add(instanced(roundTreeGeometry(1), treeM, trees.slice(half), true));
  group.add(instanced(pineGeometry(), treeM, pines, true));
  group.add(instanced(bushGeometry(), treeM, bushes, true));
  group.add(instanced(rockGeometry(3), stiffM, rocks.filter((_, i) => i % 2 === 0), true, 0.12));
  group.add(instanced(rockGeometry(8), stiffM, rocks.filter((_, i) => i % 2 === 1), true, 0.12));
  group.add(instanced(tuftGeometry(), grassM, tufts, false, 0.04));
  group.add(instanced(flowerGeometry(), grassM, flowers, false, 0.02));
  const heads = instanced(petalGeometry(), grassM, flowers, false, 0.02);
  const palette = ['#ff8fab', '#ffffff', '#ffd166', '#c49bff', '#ff9f6b', '#ffffff'];
  const c = new Color();
  flowers.forEach((_, i) => heads.setColorAt(i, c.set(palette[i % palette.length])));
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(heads);

  for (const p of palms) colliders.push({ x: p.x + 0.2, z: p.z, r: 0.45 });
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: 0.55 * t.s });
  for (const t of pines) colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s });
  for (const r of rocks) if (r.s > 1.1) colliders.push({ x: r.x, z: r.z, r: 0.55 * r.s });

  return { group, colliders };
}
