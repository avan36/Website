// The explorer: a round little marshmallow with an orange scarf, a backpack
// and a sprout. Owns its own movement (with circle collisions and staying on
// land) and all the juice: hop, squash and stretch, dust, blinks, glances.

import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  CylinderGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, dampAngle, Spring } from './util/math';
import type { Puffs } from './world/particles';
import type { Collider } from './world/nature';
import { groundAt, isWalkable } from './world/shape';

const SPEED = 5.4;
const BODY_R = 0.5;
const SCALE = 1.35;

export class Explorer {
  readonly root = new Group();
  readonly pos = new Vector3();
  readonly vel = new Vector2();
  yaw = 0;
  /** Vertical offset above the ground (drop-in, hops). */
  private air = 0;
  private airVel = 0;
  grounded = true;

  private squashG = new Group();
  private bodyG = new Group();
  private eyes = new Group();
  private lids: Mesh[] = [];
  private armL: Group;
  private armR: Group;
  private footL: Mesh;
  private footR: Mesh;
  private tail = new Group();
  private sprout = new Group();
  private shadow: Mesh;
  private mats: (MeshStandardMaterial | MeshBasicMaterial)[] = [];

  private phase = 0;
  private walkAmt = 0;
  private land = new Spring(1, 260, 10);
  private blinkT = 2;
  private lookT = 3;
  private look = new Vector2();
  private lookTarget = new Vector2();
  private idleTime = 0;
  private lastSin = 0;
  onStep?: () => void;
  onLand?: (impact: number) => void;

  constructor() {
    const white = this.mat(new MeshStandardMaterial({ color: '#fffaf1', roughness: 0.55 }));
    const ink = this.mat(new MeshStandardMaterial({ color: '#1f1a17', roughness: 0.3 }));
    const shine = this.mat(new MeshBasicMaterial({ color: '#ffffff' }));
    const blush = this.mat(new MeshStandardMaterial({ color: '#ff9e9e', roughness: 0.8 }));
    const orange = this.mat(new MeshStandardMaterial({ color: '#ff5a36', roughness: 0.7 }));
    const pack = this.mat(new MeshStandardMaterial({ color: '#e7ac68', roughness: 0.8 }));
    const leaf = this.mat(new MeshStandardMaterial({ color: '#57c15a', roughness: 0.7, flatShading: true }));
    const boot = this.mat(new MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.8 }));

    this.root.add(this.squashG);
    this.root.scale.setScalar(SCALE);
    this.squashG.add(this.bodyG);
    this.bodyG.position.y = 0.12;

    const body = new Mesh(new SphereGeometry(0.5, 36, 26), white);
    body.scale.set(1, 0.94, 0.96);
    body.position.y = 0.47;
    body.castShadow = true;
    this.bodyG.add(body);

    // Face
    this.eyes.position.set(0, 0.56, 0.4);
    for (const s of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.075, 16, 12), ink);
      eye.scale.set(0.85, 1.2, 0.55);
      eye.position.set(s * 0.155, 0, 0.04);
      const hl = new Mesh(new SphereGeometry(0.024, 8, 6), shine);
      hl.position.set(s * 0.155 + 0.025, 0.04, 0.085);
      this.eyes.add(eye, hl);
      this.lids.push(eye);
      const cheek = new Mesh(new SphereGeometry(0.075, 12, 8), blush);
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(s * 0.27, 0.43, 0.37);
      this.bodyG.add(cheek);
    }
    const mouth = new Mesh(new TorusGeometry(0.045, 0.013, 6, 12, Math.PI), ink);
    mouth.rotation.set(0, 0, Math.PI);
    mouth.position.set(0, 0.47, 0.465);
    this.bodyG.add(this.eyes, mouth);

    // Scarf with a fluttering tail
    const scarf = new Mesh(new TorusGeometry(0.4, 0.085, 10, 28), orange);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.27;
    scarf.scale.set(1.04, 1.0, 1.0);
    scarf.castShadow = true;
    this.bodyG.add(scarf);
    this.tail.position.set(0.17, 0.27, -0.38);
    const t1 = new Mesh(new RoundedBoxGeometry(0.16, 0.34, 0.07, 2, 0.03), orange);
    t1.position.y = -0.15;
    const t2 = new Mesh(new RoundedBoxGeometry(0.13, 0.12, 0.08, 2, 0.03), orange);
    t2.position.set(0.01, -0.32, 0);
    this.tail.add(t1, t2);
    this.bodyG.add(this.tail);

    // Backpack
    const bag = new Mesh(new RoundedBoxGeometry(0.46, 0.44, 0.22, 3, 0.08), pack);
    bag.position.set(0, 0.5, -0.43);
    bag.rotation.x = 0.12;
    bag.castShadow = true;
    const flap = new Mesh(new RoundedBoxGeometry(0.48, 0.18, 0.24, 2, 0.06), orange);
    flap.position.set(0, 0.68, -0.44);
    flap.rotation.x = 0.12;
    const roll = new Mesh(new CylinderGeometry(0.08, 0.08, 0.5, 12), this.mat(new MeshStandardMaterial({ color: '#7fb6d8', roughness: 0.8 })));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.79, -0.38);
    this.bodyG.add(bag, flap, roll);

    // Sprout
    this.sprout.position.set(0.02, 0.92, 0);
    const stem = new Mesh(new CylinderGeometry(0.018, 0.024, 0.18, 6), leaf);
    stem.position.y = 0.08;
    const l1 = new Mesh(new SphereGeometry(0.08, 8, 6), leaf);
    l1.scale.set(1.3, 0.35, 0.7);
    l1.position.set(0.09, 0.18, 0);
    l1.rotation.z = 0.5;
    const l2 = l1.clone();
    l2.position.x = -0.09;
    l2.rotation.z = -0.5;
    this.sprout.add(stem, l1, l2);
    this.bodyG.add(this.sprout);

    // Little arms
    const mkArm = (s: number) => {
      const g = new Group();
      g.position.set(s * 0.46, 0.38, 0);
      const a = new Mesh(new SphereGeometry(0.1, 12, 10), white);
      a.scale.set(0.8, 1.15, 0.8);
      a.position.y = -0.06;
      g.add(a);
      this.bodyG.add(g);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // Feet
    const mkFoot = (s: number) => {
      const f = new Mesh(new SphereGeometry(0.12, 14, 10), boot);
      f.scale.set(1, 0.62, 1.35);
      f.position.set(s * 0.18, 0.06, 0.04);
      f.castShadow = true;
      this.squashG.add(f);
      return f;
    };
    this.footL = mkFoot(-1);
    this.footR = mkFoot(1);

    // Blob shadow
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(40,30,20,0.55)');
    grd.addColorStop(0.55, 'rgba(40,30,20,0.3)');
    grd.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new CanvasTexture(c);
    const sm = this.mat(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.shadow = new Mesh(new PlaneGeometry(1.25 * SCALE, 1.25 * SCALE), sm);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
  }

  private mat<T extends MeshStandardMaterial | MeshBasicMaterial>(m: T) {
    this.mats.push(m);
    return m;
  }

  /** The blob shadow lives outside the root so it stays on the ground. */
  get shadowMesh() {
    return this.shadow;
  }

  place(x: number, z: number, yaw = 0, air = 0) {
    this.pos.set(x, groundAt(x, z), z);
    this.vel.set(0, 0);
    this.yaw = yaw;
    this.air = air;
    this.airVel = 0;
    this.grounded = air <= 0;
    this.sync();
  }

  hop(v = 6) {
    if (!this.grounded) return;
    this.airVel = v;
    this.grounded = false;
    this.land.kick(4);
  }

  faceToward(x: number, z: number) {
    this.yawTarget = Math.atan2(x - this.pos.x, z - this.pos.z);
  }
  private yawTarget: number | null = null;

  /**
   * Move with a desired direction (length 0..1). Returns true if movement was
   * blocked (so click-to-walk can give up instead of pushing into a wall).
   */
  move(dt: number, wish: Vector2, colliders: Collider[]) {
    const max = SPEED * clamp(wish.length(), 0, 1);
    const dir = wish.lengthSq() > 1e-6 ? wish.clone().normalize() : new Vector2();
    const tx = dir.x * max;
    const tz = dir.y * max;
    const accel = max > 0.01 ? 16 : 12;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.y = damp(this.vel.y, tz, accel, dt);
    if (this.vel.lengthSq() < 1e-4 && max < 0.01) this.vel.set(0, 0);

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.y * dt;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const dx = nx - c.x;
        const dz = nz - c.z;
        const R = c.r + BODY_R;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 0.001;
          nx = c.x + (dx / d) * R;
          nz = c.z + (dz / d) * R;
        }
      }
    }
    let blocked = false;
    if (!isWalkable(nx, nz)) {
      if (isWalkable(nx, this.pos.z)) nz = this.pos.z;
      else if (isWalkable(this.pos.x, nz)) nx = this.pos.x;
      else {
        nx = this.pos.x;
        nz = this.pos.z;
      }
      blocked = true;
    }
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    if (max > 0.5 && moved < max * dt * 0.25) blocked = true;
    // Use the actual displacement as velocity, so sliding feels right.
    if (dt > 0) {
      this.vel.set((nx - this.pos.x) / dt, (nz - this.pos.z) / dt);
    }
    this.pos.x = nx;
    this.pos.z = nz;
    return blocked;
  }

  get speed() {
    return this.vel.length();
  }

  update(t: number, dt: number, puffs: Puffs) {
    const speed = this.speed;
    const ground = groundAt(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, ground, 25, dt);

    // Vertical: drop-in and hops
    if (!this.grounded) {
      this.airVel -= 32 * dt;
      this.air += this.airVel * dt;
      if (this.air <= 0) {
        const impact = Math.min(1.6, -this.airVel / 10);
        this.air = 0;
        this.airVel = 0;
        this.grounded = true;
        this.land.kick(-9 * impact);
        this.onLand?.(impact);
        if (impact > 0.5) puffs.ring(this.pos.x, this.pos.y, this.pos.z, 10, 2.6 * impact, '#fbf1dc', 0.22);
      }
    }

    // Facing
    if (speed > 0.3) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.y), 12, dt);
      this.yawTarget = null;
    } else if (this.yawTarget !== null) {
      this.yaw = dampAngle(this.yaw, this.yawTarget, 8, dt);
    }

    // Walk cycle
    this.walkAmt = damp(this.walkAmt, clamp(speed / SPEED), 10, dt);
    this.phase += speed * dt * 2.3;
    const s = Math.sin(this.phase);
    if (this.walkAmt > 0.25 && this.grounded && Math.sign(s) !== Math.sign(this.lastSin)) {
      this.onStep?.();
      const side = s > 0 ? 1 : -1;
      const back = -0.25;
      puffs.spawn(
        this.pos.x + Math.sin(this.yaw) * back + Math.cos(this.yaw) * 0.18 * side,
        this.pos.y + 0.06,
        this.pos.z + Math.cos(this.yaw) * back - Math.sin(this.yaw) * 0.18 * side,
        { vy: 0.7, vx: -this.vel.x * 0.12, vz: -this.vel.y * 0.12, size: 0.11 + Math.random() * 0.05, life: 0.45, color: '#f6ead2', drag: 4 },
      );
    }
    this.lastSin = s;
    const bob = Math.abs(s) * 0.17 * this.walkAmt;

    // Squash & stretch
    this.land.update(dt);
    const breathe = Math.sin(t * 2.6) * 0.018 * (1 - this.walkAmt);
    const stretch = this.grounded ? Math.cos(this.phase * 2) * -0.05 * this.walkAmt : clamp(this.airVel * 0.012, -0.12, 0.15);
    const sy = clamp(this.land.value + breathe + stretch, 0.6, 1.4);
    const sxz = 1 / Math.sqrt(sy);
    this.squashG.scale.set(sxz, sy, sxz);
    this.bodyG.position.y = 0.12 + bob;
    this.bodyG.rotation.x = 0.14 * this.walkAmt + Math.sin(this.phase * 2) * 0.03 * this.walkAmt;
    this.bodyG.rotation.z = Math.sin(this.phase) * 0.06 * this.walkAmt;

    // Limbs
    this.armL.rotation.x = Math.sin(this.phase) * 0.9 * this.walkAmt;
    this.armR.rotation.x = -Math.sin(this.phase) * 0.9 * this.walkAmt;
    this.armL.rotation.z = -0.15 - (this.grounded ? 0 : 0.8);
    this.armR.rotation.z = 0.15 + (this.grounded ? 0 : 0.8);
    this.footL.position.z = 0.04 + Math.sin(this.phase) * 0.17 * this.walkAmt;
    this.footR.position.z = 0.04 - Math.sin(this.phase) * 0.17 * this.walkAmt;
    this.footL.position.y = 0.06 + Math.max(0, Math.cos(this.phase)) * 0.09 * this.walkAmt;
    this.footR.position.y = 0.06 + Math.max(0, -Math.cos(this.phase)) * 0.09 * this.walkAmt;
    this.tail.rotation.x = -0.25 - 0.75 * this.walkAmt + Math.sin(t * 11) * 0.12 * this.walkAmt;
    this.tail.rotation.z = Math.sin(t * 7) * 0.12 * this.walkAmt;
    this.sprout.rotation.z = Math.sin(t * 2.2) * 0.12 + Math.sin(this.phase * 2) * 0.12 * this.walkAmt;
    this.sprout.rotation.x = -0.25 * this.walkAmt + (this.grounded ? 0 : -this.airVel * 0.03);

    // Blink & glance
    this.blinkT -= dt;
    let lid = 1;
    if (this.blinkT < 0.12) lid = Math.abs(this.blinkT - 0.06) / 0.06;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.2;
    for (const e of this.lids) e.scale.y = 1.2 * Math.max(0.12, lid);
    this.idleTime = speed > 0.3 ? 0 : this.idleTime + dt;
    this.lookT -= dt;
    if (this.lookT < 0) {
      this.lookT = 1.4 + Math.random() * 2.4;
      if (this.idleTime > 1.5) this.lookTarget.set((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 0.8);
      else this.lookTarget.set(0, 0);
    }
    if (speed > 0.3) this.lookTarget.set(0, 0);
    this.look.x = damp(this.look.x, this.lookTarget.x, 8, dt);
    this.look.y = damp(this.look.y, this.lookTarget.y, 8, dt);
    this.eyes.position.x = this.look.x * 0.05;
    this.eyes.position.y = 0.56 + this.look.y * 0.03;
    this.eyes.rotation.y = this.look.x * 0.2;

    this.sync();
  }

  private sync() {
    this.root.position.set(this.pos.x, this.pos.y + this.air, this.pos.z);
    this.root.rotation.y = this.yaw;
    const ground = groundAt(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, ground + 0.03, this.pos.z);
    const k = clamp(1 - this.air * 0.12, 0.35, 1);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as MeshBasicMaterial).opacity = k;
  }

  /** World position of the head (for labels or the camera). */
  head(out = new Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.air + 1.0, this.pos.z);
  }

  dispose() {
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.shadow.geometry.dispose();
    (this.shadow.material as MeshBasicMaterial).map?.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}
