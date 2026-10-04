// The explorer: a round little marshmallow with an orange scarf, a backpack
// and a sprout. Owns its own movement (with circle collisions and staying on
// land) and all the juice: hop, jump, squash and stretch, dust, blinks,
// glances. Off the pier it can hold out a little bamboo fishing rod. And it
// dresses up: whatever the visitor wears from the wardrobe (a hat, glasses, a
// scarf in another color, a vest) is built here from a few primitives.

import {
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  CylinderGeometry,
  Object3D,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, dampAngle, easeOutBack, lerp, Spring } from './util/math';
import type { Puffs } from './world/particles';
import type { Collider } from './world/nature';
import { groundAt, isWalkable } from './world/shape';
import type { Outfit } from '../../world/schema';

/** What the explorer needs to know about a piece of clothing. */
export type Wearable = Pick<Outfit, 'id' | 'slot' | 'color'>;

const SPEED = 5.4;
const BODY_R = 0.5;
const SCALE = 1.6;
const GRAVITY = 32;
/** Takeoff speed of a full jump (about 1.3 high), and of a gentler one for reduced motion. */
const JUMP = 9.2;
const JUMP_LOW = 6;
/** A press this soon before landing still jumps, on landing. */
const JUMP_BUFFER = 0.12;

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
  private outfit = new Group();
  private outfitMats: MeshStandardMaterial[] = [];
  private wornKey = '';
  private scarfMat: MeshStandardMaterial;
  private rod = new Group();
  private rodTipAt = new Object3D();
  private rodAmt = 0;
  /** Hold the fishing rod out (1) or put it away (0). */
  rodOut = 0;
  /** The rod's elevation in radians: raised to wind up a cast, dipped when something bites. */
  rodPitch = 0.6;

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
  onJump?: () => void;
  /** Lower jumps (reduced motion). */
  lowJumps = false;
  /** Hang a moment longer at the top of a jump (on the hilltop). */
  floaty = false;
  private jumping = false;
  private jumpBuffer = 0;

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
    this.scarfMat = this.mat(new MeshStandardMaterial({ color: '#ff5a36', roughness: 0.75 }));
    const scarf = new Mesh(new TorusGeometry(0.4, 0.085, 10, 28), this.scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.27;
    scarf.scale.set(1.04, 1.0, 1.0);
    scarf.castShadow = true;
    this.bodyG.add(scarf);
    this.tail.position.set(0.17, 0.27, -0.38);
    const t1 = new Mesh(new RoundedBoxGeometry(0.16, 0.34, 0.07, 2, 0.03), this.scarfMat);
    t1.position.y = -0.15;
    const t2 = new Mesh(new RoundedBoxGeometry(0.13, 0.12, 0.08, 2, 0.03), this.scarfMat);
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
    this.bodyG.add(this.outfit);

    // A bamboo rod in the right hand, hidden until there's fishing to do.
    const bamboo = this.mat(new MeshStandardMaterial({ color: '#d9b26a', roughness: 0.6 }));
    const wrap = this.mat(new MeshStandardMaterial({ color: '#5b3a24', roughness: 0.7 }));
    const reel = this.mat(new MeshStandardMaterial({ color: '#2b8fb8', roughness: 0.5 }));
    const blank = new Mesh(new CylinderGeometry(0.008, 0.02, 1.15, 6), bamboo);
    blank.position.y = 0.5;
    const grip = new Mesh(new CylinderGeometry(0.03, 0.032, 0.24, 8), wrap);
    grip.position.y = -0.04;
    const spool = new Mesh(new CylinderGeometry(0.045, 0.045, 0.04, 10), reel);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(0.04, 0.06, 0);
    for (const y of [0.32, 0.62, 0.9]) {
      const band = new Mesh(new CylinderGeometry(0.018 - y * 0.008, 0.018 - y * 0.008, 0.025, 6), wrap);
      band.position.y = y;
      this.rod.add(band);
    }
    this.rodTipAt.position.y = 1.07;
    this.rod.add(blank, grip, spool, this.rodTipAt);
    this.rod.position.set(0.0, -0.13, 0.05);
    this.rod.visible = false;
    this.armR.add(this.rod);

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

  /**
   * Dress up: one piece per slot (head, face, neck, body). The scarf takes the
   * neck piece's color; hats replace the sprout (a leaf crown grows round it).
   */
  wear(items: readonly Wearable[]) {
    const key = items.map((o) => o.id).sort().join(',');
    if (key === this.wornKey) return;
    this.wornKey = key;
    this.undress();
    const head = items.find((o) => o.slot === 'head');
    this.sprout.visible = !head || head.id === 'leaf-crown';
    this.scarfMat.color.set(items.find((o) => o.slot === 'neck')?.color ?? '#ff5a36');
    const mat = (color: string, opts: { flat?: boolean; rough?: number; opacity?: number; side?: boolean } = {}) => {
      const m = new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.65, flatShading: opts.flat ?? false });
      if (opts.opacity !== undefined) (m.transparent = true), (m.opacity = opts.opacity);
      if (opts.side) m.side = DoubleSide;
      this.outfitMats.push(m);
      return m;
    };
    for (const o of items) {
      const g = dress(o, mat);
      g.traverse((m) => ((m as Mesh).isMesh && o.slot === 'head' ? ((m as Mesh).castShadow = true) : null));
      this.outfit.add(g);
    }
  }

  private undress() {
    this.outfit.traverse((o) => (o as Mesh).geometry?.dispose());
    this.outfit.clear();
    this.outfitMats.forEach((m) => m.dispose());
    this.outfitMats = [];
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

  /** Jump now if on the ground, or on landing if that's moments away. True if it took off. */
  jump() {
    if (!this.grounded) {
      this.jumpBuffer = JUMP_BUFFER;
      return false;
    }
    this.takeOff();
    return true;
  }

  /** Let go of jump: a rising jump is cut short, so a tap is a hop and a hold a full jump. */
  releaseJump() {
    this.jumpBuffer = 0;
    if (this.jumping && this.airVel > 0) this.airVel *= 0.45;
    this.jumping = false;
  }

  get airborne() {
    return !this.grounded;
  }

  private takeOff() {
    this.airVel = this.lowJumps ? JUMP_LOW : JUMP;
    this.grounded = false;
    this.jumping = true;
    this.jumpBuffer = 0;
    this.land.kick(7);
    this.onJump?.();
  }

  faceToward(x: number, z: number) {
    this.yawTarget = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  /** A little squash, e.g. a sigh when a fish gets away. */
  squish(v = 4) {
    this.land.kick(-v);
  }

  /** World position of the rod's tip, where the line hangs from. */
  rodTip(out: Vector3) {
    this.root.updateMatrixWorld(true);
    return this.rodTipAt.getWorldPosition(out);
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
    // In the air you keep your momentum and steer a little less.
    const accel = this.grounded ? (max > 0.01 ? 16 : 12) : max > 0.01 ? 9 : 1.5;
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

    // Vertical: drop-in, hops and jumps
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (!this.grounded) {
      const hang = this.floaty && this.jumping && Math.abs(this.airVel) < 3 ? 0.45 : 1;
      this.airVel -= GRAVITY * hang * dt;
      this.air += this.airVel * dt;
      if (this.air <= 0) {
        const impact = Math.min(1.6, -this.airVel / 10);
        this.air = 0;
        this.airVel = 0;
        this.grounded = true;
        this.jumping = false;
        this.land.kick(-9 * impact);
        this.onLand?.(impact);
        if (impact > 0.5) puffs.ring(this.pos.x, this.pos.y, this.pos.z, 10, 2.6 * impact, '#fbf1dc', 0.22);
        if (this.jumpBuffer > 0) this.takeOff();
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
    // Holding the rod: the right arm comes up and forward, the rod at its pitch.
    this.rodAmt = damp(this.rodAmt, this.rodOut, 9, dt);
    this.rod.visible = this.rodAmt > 0.01;
    if (this.rod.visible) {
      const k = this.rodAmt;
      this.armR.rotation.x = lerp(this.armR.rotation.x, -0.95, k);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.32, k);
      this.rod.rotation.x = Math.PI / 2 - this.rodPitch - this.armR.rotation.x;
      this.rod.scale.setScalar(Math.max(0.001, easeOutBack(clamp(k * 1.15))));
    }
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
    this.undress();
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.shadow.geometry.dispose();
    (this.shadow.material as MeshBasicMaterial).map?.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}

// ---------- The wardrobe, in three dimensions ----------
// Coordinates are the body group's: the marshmallow is a 0.5 sphere centred
// at y 0.47 (squashed to 0.94 tall), the eyes sit at y 0.56 on the front (+z)
// and the scarf rings it at y 0.27.

type MatFn = (color: string, opts?: { flat?: boolean; rough?: number; opacity?: number; side?: boolean }) => MeshStandardMaterial;

const darker = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

function at<T extends Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Build one piece of clothing as a group in the body's space. */
function dress(o: Wearable, mat: MatFn): Group {
  const g = new Group();
  const c = o.color;
  const d = darker(c, 0.25);
  const hat = (crownR: number, crownH: number, brimR: number, y = 0.84) => {
    const crown = at(new Mesh(new CylinderGeometry(crownR * 0.86, crownR, crownH, 24), mat(c)), 0, y + crownH / 2, 0);
    const brim = at(new Mesh(new CylinderGeometry(brimR, brimR, 0.035, 28), mat(d)), 0, y, 0);
    g.add(crown, brim);
  };
  switch (o.id) {
    case 'hard-hat': {
      const dome = new Group();
      dome.scale.set(1, 0.85, 1);
      dome.position.y = 0.83;
      dome.add(new Mesh(new SphereGeometry(0.3, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, { rough: 0.35 })));
      const ridge = new Mesh(new TorusGeometry(0.3, 0.024, 6, 18, Math.PI), mat(d, { rough: 0.35 }));
      ridge.rotation.y = Math.PI / 2;
      dome.add(ridge);
      const brim = at(new Mesh(new CylinderGeometry(0.37, 0.37, 0.035, 28), mat(d, { rough: 0.35 })), 0, 0.84, 0.05);
      g.add(dome, brim);
      g.rotation.x = -0.08;
      return g;
    }
    case 'leaf-crown': {
      const band = at(new Mesh(new TorusGeometry(0.29, 0.028, 6, 24), mat('#8a5a2b')), 0, 0.84, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const leaf = mat(c, { flat: true, rough: 0.7 });
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const l = new Mesh(new SphereGeometry(0.07, 6, 5), leaf);
        l.scale.set(0.7, 1.5, 0.35);
        l.position.set(Math.sin(a) * 0.3, 0.9, Math.cos(a) * 0.3);
        l.rotation.set(0, a, 0);
        l.rotateX(-0.35);
        g.add(l);
      }
      for (const a of [0.45, -0.5, 2.6]) g.add(at(new Mesh(new SphereGeometry(0.035, 8, 6), mat('#ffb7c9')), Math.sin(a) * 0.31, 0.86, Math.cos(a) * 0.31));
      return g;
    }
    case 'mortarboard': {
      g.add(at(new Mesh(new CylinderGeometry(0.27, 0.29, 0.14, 24), mat(d)), 0, 0.88, 0));
      const board = at(new Mesh(new RoundedBoxGeometry(0.66, 0.035, 0.66, 1, 0.012), mat(c)), 0, 0.97, 0);
      board.rotation.y = Math.PI / 4;
      const gold = mat('#f5c542', { rough: 0.4 });
      const button = at(new Mesh(new SphereGeometry(0.03, 8, 6), gold), 0, 0.995, 0);
      const cord = at(new Mesh(new CylinderGeometry(0.008, 0.008, 0.33, 4), gold), 0.165, 0.99, 0);
      cord.rotation.z = Math.PI / 2;
      const tassel = at(new Mesh(new CylinderGeometry(0.02, 0.035, 0.16, 6), gold), 0.33, 0.9, 0);
      g.add(board, button, cord, tassel);
      g.rotation.x = -0.1;
      return g;
    }
    case 'fishing-hat': {
      g.add(at(new Mesh(new CylinderGeometry(0.22, 0.29, 0.2, 20), mat(c, { rough: 0.9 })), 0, 0.95, 0));
      g.add(at(new Mesh(new CylinderGeometry(0.295, 0.3, 0.06, 20), mat('#5b7a4a')), 0, 0.88, 0));
      g.add(at(new Mesh(new CylinderGeometry(0.3, 0.46, 0.09, 24, 1, true), mat(d, { rough: 0.9, side: true })), 0, 0.82, 0));
      g.add(at(new Mesh(new SphereGeometry(0.03, 6, 4), mat('#ff5a36')), 0.2, 0.93, 0.18));
      return g;
    }
    case 'sailor-hat': {
      g.add(at(new Mesh(new CylinderGeometry(0.25, 0.29, 0.2, 22), mat(c, { rough: 0.8 })), 0, 0.95, 0));
      g.add(at(new Mesh(new CylinderGeometry(0.292, 0.296, 0.04, 22), mat('#2b5fa8')), 0, 0.9, 0));
      g.add(at(new Mesh(new CylinderGeometry(0.4, 0.3, 0.12, 24, 1, true), mat(darker(c, 0.06), { rough: 0.8, side: true })), 0, 0.86, 0));
      g.rotation.z = 0.12;
      return g;
    }
    case 'reading-glasses':
    case 'sunglasses': {
      const sun = o.id === 'sunglasses';
      const rim = mat(c, { rough: 0.4 });
      const lens = sun ? mat(c, { rough: 0.15 }) : mat('#cfe9f5', { rough: 0.1, opacity: 0.45 });
      for (const s of [-1, 1]) {
        g.add(at(new Mesh(new TorusGeometry(sun ? 0.1 : 0.088, 0.016, 8, 22), rim), s * 0.155, 0.56, 0.475));
        g.add(at(new Mesh(new CircleGeometry(sun ? 0.1 : 0.085, 22), lens), s * 0.155, 0.56, 0.47));
        const temple = at(new Mesh(new CylinderGeometry(0.012, 0.012, 0.24, 4), rim), s * 0.285, 0.57, 0.36);
        temple.rotation.x = Math.PI / 2;
        g.add(temple);
      }
      const bridge = at(new Mesh(new TorusGeometry(0.05, 0.013, 6, 10, Math.PI), rim), 0, 0.57, 0.485);
      g.add(bridge);
      return g;
    }
    case 'cardinal-scarf':
      // The scarf itself just changes color (see wear()).
      return g;
    case 'recycling-vest': {
      // Wraps the sides and back, open at the front.
      // Below the face, around the sides and back (under the backpack), open at the front.
      const open = 0.66;
      const vest = at(new Mesh(new SphereGeometry(0.515, 32, 12, Math.PI / 2 + open, Math.PI * 2 - 2 * open, 1.3, 1.45), mat(c, { side: true })), 0, 0.47, 0);
      vest.scale.set(1, 0.94, 0.97);
      const stripe = at(new Mesh(new SphereGeometry(0.522, 32, 2, Math.PI / 2 + open, Math.PI * 2 - 2 * open, 2.22, 0.1), mat('#e9f1dc', { rough: 0.3, side: true })), 0, 0.47, 0);
      stripe.scale.copy(vest.scale);
      g.add(vest, stripe);
      return g;
    }
  }
  // Something new in the world: a simple shape for its slot, in its color.
  if (o.slot === 'head') hat(0.26, 0.18, 0.36);
  else if (o.slot === 'face') for (const s of [-1, 1]) g.add(at(new Mesh(new TorusGeometry(0.088, 0.016, 8, 22), mat(c)), s * 0.155, 0.56, 0.475));
  else if (o.slot === 'body') {
    const vest = at(new Mesh(new SphereGeometry(0.515, 32, 12, Math.PI / 2 + 0.82, Math.PI * 2 - 1.64, 1.55, 1.05), mat(c, { side: true })), 0, 0.47, 0);
    vest.scale.set(1, 0.94, 0.97);
    g.add(vest);
  }
  return g;
}
