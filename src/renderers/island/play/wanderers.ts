// People out walking on the island: the same round marshmallows as the
// islanders indoors, in their own scarves (and coats, skirts and woolly hats), each
// built from the kit as one mesh, so ten of them are ten draw calls. They walk
// their loops (src/world/wander.ts: a pure function of the time, so the map
// and the text adventure agree on where everyone is), stop at each corner to
// look about and turn, and when you walk up they stop, turn to you, and a
// prompt like a game's opens over them. Press it (or E) and they say their
// next line.

import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type PerspectiveCamera, type Raycaster } from 'three';
import type { Wanderer } from '../../../world/schema';
import { turnBetween, walkClock, walker } from '../../../world/wander';
import type { Rect } from '../labels';
import { Kit } from '../world/kit';
import type { Collider } from '../world/nature';
import { groundAt } from '../world/shape';
import { Prompt, type PromptText } from './prompt';

/** How close you must be for someone to stop and their prompt to open. */
export const TALK_RANGE = 2.6;
/** How far round them you can't walk. */
const BODY = 0.55;

const hitMaterial = new MeshBasicMaterial({ visible: false });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A wanderer, built from the kit: body, face, scarf, and a coat (or a skirt) and a woolly hat if they wear them. Front is +z. */
function figure(v: Wanderer): Group {
  const k = new Kit(v.id.length * 31 + 7);
  const WHITE = '#fffaf1';
  const INK = '#1f1a17';
  const cy = 0.86;
  const r = 0.72;
  k.sphere(r, WHITE, { p: [0, cy, 0], s: [1, 0.94, 0.96], jitter: 0.01 }, 18, 12);
  if (v.coat) {
    // A coat over the lower half: a shell just outside the body, from the hem up to the scarf.
    k.add(new SphereGeometry(r + 0.035, 18, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.36), v.coat, { p: [0, cy, 0], s: [1, 0.94, 0.96], jitter: 0.02 });
    // Its buttons, down the front.
    for (const y of [0.42, 0.6]) k.sphere(0.035, '#2b2622', { p: [0, cy - y, r * (y < 0.5 ? 0.93 : 0.8)], jitter: 0 }, 5, 4);
  } else if (v.skirt) {
    // A frayed denim mini skirt, flaring out from under the scarf, with a
    // sparkly trim round the hem and a fringe of loose threads hanging off it.
    const hemY = cy - 0.66;
    const hemR = 0.68;
    k.add(new CylinderGeometry(0.6, hemR, 0.28, 18, 1, true), v.skirt, { p: [0, hemY + 0.14, 0], jitter: 0.03 });
    k.torus(hemR, 0.035, '#d9dde3', { p: [0, hemY, 0], r: [Math.PI / 2, 0, 0], jitter: 0 }, 4, 22);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const h = 0.08 + (i % 3) * 0.03;
      k.rbox(0.06, h, 0.02, 0.008, '#e6d7b4', { p: [Math.sin(a) * hemR, hemY - h / 2, Math.cos(a) * hemR], r: [0, a, 0], jitter: 0.01 });
    }
  }
  // The face.
  for (const s of [-1, 1]) {
    k.sphere(0.07, INK, { p: [s * 0.22, cy + 0.13, r * 0.86], s: [0.85, 1.2, 0.6], jitter: 0 }, 8, 6);
    k.sphere(0.07, '#ff9e9e', { p: [s * 0.4, cy - 0.04, r * 0.78], s: [1, 0.6, 0.4], jitter: 0 }, 8, 6);
  }
  k.torus(0.05, 0.016, INK, { p: [0, cy + 0.0, r * 0.95], r: [0, 0, Math.PI], jitter: 0 }, 4, 8, Math.PI);
  // The scarf, and its tail down the back.
  k.torus(0.58, 0.12, v.color, { p: [0, cy - 0.3, 0], r: [Math.PI / 2, 0, 0], s: [1.04, 1, 1] }, 8, 22);
  k.rbox(0.22, 0.46, 0.1, 0.04, v.color, { p: [0.24, cy - 0.58, -0.58], r: [0.2, 0, 0] });
  // Little arms and feet.
  for (const s of [-1, 1]) {
    k.sphere(0.14, v.coat ?? WHITE, { p: [s * 0.72, cy - 0.22, 0.02], s: [0.8, 1.15, 0.8] }, 8, 6);
    k.sphere(0.17, '#6b4a3a', { p: [s * 0.28, 0.08, 0.06], s: [1, 0.6, 1.35] }, 8, 6);
  }
  if (v.hat) {
    // A woolly hat: a dome, a turned-up band and a bobble.
    k.add(new SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), v.hat, { p: [0, cy + 0.42, 0], s: [1, 0.85, 1] });
    k.torus(0.48, 0.07, v.hat, { p: [0, cy + 0.44, 0], r: [Math.PI / 2, 0, 0], jitter: 0.06 }, 6, 18);
    k.sphere(0.12, v.color, { p: [0, cy + 0.88, 0] }, 8, 6);
  }
  return k.build({ castShadow: true, receiveShadow: false });
}

interface Walker {
  v: Wanderer;
  lap: ReturnType<typeof walker>;
  root: Group;
  body: Group;
  hit: Mesh;
  prompt: Prompt;
  collider: Collider;
  /** Seconds they've stood still for you, taken off the clock (so they pick up where they stopped). */
  held: number;
  yaw: number;
  x: number;
  z: number;
  moving: boolean;
  /** The next line they'll say. */
  line: number;
  text: PromptText | null;
  anchor: Vector3;
}

export class Wanderers {
  readonly group = new Group();
  /** One per person, moved as they walk: the explorer can't walk through anyone. */
  readonly colliders: Collider[] = [];
  /** Whose prompt is up. */
  open: string | null = null;
  private walkers: Walker[] = [];
  private phase = 0;
  /** The walk clock (wander.ts): the real time when the island opened, run on by the game's own steps. */
  private clock = walkClock();

  constructor(
    host: HTMLElement,
    wanderers: Wanderer[],
    private o: { reducedMotion: boolean; onPress: (id: string) => void; say: (v: Wanderer, line: string) => void },
  ) {
    this.group.name = 'wanderers';
    for (const v of wanderers) {
      const root = new Group();
      const body = figure(v);
      root.add(body);
      root.name = `wanderer-${v.id}`;
      this.group.add(root);
      const hit = new Mesh(new CylinderGeometry(0.9, 0.9, 2, 8), hitMaterial);
      hit.position.y = 1;
      hit.userData.wanderer = v.id;
      root.add(hit);
      const prompt = new Prompt(host, { name: cap(v.name), color: v.color, key: 'E', onPress: () => o.onPress(v.id) });
      const collider = { x: 0, z: 0, r: BODY };
      this.colliders.push(collider);
      this.walkers.push({ v, lap: walker(v), root, body, hit, prompt, collider, held: 0, yaw: 0, x: 0, z: 0, moving: false, line: 0, text: null, anchor: new Vector3() });
    }
    this.step(0, null, true);
  }

  /** Who a pointer ray hits, if anyone. */
  pick(raycaster: Raycaster): string | null {
    let best: { id: string; d: number } | null = null;
    for (const w of this.walkers) {
      if (!w.root.visible) continue;
      const h = raycaster.intersectObject(w.hit, false)[0];
      if (h && (!best || h.distance < best.d)) best = { id: w.v.id, d: h.distance };
    }
    return best?.id ?? null;
  }

  /** Someone is right beside (x, z): close enough that they, not a building's door, have your attention. */
  claims(x: number, z: number, r = 1.8) {
    return this.walkers.some((w) => w.root.visible && Math.hypot(x - w.x, z - w.z) < r);
  }

  /** Where someone is now. */
  where(id: string) {
    const w = this.walkers.find((x) => x.v.id === id);
    return w ? { x: w.x, z: w.z } : null;
  }

  /** Say the next line, and turn the prompt to it. */
  talk(id: string) {
    const w = this.walkers.find((x) => x.v.id === id);
    if (!w) return;
    const line = w.v.lines[w.line % w.v.lines.length];
    w.line++;
    w.text = { kicker: cap(w.v.doing), blurb: `“${line}”`, action: 'Chat' };
    w.prompt.set(w.text);
    this.o.say(w.v, line);
  }

  /**
   * Who's close enough to talk to (if nothing more important has your
   * attention). They stop and turn to you. Returns true when a prompt has
   * just opened.
   */
  near(x: number, z: number, allowed: boolean) {
    let best: string | null = null;
    let bestD = TALK_RANGE;
    if (allowed) {
      for (const w of this.walkers) {
        if (!w.root.visible) continue;
        const d = Math.hypot(x - w.x, z - w.z);
        if (d < bestD) (best = w.v.id), (bestD = d);
      }
    }
    const opened = best !== null && best !== this.open;
    if (opened) {
      const w = this.walkers.find((v) => v.v.id === best)!;
      w.text = { kicker: cap(w.v.doing), blurb: w.v.looks, action: 'Say hello' };
      w.prompt.set(w.text);
    }
    this.open = best;
    return opened;
  }

  /**
   * One step on: everyone walks their loop by the clock, except whoever's
   * close to you, who holds still and turns your way. `hideNear` hides anyone
   * within reach of a building that's open (they'd walk through its room).
   */
  update(dt: number, you: { x: number; z: number } | null, hideNear: { x: number; z: number; r: number } | null = null) {
    this.step(dt, you, false, hideNear);
  }

  private step(dt: number, you: { x: number; z: number } | null, snap: boolean, hideNear: { x: number; z: number; r: number } | null = null) {
    this.clock += dt;
    const now = this.clock;
    this.phase += dt;
    for (const w of this.walkers) {
      const stopped = !!you && Math.hypot(you.x - w.x, you.z - w.z) < TALK_RANGE;
      if (stopped) w.held += dt;
      const s = w.lap.at(now - w.held);
      w.x = s.x;
      w.z = s.z;
      w.moving = s.moving && !stopped;
      const want = stopped && you ? Math.atan2(you.x - w.x, you.z - w.z) : s.heading;
      w.yaw = snap || this.o.reducedMotion ? want : w.yaw + turnBetween(w.yaw, want) * (1 - Math.exp(-dt * (stopped ? 8 : 5)));
      const y = groundAt(w.x, w.z);
      w.root.position.set(w.x, y, w.z);
      w.root.rotation.y = w.yaw;
      // A little waddle as they go, and a slow breath when they stand.
      const t = this.phase * 6.5 + w.v.id.length;
      const walk = w.moving && !this.o.reducedMotion ? 1 : 0;
      w.body.position.y = walk * Math.abs(Math.sin(t)) * 0.09;
      w.body.rotation.z = walk * Math.sin(t) * 0.07;
      w.body.rotation.x = walk * 0.06;
      const breath = this.o.reducedMotion ? 1 : 1 + Math.sin(this.phase * 2 + w.v.id.length) * 0.015 * (1 - walk);
      w.body.scale.set(1, breath, 1);
      w.root.visible = !hideNear || Math.hypot(w.x - hideNear.x, w.z - hideNear.z) > hideNear.r;
      w.collider.x = w.root.visible ? w.x : 1e6;
      w.collider.z = w.z;
      w.anchor.set(w.x, y + 2.2, w.z);
      w.hit.updateMatrixWorld(true);
    }
  }

  /** Float the open prompt over whoever it's for. Returns the screen areas the prompts take, for the labels to avoid. */
  place(camera: PerspectiveCamera, w: number, h: number, avoid: Rect[], visible: boolean): Rect[] {
    const rects: Rect[] = [];
    for (const x of this.walkers) {
      x.prompt.show(visible && this.open === x.v.id && x.root.visible);
      const r = x.prompt.place(camera, x.anchor, w, h, avoid);
      if (r) rects.push(r, { l: r.l, t: r.b, r: r.r, b: r.b + 90 });
    }
    return rects;
  }

  /** Debugging: everyone, where they are, and whether their prompt is up. */
  list() {
    return this.walkers.map((w) => ({ id: w.v.id, x: w.x, z: w.z, moving: w.moving, open: this.open === w.v.id, visible: w.root.visible, said: w.line }));
  }

  dispose() {
    for (const w of this.walkers) {
      w.prompt.dispose();
      w.hit.geometry.dispose();
      w.body.traverse((m) => (m as Mesh).geometry?.dispose());
    }
  }
}
