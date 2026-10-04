// The lost words, hidden where the world says they lie: each a little rolled
// scroll tied with a ribbon in its place's color, nestled in the grass. It
// rocks gently and catches the light now and then, enough for an attentive
// explorer to notice, never a beacon. Walk close (or tap it) and it pops up,
// unrolls to show its word, puffs out a few letters and chimes.
//
// The resting scrolls are three instanced meshes (paper, ribbons, glints) so
// eight of them cost three draw calls; the one being picked up is a separate
// "hero" scroll that can unroll.

import {
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Raycaster,
} from 'three';
import { letterGeometries } from '../landmarks/builders';
import { Kit, litMaterial } from '../world/kit';
import { swayMaterials, tuftGeometry, type SharedUniforms } from '../world/nature';
import type { Puffs } from '../world/particles';
import { groundAt, onPier, rockiness, type WordSpot } from '../world/shape';
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, rng } from '../util/math';

/** Walk this close and the scroll is yours. */
export const PICK_RANGE = 1.2;

const PAPER = '#f5e2b2';
const R = 0.11; // roll radius
const LEN = 0.84; // roll length

/** The resting scroll, lying along x: a parchment roll with its loose edge curling out. */
function paperGeometry() {
  const k = new Kit(61);
  k.cyl(R, R, LEN, PAPER, { r: [0, 0, Math.PI / 2] }, 10);
  for (const s of [-1, 1]) {
    k.cyl(R * 1.02, R * 1.02, 0.02, '#e2c895', { p: [(s * LEN) / 2, 0, 0], r: [0, 0, Math.PI / 2] }, 10);
    k.cyl(R * 0.5, R * 0.5, 0.03, '#c9a774', { p: [(s * LEN) / 2, 0, 0], r: [0, 0, Math.PI / 2] }, 8);
  }
  k.box(LEN * 0.94, 0.012, 0.12, '#f7ebcc', { p: [0, -R * 0.55, R + 0.03], r: [0.35, 0, 0], jitter: 0.01 });
  return k.geometry();
}

/** The ribbon and its bow, in white so each instance can be tinted its place's color. */
function ribbonGeometry() {
  const k = new Kit(62);
  k.cyl(R + 0.014, R + 0.014, 0.07, '#ffffff', { r: [0, 0, Math.PI / 2], jitter: 0 }, 10);
  for (const s of [-1, 1]) {
    k.torus(0.055, 0.02, '#ffffff', { p: [s * 0.055, R + 0.06, 0.01], r: [0.2, Math.PI / 2, s * 0.6], jitter: 0 }, 4, 10);
    k.box(0.04, 0.17, 0.01, '#ffffff', { p: [s * 0.04, R - 0.03, R + 0.05], r: [0.5, 0, s * 0.3], jitter: 0 });
  }
  k.sphere(0.032, '#ffffff', { p: [0, R + 0.035, 0.01], jitter: 0 }, 6, 4);
  return k.geometry();
}

/** A four-pointed twinkle. */
function glintGeometry() {
  const k = new Kit(63);
  k.add(new OctahedronGeometry(0.12, 0), '#ffffff', { s: [0.16, 1, 0.16], jitter: 0 });
  k.add(new OctahedronGeometry(0.12, 0), '#ffffff', { s: [1, 0.16, 0.16], jitter: 0 });
  return k.geometry();
}

/** The hero scroll's two rollers (upright, with wooden knobs). */
function rollerGeometry() {
  const k = new Kit(64);
  k.cyl(0.075, 0.075, 0.82, PAPER, {}, 10);
  for (const s of [-1, 1]) k.sphere(0.065, '#8a5a3b', { p: [0, s * 0.45, 0], s: [1, 0.8, 1] }, 8, 5);
  return k.geometry();
}

/** Parchment with the word written on it in ink. */
function drawParchment(canvas: HTMLCanvasElement, word: string, color: string) {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f8ecd2');
  bg.addColorStop(1, '#eedab0');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const edge = g.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.62);
  edge.addColorStop(0, 'rgba(140, 90, 30, 0)');
  edge.addColorStop(1, 'rgba(140, 90, 30, 0.28)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  const font = (px: number) => `italic 600 ${px}px "Newsreader Variable", "Iowan Old Style", Georgia, serif`;
  let px = 150;
  g.font = font(px);
  const max = w * 0.84;
  const tw = g.measureText(word).width;
  if (tw > max) g.font = font((px = Math.floor((px * max) / tw)));
  g.fillStyle = '#3a2a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(word, w / 2, h * 0.47);
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(w / 2 - 150, h * 0.47 + px * 0.55);
  g.quadraticCurveTo(w / 2, h * 0.47 + px * 0.55 + 18, w / 2 + 150, h * 0.47 + px * 0.55);
  g.stroke();
}

interface Spot extends WordSpot {
  y: number;
  yaw: number;
  tilt: number;
  phase: number;
  /** Seconds between twinkles. */
  every: number;
  shown: boolean;
  /** Pop-in spring for coming back after a reset. */
  pop: number;
  hit: Mesh;
}

type Letter = { alive: boolean; age: number; life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; size: number };

export class LostWords {
  readonly group = new Group();
  readonly hits: Mesh[] = [];
  /** The word being picked up, if any. */
  picking: string | null = null;
  /** World position of the hero scroll while it's up (for the camera to lean toward). */
  readonly focus = new Vector3();
  onFound?: (id: string) => void;
  onReveal?: (id: string) => void;
  onSound?: (name: 'pop' | 'chime') => void;

  private spots: Spot[];
  private paper: InstancedMesh;
  private ribbons: InstancedMesh;
  private glints: InstancedMesh;
  private o = new Object3D();
  private geos: BufferGeometry[] = [];
  private mats: { dispose(): void }[] = [];

  // The hero scroll.
  private hero = new Group();
  private rollers: Mesh[] = [];
  private sheet: Mesh;
  private heroRibbon: Mesh;
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private heroT = 0;
  private heroFrom = new Vector3();
  private heroTo = new Vector3();
  private qFrom = new Quaternion();
  private revealed = false;
  private burst = false;

  // Letters that puff out of the scroll.
  private letterMeshes: InstancedMesh[];
  private letters: Letter[][];
  private palette: Color[] = ['#fff3df', '#f2c14e', '#ffffff'].map((c) => new Color(c));
  private accent = new Color();
  private right = new Vector3();
  private up = new Vector3();
  private tmp = new Vector3();

  constructor(
    words: WordSpot[],
    uniforms: SharedUniforms,
    private opts: { reducedMotion: boolean; touch: boolean; mobile: boolean },
  ) {
    this.group.name = 'lost-words';
    const rand = rng(404);
    const hitGeo = new SphereGeometry(1, 8, 6);
    const hitMat = new MeshBasicMaterial({ visible: false });
    this.geos.push(hitGeo);
    this.mats.push(hitMat);
    const hitR = opts.touch ? 1.15 : 0.85;
    this.spots = words.map((w): Spot => {
      const y = groundAt(w.x, w.z);
      const hit = new Mesh(hitGeo, hitMat);
      hit.position.set(w.x, y + 0.3, w.z);
      hit.scale.setScalar(hitR);
      hit.userData.word = w.id;
      this.group.add(hit);
      return { ...w, y, yaw: rand() * Math.PI * 2, tilt: (rand() - 0.5) * 0.3, phase: rand() * 10, every: 3.2 + rand() * 2.6, shown: true, pop: 1, hit };
    });

    const lit = litMaterial();
    const scale = opts.mobile ? 1.25 : 1;
    this.paper = this.instanced(paperGeometry(), lit, scale);
    this.ribbons = this.instanced(ribbonGeometry(), lit, scale);
    const glintMat = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    this.mats.push(glintMat);
    this.glints = this.instanced(glintGeometry(), glintMat, scale);
    const c = new Color();
    this.spots.forEach((s, i) => this.ribbons.setColorAt(i, c.set(s.color)));
    if (this.ribbons.instanceColor) this.ribbons.instanceColor.needsUpdate = true;

    // A few blades of grass in front of each scroll, so it sits in the grass rather than on it.
    const grass = this.spots.filter((s) => !onPier(s.x, s.z) && rockiness(s.x, s.z) < 0.45);
    const tuftMats = swayMaterials(uniforms, 0.35, 2.2);
    this.mats.push(tuftMats.mat, tuftMats.depth);
    const tufts = new InstancedMesh(tuftGeometry(), tuftMats.mat, grass.length * 3);
    this.geos.push(tufts.geometry);
    grass.forEach((s, i) => {
      [[-0.32, 0.22, 0.9], [0.3, 0.26, 0.75], [0.08, -0.24, 1.0]].forEach(([dx, dz, sc], j) => {
        const x = s.x + dx;
        const z = s.z + dz;
        this.o.position.set(x, groundAt(x, z) - 0.04, z);
        this.o.rotation.set(0, s.phase + j * 2.1, 0);
        this.o.scale.setScalar(sc);
        this.o.updateMatrix();
        tufts.setMatrixAt(i * 3 + j, this.o.matrix);
      });
    });
    tufts.receiveShadow = true;
    this.group.add(tufts);

    // The hero: two rollers with the sheet between them, facing the camera.
    const rollerGeo = rollerGeometry();
    this.geos.push(rollerGeo);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(rollerGeo, lit);
      this.rollers.push(m);
      this.hero.add(m);
    }
    this.canvas.width = 1024;
    this.canvas.height = 360;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const sheetMat = new MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const sheetGeo = new PlaneGeometry(2.4, 0.84);
    this.mats.push(sheetMat);
    this.geos.push(sheetGeo);
    this.sheet = new Mesh(sheetGeo, sheetMat);
    this.hero.add(this.sheet);
    const heroRibbonGeo = new TorusGeometry(0.2, 0.03, 5, 18);
    const heroRibbonMat = new MeshBasicMaterial({ color: '#ffffff' });
    this.geos.push(heroRibbonGeo);
    this.mats.push(heroRibbonMat);
    this.heroRibbon = new Mesh(heroRibbonGeo, heroRibbonMat);
    this.heroRibbon.rotation.x = Math.PI / 2;
    this.hero.add(this.heroRibbon);
    this.hero.visible = false;
    this.group.add(this.hero);

    // The letters.
    const glyphs = letterGeometries();
    const letterMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.mats.push(letterMat);
    const PER = 4;
    this.letterMeshes = glyphs.map((g) => {
      this.geos.push(g);
      const m = new InstancedMesh(g, letterMat, PER);
      m.frustumCulled = false;
      for (let i = 0; i < PER; i++) {
        this.o.position.set(0, -50, 0);
        this.o.scale.setScalar(0);
        this.o.updateMatrix();
        m.setMatrixAt(i, this.o.matrix);
        m.setColorAt(i, this.palette[i % this.palette.length]);
      }
      this.group.add(m);
      return m;
    });
    this.letters = glyphs.map(() => Array.from({ length: PER }, () => ({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, size: 1 })));

    // Have the serif ready before the first scroll needs it.
    void document.fonts?.load('italic 600 100px "Newsreader Variable"').catch(() => {});
  }

  private instanced(geo: BufferGeometry, mat: MeshBasicMaterial | ReturnType<typeof litMaterial>, scale: number) {
    this.geos.push(geo);
    if (scale !== 1) geo.scale(scale, scale, scale);
    const m = new InstancedMesh(geo, mat, this.spots.length);
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  /** Show exactly the words not found yet. Words that come back (a reset) pop in. */
  sync(has: (id: string) => boolean) {
    for (const s of this.spots) {
      const show = !has(s.id) && s.id !== this.picking;
      if (show && !s.shown) s.pop = 0;
      s.shown = show;
    }
    this.hits.length = 0;
    for (const s of this.spots) if (s.shown) this.hits.push(s.hit);
  }

  /** The nearest unfound word within reach of (x, z). */
  near(x: number, z: number) {
    let best: Spot | null = null;
    let bestD = PICK_RANGE;
    for (const s of this.spots) {
      if (!s.shown) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < bestD) (best = s), (bestD = d);
    }
    return best;
  }

  /** Which scroll (if any) a ray hits, and how far along the ray. */
  raycast(raycaster: Raycaster) {
    const hit = raycaster.intersectObjects(this.hits, false)[0];
    return hit ? { id: hit.object.userData.word as string, distance: hit.distance } : null;
  }

  spot(id: string) {
    return this.spots.find((s) => s.id === id) ?? null;
  }

  /** Pick a scroll up, from an explorer standing at `from`. */
  pick(id: string, from: Vector3, puffs: Puffs) {
    const s = this.spot(id);
    if (!s || !s.shown || this.picking) return;
    this.picking = id;
    s.shown = false;
    this.hits.splice(this.hits.indexOf(s.hit), 1);
    drawParchment(this.canvas, s.word, s.color);
    this.tex.needsUpdate = true;
    (this.heroRibbon.material as MeshBasicMaterial).color.set(s.color);
    this.heroT = 0;
    this.revealed = false;
    this.burst = false;
    // Rise from where it lay to just above the explorer's head.
    this.heroFrom.set(s.x, s.y + R, s.z);
    this.heroTo.set(lerp(s.x, from.x, 0.75), Math.max(s.y, from.y) + 2.75, lerp(s.z, from.z, 0.75) + 0.35);
    this.o.rotation.set(0, s.yaw, Math.PI / 2);
    this.qFrom.setFromEuler(this.o.rotation);
    this.hero.visible = true;
    this.focus.copy(this.heroTo);
    puffs.ring(s.x, s.y, s.z, 8, 1.8, '#f6ead2', 0.14);
    this.onSound?.('pop');
    this.onFound?.(id);
  }

  update(t: number, dt: number, camera: Camera, puffs: Puffs, grow: number) {
    const o = this.o;
    const appear = easeOutBack(clamp((grow - 0.75) / 0.25), 2);
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (s.pop < 1) s.pop = Math.min(1, s.pop + dt * 2.2);
      const k = s.shown ? appear * easeOutBack(s.pop, 2.4) : 0;
      // Rest in the grass, half tucked in, rocking gently.
      const bob = this.opts.reducedMotion ? 0 : Math.sin(t * 1.5 + s.phase) * 0.025;
      o.position.set(s.x, s.y + R * 0.75 + bob, s.z);
      o.rotation.set(this.opts.reducedMotion ? 0 : Math.sin(t * 1.1 + s.phase) * 0.12, s.yaw, s.tilt);
      o.scale.setScalar(Math.max(k, 0.0001));
      o.updateMatrix();
      this.paper.setMatrixAt(i, o.matrix);
      this.ribbons.setMatrixAt(i, o.matrix);
      // Now and then the light catches it.
      const u = ((t + s.phase * 3) % s.every) / 0.5;
      const tw = u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
      o.position.set(s.x + Math.sin(s.yaw) * 0.05, s.y + R * 2 + 0.06 + bob, s.z + 0.12);
      o.rotation.set(0, 0, t * 1.4 + s.phase);
      o.scale.setScalar(Math.max(k * tw * 1.15, 0.0001));
      o.updateMatrix();
      this.glints.setMatrixAt(i, o.matrix);
      if (s.shown && tw > 0 && u < 0.5 && u + dt / 0.5 >= 0.5 && !this.opts.reducedMotion) {
        puffs.spawn(s.x, s.y + 0.3, s.z, { vy: 0.5, size: 0.05, life: 0.9, drag: 1, grow: -0.4, color: '#ffe9a8' });
      }
    }
    this.paper.instanceMatrix.needsUpdate = true;
    this.ribbons.instanceMatrix.needsUpdate = true;
    this.glints.instanceMatrix.needsUpdate = true;

    if (this.picking) this.updateHero(dt, camera, puffs);
    this.updateLetters(dt);
  }

  private updateHero(dt: number, camera: Camera, puffs: Puffs) {
    const rm = this.opts.reducedMotion;
    this.heroT += dt;
    const t = this.heroT;
    const s = this.spot(this.picking!)!;
    // Timeline: rise (0 to .4), unroll (.4 to .85), letters (.62), card (.95), roll away (1.4 to 1.8).
    const RISE = rm ? 0.12 : 0.4;
    const UNROLL = rm ? 0.12 : 0.85;
    const CARD = rm ? 0.35 : 0.95;
    const END = rm ? 1.0 : 1.8;
    const rise = easeOutBack(clamp(t / RISE), 1.6);
    const open = rm ? (t > RISE ? 1 : 0) : easeOutCubic(clamp((t - RISE) / (UNROLL - RISE)));
    const away = easeInCubic(clamp((t - (END - 0.4)) / 0.4));

    if (rm) this.hero.position.copy(this.heroTo);
    else this.hero.position.lerpVectors(this.heroFrom, this.heroTo, rise);
    this.hero.quaternion.slerpQuaternions(this.qFrom, camera.quaternion, rm ? 1 : clamp(t / RISE));
    // It starts the size of the scroll in the grass (rollers 0.82 long) and grows as it rises.
    this.hero.scale.setScalar(Math.max(0.001, (rm ? 1 : lerp(LEN / 0.82, 1, rise)) * (1 - away)));

    // Unroll: the rollers part and the sheet shows from the middle out.
    const k = Math.max(open, 0.035);
    const half = 1.2 * k;
    this.rollers[0].position.x = -half - 0.06;
    this.rollers[1].position.x = half + 0.06;
    this.rollers[0].rotation.y = -open * 7;
    this.rollers[1].rotation.y = open * 7;
    this.sheet.scale.x = k;
    this.tex.repeat.x = k;
    this.tex.offset.x = (1 - k) / 2;
    this.heroRibbon.visible = open < 0.05;
    this.heroRibbon.scale.setScalar(1 + open * 6);

    if (!this.burst && t >= (rm ? RISE : 0.62)) {
      this.burst = true;
      this.onSound?.('chime');
      if (!rm) {
        // Letters spill out of the sheet, outward across the view and up.
        this.right.set(1, 0, 0).applyQuaternion(this.hero.quaternion);
        this.up.set(0, 1, 0).applyQuaternion(this.hero.quaternion);
        for (let i = 0; i < 12; i++) this.spawnLetter(this.hero.position, (i / 12) * Math.PI * 2 + Math.random() * 0.4, s.color);
        for (const side of [-1, 1]) {
          const r = this.rollers[side < 0 ? 0 : 1];
          this.tmp.copy(r.position).applyMatrix4(this.hero.matrixWorld);
          puffs.ring(this.tmp.x, this.tmp.y, this.tmp.z, 5, 1.2, '#ffe9a8', 0.07);
        }
      }
    }
    if (!this.revealed && t >= CARD) {
      this.revealed = true;
      this.onReveal?.(s.id);
    }
    if (t >= END) {
      this.hero.visible = false;
      this.picking = null;
    }
  }

  private spawnLetter(at: Vector3, a: number, color: string) {
    const g = Math.floor(Math.random() * this.letters.length);
    const pool = this.letters[g];
    const i = pool.findIndex((l) => !l.alive);
    if (i < 0) return;
    const l = pool[i];
    const sp = 1.6 + Math.random() * 1.2;
    // From the sheet's edge, outward in the plane of the view.
    const ox = Math.cos(a) * 1.1;
    const oy = Math.sin(a) * 0.4;
    const r = this.right;
    const u = this.up;
    Object.assign(l, {
      alive: true, age: 0, life: 1.0 + Math.random() * 0.5,
      x: at.x + r.x * ox + u.x * oy, y: at.y + r.y * ox + u.y * oy, z: at.z + r.z * ox + u.z * oy,
      vx: (r.x * Math.cos(a) + u.x * (Math.sin(a) + 0.6)) * sp,
      vy: (r.y * Math.cos(a) + u.y * (Math.sin(a) + 0.6)) * sp,
      vz: (r.z * Math.cos(a) + u.z * (Math.sin(a) + 0.6)) * sp,
      spin: (Math.random() - 0.5) * 6, size: 0.75 + Math.random() * 0.45,
    });
    const m = this.letterMeshes[g];
    m.setColorAt(i, Math.random() < 0.35 ? this.accent.set(color) : this.palette[Math.floor(Math.random() * this.palette.length)]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private updateLetters(dt: number) {
    const o = this.o;
    for (let g = 0; g < this.letters.length; g++) {
      const pool = this.letters[g];
      const m = this.letterMeshes[g];
      let dirty = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        if (!l.alive) continue;
        dirty = true;
        l.age += dt;
        const t = l.age / l.life;
        if (t >= 1) {
          l.alive = false;
          o.position.set(0, -50, 0);
          o.scale.setScalar(0);
        } else {
          const drag = Math.exp(-2.2 * dt);
          l.vx *= drag;
          l.vz *= drag;
          l.vy = l.vy * drag - 0.6 * dt;
          l.x += l.vx * dt;
          l.y += l.vy * dt;
          l.z += l.vz * dt;
          o.position.set(l.x, l.y, l.z);
          o.rotation.set(Math.sin(l.age * 3) * 0.4, l.age * l.spin, Math.sin(l.age * 2.3) * 0.3);
          o.scale.setScalar(Math.max(0.0001, l.size * easeOutBack(Math.min(1, t * 5), 2.2) * (1 - Math.max(0, (t - 0.5) / 0.5) ** 2)));
        }
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      if (dirty) m.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.tex.dispose();
  }
}
