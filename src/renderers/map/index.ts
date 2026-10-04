// The 2D map: the island as a little top-down pixel-art overworld. The
// ground is painted once into one canvas (terrain.ts); each frame blits the
// part in view into a small buffer at map resolution, draws the y-sorted
// sprites on top at whole map pixels, then scales the buffer up to the
// screen by a whole number of device pixels, so every map pixel stays a
// crisp square. Nothing in the frame loop allocates.

import type { RendererContext, RendererHandle } from '../types';
import { clampAxis, damp, pickScale } from './camera';
import { facingFor, paintExplorer, type Facing } from './explorer';
import { Fishing } from './fishing';
import { BODY_R, layoutPlaces, scatterProps, type MapPlace } from './layout';
import { createOverlay, type FishPrompt } from './overlay';
import { HEX } from './palette';
import { bayer } from './pixels';
import { findPath, nearestOpen, smooth, type Grid, type Pt } from './path';
import { crab, lampPost, paintLandmark, paintScenery, rowboat, scroll, shells, workshopCursor, type Landmark, type Sprite } from './sprites';
import { buildTerrain, RECT, TEX } from './terrain';
import { bus, drawTrain, shelter } from './commute';
import { daylight, pageClock } from '../../world/clock';
import { createTrain } from '../../world/train';

/** World units per second. */
const SPEED = 4.6;
/** World units walked per animation frame. */
const STRIDE = 0.55;
/** Map pixels per pathfinding cell (half a world unit). */
const CELL = 4;
/** How close to a door before its name tag pops up. */
const DOOR_RANGE = 1.6;
/** The camera's bounds: the island and a little sea. */
const VIEW = { x0: -29, z0: -31, x1: 40, z1: 33.5 };
/** Pixels the HUD covers along the top: the camera centres the explorer below it. */
const HUD_TOP = 70;

type Mode = 'play' | 'entering' | 'cheer';

/** Something drawn in the y-sorted pass, standing at (x, z). */
interface Thing {
  x: number;
  z: number;
  sprite: Sprite | null;
  /** Extra animated bits drawn after the sprite, at its base in buffer pixels. */
  after?: (c: CanvasRenderingContext2D, sx: number, sy: number) => void;
}

export async function mount(ctx: RendererContext): Promise<RendererHandle> {
  const { world, geo, store, host } = ctx;
  const motion = !ctx.reducedMotion;
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

  const root = document.createElement('div');
  root.className = 'map';
  host.append(root);
  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.append(canvas);
  const g = canvas.getContext('2d', { alpha: false })!;

  // ---------- The world, on the map ----------
  const places = layoutPlaces(world, geo);
  const byId = new Map(places.map((m) => [m.place.id, m]));
  const terrain = await buildTerrain(
    geo,
    places.filter((m) => m.spur.length).map((m) => m.spur),
  );
  const { W, H } = terrain;

  const art = new Map<string, Landmark>(places.map((m) => [m.place.id, paintLandmark(m.kind, m.place.color, Math.round(m.doorDx * TEX))]));
  const scenery = paintScenery();
  const props = scatterProps(world, geo, places);
  // Dressed in whatever the visitor picked from the wardrobe; repainted when that changes.
  const wornNow = () => world.outfits.filter((o) => store.state.progress.worn[o.slot] === o.id);
  let wornKey = wornNow().map((o) => o.id).join();
  let hero = paintExplorer(wornNow());
  const scrollArt = scroll();
  const crabArt = [crab(0), crab(1)];
  const pier = geo.pier;
  const pierPlace = places.find((m) => m.kind === 'postbox');
  const bottlePlace = places.find((m) => m.kind === 'bottle');
  const fishSpot = world.activities.find((a) => a.kind === 'fishing') ?? null;

  // ---------- Where you can stand ----------
  const blocked = terrain.solid.slice();
  const ti = (x: number) => Math.floor((x - RECT.x0) * TEX);
  const tj = (z: number) => Math.floor((z - RECT.z0) * TEX);
  const stampCircle = (x: number, z: number, r: number) => {
    for (let j = tj(z - r); j <= tj(z + r); j++) {
      for (let i = ti(x - r); i <= ti(x + r); i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const dx = RECT.x0 + (i + 0.5) / TEX - x;
        const dz = RECT.z0 + (j + 0.5) / TEX - z;
        if (dx * dx + dz * dz <= r * r) blocked[j * W + i] = 1;
      }
    }
  };
  for (const m of places) {
    for (const c of m.circles) stampCircle(c.x, c.z, c.r + BODY_R);
    for (const b of m.boxes) {
      for (let j = Math.max(0, tj(b.z0 - BODY_R)); j <= Math.min(H - 1, tj(b.z1 + BODY_R)); j++) {
        for (let i = Math.max(0, ti(b.x0 - BODY_R)); i <= Math.min(W - 1, ti(b.x1 + BODY_R)); i++) blocked[j * W + i] = 1;
      }
    }
  }
  for (const p of props) if (p.r) stampCircle(p.x, p.z, p.r + BODY_R * 0.5);
  const lampAt = { x: pier.x - pier.width / 2 + 0.25, z: pier.end - 3.4 };
  stampCircle(lampAt.x, lampAt.z, 0.15 + BODY_R * 0.5);
  // The bus on the quay and the station's shelter stand in the way too.
  const quay = geo.quay;
  const busAt = quay ? { x: quay.bus.x, z: quay.bus.z + 0.5 } : null;
  if (quay) for (const t of [-1.5, 0, 1.5]) stampCircle(quay.bus.x + Math.sin(quay.faces) * t, quay.bus.z + Math.cos(quay.faces) * t, 0.65 + BODY_R);
  const shelterAt = geo.station && geo.rail ? (() => {
    const at = geo.rail.at(geo.station.s);
    return { x: at.x + Math.cos(at.yaw) * at.out * 1.8, z: at.z - Math.sin(at.yaw) * at.out * 1.8 };
  })() : null;
  if (shelterAt) stampCircle(shelterAt.x, shelterAt.z, 0.6 + BODY_R);

  const canStand = (x: number, z: number) => {
    const i = ti(x);
    const j = tj(z);
    return i >= 0 && j >= 0 && i < W && j < H && blocked[j * W + i] === 0;
  };

  // A coarse grid for finding paths.
  const grid: Grid = { w: W / CELL, h: H / CELL, blocked: new Uint8Array((W / CELL) * (H / CELL)) };
  for (let cj = 0; cj < grid.h; cj++) {
    for (let ci = 0; ci < grid.w; ci++) grid.blocked[cj * grid.w + ci] = blocked[(cj * CELL + CELL / 2) * W + ci * CELL + CELL / 2];
  }
  const cellOf = (x: number, z: number): Pt => ({ x: Math.floor(((x - RECT.x0) * TEX) / CELL), y: Math.floor(((z - RECT.z0) * TEX) / CELL) });
  const cellCentre = (c: Pt) => ({ x: RECT.x0 + ((c.x + 0.5) * CELL) / TEX, z: RECT.z0 + ((c.y + 0.5) * CELL) / TEX });
  const clearWalk = (ax: number, az: number, bx: number, bz: number) => {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d * TEX * 2));
    for (let k = 0; k <= n; k++) if (!canStand(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  };

  /** A walkable route from here to there (in world units), or null. */
  function route(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
    if (canStand(toX, toZ) && clearWalk(fromX, fromZ, toX, toZ)) return [{ x: toX, z: toZ }];
    const s0 = cellOf(fromX, fromZ);
    const s = nearestOpen(grid, s0.x, s0.y, 3);
    const e0 = cellOf(toX, toZ);
    const e = nearestOpen(grid, e0.x, e0.y, 12);
    if (!s || !e) return null;
    const cells = findPath(grid, s.x, s.y, e.x, e.y);
    if (!cells) return null;
    const pts = smooth(cells, (a, b) => {
      const p = cellCentre(a);
      const q = cellCentre(b);
      return clearWalk(p.x, p.z, q.x, q.z);
    }).map(cellCentre);
    pts.shift(); // we're already (about) there
    const end = canStand(toX, toZ) && Math.hypot(toX - cellCentre(e).x, toZ - cellCentre(e).z) < 0.6 ? { x: toX, z: toZ } : null;
    if (end) pts.push(end);
    if (!pts.length) pts.push(cellCentre(e));
    return pts;
  }

  // ---------- What gets drawn, sorted by where it stands ----------
  const things: Thing[] = [];
  const landmarkThing = new Map<string, Thing>();
  for (const m of places) {
    const t: Thing = { x: m.base.x, z: m.base.z, sprite: art.get(m.place.id)!.sprite };
    landmarkThing.set(m.place.id, t);
    things.push(t);
  }
  for (const p of props) things.push({ x: p.x, z: p.z, sprite: scenery[p.kind][p.variant % scenery[p.kind].length] });
  const boat = rowboat(pierPlace?.place.color ?? HEX.sea);
  things.push({ x: pier.x + pier.width / 2 + 0.95, z: 22.4, sprite: boat });
  things.push({ x: lampAt.x, z: lampAt.z, sprite: lampPost() });
  if (busAt) things.push({ x: busAt.x, z: busAt.z, sprite: bus() });
  if (shelterAt) things.push({ x: shelterAt.x, z: shelterAt.z, sprite: shelter() });
  if (bottlePlace) things.push({ x: bottlePlace.base.x + 1.3, z: bottlePlace.base.z + 0.9, sprite: shells() });
  things.sort((a, b) => a.z - b.z);

  // Things that move: the explorer, the lost words, the crab. Re-sorted each frame (a handful).
  const words = world.lostWords.map((w) => ({ id: w.id, x: w.at.x, z: w.at.z, here: !store.has(w.id), phase: (w.at.x * 7.1 + w.at.z * 3.3) % 6.28 }));
  const wordThings: Thing[] = words.map((w) => ({ x: w.x, z: w.z, sprite: scrollArt }));
  const heroThing: Thing = { x: 0, z: 0, sprite: null };
  const crabThing: Thing = { x: 0, z: 0, sprite: null };
  const dynShown: Thing[] = [];

  // ---------- The explorer ----------
  const pos = { x: geo.spawn.x, z: geo.spawn.z };
  let facing: Facing = 'down';
  let walked = 0;
  let moving = false;
  let idleT = 0;
  let hopT = -1;
  // A real jump (Space, or tap the explorer): height in buffer pixels, a press
  // remembered for a moment before landing, and a puff of dust when you come down.
  const JUMP = motion ? { v: 118, g: 520 } : { v: 62, g: 520 };
  const jump = { y: 0, vy: 0, air: false, buffered: -1, landT: -1 };
  let mode: Mode = 'play';
  let modeT = 0;
  let cheerWord: string | null = null;
  let enteringId: string | null = null;
  let wiped = false;
  let pendingEnter: MapPlace | null = null;
  let path: { x: number; z: number }[] | null = null;
  let pathIx = 0;
  let stuckT = 0;
  let marker = { x: 0, z: 0, t: 1 };
  let movedOnce = false;

  const returning = ctx.returnTo ? byId.get(ctx.returnTo) ?? null : null;
  const stored = store.state.presence.pos;
  if (returning) {
    pos.x = returning.door.x;
    pos.z = returning.door.z;
    facing = 'down';
  } else if (stored && canStand(stored.x, stored.z)) {
    pos.x = stored.x;
    pos.z = stored.z;
  }
  let dismissed: string | null = returning?.place.id ?? null;

  // ---------- Overlay ----------
  const overlay = createOverlay(
    root,
    places.map((m) => m.place),
    ctx.touch,
    {
      enter: (id) => {
        const m = byId.get(id);
        if (m) activate(m);
      },
      go: (id) => {
        // From the list: straight in, no walking.
        const m = byId.get(id);
        if (!m) return;
        firstMove();
        ctx.go(id, clampToView(doorScreen(m)));
      },
      fish: () => fishAction(),
    },
  );

  // ---------- Camera and screen ----------
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let S = 2; // device pixels per map pixel
  const buf = document.createElement('canvas');
  const b = buf.getContext('2d')!;
  const bufN = document.createElement('canvas');
  const bN = bufN.getContext('2d')!;
  let bw = 1;
  let bh = 1;
  const cam = { x: pos.x, z: pos.z };
  /** The view's top-left, in map pixels (fractional), and the buffer's (whole). */
  let viewL = 0;
  let viewT = 0;
  let bufL = 0;
  let bufT = 0;

  function resize() {
    const r = root.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width));
    cssH = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    S = pickScale(cssW, cssH, dpr);
    bw = Math.ceil(canvas.width / S) + 2;
    bh = Math.ceil(canvas.height / S) + 2;
    for (const c of [buf, bufN]) {
      c.width = bw;
      c.height = bh;
    }
    g.imageSmoothingEnabled = false;
    b.imageSmoothingEnabled = false;
    bN.imageSmoothingEnabled = false;
  }
  resize();

  /** The camera's goal: the explorer, a little below the HUD's middle. */
  const camGoal = { x: 0, z: 0 };
  function aimCamera() {
    const halfW = canvas.width / S / TEX / 2;
    const halfH = canvas.height / S / TEX / 2;
    const lift = (HUD_TOP / 2) * (dpr / S) / TEX;
    camGoal.x = clampAxis(pos.x, halfW, VIEW.x0, VIEW.x1);
    camGoal.z = clampAxis(pos.z - lift, halfH, VIEW.z0, VIEW.z1);
  }
  aimCamera();
  cam.x = camGoal.x;
  cam.z = camGoal.z;

  /** A world point in CSS pixels (into `out`, so the frame loop can reuse one). */
  const toScreen = (x: number, z: number, out = { x: 0, y: 0 }) => {
    out.x = (((x - RECT.x0) * TEX - viewL) * S) / dpr;
    out.y = (((z - RECT.z0) * TEX - viewT) * S) / dpr;
    return out;
  };
  const scratch = { x: 0, y: 0 };
  const doorScreen = (m: MapPlace) => {
    const a = art.get(m.place.id)!;
    return toScreen(m.base.x + a.door.dx / TEX, m.base.z + a.door.dy / TEX);
  };
  const clampToView = (p: { x: number; y: number }) => ({ x: Math.min(cssW, Math.max(0, p.x)), y: Math.min(cssH, Math.max(0, p.y)) });
  const fromScreen = (cx: number, cy: number) => ({
    x: RECT.x0 + ((cx * dpr) / S + viewL) / TEX,
    z: RECT.z0 + ((cy * dpr) / S + viewT) / TEX,
  });

  // ---------- Input ----------
  const keys = new Set<string>();
  /** The direction the held keys add up to, worked out when they change (not every frame). */
  const held = { x: 0, z: 0 };
  function sumKeys() {
    held.x = 0;
    held.z = 0;
    for (const k of keys) {
      const m = MOVE[k];
      if (m) (held.x += m[0]), (held.z += m[1]);
    }
  }
  function clearKeys() {
    keys.clear();
    held.x = 0;
    held.z = 0;
  }
  const MOVE: Record<string, [number, number]> = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };
  const dialog = document.getElementById('w-dialog') as HTMLDialogElement | null;
  const busy = () => !!dialog?.open;
  const typing = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

  function firstMove() {
    if (movedOnce) return;
    movedOnce = true;
    ctx.firstMove();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement) || busy()) return;
    if (MOVE[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      sumKeys();
      path = null;
      pendingEnter = null;
      if (fishing.phase !== 'idle') fishing.cancel();
      firstMove();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const onControl = !!active && active !== document.body && (active.tagName === 'A' || active.tagName === 'BUTTON');
    if (e.code === 'KeyE' || ((e.key === 'Enter' || e.key === ' ') && fishing.phase !== 'idle')) {
      if (atFishing() || fishing.phase !== 'idle') {
        e.preventDefault();
        fishAction();
        return;
      }
    }
    // Space jumps (unless a button has focus, where it presses the button); Enter goes in.
    if (e.key === ' ' && !onControl) {
      e.preventDefault();
      if (!e.repeat) tryJump();
      return;
    }
    if (e.key === 'Enter' && !onControl && tagPlace) {
      e.preventDefault();
      enter(tagPlace);
    }
    if (e.key === 'Escape' && near) dismissed = near.place.id;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    // Let go early for a small hop.
    if (e.key === ' ' && jump.air && jump.vy > 0) jump.vy *= 0.45;
    keys.delete(e.code);
    sumKeys();
  };
  const onBlur = () => clearKeys();

  let press: { id: number; x: number; y: number; t: number } | null = null;
  const hitLandmark = (wx: number, wz: number): MapPlace | null => {
    const px = (wx - RECT.x0) * TEX;
    const pz = (wz - RECT.z0) * TEX;
    let best: MapPlace | null = null;
    let bestZ = -Infinity;
    for (const m of places) {
      const s = art.get(m.place.id)!.sprite;
      const lx = Math.floor(px - ((m.base.x - RECT.x0) * TEX - s.ax));
      const ly = Math.floor(pz - ((m.base.z - RECT.z0) * TEX - s.ay));
      if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h) continue;
      if (s.data[ly * s.w + lx] >>> 24 < 200) continue;
      if (m.base.z > bestZ) (best = m), (bestZ = m.base.z);
    }
    return best;
  };

  function walkTo(x: number, z: number, then: MapPlace | null = null) {
    const r = route(pos.x, pos.z, x, z);
    if (!r) return false;
    path = r;
    pathIx = 0;
    stuckT = 0;
    pendingEnter = then;
    const last = r[r.length - 1];
    marker = { x: last.x, z: last.z, t: 0 };
    return true;
  }

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0 || busy()) return;
    const r = canvas.getBoundingClientRect();
    const w = fromScreen(e.clientX - r.left, e.clientY - r.top);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    if (mode !== 'play') return;
    firstMove();
    if (fishing.phase !== 'idle') return fishAction();
    if (hitHero(w.x, w.z)) return tryJump();
    const m = hitLandmark(w.x, w.z);
    if (m) return activate(m);
    if (fishSpot && Math.hypot(w.x - fishSpot.at.x, w.z - fishSpot.at.z) < 0.9) {
      walkTo(fishSpot.at.x, fishSpot.at.z);
      return;
    }
    if (walkTo(w.x, w.z)) ctx.sound.play('tap');
  };
  let lastRetarget = 0;
  const onPointerMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const w = fromScreen(e.clientX - r.left, e.clientY - r.top);
    if (!press || e.pointerId !== press.id) {
      if (e.pointerType === 'mouse') canvas.style.cursor = mode === 'play' && hitLandmark(w.x, w.z) ? 'pointer' : '';
      return;
    }
    // Hold and drag to steer.
    const now = performance.now();
    if (mode === 'play' && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 16 && now - lastRetarget > 120) {
      lastRetarget = now;
      pendingEnter = null;
      walkTo(w.x, w.z);
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) press = null;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const ro = new ResizeObserver(() => resize());
  ro.observe(root);

  // ---------- Jumping ----------
  function tryJump() {
    if (mode !== 'play') return;
    firstMove();
    if (jump.air) return void (jump.buffered = 0.12);
    jump.air = true;
    jump.vy = JUMP.v;
    jump.buffered = -1;
    hopT = -1;
    ctx.sound.play('jump');
  }

  /** Is a world point on the explorer as drawn (with a little extra for fingers)? */
  function hitHero(wx: number, wz: number) {
    const pad = 3 / TEX;
    const top = pos.z - (hero.h + jump.y) / TEX - pad;
    return Math.abs(wx - pos.x) < hero.w / 2 / TEX + pad && wz > top && wz < pos.z + pad;
  }

  // ---------- Going in ----------
  function activate(m: MapPlace) {
    if (mode !== 'play') return;
    firstMove();
    if (Math.hypot(pos.x - m.door.x, pos.z - m.door.z) < DOOR_RANGE) return enter(m);
    if (walkTo(m.door.x, m.door.z, m)) ctx.sound.play('pop');
  }

  function enter(m: MapPlace) {
    if (mode !== 'play') return;
    mode = 'entering';
    modeT = 0;
    enteringId = m.place.id;
    wiped = false;
    path = null;
    pendingEnter = null;
    clearKeys();
    facing = 'up';
    hopT = 0;
    if (fishing.phase !== 'idle') fishing.cancel();
    ctx.sound.play('whoosh');
  }

  // ---------- Fishing ----------
  const fishing = new Fishing();
  const bobber = { x: 0, z: 0 };
  if (fishSpot) {
    bobber.x = pier.x - pier.width / 2 - 1.7;
    bobber.z = fishSpot.at.z + 0.2;
  }
  const atFishing = () => !!fishSpot && Math.hypot(pos.x - fishSpot.at.x, pos.z - fishSpot.at.z) < 0.95;

  function fishAction() {
    if (mode !== 'play' || !fishSpot) return;
    if (fishing.phase === 'idle') {
      if (!atFishing()) return void walkTo(fishSpot.at.x, fishSpot.at.z);
      path = null;
      facing = 'left';
      fishing.cast();
      ctx.sound.play('whoosh');
      return;
    }
    const r = fishing.pull();
    if (r === 'early') gotAway();
  }
  function gotAway() {
    ctx.ui.toast({ title: 'It got away', body: 'Cast again?' });
  }

  // ---------- Night ----------
  // Two things bring the dark, as on the 3D island: island time (the real
  // clock, or ?time=22:00) and the reward night for a full word hoard. The
  // map shows whichever is darker; the fireflies come out for the reward only.
  const clock = pageClock(location.search);
  let clockDark = 1 - daylight(clock.date());
  let commuting = clock.commute(clock.date());
  let clockAt = 0;
  const train = createTrain(geo);
  const darkness = () => Math.max(store.state.progress.night ? 1 : 0, clockDark);
  let nightK = darkness();
  let nightGoal = nightK;
  const unsub = store.subscribe((_state, events) => {
    nightGoal = darkness();
    if (events.some((e) => e.type === 'dressed') && wornNow().map((o) => o.id).join() !== wornKey) {
      wornKey = wornNow().map((o) => o.id).join();
      hero = paintExplorer(wornNow());
    }
    if (!motion) nightK = nightGoal;
    if (events.some((e) => e.type === 'found')) for (const w of words) w.here = !store.has(w.id) && w.id !== cheerWord;
    // A reset puts every word back where it was hidden.
    for (const w of words) if (!store.has(w.id) && w.id !== cheerWord) w.here = true;
  });

  // ---------- Presence ----------
  let near: MapPlace | null = null;
  /** The place whose name tag is showing (Enter goes in). */
  let tagPlace: MapPlace | null = null;
  let lastAt: string | null | undefined = undefined;
  let lastSent = 0;
  let sentX = NaN;
  let sentZ = NaN;
  function presence(now: number) {
    let at: string | null = near ? near.place.id : null;
    if (!at && Math.hypot(pos.x - geo.hub.at.x, pos.z - geo.hub.at.z) < 3.4) at = geo.hub.id;
    const changed = at !== lastAt;
    if (!changed && (now - lastSent < 250 || (pos.x === sentX && pos.z === sentZ))) return;
    lastAt = at;
    lastSent = now;
    sentX = pos.x;
    sentZ = pos.z;
    store.dispatch({ type: 'move', pos: { x: Math.round(pos.x * 100) / 100, z: Math.round(pos.z * 100) / 100 }, at });
  }

  // ---------- Update ----------
  const wish = { x: 0, z: 0 };
  function update(dt: number) {
    modeT += dt;
    if (hopT >= 0) {
      hopT += dt;
      if (hopT > 0.36) hopT = -1;
    }
    if (jump.air) {
      jump.vy -= JUMP.g * dt;
      jump.y += jump.vy * dt;
      if (jump.y <= 0) {
        jump.y = 0;
        jump.vy = 0;
        jump.air = false;
        jump.landT = 0;
        ctx.sound.play('step');
        if (jump.buffered >= 0) tryJump();
      }
    }
    if (jump.buffered >= 0 && (jump.buffered -= dt) < 0) jump.buffered = -1;
    if (jump.landT >= 0 && (jump.landT += dt) > 0.24) jump.landT = -1;
    if (marker.t < 1) marker.t = Math.min(1, marker.t + dt * 1.6);
    if (busy()) clearKeys();

    if (mode === 'entering') {
      if (!wiped && modeT > (motion ? 0.3 : 0)) {
        wiped = true;
        const m = byId.get(enteringId!)!;
        ctx.go(m.place.id, clampToView(doorScreen(m)));
      }
      moving = false;
      return;
    }
    if (mode === 'cheer') {
      moving = false;
      if (modeT > 0.9) {
        mode = 'play';
        const id = cheerWord!;
        cheerWord = null;
        ctx.ui.showWord(id);
      }
      return;
    }

    // Where the explorer wants to go.
    wish.x = held.x;
    wish.z = held.z;
    let speed = SPEED;
    if (wish.x || wish.z) {
      const l = Math.hypot(wish.x, wish.z);
      wish.x /= l;
      wish.z /= l;
    } else if (path) {
      const p = path[pathIx];
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        pathIx++;
        if (pathIx >= path.length) {
          path = null;
          const then = pendingEnter;
          pendingEnter = null;
          if (then && Math.hypot(pos.x - then.door.x, pos.z - then.door.z) < DOOR_RANGE) return enter(then);
        }
      } else {
        wish.x = dx / d;
        wish.z = dz / d;
        speed = Math.min(SPEED, (d / dt) * 0.98 + 0.01);
      }
    }

    moving = false;
    if (wish.x || wish.z) {
      const step = speed * dt;
      const ox = pos.x;
      const oz = pos.z;
      const nx = pos.x + wish.x * step;
      const nz = pos.z + wish.z * step;
      if (canStand(nx, nz)) (pos.x = nx), (pos.z = nz);
      else if (wish.x && canStand(nx, pos.z)) pos.x = nx;
      else if (wish.z && canStand(pos.x, nz)) pos.z = nz;
      const moved = Math.hypot(pos.x - ox, pos.z - oz);
      if (moved > 1e-4) {
        moving = true;
        const before = Math.floor(walked / STRIDE);
        walked += moved;
        // A soft step on each left footfall: often enough to feel, not to nag.
        const now = Math.floor(walked / STRIDE);
        if (now !== before && now % 4 === 1 && motion) ctx.sound.play('step');
        facing = facingFor(wish.x, wish.z, facing);
        if (fishing.phase !== 'idle' && !atFishing()) fishing.cancel();
      }
      if (path && moved < step * 0.3) {
        stuckT += dt;
        if (stuckT > 0.35) {
          // Nudged against something: try the next point, or give up.
          pathIx++;
          stuckT = 0;
          if (pathIx >= path.length) path = null;
        }
      } else stuckT = 0;
    }
    idleT = moving ? 0 : idleT + dt;

    // Lost words: walk over one to pick it up.
    for (const w of words) {
      if (!w.here || Math.hypot(pos.x - w.x, pos.z - w.z) > 0.6) continue;
      w.here = false;
      cheerWord = w.id;
      mode = 'cheer';
      modeT = 0;
      path = null;
      clearKeys();
      facing = 'down';
      if (fishing.phase !== 'idle') fishing.cancel();
      ctx.sound.play('chime');
      store.dispatch({ type: 'find', id: w.id });
      return;
    }

    // Fishing.
    const ev = fishing.update(dt);
    if (ev === 'plop') ctx.sound.play('pop');
    if (ev === 'bite') {
      ctx.sound.play('tap');
      ctx.ui.announce('Something is biting. Reel it in!');
    }
    if (ev === 'escaped') gotAway();
    if (ev === 'landed') {
      ctx.sound.play('chime');
      const r = store.fish();
      if (r) ctx.ui.showCatch(r.post.slug, r.fresh);
    }

    // Who's near?
    let best: MapPlace | null = null;
    let bestD = Infinity;
    for (const m of places) {
      const d = Math.min(Math.hypot(pos.x - m.door.x, pos.z - m.door.z), Math.hypot(pos.x - m.worldDoor.x, pos.z - m.worldDoor.z) + 0.3);
      if (d < DOOR_RANGE && d < bestD) (best = m), (bestD = d);
    }
    if (best !== near) {
      near = best;
      if (dismissed && dismissed !== near?.place.id) dismissed = null;
      if (near && near.place.id !== dismissed) {
        ctx.sound.play(near.kind === 'schoolhouse' ? 'bell' : 'pop');
        if (motion) hopT = 0;
        ctx.ui.announce(`${near.place.title}: ${near.place.name}. Press Enter to go in.`);
      }
    }
  }

  // ---------- Drawing ----------
  const shadowCv = (() => {
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 4;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(42,29,16,0.22)';
    x.fillRect(2, 0, 8, 4);
    x.fillRect(0, 1, 12, 2);
    return c;
  })();

  let night = false; // which pass is being drawn
  let time = 0;

  /** Buffer pixel of a world point. */
  const bx = (x: number) => Math.round((x - RECT.x0) * TEX) - bufL;
  const by = (z: number) => Math.round((z - RECT.z0) * TEX) - bufT;

  function drawSprite(c: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
    if (x - s.ax > bw || y - s.ay > bh || x - s.ax + s.w < 0 || y - s.ay + s.h < 0) return;
    c.drawImage(night ? s.night : s.day, x - s.ax, y - s.ay);
  }

  function drawHero(c: CanvasRenderingContext2D, ghost = false) {
    const x = bx(pos.x);
    const y = by(pos.z);
    const air = Math.round(jump.y);
    // The shadow stays on the ground and shrinks as you rise.
    if (!ghost) {
      const sw = 12 - 2 * Math.min(3, air >> 2);
      c.drawImage(shadowCv, x - (sw >> 1), y - 2, sw, air > 8 ? 3 : 4);
    }
    let lift = air;
    if (hopT >= 0) lift = Math.max(lift, Math.round(Math.sin((hopT / 0.36) * Math.PI) * 6));
    let img: HTMLCanvasElement;
    if (mode === 'cheer') {
      img = night ? hero.cheerNight : hero.cheer;
      lift = Math.max(air, Math.round(Math.min(1, modeT * 6) * 2));
    } else {
      const frames = night ? hero.framesNight[facing] : hero.frames[facing];
      let step = moving ? Math.floor(walked / STRIDE) % 4 : 0;
      if (!moving && motion && idleT > 0.4 && Math.floor(time * 1.6) % 3 === 2) step = 4;
      img = frames[step];
    }
    // Squash on landing, stretch on the way up: two pixels either way.
    const squash = motion && mode === 'play' ? (jump.landT >= 0 && jump.landT < 0.09 ? 2 : jump.air && jump.vy > JUMP.v * 0.6 ? -2 : 0) : 0;
    c.drawImage(img, x - ((hero.w + squash) >> 1), y - hero.h + squash + 1 - lift, hero.w + squash, hero.h - squash);
    if (ghost) return;
    if (motion && jump.landT >= 0) {
      const k = jump.landT / 0.24;
      const off = 4 + Math.round(k * 5);
      c.globalAlpha = 1 - k;
      c.fillStyle = night ? '#9aa3c4' : '#fbf1dc';
      c.fillRect(x - off - 2, y - 1 - Math.round(k * 2), 2, 1);
      c.fillRect(x + off, y - 1 - Math.round(k * 2), 2, 1);
      c.globalAlpha = 1;
    }
    if (mode === 'cheer') {
      // The found word, held up high, with a twinkle.
      const k = Math.min(1, modeT * 5);
      const sy = y - hero.h - 6 - Math.round(k * 3) - lift;
      c.drawImage(night ? scrollArt.night : scrollArt.day, x - scrollArt.ax, sy - scrollArt.ay + 6);
      sparkle(c, x + 6, sy - 2, time * 3);
      sparkle(c, x - 7, sy + 1, time * 3 + 1.7);
    }
    if (fishing.phase !== 'idle') drawRod(c, x, y - lift);
  }

  function sparkle(c: CanvasRenderingContext2D, x: number, y: number, phase: number) {
    const k = (Math.sin(phase) + 1) / 2;
    if (k < 0.25) return;
    c.fillStyle = '#fffbe0';
    c.fillRect(x, y, 1, 1);
    if (k > 0.6) {
      c.fillRect(x - 1, y, 1, 1);
      c.fillRect(x + 1, y, 1, 1);
      c.fillRect(x, y - 1, 1, 1);
      c.fillRect(x, y + 1, 1, 1);
    }
  }

  function drawRod(c: CanvasRenderingContext2D, x: number, y: number) {
    // The rod, held out over the water to the west.
    c.fillStyle = '#7d5134';
    for (let i = 0; i < 9; i++) c.fillRect(x - 5 - i, y - 7 - Math.floor(i * 0.8), 1, 1);
    const tipX = x - 13;
    const tipY = y - 14;
    // The bobber, in flight or on the water.
    const ph = fishing.phase;
    const k = ph === 'cast' ? fishing.t / 0.55 : ph === 'reel' ? 1 - fishing.t / 0.6 : 1;
    const ex = bx(bobber.x);
    const ey = by(bobber.z);
    const fx = Math.round(tipX + (ex - tipX) * k);
    let fy = Math.round(tipY + (ey - tipY) * k - Math.sin(k * Math.PI) * 10);
    const nib = fishing.nibble();
    if (ph === 'wait' && nib >= 0) fy += Math.round(Math.sin(nib * Math.PI * 4));
    const dunk = ph === 'bite';
    // The line: a gentle sag from the rod tip to the bobber.
    c.fillStyle = night ? 'rgba(220,230,255,0.5)' : 'rgba(255,255,255,0.75)';
    const n = Math.max(4, Math.abs(fx - tipX));
    for (let i = 1; i < n; i++) {
      const u = i / n;
      c.fillRect(Math.round(tipX + (fx - tipX) * u), Math.round(tipY + (fy - tipY) * u + Math.sin(u * Math.PI) * (ph === 'wait' ? 3 : 1)), 1, 1);
    }
    if (dunk) {
      // Just a ripple where it went under.
      c.fillStyle = '#e8fbff';
      c.fillRect(fx - 2, fy + 1, 1, 1);
      c.fillRect(fx + 2, fy + 1, 1, 1);
      c.fillRect(fx - 1, fy + 2, 3, 1);
      // And a "!" over the explorer.
      c.fillStyle = HEX.ink;
      c.fillRect(x - 1, y - 27, 3, 6);
      c.fillRect(x - 1, y - 20, 3, 2);
      c.fillStyle = '#ffe27a';
      c.fillRect(x, y - 26, 1, 4);
      c.fillRect(x, y - 19, 1, 1);
    } else {
      c.fillStyle = '#ffffff';
      c.fillRect(fx - 1, fy - 1, 3, 1);
      c.fillStyle = '#ff5a36';
      c.fillRect(fx - 1, fy, 3, 2);
      if (ph === 'wait' && Math.floor(fishing.t * 1.2) % 2 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillRect(fx - 3, fy + 2, 2, 1);
        c.fillRect(fx + 2, fy + 2, 2, 1);
      }
    }
  }

  /** The visible slice of a row-sorted site list, written to `range` as [first, end). */
  const range = new Int32Array(2);
  function rowRange(sites: Uint16Array, y0: number, y1: number) {
    const n = sites.length / 3;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sites[m * 3 + 1] < y0) lo = m + 1;
      else hi = m;
    }
    range[0] = lo;
    hi = n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sites[m * 3 + 1] < y1) lo = m + 1;
      else hi = m;
    }
    range[1] = lo;
  }

  const GLINT_LEN = [1, 2, 3, 2];
  function drawWater(c: CanvasRenderingContext2D) {
    // Foam: the lapping line breathes, the wave behind it comes and goes.
    const foam = terrain.foam(night);
    const fa = foam[0];
    const fb = foam[1];
    const s = motion ? Math.sin(time * 1.7) : 0.6;
    c.globalAlpha = motion ? 0.65 + 0.35 * s : 1;
    c.drawImage(fa, bufL, bufT, bw, bh, 0, 0, bw, bh);
    c.globalAlpha = motion ? Math.max(0, -Math.sin(time * 1.7 + 0.9)) * 0.9 : 0.5;
    if (c.globalAlpha > 0.02) c.drawImage(fb, bufL, bufT, bw, bh, 0, 0, bw, bh);
    c.globalAlpha = 1;
    // Glints on the open sea.
    rowRange(terrain.glints, bufT, bufT + bh);
    const g0 = range[0];
    const g1 = range[1];
    const sites = terrain.glints;
    c.fillStyle = night ? '#4c6c9a' : HEX.wave;
    for (let k = g0; k < g1; k++) {
      const x = sites[k * 3] - bufL;
      if (x < -3 || x > bw) continue;
      const ph = motion ? (time * 0.45 + sites[k * 3 + 2] / 256) % 1 : sites[k * 3 + 2] / 256;
      if (ph > 0.4) continue;
      const len = GLINT_LEN[Math.floor((ph / 0.4) * 4)];
      c.fillRect(x - (len >> 1), sites[k * 3 + 1] - bufT, len, 1);
    }
    if (!night) return;
    // Stars on the water.
    rowRange(terrain.stars, bufT, bufT + bh);
    const s0 = range[0];
    const s1 = range[1];
    const st = terrain.stars;
    c.fillStyle = HEX.star;
    for (let k = s0; k < s1; k++) {
      const x = st[k * 3] - bufL;
      if (x < -2 || x > bw) continue;
      const tw = motion ? Math.sin(time * (1.3 + (st[k * 3 + 2] & 7) * 0.2) + st[k * 3 + 2]) : 0.5;
      if (tw < -0.2) continue;
      const y = st[k * 3 + 1] - bufT;
      c.fillRect(x, y, 1, 1);
      if (tw > 0.85) {
        c.fillRect(x - 1, y, 3, 1);
        c.fillRect(x, y - 1, 1, 3);
      }
    }
  }

  // Fireflies at night: drifting round the trees.
  const flies = props
    .filter((p) => p.kind === 'tree' || p.kind === 'bush' || p.kind === 'pine')
    .filter((_, i) => i % 3 === 0)
    .slice(0, 40)
    .map((p, i) => ({ x: p.x, z: p.z - 0.6, a: 0.6 + (i % 5) * 0.13, b: 0.5 + (i % 3) * 0.17, ph: i * 1.7 }));
  function drawFlies(c: CanvasRenderingContext2D) {
    for (const f of flies) {
      const x = bx(f.x + Math.sin(time * f.a + f.ph) * 1.2);
      const y = by(f.z + Math.cos(time * f.b + f.ph * 0.7) * 0.8) - 8;
      if (x < -2 || y < -2 || x > bw + 2 || y > bh + 2) continue;
      const blink = motion ? Math.sin(time * 2.1 + f.ph) : 1;
      if (blink < -0.1) continue;
      c.fillStyle = 'rgba(255,236,140,0.35)';
      c.fillRect(x - 1, y, 3, 1);
      c.fillRect(x, y - 1, 1, 3);
      c.fillStyle = '#fff7b0';
      c.fillRect(x, y, 1, 1);
    }
  }

  // Pools of lamplight on the ground at night: by every lit door, and under the pier lamp.
  const pool = (() => {
    const w = 44;
    const h = 18;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d')!;
    const img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const d = Math.hypot((i + 0.5 - w / 2) / (w / 2), (j + 0.5 - h / 2) / (h / 2));
        // Two dithered rings, brighter in the middle: no smooth gradients in pixel art.
        const k = d < 0.55 ? 2 : d < 1 && bayer(i, j) > (d - 0.55) / 0.45 ? 1 : 0;
        const o = (j * w + i) * 4;
        img.data[o] = 120;
        img.data[o + 1] = 82;
        img.data[o + 2] = 26;
        img.data[o + 3] = k === 2 ? 185 : k ? 110 : 0;
      }
    }
    x.putImageData(img, 0, 0);
    return cv;
  })();
  const pools = places
    .filter((m) => m.kind !== 'tree' && m.kind !== 'bottle' && m.kind !== 'postbox')
    .map((m) => ({ x: m.base.x + m.doorDx, z: m.base.z + 0.5 }));
  pools.push({ x: lampAt.x + 0.3, z: lampAt.z + 0.2 });
  function drawPools(c: CanvasRenderingContext2D) {
    c.globalCompositeOperation = 'lighter';
    const flicker = motion ? 0.9 + Math.sin(time * 7.3) * 0.04 + Math.sin(time * 2.1) * 0.06 : 1;
    c.globalAlpha = flicker;
    for (const p of pools) {
      const x = bx(p.x) - (pool.width >> 1);
      const y = by(p.z) - (pool.height >> 1);
      if (x > bw || y > bh || x + pool.width < 0 || y + pool.height < 0) continue;
      c.drawImage(pool, x, y);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function drawLighthouseBeam(c: CanvasRenderingContext2D) {
    const lh = places.find((m) => m.kind === 'lighthouse');
    if (!lh) return;
    const x = bx(lh.base.x);
    const y = by(lh.base.z) - 53;
    const a = motion ? time * 0.6 : 2.4;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,236,160,0.10)';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a - 0.14) * 150, y + Math.sin(a - 0.14) * 75);
    c.lineTo(x + Math.cos(a + 0.14) * 150, y + Math.sin(a + 0.14) * 75);
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }

  /** Little animated extras on the landmarks. */
  const cabin = places.find((m) => m.kind === 'cabin');
  if (cabin) {
    const t = landmarkThing.get(cabin.place.id)!;
    const a = art.get(cabin.place.id)!.sprite;
    t.after = (c, sx, sy) => {
      if (!motion) return;
      // Chimney smoke: three puffs rising and drifting east.
      c.fillStyle = night ? '#7d86a8' : '#f6f2ee';
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.35 + i / 3) % 1;
        const px = sx - a.ax + 38 + Math.round(k * 6);
        const py = sy - a.ay - Math.round(k * 14);
        const r = k < 0.35 ? 2 : 3;
        c.globalAlpha = (1 - k) * 0.8;
        c.fillRect(px, py, r, r);
      }
      c.globalAlpha = 1;
    };
  }
  const depot = places.find((m) => m.kind === 'depot');
  const ITEMS = ['#c8a172', '#7fd3b0', '#e5484d', '#fff3df'];
  if (depot) {
    const t = landmarkThing.get(depot.place.id)!;
    const a = art.get(depot.place.id)!.sprite;
    t.after = (c, sx, sy) => {
      for (let i = 0; i < 4; i++) {
        const k = motion ? (time * 0.12 + i / 4) % 1 : i / 4;
        const px = sx - a.ax + 7 + Math.round(k * 40);
        c.fillStyle = ITEMS[i];
        c.fillRect(px, sy + 1 - (i % 2), 3, 2 + (i % 2));
      }
    };
  }

  const workshop = places.find((m) => m.kind === 'workshop');
  if (workshop) {
    const t = landmarkThing.get(workshop.place.id)!;
    const cur = workshopCursor(Math.round(workshop.doorDx * TEX));
    t.after = (c, sx, sy) => {
      // The cursor on the monitor, blinking (steady when motion is reduced).
      if (motion && Math.floor(time * 1.8) % 2) return;
      c.fillStyle = '#eafff3';
      c.fillRect(sx + cur.dx, sy + cur.dy, 2, 1);
    };
  }

  function drawScene(c: CanvasRenderingContext2D) {
    c.fillStyle = night ? '#0e2240' : HEX.deep;
    c.fillRect(0, 0, bw, bh);
    c.drawImage(night ? terrain.night() : terrain.day, bufL, bufT, bw, bh, 0, 0, bw, bh);
    drawWater(c);
    if (night) drawPools(c);
    if (train.exists) drawTrain(c, train.cars(), bx, by, TEX, night);

    // The click marker: a ring that shrinks into the ground.
    if (marker.t < 1) {
      const x = bx(marker.x);
      const y = by(marker.z);
      const r = Math.round(4 - marker.t * 3);
      c.fillStyle = marker.t < 0.6 || Math.floor(marker.t * 20) % 2 ? '#fffaf0' : 'transparent';
      c.fillRect(x - r, y, 2 * r + 1, 1);
      c.fillRect(x, y - r + 1, 1, 2 * r - 1);
    }

    // Everything that stands up, back to front.
    const t = time;
    heroThing.x = pos.x;
    heroThing.z = pos.z + 0.01;
    if (bottlePlace) {
      crabThing.x = bottlePlace.base.x - 1.6 + (motion ? Math.sin(t * 0.7) * 0.9 : 0);
      crabThing.z = bottlePlace.base.z + 0.8;
      crabThing.sprite = crabArt[motion && Math.cos(t * 0.7) !== 0 ? Math.floor(t * 5) % 2 : 0];
    }
    dynShown.length = 0;
    dynShown.push(heroThing);
    if (bottlePlace) dynShown.push(crabThing);
    for (let i = 0; i < words.length; i++) if (words[i].here) dynShown.push(wordThings[i]);
    // Insertion sort: a handful of items, no allocation.
    for (let i = 1; i < dynShown.length; i++) {
      const v = dynShown[i];
      let j = i - 1;
      while (j >= 0 && dynShown[j].z > v.z) {
        dynShown[j + 1] = dynShown[j];
        j--;
      }
      dynShown[j + 1] = v;
    }
    let di = 0;
    for (let i = 0; i <= things.length; i++) {
      const s = i < things.length ? things[i] : null;
      while (di < dynShown.length && (!s || dynShown[di].z <= s.z)) drawThing(c, dynShown[di++]);
      if (s) drawThing(c, s);
    }
    // A ghost of the explorer over everything, so you can still see yourself
    // behind a roof or a tree (where nothing covers you it changes nothing).
    c.globalAlpha = 0.4;
    drawHero(c, true);
    c.globalAlpha = 1;
    if (night) {
      if (store.state.progress.night) drawFlies(c);
      drawLighthouseBeam(c);
    }
  }

  function drawThing(c: CanvasRenderingContext2D, th: Thing) {
    if (th === heroThing) return drawHero(c);
    const x = bx(th.x);
    let y = by(th.z);
    if (th.sprite === scrollArt) {
      // A lost word: a gentle bob and the odd twinkle.
      const w = words[wordThings.indexOf(th)];
      if (motion && Math.sin(time * 2.4 + w.phase) > 0.3) y -= 1;
      drawSprite(c, scrollArt, x, y);
      if (motion) sparkle(c, x + 4, y - 7, time * 2.2 + w.phase * 3);
      return;
    }
    if (th.sprite) drawSprite(c, th.sprite, x, y);
    th.after?.(c, x, y);
  }

  // ---------- Frame ----------
  let raf = 0;
  let running = false;
  let last = performance.now();
  let frames = 0;
  let readied = false;

  function render() {
    // The camera: eased toward the explorer (or snapped, with reduced motion).
    aimCamera();
    const viewWpx = canvas.width / S;
    const viewHpx = canvas.height / S;
    viewL = (cam.x - RECT.x0) * TEX - viewWpx / 2;
    viewT = (cam.z - RECT.z0) * TEX - viewHpx / 2;
    bufL = Math.floor(viewL);
    bufT = Math.floor(viewT);
    const ox = -Math.round((viewL - bufL) * S);
    const oy = -Math.round((viewT - bufT) * S);

    if (nightK < 1) {
      night = false;
      drawScene(b);
      g.globalAlpha = 1;
      g.drawImage(buf, 0, 0, bw, bh, ox, oy, bw * S, bh * S);
    }
    if (nightK > 0) {
      night = true;
      drawScene(bN);
      g.globalAlpha = nightK;
      g.drawImage(bufN, 0, 0, bw, bh, ox, oy, bw * S, bh * S);
      g.globalAlpha = 1;
    }

    // HTML bits follow the map. On the pier the door and the fishing spot
    // are close: only the nearer one gets a prompt.
    let fp: FishPrompt = null;
    if (mode === 'play' && fishSpot) {
      if (fishing.phase === 'bite') fp = 'bite';
      else if (fishing.phase === 'cast' || fishing.phase === 'wait') fp = 'wait';
      else if (fishing.phase === 'idle' && atFishing()) fp = 'cast';
    }
    let tagFor = mode !== 'cheer' && near && near.place.id !== dismissed ? near : null;
    if (tagFor && fp && (fp !== 'cast' || Math.hypot(pos.x - fishSpot!.at.x, pos.z - fishSpot!.at.z) < Math.hypot(pos.x - tagFor.door.x, pos.z - tagFor.door.z))) tagFor = null;
    if (tagFor && fp === 'cast') fp = null;
    tagPlace = tagFor;
    if (tagFor) {
      const a = art.get(tagFor.place.id)!;
      const p = toScreen(tagFor.base.x, tagFor.base.z - (a.sprite.ay - a.top) / TEX, scratch);
      overlay.tag(tagFor.place, p.x, p.y);
    } else overlay.tag(null);
    if (fp) {
      const p = toScreen(pos.x, pos.z - 2.3, scratch);
      overlay.fish(fp, p.x, p.y);
    } else overlay.fish(null);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    frames++;
    time += dt;
    if (window.devicePixelRatio !== dpr && Math.min(window.devicePixelRatio, 3) !== dpr) resize();
    update(dt);
    if (now - clockAt > 1000) {
      clockAt = now;
      const d = clock.date();
      clockDark = 1 - daylight(d);
      commuting = clock.commute(d);
      nightGoal = darkness();
    }
    train.update(dt, commuting, pos);
    nightK = motion ? Math.max(0, Math.min(1, nightK + Math.max(-dt * 1.6, Math.min(dt * 1.6, nightGoal - nightK)))) : nightGoal; // eases to a goal that can be anywhere in 0..1 at dusk
    aimCamera();
    if (motion) {
      cam.x = damp(cam.x, camGoal.x, 5, dt);
      cam.z = damp(cam.z, camGoal.z, 5, dt);
    } else {
      cam.x = camGoal.x;
      cam.z = camGoal.z;
    }
    render();
    presence(now);
    if (!readied) {
      readied = true;
      ctx.ready(returning ? clampToView(doorScreen(returning)) : undefined);
    }
  }

  // First frame right away, so the loader can go.
  render();
  presence(performance.now());
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  start();

  if (debug) {
    (window as unknown as { __map?: unknown }).__map = {
      player: () => ({ x: pos.x, z: pos.z, air: jump.y }),
      teleport: (x: number, z: number) => {
        pos.x = x;
        pos.z = z;
        path = null;
        aimCamera();
        cam.x = camGoal.x;
        cam.z = camGoal.z;
      },
      screen: (id: string) => {
        const m = byId.get(id);
        return m ? doorScreen(m) : null;
      },
      walkTo: (x: number, z: number) => walkTo(x, z),
      near: () => near?.place.id ?? null,
      mode: () => mode,
      fishing: () => fishing.phase,
      frames: () => frames,
      scale: () => ({ S, dpr, bw, bh }),
      places: () => places.map((m) => ({ id: m.place.id, door: m.door, worldDoor: m.worldDoor, base: m.base })),
      canStand,
      /** Every sprite, big, on a sheet over the page (for reviewing the art). */
      sheet: (zoom = 4, nightToo = false) => {
        const all: HTMLCanvasElement[] = [];
        for (const a of art.values()) all.push(a.sprite.day);
        for (const k of Object.values(scenery)) for (const s of k) all.push(s.day);
        all.push(boat.day, scrollArt.day, crabArt[0].day, crabArt[1].day);
        for (const f of ['down', 'up', 'left', 'right'] as Facing[]) all.push(...hero.frames[f]);
        all.push(hero.cheer);
        if (nightToo) for (const a of art.values()) all.push(a.sprite.night);
        const sheet = document.createElement('canvas');
        sheet.width = innerWidth;
        sheet.height = innerHeight;
        sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#7fcf6a;image-rendering:pixelated';
        const c = sheet.getContext('2d')!;
        c.imageSmoothingEnabled = false;
        let x = 4;
        let y = 4;
        let row = 0;
        for (const cv of all) {
          if (x + cv.width * zoom > sheet.width) (x = 4), (y += row + 4), (row = 0);
          c.drawImage(cv, x, y, cv.width * zoom, cv.height * zoom);
          x += cv.width * zoom + 4;
          row = Math.max(row, cv.height * zoom);
        }
        document.body.append(sheet);
      },
    };
  }

  let destroyed = false;
  return {
    pause: stop,
    resume: () => {
      if (!document.hidden && !destroyed) start();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      unsub();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      overlay.destroy();
      root.remove();
      if (debug) delete (window as unknown as { __map?: unknown }).__map;
    },
  };
}
