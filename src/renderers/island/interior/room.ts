// Inside a building, as a piece of any three.js scene: a little low-poly
// room, seen like a dollhouse with its roof and front wall taken off. It's a
// Group, with no scene, camera or renderer of its own, so it can be set down
// anywhere: the island opens a house up and puts its room in the house's own
// spot (see "Inside a building" in game.ts), and it would sit just as well on
// another page. Built from the same kit as the landmarks, so it looks like it
// belongs. The explorer walks about on a flat floor; the islanders who live
// here stand around, blink, and turn to look at you. Where you can stand and
// what's within reach are roomPlan.ts's, shared with the map; the words are
// room.ts's.
//
//   const room = buildInterior({ place, ui, sound, leave, reducedMotion });
//   parent.add(room.group);            // at any position, turn and scale
//   room.view(camera, width, height);  // what it's seen through; the canvas in CSS pixels
//   room.reveal(1);                    // 0 flat on its floor .. 1 standing (it grows up out of it)
//   every frame: room.update(time, dt, wish, sprint);
//   room.dispose();
//
// In its own units (scene units, K to a room unit) the floor is at y = 0 with
// (0, 0) in the middle, and the door is in the middle of the front wall, at
// +z. `size` is its outer box in those units; frame.ts works out where a
// camera should be to show it. Its one light is a warm lamp of its own: the
// rest comes from wherever it's put (on the island, the sun and the sky).
// It needs the place (with its interior), a RoomUI for the words, and the
// page's world (WorldData.astro), which the explorer reads the ground from
// when it's outdoors.

import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  Ray,
  Raycaster,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
} from 'three';
import type { Place } from '../../../world/schema';
import type { RoomTarget, RoomUI } from '../../room';
import { planRoom, type RoomPlan, type Spot } from '../../roomPlan';
import type { SoundName } from '../../types';
import { Explorer, type Wearable } from '../character';
import { lerp } from '../util/math';
import { Kit, litMaterial } from '../world/kit';
import { Puffs } from '../world/particles';
import { Ripples } from '../world/ripples';
import { buildProp, K, propHeight, shade } from './props';

export { K };
const WALL = 3.2;
const THICK = 0.3;
/** How far the walls and floor go on down below the floor, so they meet the ground wherever the room is set down. */
const SINK = 0.45;

/** How each kind of building does its walls and floor. */
const STYLES: Record<string, { wall: string; trim: string; floor: string; floor2: string; tiles?: number }> = {
  cabin: { wall: '#c58f5a', trim: '#8a5a36', floor: '#c99561', floor2: '#b98352' },
  taproom: { wall: '#f3e2c4', trim: '#6b4228', floor: '#8a5a36', floor2: '#7a4e2d' },
  library: { wall: '#7f9fe0', trim: '#6b4228', floor: '#c99561', floor2: '#a8784a' },
  lighthouse: { wall: '#e9e4dc', trim: '#c94a4a', floor: '#aca397', floor2: '#958c80' },
  schoolhouse: { wall: '#f4ead2', trim: '#86b28f', floor: '#d2a06a', floor2: '#c08a56' },
  depot: { wall: '#a9b2b0', trim: '#5f6866', floor: '#b5bcb9', floor2: '#a3aaa7' },
  // Bright and echoey: pale walls and big pale floor tiles, the place's red along the skirting.
  mall: { wall: '#f5f2ed', trim: '#c8102e', floor: '#eeebe5', floor2: '#dedad2', tiles: 1.5 },
};

/** The window glass: sky by day, the night outside after dark. */
const GLASS_DAY = new Color('#bfe6f5');
const GLASS_NIGHT = new Color('#22305c');
/** The lamp, by day and after dark (at full size: it's scaled with the room). */
const LAMP_DAY = 7;
const LAMP_NIGHT = 30;
const LAMP_REACH = 14;

export interface InteriorOptions {
  /** The building, with its interior. */
  place: Place;
  /** The words: the bar, the nudge and the conversation box (renderers/room.ts). */
  ui: RoomUI;
  sound: { play(name: SoundName): void };
  /** Walked out of the doorway. */
  leave(): void;
  reducedMotion: boolean;
  /** How dark it is outside, 0 day to 1 night, to start with (night() changes it). */
  night?: number;
  /** What the explorer has on, from the wardrobe. */
  wear?: readonly Wearable[];
}

export interface Interior {
  /** The whole room: add it to anything. */
  readonly group: Group;
  readonly plan: RoomPlan;
  readonly player: Explorer;
  /** Its outer box in its own units: across (w), front to back (d), and the walls' height (h). */
  readonly size: { w: number; d: number; h: number };
  /** The camera it's seen through and the canvas's size in CSS pixels: for walking with the keys, taps, hovering and screen(). */
  view(camera: Camera, w: number, h: number): void;
  /** One step on: walking (wish is screen-relative: x right, y down), the islanders, the fire. */
  update(time: number, dt: number, wish: Vector2, sprint: boolean): void;
  /** How far it has grown up out of its floor: 0 flat (its lamp out), 1 standing. A little over 1 is a springy overshoot. */
  reveal(k: number): void;
  /** How dark it is outside, 0 day to 1 night: the windows go dark and the lamp comes up. */
  night(n: number): void;
  /** A tap at a point in normalised device coordinates. */
  tap(ndc: Vector2): void;
  /** Whether a pointer at these coordinates is over someone or something. */
  over(ndc: Vector2): boolean;
  jump(): void;
  releaseJump(): void;
  /** Stop following a tap (the keys took over). */
  halt(): void;
  engage(t: RoomTarget | null): void;
  /** A room point (room units; y in its own units above the floor) on screen, in CSS pixels. */
  screen(x: number, z: number, y?: number): { x: number; y: number };
  /** Walk over to someone or something and talk to it (or look at it), as a tap would. */
  go(id: string): boolean;
  readonly within: Spot | null;
  /** Where the explorer is, in room units. */
  readonly at: { x: number; z: number };
  /** Take it out of whatever it's in, and free everything it made. */
  dispose(): void;
}

export function buildInterior(o: InteriorOptions): Interior {
  const { place, ui } = o;
  const plan = planRoom(place.interior!, place.archetype);
  const style = STYLES[place.archetype] ?? STYLES.cabin;
  const W = plan.w * K;
  const D = plan.d * K;
  const back = -D / 2;
  const group = new Group();
  group.name = `interior-${place.id}`;
  // Everything but the lamp grows up out of the floor (see reveal()).
  const inner = new Group();
  group.add(inner);
  const mats: Material[] = [];
  const mat = <T extends Material>(m: T) => (mats.push(m), m);

  // ---------- Light ----------
  // A warm lamp toward the back of the room (flickering with the fire, if there's a hearth).
  const lamp = new PointLight('#ffcf8a', 0, LAMP_REACH, 1.6);
  lamp.position.set(0, WALL - 0.6, back + D * 0.45);
  group.add(lamp);
  const fire = plan.spots.some((s) => s.prop === 'hearth') && !o.reducedMotion;

  // ---------- The shell: floor, walls, the doorway ----------
  const kit = new Kit(7);
  // Floor planks, alternating (deep enough to meet the ground under them); or, in a style with tiles, a checkerboard of them.
  if (style.tiles) {
    const nx = Math.round(W / style.tiles);
    const nz = Math.round(D / style.tiles);
    kit.box(W, SINK, D, style.floor2, { p: [0, -0.2 - SINK / 2, 0] });
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      kit.box(W / nx - 0.03, 0.2, D / nz - 0.03, (i + j) % 2 ? style.floor : style.floor2, { p: [-W / 2 + (i + 0.5) * (W / nx), -0.1, back + (j + 0.5) * (D / nz)], jitter: 0.012 });
    }
  } else {
    const planks = Math.round(D / 0.6);
    for (let i = 0; i < planks; i++) {
      const z = back + (i + 0.5) * (D / planks);
      kit.box(W, 0.2 + SINK, D / planks - 0.02, i % 2 ? style.floor : style.floor2, { p: [0, -(0.2 + SINK) / 2, z], jitter: 0.02 });
    }
  }
  // A rug in the place's color.
  kit.box(Math.min(W - 3, 6), 0.03, 2.2, place.color, { p: [0, 0.015, D / 2 - 2.6], jitter: 0 });
  kit.box(Math.min(W - 3, 6) - 0.5, 0.035, 1.7, shade(place.color, 0.12), { p: [0, 0.02, D / 2 - 2.6], jitter: 0 });
  // Back wall, side walls, a low front wall with the doorway in it.
  const tall = WALL + SINK;
  kit.box(W + THICK * 2, tall, THICK, style.wall, { p: [0, WALL - tall / 2, back - THICK / 2] });
  kit.box(W + THICK * 2, 0.35, THICK + 0.04, style.trim, { p: [0, 0.18, back - THICK / 2 + 0.02] });
  kit.box(W + THICK * 2, 0.22, THICK + 0.06, style.trim, { p: [0, WALL - 0.11, back - THICK / 2 + 0.02] });
  for (const s of [-1, 1]) {
    kit.box(THICK, tall, D, style.wall, { p: [s * (W / 2 + THICK / 2), WALL - tall / 2, 0] });
    kit.box(THICK + 0.04, 0.35, D, style.trim, { p: [s * (W / 2 + THICK / 2 - 0.02), 0.18, 0] });
  }
  const doorHW = 0.8 * K;
  const frontW = W / 2 - doorHW;
  for (const s of [-1, 1]) {
    kit.box(frontW + THICK, 0.6 + SINK, THICK, style.wall, { p: [s * (doorHW + frontW / 2 + THICK / 2), (0.6 - SINK) / 2, D / 2 + THICK / 2] });
    kit.box(frontW + THICK, 0.12, THICK + 0.06, style.trim, { p: [s * (doorHW + frontW / 2 + THICK / 2), 0.62, D / 2 + THICK / 2] });
    // The door posts.
    kit.box(0.22, 1.1, THICK + 0.1, style.trim, { p: [s * (doorHW + 0.11), 0.55, D / 2 + THICK / 2] });
  }
  // The doormat, and a step down out of the doorway.
  kit.box(doorHW * 2 - 0.3, 0.04, 0.7, shade(place.color, -0.12), { p: [0, 0.02, D / 2 - 0.4], jitter: 0 });
  kit.box(doorHW * 2, 0.2 + SINK, THICK, style.floor2, { p: [0, -(0.2 + SINK) / 2, D / 2 + THICK / 2], jitter: 0.02 });

  // Windows on the back wall wherever nothing hangs (the lamp room is all window).
  const hung = plan.spots.filter((s) => s.kind === 'thing' && (s.hang || s.prop === 'bookshelf' || s.prop === 'hearth' || s.prop === 'cabinet' || s.prop === 'escalator'));
  const free = (x0: number, x1: number) => hung.every((s) => x1 < (s.x - s.hw) * K - 0.3 || x0 > (s.x + s.hw) * K + 0.3);
  const windows: number[] = [];
  if (place.archetype === 'lighthouse') for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 1.6) windows.push(x);
  else for (const k of [0, -0.3, 0.3, -0.38, 0.38]) if (windows.length < 2 && free(k * W - 0.8, k * W + 0.8)) windows.push(k * W);
  for (const x of windows) {
    const lh = place.archetype === 'lighthouse';
    kit.box(lh ? 1.3 : 1.6, lh ? 2.2 : 1.3, 0.08, '#fffaf2', { p: [x, lh ? 1.8 : 2.0, back + 0.02] });
    kit.addGlow(new BoxGeometry(lh ? 1.15 : 1.4, lh ? 2.0 : 1.1, 0.06), '#ffffff', { p: [x, lh ? 1.8 : 2.0, back + 0.05] });
    kit.box(0.08, lh ? 2.0 : 1.1, 0.1, '#fffaf2', { p: [x, lh ? 1.8 : 2.0, back + 0.08] });
    if (!lh) kit.box(1.6, 0.1, 0.25, style.trim, { p: [x, 1.32, back + 0.12] });
  }
  // The glass is white in a material that's tinted by the hour (see night()).
  const glass = mat(new MeshBasicMaterial({ vertexColors: true, color: GLASS_DAY }));
  inner.add(kit.build({ castShadow: true, receiveShadow: true, glowMaterial: glass }));

  // ---------- Things ----------
  const hits: Mesh[] = [];
  const hitMat = mat(new MeshBasicMaterial({ visible: false }));
  const animated: ((t: number, dt: number) => void)[] = [];
  const things = new Map(place.interior!.things.map((t) => [t.id, t]));
  for (const s of plan.spots) {
    if (s.kind !== 'thing') continue;
    const t = things.get(s.id)!;
    const g = buildProp(t.prop, place, s, mat, animated, o.reducedMotion);
    g.position.set(s.x * K, 0, s.z * K);
    inner.add(g);
    // An invisible box to click on, a little bigger than the thing itself.
    const h = s.hang ? 2.2 : propHeight(t.prop);
    const hit = new Mesh(new BoxGeometry(s.hw * 2 * K + 0.3, h, Math.max(0.6, s.hd * 2 * K + 0.3)), hitMat);
    hit.position.set(s.x * K, s.hang ? (t.prop === 'board' ? 2.0 : 2.1) : h / 2, s.hang ? back + 0.3 : s.z * K);
    hit.userData = { spot: s };
    inner.add(hit);
    hits.push(hit);
  }

  // ---------- People ----------
  const puffs = new Puffs(60);
  const ripples = new Ripples();
  inner.add(puffs.mesh, ripples.mesh);
  const floorPlan = { canStand: (x: number, z: number) => plan.canStand(x / K, z / K) };
  const islanders = plan.spots
    .filter((s) => s.kind === 'person')
    .map((s) => {
      const e = new Explorer(puffs, ripples, { scarf: s.color, islander: true });
      e.indoors = floorPlan;
      e.calm = true;
      e.place(s.x * K, s.z * K, 0);
      inner.add(e.root, e.shadowMesh);
      const hit = new Mesh(new CylinderGeometry(0.75, 0.75, 1.9, 10), hitMat);
      hit.position.set(s.x * K, 0.95, s.z * K);
      hit.userData = { spot: s };
      inner.add(hit);
      hits.push(hit);
      return { spot: s, e };
    });

  // ---------- You ----------
  const player = new Explorer(puffs, ripples);
  player.indoors = floorPlan;
  player.lowJumps = o.reducedMotion;
  player.calm = o.reducedMotion;
  if (o.wear) player.wear(o.wear);
  player.onJump = (second) => o.sound.play(second ? 'jump2' : 'jump');
  player.onLand = (impact) => impact > 0.15 && o.sound.play('step');
  player.onStep = () => o.sound.play('step');
  player.place(plan.entry.x * K, plan.entry.z * K, Math.PI);
  inner.add(player.root, player.shadowMesh);

  // A ring on the floor under whoever (or whatever) is within reach.
  const ring = new Mesh(new TorusGeometry(0.85, 0.06, 6, 32), mat(new MeshBasicMaterial({ color: place.color, transparent: true, opacity: 0.85 })));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  inner.add(ring);
  // And the click marker.
  const marker = new Mesh(new CircleGeometry(0.3, 20), mat(new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 })));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  inner.add(marker);
  let markerT = 1;

  // ---------- Seen through ----------
  let camera: Camera | null = null;
  let viewW = 1;
  let viewH = 1;
  let shown = 1;
  let dark = Math.min(1, Math.max(0, o.night ?? 0));
  let flicker = 1;
  const v = new Vector3();
  /** The lamp, for how dark it is, how far up the room is, and how big it's been made (light falls off in world units). */
  function light() {
    const s = group.getWorldScale(v).x;
    lamp.distance = LAMP_REACH * s;
    lamp.intensity = lerp(LAMP_DAY, LAMP_NIGHT, dark) * Math.min(1, shown) * flicker * s ** lamp.decay;
  }
  const night = (n: number) => {
    dark = Math.min(1, Math.max(0, n));
    glass.color.lerpColors(GLASS_DAY, GLASS_NIGHT, dark);
    light();
  };
  night(dark);

  /** Keys are screen-relative: right on screen, and up on screen as it falls on the floor, in the room's own terms. */
  const camQ = new Quaternion();
  const roomQ = new Quaternion();
  const ax = new Vector3();
  const ay = new Vector3();
  const move = new Vector2();
  function toRoom(w: Vector2) {
    move.set(0, 0);
    if (w.lengthSq() === 0) return move;
    if (!camera) return move.copy(w);
    camera.getWorldQuaternion(camQ);
    group.getWorldQuaternion(roomQ).invert();
    ax.set(1, 0, 0).applyQuaternion(camQ).applyQuaternion(roomQ);
    // Between the way the camera looks and its up: either alone fails looking straight down, or straight across.
    ay.set(0, 1, -1).applyQuaternion(camQ).applyQuaternion(roomQ);
    const rl = Math.hypot(ax.x, ax.z) || 1;
    const ul = Math.hypot(ay.x, ay.z) || 1;
    return move.set((ax.x / rl) * w.x - (ay.x / ul) * w.y, (ax.z / rl) * w.x - (ay.z / ul) * w.y);
  }

  // ---------- Walking ----------
  let path: { x: number; z: number }[] | null = null;
  let goal: Spot | 'door' | null = null;
  let stuckT = 0;
  let within: Spot | null = null;
  let engaged: RoomTarget | null = null;
  let left = false;
  const wishV = new Vector2();
  const raycaster = new Raycaster();

  const roomPos = () => ({ x: player.pos.x / K, z: player.pos.z / K });

  function act(s: Spot) {
    player.faceToward(s.x * K, s.z * K);
    if (s.kind === 'person') ui.talk(s.id);
    else ui.inspect(s.id);
  }
  function aim(s: Spot | 'door') {
    const at = roomPos();
    if (s !== 'door' && plan.within(at.x, at.z) === s) {
      path = null;
      goal = null;
      act(s);
      return true;
    }
    const to = s === 'door' ? { x: 0, z: plan.d / 2 + 0.35 } : plan.approach(s, at.x, at.z);
    if (!to) return false;
    const p = plan.path(at.x, at.z, to.x, to.z) ?? (s === 'door' ? [to] : null);
    if (!p) return false;
    path = p;
    goal = s;
    stuckT = 0;
    const last = p[p.length - 1];
    marker.position.x = last.x * K;
    marker.position.z = last.z * K;
    markerT = 0;
    return true;
  }
  function arrive() {
    const g = goal;
    path = null;
    goal = null;
    if (g === 'door') return out();
    const at = roomPos();
    if (g && (plan.within(at.x, at.z) === g || plan.reach(g, at.x, at.z) < 1.6)) act(g);
  }
  function out() {
    if (left) return;
    left = true;
    o.leave();
  }

  function update(time: number, dt: number, wish: Vector2, sprint: boolean) {
    const busy = ui.busy;
    const keys = toRoom(wish);
    wishV.set(0, 0);
    if (!left && !busy) {
      if (keys.lengthSq() > 0) {
        path = null;
        goal = null;
        wishV.copy(keys).normalize();
      } else if (path) {
        const p = path[0];
        const dx = p.x * K - player.pos.x;
        const dz = p.z * K - player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.18) {
          path.shift();
          if (!path.length) arrive();
        } else wishV.set(dx / d, dz / d).multiplyScalar(Math.min(1, d / 1.2 + 0.35));
      }
    } else path = null;
    player.sprint = sprint;
    const blocked = player.move(dt, wishV, []);
    if (path && blocked) {
      stuckT += dt;
      if (stuckT > 0.35) {
        path.shift();
        stuckT = 0;
        if (!path.length) arrive();
      }
    } else stuckT = 0;
    player.update(time, dt);

    // Out of the door.
    const at = roomPos();
    if (!left && plan.atDoor(at.x, at.z) && (keys.y > 0.3 || goal === 'door')) out();

    // Who's near: the islanders look your way, and the nearest thing gets a ring.
    const w = left ? null : plan.within(at.x, at.z);
    if (w !== within) {
      within = w;
      if (w) o.sound.play('pop');
    }
    if (!left) ui.near(within ? { kind: within.kind, id: within.id } : null);
    const mark = busy ? null : within;
    ring.visible = !!mark;
    if (mark) {
      ring.position.x = mark.x * K;
      ring.position.z = (mark.hang ? mark.z + mark.hd + 0.4 : mark.z) * K;
      const r = mark.kind === 'person' ? 0.75 : Math.max(0.6, Math.min(mark.hw, 1.2) * K * 0.8);
      ring.scale.setScalar((r / 0.85) * (o.reducedMotion ? 1 : 1 + Math.sin(time * 5) * 0.05));
    }
    for (const { spot, e } of islanders) {
      const talking = engaged?.kind === 'person' && engaged.id === spot.id;
      const near = Math.hypot(at.x - spot.x, at.z - spot.z) < 2.6;
      if (talking || near) e.faceToward(player.pos.x, player.pos.z);
      else e.faceToward(spot.x * K + Math.sin(time * 0.3 + spot.x) * 2, spot.z * K + 3);
      e.move(dt, wishV.set(0, 0), []);
      e.update(time, dt);
    }
    puffs.update(dt);
    ripples.update(time, dt, dark);
    for (const f of animated) f(time, dt);
    if (markerT < 1) {
      markerT = Math.min(1, markerT + dt * 1.8);
      (marker.material as MeshBasicMaterial).opacity = (1 - markerT) * 0.8;
    }
    flicker = fire ? 1 + Math.sin(time * 13) * 0.06 + Math.sin(time * 7.3) * 0.04 : 1;
    light();
  }

  const pick = (ndc: Vector2): Spot | null => {
    if (!camera || shown < 0.5) return null;
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(hits, false)[0];
    return h ? (h.object.userData.spot as Spot) : null;
  };
  // Where a tap meets the floor, in room units: the ray brought into the room's own space.
  const toLocal = new Matrix4();
  const ray = new Ray();
  const floorAt = (ndc: Vector2) => {
    if (!camera) return null;
    raycaster.setFromCamera(ndc, camera);
    group.updateWorldMatrix(true, false);
    ray.copy(raycaster.ray).applyMatrix4(toLocal.copy(group.matrixWorld).invert());
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: (ray.origin.x + ray.direction.x * t) / K, z: (ray.origin.z + ray.direction.z * t) / K };
  };

  return {
    group,
    plan,
    player,
    size: { w: W + THICK * 2, d: D + THICK * 2, h: WALL },
    get within() {
      return within;
    },
    get at() {
      return roomPos();
    },
    view(c, w, h) {
      camera = c;
      viewW = w;
      viewH = h;
    },
    update,
    reveal(k) {
      shown = Math.max(0, k);
      inner.scale.y = Math.max(0.001, shown);
      inner.visible = shown > 0.001;
      light();
    },
    night,
    tap(ndc) {
      if (left || ui.busy) return;
      const s = pick(ndc);
      if (s) {
        if (aim(s)) o.sound.play('pop');
        return;
      }
      const f = floorAt(ndc);
      if (!f) return;
      if (Math.abs(f.x) < 0.9 && f.z > plan.d / 2 - 0.3 && f.z < plan.d / 2 + 1.2) {
        if (aim('door')) o.sound.play('tap');
        return;
      }
      if (Math.abs(f.x) > plan.w / 2 + 0.5 || Math.abs(f.z) > plan.d / 2 + 0.5) return;
      const at = roomPos();
      const p = plan.path(at.x, at.z, f.x, f.z);
      if (p) {
        path = p;
        goal = null;
        const last = p[p.length - 1];
        marker.position.x = last.x * K;
        marker.position.z = last.z * K;
        markerT = 0;
        o.sound.play('tap');
      }
    },
    over: (ndc) => !!pick(ndc),
    jump() {
      if (!left && !ui.busy) player.jump();
    },
    releaseJump: () => player.releaseJump(),
    halt() {
      path = null;
      goal = null;
    },
    engage(t) {
      engaged = t;
      const s = t ? plan.spots.find((x) => x.id === t.id) : null;
      if (s) {
        player.faceToward(s.x * K, s.z * K);
        if (s.kind === 'person') islanders.find((x) => x.spot === s)?.e.hop(o.reducedMotion ? 2 : 3.5);
      }
    },
    screen(x, z, y = 1) {
      if (!camera) return { x: viewW / 2, y: viewH / 2 };
      inner.updateWorldMatrix(true, false);
      v.set(x * K, y, z * K);
      inner.localToWorld(v).project(camera);
      return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
    },
    go(id) {
      const s = plan.spots.find((x) => x.id === id);
      return s ? aim(s) : false;
    },
    dispose() {
      group.removeFromParent();
      // The explorers free their own; everything else is freed once (the kit's shared material is everyone's, so it stays).
      const theirs = new Set<Object3D>([player.root, player.shadowMesh, ...islanders.flatMap(({ e }) => [e.root, e.shadowMesh])]);
      player.dispose();
      islanders.forEach(({ e }) => e.dispose());
      const geos = new Set<BufferGeometry>();
      const all = new Set<Material>(mats);
      const walk = (x: Object3D) => {
        if (theirs.has(x)) return;
        const m = x as Mesh;
        if (m.geometry) geos.add(m.geometry);
        if (m.material) for (const q of Array.isArray(m.material) ? m.material : [m.material]) all.add(q);
        x.children.forEach(walk);
      };
      walk(group);
      geos.forEach((g) => g.dispose());
      all.delete(litMaterial());
      all.forEach((m) => m.dispose());
      lamp.dispose();
    },
  };
}
