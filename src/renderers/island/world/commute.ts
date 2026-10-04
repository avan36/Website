// The commute: a little railway looping round the new land in the east, with
// a station and a commuter train in silver and red, and a red double-decker
// bus parked on the quay. The train keeps island time: it runs on weekday
// mornings and evenings and waits at the platform the rest of the day (see
// src/world/clock.ts). At night the windows, the station lamp and the bus's
// lights glow like the rest of the island.
//
// Everything stands where src/world/geo.ts says: the track's loop, the
// station, the level crossings where paths cross the line, and the quay.

import { BoxGeometry as ThreeBox, BufferAttribute, BufferGeometry, Color, Group, MeshBasicMaterial, type Object3D } from 'three';
import { readGeo } from '../../../world/client';
import { CAR_LEN, CARS, createTrain, type CarKind } from '../../../world/train';
import type { Glow } from '../landmarks/builders';
import { Kit } from './kit';
import { smoothstep } from '../util/math';

const geo = readGeo();

/** Half the distance between the rails. */
const GAUGE = 0.5;
const CAR_W = 1.12;

const SILVER = '#c9ced4';
const SILVER_DARK = '#9aa1aa';
const RED = '#d7262e';
const GLASS = '#26313b';
const BUS_RED = '#cf1f2a';
const CREAM = '#efe4c8';

const DAY_GLASS = new Color('#5a6d7d');
const NIGHT_GLASS = new Color('#ffd27e');

/** A flat strip of ballast under the track: a ribbon round the loop. */
function ballast(points: { x: number; z: number }[], y: number, half: number) {
  const n = points.length;
  const pos: number[] = [];
  const side = (i: number) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    return { nx: dz / L, nz: -dx / L };
  };
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const s0 = side(i);
    const s1 = side(i + 1);
    const a = [p.x + s0.nx * half, y, p.z + s0.nz * half];
    const b = [p.x - s0.nx * half, y, p.z - s0.nz * half];
    const c = [q.x + s1.nx * half, y, q.z + s1.nz * half];
    const d = [q.x - s1.nx * half, y, q.z - s1.nz * half];
    // Two triangles, wound to face up whichever way the loop turns.
    for (const tri of [[a, c, b], [b, c, d]]) {
      const [t0, t1, t2] = tri;
      const cross = (t1[0] - t0[0]) * (t2[2] - t0[2]) - (t1[2] - t0[2]) * (t2[0] - t0[0]);
      pos.push(...t0, ...(cross < 0 ? [...t1, ...t2] : [...t2, ...t1]));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** One car of the train, built along +z (its front), wheels at y = 0. */
function buildCar(kind: CarKind, glass: MeshBasicMaterial, seed: number) {
  const k = new Kit(seed);
  const L = CAR_LEN;
  const W = CAR_W;
  const bilevel = kind !== 'loco';
  const H = bilevel ? 1.62 : 1.38;
  const floor = 0.32;
  // Bogies and wheels.
  for (const bz of [-L * 0.32, L * 0.32]) {
    k.box(W * 0.8, 0.18, 0.8, '#3a3d42', { p: [0, 0.2, bz] });
    for (const wz of [-0.24, 0.24]) for (const wx of [-1, 1]) k.cyl(0.15, 0.15, 0.08, '#2a2b2e', { p: [wx * (W / 2 - 0.12), 0.15, bz + wz], r: [0, 0, Math.PI / 2] }, 10);
  }
  // Body: brushed silver with a red band along the bottom.
  k.rbox(W, H, L, 0.12, SILVER, { p: [0, floor + H / 2, 0], jitter: 0.02 });
  k.box(W + 0.02, 0.16, L - 0.12, RED, { p: [0, floor + 0.14, 0], jitter: 0 });
  k.box(W + 0.02, 0.05, L - 0.2, SILVER_DARK, { p: [0, floor + H - 0.08, 0], jitter: 0 });
  if (bilevel) {
    // Two decks of windows, with a fluted silver strip between them.
    k.addGlow(new ThreeBox(W + 0.03, 0.26, L - 0.7), '#ffffff', { p: [0, floor + 0.55, 0] });
    k.addGlow(new ThreeBox(W + 0.03, 0.3, L - 0.5), '#ffffff', { p: [0, floor + 1.15, 0] });
    k.box(W + 0.035, 0.05, L - 0.4, SILVER_DARK, { p: [0, floor + 0.84, 0], jitter: 0 });
    // Doors at either end, in the middle level.
    for (const dz of [-L / 2 + 0.3, L / 2 - 0.3]) k.box(W + 0.04, 0.72, 0.36, SILVER_DARK, { p: [0, floor + 0.55, dz], jitter: 0 });
  } else {
    // The locomotive: louvres along the side, a cab window band at the front.
    for (let i = 0; i < 4; i++) k.box(W + 0.03, 0.42, 0.34, SILVER_DARK, { p: [0, floor + 0.8, -L / 2 + 0.6 + i * 0.45], jitter: 0 });
    k.addGlow(new ThreeBox(W + 0.03, 0.3, 0.7), '#ffffff', { p: [0, floor + 1.0, L / 2 - 0.55] });
    k.box(0.4, 0.14, 0.8, '#5c6168', { p: [0, floor + H + 0.06, -0.4] });
  }
  if (kind !== 'coach') {
    // A red nose with a dark windscreen and two headlights.
    const zf = L / 2 - 0.02;
    k.rbox(W + 0.02, H * 0.62, 0.22, 0.08, RED, { p: [0, floor + H * 0.31 + 0.02, zf] });
    k.box(W * 0.78, 0.3, 0.06, GLASS, { p: [0, floor + H - 0.38, zf + 0.06], jitter: 0 });
    for (const hx of [-0.32, 0.32]) k.addGlow(new ThreeBox(0.14, 0.1, 0.04), '#fff6d8', { p: [hx, floor + 0.36, zf + 0.12] });
    k.box(W * 0.9, 0.12, 0.2, '#4b4f55', { p: [0, floor - 0.02, zf + 0.04], jitter: 0 }); // pilot
  }
  const g = k.build({ castShadow: true, receiveShadow: true, glowMaterial: glass });
  return g;
}

/** The red double-decker, built along +z (its front), wheels on y = 0. */
function buildBus(glass: MeshBasicMaterial) {
  const k = new Kit(733);
  const L = 4.4;
  const W = 1.35;
  const H = 2.25;
  const base = 0.28;
  for (const wz of [-L / 2 + 0.75, L / 2 - 0.85]) for (const wx of [-1, 1]) {
    k.cyl(0.3, 0.3, 0.22, '#222326', { p: [wx * (W / 2 - 0.08), 0.3, wz], r: [0, 0, Math.PI / 2] }, 12);
    k.cyl(0.14, 0.14, 0.24, '#b9bcc2', { p: [wx * (W / 2 - 0.07), 0.3, wz], r: [0, 0, Math.PI / 2] }, 8);
  }
  // Body, with a rounded roof, a cream band between decks, and a black skirt.
  k.rbox(W, H, L, 0.22, BUS_RED, { p: [0, base + H / 2, 0], jitter: 0.02 });
  k.box(W + 0.03, 0.12, L - 0.1, CREAM, { p: [0, base + H * 0.5, 0], jitter: 0 });
  k.box(W + 0.02, 0.16, L - 0.3, '#2b2b2e', { p: [0, base + 0.1, 0], jitter: 0 });
  // Windows on both decks, the lower ones stopping short of the open rear platform.
  k.addGlow(new ThreeBox(W + 0.03, 0.46, L - 1.5), '#ffffff', { p: [0, base + 0.82, 0.35] });
  k.addGlow(new ThreeBox(W + 0.03, 0.46, L - 0.7), '#ffffff', { p: [0, base + 1.66, 0] });
  // Front: the cab window, a destination blind, a grille and headlamps.
  const zf = L / 2;
  k.addGlow(new ThreeBox(W * 0.8, 0.42, 0.04), '#ffffff', { p: [0, base + 1.66, zf + 0.01] });
  k.addGlow(new ThreeBox(0.62, 0.42, 0.04), '#ffffff', { p: [-0.25, base + 0.85, zf + 0.01] });
  k.addGlow(new ThreeBox(W * 0.62, 0.14, 0.04), '#ffe9a8', { p: [0, base + 1.3, zf + 0.012] });
  k.box(0.5, 0.36, 0.08, '#c9c3b4', { p: [0.25, base + 0.42, zf + 0.02], jitter: 0 });
  for (const hx of [-0.45, 0.45]) k.addGlow(new ThreeBox(0.16, 0.16, 0.05), '#fff6d8', { p: [hx, base + 0.32, zf + 0.03] });
  // The open platform at the back, with its pole.
  k.box(0.6, 0.9, 0.04, '#2b2b2e', { p: [W / 2 - 0.32, base + 0.85, -L / 2 + 0.02], jitter: 0 });
  k.cyl(0.03, 0.03, 1.1, '#e8e2d4', { p: [W / 2 - 0.12, base + 0.82, -L / 2 + 0.25] }, 6);
  return k.build({ castShadow: true, receiveShadow: true, glowMaterial: glass });
}

export function buildCommute() {
  const group = new Group();
  group.name = 'commute';
  const rail = geo.rail;
  const rw = geo.station;
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  const colliders: { x: number; z: number; r: number }[] = [];

  // Window glass shared by every car and the bus: dark by day, warm after dark.
  const glass = new MeshBasicMaterial({ vertexColors: true, color: DAY_GLASS.clone() });

  let cars: Object3D[] = [];
  const bedY = rail ? geo.heightAt(rail.points[0].x, rail.points[0].z) : 0;

  if (rail) {
    // ---------- Track ----------
    const tk = new Kit(611);
    tk.add(ballast(rail.points, bedY + 0.03, 0.95), '#a59a8a', { jitter: 0.05 });
    const n = rail.points.length;
    // Sleepers every 0.55 units, then two rails on top.
    const sleepers = Math.round(rail.length / 0.55);
    for (let i = 0; i < sleepers; i++) {
      const p = rail.at((i / sleepers) * rail.length);
      tk.box(1.45, 0.07, 0.26, '#6f5440', { p: [p.x, bedY + 0.07, p.z], r: [0, p.yaw, 0], jitter: 0.06 });
    }
    for (let i = 0; i < n; i++) {
      const a = rail.points[i];
      const b = rail.points[(i + 1) % n];
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.04;
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      for (const s of [-GAUGE, GAUGE]) {
        tk.box(0.07, 0.08, len, '#8e939b', { p: [(a.x + b.x) / 2 + nx * s, bedY + 0.14, (a.z + b.z) / 2 + nz * s], r: [0, yaw, 0], jitter: 0 });
      }
    }
    // Level crossings: boards between and beside the rails, and a crossbuck each side.
    for (const c of geo.crossings) {
      const along = c.along;
      tk.box(2.0, 0.06, 1.7, '#9a7a56', { p: [c.x, bedY + 0.16, c.z], r: [0, along, 0] });
      for (const side of [-1, 1]) {
        // Beside the path, a little way back from the line.
        const bx = c.x + Math.sin(along) * side * 1.6 + Math.cos(along) * 1.1;
        const bz = c.z + Math.cos(along) * side * 1.6 - Math.sin(along) * 1.1;
        tk.cyl(0.05, 0.05, 1.5, '#f2efe8', { p: [bx, bedY + 0.75, bz] }, 6);
        tk.box(0.9, 0.12, 0.03, '#f2efe8', { p: [bx, bedY + 1.35, bz], r: [0, along, Math.PI / 4] });
        tk.box(0.9, 0.12, 0.03, '#f2efe8', { p: [bx, bedY + 1.35, bz], r: [0, along, -Math.PI / 4] });
        tk.box(0.94, 0.04, 0.02, RED, { p: [bx, bedY + 1.35, bz], r: [0, along, Math.PI / 4], jitter: 0 });
      }
    }
    group.add(tk.build({ castShadow: false, receiveShadow: true }));

    // ---------- Station ----------
    if (rw) {
      const at = rail.at(rw.s);
      const out = at.out;
      const sk = new Kit(612);
      const px = 1.55 * out; // platform centre, across from the track
      sk.rbox(1.25, 0.32, 6.4, 0.05, '#cbbfa9', { p: [px, 0.16, 0] });
      sk.box(0.12, 0.02, 6.4, '#f2d24a', { p: [px - 0.55 * out, 0.33, 0], jitter: 0 }); // the yellow edge line
      // A shelter: four posts and a red canopy, with a bench beneath.
      const sx = px + 0.25 * out;
      for (const dz of [-1.1, 1.1]) for (const dx of [-0.4, 0.4]) sk.cyl(0.05, 0.05, 1.7, '#5c6168', { p: [sx + dx, 1.17, dz] }, 6);
      sk.rbox(1.3, 0.12, 2.8, 0.04, RED, { p: [sx, 2.05, 0], r: [0, 0, -0.12 * out] });
      sk.box(0.45, 0.08, 1.6, '#8a5a3b', { p: [sx + 0.25 * out, 0.68, 0] });
      sk.box(0.08, 0.4, 1.6, '#8a5a3b', { p: [sx + 0.45 * out, 0.9, 0] });
      // A name board with no name on it, and a clock.
      for (const dz of [-2.6, 2.6]) sk.cyl(0.04, 0.04, 1.5, '#5c6168', { p: [px + 0.3 * out, 1.07, dz] }, 6);
      sk.box(0.06, 0.32, 1.0, '#ffffff', { p: [px + 0.3 * out, 1.8, -2.6], jitter: 0 });
      sk.box(0.07, 0.08, 1.0, RED, { p: [px + 0.3 * out, 1.66, -2.6], jitter: 0 });
      sk.cyl(0.2, 0.2, 0.06, '#f6f1e4', { p: [px + 0.3 * out, 1.95, 2.6], r: [0, 0, Math.PI / 2] }, 14);
      // A lamp at the far end.
      sk.cyl(0.04, 0.05, 2.3, '#3d3a36', { p: [px + 0.35 * out, 1.47, 3.0] }, 6);
      sk.addGlow(new ThreeBox(0.22, 0.2, 0.22), '#ffe2a0', { p: [px + 0.35 * out, 2.62, 3.0] });
      const st = sk.build({ castShadow: true, receiveShadow: true });
      st.position.set(at.x, bedY, at.z);
      st.rotation.y = at.yaw;
      group.add(st);
      st.updateMatrixWorld(true);
      const local = (x: number, y: number, z: number) => {
        const c = Math.cos(at.yaw), s = Math.sin(at.yaw);
        return [at.x + x * c + z * s, bedY + y, at.z - x * s + z * c] as const;
      };
      const lamp = local(px + 0.35 * out, 2.62, 3.0);
      halos.push([lamp[0], lamp[1], lamp[2], 3.2]);
      pools.push([lamp[0], bedY + 0.34, lamp[2], 2.2]);
      const shelter = local(sx, 0, 0);
      colliders.push({ x: shelter[0], z: shelter[2], r: 0.9 });
    }

    // ---------- Train ----------
    cars = CARS.map((k, i) => {
      const c = buildCar(k, glass, 620 + i);
      group.add(c);
      return c;
    });
    // The locomotive leads, and the cab car brings up the rear facing backwards.
    cars[CARS.indexOf('cab')].children.forEach((m) => (m.rotation.y = Math.PI));
  }

  // ---------- Quay and bus ----------
  const q = geo.quay;
  if (q) {
    const qk = new Kit(640);
    const w = q.x1 - q.x0;
    const d = q.z1 - q.z0;
    // A stone deck with a wall down into the sea.
    qk.box(w, q.deck + 2.2, d, '#b8b0a2', { p: [(q.x0 + q.x1) / 2, (q.deck - 2.2) / 2 + 0.02, (q.z0 + q.z1) / 2], jitter: 0.04 });
    // Paving joints, a kerb, and bollards along the seaward edges.
    for (let x = q.x0 + 1; x < q.x1; x += 1.3) qk.box(0.04, 0.012, d - 0.2, '#a39b8d', { p: [x, q.deck + 0.03, (q.z0 + q.z1) / 2], jitter: 0 });
    qk.box(w, 0.12, 0.25, '#d6cfc2', { p: [(q.x0 + q.x1) / 2, q.deck + 0.08, q.z1 - 0.13] });
    for (let x = q.x0 + 0.6; x < q.x1; x += 1.6) qk.cyl(0.13, 0.16, 0.42, '#3d3a36', { p: [x, q.deck + 0.23, q.z1 - 0.45] }, 8);
    for (let z = q.z0 + 1.2; z < q.z1; z += 1.6) qk.cyl(0.13, 0.16, 0.42, '#3d3a36', { p: [q.x1 - 0.45, q.deck + 0.23, z] }, 8);
    // A bus stop sign, and crates waiting to go somewhere.
    qk.cyl(0.04, 0.04, 2.0, '#5c6168', { p: [q.x0 + 1.2, q.deck + 1.0, q.z0 + 1.0] }, 6);
    qk.cyl(0.26, 0.26, 0.05, BUS_RED, { p: [q.x0 + 1.2, q.deck + 1.95, q.z0 + 1.0], r: [Math.PI / 2, 0, 0] }, 14);
    qk.box(0.36, 0.08, 0.06, '#ffffff', { p: [q.x0 + 1.2, q.deck + 1.95, q.z0 + 1.0], jitter: 0 });
    qk.box(0.8, 0.8, 0.8, '#b08354', { p: [q.x1 - 1.4, q.deck + 0.4, q.z0 + 0.9], r: [0, 0.3, 0] });
    qk.box(0.6, 0.6, 0.6, '#c39563', { p: [q.x1 - 1.3, q.deck + 1.1, q.z0 + 0.95], r: [0, -0.2, 0] });
    // A lamp post by the water.
    qk.cyl(0.05, 0.06, 2.6, '#3d3a36', { p: [q.x0 + 0.6, q.deck + 1.3, q.z1 - 0.6] }, 6);
    qk.addGlow(new ThreeBox(0.24, 0.22, 0.24), '#ffe2a0', { p: [q.x0 + 0.6, q.deck + 2.7, q.z1 - 0.6] });
    group.add(qk.build({ castShadow: true, receiveShadow: true }));
    halos.push([q.x0 + 0.6, q.deck + 2.7, q.z1 - 0.6, 3.2]);
    pools.push([q.x0 + 0.6, q.deck + 0.05, q.z1 - 0.6, 2.4]);
    colliders.push({ x: q.x1 - 1.35, z: q.z0 + 0.9, r: 0.6 });

    const bus = buildBus(glass);
    bus.position.set(q.bus.x, q.deck, q.bus.z);
    bus.rotation.y = q.faces;
    group.add(bus);
    const fx = Math.sin(q.faces);
    const fz = Math.cos(q.faces);
    for (const t of [-1.4, 0, 1.4]) colliders.push({ x: q.bus.x + fx * t, z: q.bus.z + fz * t, r: 0.8 });
    // Headlamps glow after dark.
    for (const side of [-0.45, 0.45]) {
      halos.push([q.bus.x + fx * 2.25 + fz * side, q.deck + 0.6, q.bus.z + fz * 2.25 - fx * side, 1.1]);
    }
  }

  // ---------- Spare plots ----------
  // Kept for a place still to come: four stakes and a string round level ground.
  for (const plot of geo.plots) {
    const pk = new Kit(650);
    const h = geo.heightAt(plot.x, plot.z);
    const c = plot.r * 0.62;
    const corners: [number, number][] = [[-c, -c], [c, -c], [c, c], [-c, c]];
    for (const [dx, dz] of corners) pk.box(0.08, 0.5, 0.08, '#c39563', { p: [plot.x + dx, h + 0.2, plot.z + dz] });
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      pk.box(Math.abs(bx - ax) + 0.02 || 0.02, 0.02, Math.abs(bz - az) + 0.02 || 0.02, '#f2efe8', { p: [plot.x + (ax + bx) / 2, h + 0.4, plot.z + (az + bz) / 2], jitter: 0 });
    }
    group.add(pk.build({ castShadow: false, receiveShadow: true }));
  }

  // ---------- Running the train ----------
  const train = createTrain(geo);
  const place = () => {
    train.cars().forEach((c, i) => {
      cars[i].position.set(c.x, bedY + 0.12, c.z);
      cars[i].rotation.y = c.yaw;
    });
  };
  place();

  return {
    group,
    colliders,
    /** Lamps on the platform and the quay, and the bus's headlamps (for the night's halos). */
    glows: () => ({ halos, pools }),
    /** Darkness, 0 (day) to 1 (night): the windows warm up. */
    night(n: number) {
      glass.color.lerpColors(DAY_GLASS, NIGHT_GLASS, smoothstep(0.15, 0.7, n));
    },
    /**
     * Move the train. `running` is rush hour (it laps, stopping at the
     * platform); otherwise it comes round to the platform and waits there.
     * It brakes for anyone standing on the line ahead.
     */
    update(dt: number, running: boolean, player: { x: number; z: number }) {
      if (!train.exists) return;
      train.update(dt, running, player);
      place();
    },
    /** For debugging: where the train is and how fast it's going. */
    state: train.state,
  };
}

export type Commute = ReturnType<typeof buildCommute>;
