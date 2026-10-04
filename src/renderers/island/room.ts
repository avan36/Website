// Inside a building, on the 3D island: a little low-poly room, seen like a
// dollhouse with its front wall taken off. It's its own scene with its own
// camera (the island isn't drawn while you're in here), built from the same
// kit as the landmarks, so it looks like it belongs. The explorer walks about
// on a flat floor; the islanders who live here stand around, blink, and turn
// to look at you. Where you can stand and what's within reach are
// roomPlan.ts's, shared with the map; the words are room.ts's.

import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { Place, Prop } from '../../world/schema';
import { BOX_SIDE, boxDocksRight, type RoomTarget, type RoomUI } from '../room';
import { planRoom, type RoomPlan, type Spot } from '../roomPlan';
import type { SoundName } from '../types';
import { Explorer } from './character';
import { damp } from './util/math';
import { Kit } from './world/kit';
import { Puffs } from './world/particles';
import { Ripples } from './world/ripples';

/** Scene units per room unit: the explorer is big, so rooms are a little roomier in 3D. */
const K = 1.5;
const WALL = 3.2;
const THICK = 0.3;

const shade = (hex: string, k: number) => {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return '#' + c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + k))).getHexString();
};

/** How each kind of building does its walls and floor. */
const STYLES: Record<string, { wall: string; trim: string; floor: string; floor2: string }> = {
  cabin: { wall: '#c58f5a', trim: '#8a5a36', floor: '#c99561', floor2: '#b98352' },
  taproom: { wall: '#f3e2c4', trim: '#6b4228', floor: '#8a5a36', floor2: '#7a4e2d' },
  library: { wall: '#7f9fe0', trim: '#6b4228', floor: '#c99561', floor2: '#a8784a' },
  lighthouse: { wall: '#e9e4dc', trim: '#c94a4a', floor: '#aca397', floor2: '#958c80' },
  schoolhouse: { wall: '#f4ead2', trim: '#86b28f', floor: '#d2a06a', floor2: '#c08a56' },
  depot: { wall: '#a9b2b0', trim: '#5f6866', floor: '#b5bcb9', floor2: '#a3aaa7' },
};

export interface IslandRoom {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly plan: RoomPlan;
  readonly player: Explorer;
  /** One step on: walking (wish is screen-relative: x right, y down), the islanders, the fire. */
  update(time: number, dt: number, wish: Vector2, sprint: boolean): void;
  resize(w: number, h: number): void;
  /** A tap at a point in normalised device coordinates. */
  tap(ndc: Vector2): void;
  /** Whether a pointer at these coordinates is over someone or something. */
  over(ndc: Vector2): boolean;
  jump(): void;
  releaseJump(): void;
  /** Stop following a tap (the keys took over). */
  halt(): void;
  engage(t: RoomTarget | null): void;
  /** A room point (room units) on screen, in CSS pixels. */
  screen(x: number, z: number, y?: number): { x: number; y: number };
  /** Walk over to someone or something and talk to it (or look at it), as a tap would. */
  go(id: string): boolean;
  readonly within: Spot | null;
  /** Where the explorer is, in room units. */
  readonly at: { x: number; z: number };
  dispose(): void;
}

export function buildRoom(o: {
  place: Place;
  ui: RoomUI;
  night: boolean;
  reducedMotion: boolean;
  sound: { play(name: SoundName): void };
  leave(): void;
}): IslandRoom {
  const { place, ui } = o;
  const plan = planRoom(place.interior!, place.archetype);
  const style = STYLES[place.archetype] ?? STYLES.cabin;
  const W = plan.w * K;
  const D = plan.d * K;
  const back = -D / 2;
  const scene = new Scene();
  scene.background = new Color(o.night ? '#141019' : '#2a1f18');
  const mats: Material[] = [];
  const mat = <T extends Material>(m: T) => (mats.push(m), m);

  // ---------- Light ----------
  scene.add(new HemisphereLight('#fff4e2', '#6b4a3a', o.night ? 0.9 : 1.25));
  scene.add(new AmbientLight('#ffffff', 0.25));
  const sun = new DirectionalLight(o.night ? '#b8c4ff' : '#fff1dc', o.night ? 0.6 : 1.8);
  sun.position.set(-4, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -W / 2 - 2;
  sc.right = W / 2 + 2;
  sc.top = D / 2 + 2;
  sc.bottom = -D / 2 - 2;
  sc.near = 1;
  sc.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const lamp = new PointLight('#ffcf8a', o.night ? 26 : 12, 14, 1.6);
  lamp.position.set(0, WALL - 0.6, back + D * 0.45);
  scene.add(lamp);

  // ---------- The shell: floor, walls, the doorway ----------
  const kit = new Kit(7);
  // Floor planks, alternating.
  const planks = Math.round(D / 0.6);
  for (let i = 0; i < planks; i++) {
    const z = back + (i + 0.5) * (D / planks);
    kit.box(W, 0.2, D / planks - 0.02, i % 2 ? style.floor : style.floor2, { p: [0, -0.1, z], jitter: 0.02 });
  }
  // A rug in the place's color.
  kit.box(Math.min(W - 3, 6), 0.03, 2.2, place.color, { p: [0, 0.015, D / 2 - 2.6], jitter: 0 });
  kit.box(Math.min(W - 3, 6) - 0.5, 0.035, 1.7, shade(place.color, 0.12), { p: [0, 0.02, D / 2 - 2.6], jitter: 0 });
  // Back wall, side walls (lower toward the front, like a cutaway), a low front wall with the doorway in it.
  kit.box(W + THICK * 2, WALL, THICK, style.wall, { p: [0, WALL / 2, back - THICK / 2] });
  kit.box(W + THICK * 2, 0.35, THICK + 0.04, style.trim, { p: [0, 0.18, back - THICK / 2 + 0.02] });
  kit.box(W + THICK * 2, 0.22, THICK + 0.06, style.trim, { p: [0, WALL - 0.11, back - THICK / 2 + 0.02] });
  for (const s of [-1, 1]) {
    kit.box(THICK, WALL, D, style.wall, { p: [s * (W / 2 + THICK / 2), WALL / 2, 0] });
    kit.box(THICK + 0.04, 0.35, D, style.trim, { p: [s * (W / 2 + THICK / 2 - 0.02), 0.18, 0] });
  }
  const doorHW = 0.8 * K;
  const frontW = W / 2 - doorHW;
  for (const s of [-1, 1]) {
    kit.box(frontW + THICK, 0.6, THICK, style.wall, { p: [s * (doorHW + frontW / 2 + THICK / 2), 0.3, D / 2 + THICK / 2] });
    kit.box(frontW + THICK, 0.12, THICK + 0.06, style.trim, { p: [s * (doorHW + frontW / 2 + THICK / 2), 0.62, D / 2 + THICK / 2] });
    // The door posts.
    kit.box(0.22, 1.1, THICK + 0.1, style.trim, { p: [s * (doorHW + 0.11), 0.55, D / 2 + THICK / 2] });
  }
  // The doormat, and a strip of the outside through the doorway.
  kit.box(doorHW * 2 - 0.3, 0.04, 0.7, shade(place.color, -0.12), { p: [0, 0.02, D / 2 - 0.4], jitter: 0 });
  kit.box(doorHW * 2, 0.1, 1.4, o.night ? '#33415f' : '#8fcf62', { p: [0, -0.06, D / 2 + 0.9], jitter: 0 });

  // Windows on the back wall wherever nothing hangs (the lamp room is all window).
  const hung = plan.spots.filter((s) => s.kind === 'thing' && (s.hang || s.prop === 'bookshelf' || s.prop === 'hearth' || s.prop === 'cabinet'));
  const free = (x0: number, x1: number) => hung.every((s) => x1 < (s.x - s.hw) * K - 0.3 || x0 > (s.x + s.hw) * K + 0.3);
  const glass = o.night ? '#22305c' : '#bfe6f5';
  const windows: number[] = [];
  if (place.archetype === 'lighthouse') for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 1.6) windows.push(x);
  else for (const k of [0, -0.3, 0.3, -0.38, 0.38]) if (windows.length < 2 && free(k * W - 0.8, k * W + 0.8)) windows.push(k * W);
  for (const x of windows) {
    const lh = place.archetype === 'lighthouse';
    kit.box(lh ? 1.3 : 1.6, lh ? 2.2 : 1.3, 0.08, '#fffaf2', { p: [x, lh ? 1.8 : 2.0, back + 0.02] });
    kit.addGlow(new BoxGeometry(lh ? 1.15 : 1.4, lh ? 2.0 : 1.1, 0.06), glass, { p: [x, lh ? 1.8 : 2.0, back + 0.05] });
    kit.box(0.08, lh ? 2.0 : 1.1, 0.1, '#fffaf2', { p: [x, lh ? 1.8 : 2.0, back + 0.08] });
    if (!lh) kit.box(1.6, 0.1, 0.25, style.trim, { p: [x, 1.32, back + 0.12] });
  }
  const shell = kit.build({ castShadow: false, receiveShadow: true });
  scene.add(shell);

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
    scene.add(g);
    // An invisible box to click on, a little bigger than the thing itself.
    const h = s.hang ? 2.2 : propHeight(t.prop);
    const hit = new Mesh(new BoxGeometry(s.hw * 2 * K + 0.3, h, Math.max(0.6, s.hd * 2 * K + 0.3)), hitMat);
    hit.position.set(s.x * K, s.hang ? (t.prop === 'board' ? 2.0 : 2.1) : h / 2, s.hang ? back + 0.3 : s.z * K);
    hit.userData = { spot: s };
    scene.add(hit);
    hits.push(hit);
  }

  // ---------- People ----------
  const puffs = new Puffs(60);
  const ripples = new Ripples();
  scene.add(puffs.mesh, ripples.mesh);
  const floorPlan = { canStand: (x: number, z: number) => plan.canStand(x / K, z / K) };
  const islanders = plan.spots
    .filter((s) => s.kind === 'person')
    .map((s) => {
      const e = new Explorer(puffs, ripples, { scarf: s.color, islander: true });
      e.indoors = floorPlan;
      e.calm = true;
      e.place(s.x * K, s.z * K, 0);
      scene.add(e.root, e.shadowMesh);
      const hit = new Mesh(new CylinderGeometry(0.75, 0.75, 1.9, 10), hitMat);
      hit.position.set(s.x * K, 0.95, s.z * K);
      hit.userData = { spot: s };
      scene.add(hit);
      hits.push(hit);
      return { spot: s, e };
    });

  // ---------- You ----------
  const player = new Explorer(puffs, ripples);
  player.indoors = floorPlan;
  player.lowJumps = o.reducedMotion;
  player.calm = o.reducedMotion;
  player.onJump = (second) => o.sound.play(second ? 'jump2' : 'jump');
  player.onLand = (impact) => impact > 0.15 && o.sound.play('step');
  player.onStep = () => o.sound.play('step');
  player.place(plan.entry.x * K, plan.entry.z * K, Math.PI);
  scene.add(player.root, player.shadowMesh);

  // A ring on the floor under whoever (or whatever) is within reach.
  const ring = new Mesh(new TorusGeometry(0.85, 0.06, 6, 32), mat(new MeshBasicMaterial({ color: place.color, transparent: true, opacity: 0.85 })));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  scene.add(ring);
  // And the click marker.
  const marker = new Mesh(new CircleGeometry(0.3, 20), mat(new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 })));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  scene.add(marker);
  let markerT = 1;

  // ---------- Camera ----------
  const camera = new PerspectiveCamera(38, 1, 0.5, 200);
  const look = new Vector3(0, 0.6, 0.6);
  let viewW = 1;
  let viewH = 1;
  let dist = 20;
  const PITCH = 0.92;
  function resize(w: number, h: number) {
    viewW = w;
    viewH = h;
    camera.aspect = w / h;
    // The room sits in what the HUD and the box leave: beside the box on a wide screen, above it on a narrow one.
    const side = boxDocksRight(w, h);
    const top = 132;
    const under = side ? 24 : Math.max(24, h * 0.46 + 8);
    const aw = Math.max(200, w - (side ? BOX_SIDE : 0) - 24);
    const ah = Math.max(160, h - top - under);
    const cx = (side ? (w - BOX_SIDE) / 2 : w / 2) + 0;
    const cy = top + ah / 2;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    // Far enough back that the whole room fits in that space, across and deep.
    const vfov = (camera.fov * Math.PI) / 180;
    const fitH = Math.tan(vfov / 2) * (ah / h);
    const fitW = Math.tan(vfov / 2) * (aw / h);
    const halfW = W / 2 + 0.6;
    const halfD = (D * Math.sin(PITCH) + WALL * Math.cos(PITCH)) / 2 + 0.6;
    dist = Math.max(halfW / fitW, halfD / fitH) + D * 0.25;
    camera.updateProjectionMatrix();
  }
  const camAt = new Vector3();
  function placeCamera() {
    camera.position.set(look.x, look.y + Math.sin(PITCH) * dist, look.z + Math.cos(PITCH) * dist);
    camera.lookAt(look);
  }
  resize(1, 1);
  placeCamera();

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
    wishV.set(0, 0);
    if (!left && !busy) {
      if (wish.lengthSq() > 0) {
        path = null;
        goal = null;
        wishV.copy(wish).normalize();
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
    if (!left && plan.atDoor(at.x, at.z) && (wish.y > 0 || goal === 'door')) out();

    // Who's near: the islanders look your way, and the nearest thing gets a ring.
    const w = left ? null : plan.within(at.x, at.z);
    if (w !== within) {
      within = w;
      if (w) o.sound.play('pop');
    }
    ui.near(within ? { kind: within.kind, id: within.id } : null);
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
    ripples.update(time, dt, 0);
    for (const f of animated) f(time, dt);
    if (markerT < 1) {
      markerT = Math.min(1, markerT + dt * 1.8);
      (marker.material as MeshBasicMaterial).opacity = (1 - markerT) * 0.8;
    }

    // The camera drifts a little with you, never far.
    look.x = damp(look.x, player.pos.x * 0.18, 3, dt);
    look.z = damp(look.z, 0.6 + (player.pos.z - 0.6) * 0.12, 3, dt);
    placeCamera();
    camAt.copy(camera.position);
  }

  const pick = (ndc: Vector2): Spot | null => {
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(hits, false)[0];
    return h ? (h.object.userData.spot as Spot) : null;
  };
  const floorAt = (ndc: Vector2) => {
    raycaster.setFromCamera(ndc, camera);
    const r = raycaster.ray;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = -r.origin.y / r.direction.y;
    if (t < 0) return null;
    return { x: (r.origin.x + r.direction.x * t) / K, z: (r.origin.z + r.direction.z * t) / K };
  };

  const v = new Vector3();
  return {
    scene,
    camera,
    plan,
    player,
    get within() {
      return within;
    },
    get at() {
      return roomPos();
    },
    update,
    resize,
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
      v.set(x * K, y, z * K).project(camera);
      return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
    },
    go(id) {
      const s = plan.spots.find((x) => x.id === id);
      return s ? aim(s) : false;
    },
    dispose() {
      const seen = new Set<object>();
      scene.traverse((obj: Object3D) => {
        const m = obj as Mesh;
        if (m.geometry && !seen.has(m.geometry)) (seen.add(m.geometry), m.geometry.dispose());
      });
      mats.forEach((m) => m.dispose());
      player.dispose();
      islanders.forEach(({ e }) => e.dispose());
      (puffs.mesh.material as Material).dispose();
      ripples.material.dispose();
      sun.shadow.map?.dispose();
    },
  };
}

/** About how tall each kind of thing is, for its click box. */
function propHeight(p: Prop) {
  return { desk: 1.4, hearth: 2.8, frame: 1.2, board: 1.5, counter: 1.5, bookshelf: 3, cabinet: 2.2, lens: 2.8, cat: 0.7, globe: 1.5, scanner: 1.5, crates: 1.9 }[p];
}

/** One thing, built from the kit, standing at the origin facing +z. */
function buildProp(prop: Prop, place: Place, s: Spot, mat: <T extends Material>(m: T) => T, animated: ((t: number, dt: number) => void)[], calm: boolean): Group {
  const kit = new Kit(s.id.length * 13 + 1);
  const accent = place.color;
  const hw = s.hw * K;
  const hd = s.hd * K;
  const WOOD = '#b98352';
  const WOOD_LIGHT = '#d2a06a';
  const WOOD_DARK = '#8a5a36';
  const GOLD = '#f2c14e';
  const IRON = '#4a4540';
  const CREAM = '#fff3df';
  const group = new Group();
  // Wall things sit against the back wall: their z is the middle of their footprint.
  const wallZ = -hd + 0.05;
  switch (prop) {
    case 'desk': {
      if (place.archetype === 'schoolhouse') {
        for (const [x, z] of [[-1.3, -0.45], [0, -0.45], [1.3, -0.45], [-1.3, 0.75], [0, 0.75], [1.3, 0.75]]) {
          kit.box(1.0, 0.08, 0.6, WOOD_LIGHT, { p: [x, 0.72, z] });
          for (const lx of [-0.42, 0.42]) kit.box(0.07, 0.72, 0.07, WOOD_DARK, { p: [x + lx, 0.36, z + 0.2] });
          kit.box(0.5, 0.36, 0.04, IRON, { p: [x, 0.95, z - 0.15], r: [-0.3, 0, 0] });
          kit.addGlow(new BoxGeometry(0.42, 0.28, 0.02), (x + z) % 2 ? '#9cd2e8' : shade(accent, 0.2), { p: [x, 0.96, z - 0.12], r: [-0.3, 0, 0] });
        }
        break;
      }
      kit.box(hw * 2, 0.12, hd * 2, WOOD_LIGHT, { p: [0, 1.0, 0] });
      kit.box(hw * 2 - 0.1, 0.4, hd * 2 - 0.2, WOOD, { p: [0, 0.75, -0.05] });
      for (const x of [-hw + 0.12, hw - 0.12]) for (const z of [-hd + 0.12, hd - 0.12]) kit.box(0.1, 0.95, 0.1, WOOD_DARK, { p: [x, 0.47, z] });
      if (place.archetype === 'lighthouse') {
        kit.box(1.1, 0.06, 0.75, CREAM, { p: [-0.2, 1.09, 0], r: [0, 0.1, 0] });
        kit.box(0.04, 0.07, 0.75, '#e0d0b0', { p: [-0.2, 1.1, 0], r: [0, 0.1, 0] });
        kit.cyl(0.12, 0.16, 0.08, GOLD, { p: [0.8, 1.1, -0.1] });
        kit.addGlow(new CylinderGeometry(0.1, 0.1, 0.25, 8), '#ffe7a6', { p: [0.8, 1.26, -0.1] });
      } else {
        kit.box(0.8, 0.06, 0.55, accent, { p: [-0.1, 1.09, 0.05], r: [0, -0.15, 0] });
        kit.box(0.7, 0.07, 0.48, CREAM, { p: [-0.1, 1.11, 0.05], r: [0, -0.15, 0] });
        kit.cyl(0.025, 0.025, 0.6, GOLD, { p: [0.55, 1.1, 0.1], r: [0, 0, Math.PI / 2] });
        kit.cyl(0.1, 0.1, 0.14, IRON, { p: [0.9, 1.13, -0.2] });
        kit.cyl(0.06, 0.07, 0.3, CREAM, { p: [-0.9, 1.2, -0.25] });
        kit.addGlow(new CylinderGeometry(0.02, 0.04, 0.1, 6), '#ffd166', { p: [-0.9, 1.4, -0.25] });
      }
      break;
    }
    case 'counter': {
      kit.box(hw * 2, 1.0, hd * 2, WOOD_DARK, { p: [0, 0.5, 0] });
      kit.box(hw * 2 + 0.15, 0.1, hd * 2 + 0.2, WOOD_LIGHT, { p: [0, 1.05, 0] });
      for (let x = -hw + 0.3; x < hw - 0.1; x += 0.45) kit.box(0.05, 0.9, 0.04, '#6b4228', { p: [x, 0.5, hd + 0.01] });
      for (let x = -hw + 0.5; x < hw - 0.3; x += 0.55) {
        kit.cyl(0.04, 0.04, 0.4, GOLD, { p: [x, 1.3, -hd + 0.2] });
        kit.box(0.07, 0.07, 0.2, GOLD, { p: [x, 1.45, -hd + 0.3] });
        kit.cyl(0.05, 0.04, 0.2, x > 0 ? accent : IRON, { p: [x, 1.6, -hd + 0.2] });
      }
      kit.cyl(0.11, 0.1, 0.22, CREAM, { p: [-0.6, 1.21, 0.1] });
      kit.cyl(0.11, 0.1, 0.22, GOLD, { p: [0.7, 1.21, 0.15] });
      break;
    }
    case 'hearth': {
      const h = 2.6;
      kit.box(hw * 2, h, hd * 2, '#bdb5a8', { p: [0, h / 2, wallZ], jitter: 0.08 });
      kit.box(hw * 2 + 0.3, 0.14, hd * 2 + 0.25, WOOD_DARK, { p: [0, 1.55, wallZ + 0.1] });
      kit.box(hw * 1.1, 1.05, 0.1, '#2b1d17', { p: [0, 0.55, wallZ + hd + 0.01] });
      kit.box(hw * 2 + 0.2, 0.12, hd * 2 + 0.4, '#958c80', { p: [0, 0.06, wallZ + 0.15] });
      kit.sphere(0.2, IRON, { p: [0.25, 0.75, wallZ + hd - 0.2] });
      kit.cyl(0.02, 0.02, 0.4, IRON, { p: [0.25, 1.05, wallZ + hd - 0.2] });
      for (const x of [-0.3, 0, 0.3]) kit.cyl(0.07, 0.07, 0.7, '#6b4228', { p: [x, 0.12, wallZ + hd - 0.1], r: [0, 0.5, Math.PI / 2] });
      // The fire: two glowing cones that flicker.
      const fireMat = mat(new MeshBasicMaterial({ color: '#ff9f43' }));
      const fireCore = mat(new MeshBasicMaterial({ color: '#ffe27a' }));
      const f1 = new Mesh(new CylinderGeometry(0, 0.28, 0.6, 6), fireMat);
      const f2 = new Mesh(new CylinderGeometry(0, 0.16, 0.4, 6), fireCore);
      f1.position.set(-0.05, 0.45, wallZ + hd - 0.15);
      f2.position.set(0.05, 0.38, wallZ + hd - 0.1);
      group.add(f1, f2);
      const light = new PointLight('#ff9f43', 6, 6, 1.8);
      light.position.set(0, 0.7, wallZ + hd + 0.4);
      group.add(light);
      animated.push((t) => {
        if (calm) return;
        const k = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08;
        f1.scale.set(1, k, 1);
        f2.scale.set(1, 2 - k, 1);
        light.intensity = 5 + k * 2;
      });
      break;
    }
    case 'frame': {
      kit.box(hw * 2, 1.1, 0.08, GOLD, { p: [0, 2.1, wallZ] });
      kit.box(hw * 2 - 0.2, 0.9, 0.06, place.archetype === 'cabin' ? '#efe4cf' : CREAM, { p: [0, 2.1, wallZ + 0.03] });
      if (place.archetype === 'cabin') {
        kit.box(0.42, 0.78, 0.04, IRON, { p: [0, 2.1, wallZ + 0.06] });
        kit.box(0.34, 0.66, 0.04, CREAM, { p: [0, 2.1, wallZ + 0.07] });
        for (let i = 0; i < 5; i++) kit.box(0.16, 0.06, 0.03, i % 2 ? '#bdb5a8' : accent, { p: [i % 2 ? -0.06 : 0.06, 2.34 - i * 0.12, wallZ + 0.09] });
      } else if (place.archetype === 'depot') {
        kit.cyl(0.22, 0.22, 0.05, '#3f7fd6', { p: [0, 2.25, wallZ + 0.07], r: [Math.PI / 2, 0, 0] });
        kit.cyl(0.08, 0.08, 0.06, GOLD, { p: [0, 2.25, wallZ + 0.09], r: [Math.PI / 2, 0, 0] });
        for (const x of [-0.1, 0.1]) kit.box(0.09, 0.4, 0.03, '#3f7fd6', { p: [x, 1.9, wallZ + 0.07], r: [0, 0, x * 2] });
      } else {
        kit.box(0.04, 0.7, 0.03, IRON, { p: [-hw + 0.3, 2.1, wallZ + 0.07] });
        kit.box(hw * 2 - 0.5, 0.04, 0.03, IRON, { p: [0.05, 1.77, wallZ + 0.07] });
        for (let i = 0; i < 8; i++) kit.box(0.07, 0.07, 0.03, i % 3 ? accent : '#e5484d', { p: [-hw + 0.45 + ((i * 0.37) % (hw * 2 - 0.7)), 1.85 + ((i * 0.23) % 0.6), wallZ + 0.08] });
      }
      break;
    }
    case 'board': {
      kit.box(hw * 2, 1.45, 0.1, WOOD_DARK, { p: [0, 2.0, wallZ] });
      if (place.archetype === 'library') {
        kit.box(hw * 2 - 0.2, 1.25, 0.06, '#f6e7c4', { p: [0, 2.0, wallZ + 0.04] });
        kit.box(0.9, 0.5, 0.03, '#cfe0c0', { p: [-0.6, 2.0, wallZ + 0.07] });
        kit.box(1.0, 0.6, 0.03, '#cfe0c0', { p: [0.7, 1.95, wallZ + 0.07] });
        const pins = [[-1.8, 1.7], [-1.0, 2.3], [-0.2, 1.85], [0.6, 2.35], [1.6, 1.9]];
        for (let i = 0; i < pins.length - 1; i++) {
          const [ax, ay] = pins[i];
          const [bx, by] = pins[i + 1];
          const len = Math.hypot(bx - ax, by - ay);
          kit.box(len, 0.035, 0.02, '#e5484d', { p: [(ax + bx) / 2, (ay + by) / 2, wallZ + 0.1], r: [0, 0, Math.atan2(by - ay, bx - ax)] });
        }
        for (const [x, y] of pins) kit.sphere(0.06, GOLD, { p: [x, y, wallZ + 0.12] }, 6, 4);
      } else {
        kit.box(hw * 2 - 0.2, 1.25, 0.06, '#2f4a3c', { p: [0, 2.0, wallZ + 0.04] });
        for (let i = 0; i < 6; i++) {
          const len = (hw * 2 - 0.8) * (0.5 + ((i * 37) % 10) / 25);
          kit.box(len, 0.045, 0.02, '#eef3e8', { p: [-hw + 0.3 + len / 2, 2.5 - i * 0.18, wallZ + 0.08], jitter: 0 });
          if (place.archetype === 'taproom') kit.box(0.25 + (i % 3) * 0.08, 0.06, 0.02, i % 2 ? GOLD : accent, { p: [hw - 0.4, 2.5 - i * 0.18, wallZ + 0.08], jitter: 0 });
        }
        kit.box(hw * 2 - 0.2, 0.06, 0.15, WOOD_LIGHT, { p: [0, 1.32, wallZ + 0.08] });
      }
      break;
    }
    case 'bookshelf': {
      const h = 3.0;
      kit.box(hw * 2, h, hd * 2, WOOD_DARK, { p: [0, h / 2, wallZ] });
      kit.box(hw * 2 - 0.16, h - 0.16, 0.05, '#4a2f1e', { p: [0, h / 2, wallZ + hd - 0.05] });
      const SPINES = ['#c0392b', '#3a6fd8', '#2e9c8f', '#e9b949', '#7a4e2d', '#8e7cc3', '#4caf6a', '#f3e2c4'];
      let k = 0;
      for (let y = 0.25, row = 0; y < h - 0.4; y += 0.65, row++) {
        kit.box(hw * 2 - 0.1, 0.06, hd * 2 - 0.05, WOOD_LIGHT, { p: [0, y, wallZ] });
        // The shelf of lost words: mostly empty.
        const until = row === 2 ? -hw + 0.6 : hw - 0.15;
        for (let x = -hw + 0.15; x < until; ) {
          const bw = 0.09 + ((k * 7) % 5) * 0.025;
          const bh = 0.38 + ((k * 13) % 4) * 0.05;
          kit.box(bw, bh, hd * 2 - 0.3, SPINES[k % SPINES.length], { p: [x + bw / 2, y + 0.03 + bh / 2, wallZ + 0.05] });
          x += bw + 0.01;
          k++;
        }
      }
      break;
    }
    case 'cabinet': {
      const h = 2.0;
      kit.box(hw * 2, h, hd * 2, WOOD, { p: [0, h / 2, wallZ] });
      kit.box(hw * 2 + 0.1, 0.1, hd * 2 + 0.1, WOOD_DARK, { p: [0, h + 0.05, wallZ] });
      for (let y = 0.25; y < h - 0.1; y += 0.3) {
        for (let x = -hw + 0.22; x < hw - 0.1; x += 0.34) {
          kit.box(0.28, 0.24, 0.04, WOOD_LIGHT, { p: [x + 0.06, y + 0.06, wallZ + hd + 0.01] });
          kit.box(0.08, 0.03, 0.04, GOLD, { p: [x + 0.06, y + 0.06, wallZ + hd + 0.04] });
        }
      }
      break;
    }
    case 'lens': {
      kit.cyl(0.55, 0.7, 0.4, GOLD, { p: [0, 0.2, 0] });
      kit.cyl(0.3, 0.4, 0.6, '#c8952e', { p: [0, 0.7, 0] });
      kit.cyl(0.45, 0.45, 0.12, IRON, { p: [0, 2.75, 0] });
      kit.cone(0.3, 0.3, GOLD, { p: [0, 2.95, 0] });
      const lensMat = mat(new MeshStandardMaterial({ color: '#cfeefa', emissive: '#fff1b8', emissiveIntensity: 0.5, transparent: true, opacity: 0.8, roughness: 0.1, flatShading: true }));
      const glassG = new Group();
      for (let i = 0; i < 7; i++) {
        const y = 1.05 + i * 0.24;
        const r = 0.55 + Math.sin(((i + 0.5) / 7) * Math.PI) * 0.35;
        const m = new Mesh(new CylinderGeometry(r * 0.96, r, 0.2, 12), lensMat);
        m.position.y = y;
        glassG.add(m);
      }
      group.add(glassG);
      const glow = new Mesh(new CylinderGeometry(0.2, 0.2, 0.5, 8), mat(new MeshBasicMaterial({ color: '#fffbe6' })));
      glow.position.y = 1.75;
      group.add(glow);
      const light = new PointLight('#fff1b8', 8, 8, 1.6);
      light.position.y = 1.8;
      group.add(light);
      animated.push((t) => {
        if (!calm) glassG.rotation.y = t * 0.6;
      });
      break;
    }
    case 'cat': {
      kit.torus(0.42, 0.14, '#d9b77a', { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0] }, 6, 18);
      kit.cyl(0.36, 0.4, 0.1, '#c9a46c', { p: [0, 0.08, 0] });
      kit.sphere(0.36, '#f0913a', { p: [-0.05, 0.38, 0], s: [1.2, 0.75, 1] });
      kit.sphere(0.2, '#f0913a', { p: [0.32, 0.5, 0.15] });
      for (const z of [0.06, 0.24]) kit.cone(0.07, 0.15, '#f0913a', { p: [0.36, 0.7, z] }, 4);
      kit.box(0.04, 0.05, 0.12, '#3f7fd6', { p: [0.26, 0.38, 0.22] });
      kit.cyl(0.05, 0.06, 0.5, '#c46a24', { p: [-0.35, 0.3, 0.3], r: [0, 0.6, Math.PI / 2.3] });
      break;
    }
    case 'globe': {
      kit.cyl(0.3, 0.38, 0.08, WOOD_DARK, { p: [0, 0.04, 0] });
      kit.cyl(0.05, 0.05, 0.8, WOOD, { p: [0, 0.45, 0] });
      kit.torus(0.42, 0.03, GOLD, { p: [0, 1.15, 0], r: [0, 0, 0.4] }, 4, 20);
      const ball = new Group();
      const k2 = new Kit(5);
      k2.sphere(0.38, '#3f7fd6', {}, 12, 10);
      k2.ico(0.16, '#5cb85a', { p: [0.2, 0.12, 0.24] });
      k2.ico(0.14, '#5cb85a', { p: [-0.25, -0.05, 0.22] });
      k2.ico(0.12, '#5cb85a', { p: [0.05, 0.2, -0.3] });
      ball.add(k2.build({ castShadow: true }));
      ball.position.y = 1.15;
      ball.rotation.z = 0.4;
      group.add(ball);
      animated.push((t) => {
        if (!calm) ball.rotation.y = t * 0.4;
      });
      break;
    }
    case 'scanner': {
      kit.box(hw * 2, 0.1, hd * 2, WOOD_LIGHT, { p: [0, 0.95, 0] });
      for (const x of [-hw + 0.1, hw - 0.1]) for (const z of [-hd + 0.1, hd - 0.1]) kit.box(0.08, 0.95, 0.08, IRON, { p: [x, 0.47, z] });
      kit.box(hw * 2 - 0.2, 0.06, hd * 2 - 0.2, '#6d665e', { p: [0, 0.3, 0] });
      kit.box(0.5, 0.4, 0.4, '#d7a768', { p: [-0.9, 1.2, 0] });
      kit.box(0.35, 0.3, 0.3, '#7fb6d8', { p: [-0.35, 1.15, 0.05] });
      kit.box(0.45, 0.35, 0.35, '#d7a768', { p: [0.15, 1.17, -0.05] });
      kit.box(0.35, 0.18, 0.18, IRON, { p: [0.85, 1.3, 0] });
      kit.box(0.1, 0.3, 0.12, '#6d665e', { p: [0.78, 1.1, 0] });
      const dot = new Mesh(new BoxGeometry(0.05, 0.08, 0.1), mat(new MeshBasicMaterial({ color: '#ff3b30' })));
      dot.position.set(1.03, 1.3, 0);
      group.add(dot);
      animated.push((t) => {
        dot.visible = calm || Math.floor(t * 2) % 3 !== 0;
      });
      break;
    }
    case 'crates': {
      const bale = (x: number, y: number, z: number, w: number, h: number, d: number) => {
        kit.box(w, h, d, '#d7a768', { p: [x, y + h / 2, z], jitter: 0.05 });
        kit.box(0.03, h + 0.01, d + 0.01, '#8a6a3e', { p: [x, y + h / 2, z] });
      };
      bale(-0.45, 0, 0, 0.85, 0.6, hd * 2 - 0.1);
      bale(0.45, 0, 0.05, 0.85, 0.6, hd * 2 - 0.2);
      bale(-0.3, 0.6, 0, 0.8, 0.55, hd * 2 - 0.3);
      bale(0.5, 0.6, -0.05, 0.7, 0.5, hd * 2 - 0.3);
      bale(0.05, 1.15, 0, 0.8, 0.5, hd * 2 - 0.4);
      break;
    }
  }
  if (!kit.isEmpty()) group.add(kit.build({ castShadow: true, receiveShadow: true }));
  return group;
}
