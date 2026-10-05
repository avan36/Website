// The 2D map: the island as a little top-down pixel-art overworld. The
// ground is painted once into one canvas (terrain.ts); each frame blits the
// part in view into a small buffer at map resolution, draws the y-sorted
// sprites on top at whole map pixels, then scales the buffer up to the
// screen by a whole number of device pixels, so every map pixel stays a
// crisp square. Nothing in the frame loop allocates.
//
// The sea is part of the map: walk into the shallows and you wade, further
// out you swim, as far as the drop-off where the open sea begins (geo.ts
// says where, for every view). Past the painted map the open sea carries on,
// glints and all, so the edge of the world is never in view.

import { SWIM_REACH } from '../../world/geo';
import type { Place } from '../../world/schema';
import { PORTAL_COLOR, PORTAL_NEXT, portalExit, portalOf } from '../portal';
import type { RendererContext, RendererHandle, ViewId } from '../types';
import { between, clampAxis, damp, ease, frameOn, pickScale, roomArea, type View } from './camera';
import { facingFor, paintExplorer, type Facing } from './explorer';
import { Fishing } from './fishing';
import { createBoatCard } from './boat';
import { boatOf } from '../boat';
import { createMapGames } from './minigames';
import { createMapWanderers } from './wanderers';
import { layoutFossHill } from './fossHill';
import { createMapGates } from './gate';
import { isGame } from '../games/catalog';
import { BODY_R, HALF_WIDTH, layoutPlaces, layoutStreet, scatterProps, type MapPlace } from './layout';
import { createOverlay, type FishPrompt } from './overlay';
import { HEX } from './palette';
import { bayer, col, nightColor, toHex } from './pixels';
import { findPath, nearestOpen, smooth, type Grid, type Pt } from './path';
import { hash2 } from './rng';
import { crab, lampPost, paintLandmark, paintScenery, portal as paintPortal, rowboat, scroll, shells, workshopCursor, type Landmark, type Sprite } from './sprites';
import { buildTerrain, RECT, TEX } from './terrain';
import { paintTowerBridge, planTowerBridge } from './towerBridge';
import { bench, phoneBox, pillarBox, streetLamp } from './street';
import { createInside, fitFrame, openRect, type Frame, type Inside } from './inside';
import { paintRoom, type MapRoom } from './room';
import { bus, drawTrain, shelter } from './commute';
import { daylight, pageClock } from '../../world/clock';
import { createTrain } from '../../world/train';
import { holdable } from '../hold';

/** World units per second. */
const SPEED = 4.6;
/** World units walked per animation frame. */
const STRIDE = 0.55;
/** Map pixels per pathfinding cell (half a world unit). */
const CELL = 4;
/** How close to a door before its name tag pops up. */
const DOOR_RANGE = 1.6;
/** Pixels the HUD covers along the top: the camera centres the explorer below it. */
const HUD_TOP = 70;
/** Running (Shift, or double-click where to go): how much faster, on land and in the water. */
const RUN = 2.3;
const RUN_WET = 1.5;
/** Speed in the water, against walking: wading through the shallows, swimming further out. */
const WADE = 0.78;
const SWIM = 0.6;
/** Rows of the explorer that show above the water when swimming (sprout to scarf). */
const SWIM_ROWS = 11;
/** Turning round in a double jump's spin, a quarter at a time. */
const SPIN: Facing[] = ['down', 'left', 'up', 'right'];
/** The water's own colors round a swimmer, by day and by night. */
const nightHex = (hex: string) => toHex(nightColor(col(hex)));
const FOAM = [HEX.foam, nightHex(HEX.foam)];
const FOAM2 = [HEX.foam2, nightHex(HEX.foam2)];
const UNDER = [HEX.sea, nightHex(HEX.sea)];
const DEEP = [HEX.deep, nightHex(HEX.deep)];

/** 'inside': in a building's room; 'door': the building opening up round you on the way in, or closing behind you on the way out. */
type Mode = 'play' | 'entering' | 'cheer' | 'portal' | 'inside' | 'door';

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
  // Little London's street: the path from Tower Bridge to the mall, its lamps, the telephone box.
  const street = layoutStreet(geo, places);
  const paintT0 = performance.now();
  const terrain = await buildTerrain(geo, [...places.filter((m) => m.spur.length).map((m) => m.spur), ...(street ? [street.walk] : [])]);
  const { W, H } = terrain;
  /** How long the ground took to paint, in ms (for the debug handle). */
  const paintMs = performance.now() - paintT0;

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
  const portal = portalOf(world);
  const portalArt = paintPortal();
  /** Where the portal leads this time: picked from its menu as you step up. */
  let portalTo: ViewId = PORTAL_NEXT.map;
  /** The portal's name tag, as if it were a place. */
  const portalTag = { id: 'portal', title: 'Step through', name: 'The portal', color: PORTAL_COLOR } as Place;

  // The camera's bounds: the island and the water you can swim in, with a little to spare.
  const VIEW = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  // (Every island's: the islets off the west coast too.)
  for (const s of geo.islands) {
    for (let a = 0; a < 180; a++) {
      const th = (a / 180) * Math.PI * 2;
      const r = s.coast(th) + SWIM_REACH;
      VIEW.x0 = Math.min(VIEW.x0, s.x + Math.cos(th) * r - 1.5);
      VIEW.x1 = Math.max(VIEW.x1, s.x + Math.cos(th) * r + 1.5);
      VIEW.z0 = Math.min(VIEW.z0, s.z + Math.sin(th) * r - 1.5);
      VIEW.z1 = Math.max(VIEW.z1, s.z + Math.sin(th) * r + 3);
    }
  }

  // ---------- Where you can be ----------
  // 0 open (land, the pier deck, the swimming water), 1 blocked, 2 the water
  // hugging the pier: you only cross it in the air, jumping off the deck.
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
  const stampBox = (x0: number, z0: number, x1: number, z1: number) => {
    for (let j = Math.max(0, tj(z0 - BODY_R)); j <= Math.min(H - 1, tj(z1 + BODY_R)); j++) {
      for (let i = Math.max(0, ti(x0 - BODY_R)); i <= Math.min(W - 1, ti(x1 + BODY_R)); i++) blocked[j * W + i] = 1;
    }
  };
  for (const m of places) {
    for (const c of m.circles) stampCircle(c.x, c.z, c.r + BODY_R);
    for (const b of m.boxes) stampBox(b.x0, b.z0, b.x1, b.z1);
  }
  for (const p of props) if (p.r) stampCircle(p.x, p.z, p.r + BODY_R * 0.5);
  for (const t of street?.things ?? []) stampCircle(t.x, t.z, t.r + BODY_R * 0.5);
  const lampAt = { x: pier.x - pier.width / 2 + 0.25, z: pier.end - 3.4 };
  stampCircle(lampAt.x, lampAt.z, 0.15 + BODY_R * 0.5);
  // The rowboat moored by the pier, to swim round; the portal's ring and plinth, to walk round.
  const boatAt = { x: pier.x + pier.width / 2 + 0.95, z: 22.4 };
  stampBox(boatAt.x - 0.7, boatAt.z - 2.6, boatAt.x + 0.7, boatAt.z);
  if (portal) stampBox(portal.at.x - 1.3, portal.at.z - 0.35, portal.at.x + 1.3, portal.at.z + 0.05);
  // The speedboat, tied up at the end of the pier (raced in 3D: see boat.ts).
  const speedboat = boatOf(world);
  const speedAt = speedboat ? { x: speedboat.at.x, z: speedboat.at.z + 1.3 } : null;
  if (speedAt) stampBox(speedAt.x - 0.7, speedAt.z - 2.6, speedAt.x + 0.7, speedAt.z);
  // The mini-games: a sprite and a tag at each spot; the games open in the shared games card.
  // The gates across the bridges: shut ones are stamped across their decks until they open.
  const gates = createMapGates(geo, (id) => store.open(id));
  const gateCells = new Map<string, [number, number][]>();
  for (const g of gates.shut()) {
    const saved: [number, number][] = [];
    for (const p of gates.cells(g)) {
      const i = ti(p.x);
      const j = tj(p.z);
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      saved.push([j * W + i, blocked[j * W + i]]);
      blocked[j * W + i] = 1;
    }
    gateCells.set(g.id, saved);
  }
  const games = createMapGames(ctx, root, {
    walk: (x, z) => (walkTo(x, z) ? path : null),
    route: () => path,
    halt: () => ((path = null), clearKeys(), (facing = 'up')),
    // Up at a shut gate: the game that opens it.
    gate: (x, z) => {
      const g = gates.near(x, z);
      return g && isGame(g.game) ? g.game : null;
    },
  });
  for (const b of games.blocks) stampCircle(b.x, b.z, b.r + BODY_R);
  // People out walking: they stop for you, and say hello.
  const walkers = createMapWanderers(ctx, root, {
    walk: (x, z) => (walkTo(x, z) ? path : null),
    route: () => path,
    halt: (face) => ((path = null), clearKeys(), (facing = face)),
    night: () => night,
  });
  // FOSS HILL's letters below the lighthouse, and the small flag on the hilltop.
  const fossHill = layoutFossHill(geo);
  for (const b of fossHill.blocks) stampCircle(b.x, b.z, b.r + BODY_R * 0.5);
  // The bus on the quay and the station's shelter stand in the way too.
  const quay = geo.quay;
  const busAt = quay ? { x: quay.bus.x, z: quay.bus.z + 0.5 } : null;
  if (quay) for (const t of [-1.5, 0, 1.5]) stampCircle(quay.bus.x + Math.sin(quay.faces) * t, quay.bus.z + Math.cos(quay.faces) * t, 0.65 + BODY_R);
  const shelterAt = geo.station && geo.rail ? (() => {
    const at = geo.rail.at(geo.station.s);
    return { x: at.x + Math.cos(at.yaw) * at.out * 1.8, z: at.z - Math.sin(at.yaw) * at.out * 1.8 };
  })() : null;
  if (shelterAt) stampCircle(shelterAt.x, shelterAt.z, 0.6 + BODY_R);

  const blockedAt = (x: number, z: number) => {
    const i = ti(x);
    const j = tj(z);
    return i >= 0 && j >= 0 && i < W && j < H ? blocked[j * W + i] : 1;
  };
  /** How wet a spot is: 0 dry, 1 wading, 2 swimming. */
  const wetAt = (x: number, z: number) => {
    const i = ti(x);
    const j = tj(z);
    return i >= 0 && j >= 0 && i < W && j < H ? terrain.water[j * W + i] : 0;
  };
  /** Can the explorer move here from where it is now? */
  const canStand = (x: number, z: number) => {
    const b = blockedAt(x, z);
    if (b === 1) return false;
    // The water by the pier: only in the air, or swimming out of it after landing there.
    if (b === 2 && !jump.air && blockedAt(pos.x, pos.z) !== 2) return false;
    // Out of deep water you climb out through the shallows, never straight up onto the deck.
    return jump.air || wet < 2 || wetAt(x, z) > 0;
  };
  const isOpen = (x: number, z: number) => blockedAt(x, z) === 0;

  // A coarse grid for finding paths: swimming costs three times as much as walking, so
  // a walk round the shore wins unless the swim is a lot shorter.
  const cells = (W / CELL) * (H / CELL);
  const grid: Grid = { w: W / CELL, h: H / CELL, blocked: new Uint8Array(cells), cost: new Uint8Array(cells) };
  const fillGrid = () => {
    for (let cj = 0; cj < grid.h; cj++) {
      for (let ci = 0; ci < grid.w; ci++) {
        const k = (cj * CELL + CELL / 2) * W + ci * CELL + CELL / 2;
        grid.blocked[cj * grid.w + ci] = blocked[k] === 0 ? 0 : 1;
        grid.cost![cj * grid.w + ci] = terrain.water[k] === 2 ? 3 : 1;
      }
    }
  };
  fillGrid();
  const cellOf = (x: number, z: number): Pt => ({ x: Math.floor(((x - RECT.x0) * TEX) / CELL), y: Math.floor(((z - RECT.z0) * TEX) / CELL) });
  const cellCentre = (c: Pt) => ({ x: RECT.x0 + ((c.x + 0.5) * CELL) / TEX, z: RECT.z0 + ((c.y + 0.5) * CELL) / TEX });
  const clearWalk = (ax: number, az: number, bx: number, bz: number) => {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d * TEX * 2));
    for (let k = 0; k <= n; k++) if (!isOpen(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  };

  /** A walkable route from here to there (in world units), or null. */
  function route(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
    if (isOpen(toX, toZ) && clearWalk(fromX, fromZ, toX, toZ)) return [{ x: toX, z: toZ }];
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
    // ...about: if the first leg from where we really stand clips something, start from the cell's middle.
    const first = pts[0] ?? cellCentre(e);
    if (!clearWalk(fromX, fromZ, first.x, first.z)) pts.unshift(cellCentre(s));
    const end = isOpen(toX, toZ) && Math.hypot(toX - cellCentre(e).x, toZ - cellCentre(e).z) < 0.6 ? { x: toX, z: toZ } : null;
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
  things.push({ x: boatAt.x, z: boatAt.z, sprite: boat });
  const speedArt = rowboat('#e5484d');
  if (speedAt) things.push({ x: speedAt.x, z: speedAt.z, sprite: speedArt });
  if (portal) {
    things.push({
      x: portal.at.x,
      z: portal.at.z,
      sprite: portalArt.ring,
      after: (c, sx, sy) => {
        // The swirl turns; motes of light spiral in from all round.
        const f = motion ? Math.floor(time * 10) % portalArt.swirl.length : 0;
        c.drawImage(portalArt.swirl[f], sx + portalArt.sx, sy + portalArt.sy);
        if (!motion) return;
        const mx = sx + portalArt.cx;
        const my = sy + portalArt.cy;
        c.fillStyle = '#ede9fe';
        for (let i = 0; i < 4; i++) {
          const k = (time * 0.45 + i / 4) % 1;
          const r = (1 - k) * 15;
          const a = i * 1.57 + k * 4.5;
          c.globalAlpha = Math.min(1, k * 3);
          c.fillRect(Math.round(mx + Math.cos(a) * r), Math.round(my + Math.sin(a) * r * 0.85), 1, 1);
        }
        c.globalAlpha = 1;
      },
    });
  }
  things.push({ x: lampAt.x, z: lampAt.z, sprite: lampPost() });
  for (const l of fossHill.letters) things.push(l);
  for (const f of fossHill.flags) things.push({ x: f.x, z: f.z, sprite: null, after: (c, sx, sy) => drawSprite(c, fossHill.flagArt[motion ? Math.floor(time * 3) % 2 : 0], sx, sy) });
  things.push(...games.things, ...gates.things);
  if (busAt) things.push({ x: busAt.x, z: busAt.z, sprite: bus() });
  if (shelterAt) things.push({ x: shelterAt.x, z: shelterAt.z, sprite: shelter() });
  if (bottlePlace) things.push({ x: bottlePlace.base.x + 1.3, z: bottlePlace.base.z + 0.9, sprite: shells() });
  // Tower Bridge: its towers, walkways and chains, each sorted where it stands, and its lamps.
  const lampArt = streetLamp();
  const lamps: { x: number; z: number }[] = [];
  /** The bridge's sprites and the street furniture, for the debug sheet. */
  const extras: Sprite[] = [];
  for (const br of geo.bridges) {
    if (br.style !== 'tower') continue;
    const plan = planTowerBridge(br);
    const pieces = paintTowerBridge(plan);
    things.push(...pieces);
    extras.push(...pieces.map((p) => p.sprite));
    for (const l of plan.lamps) things.push({ x: l.x, z: l.z, sprite: lampArt }), lamps.push(l);
  }
  if (street) {
    const furniture = { lamp: lampArt, 'phone-box': phoneBox(), 'pillar-box': pillarBox(), bench: bench() };
    extras.push(...Object.values(furniture));
    for (const t of street.things) {
      things.push({ x: t.x, z: t.z, sprite: furniture[t.kind] });
      if (t.kind === 'lamp') lamps.push(t);
    }
  }
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
  // One more jump in mid-air, until you land: it spins you round and leaves a puff of air behind.
  const JUMP = motion ? { v: 118, g: 520 } : { v: 62, g: 520 };
  const jump = { y: 0, vy: 0, air: false, twice: false, buffered: -1, landT: -1, spinT: -1 };
  const puff = { x: 0, z: 0, y: 0, t: -1 };
  // In the water: how wet you are (0 dry, 1 wading, 2 swimming), how you glide, your strokes.
  let wet = 0;
  const vel = { x: 0, z: 0 };
  let stroke = 0;
  let kickT = -1;
  let splashT = 9;
  let pendingPortal = false;
  // Running: Shift held, or a path you double-clicked. `runK` eases toward the speed it should be.
  let shift = false;
  let runPath = false;
  let runK = 1;
  let lastTap = { t: 0, x: 0, y: 0 };
  const dust = Array.from({ length: 8 }, () => ({ x: 0, z: 0, t: 1, side: 1 }));
  let dustNext = 0;
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
  const arrived = ctx.viaPortal && portal ? portalExit(portal) : null;
  const stored = store.state.presence.pos;
  if (returning) {
    pos.x = returning.door.x;
    pos.z = returning.door.z;
    facing = 'down';
  } else if (arrived) {
    // Out of the portal, onto the plaza.
    pos.x = arrived.x;
    pos.z = arrived.z;
    facing = 'down';
    if (motion) {
      hopT = 0;
      Object.assign(puff, { x: pos.x, z: pos.z - 0.5, y: 6, t: 0 });
    }
  } else if (stored && isOpen(stored.x, stored.z)) {
    pos.x = stored.x;
    pos.z = stored.z;
  }
  wet = wetAt(pos.x, pos.z);
  let dismissed: string | null = returning?.place.id ?? (arrived ? 'portal' : null);

  // ---------- Inside a building ----------
  // Through a door with a room behind it, the building opens up where it
  // stands: the camera eases in, the roof lifts off, the walls fade, and the
  // room (inside.ts) grows out of the building's footprint while the island
  // round it dims. The room is drawn into the map at the map's own pixels,
  // its doorway on the building's door, so you walk straight in. Leaving plays
  // it backwards: the room closes behind you, and you're on the doorstep.
  let inside: Inside | null = null;
  let insideOf: MapPlace | null = null;
  /** The open room's top-left, in map pixels (whole ones). */
  const roomAt = { x: 0, y: 0 };
  /** How far open it is, from 0 (just the building) to 1 (in), and which way it's going. */
  let openK = 0;
  let openDir = 0;
  /** Seconds to open up, and to close. */
  const OPEN = 0.8;
  const CLOSE = 0.6;
  /** On the way in: from where you stood to just inside the door, in world units. */
  const walkIn = { x0: 0, z0: 0, x1: 0, z1: 0 };
  const rooms = new Map<string, MapRoom>();
  const roomOf = (m: MapPlace) => {
    let r = rooms.get(m.place.id);
    if (!r) rooms.set(m.place.id, (r = paintRoom(m.place, world.outfits)));
    return r;
  };

  /** Open a building's room round you. `snap` skips the camera move (reduced motion, or already inside). */
  function openRoom(m: MapPlace, { snap = !motion, quiet = false } = {}) {
    const room = roomOf(m);
    insideOf = m;
    inside = createInside({ room, hero, talk: ctx.ui.room, motion, sound: ctx.sound, leave: () => leaveRoom() });
    // The room's doorway on the building's door, its front wall along the building's front.
    const a = art.get(m.place.id)!;
    roomAt.x = Math.round((m.base.x - RECT.x0) * TEX) + a.door.dx - room.px(0);
    roomAt.y = Math.round((m.base.z - RECT.z0) * TEX) + 3 - room.h;
    const entry = room.plan.entry;
    Object.assign(walkIn, { x0: pos.x, z0: pos.z, x1: RECT.x0 + (roomAt.x + room.px(entry.x)) / TEX, z1: RECT.z0 + (roomAt.y + room.py(entry.z)) / TEX });
    mode = 'door';
    modeT = 0;
    openDir = 1;
    openK = 0;
    path = null;
    pendingEnter = null;
    clearKeys();
    overlay.tag(null);
    overlay.fish(null);
    canvas.style.cursor = '';
    if (fishing.phase !== 'idle') fishing.cancel();
    store.dispatch({ type: 'inside', at: m.place.id });
    if (snap) (openK = 1), roomUp(quiet), inRoom();
  }

  /** The room's bar and its box (the description, unless `quiet`): up half way through opening. */
  let roomUI = false;
  function roomUp(quiet = false) {
    const m = insideOf!;
    const room = inside!;
    roomUI = true;
    ctx.ui.room.enter(
      m.place.id,
      {
        leave: () => leaveRoom(),
        page: (href) => ctx.go(m.place.id, clampToView(room.point(0, room.room.plan.d / 2, roomFrame())), href),
        engage: (t) => room.engage(t),
      },
      { quiet },
    );
  }

  /** All the way in: the room is yours to walk about. */
  function inRoom() {
    mode = 'inside';
    modeT = 0;
    openDir = 0;
    pos.x = walkIn.x1;
    pos.z = walkIn.z1;
    facing = 'up';
    moving = false;
    up.width = up.height = 1;
  }

  /** Out of the room (or, half way in, back out again): it closes behind you. */
  function leaveRoom() {
    const m = insideOf;
    if (!m || !inside || !(mode === 'inside' || (mode === 'door' && openDir > 0))) return;
    ctx.sound.play('step');
    if (roomUI) ctx.ui.room.exit();
    roomUI = false;
    store.dispatch({ type: 'inside', at: null });
    // Back out where you went in, facing the way you came.
    pos.x = m.door.x;
    pos.z = m.door.z;
    facing = 'down';
    wet = 0;
    moving = false;
    dismissed = m.place.id;
    near = m;
    doorShy = true;
    aimCamera();
    cam.x = camGoal.x;
    cam.z = camGoal.z;
    if (motion) hopT = 0;
    mode = 'door';
    openDir = -1;
    if (!motion) shut();
  }

  /** Shut: just the building again, and the island all round. */
  function shut() {
    inside = null;
    insideOf = null;
    openK = 0;
    openDir = 0;
    mode = 'play';
    modeT = 0;
    up.width = up.height = 1;
  }

  // ---------- Overlay ----------
  const boatCard = createBoatCard(root, ctx);
  const overlay = createOverlay(
    root,
    places.map((m) => m.place),
    ctx.touch,
    {
      enter: (id) => {
        if (id === 'portal') return stepIn();
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
  /** The same, as the camera has it right now: S outside, the room's zoom inside, anything in between on the way. */
  let Z = 2;
  const buf = document.createElement('canvas');
  const b = buf.getContext('2d')!;
  const bufN = document.createElement('canvas');
  const bN = bufN.getContext('2d')!;
  /** For zooms between whole scales: the buffer blown up a whole number of times, then eased down (see blit). Let go of once the zoom lands. */
  const up = document.createElement('canvas');
  const u = up.getContext('2d')!;
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
    for (const c of [buf, bufN]) {
      c.width = Math.ceil(canvas.width / S) + 2;
      c.height = Math.ceil(canvas.height / S) + 2;
    }
    Z = insideOf ? view().z : S;
    sizeBuffers(Z);
    g.imageSmoothingEnabled = false;
    b.imageSmoothingEnabled = false;
    bN.imageSmoothingEnabled = false;
  }

  /** The buffers hold what's in view at zoom z: grown if it's further out than the map's own scale. */
  function sizeBuffers(z: number) {
    bw = Math.ceil(canvas.width / z) + 2;
    bh = Math.ceil(canvas.height / z) + 2;
    if (bw <= buf.width && bh <= buf.height) return;
    for (const c of [buf, bufN]) {
      c.width = Math.max(c.width, bw);
      c.height = Math.max(c.height, bh);
    }
    b.imageSmoothingEnabled = false;
    bN.imageSmoothingEnabled = false;
  }

  /** The camera's goal: the explorer, a little below the HUD's middle. */
  const camGoal = { x: 0, z: 0 };
  function aimCamera() {
    const halfW = canvas.width / S / TEX / 2;
    const halfH = canvas.height / S / TEX / 2;
    const lift = (HUD_TOP / 2) * (dpr / S) / TEX;
    camGoal.x = clampAxis(pos.x, halfW, VIEW.x0, VIEW.x1);
    camGoal.z = clampAxis(pos.z - lift, halfH, VIEW.z0, VIEW.z1);
  }

  /**
   * What the camera sees. Outside, the map at its own scale round `cam`.
   * Inside, the room at the biggest whole zoom that fits it clear of the HUD
   * and the conversation box (its pixels are the map's, so the island round
   * it zooms with it), but no more than twice the map's own, so the island
   * still reads as the island. On the way in or out, part way between the
   * two, with the room's doorway sliding straight across the screen.
   */
  function view(): View {
    const out: View = { z: S, l: (cam.x - RECT.x0) * TEX - canvas.width / S / 2, t: (cam.z - RECT.z0) * TEX - canvas.height / S / 2 };
    if (!insideOf || !inside) return out;
    const room = inside.room;
    const area = roomArea(cssW, cssH, dpr);
    const z = Math.min(S * 2, fitFrame(room.w, room.h, area).scale);
    const into = frameOn({ x: roomAt.x, y: roomAt.y, w: room.w, h: room.h }, area, z);
    return between(out, into, roomAt.x + room.px(0), roomAt.y + room.h, ease(openK));
  }

  /** The open room's frame in CSS pixels, for taps, the pointer and wipes. */
  const roomFrame = (): Frame => ({ x: ((roomAt.x - viewL) * Z) / dpr, y: ((roomAt.y - viewT) * Z) / dpr, scale: Z / dpr });

  resize();
  aimCamera();
  cam.x = camGoal.x;
  cam.z = camGoal.z;

  /** A world point in CSS pixels (into `out`, so the frame loop can reuse one). */
  const toScreen = (x: number, z: number, out = { x: 0, y: 0 }) => {
    out.x = (((x - RECT.x0) * TEX - viewL) * Z) / dpr;
    out.y = (((z - RECT.z0) * TEX - viewT) * Z) / dpr;
    return out;
  };
  const scratch = { x: 0, y: 0 };
  const doorScreen = (m: MapPlace) => {
    const a = art.get(m.place.id)!;
    return toScreen(m.base.x + a.door.dx / TEX, m.base.z + a.door.dy / TEX);
  };
  const clampToView = (p: { x: number; y: number }) => ({ x: Math.min(cssW, Math.max(0, p.x)), y: Math.min(cssH, Math.max(0, p.y)) });
  const fromScreen = (cx: number, cy: number) => ({
    x: RECT.x0 + ((cx * dpr) / Z + viewL) / TEX,
    z: RECT.z0 + ((cy * dpr) / Z + viewT) / TEX,
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
    shift = e.shiftKey;
    if (e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement) || busy()) return;
    if (mode === 'door') return void (MOVE[e.code] && e.preventDefault());
    if (mode === 'inside' && inside) {
      // The room's own keys (E, Enter, Escape) are room.ts's; here, walking and hopping.
      if (ctx.ui.room.busy) return clearKeys();
      if (MOVE[e.code]) {
        e.preventDefault();
        keys.add(e.code);
        sumKeys();
        inside.halt();
        return;
      }
      if (e.key === ' ' && !(document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement)) {
        e.preventDefault();
        if (!e.repeat) inside.hop();
      }
      return;
    }
    if (MOVE[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      sumKeys();
      path = null;
      pendingEnter = null;
      pendingPortal = false;
      if (fishing.phase !== 'idle') fishing.cancel();
      firstMove();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const onControl = !!active && active !== document.body && (active.tagName === 'A' || active.tagName === 'BUTTON');
    // A game's tag is up: E or Enter plays it.
    if ((e.code === 'KeyE' || e.key === 'Enter') && !onControl && games.open && fishing.phase === 'idle') {
      e.preventDefault();
      return games.play(games.open);
    }
    // Someone out walking has stopped for you: E or Enter says hello, and then chats.
    if ((e.code === 'KeyE' || e.key === 'Enter') && !onControl && walkers.open && fishing.phase === 'idle') {
      e.preventDefault();
      return walkers.talk(walkers.open);
    }
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
    if (e.key === 'Enter' && !onControl && (tagPlace || tagPortal)) {
      e.preventDefault();
      if (tagPlace) enter(tagPlace);
      else stepIn();
    }
    if (e.key === 'Escape' && (near || nearPortal)) dismissed = near ? near.place.id : 'portal';
  };
  const onKeyUp = (e: KeyboardEvent) => {
    shift = e.shiftKey;
    // Let go early for a small hop.
    if (e.key === ' ' && jump.air && jump.vy > 0) jump.vy *= 0.45;
    keys.delete(e.code);
    sumKeys();
  };
  const onBlur = () => {
    clearKeys();
    shift = false;
  };

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
    pendingPortal = false;
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
    if (mode === 'inside' && inside) {
      // A tap on the room while someone's talking says goodbye, then goes where it was meant to.
      if (ctx.ui.room.busy) ctx.ui.room.hush();
      const rr = canvas.getBoundingClientRect();
      inside.tap(e.clientX - rr.left, e.clientY - rr.top, roomFrame());
      return;
    }
    if (mode === 'door') return;
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
    if (hitPortal(w.x, w.z)) return activatePortal();
    if (games.hit(w.x, w.z)) return;
    if (walkers.hit(w.x, w.z)) return;
    const m = hitLandmark(w.x, w.z);
    if (m) return activate(m);
    if (fishSpot && Math.hypot(w.x - fishSpot.at.x, w.z - fishSpot.at.z) < 0.9) {
      walkTo(fishSpot.at.x, fishSpot.at.z);
      return;
    }
    // A second click on (about) the same spot, quickly: run there.
    const now = performance.now();
    const again = now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40;
    lastTap = { t: again ? 0 : now, x: e.clientX, y: e.clientY };
    if (walkTo(w.x, w.z)) {
      runPath = again;
      if (!again) ctx.sound.play('tap');
    }
  };
  let lastRetarget = 0;
  const onPointerMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const w = fromScreen(e.clientX - r.left, e.clientY - r.top);
    if (!press || e.pointerId !== press.id) {
      if (e.pointerType === 'mouse' && mode === 'inside' && inside) canvas.style.cursor = inside.over(e.clientX - r.left, e.clientY - r.top, roomFrame()) ? 'pointer' : '';
      else if (e.pointerType === 'mouse') canvas.style.cursor = mode === 'play' && (hitLandmark(w.x, w.z) || hitPortal(w.x, w.z)) ? 'pointer' : '';
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
  // Presses are read from pointer events, so a thumb held to steer never selects text on a phone.
  const unhold = holdable(canvas, { touch: true });
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
    if (!jump.air && wet === 2) return kick();
    if (jump.air) {
      if (jump.twice) return void (jump.buffered = 0.12);
      // The double jump: a touch higher than the first, with a spin and a puff of air underfoot.
      jump.twice = true;
      jump.vy = JUMP.v * 1.05;
      jump.buffered = -1;
      if (motion) {
        jump.spinT = 0;
        Object.assign(puff, { x: pos.x, z: pos.z, y: jump.y, t: 0 });
      }
      ctx.sound.play('jump2');
      return;
    }
    jump.air = true;
    jump.twice = false;
    jump.vy = JUMP.v;
    jump.buffered = -1;
    hopT = -1;
    ctx.sound.play('jump');
  }

  // ---------- The water ----------
  // Rings spreading round a swimmer (and a wader's feet), and drops of spray: small pools, reused.
  const rings = Array.from({ length: 14 }, () => ({ x: 0, z: 0, t: 1, big: false }));
  let ringNext = 0;
  function ripple(big: boolean) {
    if (!motion) return;
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    Object.assign(r, { x: pos.x, z: pos.z, t: 0, big });
  }
  const drops = Array.from({ length: 28 }, () => ({ x: 0, z: 0, ox: 0, oy: 0, h: 0, vx: 0, vy: 0, vh: 0, life: 0 }));
  let dropNext = 0;
  function spray(n: number, power: number) {
    if (!motion) return;
    for (let i = 0; i < n; i++) {
      const d = drops[dropNext];
      dropNext = (dropNext + 1) % drops.length;
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const k = 0.5 + Math.random() * 0.5;
      Object.assign(d, { x: pos.x, z: pos.z, ox: Math.cos(a) * 3, oy: Math.sin(a) * 1.5, h: 2, vx: Math.cos(a) * power * k, vy: Math.sin(a) * power * k * 0.45, vh: power * (1.3 + Math.random()), life: 1 });
    }
  }
  /** Into deep water: a splash, louder from a jump than from wading out. */
  function splash(big: boolean) {
    if (splashT < 0.8 && !big) return;
    splashT = 0;
    spray(big ? 14 : 6, big ? 30 : 16);
    ripple(true);
    ctx.sound.play(big ? 'splash' : 'swim');
  }
  /** In deep water there's nothing to push off from: a kick and a splash instead of a jump. */
  function kick() {
    if (kickT >= 0 && kickT < 0.35) return;
    kickT = 0;
    spray(6, 18);
    ripple(true);
    ctx.sound.play('swim');
  }

  // ---------- The portal ----------
  /** Is a world point on the portal as drawn? */
  function hitPortal(wx: number, wz: number) {
    if (!portal) return false;
    const a = portalArt.ring;
    return Math.abs(wx - portal.at.x) < (a.w / 2 - 1) / TEX && wz < portal.at.z + 2 / TEX && wz > portal.at.z - (a.ay - 1) / TEX;
  }
  /** Click the portal: walk up to it and step through. */
  function activatePortal() {
    if (mode !== 'play' || !portal) return;
    firstMove();
    if (Math.abs(pos.x - portal.at.x) < 0.7 && pos.z > portal.at.z && pos.z - portal.at.z < 1.2 && !jump.air) return stepIn();
    if (walkTo(portal.at.x, portal.at.z + 0.5)) {
      pendingPortal = true;
      ctx.sound.play('pop');
    }
  }
  /** At the portal: open its menu of views, and step through into the one picked. */
  let choosing = false;
  /** Closed the menu without picking: walking into the portal again waits until you've stepped back. */
  let portalShy = false;
  /** How long you've been walking into a building's door, and whether you've only just come out of it. */
  let doorPushT = 0;
  let doorShy = false;
  function stepIn() {
    if (mode !== 'play' || !portal || choosing) return;
    choosing = true;
    path = null;
    pendingEnter = null;
    pendingPortal = false;
    clearKeys();
    if (fishing.phase !== 'idle') fishing.cancel();
    ctx.sound.play('pop');
    void ctx.ui.choosePortal('map').then((next) => {
      choosing = false;
      if (destroyed) return;
      if (next) (portalTo = next), stepThrough();
      else portalShy = true;
    });
  }
  function stepThrough() {
    if (mode !== 'play' || !portal) return;
    mode = 'portal';
    modeT = 0;
    wiped = false;
    path = null;
    pendingEnter = null;
    pendingPortal = false;
    clearKeys();
    facing = 'up';
    if (fishing.phase !== 'idle') fishing.cancel();
    ctx.sound.play('whoosh');
  }
  /** The middle of the swirl, in CSS pixels. */
  const portalScreen = () => toScreen(portal!.at.x + portalArt.cx / TEX, portal!.at.z + portalArt.cy / TEX);

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
    // A building with a room: it opens up round you. Anywhere else, on to its page.
    if (m.place.interior) {
      ctx.sound.play('step');
      return openRoom(m);
    }
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
    // A gate opened: lift it off the deck, and let the paths through.
    if (events.some((e) => e.type === 'gate')) {
      for (const g of gates.sync()) for (const [k, was] of (gateCells.get(g.id) ?? []).reverse()) blocked[k] = was;
      fillGrid();
    }
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
  /** In front of the portal (and no door nearer). */
  let nearPortal = false;
  /** The place whose name tag is showing (Enter goes in), or the portal's. */
  let tagPlace: MapPlace | null = null;
  let tagPortal = false;
  let lastAt: string | null | undefined = undefined;
  let lastSent = 0;
  let sentX = NaN;
  let sentZ = NaN;
  function presence(now: number) {
    if (inside || mode === 'door') return;
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
        jump.twice = false;
        wet = wetAt(pos.x, pos.z);
        if (wet === 2) {
          // Into the sea: no bounce, just a splash.
          splash(true);
          jump.buffered = -1;
          vel.x *= 0.5;
          vel.z *= 0.5;
        } else {
          jump.landT = 0;
          if (wet === 1) (spray(4, 14), ripple(false));
          ctx.sound.play('step');
          if (jump.buffered >= 0) tryJump();
        }
      }
    }
    if (jump.buffered >= 0 && (jump.buffered -= dt) < 0) jump.buffered = -1;
    if (jump.landT >= 0 && (jump.landT += dt) > 0.24) jump.landT = -1;
    if (jump.spinT >= 0 && (jump.spinT += dt) > 0.3) jump.spinT = -1;
    if (puff.t >= 0 && (puff.t += dt) > 0.32) puff.t = -1;
    if (kickT >= 0 && (kickT += dt) > 0.6) kickT = -1;
    splashT += dt;
    for (const d of dust) if (d.t < 1) d.t = Math.min(1, d.t + dt / 0.4);
    for (const r of rings) if (r.t < 1) r.t = Math.min(1, r.t + dt / (r.big ? 1.25 : 0.85));
    for (const d of drops) {
      if (d.life <= 0) continue;
      d.ox += d.vx * dt;
      d.oy += d.vy * dt;
      d.vh -= 300 * dt;
      d.h += d.vh * dt;
      if (d.h <= 0) d.life = 0;
    }
    if (marker.t < 1) marker.t = Math.min(1, marker.t + dt * 1.6);
    if (busy()) clearKeys();

    if (mode === 'door') {
      moving = false;
      openK = Math.min(1, Math.max(0, openK + (openDir > 0 ? dt / OPEN : -dt / CLOSE)));
      if (openDir > 0) {
        // In through the door and a step inside, as the room opens up round you.
        const w = Math.min(1, openK / 0.75);
        const x = walkIn.x0 + (walkIn.x1 - walkIn.x0) * w;
        const z = walkIn.z0 + (walkIn.z1 - walkIn.z0) * w;
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d > 1e-4) {
          moving = true;
          walked += d;
          facing = facingFor(x - pos.x, z - pos.z, facing);
        }
        pos.x = x;
        pos.z = z;
        if (openK >= 0.5 && !roomUI) roomUp();
        if (openK >= 1) inRoom();
      } else if (openK <= 0) shut();
      return;
    }
    if (mode === 'inside' && inside) {
      moving = false;
      inside.update(dt, held, shift);
      return;
    }
    if (mode === 'entering') {
      if (!wiped && modeT > (motion ? 0.3 : 0)) {
        wiped = true;
        const m = byId.get(enteringId!)!;
        ctx.go(m.place.id, clampToView(doorScreen(m)));
      }
      moving = false;
      return;
    }
    if (mode === 'portal') {
      moving = false;
      if (!wiped && modeT > (motion ? 0.42 : 0)) {
        wiped = true;
        ctx.portal(portalTo, clampToView(portalScreen()));
      }
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
    // Running eases in and out rather than snapping.
    const running = (shift && (held.x || held.z)) || (runPath && !!path);
    if (!path) runPath = false;
    const wetNow = wet > 0 && !jump.air;
    runK = damp(runK, running ? (wetNow ? RUN_WET : RUN) : 1, running ? 6 : 4, dt);
    const top = SPEED * runK;
    let speed = top;
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
          if (pendingPortal) {
            pendingPortal = false;
            if (portal && Math.abs(pos.x - portal.at.x) < 0.7 && pos.z - portal.at.z < 1.2) return stepIn();
          }
        }
      } else {
        wish.x = dx / d;
        wish.z = dz / d;
        speed = Math.min(top, (d / dt) * 0.98 + 0.01);
      }
    }

    moving = false;
    const afloat = wet === 2 && !jump.air;
    const k = afloat ? SWIM : wet === 1 && !jump.air ? WADE : 1;
    if (afloat) {
      // Afloat you glide: strokes build up speed, and you drift to a stop.
      const rate = wish.x || wish.z ? 4 : 1.6;
      vel.x = damp(vel.x, wish.x * speed * k, rate, dt);
      vel.z = damp(vel.z, wish.z * speed * k, rate, dt);
      // Near the drop-off the current holds you back, but only going further out:
      // down the slope of the swimming room, round whichever island's water this is.
      const room = geo.swimRoom(pos.x, pos.z);
      if (room < 1.1) {
        const gx = geo.swimRoom(pos.x - 0.25, pos.z) - geo.swimRoom(pos.x + 0.25, pos.z);
        const gz = geo.swimRoom(pos.x, pos.z - 0.25) - geo.swimRoom(pos.x, pos.z + 0.25);
        const r = Math.hypot(gx, gz) || 1;
        const out = (vel.x * gx + vel.z * gz) / r;
        if (out > 0) {
          const hold = 1 - Math.max(0, room) / 1.1;
          vel.x -= (gx / r) * out * hold;
          vel.z -= (gz / r) * out * hold;
        }
      }
    } else {
      vel.x = wish.x * speed * k;
      vel.z = wish.z * speed * k;
    }
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.02) {
      const step = sp * dt;
      const ox = pos.x;
      const oz = pos.z;
      const nx = pos.x + vel.x * dt;
      const nz = pos.z + vel.z * dt;
      if (canStand(nx, nz)) (pos.x = nx), (pos.z = nz);
      else if (vel.x && canStand(nx, pos.z)) (pos.x = nx), (vel.z = afloat ? 0 : vel.z);
      else if (vel.z && canStand(pos.x, nz)) (pos.z = nz), (vel.x = afloat ? 0 : vel.x);
      else if (afloat) vel.x = vel.z = 0;
      const moved = Math.hypot(pos.x - ox, pos.z - oz);
      if (moved > 1e-4) {
        moving = !afloat || sp > 0.35;
        const before = Math.floor(walked / STRIDE);
        walked += moved;
        const now = Math.floor(walked / STRIDE);
        if (now !== before && !jump.air) {
          // A soft step on each left footfall: often enough to feel, not to nag. Wading, a splash.
          const fast = runK > 1.35;
          if (wet === 0 && now % (fast ? 2 : 4) === 1 && motion) ctx.sound.play('step');
          // Running kicks up a little dust behind you, every other step.
          if (wet === 0 && fast && motion && now % 2 === 0) {
            const d = dust[dustNext];
            dustNext = (dustNext + 1) % dust.length;
            Object.assign(d, { x: pos.x - vel.x * 0.05, z: pos.z - vel.z * 0.05, t: 0, side: now % 4 === 0 ? -1 : 1 });
          }
          if (wet === 1 && now % 2 === 1) (ripple(false), spray(2, 10), now % 4 === 1 && ctx.sound.play('swim'));
        }
        if (wish.x || wish.z) facing = facingFor(wish.x, wish.z, facing);
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

    // Wet or dry: walking out into deep water, a splash; afloat, strokes and rings.
    if (!jump.air) {
      const w = wetAt(pos.x, pos.z);
      if (w === 2 && wet < 2) splash(false);
      wet = w;
    }
    if (wet === 2 && !jump.air) {
      const before = Math.floor(stroke);
      stroke += dt * (moving ? 2.3 : 0.8);
      if (Math.floor(stroke) !== before) {
        ripple(false);
        if (moving && Math.floor(stroke) % 2 === 0) ctx.sound.play('swim');
      }
    }

    // The portal: walk into its face to step through.
    if (portal && !jump.air && wet === 0) {
      const dx = pos.x - portal.at.x;
      const dz = pos.z - portal.at.z;
      if (dz > 1 || Math.abs(dx) > 1) portalShy = false;
      if (!portalShy && Math.abs(dx) < 0.7 && dz > 0 && dz < 0.62 && held.z < 0 && Math.abs(held.x) <= -held.z) return stepIn();
    }

    // A building's door: walk up into it, a moment, and in you go. (Fresh out of one,
    // let go of the keys first, so you don't bounce straight back in.)
    if (!held.x && !held.z) doorShy = false;
    const doorAt = near?.place.interior && !jump.air && wet === 0 && !doorShy ? near : null;
    const intoDoor = !!doorAt && held.z < 0 && Math.abs(held.x) <= -held.z && Math.abs(pos.x - doorAt.door.x) < 0.6 && pos.z < doorAt.door.z + 0.35;
    doorPushT = intoDoor ? doorPushT + dt : 0;
    if (doorAt && doorPushT > 0.12) {
      doorPushT = 0;
      return enter(doorAt);
    }

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
    // Right beside someone out walking, they have your attention rather than a door.
    if (best && walkers.claims(pos.x, pos.z)) best = null;
    games.update(pos, mode === 'play' && !best && !jump.air && wet === 0);
    walkers.update(pos, dt, mode === 'play' && !best && !games.open && !insideOf && !jump.air && wet === 0);
    let atPortal = false;
    if (portal && !jump.air && wet === 0) {
      const d = Math.hypot(pos.x - portal.at.x, pos.z - portal.at.z - 0.75);
      if (d < DOOR_RANGE && d < bestD) (best = null), (atPortal = true);
    }
    boatCard.update(pos.x, pos.z);
    if (best !== near || atPortal !== nearPortal) {
      near = best;
      nearPortal = atPortal;
      const id = near ? near.place.id : nearPortal ? 'portal' : null;
      if (dismissed && dismissed !== id) dismissed = null;
      if (near && id !== dismissed) {
        ctx.sound.play(near.kind === 'schoolhouse' ? 'bell' : 'pop');
        if (motion) hopT = 0;
        ctx.ui.announce(`${near.place.title}: ${near.place.name}. Press Enter to go in.`);
      } else if (nearPortal && id !== dismissed) {
        ctx.sound.play('pop');
        ctx.ui.announce('The portal. Press Enter, or walk into it, to choose a view and step through.');
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
    const n = night ? 1 : 0;
    if (mode === 'portal') return ghost ? undefined : drawIntoPortal(c, x, y);
    const wading = !jump.air && wet === 1;
    if (!jump.air && wet === 2) return drawSwimmer(c, x, y, ghost);
    // The shadow stays on the ground and shrinks as you rise (in the shallows, the water hides it).
    if (!ghost && !wading) {
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
      // A double jump spins you round, a quarter turn at a time.
      const face = jump.spinT >= 0 ? SPIN[(SPIN.indexOf(facing) + 1 + Math.floor((jump.spinT / 0.3) * 4)) % 4] : facing;
      const frames = night ? hero.framesNight[face] : hero.frames[face];
      let step = moving && !jump.air ? Math.floor(walked / STRIDE) % 4 : 0;
      if (!moving && motion && idleT > 0.4 && Math.floor(time * 1.6) % 3 === 2) step = 4;
      img = frames[step];
    }
    // Squash on landing, stretch on the way up: two pixels either way.
    const squash = motion && mode === 'play' ? (jump.landT >= 0 && jump.landT < 0.09 ? 2 : jump.air && jump.vy > JUMP.v * 0.6 ? -2 : 0) : 0;
    // Wading, the water comes up over your feet.
    const cut = wading ? 3 : 0;
    c.drawImage(img, 0, 0, hero.w, hero.h - cut, x - ((hero.w + squash) >> 1), y - hero.h + squash + 1 - lift, hero.w + squash, hero.h - squash - cut);
    if (ghost) return;
    if (wading) {
      const wy = y - 2 - lift;
      c.fillStyle = UNDER[n];
      c.fillRect(x - 5, wy + 1, 10, 1);
      c.fillStyle = FOAM[n];
      c.fillRect(x - 6, wy, 12, 1);
    }
    drawSpray(c);
    if (puff.t >= 0) {
      // The double jump's puff: a little cloud of air left where you kicked off it.
      const k = puff.t / 0.32;
      const px = bx(puff.x);
      const py = by(puff.z) - Math.round(puff.y) - 1;
      const off = 3 + Math.round(k * 6);
      const fall = Math.round(k * 3);
      c.globalAlpha = 1 - k;
      c.fillStyle = night ? '#c9cfe8' : '#ffffff';
      c.fillRect(px - off - 3, py, 3, 1);
      c.fillRect(px + off, py, 3, 1);
      c.fillRect(px - off, py + 1 + fall, 2, 1);
      c.fillRect(px + off - 2, py + 1 + fall, 2, 1);
      c.fillRect(px - 1, py + 2 + fall, 3, 1);
      c.globalAlpha = 1;
    }
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

  /** Afloat: head and shoulders above the water, bobbing, arms taking turns to pull. */
  function drawSwimmer(c: CanvasRenderingContext2D, x: number, y: number, ghost: boolean) {
    const n = night ? 1 : 0;
    const bob = motion ? (Math.sin(time * 3.1) > 0.35 ? -1 : 0) + (kickT >= 0 && kickT < 0.2 ? -1 : 0) : 0;
    const wy = y - 3 + bob;
    const img = (night ? hero.framesNight : hero.frames)[facing][0];
    c.drawImage(img, 0, 0, hero.w, SWIM_ROWS, x - (hero.w >> 1), wy - SWIM_ROWS, hero.w, SWIM_ROWS);
    if (ghost) return;
    // Where the water meets you: a bright line, and the body's shadow just under it.
    c.fillStyle = UNDER[n];
    c.fillRect(x - 6, wy + 1, 12, 1);
    c.fillStyle = FOAM[n];
    c.fillRect(x - 7, wy, 14, 1);
    // Hands: one reaches forward while the other pulls back. Treading water, they sway.
    const s = moving ? stroke % 1 : (Math.sin(time * 2.2) + 1) / 2;
    const left = moving ? (s < 0.5 ? 2 : 0) : Math.round(s);
    const right = moving ? (s < 0.5 ? 0 : 2) : Math.round(1 - s);
    hand(c, x - 10, wy - 1 - left, n);
    hand(c, x + 8, wy - 1 - right, n);
    drawSpray(c);
  }

  function hand(c: CanvasRenderingContext2D, x: number, y: number, n: number) {
    c.fillStyle = HEX.ink;
    c.fillRect(x, y - 1, 2, 1);
    c.fillRect(x - 1, y, 1, 1);
    c.fillRect(x + 2, y, 1, 1);
    c.fillStyle = n ? '#b3b9d1' : '#fffaf1';
    c.fillRect(x, y, 2, 1);
    c.fillStyle = FOAM[n];
    c.fillRect(x - 1, y + 1, 4, 1);
  }

  function drawSpray(c: CanvasRenderingContext2D) {
    c.fillStyle = night ? FOAM[1] : '#ffffff';
    for (const d of drops) {
      if (d.life <= 0) continue;
      c.fillRect(bx(d.x) + Math.round(d.ox), by(d.z) - 2 + Math.round(d.oy) - Math.round(d.h), 1, 1);
    }
  }

  /** Stepping into the portal: drawn in, shrinking and turning, toward the middle of the swirl. */
  function drawIntoPortal(c: CanvasRenderingContext2D, x: number, y: number) {
    if (!portal) return;
    const k = motion ? Math.min(1, modeT / 0.42) : 1;
    const e = k * k;
    const face = motion ? SPIN[(SPIN.indexOf('up') + Math.floor(k * 6)) % 4] : 'up';
    const img = (night ? hero.framesNight : hero.frames)[face][0];
    const sc = 1 - 0.85 * e;
    const w = Math.max(1, Math.round(hero.w * sc));
    const h = Math.max(1, Math.round(hero.h * sc));
    const tx = bx(portal.at.x) + portalArt.cx;
    const ty = by(portal.at.z) + portalArt.cy;
    const fx = x;
    const fy = y - (hero.h >> 1);
    c.drawImage(img, Math.round(fx + (tx - fx) * e) - (w >> 1), Math.round(fy + (ty - fy) * e) - (h >> 1), w, h);
  }

  /** Dust from running feet: a little puff that drifts up and thins out. */
  function drawDust(c: CanvasRenderingContext2D) {
    c.fillStyle = night ? '#8f97b8' : '#f3e2bd';
    for (const d of dust) {
      if (d.t >= 1) continue;
      const x = bx(d.x) + d.side * 3;
      const y = by(d.z) - 1 - Math.round(d.t * 3);
      const r = d.t < 0.4 ? 1 : 2;
      c.globalAlpha = (1 - d.t) * 0.85;
      c.fillRect(x - r, y, r * 2 + 1, 1);
      if (r > 1) c.fillRect(x - 1, y - 1, 3, 1);
    }
    c.globalAlpha = 1;
  }

  /** Rings spreading on the water: dotted ellipses that widen and fade. */
  function drawRipples(c: CanvasRenderingContext2D) {
    c.fillStyle = FOAM2[night ? 1 : 0];
    for (const r of rings) {
      if (r.t >= 1) continue;
      const rx = (r.big ? 5 : 4) + r.t * (r.big ? 13 : 8);
      const ry = rx * 0.42;
      const x = bx(r.x);
      const y = by(r.z) - 2;
      if (x + rx < 0 || x - rx > bw || y + ry < 0 || y - ry > bh) continue;
      c.globalAlpha = (1 - r.t) * 0.9;
      const m = Math.max(12, Math.round(rx * 2.4));
      for (let i = 0; i < m; i++) {
        if ((i & 3) === 3) continue; // broken, like a real ripple
        const a = (i / m) * Math.PI * 2;
        c.fillRect(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * ry), 1, 1);
      }
    }
    c.globalAlpha = 1;
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

  /**
   * Is there open water at map pixel (i, j)? Inside the painted map the
   * terrain says (2 for water deep enough to glint, 1 for any); past it, it's
   * all open sea.
   */
  const openAt = (i: number, j: number, need: number) => (i < 0 || j < 0 || i >= W || j >= H ? true : terrain.open[j * W + i] >= need);

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
    // Glints on the open sea: one to a cell, jittered, so they never line up, and they carry
    // on past the painted map as far as the eye can see.
    c.fillStyle = night ? '#4c6c9a' : HEX.wave;
    for (let cj = Math.floor(bufT / 11); cj <= Math.floor((bufT + bh) / 11); cj++) {
      for (let ci = Math.floor((bufL - 2) / 10); ci <= Math.floor((bufL + bw + 2) / 10); ci++) {
        const i = ci * 10 + Math.floor(hash2(ci, cj, 54) * 10);
        const j = cj * 11 + Math.floor(hash2(ci, cj, 55) * 11);
        if (!openAt(i, j, 2)) continue;
        const ph0 = hash2(ci, cj, 52);
        const ph = motion ? (time * 0.45 + ph0) % 1 : ph0;
        if (ph > 0.4) continue;
        const len = GLINT_LEN[Math.floor((ph / 0.4) * 4)];
        c.fillRect(i - bufL - (len >> 1), j - bufT, len, 1);
      }
    }
    if (!night) return;
    // Stars on the water, the same way.
    c.fillStyle = HEX.star;
    for (let cj = Math.floor(bufT / 16); cj <= Math.floor((bufT + bh) / 16); cj++) {
      for (let ci = Math.floor((bufL - 2) / 16); ci <= Math.floor((bufL + bw + 2) / 16); ci++) {
        const i = ci * 16 + Math.floor(hash2(ci, cj, 56) * 16);
        const j = cj * 16 + Math.floor(hash2(ci, cj, 57) * 16);
        if (!openAt(i, j, 1)) continue;
        const ph = Math.floor(hash2(ci, cj, 53) * 256);
        const tw = motion ? Math.sin(time * (1.3 + (ph & 7) * 0.2) + ph) : 0.5;
        if (tw < -0.2) continue;
        const x = i - bufL;
        const y = j - bufT;
        c.fillRect(x, y, 1, 1);
        if (tw > 0.85) {
          c.fillRect(x - 1, y, 3, 1);
          c.fillRect(x, y - 1, 1, 3);
        }
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
  for (const l of lamps) pools.push({ x: l.x, z: l.z + 0.1 });
  // The portal lights the plaza violet.
  const glow = (() => {
    const cv = document.createElement('canvas');
    cv.width = pool.width;
    cv.height = pool.height;
    const x = cv.getContext('2d')!;
    x.drawImage(pool, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = 'rgb(84,48,150)';
    x.fillRect(0, 0, cv.width, cv.height);
    return cv;
  })();
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
    if (portal) {
      c.globalAlpha = motion ? 0.85 + Math.sin(time * 1.7) * 0.15 : 1;
      c.drawImage(glow, bx(portal.at.x) - (glow.width >> 1), by(portal.at.z) - (glow.height >> 1) + 2);
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
    // The open sea, past the painted map: the same deep blue its edges fade to.
    c.fillStyle = DEEP[night ? 1 : 0];
    c.fillRect(0, 0, bw, bh);
    c.drawImage(night ? terrain.night() : terrain.day, bufL, bufT, bw, bh, 0, 0, bw, bh);
    drawWater(c);
    drawRipples(c);
    drawDust(c);
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
    // In a building (or on the way), the explorer is drawn with the room: see drawRoom.
    if (!insideOf) dynShown.push(heroThing);
    if (bottlePlace) dynShown.push(crabThing);
    for (let i = 0; i < words.length; i++) if (words[i].here) dynShown.push(wordThings[i]);
    dynShown.push(...walkers.things);
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
    if (!insideOf) {
      c.globalAlpha = 0.4;
      drawHero(c, true);
      c.globalAlpha = 1;
    }
    if (night) {
      if (store.state.progress.night) drawFlies(c);
      drawLighthouseBeam(c);
    }
    if (insideOf && inside) drawRoom(c, insideOf, inside);
  }

  /**
   * A building opening up (or open): the island round it dims, the room
   * grows out of the building's walls, the walls fade and the roof lifts off.
   * On the way in or out the explorer is drawn here too, over it all.
   */
  function drawRoom(c: CanvasRenderingContext2D, m: MapPlace, room: Inside) {
    const k = openK;
    const r = room.room;
    const a = art.get(m.place.id)!;
    const s = a.sprite;
    const x = roomAt.x - bufL;
    const y = roomAt.y - bufT;
    c.fillStyle = night ? 'rgb(4,6,22)' : 'rgb(38,26,16)';
    c.globalAlpha = Math.min(1, k / 0.6) * (night ? 0.45 : 0.38);
    c.fillRect(0, 0, bw, bh);
    c.globalAlpha = 1;
    // The building's top-left, its walls' top and its sides, in buffer pixels.
    const sx = bx(m.base.x) - s.ax;
    const sy = by(m.base.z) - s.ay;
    const roof = a.roof ?? s.h >> 1;
    const hw = Math.round(HALF_WIDTH[m.kind] * TEX);
    const walls = { x: bx(m.base.x) - hw - x, y: sy + roof - y, w: hw * 2, h: r.h - (sy + roof - y) };
    const clip = k < 1 ? openRect(ease(Math.max(0, k - 0.1) / 0.9), walls, { x: 0, y: 0, w: r.w, h: r.h }) : undefined;
    room.draw(c, { x, y, scale: 1 }, { time, night, clip, hero: mode === 'inside' });
    if (k < 1) {
      const img = night ? s.night : s.day;
      // The walls dissolve into the room behind them...
      dissolve(c, img, roof, s.h - roof, sx, sy + roof, 1 - Math.min(1, Math.max(0, (k - 0.15) / 0.3)));
      // ...and the roof lifts off.
      const lift = Math.min(1, k / 0.4);
      dissolve(c, img, 0, roof, sx, sy - Math.round(14 * lift * (2 - lift)), 1 - lift);
    }
    if (mode === 'door') {
      // Lit by the room once you're in the door.
      const was = night;
      if (openDir > 0 && k > 0.3) night = false;
      drawHero(c);
      night = was;
    }
  }

  // Fading a building away a dither at a time, the old way, not with see-through
  // pixels: rows y..y+h of a sprite through a 4x4 Bayer mask with `k` of it kept.
  const fadeCv = document.createElement('canvas');
  const fc = fadeCv.getContext('2d')!;
  const masks: CanvasPattern[] = [];
  function dissolve(c: CanvasRenderingContext2D, img: HTMLCanvasElement, y: number, h: number, dx: number, dy: number, k: number) {
    const level = Math.round(Math.min(1, Math.max(0, k)) * 16);
    const w = img.width;
    if (level <= 0 || h <= 0) return;
    if (level >= 16) return c.drawImage(img, 0, y, w, h, dx, dy, w, h);
    if (fadeCv.width < w || fadeCv.height < h) {
      fadeCv.width = Math.max(fadeCv.width, w);
      fadeCv.height = Math.max(fadeCv.height, h);
    }
    if (!masks[level]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 4;
      const m = cv.getContext('2d')!;
      m.fillStyle = '#000';
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (bayer(i, j) < level / 16) m.fillRect(i, j, 1, 1);
      masks[level] = fc.createPattern(cv, 'repeat')!;
    }
    fc.clearRect(0, 0, w, h);
    fc.drawImage(img, 0, y, w, h, 0, 0, w, h);
    fc.globalCompositeOperation = 'destination-in';
    fc.fillStyle = masks[level];
    fc.fillRect(0, 0, w, h);
    fc.globalCompositeOperation = 'source-over';
    c.drawImage(fadeCv, 0, 0, w, h, dx, dy, w, h);
  }

  function drawThing(c: CanvasRenderingContext2D, th: Thing) {
    if (th === heroThing) return drawHero(c);
    // A building with its room open is drawn with the room.
    if (insideOf && th === landmarkThing.get(insideOf.place.id)) return;
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
    // The camera: eased toward the explorer (or snapped, with reduced motion), or on the room.
    aimCamera();
    const v = view();
    Z = v.z;
    viewL = v.l;
    viewT = v.t;
    sizeBuffers(Z);
    bufL = Math.floor(viewL);
    bufT = Math.floor(viewT);
    const ox = -Math.round((viewL - bufL) * Z);
    const oy = -Math.round((viewT - bufT) * Z);

    // Day and night are drawn apart and mixed at map resolution, then scaled up once.
    let out = buf;
    if (nightK < 1) {
      night = false;
      drawScene(b);
    }
    if (nightK > 0) {
      night = true;
      drawScene(bN);
      if (nightK < 1) {
        b.globalAlpha = nightK;
        b.drawImage(bufN, 0, 0, bw, bh, 0, 0, bw, bh);
        b.globalAlpha = 1;
      } else out = bufN;
    }
    blit(out, ox, oy);

    // HTML bits follow the map. On the pier the door and the fishing spot
    // are close: only the nearer one gets a prompt.
    let fp: FishPrompt = null;
    if (mode === 'play' && fishSpot) {
      if (fishing.phase === 'bite') fp = 'bite';
      else if (fishing.phase === 'cast' || fishing.phase === 'wait') fp = 'wait';
      else if (fishing.phase === 'idle' && atFishing()) fp = 'cast';
    }
    let tagFor = mode !== 'cheer' && !insideOf && near && near.place.id !== dismissed ? near : null;
    if (tagFor && fp && (fp !== 'cast' || Math.hypot(pos.x - fishSpot!.at.x, pos.z - fishSpot!.at.z) < Math.hypot(pos.x - tagFor.door.x, pos.z - tagFor.door.z))) tagFor = null;
    if (tagFor && fp === 'cast') fp = null;
    tagPlace = tagFor;
    tagPortal = mode === 'play' && nearPortal && dismissed !== 'portal';
    if (tagFor) {
      const a = art.get(tagFor.place.id)!;
      const p = toScreen(tagFor.base.x, tagFor.base.z - (a.sprite.ay - a.top) / TEX, scratch);
      overlay.tag(tagFor.place, p.x, p.y);
    } else if (tagPortal && portal) {
      const p = toScreen(portal.at.x, portal.at.z - (portalArt.ring.ay - 1) / TEX, scratch);
      overlay.tag(portalTag, p.x, p.y);
    } else overlay.tag(null);
    if (fp) {
      const p = toScreen(pos.x, pos.z - 2.3, scratch);
      overlay.fish(fp, p.x, p.y);
    } else overlay.fish(null);
    games.render((x, z) => toScreen(x, z, scratch), mode === 'play' && !tagFor && !tagPortal);
    walkers.render((x, z) => toScreen(x, z, scratch), mode === 'play' && !tagFor && !tagPortal && !games.open && !insideOf);
  }

  /**
   * The buffer onto the screen, Z device pixels to a map pixel. At a whole
   * Z (always, at rest) that's a straight nearest-neighbour scale. Part way
   * through a zoom it's blown up to the next whole scale first, then eased
   * down the rest of the way, so every map pixel stays a square: the same
   * size as its neighbours, with edges soft by at most a device pixel,
   * rather than some a pixel wider than others and shimmering as they move.
   */
  function blit(src: HTMLCanvasElement, ox: number, oy: number) {
    if (Number.isInteger(Z)) {
      g.drawImage(src, 0, 0, bw, bh, ox, oy, bw * Z, bh * Z);
      return;
    }
    const n = Math.ceil(Z);
    if (up.width < bw * n || up.height < bh * n) {
      up.width = Math.max(up.width, bw * n);
      up.height = Math.max(up.height, bh * n);
    }
    u.imageSmoothingEnabled = false;
    u.drawImage(src, 0, 0, bw, bh, 0, 0, bw * n, bh * n);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'low';
    g.drawImage(up, 0, 0, bw * n, bh * n, ox, oy, bw * Z, bh * Z);
    g.imageSmoothingEnabled = false;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // The frame's timestamp can come a hair before the start time: never step backwards.
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
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
    // With a room open the camera's on the room (see view()); `cam` keeps its place outside, for the way back.
    if (!insideOf) {
      cam.x = motion ? damp(cam.x, camGoal.x, 5, dt) : camGoal.x;
      cam.z = motion ? damp(cam.z, camGoal.z, 5, dt) : camGoal.z;
    }
    render();
    presence(now);
    if (!readied) {
      readied = true;
      ctx.ready(returning ? clampToView(doorScreen(returning)) : arrived ? clampToView(portalScreen()) : undefined);
    }
  }

  // Inside a building in another view (and not just back from its page or through the portal): still inside here.
  {
    const inAt = store.state.presence.inside;
    const m = inAt ? byId.get(inAt) : null;
    if (m?.place.interior && !returning && !arrived) openRoom(m, { snap: true, quiet: true });
    else if (inAt) store.dispatch({ type: 'inside', at: null });
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
      player: () => ({ x: pos.x, z: pos.z, air: jump.y, twice: jump.twice, wet, vx: vel.x, vz: vel.z, facing, run: runK }),
      swimRoom: () => geo.swimRoom(pos.x, pos.z),
      heroScreen: () => toScreen(pos.x, pos.z),
      portal: () => ({ near: nearPortal, tag: tagPortal, choosing, screen: portal ? portalScreen() : null }),
      teleport: (x: number, z: number) => {
        pos.x = x;
        pos.z = z;
        path = null;
        if (!jump.air) wet = wetAt(x, z);
        aimCamera();
        cam.x = camGoal.x;
        cam.z = camGoal.z;
      },
      screen: (id: string) => {
        const m = byId.get(id);
        return m ? doorScreen(m) : null;
      },
      walkTo: (x: number, z: number) => walkTo(x, z),
      path: () => (path ? path.slice(pathIx) : null),
      near: () => near?.place.id ?? null,
      mode: () => mode,
      /** Inside a building: where, where you're standing in the room, who's within reach, and whether you're talking. */
      inside: () => (inside && insideOf && openDir >= 0 ? { at: insideOf.place.id, x: inside.pos.x, z: inside.pos.z, within: inside.within?.id ?? null, busy: ctx.ui.room.busy } : null),
      /** In a room: walk over to someone or something and talk to it or look at it, as a tap would. */
      approach: (id: string) => inside?.go(id) ?? false,
      /** In a room: where a room point is on screen. */
      roomScreen: (x: number, z: number) => inside?.point(x, z, roomFrame()) ?? null,
      /** Go straight into a building (as if through its door). */
      enter: (id: string) => {
        const m = byId.get(id);
        if (m?.place.interior && mode === 'play') openRoom(m, { snap: true });
        return !!inside;
      },
      fishing: () => fishing.phase,
      games: () => games.debug(),
      gates: () => gates.debug(),
      play: (id: Parameters<typeof games.play>[0]) => games.play(id),
      /** People out walking: where each is, and talking to one (walking over first if need be). */
      wanderers: () => walkers.debug(),
      talk: (id: string) => walkers.talk(id),
      frames: () => frames,
      /** How long the ground took to paint, and how big it is, in map pixels. */
      paint: () => ({ ms: Math.round(paintMs), w: W, h: H }),
      scale: () => ({ S, Z, dpr, bw, bh }),
      places: () => places.map((m) => ({ id: m.place.id, door: m.door, worldDoor: m.worldDoor, base: m.base })),
      canStand,
      /**
       * Every sprite, big, on a sheet over the page (for reviewing the art). `only`: just one place's
       * landmark (by id), 'bridge' for Tower Bridge and the street furniture, or 'hero' for the explorer as dressed.
       */
      sheet: (zoom = 4, nightToo = false, only?: string) => {
        const all: HTMLCanvasElement[] = [];
        if (only === 'hero') {
          for (const f of ['down', 'up', 'left', 'right'] as Facing[]) all.push(...hero.frames[f]);
          all.push(hero.cheer);
        } else if (only) {
          const sprites = only === 'bridge' ? extras : [art.get(only)?.sprite].filter((s): s is Sprite => !!s);
          for (const s of sprites) all.push(s.day);
          if (nightToo) for (const s of sprites) all.push(s.night);
        } else {
          for (const a of art.values()) all.push(a.sprite.day);
          for (const k of Object.values(scenery)) for (const s of k) all.push(s.day);
          all.push(boat.day, scrollArt.day, crabArt[0].day, crabArt[1].day, portalArt.ring.day, ...portalArt.swirl.slice(0, 3));
          for (const s of extras) all.push(s.day);
          for (const f of ['down', 'up', 'left', 'right'] as Facing[]) all.push(...hero.frames[f]);
          all.push(hero.cheer);
          if (nightToo) for (const a of art.values()) all.push(a.sprite.night);
        }
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
      unhold();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      overlay.destroy();
      boatCard.destroy();
      games.destroy();
      walkers.destroy();
      root.remove();
      if (debug) delete (window as unknown as { __map?: unknown }).__map;
    },
  };
}
