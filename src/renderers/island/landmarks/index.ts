// Wraps each landmark builder with the shared behaviour: placement on the
// island, the intro pop, hover wobble, arrival bounce and a pointer hit volume,
// and, for a building with a room, opening up to show it (the roof lifts off,
// the walls sink into the ground).

import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { BUILDERS, type Built, type Glow } from './builders';
import type { Puffs } from '../world/particles';
import { groundAt, heightAt, PIER, type Place } from '../world/shape';
import { easeInCubic, easeOutCubic, Spring } from '../util/math';

const hitMaterial = new MeshBasicMaterial({ visible: false });

export class Landmark {
  readonly root = new Group();
  readonly hit: Mesh;
  readonly anchor: Vector3;
  readonly baseY: number;
  private built: Built;
  private pop = new Spring(1, 210, 13);
  private squash = new Spring(1, 320, 11);
  private tilt = new Spring(0, 160, 8);
  private bouncy: Object3D;
  private bouncyBase: Vector3;
  private tmp = new Vector3();
  hover = false;
  near = false;
  /** Set once the intro has popped this landmark in. */
  userPopped = false;
  private wasHover = false;
  /** The roof and the walls, split apart the first time it opens up (see open()). */
  private cut: { lid: Group; body: Group; depth: number } | null = null;
  private lidK = 0;
  private wallK = 0;

  constructor(readonly place: Place) {
    this.built = BUILDERS[place.kind](place.color);
    this.bouncy = this.built.bouncy;
    this.bouncyBase = this.bouncy.scale.clone();
    this.root.name = `landmark-${place.id}`;
    if (place.kind === 'pier') {
      this.root.position.set(PIER.x, 0, PIER.start);
      this.baseY = PIER.deck;
    } else {
      this.baseY = place.kind === 'bottle' ? heightAt(place.x, place.z) - 0.05 : groundAt(place.x, place.z);
      this.root.position.set(place.x, this.baseY, place.z);
      this.root.rotation.y = place.yaw;
    }
    this.root.add(this.built.group);
    this.anchor = new Vector3(place.x, this.baseY + place.labelY, place.z);

    this.hit = new Mesh(new CylinderGeometry(place.hitRadius, place.hitRadius, place.hitHeight, 10), hitMaterial);
    this.hit.position.set(place.x, this.baseY + place.hitHeight / 2, place.z);
    this.hit.userData.place = place.id;
    this.hit.updateMatrixWorld(true);
  }

  /** Start hidden and pop in after `delay` seconds (intro). */
  hideForIntro() {
    this.pop.snap(0);
    this.root.scale.setScalar(0.0001);
  }
  popIn() {
    this.pop.target = 1;
    this.pop.kick(2);
  }
  /** Happy hop, e.g. when the explorer arrives or goes in. */
  bounce(strength = 1) {
    this.squash.kick(-7 * strength);
    this.tilt.kick(3 * strength);
  }

  update(t: number, dt: number, puffs: Puffs, introDone: boolean) {
    if (this.hover && !this.wasHover) {
      this.squash.kick(-3.2);
      this.tilt.kick(1.5);
    }
    this.wasHover = this.hover;
    this.squash.target = this.hover ? 1.035 : 1;
    this.squash.update(dt);
    this.tilt.update(dt);
    const p = Math.max(0, this.pop.update(dt));
    this.root.scale.setScalar(Math.max(p, 0.0001));
    const sy = this.squash.value;
    const sxz = 1 + (1 - sy) * 0.6;
    this.bouncy.scale.set(this.bouncyBase.x * sxz, this.bouncyBase.y * sy, this.bouncyBase.z * sxz);
    this.bouncy.rotation.z = this.tilt.value * 0.02;
    // Its own little animations hold still while it's opened up.
    if ((introDone || p > 0.5) && !this.opened) {
      this.built.update?.({
        t,
        dt,
        near: this.near,
        hover: this.hover,
        puffs,
        toWorld: (v) => this.built.group.localToWorld(v),
      });
    }
  }

  arrive() {
    this.bounce(1);
    return this.built.onNear?.();
  }

  /** Opened up at all (the roof off, or the walls down). */
  get opened() {
    return this.lidK > 0 || this.wallK > 0;
  }

  /**
   * Open the building up to show the room inside: `lid` lifts the roof off
   * and away (0 on, 1 gone), `walls` sinks the rest into the ground (0
   * standing, 1 gone), where the island hides it. Run backwards to close it.
   */
  open(lid: number, walls: number) {
    if (!this.cut && lid <= 0 && walls <= 0) return;
    const cut = (this.cut ??= this.split());
    this.lidK = lid = Math.min(1, Math.max(0, lid));
    this.wallK = walls = Math.min(1, Math.max(0, walls));
    // The roof rises, tips a little and shrinks away.
    cut.lid.visible = lid < 1;
    cut.lid.position.y = this.place.eaves + easeOutCubic(lid) * 2.4;
    cut.lid.rotation.z = lid * 0.22;
    cut.lid.scale.setScalar(Math.max(0.001, 1 - easeInCubic(lid)));
    // The walls drop, faster and faster, into the ground.
    cut.body.visible = walls < 1;
    cut.body.position.y = -cut.depth * easeInCubic(walls);
  }

  /**
   * Split the building at its eaves, once: the parts above them (a roof, a
   * chimney, the lighthouse's tower) into a lid that can lift off, the rest
   * into a body that can sink. Kit meshes are split by whole parts, so a
   * chimney goes up or stays down but never in half; anything else (a swinging
   * sign, a bell) goes whole, by where its middle is.
   */
  private split() {
    const g = this.built.group;
    const eaves = this.place.eaves;
    const body = new Group();
    const lid = new Group();
    const inner = new Group();
    // The lid turns and shrinks about the middle of the eaves.
    lid.position.y = eaves;
    inner.position.y = -eaves;
    lid.add(inner);
    g.updateWorldMatrix(true, true);
    const toLocal = new Matrix4().copy(g.matrixWorld).invert();
    const box = new Box3();
    const mid = new Vector3();
    for (const child of [...g.children]) {
      const m = child as Mesh;
      const parts = m.userData.parts as number[] | undefined;
      const plain = m.position.lengthSq() === 0 && m.quaternion.w === 1 && m.scale.x === 1 && m.scale.y === 1 && m.scale.z === 1;
      if (m.isMesh && parts && plain) {
        const [low, high] = splitParts(m.geometry, parts, eaves);
        if (high) {
          const top = new Mesh(high, m.material);
          top.castShadow = m.castShadow;
          top.receiveShadow = m.receiveShadow;
          inner.add(top);
        }
        if (low) {
          m.geometry.dispose();
          m.geometry = low;
          body.add(m);
        } else {
          g.remove(m);
          m.geometry.dispose();
        }
        continue;
      }
      box.setFromObject(child).applyMatrix4(toLocal).getCenter(mid);
      (mid.y > eaves ? inner : body).add(child);
    }
    g.add(body, lid);
    // Deep enough to take the tallest thing left standing all the way down.
    const depth = box.setFromObject(body).applyMatrix4(toLocal).max.y + 0.4;
    return { lid, body, depth: Number.isFinite(depth) ? depth : eaves + 0.4 };
  }

  /** Night falling, 0 (day) to 1 (night). */
  night(n: number) {
    this.built.night?.(n);
  }

  /** Where this landmark's lamps and windows glow at night, in world space. */
  glows() {
    const { x, y, z } = this.root.position;
    const c = Math.cos(this.root.rotation.y);
    const s = Math.sin(this.root.rotation.y);
    const toWorld = ([lx, ly, lz, size]: Glow): Glow => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c, size];
    const g = this.built.glows;
    return { halos: g?.halos.map(toWorld) ?? [], pools: g?.pools.map(toWorld) ?? [] };
  }

  /** World position of the landmark's visual center (for camera swoops). */
  focus(out = this.tmp) {
    return out.set(this.place.x, this.baseY + Math.min(this.place.labelY * 0.45, 3.2), this.place.z);
  }

  dispose() {
    this.hit.geometry.dispose();
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

/**
 * A merged, non-indexed kit geometry in two: the parts (runs of `parts[i]`
 * vertices) whose middle is at or below `y`, and those above. Either is null
 * if it would be empty.
 */
function splitParts(geo: BufferGeometry, parts: number[], y: number): [BufferGeometry | null, BufferGeometry | null] {
  const pos = geo.getAttribute('position');
  const runs: { from: number; n: number; up: boolean }[] = [];
  let at = 0;
  let ups = 0;
  for (const n of parts) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = at; i < at + n; i++) {
      const v = pos.getY(i);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const up = (lo + hi) / 2 > y;
    runs.push({ from: at, n, up });
    if (up) ups += n;
    at += n;
  }
  const make = (up: boolean, count: number) => {
    if (!count) return null;
    const out = new BufferGeometry();
    for (const [name, a] of Object.entries(geo.attributes) as [string, BufferAttribute][]) {
      const k = a.itemSize;
      const arr = new Float32Array(count * k);
      let o = 0;
      for (const r of runs) {
        if (r.up !== up) continue;
        arr.set((a.array as Float32Array).subarray(r.from * k, (r.from + r.n) * k), o);
        o += r.n * k;
      }
      out.setAttribute(name, new BufferAttribute(arr, k, a.normalized));
    }
    return out;
  };
  return [make(false, at - ups), make(true, ups)];
}
