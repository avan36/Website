// Pooled low-poly puffs: dust under the explorer's feet, chimney smoke,
// landing rings, sparkles. One instanced mesh, no transparency: puffs pop
// in with a little overshoot and shrink away, which reads well in low-poly.

import { Color, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { easeInCubic, easeOutBack } from '../util/math';

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number; life: number; age: number;
  drag: number; gravity: number; grow: number;
  spin: number;
}

export interface PuffOpts {
  vx?: number; vy?: number; vz?: number;
  size?: number; life?: number; drag?: number; gravity?: number; grow?: number;
  color?: string;
}

export class Puffs {
  readonly mesh: InstancedMesh;
  private pool: P[] = [];
  private o = new Object3D();
  private c = new Color();
  private next = 0;

  constructor(max = 180) {
    const mat = new MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < max; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, life: 1, age: 0, drag: 1, gravity: 0, grow: 0, spin: 0 });
      this.o.scale.setScalar(0);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
      this.mesh.setColorAt(i, this.c.set('#ffffff'));
    }
  }

  spawn(x: number, y: number, z: number, o: PuffOpts = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.pool.length;
    const p = this.pool[i];
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.size = o.size ?? 0.2;
    p.life = o.life ?? 0.8;
    p.age = 0;
    p.drag = o.drag ?? 2.5;
    p.gravity = o.gravity ?? 0;
    p.grow = o.grow ?? 0.6;
    p.spin = Math.random() * 6;
    this.mesh.setColorAt(i, this.c.set(o.color ?? '#fff6e8'));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A ring of dust, e.g. for a landing. */
  ring(x: number, y: number, z: number, n = 10, speed = 2.4, color = '#f6ead2', size = 0.2) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
      this.spawn(x + Math.cos(a) * 0.3, y + 0.08, z + Math.sin(a) * 0.3, {
        vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 0.6,
        size: size * (0.8 + Math.random() * 0.5), life: 0.55 + Math.random() * 0.2, drag: 5, color,
      });
    }
  }

  update(dt: number) {
    const o = this.o;
    let dirty = false;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      dirty = true;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        o.scale.setScalar(0);
        o.updateMatrix();
        this.mesh.setMatrixAt(i, o.matrix);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.size * (1 + p.grow * t) * (t < 0.18 ? easeOutBack(t / 0.18) : 1 - easeInCubic((t - 0.18) / 0.82));
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(p.spin + t, p.spin * 0.7 + t * 0.6, 0);
      o.scale.setScalar(Math.max(s, 0.0001));
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
