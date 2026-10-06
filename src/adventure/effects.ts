// The air over Wesleyan: clouds drifting high up, autumn leaves falling round
// the car, and a glowing arrow over the car that points at the next gate.
// Dust and tyre smoke use the island's pooled puffs (world/particles.ts).

import {
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  DoubleSide,
} from 'three';
import { Kit } from '../renderers/island/world/kit';
import { rng } from '../renderers/island/util/math';

/** A dozen low-poly clouds, high and slow, out of the fog's reach. */
export function clouds(): Group {
  const rand = rng(77);
  const group = new Group();
  const k = new Kit(78);
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = 120 + rand() * 260;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 85 + rand() * 50;
    const n = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < n; j++) {
      const s = 7 + rand() * 9;
      k.ico(s, j % 3 ? '#fbf6ec' : '#eee7da', { p: [x + (j - n / 2) * 7 + rand() * 4, y + rand() * 4, z + (rand() - 0.5) * 10], s: [1.4, 0.75, 1.1], jitter: 0.03 }, 1);
    }
  }
  const built = k.build({ castShadow: false, receiveShadow: false });
  built.traverse((o) => {
    if (o instanceof Mesh) o.material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false, emissive: '#f4eee2', emissiveIntensity: 0.35 });
  });
  group.add(built);
  return group;
}

const LEAF_COLORS = ['#d8913a', '#c9672f', '#e0b043', '#a7442c', '#b8792f'];

/** Leaves falling in a box that follows the car, each tumbling and drifting on the breeze. */
export class Leaves {
  readonly mesh: InstancedMesh;
  private p: { x: number; y: number; z: number; vy: number; ph: number; spin: number }[] = [];
  private o = new Object3D();
  private readonly R = 45;

  constructor(n = 260) {
    const geo = new PlaneGeometry(0.34, 0.24);
    this.mesh = new InstancedMesh(geo, new MeshStandardMaterial({ side: DoubleSide, roughness: 0.8 }), n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const rand = rng(91);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      this.p.push({ x: (rand() - 0.5) * 2 * this.R, y: rand() * 18, z: (rand() - 0.5) * 2 * this.R, vy: 0.8 + rand() * 0.9, ph: rand() * 10, spin: 1 + rand() * 3 });
      this.mesh.setColorAt(i, c.set(LEAF_COLORS[i % LEAF_COLORS.length]));
    }
  }

  update(dt: number, t: number, cx: number, cz: number, ground: (x: number, z: number) => number) {
    const R = this.R;
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i];
      q.y -= q.vy * dt;
      q.x += (0.9 + Math.sin(t * 0.7 + q.ph) * 0.8) * dt;
      q.z += Math.cos(t * 0.5 + q.ph) * 0.5 * dt;
      // Keep them round the car: wrap at the box's edges, and send fallen ones back up.
      if (q.x - cx > R) q.x -= 2 * R;
      if (cx - q.x > R) q.x += 2 * R;
      if (q.z - cz > R) q.z -= 2 * R;
      if (cz - q.z > R) q.z += 2 * R;
      const g = ground(q.x, q.z);
      if (q.y < g + 0.05) q.y = g + 14 + Math.random() * 6;
      this.o.position.set(q.x, q.y, q.z);
      this.o.rotation.set(t * q.spin + q.ph, t * q.spin * 0.7, Math.sin(t * 2 + q.ph));
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A glowing chevron that floats ahead of the car and turns toward the next gate. */
export function pointer(color: string): Mesh {
  const geo = new ConeGeometry(0.55, 1.5, 3);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 0.35, 1);
  const mat = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.9 });
  const m = new Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
