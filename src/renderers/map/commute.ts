// The commute, in pixels: the railway, the station platform, the quay and the
// bus's road round Little London (with its zebra crossing and the yellow box
// at the stop) are painted into the ground once (paintCommute); the station
// shelter and the bus stop are sprites like any other; and the train and the
// red double-decker are drawn fresh each frame, pixel by pixel, wherever
// src/world/train.ts and src/world/bus.ts say they are.

import { BUS_LEN, BUS_W } from '../../world/bus';
import { ROAD_HALF, type Geo } from '../../world/geo';
import type { CarKind } from '../../world/train';
import { CAR_LEN } from '../../world/train';
import { col, nightColor, nightData, Pix, toHex, type Color } from './pixels';
import { hash2 } from './rng';
import type { Sprite } from './sprites';

const INK = col('#3a2a24');
const SHADOW = col('#2a1d10', 46);

const BALLAST = col('#b8ab95');
const BALLAST_DARK = col('#9b8f7b');
const BALLAST_LIGHT = col('#cbbfaa');
const SLEEPER = col('#7a573c');
const RAIL = col('#7d838c');
const RAIL_SHINE = col('#d9dee4');
const PLANK = col('#b08a5e');
const QUAY = col('#cbc3b5');
const QUAY_LIGHT = col('#ddd6ca');
const QUAY_DARK = col('#a79f91');
const KERB = col('#ece6da');
const BOLLARD = col('#3d3a36');
const PLATFORM = col('#d3c7b1');
const PLATFORM_EDGE = col('#f2d24a');
const TARMAC = col('#5d5852');
const TARMAC_DARK = col('#55504b');
const TARMAC_LIGHT = col('#66615b');
const ROAD_KERB = col('#d8d0c2');
const ROAD_LINE = col('#f2eee4');
const BOX_YELLOW = col('#f2c14e');

/** Glass and lamps that glow after dark, here and on the sprites below. */
const GLASS = col('#3d4f63');
const GLASS_SHINE = col('#6f8aa6');
const HEADLAMP = col('#fff2c8');
const LIGHTS = new Map<Color, Color>([
  [GLASS, col('#ffcf6e')],
  [GLASS_SHINE, col('#ffe6a2')],
  [HEADLAMP, col('#fffbe6')],
]);

/**
 * Paint the railway (ballast, sleepers, rails, and boards where a path
 * crosses), the station platform, the stone quay and the bus's road (tarmac
 * with a kerb, dashed white edges, a zebra crossing where a path crosses it,
 * and a yellow box at the stop) into the ground.
 * `codes` are the ground kinds to mark those pixels with.
 */
export function paintCommute(
  geo: Geo,
  pix: Pix,
  ground: Uint8Array,
  rect: { x0: number; z0: number; tex: number },
  codes: { rail: number; quay: number; road: number },
) {
  const { W, H } = { W: pix.w, H: pix.h };
  const wx = (i: number) => rect.x0 + (i + 0.5) / rect.tex;
  const wz = (j: number) => rect.z0 + (j + 0.5) / rect.tex;
  const toI = (x: number) => Math.floor((x - rect.x0) * rect.tex);
  const toJ = (z: number) => Math.floor((z - rect.z0) * rect.tex);

  const rail = geo.rail;
  if (rail) {
    const pts = rail.points;
    const n = pts.length;
    const step = rail.length / n;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) (x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (z0 = Math.min(z0, p.z)), (z1 = Math.max(z1, p.z));
    for (let j = Math.max(0, toJ(z0 - 1.2)); j <= Math.min(H - 1, toJ(z1 + 1.2)); j++) {
      for (let i = Math.max(0, toI(x0 - 1.2)); i <= Math.min(W - 1, toI(x1 + 1.2)); i++) {
        const x = wx(i);
        const z = wz(j);
        // Nearest segment: how far along the loop, and how far to one side.
        let best = Infinity;
        let along = 0;
        let side = 0;
        for (let k = 0; k < n; k++) {
          const a = pts[k];
          const b = pts[(k + 1) % n];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const L2 = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
          const px = a.x + dx * t - x;
          const pz = a.z + dz * t - z;
          const d2 = px * px + pz * pz;
          if (d2 < best) {
            best = d2;
            along = (k + t) * step;
            side = (dx * (z - a.z) - dz * (x - a.x)) / Math.sqrt(L2);
          }
        }
        const d = Math.abs(side);
        if (d > 0.95) continue;
        const k = j * W + i;
        ground[k] = codes.rail;
        const e = hash2(i, j, 61);
        let c = e < 0.18 ? BALLAST_DARK : e > 0.9 ? BALLAST_LIGHT : BALLAST;
        if (d < 0.74 && ((along / 0.55) % 1) < 0.36) c = SLEEPER;
        if (Math.abs(d - 0.5) < 0.07) c = side > 0 ? RAIL : RAIL_SHINE;
        pix.data[k] = c;
      }
    }
    // Level crossings: boards across the line where a path crosses it.
    for (const c of geo.crossings) {
      const ux = Math.sin(c.along);
      const uz = Math.cos(c.along);
      for (let j = toJ(c.z - 1.3); j <= toJ(c.z + 1.3); j++) {
        for (let i = toI(c.x - 1.3); i <= toI(c.x + 1.3); i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const dx = wx(i) - c.x;
          const dz = wz(j) - c.z;
          const a = dx * ux + dz * uz; // along the path
          const b = dx * uz - dz * ux; // across it
          if (Math.abs(a) > 1.0 || Math.abs(b) > 0.8 || geo.railDist(wx(i), wz(j)) > 0.95) continue;
          const k = j * W + i;
          pix.data[k] = Math.abs(geo.railDist(wx(i), wz(j)) - 0.5) < 0.07 ? RAIL_SHINE : (j + i) % 5 === 0 ? SLEEPER : PLANK;
        }
      }
    }
    // The platform, along the outside of the line at the station.
    const st = geo.station;
    if (st) {
      const at = rail.at(st.s);
      const ux = Math.sin(at.yaw);
      const uz = Math.cos(at.yaw);
      const nx = Math.cos(at.yaw) * at.out;
      const nz = -Math.sin(at.yaw) * at.out;
      for (let j = toJ(at.z - 4); j <= toJ(at.z + 4); j++) {
        for (let i = toI(at.x - 4); i <= toI(at.x + 4); i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const dx = wx(i) - at.x;
          const dz = wz(j) - at.z;
          const a = dx * ux + dz * uz;
          const b = dx * nx + dz * nz;
          if (Math.abs(a) > 3.2 || b < 0.95 || b > 2.25) continue;
          const k = j * W + i;
          pix.data[k] = b < 1.08 ? PLATFORM_EDGE : (Math.floor(a * 2) + Math.floor(b * 3)) % 7 === 0 ? QUAY_DARK : PLATFORM;
        }
      }
    }
  }

  const q = geo.quay;
  if (q) {
    for (let j = Math.max(0, toJ(q.z0)); j <= Math.min(H - 1, toJ(q.z1)); j++) {
      for (let i = Math.max(0, toI(q.x0)); i <= Math.min(W - 1, toI(q.x1)); i++) {
        const x = wx(i);
        const z = wz(j);
        if (geo.quayDist(x, z) > 0) continue;
        const k = j * W + i;
        ground[k] = codes.quay;
        // Stones laid in staggered courses of 6 by 4 pixels.
        const row = Math.floor(j / 4);
        const gx = (i + (row % 2) * 3) % 6 === 0;
        const gy = j % 4 === 0;
        let c = gx || gy ? QUAY_DARK : hash2(Math.floor((i + (row % 2) * 3) / 6), row, 67) < 0.2 ? QUAY_LIGHT : QUAY;
        // A pale kerb along the seaward edges, with bollards.
        const edge = Math.min(q.z1 - z, q.x1 - x);
        if (edge < 0.2) c = KERB;
        else if (edge < 0.55 && Math.abs(((q.z1 - z < q.x1 - x ? x - q.x0 : z - q.z0) % 1.6) - 0.8) < 0.16) c = BOLLARD;
        pix.data[k] = c;
      }
    }
  }

  const road = geo.road;
  if (road) {
    const pts = road.points;
    const n = pts.length;
    const step = road.length / n;
    const stop = geo.busStop;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) (x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (z0 = Math.min(z0, p.z)), (z1 = Math.max(z1, p.z));
    const edge = ROAD_HALF + 0.16;
    // Where a painted path crosses the road, a zebra crossing: how far round the road, or none.
    const zebras: number[] = [];
    for (let j = Math.max(0, toJ(z0 - 1.5)); j <= Math.min(H - 1, toJ(z1 + 1.5)); j++) {
      for (let i = Math.max(0, toI(x0 - 1.5)); i <= Math.min(W - 1, toI(x1 + 1.5)); i++) {
        const x = wx(i);
        const z = wz(j);
        // Nearest segment: how far along the loop, and how far to one side.
        let best = Infinity;
        let along = 0;
        let side = 0;
        for (let k = 0; k < n; k++) {
          const a = pts[k];
          const b = pts[(k + 1) % n];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const L2 = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
          const px = a.x + dx * t - x;
          const pz = a.z + dz * t - z;
          const d2 = px * px + pz * pz;
          if (d2 < best) {
            best = d2;
            along = (k + t) * step;
            side = (dx * (z - a.z) - dz * (x - a.x)) / Math.sqrt(L2);
          }
        }
        const d = Math.abs(side);
        if (d > edge) continue;
        const k = j * W + i;
        if (d < ROAD_HALF && ground[k] === codes.road && !zebras.some((s) => Math.abs(s - along) < 3)) zebras.push(along);
        ground[k] = codes.road;
        const e = hash2(i, j, 71);
        let c = d > ROAD_HALF ? ROAD_KERB : e < 0.16 ? TARMAC_DARK : e > 0.92 ? TARMAC_LIGHT : TARMAC;
        if (Math.abs(d - (ROAD_HALF - 0.16)) < 0.06 && (along / 1.2) % 1 < 0.66) c = ROAD_LINE;
        // The yellow box where the bus pulls in, along the kerb at the stop.
        if (stop) {
          const a = Math.abs(((along - stop.s + road.length / 2) % road.length + road.length) % road.length - road.length / 2);
          const outside = side * stop.out < 0 ? 1 : -1; // side is + to the left of the way the road runs, and the stop is on the kerb outside
          const inBox = outside > 0 && d < ROAD_HALF - 0.1 && d > ROAD_HALF - 1.25;
          if (inBox && (Math.abs(a - (BUS_LEN / 2 + 0.3)) < 0.07 || (a < BUS_LEN / 2 + 0.3 && Math.abs(d - (ROAD_HALF - 1.2)) < 0.06))) c = BOX_YELLOW;
        }
        pix.data[k] = c;
      }
    }
    // The zebra crossings: stripes along the road, side by side from kerb to kerb.
    for (const s0 of zebras) {
      const c = road.at(s0);
      const ux = Math.sin(c.yaw);
      const uz = Math.cos(c.yaw);
      for (let j = toJ(c.z - 2); j <= toJ(c.z + 2); j++) {
        for (let i = toI(c.x - 2); i <= toI(c.x + 2); i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const dx = wx(i) - c.x;
          const dz = wz(j) - c.z;
          const a = dx * ux + dz * uz; // along the road
          const b = dx * uz - dz * ux; // across it
          if (Math.abs(a) > 0.65 || Math.abs(b) > ROAD_HALF - 0.08) continue;
          if (((b + ROAD_HALF) / 0.42) % 1 < 0.52) pix.data[j * W + i] = ROAD_LINE;
        }
      }
    }
  }
}

// ---------- Sprites ----------

function finish(p: Pix, ax: number, ay: number): Sprite {
  p.outline(INK);
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data, LIGHTS)), data: p.data };
}

const BUS_RED = col('#d0232c');
const BUS_RED_DARK = col('#a3161f');
const CREAM = col('#efe4c8');

/** The bus stop: a red roundel on a pole beside a little shelter with a red roof and a bench. Small and low, so the bus pulled in behind it still shows. Anchored at the shelter's middle. */
export function busStop(): Sprite {
  const p = new Pix(18, 17);
  // The shelter: a red roof on two posts, glass behind, a bench.
  p.rect(1, 5, 11, 2, BUS_RED);
  p.hline(1, 11, 7, BUS_RED_DARK);
  for (const x of [2, 10]) p.vline(x, 8, 15, STEEL);
  p.rect(3, 8, 7, 5, GLASS);
  p.px(4, 9, GLASS_SHINE);
  p.rect(3, 13, 7, 1, BENCH);
  // The sign on its pole, out by the road: red ring, white bar.
  p.vline(15, 4, 15, STEEL);
  p.ellipse(15, 3, 2, 2, BUS_RED);
  p.hline(13, 17, 3, col('#ffffff'));
  return finish(p, 6, 15);
}

const BUS_ROOF_LIGHT = col('#e8454b');

type BusPalette = { roof: string; light: string; dark: string; glass: string; cream: string; ink: string; shadow: string; lamp: string };
const busDay: BusPalette = { roof: toHex(BUS_RED), light: toHex(BUS_ROOF_LIGHT), dark: toHex(BUS_RED_DARK), glass: toHex(GLASS), cream: toHex(CREAM), ink: toHex(INK), shadow: 'rgba(42,29,16,0.2)', lamp: toHex(HEADLAMP) };
const busNight: BusPalette = {
  roof: toHex(nightColor(BUS_RED)),
  light: toHex(nightColor(BUS_ROOF_LIGHT)),
  dark: toHex(nightColor(BUS_RED_DARK)),
  glass: toHex(LIGHTS.get(GLASS)!),
  cream: toHex(nightColor(CREAM)),
  ink: toHex(nightColor(INK)),
  shadow: 'rgba(0,0,10,0.25)',
  lamp: toHex(LIGHTS.get(HEADLAMP)!),
};

/**
 * Draw the red double-decker from above, wherever src/world/bus.ts says it
 * is: a red roof with a lighter middle, a row of upper-deck windows down each
 * side, a cream band round the edge of the roof, the windscreen at the front
 * and two headlamps. `bx`/`by` turn world units into this buffer's pixels.
 */
export function drawBus(
  c: CanvasRenderingContext2D,
  bus: { x: number; z: number; yaw: number },
  bx: (x: number) => number,
  by: (z: number) => number,
  tex: number,
  isNight: boolean,
) {
  const pal = isNight ? busNight : busDay;
  const halfL = (BUS_LEN * tex) / 2;
  const halfW = (BUS_W * tex) / 2;
  const ux = Math.sin(bus.yaw);
  const uz = Math.cos(bus.yaw);
  for (const pass of ['shadow', 'bus'] as const) {
    // A double-decker is tall: its shadow falls further off than the train's.
    const ox = bx(bus.x) + (pass === 'shadow' ? 2 : 0);
    const oy = by(bus.z) + (pass === 'shadow' ? 3 : 0);
    const step = pass === 'shadow' ? 1 : 0.5;
    for (let a = -halfL; a <= halfL; a += step) {
      for (let b = -halfW; b <= halfW; b += step) {
        let fill: string;
        if (pass === 'shadow') fill = pal.shadow;
        else {
          const edge = Math.abs(b) > halfW - 0.75 || Math.abs(a) > halfL - 0.75;
          if (edge) fill = a > halfL - 0.75 && Math.abs(b) > halfW - 2.5 && Math.abs(b) < halfW - 0.75 ? pal.lamp : pal.ink;
          else if (a > halfL - 3.5) fill = pal.glass; // the windscreen, upstairs at the front
          else if (Math.abs(b) > halfW - 1.75) fill = Math.floor(a + halfL) % 5 < 4 && a > -halfL + 2 ? pal.glass : pal.dark;
          else if (Math.abs(b) > halfW - 2.5 || Math.abs(a) > halfL - 4.5) fill = pal.cream;
          else fill = Math.abs(b) < 1 ? pal.light : pal.roof;
        }
        c.fillStyle = fill;
        const px = Math.round(ox + a * ux + b * uz);
        const py = Math.round(oy + a * uz - b * ux);
        c.fillRect(px, py, 1, 1);
      }
    }
  }
}

const STEEL = col('#5c6168');
const CANOPY = col('#d7262e');
const CANOPY_DARK = col('#a51b22');
const BENCH = col('#8a5a3b');

/** The station's shelter: a red canopy on posts, a bench, a blank name board. Anchored at its middle. */
export function shelter(): Sprite {
  const p = new Pix(24, 20);
  p.rect(1, 1, 22, 3, CANOPY);
  p.hline(1, 22, 4, CANOPY_DARK);
  for (const x of [3, 20]) p.vline(x, 5, 17, STEEL);
  p.rect(7, 12, 10, 2, BENCH);
  p.rect(7, 14, 1, 3, BENCH);
  p.rect(16, 14, 1, 3, BENCH);
  // The board: white with a red bar, no name on it.
  p.rect(8, 6, 8, 3, col('#ffffff'));
  p.hline(8, 15, 8, CANOPY);
  return finish(p, 12, 17);
}

// ---------- The train ----------

const SILVER = col('#cfd4da');
const SILVER_DARK = col('#a1a8b1');
const STRIPE = col('#d7262e');
const NOSE = col('#c81f28');

type Palette = { silver: string; dark: string; stripe: string; nose: string; glass: string; ink: string; shadow: string };
const day: Palette = { silver: toHex(SILVER), dark: toHex(SILVER_DARK), stripe: toHex(STRIPE), nose: toHex(NOSE), glass: toHex(GLASS), ink: toHex(INK), shadow: 'rgba(42,29,16,0.2)' };
const night: Palette = {
  silver: toHex(nightColor(SILVER)),
  dark: toHex(nightColor(SILVER_DARK)),
  stripe: toHex(nightColor(STRIPE)),
  nose: toHex(nightColor(NOSE)),
  glass: toHex(LIGHTS.get(GLASS)!),
  ink: toHex(nightColor(INK)),
  shadow: 'rgba(0,0,10,0.25)',
};

/**
 * Draw the train's cars, seen from above: silver roofs with a red stripe down
 * each side, a row of windows, a red nose on the locomotive and the cab car.
 * `bx`/`by` turn world units into this buffer's pixels.
 */
export function drawTrain(
  c: CanvasRenderingContext2D,
  cars: { kind: CarKind; x: number; z: number; yaw: number }[],
  bx: (x: number) => number,
  by: (z: number) => number,
  tex: number,
  isNight: boolean,
) {
  const pal = isNight ? night : day;
  const halfL = (CAR_LEN * tex) / 2;
  const halfW = 4.5;
  for (const pass of ['shadow', 'car'] as const) {
    for (const car of cars) {
      const ux = Math.sin(car.yaw);
      const uz = Math.cos(car.yaw);
      const ox = bx(car.x) + (pass === 'shadow' ? 1 : 0);
      const oy = by(car.z) + (pass === 'shadow' ? 2 : 0);
      // The nose is at the front of the locomotive and the back of the cab car.
      const noseAt = car.kind === 'loco' ? 1 : car.kind === 'cab' ? -1 : 0;
      const step = pass === 'shadow' ? 1 : 0.5;
      for (let a = -halfL; a <= halfL; a += step) {
        for (let b = -halfW; b <= halfW; b += step) {
          let fill: string;
          if (pass === 'shadow') fill = pal.shadow;
          else {
            const edge = Math.abs(b) > halfW - 0.75 || Math.abs(a) > halfL - 0.75;
            const fa = a * noseAt;
            if (edge) fill = pal.ink;
            else if (noseAt && fa > halfL - 4) fill = fa > halfL - 2.5 && Math.abs(b) < 2.5 ? pal.glass : pal.nose;
            else if (Math.abs(b) > halfW - 1.75) fill = pal.stripe;
            else if (Math.abs(b) > halfW - 2.75) fill = Math.floor(a + halfL) % 4 < 3 && car.kind !== 'loco' ? pal.glass : pal.dark;
            else fill = Math.abs(b) < 0.6 ? pal.dark : pal.silver;
          }
          c.fillStyle = fill;
          // World axes: along the car is (ux, uz), across it is (uz, -ux); one map pixel is 1/tex of a unit.
          const px = Math.round(ox + a * ux + b * uz);
          const py = Math.round(oy + a * uz - b * ux);
          c.fillRect(px, py, 1, 1);
        }
      }
    }
  }
}
