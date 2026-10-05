// The glass tower on Synergy Isle: a very tall tower of blue glass, gently
// tapering, with a rounded crown on top and a little cloud of its own drifting
// round it. It stands on a glass lobby (the room you walk into), between two
// shorter glass office blocks, with a lamp post out front where somebody has
// left a lanyard flapping. After dark every floor stays lit.

import { Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, BoxGeometry } from 'three';
import { Kit } from '../world/kit';
import type { Built, Glow } from './builders';

const STONE = '#e9e5de';
const STONE_DARK = '#cfc9bf';
const STEEL = '#dfe3e6';
const FIN = '#f6f7f7';

/** How tall the tower is, from the top of the lobby to the top of its crown. */
export const TOWER_TOP = 19;

export function buildSkyscraper(color: string): Built {
  const k = new Kit(2024);
  const gk = new Kit(2025);
  const base = 0.2;
  const LOBBY_W = 4.4;
  const LOBBY_D = 3.6;
  const LOBBY_H = 2.3;

  // ---------- The plaza and the lobby ----------
  k.cyl(3.3, 3.4, base, STONE, { p: [0, base / 2, 0] }, 28);
  for (let i = 0; i < 6; i++) k.cyl(3.3 - i * 0.5, 3.3 - i * 0.5, 0.012, STONE_DARK, { p: [0, base + 0.002, 0] }, 28);
  // A glass box on stone feet, with a fin at every corner and a canopy over the revolving door.
  k.box(LOBBY_W + 0.1, 0.12, LOBBY_D + 0.1, STONE_DARK, { p: [0, base + 0.06, 0] });
  gk.addGlow(new BoxGeometry(LOBBY_W, LOBBY_H - 0.2, LOBBY_D), '#cfe6f2', { p: [0, base + 0.1 + (LOBBY_H - 0.2) / 2, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, LOBBY_H, 0.14, FIN, { p: [(sx * LOBBY_W) / 2, base + LOBBY_H / 2, (sz * LOBBY_D) / 2] });
  for (let x = -LOBBY_W / 2 + 0.55; x < LOBBY_W / 2 - 0.3; x += 0.55) k.box(0.05, LOBBY_H - 0.2, 0.05, FIN, { p: [x, base + LOBBY_H / 2, LOBBY_D / 2 + 0.01], jitter: 0 });
  k.box(LOBBY_W + 0.2, 0.16, LOBBY_D + 0.2, FIN, { p: [0, base + LOBBY_H, 0] });
  // The revolving door: a drum of glass with a steel cap, and a canopy in the tower's blue.
  gk.addGlow(new CylinderGeometry(0.62, 0.62, 1.7, 16), '#e6f2f9', { p: [0, base + 0.95, LOBBY_D / 2 + 0.35] });
  k.cyl(0.66, 0.66, 0.1, STEEL, { p: [0, base + 1.85, LOBBY_D / 2 + 0.35] }, 16);
  k.box(1.9, 0.08, 1.0, color, { p: [0, base + 2.05, LOBBY_D / 2 + 0.45] });
  for (const s of [-1, 1]) k.box(0.05, 0.06, 0.9, STEEL, { p: [s * 0.9, base + 2.0, LOBBY_D / 2 + 0.45], jitter: 0 });

  // ---------- The tower ----------
  // Stacked bands of glass, a rounded square in plan, tapering a little all the way up.
  const y0 = base + LOBBY_H + 0.1;
  const H = TOWER_TOP - 3.2;
  const bands = 14;
  const rx = (t: number) => 1.55 - t * 0.38;
  const rz = (t: number) => 1.35 - t * 0.34;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const h = H / bands;
    const y = y0 + (t0 + t1) * H * 0.5;
    const g = new CylinderGeometry(1, 1, h - 0.06, 24);
    const sx = (rx(t0) + rx(t1)) / 2;
    const sz = (rz(t0) + rz(t1)) / 2;
    gk.addGlow(g, i % 4 === 1 ? '#e2eff7' : i % 3 ? '#cfe3f0' : '#d8eaf4', { p: [0, y, 0], s: [sx, 1, sz] });
    // A pale floor line between bands.
    k.cyl(1, 1, 0.06, FIN, { p: [0, y0 + t1 * H - 0.03, 0], s: [rx(t1) + 0.02, 1, rz(t1) + 0.02] }, 24);
  }
  // Vertical fins up the four faces, catching the light.
  for (let a = 0; a < 8; a++) {
    const th = (a / 8) * Math.PI * 2 + Math.PI / 8;
    const x0 = Math.cos(th) * rx(0);
    const z0 = Math.sin(th) * rz(0);
    const x1 = Math.cos(th) * rx(1);
    const z1 = Math.sin(th) * rz(1);
    k.beam([x0, y0, z0], [x1, y0 + H, z1], 0.06, 0.06, FIN, 0);
  }
  // The crown: an open, rounded top, a ring of fins closing in over a lit lantern, like a lid on a very serious jar.
  const cy = y0 + H;
  const crownH = 3.0;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const r = Math.cos(t * Math.PI * 0.46);
      pts.push([Math.cos(th) * rx(1) * r, cy + t * crownH, Math.sin(th) * rz(1) * r]);
    }
    for (let j = 0; j < 4; j++) k.beam(pts[j], pts[j + 1], 0.07, 0.07, FIN, 0);
  }
  k.cyl(1, 1, 0.1, FIN, { p: [0, cy + 0.05, 0], s: [rx(1) + 0.05, 1, rz(1) + 0.05] }, 24);
  const lantern = new Mesh(new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshBasicMaterial({ color: '#eaf4fb', toneMapped: false }));
  lantern.scale.set(rx(1) * 0.86, crownH * 0.9, rz(1) * 0.86);
  lantern.position.y = cy;

  // ---------- Two smaller glass office blocks ----------
  const blocks: [number, number, number, number, number][] = [
    [-2.85, -1.6, 1.4, 1.5, 6.2],
    [2.9, -1.3, 1.3, 1.6, 4.4],
  ];
  for (const [x, z, w, d, h] of blocks) {
    k.box(w + 0.1, 0.14, d + 0.1, STONE_DARK, { p: [x, base + 0.07, z] });
    gk.addGlow(new BoxGeometry(w, h, d), '#d6e8f2', { p: [x, base + h / 2, z] });
    for (let y = base + 0.9; y < base + h; y += 0.9) k.box(w + 0.04, 0.05, d + 0.04, FIN, { p: [x, y, z], jitter: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, h, 0.08, FIN, { p: [x + (sx * w) / 2, base + h / 2, z + (sz * d) / 2], jitter: 0 });
    k.box(w + 0.12, 0.12, d + 0.12, FIN, { p: [x, base + h + 0.06, z] });
    // A plant in a top window, leaning toward the tower for approval.
    k.ico(0.16, '#5cb85a', { p: [x - Math.sign(x) * (w / 2 - 0.2), base + h - 0.5, z + d / 2 + 0.05] }, 1);
  }

  // ---------- Out front ----------
  // Planters either side of the door, and a lamp post with a lanyard flapping from it.
  for (const s of [-1, 1]) {
    k.rbox(0.6, 0.4, 0.5, 0.05, '#8d939a', { p: [s * 1.6, base + 0.2, LOBBY_D / 2 + 0.9] });
    k.ico(0.26, '#4fae55', { p: [s * 1.6, base + 0.55, LOBBY_D / 2 + 0.9] }, 1);
  }
  const lamp = { x: 2.6, z: 2.5 };
  k.cyl(0.05, 0.06, 2.2, '#3d4248', { p: [lamp.x, base + 1.1, lamp.z] }, 6);
  k.box(0.4, 0.06, 0.08, '#3d4248', { p: [lamp.x - 0.18, base + 2.2, lamp.z] });
  k.addGlow(new SphereGeometry(0.12, 8, 6), '#ffd27a', { p: [lamp.x - 0.34, base + 2.08, lamp.z] });

  const glass = new MeshBasicMaterial({ vertexColors: true, color: '#cfe7f3', toneMapped: false });
  const glassDay = glass.color.clone();
  const glassNight = new Color('#ffd28c');
  const group = k.build();
  // The glass straight into the same group, so the tower lifts off with its frame when the lobby opens up (see Landmark.open).
  group.add(...gk.build({ glowMaterial: glass }).children);
  group.add(lantern);

  // The lanyard: a loop of ribbon and a badge, swinging in the breeze.
  const lanyard = new Group();
  const ribbon = new MeshStandardMaterial({ color: '#b8508a', roughness: 0.8 });
  for (const s of [-1, 1]) {
    const strap = new Mesh(new BoxGeometry(0.035, 0.42, 0.01), ribbon);
    strap.position.set(s * 0.05, -0.21, 0);
    strap.rotation.z = s * 0.12;
    lanyard.add(strap);
  }
  const badge = new Mesh(new BoxGeometry(0.16, 0.2, 0.01), new MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.7 }));
  badge.position.y = -0.5;
  lanyard.add(badge);
  lanyard.position.set(lamp.x - 0.05, base + 1.7, lamp.z);
  group.add(lanyard);

  // Its own weather: a little cloud that drifts slowly round the crown.
  const cloud = new Group();
  const puff = new MeshStandardMaterial({ color: '#f7f8fa', roughness: 1, transparent: true, opacity: 0.92 });
  for (const [x, y, z, r] of [[0, 0, 0, 0.9], [0.8, -0.15, 0.2, 0.7], [-0.75, -0.1, -0.1, 0.75], [0.2, 0.35, -0.3, 0.6], [-0.2, -0.2, 0.5, 0.55]] as const) {
    const m = new Mesh(new SphereGeometry(r, 10, 8), puff);
    m.position.set(x, y, z);
    cloud.add(m);
  }
  cloud.position.set(2.1, cy + 1.6, 0);
  group.add(cloud);

  const glows: { halos: Glow[]; pools: Glow[] } = {
    halos: [
      [0, base + 1.2, LOBBY_D / 2 + 0.4, 2.4],
      [0, cy + 1.2, 0, 3.2],
      [0, y0 + H * 0.3, 0, 3.0],
      [0, y0 + H * 0.65, 0, 3.0],
      [lamp.x - 0.34, base + 2.08, lamp.z, 1.4],
    ],
    pools: [[0, 0.12, LOBBY_D / 2 + 1.4, 3], [lamp.x - 0.34, 0.12, lamp.z, 1.6]],
  };
  return {
    group,
    bouncy: group,
    glows,
    night: (n) => {
      glass.color.lerpColors(glassDay, glassNight, n * 0.85);
      (lantern.material as MeshBasicMaterial).color.set(n > 0.5 ? '#fff1c9' : '#eaf4fb');
    },
    // The office blocks either side reach past the footprint's circle.
    solid: [[-2.85, -1.6, 1.05], [2.9, -1.3, 1.05], [lamp.x, lamp.z, 0.2]],
    update: (c) => {
      cloud.position.x = Math.cos(c.t * 0.12) * 2.1;
      cloud.position.z = Math.sin(c.t * 0.12) * 1.8;
      lanyard.rotation.z = Math.sin(c.t * 2.3) * 0.25 + Math.sin(c.t * 5.1) * 0.06;
      lanyard.rotation.x = Math.sin(c.t * 1.7) * 0.12;
    },
  };
}
