// The speedboat: a little red runabout tied up at the end of the pier. This
// is the boat itself: how it looks, how it moves (momentum, a slide in the
// turns, bobbing and banking on the swell), what it bumps into, and what it
// leaves behind (a widening wake, spray off the bow, a hiss at speed). The
// race and the controls live in boating.ts; this knows nothing about either.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { Kit } from '../world/kit';
import type { Puffs } from '../world/particles';
import type { Ripples } from '../world/ripples';
import { heightAt } from '../world/shape';
import { waveHeight } from '../world/water';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../util/math';

/** Top speed, world units a second. */
export const TOP_SPEED = 13;
/** How hard the motor pushes, and the water drags (linear and with the square of speed). */
const THRUST = 9;
const DRAG = 0.22;
const DRAG2 = (THRUST - DRAG * TOP_SPEED) / (TOP_SPEED * TOP_SPEED);
const BRAKE = 11;
const REVERSE = 4;
const REVERSE_TOP = 3.5;
/** How fast it turns at full lock, radians a second, and how fast sideways slip dies away. */
const TURN = 1.75;
const GRIP = 2.6;
/** Shallower than this and the hull scrapes: the boat is pushed back out to sea. */
export const MIN_DEPTH = 0.42;
/** The model is drawn small and scaled up to fit the explorer. */
const SIZE = 1.5;
/** Half its length and width, for bumping into things. */
export const HALF_LENGTH = 1.3 * SIZE;
export const HALF_WIDTH = 0.6 * SIZE;
/** Where the driver stands, in the boat's own frame (bow along +z). */
const HELM = new Vector3(0, 0.18 * SIZE, -0.4 * SIZE);
const WAKE_POINTS = 44;
const WAKE_EVERY = 0.055;

/** Something round to bump into (a buoy, a gate post), or a capsule (the pier, the rowboat). */
export type Bumper = { x: number; z: number; r: number } | { ax: number; az: number; bx: number; bz: number; r: number };

export type BoatInput = { throttle: number; steer: number };

/** The hull and its trim, bow along +z. Shared by the boat and its ghost. */
export function boatGeometry(k: Kit, colors = { hull: '#fffaf0', stripe: '#e5484d', deck: '#e9d3a6', dark: '#2c2b33', glass: '#bfe4f1' }) {
  k.lathe([[0, -0.3], [0.42, -0.25], [0.56, -0.02], [0.6, 0.2], [0, 0.2]], colors.hull, { s: [1, 1, 2.25], jitter: 0.02 }, 14);
  // A pointed bow, a red rubbing strake round the gunwale, and the deck inside it.
  k.cone(0.42, 0.7, colors.hull, { p: [0, -0.02, 1.3], r: [Math.PI / 2, 0, 0], s: [1.1, 1, 0.55] }, 6);
  k.torus(0.6, 0.065, colors.stripe, { p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0], s: [1, 2.25, 1] }, 4, 22);
  k.box(0.96, 0.05, 2.2, colors.deck, { p: [0, 0.17, -0.05] });
  k.cone(0.5, 0.75, colors.stripe, { p: [0, 0.24, 0.95], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.22] }, 4);
  // The console and its windscreen, a bench at the back, and the outboard motor.
  k.rbox(0.5, 0.42, 0.34, 0.06, colors.hull, { p: [0, 0.38, 0.12] });
  k.box(0.62, 0.3, 0.04, colors.glass, { p: [0, 0.68, 0.25], r: [-0.45, 0, 0] });
  k.cyl(0.11, 0.11, 0.04, colors.dark, { p: [0, 0.62, -0.02], r: [-1.1, 0, 0] }, 10);
  k.rbox(0.92, 0.22, 0.38, 0.06, colors.stripe, { p: [0, 0.3, -0.92] });
  k.rbox(0.34, 0.48, 0.34, 0.07, colors.dark, { p: [0, 0.42, -1.38] });
  k.cyl(0.05, 0.05, 0.5, colors.dark, { p: [0, -0.02, -1.42] }, 6);
  k.box(0.04, 0.22, 0.24, colors.dark, { p: [0, -0.28, -1.42] });
  return k;
}

function buildModel() {
  const k = boatGeometry(new Kit(919));
  // A pennant on a little staff at the stern, in the pier's blue.
  k.cyl(0.02, 0.02, 0.9, '#3d3a36', { p: [0.36, 0.62, -1.12] }, 5);
  k.box(0.02, 0.18, 0.32, '#2b8fb8', { p: [0.36, 0.96, -1.28] });
  const g = k.build({ castShadow: false, receiveShadow: false });
  g.scale.setScalar(SIZE);
  return g;
}

/** The trail the boat leaves: a ribbon behind it that spreads into a V and fades. */
class Wake {
  readonly mesh: Mesh;
  private pts: { x: number; z: number; sx: number; sz: number; age: number; power: number }[] = [];
  private pos: Float32Array;
  private look: Float32Array;
  private t = 0;
  private head = 0;
  private material: ShaderMaterial;

  constructor() {
    for (let i = 0; i < WAKE_POINTS; i++) this.pts.push({ x: 0, z: 0, sx: 1, sz: 0, age: 9, power: 0 });
    this.pos = new Float32Array(WAKE_POINTS * 2 * 3);
    this.look = new Float32Array(WAKE_POINTS * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < WAKE_POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aLook', new BufferAttribute(this.look, 2));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      uniforms: { uNight: { value: 0 }, uColor: { value: new Color('#ffffff') }, uNightColor: { value: new Color('#6f86b8') } },
      vertexShader: /* glsl */ `
        attribute vec2 aLook;
        varying vec2 vLook;
        void main() {
          vLook = aLook;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        uniform vec3 uColor, uNightColor;
        varying vec2 vLook;
        void main() {
          // Foam along both arms of the V, thinner in the trough between them.
          float across = abs(vLook.x);
          float foam = smoothstep(0.35, 0.95, across) * (1.0 - smoothstep(0.95, 1.0, across)) + 0.28 * (1.0 - smoothstep(0.0, 0.3, across));
          float a = foam * vLook.y;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uColor, uNightColor, uNight), a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'wake';
  }

  /** Forget the trail (the boat was moved, not driven). */
  clear() {
    for (const p of this.pts) p.age = 9;
  }

  update(dt: number, time: number, x: number, z: number, yaw: number, speed: number, night: number) {
    this.material.uniforms.uNight.value = night;
    for (const p of this.pts) p.age += dt;
    this.t += dt;
    if (this.t >= WAKE_EVERY) {
      this.t = 0;
      this.head = (this.head + 1) % WAKE_POINTS;
      const p = this.pts[this.head];
      // From the stern.
      p.x = x - Math.sin(yaw) * HALF_LENGTH * 0.9;
      p.z = z - Math.cos(yaw) * HALF_LENGTH * 0.9;
      p.sx = Math.cos(yaw);
      p.sz = -Math.sin(yaw);
      p.age = 0;
      p.power = clamp(speed / TOP_SPEED) ** 0.8;
    }
    const life = 2.4;
    for (let n = 0; n < WAKE_POINTS; n++) {
      // Newest first, so the ribbon runs back from the stern in order.
      const p = this.pts[(this.head - n + WAKE_POINTS) % WAKE_POINTS];
      const k = clamp(p.age / life);
      const half = (HALF_WIDTH * 0.75 + p.age * (0.9 + p.power * 1.4)) * (p.age < 9 ? 1 : 0);
      const y = waveHeight(p.x, p.z, time) + 0.045;
      const fade = p.age < 9 ? p.power * (1 - k) * (1 - k) * Math.min(1, p.age * 12 + 0.25) : 0;
      for (let side = 0; side < 2; side++) {
        const s = side ? 1 : -1;
        const v = (n * 2 + side) * 3;
        this.pos[v] = p.x + p.sx * half * s;
        this.pos[v + 1] = y;
        this.pos[v + 2] = p.z + p.sz * half * s;
        const l = (n * 2 + side) * 2;
        this.look[l] = s;
        this.look[l + 1] = fade * 0.85;
      }
    }
    (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('aLook') as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export class Boat {
  readonly root = new Group();
  readonly wake = new Wake();
  /** Where it is, which way it points (0 faces +z, south) and how it's moving. */
  readonly pos = new Vector3();
  yaw = 0;
  readonly vel = { x: 0, z: 0 };
  /** The driver's wishes, -1..1 each: forward/back, and right/left. */
  readonly input: BoatInput = { throttle: 0, steer: 0 };
  /** Held still (the countdown, or tied up). */
  locked = true;
  /** Calm: no rolling about, gentler spray (reduced motion). */
  calm = false;
  /** Things to bump into. */
  bumpers: Bumper[] = [];
  /** How far out the open sea turns it back: a radius at each bearing. */
  limit: ((theta: number) => number) | null = null;
  onSound?: (name: 'spray' | 'splash' | 'swim' | 'land') => void;
  /** Hit something hard (for a little shake). */
  onBump?: (power: number) => void;

  private hull: Group;
  private steer = 0;
  private pitch = 0;
  private roll = 0;
  private bob = 0;
  private sprayT = 0;
  private hissT = 0;
  private slapT = 0;
  private bumpT = 0;

  constructor(
    private puffs: Puffs,
    private ripples: Ripples,
  ) {
    this.root.name = 'speedboat';
    this.hull = buildModel();
    this.root.add(this.hull);
    this.root.rotation.order = 'YXZ';
  }

  /** The hull's meshes, for clicks and taps. */
  get hits(): Object3D[] {
    return this.hull.children;
  }

  /** Forward speed (negative going astern). */
  get speed() {
    return this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
  }

  /** Put it somewhere, at rest. */
  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vel.x = 0;
    this.vel.z = 0;
    this.steer = 0;
    this.input.throttle = 0;
    this.input.steer = 0;
    this.wake.clear();
  }

  /** Where the driver's feet go, in the world, and how the deck is tilted. */
  helm(out: Vector3) {
    this.root.updateMatrixWorld();
    return out.copy(HELM).applyMatrix4(this.root.matrixWorld);
  }
  get tilt() {
    return { pitch: this.root.rotation.x, roll: this.root.rotation.z };
  }

  /** Is there water enough under (x, z) for the hull? */
  static floats(x: number, z: number) {
    return heightAt(x, z) < -MIN_DEPTH;
  }

  /** One step of the physics, then the effects. `active`: someone's driving it. */
  update(time: number, dt: number, night: number, active: boolean) {
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    // Right, looking forward (bow along +z, so starboard is -x).
    const r = { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
    let vf = this.vel.x * f.x + this.vel.z * f.z;
    let vl = this.vel.x * r.x + this.vel.z * r.z;
    const thr = this.locked ? 0 : clamp(this.input.throttle, -1, 1);
    this.steer = damp(this.steer, this.locked ? 0 : clamp(this.input.steer, -1, 1), 9, dt);

    // Along: the motor against the water's drag; braking, then a slow reverse.
    let acc = -DRAG * vf - DRAG2 * vf * Math.abs(vf);
    if (thr > 0) acc += THRUST * thr;
    else if (thr < 0) acc += vf > 0.4 ? -BRAKE * -thr : vf > -REVERSE_TOP ? -REVERSE * -thr : 0;
    vf += acc * dt;
    // Across: the hull grips, but slides a little in a hard turn.
    vl *= Math.exp(-GRIP * dt);

    // Turning needs way on (a little even at rest, for nosing about), and is wider at speed.
    const way = clamp(Math.abs(vf) / 3.2);
    const rate = TURN * (0.18 + 0.82 * way) * (1 - 0.28 * clamp(Math.abs(vf) / TOP_SPEED)) * (vf < -0.2 ? -1 : 1);
    // The hull turns and the way on lags behind it: next step, some of it is sideways
    // (the boat slides out of the turn) until the grip takes it back.
    this.vel.x = f.x * vf + r.x * vl;
    this.vel.z = f.z * vf + r.z * vl;
    this.yaw = wrapAngle(this.yaw - this.steer * rate * dt);
    const nf = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    if (this.locked) {
      this.vel.x *= Math.exp(-6 * dt);
      this.vel.z *= Math.exp(-6 * dt);
    }

    // The open sea turns you back, gently.
    if (this.limit) {
      const d = Math.hypot(this.pos.x, this.pos.z);
      const over = d - this.limit(Math.atan2(this.pos.z, this.pos.x));
      if (over > 0) {
        const k = Math.min(over, 6) * 2.4 * dt;
        this.vel.x -= (this.pos.x / d) * k;
        this.vel.z -= (this.pos.z / d) * k;
      }
    }

    const px = this.pos.x;
    const pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const hit = this.collide(px, pz);
    this.bumpT -= dt;
    if (hit > 1.6 && this.bumpT <= 0) {
      this.bumpT = 0.4;
      this.onSound?.(hit > 4 ? 'land' : 'swim');
      this.onBump?.(clamp(hit / 8));
      const sx = this.pos.x + nf.x * HALF_LENGTH;
      const sz = this.pos.z + nf.z * HALF_LENGTH;
      if (!this.calm) this.puffs.ring(sx, waveHeight(sx, sz, time) + 0.1, sz, 8, 2 + hit * 0.2, '#ffffff', 0.14);
      this.ripples.spawn(sx, sz, { from: 0.3, to: 2.2, life: 0.9, width: 0.12, alpha: 0.7 });
    }

    this.pose(time, dt, vf, active);
    this.effects(time, dt, night, active);
  }

  /** Keep out of the shallows, off the pier and away from buoys and posts. Returns how hard it hit. */
  private collide(px: number, pz: number) {
    let hit = 0;
    // Shallows: sample round the hull, and push back down the slope of the seabed.
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    for (let pass = 0; pass < 3; pass++) {
      let worst = -Infinity;
      let wx = 0;
      let wz = 0;
      for (const along of [HALF_LENGTH, 0, -HALF_LENGTH * 0.8]) {
        const x = this.pos.x + f.x * along;
        const z = this.pos.z + f.z * along;
        const h = heightAt(x, z) + MIN_DEPTH;
        if (h > worst) (worst = h), (wx = x), (wz = z);
      }
      if (worst <= 0) break;
      const e = 0.25;
      let gx = heightAt(wx + e, wz) - heightAt(wx - e, wz);
      let gz = heightAt(wx, wz + e) - heightAt(wx, wz - e);
      let gl = Math.hypot(gx, gz);
      if (gl < 1e-5) {
        // Flat ground: push out from the middle of the island.
        gx = wx;
        gz = wz;
        gl = Math.hypot(gx, gz) || 1;
      }
      gx /= gl;
      gz /= gl;
      // Uphill is toward land: move back out, and lose the way going into it.
      this.pos.x -= gx * (worst * 0.6 + 0.04);
      this.pos.z -= gz * (worst * 0.6 + 0.04);
      const into = this.vel.x * gx + this.vel.z * gz;
      if (into > 0) {
        hit = Math.max(hit, into);
        this.vel.x -= gx * into * 1.35;
        this.vel.z -= gz * into * 1.35;
        this.vel.x *= 0.85;
        this.vel.z *= 0.85;
      }
    }
    if (!Boat.floats(this.pos.x, this.pos.z) && Boat.floats(px, pz)) {
      // Still aground: back to where it was.
      this.pos.x = px;
      this.pos.z = pz;
    }
    // Round things and capsules: the hull is a capsule too, but a circle at each end will do.
    for (const along of [HALF_LENGTH * 0.55, -HALF_LENGTH * 0.55]) {
      const cx = this.pos.x + f.x * along;
      const cz = this.pos.z + f.z * along;
      for (const b of this.bumpers) {
        let qx: number;
        let qz: number;
        if ('ax' in b) {
          const dx = b.bx - b.ax;
          const dz = b.bz - b.az;
          const t = clamp(((cx - b.ax) * dx + (cz - b.az) * dz) / (dx * dx + dz * dz || 1));
          qx = b.ax + dx * t;
          qz = b.az + dz * t;
        } else {
          qx = b.x;
          qz = b.z;
        }
        const dx = cx - qx;
        const dz = cz - qz;
        const d = Math.hypot(dx, dz);
        const min = b.r + HALF_WIDTH;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x += nx * (min - d);
        this.pos.z += nz * (min - d);
        const into = -(this.vel.x * nx + this.vel.z * nz);
        if (into > 0) {
          hit = Math.max(hit, into);
          this.vel.x += nx * into * 1.3;
          this.vel.z += nz * into * 1.3;
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
      }
    }
    return hit;
  }

  /** Ride the swell: heave, pitch and roll from the waves under the hull, the bow lifting at speed and leaning into turns. */
  private pose(time: number, dt: number, vf: number, active: boolean) {
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const s = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; // port (+x in the boat's frame)
    const x = this.pos.x;
    const z = this.pos.z;
    const hb = waveHeight(x + f.x * HALF_LENGTH, z + f.z * HALF_LENGTH, time);
    const hs = waveHeight(x - f.x * HALF_LENGTH, z - f.z * HALF_LENGTH, time);
    const hp = waveHeight(x + s.x * HALF_WIDTH, z + s.z * HALF_WIDTH, time);
    const hst = waveHeight(x - s.x * HALF_WIDTH, z - s.z * HALF_WIDTH, time);
    const sp = clamp(Math.abs(vf) / TOP_SPEED);
    // Planing: the bow comes up as it gets going, then settles a little at full speed.
    const plane = smoothstep(0.1, 0.45, sp) * (1 - 0.35 * smoothstep(0.6, 1, sp));
    const calm = this.calm ? 0.35 : 1;
    const pitchGoal = -Math.atan2(hb - hs, HALF_LENGTH * 2) * 1.6 * calm - plane * 0.11;
    const rollGoal = Math.atan2(hp - hst, HALF_WIDTH * 2) * 0.8 * calm + this.steer * sp * 0.2 * calm;
    this.pitch = damp(this.pitch, pitchGoal, 6, dt);
    this.roll = damp(this.roll, rollGoal, 5, dt);
    // A gentle extra bob while idling, tugging at the mooring.
    this.bob = active ? damp(this.bob, 0, 2, dt) : Math.sin(time * 1.3) * 0.03;
    const y = (hb + hs + hp + hst) / 4 + 0.02 + plane * 0.06 + this.bob;
    this.pos.y = y;
    this.root.position.set(x, y, z);
    this.root.rotation.set(this.pitch, this.yaw, this.roll);
  }

  /** Spray off the bow, foam off the stern, and the hiss of going fast. */
  private effects(time: number, dt: number, night: number, active: boolean) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.wake.update(dt, time, this.pos.x, this.pos.z, this.yaw, active ? sp : 0, night);
    if (!active) return;
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const s = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    const k = clamp((sp - 3) / (TOP_SPEED - 3));
    this.sprayT -= dt;
    if (k > 0 && this.sprayT <= 0) {
      this.sprayT = lerp(0.07, 0.02, k) * (this.calm ? 2.5 : 1);
      const bx = this.pos.x + f.x * HALF_LENGTH * 0.75;
      const bz = this.pos.z + f.z * HALF_LENGTH * 0.75;
      const y = waveHeight(bx, bz, time) + 0.12;
      const color = night > 0.5 ? '#a9b8de' : '#ffffff';
      for (const side of [-1, 1]) {
        const out = 1.6 + k * 2.6 + Math.random() * 0.9;
        this.puffs.spawn(bx + s.x * side * HALF_WIDTH * 0.7, y, bz + s.z * side * HALF_WIDTH * 0.7, {
          vx: s.x * side * out + this.vel.x * 0.35,
          vz: s.z * side * out + this.vel.z * 0.35,
          vy: 1.6 + k * 2.6 + Math.random(),
          gravity: -9,
          drag: 1.4,
          size: 0.035 + k * 0.045 + Math.random() * 0.03,
          life: 0.35 + Math.random() * 0.2,
          grow: 0.2,
          color,
        });
      }
    }
    // Rings off the stern when slow, where the wake hasn't got going.
    this.slapT -= dt;
    if (this.slapT <= 0 && sp > 0.6 && sp < 6) {
      this.slapT = 0.45;
      this.ripples.spawn(this.pos.x - f.x * HALF_LENGTH, this.pos.z - f.z * HALF_LENGTH, { from: 0.3, to: 1.6, life: 1.1, width: 0.08, alpha: 0.45 });
    }
    // The hiss of spray, quicker the faster you go; a slap of water now and then when slow.
    this.hissT -= dt;
    if (this.hissT <= 0 && sp > 2) {
      this.hissT = lerp(0.5, 0.22, k);
      this.onSound?.(k > 0.15 ? 'spray' : 'swim');
    }
  }

  dispose() {
    this.wake.dispose();
    this.hull.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}

/** A see-through copy of the boat that replays your best lap. */
export function buildGhost() {
  const k = boatGeometry(new Kit(920));
  const geo = k.geometry();
  const material = new MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.45, depthWrite: false });
  geo.scale(SIZE, SIZE, SIZE);
  const mesh = new Mesh(geo, material);
  mesh.rotation.order = 'YXZ';
  mesh.visible = false;
  mesh.name = 'ghost';
  mesh.renderOrder = 3;
  return mesh;
}
