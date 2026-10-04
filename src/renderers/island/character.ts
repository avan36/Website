// The explorer: a round little marshmallow with an orange scarf, a backpack
// and a sprout. Owns its own movement (circle collisions, steps it can and
// can't climb, wading and swimming in the sea) and all the juice: hop, jump
// and a somersaulting double jump, squash and stretch, dust and splashes,
// strokes and wakes, blinks, glances. Off the pier it can hold out a little
// bamboo fishing rod.

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
  Object3D,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, dampAngle, easeOutBack, lerp, smoothstep, Spring, TAU } from './util/math';
import type { Puffs } from './world/particles';
import type { Ripples } from './world/ripples';
import type { Collider } from './world/nature';
import { groundAt, heightAt, isWalkable, rockiness, swimRoom } from './world/shape';
import { waveHeight } from './world/water';

const SPEED = 5.4;
const BODY_R = 0.5;
const SCALE = 1.6;
const GRAVITY = 32;
/** Takeoff speed of a full jump (about 1.3 high), and of a gentler one for reduced motion. */
const JUMP = 9.2;
const JUMP_LOW = 6;
/** The second jump, in mid-air, takes off a little slower than the first (about 0.95 high). */
const AIR_JUMP = 0.85;
/** How long the double jump's somersault takes. */
const FLIP = 0.42;
/** A press this soon before landing still jumps, on landing. */
const JUMP_BUFFER = 0.12;
/** The ground falling away faster than this under your feet is a ledge: you drop off it. */
const DROP = 0.3;
/** The highest step up you can walk (a kerb, not the pier's deck from the water). */
const MAX_STEP = 0.6;
/** Ground rising steeper than this can't be climbed: the headland's cliffs. */
const CLIFF = 1.0;

// In the sea
/** Afloat, the feet hang this far under the surface: head and shoulders stay out. */
const SINK = 0.8;
/** Start swimming in water deeper than this, and wade again once it's shallower than that. */
const SWIM_IN = 0.78;
const SWIM_OUT = 0.62;
/** How fast you go wading and swimming, as a share of walking. */
const WADE_PACE = 0.75;
const SWIM_PACE = 0.6;
/** Within this of the edge of the swimming water, a current holds you back. */
const CURRENT = 2.6;
/** How far a swimmer keeps from the pier and the boat (their heads would go through the deck). */
const SWIM_R = 0.6;

// Running (Shift held, or a double-click on where to go)
/** How much faster running is, on land and in the water. */
const RUN = 1.7;
const RUN_WET = 1.3;

export type Water = 'dry' | 'wade' | 'swim';

/** Something in the water to swim round: a segment with a radius, as high as its top. */
export interface Obstacle {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  top: number;
}

/** Which way and how steeply the ground rises at (x, z), as rise over run. */
function gradient(x: number, z: number, out: Vector2) {
  const e = 0.25;
  return out.set(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)).divideScalar(2 * e);
}

export class Explorer {
  readonly root = new Group();
  readonly pos = new Vector3();
  readonly vel = new Vector2();
  yaw = 0;
  /** Vertical offset above the ground (drop-in, hops). */
  private air = 0;
  private airVel = 0;
  grounded = true;

  /** Turns about the middle of the body, for the double jump's somersault. */
  private flipG = new Group();
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
  /** Landed on dry ground. */
  onLand?: (impact: number) => void;
  /** Took off: from the ground, or a second time in mid-air. */
  onJump?: (second: boolean) => void;
  /** Hit the water: harder the faster you were falling, gentle walking in. */
  onSplash?: (strength: number) => void;
  /** A swimming stroke, or a kick (Space in deep water). */
  onStroke?: (kick: boolean) => void;
  /** Lower jumps and no somersault (reduced motion). */
  lowJumps = false;
  /** Hang a moment longer at the top of a jump (on the hilltop). */
  floaty = false;
  /** In the sea: wading in the shallows, or swimming. */
  water: Water = 'dry';
  /** The pier's deck and the boat, for swimming round. */
  obstacles: Obstacle[] = [];
  /** Shrinks and spins the explorer (going through the portal, or coming out of it). */
  warp = 1;
  spin = 0;
  /** Drawn toward `pullTo` (0..1): into the portal's swirl. */
  pull = 0;
  readonly pullTo = new Vector3();
  /** Want to run (Shift, or a double-click). */
  sprint = false;
  /** No dust kicked up while running (reduced motion). */
  calm = false;
  /** How much running there is in the stride, eased in and out. */
  private runAmt = 0;
  private strides = 0;
  /** Took off from the water: the pier's deck is out of reach (no climbing out onto it). */
  private fromSea = false;
  private jumping = false;
  private jumpBuffer = 0;
  private airJumped = false;
  private flipT = -1;
  /** Bobbing in the water after a plunge or a kick. */
  private dip = new Spring(0, 60, 6);
  private swimAmt = 0;
  private strokeAmt = 0;
  private stroke = 0;
  private lastHand = 0;
  private kickT = 0;
  private wakeT = 0;
  private splashT = 0;
  /** Water above the feet, smoothed (hides the blob shadow). */
  private wet = 0;
  private now = 0;
  /** Ground height where the explorer stands, worked out once per move. */
  private hHere = 0;
  private dir = new Vector2();
  private grad = new Vector2();

  constructor(
    private puffs: Puffs,
    private ripples: Ripples,
    /** An islander instead of the explorer: their own scarf, and no sprout or backpack. */
    look: { scarf?: string; islander?: boolean } = {},
  ) {
    const white = this.mat(new MeshStandardMaterial({ color: '#fffaf1', roughness: 0.55 }));
    const ink = this.mat(new MeshStandardMaterial({ color: '#1f1a17', roughness: 0.3 }));
    const shine = this.mat(new MeshBasicMaterial({ color: '#ffffff' }));
    const blush = this.mat(new MeshStandardMaterial({ color: '#ff9e9e', roughness: 0.8 }));
    const orange = this.mat(new MeshStandardMaterial({ color: look.scarf ?? '#ff5a36', roughness: 0.7 }));
    const pack = this.mat(new MeshStandardMaterial({ color: '#e7ac68', roughness: 0.8 }));
    const leaf = this.mat(new MeshStandardMaterial({ color: '#57c15a', roughness: 0.7, flatShading: true }));
    const boot = this.mat(new MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.8 }));

    this.root.add(this.flipG);
    this.flipG.position.y = 0.55;
    this.flipG.add(this.squashG);
    this.squashG.position.y = -0.55;
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
    if (look.islander) bag.visible = flap.visible = roll.visible = false;

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
    this.sprout.visible = !look.islander;

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
   * Indoors, in a building's room: a flat floor at 0, no sea, and the room
   * says where you can stand (see roomPlan.ts). Null out on the island.
   */
  indoors: { canStand(x: number, z: number): boolean } | null = null;
  private tWalk(x: number, z: number) {
    return this.indoors ? true : isWalkable(x, z);
  }
  private tGround(x: number, z: number) {
    return this.indoors ? 0 : groundAt(x, z);
  }
  private tHeight(x: number, z: number) {
    return this.indoors ? 0 : heightAt(x, z);
  }
  private tWave(x: number, z: number, t: number) {
    return this.indoors ? -10 : waveHeight(x, z, t);
  }
  private tRoom(x: number, z: number) {
    return this.indoors ? 10 : swimRoom(x, z);
  }
  private tRocks(x: number, z: number) {
    return this.indoors ? 0 : rockiness(x, z);
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
    this.vel.set(0, 0);
    this.yaw = yaw;
    this.airVel = 0;
    this.jumping = false;
    this.airJumped = false;
    this.flipT = -1;
    this.flipG.rotation.x = 0;
    this.dip.snap(0);
    this.fromSea = false;
    this.pos.set(x, 0, z);
    // In the sea you start out afloat (or wading), not dropped in from above.
    const wet = !this.tWalk(x, z);
    const depth = wet ? Math.max(0, -this.tHeight(x, z)) : 0;
    this.water = !wet ? 'dry' : depth > SWIM_IN ? 'swim' : 'wade';
    this.swimAmt = this.water === 'swim' ? 1 : 0;
    this.air = wet ? 0 : air;
    this.pos.y = this.floorAt(x, z, wet);
    this.grounded = this.air <= 0;
    this.sync();
  }

  hop(v = 6) {
    if (!this.grounded) return;
    // Afloat there's nothing to push off: bob instead.
    if (this.water === 'swim') return this.dip.kick(v * 0.3);
    this.airVel = v;
    this.grounded = false;
    this.land.kick(4);
  }

  /**
   * Jump now if on the ground, jump again if in the air with the second jump
   * still to use, or else jump on landing if that's moments away. Swimming,
   * it's a kick instead. True if it took off.
   */
  jump() {
    if (this.grounded && this.water === 'swim') {
      this.kick();
      return false;
    }
    if (this.grounded) {
      this.takeOff();
      return true;
    }
    if (!this.airJumped) {
      this.airJump();
      return true;
    }
    this.jumpBuffer = JUMP_BUFFER;
    return false;
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

  /** The double jump's somersault so far, in radians (0 when not turning). */
  get flipAngle() {
    return this.flipG.rotation.x;
  }

  /** True once the second jump has been used (until landing). */
  get doubleJumped() {
    return this.airJumped;
  }

  private takeOff() {
    this.airVel = this.lowJumps ? JUMP_LOW : JUMP;
    this.grounded = false;
    this.jumping = true;
    this.jumpBuffer = 0;
    this.land.kick(7);
    this.fromSea = this.water !== 'dry';
    if (this.water === 'wade') this.splash(0.3, true);
    this.onJump?.(false);
  }

  /** The double jump: a fresh push off thin air, with a somersault and a ring of air where it happened. */
  private airJump() {
    this.airJumped = true;
    this.airVel = (this.lowJumps ? JUMP_LOW : JUMP) * AIR_JUMP;
    this.jumping = true;
    this.jumpBuffer = 0;
    this.land.kick(6);
    if (!this.lowJumps) {
      this.flipT = 0;
      const x = this.pos.x;
      const z = this.pos.z;
      const y = this.pos.y + this.air;
      this.ripples.spawn(x, z, { y: y + 0.08, from: 0.3, to: 1.5, life: 0.38, width: 0.16, alpha: 0.9 });
      this.ripples.spawn(x, z, { y: y + 0.02, from: 0.2, to: 0.95, life: 0.3, width: 0.1, alpha: 0.7, delay: 0.05 });
      this.puffs.ring(x, y - 0.12, z, 7, 2.1, '#ffffff', 0.11);
    }
    this.onJump?.(true);
  }

  /** Space in deep water: a strong kick forward, with a splash behind. */
  private kick() {
    if (this.kickT > 0) return;
    this.kickT = 0.5;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.vel.x += fx * 2.4;
    this.vel.y += fz * 2.4;
    this.dip.kick(1.4);
    this.land.kick(4);
    const x = this.pos.x - fx * 0.75;
    const z = this.pos.z - fz * 0.75;
    const y = this.tWave(x, z, this.now);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      this.puffs.spawn(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, {
        vx: Math.cos(a) * 0.9 - fx * 1.2, vz: Math.sin(a) * 0.9 - fz * 1.2, vy: 2.6 + Math.random() * 1.6,
        gravity: -16, drag: 1.5, size: 0.07 + Math.random() * 0.05, life: 0.55, grow: 0, color: '#eefaff',
      });
    }
    this.ripples.spawn(x, z, { from: 0.25, to: 1.5, life: 1.1, width: 0.1, alpha: 0.6 });
    this.onStroke?.(true);
  }

  /** Droplets and rings where the explorer meets the water. */
  private splash(strength: number, quiet = false) {
    const x = this.pos.x;
    const z = this.pos.z;
    const y = this.tWave(x, z, this.now);
    const n = Math.round(4 + strength * 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4;
      const out = 0.8 + Math.random() * 1.4 * strength;
      this.puffs.spawn(x + Math.cos(a) * 0.35, y + 0.05, z + Math.sin(a) * 0.35, {
        vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: 2.2 + Math.random() * 3.2 * strength,
        gravity: -17, drag: 1.2, size: 0.07 + Math.random() * 0.06, life: 0.5 + strength * 0.25, grow: 0, color: '#eefaff',
      });
    }
    this.ripples.spawn(x, z, { from: 0.35, to: 1.4 + strength * 1.4, life: 0.9 + strength * 0.4, width: 0.12 + strength * 0.06, alpha: 0.75 });
    if (strength > 0.5) this.ripples.spawn(x, z, { from: 0.2, to: 1 + strength * 0.8, life: 0.9, width: 0.09, alpha: 0.55, delay: 0.12 });
    if (!quiet && this.splashT <= 0) {
      this.splashT = 0.9;
      this.onSplash?.(strength);
    }
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

  /** In the sea? (Anywhere off the land and the pier.) */
  get inWater() {
    return this.water !== 'dry';
  }

  /** Where the feet rest at (x, z): the ground, or in the sea the seabed or afloat at the surface. */
  private floorAt(x: number, z: number, wet: boolean) {
    const ground = this.tGround(x, z);
    return wet ? Math.max(ground, this.tWave(x, z, this.now) - SINK) : ground;
  }

  /** How fast you can go here, as a share of walking (running included). */
  private pace(x: number, z: number) {
    const run = 1 + ((this.water === 'dry' ? RUN : RUN_WET) - 1) * this.runAmt;
    if (this.water === 'swim') return SWIM_PACE * run;
    if (this.water === 'dry' || !this.grounded) return run;
    return lerp(1, WADE_PACE, smoothstep(0, 0.3, -this.tHeight(x, z))) * run;
  }

  /** Running right now (for tests): Shift's down and the legs are going. */
  get sprinting() {
    return this.runAmt > 0.5 && this.speed > 1;
  }

  /**
   * Could the explorer's feet go to (x, z) from here? On land or in the
   * swimming water, and not up a step too high (the pier's deck from the sea)
   * nor up a cliff, unless well clear above it in a jump.
   */
  private canGo(x: number, z: number) {
    if (this.indoors) return this.indoors.canStand(x, z);
    if (!this.tWalk(x, z) && this.tRoom(x, z) < 0.05) return false;
    const feet = this.pos.y + this.air;
    const g = this.tGround(x, z);
    if (g > feet + (this.grounded ? MAX_STEP : 0.2)) return false;
    const h = this.tHeight(x, z);
    // The pier's deck is flat, but out of reach from the water, even jumping.
    if (g > h + 0.01) return !this.fromSea || this.tGround(this.pos.x, this.pos.z) > this.hHere + 0.01;
    if (h <= this.hHere + 0.002 || h < feet - 1) return true; // not climbing, or well above it
    return gradient(x, z, this.grad).length() < CLIFF;
  }

  /**
   * Near the edge of the swimming water a current holds you back: heading out
   * gets slower the closer you are, and right at the edge it turns you round.
   */
  private current() {
    const x = this.pos.x;
    const z = this.pos.z;
    const room = this.tRoom(x, z);
    if (room > CURRENT) return;
    // Back toward the island is up the slope of the room left.
    const e = 0.3;
    const gx = this.tRoom(x + e, z) - this.tRoom(x - e, z);
    const gz = this.tRoom(x, z + e) - this.tRoom(x, z - e);
    const gl = Math.hypot(gx, gz) || 1;
    const ix = gx / gl;
    const iz = gz / gl;
    const out = -(this.vel.x * ix + this.vel.y * iz);
    const allow = SPEED * SWIM_PACE * smoothstep(0.3, CURRENT, room);
    let push = out > allow ? out - allow : 0;
    if (room < 0.45) push += (0.45 - room) * 2.5;
    this.vel.x += ix * push;
    this.vel.y += iz * push;
  }

  /** How far (x, z) is inside an obstacle, keeping a swimmer's distance (negative: clear of it). */
  private static inside(o: Obstacle, x: number, z: number) {
    const dx = o.bx - o.ax;
    const dz = o.bz - o.az;
    const k = clamp(((x - o.ax) * dx + (z - o.az) * dz) / (dx * dx + dz * dz || 1));
    return o.r + SWIM_R - Math.hypot(x - (o.ax + dx * k), z - (o.az + dz * k));
  }

  /** Swim round the pier and the boat: pushed back out, gently if somehow already inside. */
  private avoid(nx: number, nz: number, dt: number, out: Vector2) {
    out.set(nx, nz);
    const feet = this.pos.y + this.air;
    for (const o of this.obstacles) {
      if (feet > o.top - 0.1) continue; // above it: jumping off the pier, or over the boat
      const now = Explorer.inside(o, out.x, out.y);
      if (now <= 0) continue;
      // Already inside (landing in the water right beside it): drift out, don't jump.
      const allowed = Math.max(0, Explorer.inside(o, this.pos.x, this.pos.z) - 3 * dt);
      if (now <= allowed) continue;
      const dx = o.bx - o.ax;
      const dz = o.bz - o.az;
      const k = clamp(((out.x - o.ax) * dx + (out.y - o.az) * dz) / (dx * dx + dz * dz || 1));
      const ex = out.x - (o.ax + dx * k);
      const ez = out.y - (o.az + dz * k);
      const d = Math.hypot(ex, ez) || 0.001;
      out.x += (ex / d) * (now - allowed);
      out.y += (ez / d) * (now - allowed);
    }
    return out;
  }

  /**
   * Move with a desired direction (length 0..1). Returns true if movement was
   * blocked (so click-to-walk can give up instead of pushing into a wall).
   */
  move(dt: number, wish: Vector2, colliders: Collider[]) {
    // Ease into a run and back out of it, but in the air keep whatever you took off with.
    if (this.grounded) this.runAmt = damp(this.runAmt, this.sprint ? 1 : 0, this.sprint ? 5 : 3, dt);
    const len = wish.length();
    const swim = this.water === 'swim';
    let max = SPEED * this.pace(this.pos.x, this.pos.z) * clamp(len, 0, 1);
    // Swimming comes in strokes: a push with each pull of the arms, a glide between.
    if (swim) max *= 0.78 + 0.7 * Math.max(0, Math.sin(this.stroke));
    const tx = len > 1e-6 ? (wish.x / len) * max : 0;
    const tz = len > 1e-6 ? (wish.y / len) * max : 0;
    // In the air you keep your momentum and steer a little less; afloat you glide.
    const accel = !this.grounded ? (max > 0.01 ? 9 : 1.5) : swim ? (max > 0.01 ? 4 : 2.4) : max > 0.01 ? 16 : 12;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.y = damp(this.vel.y, tz, accel, dt);
    if (this.vel.lengthSq() < 1e-4 && max < 0.01) this.vel.set(0, 0);
    if (!this.tWalk(this.pos.x, this.pos.z)) this.current();
    // A cliff face is too steep to stand on (say you landed on one): slide off it.
    else if (this.grounded && this.tRocks(this.pos.x, this.pos.z) > 0.3) {
      const g = gradient(this.pos.x, this.pos.z, this.grad);
      const k = g.length();
      if (k > CLIFF) this.vel.addScaledVector(g, -7 / k);
    }

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
    if (this.obstacles.length && !this.tWalk(nx, nz)) {
      const p = this.avoid(nx, nz, dt, this.dir);
      nx = p.x;
      nz = p.y;
    }
    let blocked = false;
    this.hHere = this.tHeight(this.pos.x, this.pos.z);
    if (!this.canGo(nx, nz)) {
      if (this.canGo(nx, this.pos.z)) nz = this.pos.z;
      else if (this.canGo(this.pos.x, nz)) nx = this.pos.x;
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

  update(t: number, dt: number) {
    this.now = t;
    const puffs = this.puffs;
    const speed = this.speed;
    const x = this.pos.x;
    const z = this.pos.z;
    const wet = !this.tWalk(x, z);
    const surface = this.tWave(x, z, t);
    const depth = wet ? Math.max(0, -this.tHeight(x, z)) : 0;
    const floor = this.floorAt(x, z, wet);
    this.splashT -= dt;
    this.kickT -= dt;

    // Vertical: drop-in, hops, jumps, and falling off ledges.
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.grounded) {
      if (floor < this.pos.y - DROP) {
        // Walked off something (the pier's edge, the top of a cliff): fall from here.
        this.air = this.pos.y - floor;
        this.pos.y = floor;
        this.airVel = 0;
        this.grounded = false;
        this.jumping = false;
      } else {
        // In the sea or out of it (only underfoot: in the air you're in neither).
        const was = this.water;
        this.water = !wet ? 'dry' : depth > (was === 'swim' ? SWIM_OUT : SWIM_IN) ? 'swim' : 'wade';
        if (this.water === 'swim' && was !== 'swim') this.splash(0.35);
        this.pos.y = damp(this.pos.y, floor, this.water === 'swim' ? 7 : 25, dt);
      }
    }
    if (!this.grounded) {
      const hang = this.floaty && this.jumping && Math.abs(this.airVel) < 3 ? 0.45 : 1;
      // Keep the height in the air, whatever the ground below does (a ledge, the edge of the pier).
      const was = this.pos.y + this.air;
      this.airVel -= GRAVITY * hang * dt;
      const y = was + this.airVel * dt;
      if (wet && was > surface && y <= surface && this.airVel < -2) this.splash(clamp(-this.airVel / 11, 0.3, 1.4));
      this.pos.y = floor;
      this.air = y - floor;
      if (this.air <= 0) {
        const impact = Math.min(1.6, -this.airVel / 10);
        this.air = 0;
        this.airVel = 0;
        this.grounded = true;
        this.jumping = false;
        this.airJumped = false;
        this.fromSea = false;
        this.water = !wet ? 'dry' : depth > SWIM_IN ? 'swim' : 'wade';
        if (this.water === 'swim') {
          // Sink in a little and bob back up. No jumping out again.
          this.dip.kick(-impact * 3.2);
          this.jumpBuffer = 0;
        } else {
          this.land.kick((this.water === 'wade' ? -6 : -9) * impact);
          if (this.water === 'dry') {
            this.onLand?.(impact);
            if (impact > 0.5) puffs.ring(this.pos.x, this.pos.y, this.pos.z, 10, 2.6 * impact, '#fbf1dc', 0.22);
          }
          if (this.jumpBuffer > 0) this.takeOff();
        }
      }
    }
    this.dip.update(dt);
    this.wet = damp(this.wet, wet ? clamp(surface - this.pos.y - this.air) : 0, 10, dt);

    // Facing (slower to turn afloat)
    if (speed > 0.3) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.y), this.water === 'swim' ? 6 : 12, dt);
      this.yawTarget = null;
    } else if (this.yawTarget !== null) {
      this.yaw = dampAngle(this.yaw, this.yawTarget, 8, dt);
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);

    // Walk cycle (wading too: the water slows you and splashes instead of dust)
    const swimming = this.water === 'swim' && this.grounded;
    this.walkAmt = damp(this.walkAmt, swimming ? 0 : clamp(speed / SPEED), 10, dt);
    this.phase += swimming ? 0 : speed * dt * 2.3;
    const s = Math.sin(this.phase);
    if (this.walkAmt > 0.25 && this.grounded && !swimming && Math.sign(s) !== Math.sign(this.lastSin)) {
      this.onStep?.();
      const side = s > 0 ? 1 : -1;
      const back = -0.25;
      const px = this.pos.x + fx * back + fz * 0.18 * side;
      const pz = this.pos.z + fz * back - fx * 0.18 * side;
      if (this.water === 'wade') {
        this.ripples.spawn(px, pz, { from: 0.15, to: 0.85, life: 0.75, width: 0.07, alpha: 0.55 });
        for (let i = 0; i < 2; i++) {
          puffs.spawn(px, surface + 0.04, pz, {
            vx: -this.vel.x * 0.15 + (Math.random() - 0.5), vz: -this.vel.y * 0.15 + (Math.random() - 0.5), vy: 1.6 + Math.random(),
            gravity: -14, drag: 1.5, size: 0.06 + Math.random() * 0.04, life: 0.45, grow: 0, color: '#eefaff',
          });
        }
      } else {
        puffs.spawn(px, this.pos.y + 0.06, pz, { vy: 0.7, vx: -this.vel.x * 0.12, vz: -this.vel.y * 0.12, size: 0.11 + Math.random() * 0.05, life: 0.45, color: '#f6ead2', drag: 4 });
        // Running kicks up a little more, every other step.
        if (this.runAmt > 0.5 && !this.calm && ++this.strides % 2 === 0) {
          for (let i = 0; i < 3; i++) {
            puffs.spawn(px - fx * 0.15, this.pos.y + 0.08, pz - fz * 0.15, {
              vx: -fx * (1.1 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.8, vz: -fz * (1.1 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.8, vy: 0.9 + Math.random() * 0.6,
              size: 0.13 + Math.random() * 0.07, life: 0.55, color: '#f6ead2', drag: 3.5,
            });
          }
        }
      }
    }
    this.lastSin = s;
    const bob = Math.abs(s) * 0.17 * this.walkAmt;

    // Swimming: strokes, the wake, rings round you while treading water.
    this.swimAmt = damp(this.swimAmt, swimming ? 1 : 0, 6, dt);
    this.strokeAmt = damp(this.strokeAmt, swimming ? clamp(speed / (SPEED * SWIM_PACE)) : 0, 4, dt);
    if (swimming) {
      const before = Math.floor(this.stroke / TAU);
      this.stroke += dt * lerp(2.6, 6.6, this.strokeAmt);
      if (Math.floor(this.stroke / TAU) !== before && this.strokeAmt > 0.3) this.onStroke?.(false);
      // A splash where each paw comes down at the front.
      const hand = Math.sin(this.stroke);
      if (this.strokeAmt > 0.3 && Math.sign(hand) !== Math.sign(this.lastHand)) {
        const side = hand > 0 ? 1 : -1;
        const hx = this.pos.x + fx * 0.75 + fz * 0.5 * side;
        const hz = this.pos.z + fz * 0.75 - fx * 0.5 * side;
        puffs.spawn(hx, surface + 0.05, hz, { vx: fx * 0.6, vz: fz * 0.6, vy: 1.8, gravity: -14, drag: 1.5, size: 0.07, life: 0.4, grow: 0, color: '#eefaff' });
        this.ripples.spawn(hx, hz, { from: 0.1, to: 0.6, life: 0.6, width: 0.06, alpha: 0.45 });
      }
      this.lastHand = hand;
      this.wakeT -= dt;
      if (this.wakeT <= 0) {
        if (speed > 0.8) {
          // Rings left behind spread slower than you swim, so together they make a V.
          this.wakeT = 0.26;
          this.ripples.spawn(this.pos.x - fx * 0.45, this.pos.z - fz * 0.45, { from: 0.45, to: 1.9, life: 1.5, width: 0.09, alpha: 0.5 });
        } else {
          this.wakeT = 1.6;
          this.ripples.spawn(this.pos.x, this.pos.z, { from: 0.55, to: 2.1, life: 2.6, width: 0.08, alpha: 0.38 });
        }
      }
    } else if (this.water === 'wade' && this.grounded && speed < 0.3) {
      // Standing in the shallows: the odd ring round your legs.
      this.wakeT -= dt;
      if (this.wakeT <= 0) {
        this.wakeT = 2.2;
        this.ripples.spawn(this.pos.x, this.pos.z, { from: 0.45, to: 1.3, life: 1.8, width: 0.07, alpha: 0.4 });
      }
    }

    // Squash & stretch
    this.land.update(dt);
    const breathe = Math.sin(t * 2.6) * 0.018 * (1 - this.walkAmt);
    const stretch = this.grounded ? Math.cos(this.phase * 2) * -0.05 * this.walkAmt : clamp(this.airVel * 0.012, -0.12, 0.15);
    const sy = clamp(this.land.value + breathe + stretch, 0.6, 1.4);
    const sxz = 1 / Math.sqrt(sy);
    this.squashG.scale.set(sxz, sy, sxz);
    const sw = this.swimAmt;
    const st = this.stroke;
    const pull = 0.4 + 0.6 * this.strokeAmt;
    this.bodyG.position.y = 0.12 + bob * (1 - sw) + Math.sin(st * 2) * 0.025 * sw;
    // Afloat you lean into the water, rocking a little with each stroke.
    this.bodyG.rotation.x = lerp((0.14 + 0.12 * this.runAmt) * this.walkAmt + Math.sin(this.phase * 2) * 0.03 * this.walkAmt, 0.16 + 0.08 * this.strokeAmt + Math.sin(st * 2) * 0.05 * pull, sw);
    this.bodyG.rotation.z = lerp(Math.sin(this.phase) * 0.06 * this.walkAmt, Math.sin(st) * 0.07 * pull, sw);

    // The double jump's somersault (and a tuck while it turns)
    if (this.flipT >= 0) {
      this.flipT += dt;
      const k = clamp(this.flipT / FLIP);
      this.flipG.rotation.x = TAU * (1 - Math.pow(1 - k, 2.4));
      if (k >= 1) {
        this.flipT = -1;
        this.flipG.rotation.x = 0;
      }
    }
    const tuck = this.flipT >= 0 ? Math.sin(Math.PI * clamp(this.flipT / FLIP)) : 0;

    // Limbs
    this.armL.rotation.x = Math.sin(this.phase) * 0.9 * this.walkAmt;
    this.armR.rotation.x = -Math.sin(this.phase) * 0.9 * this.walkAmt;
    this.armL.rotation.z = -0.15 - (this.grounded ? 0 : 0.8 * (1 - tuck));
    this.armR.rotation.z = 0.15 + (this.grounded ? 0 : 0.8 * (1 - tuck));
    // A doggy paddle: each paw reaches forward to the surface and pulls back under, in turn.
    if (sw > 0.01) {
      const reach = 0.55 + 0.35 * pull;
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.75 + Math.sin(st) * reach, sw);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.75 - Math.sin(st) * reach, sw);
      this.armL.rotation.z = lerp(this.armL.rotation.z, -0.35 - Math.cos(st) * 0.2, sw);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.35 - Math.cos(st) * 0.2, sw);
      this.armL.position.set(-0.46, 0.38 + sw * (0.08 + Math.max(0, Math.sin(st)) * 0.08), sw * (0.16 + Math.cos(st) * 0.1));
      this.armR.position.set(0.46, 0.38 + sw * (0.08 + Math.max(0, -Math.sin(st)) * 0.08), sw * (0.16 - Math.cos(st) * 0.1));
    } else {
      this.armL.position.set(-0.46, 0.38, 0);
      this.armR.position.set(0.46, 0.38, 0);
    }
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
    // Feet: a stride on land, a flutter kick behind you afloat, tucked up in a somersault.
    const kickL = Math.sin(st * 2.2) * 0.08 * pull;
    this.footL.position.z = lerp(0.04 + Math.sin(this.phase) * 0.17 * this.walkAmt, -0.16, sw) - tuck * 0.1;
    this.footR.position.z = lerp(0.04 - Math.sin(this.phase) * 0.17 * this.walkAmt, -0.16, sw) - tuck * 0.1;
    this.footL.position.y = lerp(0.06 + Math.max(0, Math.cos(this.phase)) * 0.09 * this.walkAmt, 0.12 + kickL, sw) + tuck * 0.18;
    this.footR.position.y = lerp(0.06 + Math.max(0, -Math.cos(this.phase)) * 0.09 * this.walkAmt, 0.12 - kickL, sw) + tuck * 0.18;
    // The scarf's tail streams out behind on land, and floats on the water.
    this.tail.rotation.x = lerp(-0.25 - 0.75 * this.walkAmt + Math.sin(t * 11) * 0.12 * this.walkAmt, -1.25 + Math.sin(t * 2.4) * 0.08, sw);
    this.tail.rotation.z = lerp(Math.sin(t * 7) * 0.12 * this.walkAmt, Math.sin(st) * 0.15, sw);
    this.sprout.rotation.z = Math.sin(t * 2.2) * 0.12 + Math.sin(this.phase * 2) * 0.12 * this.walkAmt + Math.sin(st) * 0.1 * sw;
    this.sprout.rotation.x = -0.25 * this.walkAmt + (this.grounded ? 0 : -this.airVel * 0.03) - 0.3 * sw;

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
    this.root.position.set(this.pos.x, this.pos.y + this.air + this.dip.value, this.pos.z);
    if (this.pull > 0) this.root.position.lerp(this.pullTo, this.pull);
    this.root.rotation.y = this.yaw + this.spin;
    this.root.scale.setScalar(SCALE * Math.max(this.warp, 0.001));
    const ground = this.tGround(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, ground + 0.03, this.pos.z);
    // The blob shadow shrinks as you rise, and goes under water with you.
    const k = clamp(1 - this.air * 0.12, 0.35, 1) * (1 - smoothstep(0.05, 0.45, this.wet)) * this.warp;
    this.shadow.scale.setScalar(Math.max(k, 0.001));
    (this.shadow.material as MeshBasicMaterial).opacity = k;
  }

  /** World position of the head (for labels or the camera). */
  head(out = new Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.air + this.dip.value + 1.0, this.pos.z);
  }

  dispose() {
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.shadow.geometry.dispose();
    (this.shadow.material as MeshBasicMaterial).map?.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}
