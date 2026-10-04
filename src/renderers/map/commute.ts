// The commute, in pixels: the railway, the station platform and the quay are
// painted into the ground once (paintCommute); the station shelter and the
// red double-decker are sprites like any other; and the train is drawn fresh
// each frame, pixel by pixel along the track, wherever src/world/train.ts
// says its cars are.

import type { Geo } from '../../world/geo';
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
 * crosses), the station platform and the stone quay into the ground.
 * `codes` are the ground kinds to mark those pixels with.
 */
export function paintCommute(
  geo: Geo,
  pix: Pix,
  ground: Uint8Array,
  rect: { x0: number; z0: number; tex: number },
  codes: { rail: number; quay: number },
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
}

// ---------- Sprites ----------

function finish(p: Pix, ax: number, ay: number): Sprite {
  p.outline(INK);
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data, LIGHTS)), data: p.data };
}

const BUS_RED = col('#d0232c');
const BUS_RED_DARK = col('#a3161f');
const BUS_RED_LIGHT = col('#ef4a4f');
const CREAM = col('#efe4c8');
const TYRE = col('#26262a');
const HUB = col('#b9bcc2');

/** The red double-decker, side on, nose to the east. Anchored on the middle of its kerbside wheels. */
export function bus(): Sprite {
  const L = 34;
  const p = new Pix(L + 2, 26);
  // Roof (seen a little from above), body, cream band between the decks, skirt.
  p.rect(2, 1, L - 3, 4, BUS_RED_LIGHT);
  p.rect(1, 4, L - 1, 17, BUS_RED);
  p.hline(1, L - 1, 12, CREAM);
  p.rect(1, 19, L - 1, 2, BUS_RED_DARK);
  // Upper deck windows.
  for (let x = 3; x < L - 3; x += 5) {
    p.rect(x, 6, 4, 4, GLASS);
    p.px(x, 6, GLASS_SHINE);
  }
  // Lower deck windows, then the open platform at the back (west end).
  for (let x = 7; x < L - 6; x += 5) {
    p.rect(x, 14, 4, 4, GLASS);
    p.px(x, 14, GLASS_SHINE);
  }
  p.rect(1, 13, 4, 7, col('#3a2e2a'));
  p.vline(4, 13, 19, CREAM);
  // Cab window and a headlamp at the front.
  p.rect(L - 4, 14, 3, 4, GLASS);
  p.px(L - 1, 19, HEADLAMP);
  p.px(L - 1, 18, HEADLAMP);
  // A destination blind above the cab, blank but lit.
  p.rect(L - 6, 10, 5, 1, HEADLAMP);
  // Wheels.
  for (const cx of [7, L - 7]) {
    p.ellipse(cx, 21.5, 3, 3, TYRE);
    p.rect(cx - 1, 21, 2, 2, HUB);
  }
  const s = finish(p, Math.round(L / 2), 24);
  // A soft shadow under it (painted after the outline, so it stays soft).
  return withShadow(s, 17, 3);
}

function withShadow(s: Sprite, rx: number, ry: number): Sprite {
  const p = new Pix(s.w, s.h + 2);
  p.ellipse(s.ax + 0.5, s.ay, rx, ry, SHADOW);
  const src = new Pix(s.w, s.h);
  src.data.set(s.data);
  p.stamp(src, 0, 0);
  return { ...s, h: p.h, day: p.canvas(), night: p.canvas(nightData(p.data, LIGHTS)), data: p.data };
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
