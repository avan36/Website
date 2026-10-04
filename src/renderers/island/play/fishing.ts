// Fishing off the pier. Cast: the explorer winds up and flicks the rod, and
// the float arcs out onto the water. Wait: it rides the swell, with a nibble
// or two. Bite: it goes under, and for a moment you can reel in. Catch: the
// fish leaps out of the sea and into your arms. Miss: the float bobs back up
// and the line goes slack. Whatever you catch is something I wrote.

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Explorer } from '../character';
import { Kit, litMaterial } from '../world/kit';
import type { Puffs } from '../world/particles';
import type { ActivitySpot } from '../world/shape';
import { waveHeight } from '../world/water';
import { clamp, easeInCubic, easeOutCubic, lerp } from '../util/math';

export type FishPhase = 'ready' | 'windup' | 'flight' | 'wait' | 'bite' | 'catch' | 'miss' | 'reel';

/** Stand this close to the spot to fish. */
export const FISH_RANGE = 1.5;
/** How long you have to reel in once it bites. */
const WINDOW = 0.9;
/** Which way to cast: out to sea, a little toward the camera so the arc reads. */
const CAST = new Vector3(-2.3, 0, 2.0).normalize();
const SEG = 18;

function bobberGeometry() {
  const k = new Kit(71);
  k.add(new SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#e5484d', { jitter: 0.02 });
  k.add(new SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#fffaf0', { jitter: 0.02 });
  k.cyl(0.014, 0.014, 0.14, '#3d3a36', { p: [0, 0.16, 0] }, 5);
  return k.geometry();
}

/** A plump little fish, nose along +z (so lookAt points it where it's going). */
function fishGeometry() {
  const k = new Kit(72);
  k.sphere(0.24, '#ff9a3c', { s: [0.62, 0.78, 1.3] }, 10, 8);
  k.sphere(0.2, '#ffe2b8', { p: [0, -0.07, 0.04], s: [0.55, 0.55, 1.15] }, 8, 6);
  k.cone(0.2, 0.3, '#ff7a2a', { p: [0, 0, -0.38], r: [-Math.PI / 2, 0, 0], s: [0.25, 1, 1] }, 4);
  k.cone(0.12, 0.2, '#ff7a2a', { p: [0, 0.2, -0.02], r: [-0.5, 0, 0], s: [0.25, 1, 1] }, 4);
  for (const s of [-1, 1]) {
    k.sphere(0.05, '#ffffff', { p: [s * 0.12, 0.06, 0.2] }, 6, 4);
    k.sphere(0.028, '#1d1a16', { p: [s * 0.15, 0.065, 0.22] }, 5, 4);
    k.cone(0.08, 0.14, '#ff7a2a', { p: [s * 0.14, -0.06, 0.02], r: [Math.PI / 2 + 0.4, 0, s * 0.5], s: [0.3, 1, 1] }, 4);
  }
  return k.geometry();
}

export class Fishing {
  readonly group = new Group();
  phase: FishPhase = 'ready';
  /** Where the float is, for the camera to lean toward. */
  readonly float = new Vector3();
  /** Set when a cast was reeled in too soon, until the next cast. */
  tooSoon = false;
  onCatch?: () => void;
  onMiss?: () => void;
  onBite?: () => void;
  onSound?: (name: 'whoosh' | 'pop' | 'tap' | 'chime') => void;

  private bobber: Mesh;
  private fish: Mesh;
  private line: Line;
  private linePos: Float32Array;
  private ripples: { mesh: Mesh; age: number; size: number }[] = [];
  private t = 0; // time in this phase
  private now = 0;
  private waitFor = 2;
  private nibbles: number[] = [];
  private dip = 0;
  private dipVel = 0;
  private land = new Vector3();
  private from = new Vector3();
  private tip = new Vector3();
  private end = new Vector3();
  private tmp = new Vector3();
  private chest = new Vector3();
  private slack = 0.3;
  private missed = false;

  constructor(
    readonly spot: ActivitySpot,
    private player: Explorer,
    private puffs: Puffs,
    private opts: { reducedMotion: boolean },
  ) {
    this.group.name = 'fishing';
    this.bobber = new Mesh(bobberGeometry(), litMaterial());
    this.bobber.visible = false;
    this.fish = new Mesh(fishGeometry(), litMaterial());
    this.fish.visible = false;
    this.linePos = new Float32Array((SEG + 1) * 3);
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', new BufferAttribute(this.linePos, 3));
    this.line = new Line(lineGeo, new LineBasicMaterial({ color: '#fffdf6', transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    const ringGeo = new RingGeometry(0.82, 1, 36);
    for (let i = 0; i < 4; i++) {
      const mesh = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.ripples.push({ mesh, age: 1, size: 1 });
      this.group.add(mesh);
    }
    this.group.add(this.bobber, this.fish, this.line);
  }

  /** Close enough to the spot to fish from it. */
  inRange(x: number, z: number) {
    return Math.hypot(x - this.spot.x, z - this.spot.z) < FISH_RANGE;
  }

  get active() {
    return this.phase !== 'ready';
  }

  /** Where the explorer stands to cast. */
  get stand() {
    return { x: this.spot.x, z: this.spot.z };
  }

  cast() {
    if (this.phase !== 'ready') return;
    const p = this.player.pos;
    this.tooSoon = false;
    this.land.set(p.x + CAST.x * 3.3 + (Math.random() - 0.5) * 0.6, 0, p.z + CAST.z * 3.3 + (Math.random() - 0.5) * 0.6);
    this.player.faceToward(this.land.x, this.land.z);
    this.player.rodOut = 1;
    this.setPhase(this.opts.reducedMotion ? 'flight' : 'windup');
  }

  /** Reel in: a catch if something's biting, otherwise the float just comes back. */
  reel() {
    if (this.phase === 'bite') {
      this.setPhase('catch');
      this.splash(this.float, 10);
      this.ripple(this.float, 1.3);
      this.onSound?.('whoosh');
    } else if (this.phase === 'wait' || this.phase === 'flight') {
      this.tooSoon = this.phase === 'wait';
      this.setPhase('reel');
    }
  }

  /** Walked away: bring the float back in and put the rod down. */
  cancel() {
    if (this.phase === 'ready') {
      this.player.rodOut = 0;
      return;
    }
    if (this.phase === 'catch') return; // the fish is already in the air; let it land
    this.tooSoon = false;
    this.setPhase('reel');
    this.player.rodOut = 0;
  }

  private setPhase(p: FishPhase) {
    this.phase = p;
    this.t = 0;
    if (p === 'wait') {
      this.waitFor = 1.5 + Math.random() * 2;
      const n = 1 + Math.floor(Math.random() * 3);
      this.nibbles = Array.from({ length: n }, (_, i) => (this.waitFor * (i + 0.6 + Math.random() * 0.3)) / (n + 0.4)).filter((x) => x < this.waitFor - 0.35);
    }
    if (p === 'reel' || p === 'miss') this.from.copy(this.float);
    if (p === 'flight') this.player.rodTip(this.from);
  }

  private ripple(at: Vector3, size: number) {
    const r = this.ripples.reduce((a, b) => (b.age > a.age ? b : a));
    r.age = 0;
    r.size = size;
    r.mesh.position.set(at.x, 0.03, at.z);
    r.mesh.visible = true;
  }

  private splash(at: Vector3, n: number) {
    if (this.opts.reducedMotion) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.5 + Math.random() * 0.9;
      this.puffs.spawn(at.x + Math.cos(a) * 0.1, Math.max(at.y, 0) + 0.05, at.z + Math.sin(a) * 0.1, {
        vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2.2 + Math.random() * 1.8,
        gravity: -11, drag: 0.6, size: 0.06 + Math.random() * 0.04, life: 0.6 + Math.random() * 0.2, grow: -0.3, color: '#e6f6ff',
      });
    }
  }

  /** The float's resting height on the swell, plus any dip. */
  private floatY(x: number, z: number) {
    return waveHeight(x, z, this.now) + 0.03 - this.dip;
  }

  update(time: number, dt: number) {
    this.now = time;
    this.t += dt;
    const t = this.t;
    const rm = this.opts.reducedMotion;
    const pl = this.player;
    pl.rodTip(this.tip);
    pl.head(this.chest);
    this.chest.y -= 0.2;

    // The nibble spring: little dips that settle back.
    this.dipVel += (-this.dip * 160 - this.dipVel * 9) * dt;
    this.dip += this.dipVel * dt;

    switch (this.phase) {
      case 'ready':
        this.bobber.visible = false;
        this.line.visible = false;
        pl.rodPitch = lerp(pl.rodPitch, 0.6, 1 - Math.exp(-dt * 6));
        break;
      case 'windup': {
        // Rod back over the shoulder...
        pl.rodPitch = lerp(0.6, 1.55, easeOutCubic(t / 0.32));
        this.bobber.visible = false;
        this.line.visible = false;
        if (t >= 0.32) {
          this.setPhase('flight');
          this.onSound?.('whoosh');
        }
        break;
      }
      case 'flight': {
        // ...and flick: the float sails out on an arc and plops down.
        const D = rm ? 0.01 : 0.62;
        pl.rodPitch = lerp(pl.rodPitch, 0.35, 1 - Math.exp(-dt * 18));
        const k = clamp(t / D);
        const ly = this.floatY(this.land.x, this.land.z);
        this.float.set(lerp(this.from.x, this.land.x, k), lerp(this.from.y, ly, k) + Math.sin(Math.PI * k) * 1.6, lerp(this.from.z, this.land.z, k));
        this.bobber.visible = true;
        this.line.visible = true;
        this.slack = 0.1;
        if (t >= D) {
          this.ripple(this.float, 0.9);
          this.splash(this.float, 4);
          this.onSound?.('pop');
          this.setPhase('wait');
        }
        break;
      }
      case 'wait': {
        if (this.nibbles.length && t >= this.nibbles[0]) {
          this.nibbles.shift();
          this.dipVel -= 1.6;
          this.ripple(this.float, 0.45);
          pl.rodPitch -= 0.08;
        }
        this.float.set(this.land.x, this.floatY(this.land.x, this.land.z), this.land.z);
        pl.rodPitch = lerp(pl.rodPitch, 0.42, 1 - Math.exp(-dt * 5));
        this.slack = lerp(this.slack, 0.45, 1 - Math.exp(-dt * 3));
        if (t >= this.waitFor) {
          this.setPhase('bite');
          this.dipVel -= 3.2;
          this.ripple(this.float, 1.1);
          this.splash(this.float, 5);
          this.onSound?.('tap');
          this.onBite?.();
        }
        break;
      }
      case 'bite': {
        // Under it goes, tugging the rod tip down, for a moment.
        const under = 0.24 + Math.sin(t * 22) * 0.03;
        this.float.set(this.land.x + Math.sin(t * 17) * 0.04, waveHeight(this.land.x, this.land.z, time) - under, this.land.z);
        pl.rodPitch = 0.12 + Math.sin(t * 26) * 0.05;
        this.slack = 0;
        if (t >= WINDOW) {
          this.setPhase('miss');
          this.ripple(this.float, 0.8);
          pl.squish(3);
        }
        break;
      }
      case 'catch': {
        // The fish leaps out of the sea and lands in your arms.
        const D = rm ? 0.5 : 0.8;
        const k = clamp(t / D);
        pl.rodPitch = lerp(pl.rodPitch, 1.25, 1 - Math.exp(-dt * 10));
        this.bobber.visible = false;
        this.fish.visible = true;
        if (rm) {
          this.fish.position.set(this.chest.x, this.chest.y + 0.5, this.chest.z);
          this.fish.scale.setScalar(easeOutCubic(k * 3));
          this.fish.rotation.set(0, pl.yaw + Math.PI / 2, 0);
        } else {
          this.leap(k, this.fish.position);
          this.leap(Math.min(1, k + 0.02), this.tmp);
          this.fish.lookAt(this.tmp);
          this.fish.rotateY(Math.sin(t * 34) * 0.35 * (1 - k));
          this.fish.scale.setScalar(1 - easeInCubic(clamp((k - 0.85) / 0.15)) * 0.8);
        }
        this.float.copy(this.fish.position);
        this.slack = 0.05;
        if (t >= D) {
          this.fish.visible = false;
          this.line.visible = false;
          const c = this.chest;
          for (let i = 0; i < (rm ? 3 : 10); i++) {
            const a = (i / 10) * Math.PI * 2;
            this.puffs.spawn(c.x, c.y + 0.3, c.z, { vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, vy: 1.2, size: 0.07, life: 0.6, drag: 3, color: i % 2 ? '#ffd166' : '#fff6df' });
          }
          pl.hop(5);
          this.onSound?.('chime');
          this.phase = 'ready';
          this.onCatch?.();
        }
        break;
      }
      case 'miss': {
        // It got away: the float pops back up, the line goes slack, and it's reeled in.
        const up = Math.min(1, t / 0.25);
        this.float.set(this.land.x, lerp(this.from.y, this.floatY(this.land.x, this.land.z) + 0.04, easeOutCubic(up)), this.land.z);
        this.slack = lerp(this.slack, 0.7, 1 - Math.exp(-dt * 4));
        pl.rodPitch = lerp(pl.rodPitch, 0.5, 1 - Math.exp(-dt * 4));
        if (t >= 0.7) {
          this.from.copy(this.float);
          this.phase = 'reel';
          this.t = 0;
          this.missed = true;
        }
        break;
      }
      case 'reel': {
        const D = rm ? 0.05 : 0.38;
        const k = easeInCubic(clamp(t / D));
        this.float.lerpVectors(this.from, this.tip, k);
        this.float.y += Math.sin(Math.PI * k) * 0.6;
        this.slack = 0.05;
        if (t >= D) {
          this.bobber.visible = false;
          this.line.visible = false;
          this.phase = 'ready';
          if (this.missed) {
            this.missed = false;
            this.onMiss?.();
          }
        }
        break;
      }
    }

    if (this.bobber.visible) {
      this.bobber.position.copy(this.float);
      this.bobber.rotation.set(Math.sin(time * 1.7) * 0.15, 0, Math.cos(time * 1.3) * 0.15);
    }
    if (this.line.visible) this.drawLine(this.phase === 'catch' ? this.fishMouth() : this.float);
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.age += dt / 1.1;
      if (r.age >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(r.size * (0.15 + easeOutCubic(r.age) * 0.85));
      (r.mesh.material as MeshBasicMaterial).opacity = (1 - r.age) * 0.55;
    }
  }

  /** The fish's path, from under the float up over the water to the explorer. */
  private leap(k: number, out: Vector3) {
    const s = this.land;
    const e = this.chest;
    return out.set(lerp(s.x, e.x, k), lerp(-0.3, e.y, k) + Math.sin(Math.PI * k) * 2.2, lerp(s.z, e.z, k));
  }

  private fishMouth() {
    this.fish.updateMatrixWorld();
    return this.end.set(0, 0, 0.3).applyMatrix4(this.fish.matrixWorld);
  }

  /** A line from the rod tip to `to`, sagging by the current slack. */
  private drawLine(to: Vector3) {
    const a = this.tip;
    const p = this.linePos;
    const mx = (a.x + to.x) / 2;
    const my = Math.min(a.y, to.y) + (Math.max(a.y, to.y) - Math.min(a.y, to.y)) * 0.35 - this.slack;
    const mz = (a.z + to.z) / 2;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const w = 1 - u;
      p[i * 3] = w * w * a.x + 2 * w * u * mx + u * u * to.x;
      p[i * 3 + 1] = w * w * a.y + 2 * w * u * my + u * u * to.y;
      p[i * 3 + 2] = w * w * a.z + 2 * w * u * mz + u * u * to.z;
    }
    (this.line.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.bobber.geometry.dispose();
    this.fish.geometry.dispose();
    this.line.geometry.dispose();
    (this.line.material as LineBasicMaterial).dispose();
    this.ripples[0]?.mesh.geometry.dispose();
    for (const r of this.ripples) (r.mesh.material as MeshBasicMaterial).dispose();
  }
}
