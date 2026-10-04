// The race course on the water: a ring of gates round the island, each a pair
// of striped posts on floats with a dotted line of corks between them. The
// gate to go through next glows, with two shafts of light over it you can see
// from across the sea; gates already passed turn green. The start and finish
// line has a chequered banner. Where the gates stand comes from world/race.ts.

import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type Material,
  type Vector3,
} from 'three';
import type { Course } from '../../../world/race';
import { Kit, litMaterial } from '../world/kit';
import { waveHeight } from '../world/water';

const POST_H = 1.9;
const CORKS = 9;
const COLORS = {
  idle: new Color('#ff9a52'),
  next: new Color('#ffd84a'),
  done: new Color('#62d68f'),
  start: new Color('#ffffff'),
};

function postGeometry() {
  const k = new Kit(931);
  k.sphere(0.42, '#ffffff', { s: [1, 0.55, 1], jitter: 0.03 }, 10, 6);
  k.cyl(0.09, 0.11, POST_H, '#ffffff', { p: [0, POST_H / 2, 0] }, 7);
  for (const y of [0.55, 1.15]) k.cyl(0.115, 0.115, 0.22, '#3d3a36', { p: [0, y, 0] }, 7);
  k.box(0.04, 0.34, 0.5, '#ffffff', { p: [0, POST_H - 0.2, -0.27] });
  k.sphere(0.13, '#ffffff', { p: [0, POST_H + 0.04, 0] }, 7, 5);
  return k.geometry();
}

function corkGeometry(half: number) {
  const k = new Kit(932);
  for (let i = 0; i < CORKS; i++) {
    const x = -half + 0.6 + ((2 * half - 1.2) * i) / (CORKS - 1);
    k.sphere(0.13, i % 2 ? '#ffffff' : '#d8d2c4', { p: [x, 0.02, 0], s: [1, 0.6, 1] }, 6, 4);
  }
  k.box(2 * half - 1, 0.025, 0.025, '#d8d2c4', { p: [0, 0.03, 0] });
  return k.geometry();
}

/** A chequered banner over the start line, on two tall poles. */
function bannerGroup(half: number) {
  const k = new Kit(933);
  const w = 2 * half;
  const n = 12;
  const cell = w / n;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      k.box(cell, cell * 0.9, 0.06, (i + row) % 2 ? '#1d1a16' : '#fffaf0', { p: [-half + cell * (i + 0.5), 2.95 - row * cell * 0.9, 0], jitter: 0 });
    }
  }
  for (const s of [-1, 1]) k.cyl(0.07, 0.07, 3.4, '#fffaf0', { p: [s * (half + 0.05), 1.7, 0] }, 6);
  return k.build({ castShadow: false, receiveShadow: false });
}

export class CourseView {
  readonly group = new Group();
  private posts: InstancedMesh;
  private corks: InstancedMesh;
  private beams: Mesh[] = [];
  private beamMats: MeshBasicMaterial[] = [];
  private banner: Group;
  private o = new Object3D();
  private c = new Color();
  private next: number | null = null;
  private done = new Set<number>();
  private flashT: number[];
  private shown = 1;

  constructor(
    readonly course: Course,
    private opts: { reducedMotion: boolean },
  ) {
    this.group.name = 'course';
    const n = course.gates.length;
    this.posts = new InstancedMesh(postGeometry(), litMaterial(), n * 2);
    this.posts.castShadow = false;
    this.posts.receiveShadow = false;
    this.posts.frustumCulled = false;
    this.corks = new InstancedMesh(corkGeometry(course.gates[0].half), litMaterial(), n);
    this.corks.castShadow = false;
    this.corks.receiveShadow = false;
    this.corks.frustumCulled = false;
    this.flashT = course.gates.map(() => 9);
    const beamGeo = new CylinderGeometry(0.32, 0.5, 16, 8, 1, true);
    beamGeo.translate(0, 8, 0);
    for (let i = 0; i < 2; i++) {
      // One material each: a beam fades away as the camera comes up to it.
      const mat = new MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending, fog: true });
      this.beamMats.push(mat);
      const m = new Mesh(beamGeo, mat);
      m.renderOrder = 3;
      m.visible = false;
      this.beams.push(m);
      this.group.add(m);
    }
    this.banner = bannerGroup(course.gates[0].half);
    const g0 = course.gates[0];
    this.banner.position.set(g0.x, 0, g0.z);
    this.banner.rotation.y = Math.atan2(g0.tx, g0.tz);
    this.group.add(this.posts, this.corks, this.banner);
    this.paint();
  }

  /** Which gate is next (null: just cruising, so the start line is the one to head for), and which are done. */
  set(next: number | null, done: number[]) {
    this.next = next;
    this.done = new Set(done);
    this.paint();
  }

  /** A gate was just passed: it pulses. */
  flash(i: number) {
    this.flashT[i] = 0;
  }

  /** Show or hide the whole course. */
  show(on: boolean) {
    this.group.visible = on;
  }

  private paint() {
    const target = this.next ?? 0;
    this.course.gates.forEach((_, i) => {
      const col = i === target ? COLORS.next : this.done.has(i) ? COLORS.done : i === 0 ? COLORS.start : COLORS.idle;
      for (let s = 0; s < 2; s++) this.posts.setColorAt(i * 2 + s, col);
      this.corks.setColorAt(i, this.c.copy(col).lerp(COLORS.start, 0.5));
    });
    if (this.posts.instanceColor) this.posts.instanceColor.needsUpdate = true;
    if (this.corks.instanceColor) this.corks.instanceColor.needsUpdate = true;
  }

  /** Bob on the swell. `camera` and `boat` (where they are) fade the beams and the banner out of the camera's way. */
  update(time: number, dt: number, camera: Vector3, boat: Vector3) {
    const o = this.o;
    const target = this.next ?? 0;
    const calm = this.opts.reducedMotion;
    this.course.gates.forEach((g, i) => {
      this.flashT[i] += dt;
      const f = this.flashT[i];
      // A passed gate jumps and settles; the next one breathes.
      const pop = f < 0.6 && !calm ? Math.sin((f / 0.6) * Math.PI) * 0.35 : 0;
      const breathe = i === target && !calm ? Math.sin(time * 4) * 0.05 : 0;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const x = g.x - g.tz * g.half * side;
        const z = g.z + g.tx * g.half * side;
        o.position.set(x, waveHeight(x, z, time) - 0.05 + pop, z);
        o.rotation.set(calm ? 0 : Math.sin(time * 1.1 + i + s) * 0.06, Math.atan2(g.tx, g.tz), calm ? 0 : Math.cos(time * 0.9 + i * 1.7) * 0.06);
        o.scale.setScalar(1 + breathe);
        o.updateMatrix();
        this.posts.setMatrixAt(i * 2 + s, o.matrix);
        if (i === target && this.beams[s]) this.beams[s].position.set(x, 0, z);
      }
      o.position.set(g.x, waveHeight(g.x, g.z, time) - 0.02, g.z);
      o.rotation.set(0, Math.atan2(g.tx, g.tz), 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      this.corks.setMatrixAt(i, o.matrix);
    });
    this.posts.instanceMatrix.needsUpdate = true;
    this.corks.instanceMatrix.needsUpdate = true;
    const beam = this.group.visible && this.shown > 0;
    this.beams.forEach((b, i) => {
      const near = Math.hypot(camera.x - b.position.x, camera.z - b.position.z);
      const k = Math.min(1, Math.max(0, (near - 8) / 16));
      b.visible = beam && k > 0.02;
      this.beamMats[i].opacity = (0.2 + (calm ? 0 : Math.sin(time * 3) * 0.05)) * k;
    });
    // The banner steps aside while the camera, behind the boat, passes under it.
    const g0 = this.course.gates[0];
    const sCam = (camera.x - g0.x) * g0.tx + (camera.z - g0.z) * g0.tz;
    const sBoat = (boat.x - g0.x) * g0.tx + (boat.z - g0.z) * g0.tz;
    this.banner.visible = !(sCam < 2 && sBoat > -2 && sCam > -30 && Math.hypot(camera.x - g0.x, camera.z - g0.z) < 40);
    this.banner.position.y = waveHeight(this.banner.position.x, this.banner.position.z, time) * 0.5;
  }

  /** Beams over the next gate (off while tied up at the pier, say). */
  glow(on: boolean) {
    this.shown = on ? 1 : 0;
  }

  dispose() {
    this.posts.geometry.dispose();
    this.corks.geometry.dispose();
    this.beams[0]?.geometry.dispose();
    this.beamMats.forEach((m) => m.dispose());
    this.banner.traverse((x) => {
      const m = x as Mesh;
      m.geometry?.dispose();
      if (m.material && m.material !== litMaterial()) (m.material as Material).dispose();
    });
  }
}
