// Wraps each landmark builder with the shared behaviour: placement on the
// island, the intro pop, hover wobble, arrival bounce and a pointer hit volume.

import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { BUILDERS, type Built } from './builders';
import type { Puffs } from '../world/particles';
import { groundAt, heightAt, PIER, type Place } from '../world/shape';
import { Spring } from '../util/math';

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
    if (introDone || p > 0.5) {
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
