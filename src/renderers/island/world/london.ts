// Little London's street furniture, along the way from the end of Tower
// Bridge up to the mall's doors: a red telephone box, a pillar box, a bench,
// and a pair of Victorian lamp posts that light up after dark. Everything
// stands off the walk and off the bus's road, and is solid. Where it stands
// is worked out from the mall's door (LONDON_SPOTS), so the nature scatter
// can keep its trees out of the way too.

import { BoxGeometry, Color, CylinderGeometry, Group, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { Glow } from '../landmarks/builders';
import { Kit, type V3 } from './kit';
import type { Collider } from './nature';
import { BRIDGES, heightAt, landing, owner, PLACES } from './shape';

type Kind = 'phone' | 'pillar' | 'bench' | 'lamp';

/**
 * Each piece, by where it stands from the mall's door (in world units, +x
 * east, +z south): the same spots as the map's (layoutStreet). One lamp by the
 * bridge's landing, outside the bus's road; the rest out on the forecourt,
 * between the road and the doors.
 */
const PIECES: { kind: Kind; dx: number; dz: number; r: number }[] = [
  { kind: 'lamp', dx: -6.4, dz: -2.1, r: 0.25 },
  { kind: 'phone', dx: -0.6, dz: 2.6, r: 0.58 },
  { kind: 'bench', dx: 1.5, dz: 3.4, r: 0.55 },
  { kind: 'pillar', dx: 3.2, dz: 1.5, r: 0.34 },
  // Out past the door to the side, not in front of the mall: nothing tall stands between the camera and its room when it opens.
  { kind: 'lamp', dx: 1.9, dz: 0.5, r: 0.25 },
];

/** The walk from the tower bridge's landing on the mall's island to the mall's door (null if there's no such pair). */
const WALK = (() => {
  const mall = PLACES.find((p) => p.kind === 'mall');
  const b = BRIDGES.find((x) => x.style === 'tower');
  if (!mall || !b) return null;
  const isle = owner(mall.x, mall.z);
  const end = b.joins[1] === isle ? 1 : b.joins[0] === isle ? 0 : null;
  if (end === null) return null;
  const from = landing(b, end);
  const to = mall.stand;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  return { from, to, ux: (to.x - from.x) / len, uz: (to.z - from.z) / len, len };
})();

/** Where each piece of street furniture stands, and how far round it is solid: for the scatter to keep clear of. */
export const LONDON_SPOTS = WALK
  ? PIECES.map((p) => {
      const x = WALK.to.x + p.dx;
      const z = WALK.to.z + p.dz;
      // Turned to face the walk: its front (+z in its own frame) toward the nearest point on it.
      const t = Math.max(0, Math.min(WALK.len, (x - WALK.from.x) * WALK.ux + (z - WALK.from.z) * WALK.uz));
      const yaw = Math.atan2(WALK.from.x + WALK.ux * t - x, WALK.from.z + WALK.uz * t - z);
      return { ...p, x, z, yaw };
    })
  : [];

/** The walk itself, as a segment, for the scatter to keep clear of (null without one). */
export const LONDON_WALK = WALK ? { ax: WALK.from.x, az: WALK.from.z, bx: WALK.from.x + WALK.ux * WALK.len, bz: WALK.from.z + WALK.uz * WALK.len } : null;

const RED = '#d0202e';
const RED_DARK = '#a3161f';
const IRON = '#2b2f33';
const GOLD = '#f2c14e';
const LAMP = '#ffd27a';

/** The K6 kiosk: red, with rows of little windows, TELEPHONE lit along the top, a domed roof and a crown. */
function phoneBox(k: Kit, gk: Kit) {
  const s = 0.82;
  k.box(s + 0.12, 0.12, s + 0.12, '#9a948b', { p: [0, 0.06, 0] });
  k.box(s, 0.16, s, RED_DARK, { p: [0, 0.2, 0] });
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.box(0.1, 1.86, 0.1, RED, { p: [x * (s / 2 - 0.05), 1.21, z * (s / 2 - 0.05)] });
  // Each face: glass in a red frame, glazing bars across it (three panes wide, eight high), and the sign over it.
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    const at = (x: number, y: number, d: number): V3 => [Math.sin(a) * d + Math.cos(a) * x, y, Math.cos(a) * d - Math.sin(a) * x];
    gk.addGlow(new BoxGeometry(s - 0.16, 1.44, 0.02), '#ffffff', { p: at(0, 1.08, s / 2 - 0.06), r: [0, a, 0] });
    k.box(s - 0.08, 0.1, 0.06, RED, { p: at(0, 0.33, s / 2 - 0.03), r: [0, a, 0] });
    k.box(s - 0.08, 0.1, 0.06, RED, { p: at(0, 1.84, s / 2 - 0.03), r: [0, a, 0] });
    for (const x of [-0.11, 0.11]) k.box(0.035, 1.44, 0.05, RED, { p: at(x, 1.08, s / 2 - 0.03), r: [0, a, 0], jitter: 0 });
    for (let j = 1; j < 8; j++) k.box(s - 0.16, 0.03, 0.05, RED, { p: at(0, 0.36 + j * 0.18, s / 2 - 0.03), r: [0, a, 0], jitter: 0 });
    k.box(s - 0.2, 0.11, 0.06, RED_DARK, { p: at(0, 2.0, s / 2 - 0.02), r: [0, a, 0] });
    k.addGlow(new BoxGeometry(s - 0.3, 0.07, 0.02), '#ffffff', { p: at(0, 2.0, s / 2 + 0.015), r: [0, a, 0] });
    // The crown, in relief over the sign.
    k.box(0.14, 0.06, 0.03, GOLD, { p: at(0, 2.2, s / 2 + 0.01), r: [0, a, 0], jitter: 0 });
    for (const x of [-0.05, 0, 0.05]) k.box(0.025, 0.06, 0.03, GOLD, { p: at(x, 2.26, s / 2 + 0.01), r: [0, a, 0], jitter: 0 });
  }
  k.box(s + 0.06, 0.1, s + 0.06, RED, { p: [0, 2.12, 0] });
  k.box(s + 0.1, 0.12, s + 0.1, RED, { p: [0, 2.26, 0] });
  k.sphere(0.5, RED, { p: [0, 2.3, 0], s: [1.15, 0.38, 1.15] }, 12, 6);
  // A door handle on the front.
  k.box(0.04, 0.22, 0.05, IRON, { p: [0.28, 1.1, s / 2 + 0.02], jitter: 0 });
}

/** A pillar box: a red post box with a domed cap and a black foot. */
function pillarBox(k: Kit) {
  k.cyl(0.27, 0.29, 0.14, IRON, { p: [0, 0.07, 0] }, 14);
  k.cyl(0.25, 0.25, 1.0, RED, { p: [0, 0.64, 0] }, 14);
  k.cyl(0.29, 0.27, 0.1, RED, { p: [0, 1.17, 0] }, 14);
  k.sphere(0.27, RED, { p: [0, 1.2, 0], s: [1, 0.55, 1] }, 14, 6);
  k.box(0.24, 0.035, 0.05, IRON, { p: [0, 1.0, 0.24], jitter: 0 });
  k.box(0.2, 0.16, 0.03, '#f4efe2', { p: [0, 0.72, 0.245], jitter: 0 });
  k.box(0.06, 0.06, 0.03, GOLD, { p: [0, 0.9, 0.25], jitter: 0 });
}

/** A park bench: slats on black cast iron ends, facing +z. */
function bench(k: Kit) {
  for (const x of [-0.62, 0.62]) {
    k.box(0.07, 0.42, 0.5, IRON, { p: [x, 0.21, 0] });
    k.box(0.07, 0.5, 0.07, IRON, { p: [x, 0.62, -0.24], r: [-0.18, 0, 0] });
    k.box(0.07, 0.06, 0.4, IRON, { p: [x, 0.62, 0.02] });
  }
  for (let i = 0; i < 4; i++) k.box(1.42, 0.05, 0.1, i % 2 ? '#b98352' : '#a8744a', { p: [0, 0.44, -0.18 + i * 0.12] });
  for (let i = 0; i < 3; i++) k.box(1.42, 0.09, 0.04, i % 2 ? '#b98352' : '#a8744a', { p: [0, 0.62 + i * 0.13, -0.27 - i * 0.025], r: [-0.18, 0, 0] });
}

/** A Victorian lamp post: a fluted column on a heavy foot, a ladder bar, and a lantern lit after dark. */
function lampPost(k: Kit) {
  k.cyl(0.17, 0.2, 0.42, IRON, { p: [0, 0.21, 0] }, 8);
  k.cyl(0.12, 0.15, 0.16, IRON, { p: [0, 0.5, 0] }, 8);
  k.cyl(0.055, 0.075, 2.1, IRON, { p: [0, 1.62, 0] }, 8);
  k.cyl(0.09, 0.06, 0.12, IRON, { p: [0, 2.7, 0] }, 8);
  k.box(0.46, 0.04, 0.04, IRON, { p: [0, 2.5, 0] });
  for (const x of [-0.23, 0.23]) k.sphere(0.03, IRON, { p: [x, 2.5, 0] }, 5, 4);
  k.addGlow(new CylinderGeometry(0.16, 0.11, 0.34, 4), '#fff1c2', { p: [0, 2.94, 0], r: [0, Math.PI / 4, 0] });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    k.box(0.025, 0.36, 0.025, IRON, { p: [Math.cos(a) * 0.15, 2.94, Math.sin(a) * 0.15], r: [0, 0, Math.cos(a) * 0.12], jitter: 0 });
  }
  k.add(new CylinderGeometry(0, 0.24, 0.2, 4), IRON, { p: [0, 3.2, 0], r: [0, Math.PI / 4, 0] });
  k.add(new SphereGeometry(0.04, 6, 4), GOLD, { p: [0, 3.32, 0] });
}

export function buildLondon() {
  const group = new Group();
  group.name = 'little-london';
  const colliders: Collider[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  const k = new Kit(1300);
  const gk = new Kit(1301);
  const m = new Matrix4();
  const q = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const ONE = new Vector3(1, 1, 1);
  for (const s of LONDON_SPOTS) {
    const y = heightAt(s.x, s.z) - 0.04;
    // Set down in its spot, turned to face the walk.
    m.compose(new Vector3(s.x, y, s.z), q.setFromAxisAngle(UP, s.yaw), ONE);
    k.within(m, () => gk.within(m, () => (s.kind === 'phone' ? phoneBox(k, gk) : s.kind === 'pillar' ? pillarBox(k) : s.kind === 'bench' ? bench(k) : lampPost(k))));
    if (s.kind === 'lamp') {
      halos.push([s.x, y + 2.94, s.z, 1.7]);
      pools.push([s.x, y + 0.04, s.z, 2.0]);
    }
    if (s.kind === 'phone') {
      halos.push([s.x, y + 1.2, s.z, 1.5]);
      pools.push([s.x, y + 0.04, s.z, 1.3]);
    }
    colliders.push({ x: s.x, z: s.z, r: s.r });
  }
  // The lanterns are always lit a little; the kiosk's glass is clear by day and glows after dark.
  const glass = new MeshBasicMaterial({ vertexColors: true, color: '#9fb6c4', toneMapped: false });
  const day = glass.color.clone();
  const night = new Color('#ffdc96');
  if (!k.isEmpty()) group.add(k.build({ glowMaterial: new MeshStandardMaterial({ vertexColors: true, emissive: LAMP, emissiveIntensity: 0.55, toneMapped: false }) }));
  if (!gk.isEmpty()) group.add(gk.build({ glowMaterial: glass }));
  return {
    group,
    colliders,
    night: (n: number) => void glass.color.lerpColors(day, night, n),
    glows: () => ({ halos, pools }),
  };
}
