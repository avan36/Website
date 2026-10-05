// The red London double-decker, on Little London: the road it drives round
// the islet (tarmac on a level bed, a pale kerb and a white line down either
// edge), the bus stop on the south side (a red and white sign on a pole, a
// little shelter with a bench, and a yellow box painted on the road), a zebra
// crossing where the walk from Tower Bridge to the mall crosses the road, with
// a Belisha beacon blinking at either end, and the bus itself, driving.
//
// Where it all is comes from src/world/geo.ts (the road and the stop), and
// where the bus is from src/world/bus.ts: it laps the loop, pulls in at the
// stop for a few seconds each time round, and waits for anyone standing in
// the road ahead. Its body is three moving circles the explorer bumps off,
// like the people out walking, so it can nudge you aside but never trap you.

import { BoxGeometry as ThreeBox, Color, Group, MeshBasicMaterial, SphereGeometry } from 'three';
import { readGeo } from '../../../world/client';
import { BUS_LEN, BUS_W, createBus } from '../../../world/bus';
import { ROAD_HALF, STOP_OUT } from '../../../world/geo';
import type { Glow } from '../landmarks/builders';
import { bothSides, lettering, ribbon } from './commute';
import { Kit } from './kit';
import { LONDON_WALK } from './london';
import type { Collider } from './nature';
import { smoothstep } from '../util/math';

const geo = readGeo();

const BUS_RED = '#cf1f2a';
const CREAM = '#efe4c8';
const TARMAC = '#5d5852';
const KERB = '#cfc7b9';
const LINE = '#f2eee4';
const YELLOW = '#f2c14e';
const IRON = '#2b2f33';
const BEACON = '#f5a142';

const DAY_GLASS = new Color('#5a6d7d');
const NIGHT_GLASS = new Color('#ffd27e');

/** The red double-decker, built along +z (its front), wheels on y = 0. */
function buildBus(glass: MeshBasicMaterial) {
  const k = new Kit(733);
  const L = BUS_LEN;
  const W = BUS_W;
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
  const bus = k.build({ castShadow: true, receiveShadow: true, glowMaterial: glass });
  // Where it's from: in gold along both sides, and on the lit blind over the cab.
  bus.add(bothSides('LONDON', 2.6, 0.38, '#ffd35a', W / 2 + 0.03, base + 0.38, 0.3));
  const blind = lettering('LONDON', W * 0.62, 0.14, '#ffc94a', '#1d1a16');
  blind.position.set(0, base + 1.3, zf + 0.035);
  bus.add(blind);
  return bus;
}

/** Where the walk from the bridge to the mall crosses the road: how far round the road that is, or null if it doesn't. */
function crossingAt() {
  const road = geo.road;
  const w = LONDON_WALK;
  if (!road || !w) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (let s = 0; s < road.length; s += 0.1) {
    const p = road.at(s);
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const t = Math.max(0, Math.min(1, ((p.x - w.ax) * dx + (p.z - w.az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(p.x - (w.ax + dx * t), p.z - (w.az + dz * t));
    if (d < bestD) (bestD = d), (best = s);
  }
  return bestD < 0.3 ? best : null;
}

export function buildLondonBus() {
  const group = new Group();
  group.name = 'london-bus';
  const colliders: Collider[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  const road = geo.road;
  const stop = geo.busStop;
  const glass = new MeshBasicMaterial({ vertexColors: true, color: DAY_GLASS.clone() });
  const beaconGlow = new MeshBasicMaterial({ vertexColors: true, color: '#ffffff', toneMapped: false });
  /** The bus's body, three circles moved along with it each frame. */
  const body: Collider[] = [0, 1, 2].map(() => ({ x: 0, z: 0, r: 0 }));
  if (!road || !stop) return { group, colliders, body, glows: () => ({ halos, pools }), night() {}, update() {}, state: () => null };

  const y = geo.heightAt(road.points[0].x, road.points[0].z);

  // ---------- The road ----------
  const rk = new Kit(1400);
  rk.add(ribbon(road.points, y + 0.025, ROAD_HALF + 0.16), KERB, { jitter: 0.03 });
  rk.add(ribbon(road.points, y + 0.045, ROAD_HALF), TARMAC, { jitter: 0.04 });
  // A white line down either edge, in dashes the length of a stride.
  const dashes = Math.round(road.length / 1.2);
  for (let i = 0; i < dashes; i++) {
    const p = road.at((i / dashes) * road.length);
    const nx = Math.cos(p.yaw);
    const nz = -Math.sin(p.yaw);
    for (const side of [-1, 1]) rk.box(0.07, 0.012, 0.8, LINE, { p: [p.x + nx * side * (ROAD_HALF - 0.16), y + 0.055, p.z + nz * side * (ROAD_HALF - 0.16)], r: [0, p.yaw, 0], jitter: 0 });
  }

  // ---------- The zebra crossing ----------
  const cs = crossingAt();
  if (cs !== null) {
    const c = road.at(cs);
    const ux = Math.sin(c.yaw);
    const uz = Math.cos(c.yaw);
    const nx = Math.cos(c.yaw);
    const nz = -Math.sin(c.yaw);
    // Stripes along the road, side by side from kerb to kerb.
    for (let k = -ROAD_HALF + 0.18; k <= ROAD_HALF - 0.1; k += 0.42) rk.box(0.22, 0.014, 1.3, LINE, { p: [c.x + nx * k, y + 0.058, c.z + nz * k], r: [0, c.yaw, 0], jitter: 0 });
    // A Belisha beacon on each kerb: a striped pole and an amber globe.
    for (const side of [-1, 1]) {
      const bx = c.x + nx * side * (ROAD_HALF + 0.32) - ux * 0.95;
      const bz = c.z + nz * side * (ROAD_HALF + 0.32) - uz * 0.95;
      for (let j = 0; j < 6; j++) rk.cyl(0.05, 0.05, 0.3, j % 2 ? IRON : LINE, { p: [bx, y + 0.15 + j * 0.3, bz] }, 8);
      rk.addGlow(new SphereGeometry(0.16, 10, 8), BEACON, { p: [bx, y + 1.98, bz] });
      halos.push([bx, y + 1.98, bz, 0.9]);
      colliders.push({ x: bx, z: bz, r: 0.14 });
    }
  }
  group.add(rk.build({ castShadow: false, receiveShadow: true, glowMaterial: beaconGlow }));

  // ---------- The bus stop ----------
  // Built in the road's own frame at the stop: +z along the road the way the bus goes, out (x · out) away from the loop.
  const sk = new Kit(1401);
  const out = stop.out;
  const kerbX = (ROAD_HALF + 0.34) * out;
  // A yellow box painted on the road, the length of the bus, where it pulls in.
  const bx0 = (ROAD_HALF - 0.12) * out;
  const bx1 = (ROAD_HALF - 0.12 - 1.1) * out;
  for (const z of [-BUS_LEN / 2 - 0.3, BUS_LEN / 2 + 0.3]) sk.box(1.1, 0.012, 0.07, YELLOW, { p: [(bx0 + bx1) / 2, 0.062, z], jitter: 0 });
  sk.box(0.07, 0.012, BUS_LEN + 0.6, YELLOW, { p: [bx1, 0.062, 0], jitter: 0 });
  // The sign: a pole on the kerb with a red roundel and a white bar across it, ahead of where the doors stop.
  const signZ = BUS_LEN / 2 - 0.4;
  sk.cyl(0.04, 0.045, 2.2, '#5c6168', { p: [kerbX, 1.1, signZ] }, 6);
  sk.cyl(0.27, 0.27, 0.05, BUS_RED, { p: [kerbX, 2.05, signZ], r: [0, 0, Math.PI / 2] }, 16);
  sk.box(0.07, 0.09, 0.4, LINE, { p: [kerbX, 2.05, signZ], jitter: 0 });
  sk.box(0.05, 0.2, 0.36, '#ffffff', { p: [kerbX, 1.62, signZ], jitter: 0 }); // the plate with no timetable on it
  // The shelter: four posts, a glass back, a red roof sloping away from the road, and a bench.
  const sx = STOP_OUT * out;
  for (const dz of [-1.05, 1.05]) for (const dx of [-0.38, 0.38]) sk.cyl(0.04, 0.04, 2.0, '#5c6168', { p: [sx + dx * out, 1.0, dz] }, 6);
  sk.addGlow(new ThreeBox(0.04, 1.3, 2.0), '#ffffff', { p: [sx + 0.38 * out, 1.15, 0] });
  for (const dz of [-1.05, 1.05]) sk.addGlow(new ThreeBox(0.7, 1.3, 0.04), '#ffffff', { p: [sx, 1.15, dz] });
  sk.rbox(1.1, 0.1, 2.5, 0.03, BUS_RED, { p: [sx, 2.05, 0], r: [0, 0, 0.1 * out] });
  sk.box(0.4, 0.07, 1.5, '#8a5a3b', { p: [sx + 0.16 * out, 0.5, 0] });
  for (const dz of [-0.6, 0.6]) sk.box(0.3, 0.46, 0.06, IRON, { p: [sx + 0.16 * out, 0.24, dz] });
  const st = sk.build({ castShadow: true, receiveShadow: true, glowMaterial: glass });
  // A name board along the roof's edge, facing the road: BUS STOP.
  const name = lettering('BUS STOP', 1.3, 0.2, '#ffffff', BUS_RED);
  name.position.set(sx - 0.57 * out, 2.22, 0);
  name.rotation.y = (-out * Math.PI) / 2;
  st.add(name);
  st.position.set(stop.x, y, stop.z);
  st.rotation.y = stop.yaw;
  group.add(st);
  const local = (lx: number, lz: number) => ({ x: stop.x + lx * Math.cos(stop.yaw) + lz * Math.sin(stop.yaw), z: stop.z - lx * Math.sin(stop.yaw) + lz * Math.cos(stop.yaw) });
  const shelter = local(sx, 0);
  colliders.push({ x: shelter.x, z: shelter.z, r: 0.95 });
  const pole = local(kerbX, signZ);
  colliders.push({ x: pole.x, z: pole.z, r: 0.12 });

  // ---------- The bus ----------
  const mesh = buildBus(glass);
  group.add(mesh);
  const bus = createBus(geo);
  const place = () => {
    const p = bus.pose();
    if (!p) return;
    mesh.position.set(p.x, y + 0.045, p.z);
    mesh.rotation.y = p.yaw;
    bus.body().forEach((c, i) => Object.assign(body[i], c));
  };
  place();

  return {
    group,
    /** Things that stand still: the stop's shelter and sign, and the beacons. */
    colliders,
    /** The bus itself: three circles that move with it (add them to the colliders once; they're updated in place). */
    body,
    /** The beacons, for the night's halos. */
    glows: () => ({ halos, pools }),
    /** Darkness, 0 (day) to 1 (night): the windows warm up. */
    night(n: number) {
      glass.color.lerpColors(DAY_GLASS, NIGHT_GLASS, smoothstep(0.15, 0.7, n));
    },
    /** Drive on. It waits for the explorer if they're in the road ahead. */
    update(dt: number, player: { x: number; z: number } | null) {
      if (!bus.exists) return;
      bus.update(dt, player);
      place();
    },
    /** For debugging: where the bus is, and whether it's at the stop. */
    state: () => {
      const p = bus.pose();
      return p ? { ...bus.state(), x: p.x, z: p.z, yaw: p.yaw } : null;
    },
  };
}

export type LondonBus = ReturnType<typeof buildLondonBus>;
