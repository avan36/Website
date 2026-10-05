// The island mesh: a jittered grid displaced by the height field, colored per
// face (sand, grass patches, the dirt paths, rock on the headland).

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { heightAt, ISLANDS, pathDist, rockiness } from './shape';
import { fbm, noise2 } from '../util/noise';
import { clamp, rng, smoothstep } from '../util/math';

/** The square the land is built over: the main island, the islets off its west coast, and their shelves. */
export const TERRAIN_SIZE = 112;
/** How far east the land goes on past that square: out over Little London and its shelf. */
const EAST = Math.max(TERRAIN_SIZE / 2, ...ISLANDS.map((s) => s.x + s.outer * 1.35));

const C = {
  sandDry: new Color('#f4dca6'),
  sandWet: new Color('#dcbf88'),
  seabed: new Color('#c9b98a'),
  seabedDeep: new Color('#4f9c9a'),
  grassA: new Color('#8fd162'),
  grassB: new Color('#69bd4f'),
  grassC: new Color('#52a745'),
  bank: new Color('#b4c95f'),
  path: new Color('#e9c88a'),
  pathEdge: new Color('#d3bf74'),
  rock: new Color('#a59d93'),
  rockDark: new Color('#8a8279'),
};

export function buildTerrain() {
  const N = 154; // about 0.73 a cell
  const size = TERRAIN_SIZE;
  const cell = size / N;
  // Wider than it is deep when an islet lies off the east end, at the same size of cell.
  const NX = Math.ceil((EAST + size / 2) / cell);
  const rand = rng(42);
  const vx = new Float32Array((NX + 1) * (N + 1));
  const vz = new Float32Array((NX + 1) * (N + 1));
  const vy = new Float32Array((NX + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i;
      const edge = i === 0 || j === 0 || i === NX || j === N;
      const x = -size / 2 + i * cell + (edge ? 0 : (rand() - 0.5) * cell * 0.62);
      const z = -size / 2 + j * cell + (edge ? 0 : (rand() - 0.5) * cell * 0.62);
      vx[k] = x;
      vz[k] = z;
      vy[k] = heightAt(x, z);
    }
  }

  const pos: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const tri = (a: number, b: number, d: number) => {
    const ys = [vy[a], vy[b], vy[d]];
    if (ys[0] < -5.5 && ys[1] < -5.5 && ys[2] < -5.5) return; // hidden under deep water
    pos.push(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[d], vy[d], vz[d]);
    const cx = (vx[a] + vx[b] + vx[d]) / 3;
    const cz = (vz[a] + vz[b] + vz[d]) / 3;
    const cy = (ys[0] + ys[1] + ys[2]) / 3;
    // Face normal's y (steepness).
    const ux = vx[b] - vx[a], uy = vy[b] - vy[a], uz = vz[b] - vz[a];
    const wx = vx[d] - vx[a], wy = vy[d] - vy[a], wz = vz[d] - vz[a];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const steep = 1 - Math.abs(ny) / Math.hypot(nx, ny, nz);
    faceColor(c, cx, cy, cz, steep, rand);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const d = a + NX + 1;
      const e = d + 1;
      if ((i + j) % 2) {
        tri(a, d, b);
        tri(b, d, e);
      } else {
        tri(a, d, e);
        tri(a, e, b);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** A turned rectangle of ground, and the height to keep it under (see pressGround()). */
export type Press = { x: number; z: number; yaw: number; hw: number; hd: number; y: number };

/**
 * Press the ground down flat, to no higher than `y`, inside a turned
 * rectangle: where a building's room has been set down on it, so the slope
 * of a neighbour's plot doesn't poke up through the floor. Null puts all the
 * ground back as it was.
 */
export function pressGround(mesh: Mesh, at: Press | null) {
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
  const ys = (mesh.userData.heights ??= Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i))) as Float32Array;
  const c = at ? Math.cos(at.yaw) : 1;
  const s = at ? Math.sin(at.yaw) : 0;
  let lo = Infinity;
  let hi = -1;
  for (let i = 0; i < pos.count; i++) {
    let y = ys[i];
    if (at) {
      const dx = pos.getX(i) - at.x;
      const dz = pos.getZ(i) - at.z;
      // Into the rectangle's own terms (its +z is the way it faces).
      if (Math.abs(dx * c - dz * s) < at.hw && Math.abs(dx * s + dz * c) < at.hd) y = Math.min(y, at.y);
    }
    if (y !== pos.getY(i)) {
      pos.setY(i, y);
      lo = Math.min(lo, i);
      hi = i;
    }
  }
  if (hi < 0) return;
  pos.clearUpdateRanges();
  pos.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
  pos.needsUpdate = true;
}

function faceColor(c: Color, x: number, y: number, z: number, steep: number, rand: () => number) {
  const jitter = (rand() - 0.5) * 0.06;
  if (y < 0.02) {
    c.copy(C.seabed).lerp(C.seabedDeep, smoothstep(0.1, 3.2, -y));
  } else if (y < 0.62) {
    c.copy(C.sandWet).lerp(C.sandDry, smoothstep(0.05, 0.32, y));
    // where sand meets grass, a hint of dry grass
    c.lerp(C.bank, smoothstep(0.5, 0.75, y) * 0.6);
  } else {
    const n = fbm(x * 0.09, z * 0.09, 3, 11);
    const m = noise2(x * 0.35, z * 0.35, 5);
    c.copy(C.grassA).lerp(C.grassB, smoothstep(0.38, 0.62, n));
    c.lerp(C.grassC, smoothstep(0.62, 0.8, n) * 0.7);
    if (m > 0.78) c.lerp(C.grassA, 0.5);
    c.lerp(C.bank, (1 - smoothstep(0.62, 0.95, y)) * 0.55);
    const pd = pathDist(x, z);
    if (pd < 1.15) c.copy(pd < 0.75 ? C.path : C.pathEdge);
    else if (pd < 1.45) c.lerp(C.pathEdge, 0.45);
  }
  const rock = rockiness(x, z);
  if (y > 0.3 && (rock > 0.45 && (steep > 0.35 || y < 1.9))) c.copy(steep > 0.55 ? C.rockDark : C.rock);
  if (y > 0.3 && steep > 0.62 && rock < 0.45) c.lerp(C.rock, 0.5);
  c.offsetHSL(0, 0, jitter * clamp(1));
}

/**
 * The island's height baked into a texture so the water shader can tint the
 * shallows and draw foam exactly where sand meets the sea.
 */
export function buildHeightTexture(res = 300, extent = TERRAIN_SIZE) {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = -extent / 2 + ((i + 0.5) / res) * extent;
      const z = -extent / 2 + ((j + 0.5) / res) * extent;
      // Encode -8..+4 into 0..1.
      const h = clamp((heightAt(x, z) + 8) / 12);
      const v = Math.round(h * 255);
      const k = (j * res + i) * 4;
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  const tex = new DataTexture(data, res, res, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return { tex, extent };
}
