// The bridges out to the islets. A footbridge is a plank deck on posts, a
// railing either side, a lantern at each end, and a wooden arch at the main
// island's end with the islet's name on it. A tower bridge is Tower Bridge,
// chunky: a road deck through two Gothic towers standing in the sea on
// granite piers, walkways strung high between their tops, blue and white
// chains swooping down to little towers at either end, and the split in the
// middle of the road where the bascules meet. Either way the railings are
// colliders, so you walk the deck and never off its side; swimmers can't get
// under it either (like the pier, its posts and piers are in the way), so
// they go round the islet instead.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Obstacle } from '../character';
import type { Glow } from '../landmarks/builders';
import { Kit, type V3 } from './kit';
import type { Collider } from './nature';
import { BRIDGES, ISLANDS, heightAt } from './shape';
import type { Bridge } from '../../../world/geo';

const WOOD = '#b98352';
const WOOD_LIGHT = '#d6a86f';
const WOOD_DARK = '#7d5134';
const LAMP = '#ffd27a';

/** Railing posts this far apart along a bridge, and how high the rail runs. */
const POST_EVERY = 1.25;
const RAIL = 0.82;

/** A name board, painted on a canvas: the islet's name in the display font, on a cream board. */
function board(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff3df';
    g.beginPath();
    g.roundRect(6, 6, c.width - 12, c.height - 12, 26);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = '#3a2a24';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
    g.font = `800 60px ${font}`;
    g.fillText(text, c.width / 2, c.height / 2 + 3, c.width - 60);
    tex.needsUpdate = true;
  };
  paint();
  // The display font may still be on its way: paint again once it's here.
  document.fonts?.ready.then(paint).catch(() => {});
  return tex;
}

/** The lamps: always lit a little, and haloed after dark. */
const lampMaterial = () => new MeshStandardMaterial({ vertexColors: true, emissive: LAMP, emissiveIntensity: 0.6, toneMapped: false });

export function buildBridges() {
  const group = new Group();
  group.name = 'bridges';
  const colliders: Collider[] = [];
  const obstacles: Obstacle[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  const textures: CanvasTexture[] = [];
  const glass: { mat: MeshBasicMaterial; day: Color; night: Color }[] = [];

  for (const b of BRIDGES) {
    if (b.style === 'tower') {
      const t = towerBridge(b);
      group.add(t.group);
      colliders.push(...t.colliders);
      obstacles.push(...t.obstacles);
      halos.push(...t.halos);
      pools.push(...t.pools);
      glass.push(t.glass);
      continue;
    }
    obstacles.push({ ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, r: b.width / 2, top: b.deck });
    const k = new Kit(900 + b.i);
    const L = b.length;
    const w = b.width;
    const y = b.deck;
    // In the bridge's own frame: x across (to its right, heading from a to b), z along it from its `a` end.
    const at = (x: number, z: number) => ({ x: b.ax + b.ux * z + b.uz * x, z: b.az + b.uz * z - b.ux * x });

    // Planks across, a beam under each edge, and posts down to the seabed wherever there's room under the deck.
    let i = 0;
    for (let z = 0.16; z < L - 0.1; z += 0.38) k.rbox(w, 0.1, 0.33, 0.02, i++ % 3 === 0 ? WOOD_LIGHT : WOOD, { p: [0, y - 0.05, z], r: [0, 0, ((i * 37) % 7 - 3) * 0.004] });
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) k.box(0.16, 0.16, L, WOOD_DARK, { p: [x, y - 0.18, L / 2] });
    for (let z = 0.9; z < L - 0.5; z += 1.8) {
      for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
        const p = at(x, z);
        const ground = heightAt(p.x, p.z);
        if (ground > y - 0.45) continue;
        const h = y - 0.2 - (ground - 0.4);
        k.cyl(0.11, 0.13, h, WOOD_DARK, { p: [x, y - 0.2 - h / 2, z] }, 7);
      }
    }
    // The railings: posts, a rail on top and one halfway, and a capped post at each end.
    const n = Math.max(2, Math.round(L / POST_EVERY));
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 0.06);
      for (let j = 0; j <= n; j++) {
        const z = (j / n) * L;
        const end = j === 0 || j === n;
        k.box(end ? 0.16 : 0.1, RAIL + (end ? 0.18 : 0), end ? 0.16 : 0.1, WOOD_DARK, { p: [x, y + (RAIL + (end ? 0.18 : 0)) / 2, z] });
        if (end) k.sphere(0.1, WOOD_DARK, { p: [x, y + RAIL + 0.22, z] }, 7, 5);
      }
      k.rbox(0.12, 0.08, L, 0.03, WOOD_LIGHT, { p: [x, y + RAIL, L / 2] });
      k.box(0.06, 0.06, L, WOOD, { p: [x, y + RAIL * 0.5, L / 2] });
      // Keep walkers on the deck: a row of little colliders along the rail.
      for (let z = 0.1; z <= L - 0.1; z += 0.4) {
        const p = at(side * (w / 2 + 0.02), z);
        colliders.push({ x: p.x, z: p.z, r: 0.12 });
      }
    }
    // A lantern on a post at each end, lit after dark.
    for (const [z, side] of [[0.25, 1], [L - 0.25, -1]] as const) {
      const x = side * (w / 2 + 0.22);
      k.cyl(0.06, 0.07, 1.7, WOOD_DARK, { p: [x, y + 0.85, z] }, 6);
      k.box(0.36, 0.05, 0.05, WOOD_DARK, { p: [x - side * 0.14, y + 1.68, z] });
      k.addGlow(new SphereGeometry(0.13, 8, 6), LAMP, { p: [x - side * 0.27, y + 1.5, z] });
      const lamp = at(x - side * 0.27, z);
      halos.push([lamp.x, y + 1.5, lamp.z, 1.6]);
      pools.push([lamp.x, y + 0.02, lamp.z, 1.4]);
      const post = at(x, z);
      colliders.push({ x: post.x, z: post.z, r: 0.12 });
    }
    const built = k.build({ glowMaterial: lampMaterial() });
    built.position.set(b.ax, 0, b.az);
    built.rotation.y = b.yaw;
    group.add(built);

    // An arch over the main island's end, with the name of the islet it leads to.
    const [from, to] = b.joins;
    const home = from === 0 ? 0 : to === 0 ? 1 : -1;
    const isle = ISLANDS[from === 0 ? to : from];
    if (home < 0 || !isle) continue;
    const arch = new Group();
    const ak = new Kit(950 + b.i);
    const span = w + 0.5;
    for (const x of [-span / 2, span / 2]) ak.box(0.18, 2.4, 0.18, WOOD_DARK, { p: [x, 1.2, 0] });
    ak.rbox(span + 0.5, 0.18, 0.22, 0.05, WOOD_DARK, { p: [0, 2.42, 0] });
    ak.rbox(span + 0.2, 0.1, 0.16, 0.04, WOOD, { p: [0, 2.22, 0] });
    arch.add(ak.build());
    const tex = board(isle.name, '#b98352');
    textures.push(tex);
    const sign = new Mesh(new PlaneGeometry(1.9, 0.48), new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 }));
    sign.position.set(0, 1.86, 0.02);
    sign.castShadow = false;
    arch.add(sign);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.02;
    arch.add(back);
    // Standing at the end of the deck, facing out along the bridge.
    const end = home === 0 ? { x: b.ax, z: b.az } : { x: b.bx, z: b.bz };
    arch.position.set(end.x, y, end.z);
    arch.rotation.y = home === 0 ? b.yaw + Math.PI : b.yaw;
    group.add(arch);
    for (const x of [-span / 2, span / 2]) {
      const p = { x: end.x + Math.cos(arch.rotation.y) * x, z: end.z - Math.sin(arch.rotation.y) * x };
      colliders.push({ x: p.x, z: p.z, r: 0.16 });
    }
  }

  return {
    group,
    colliders,
    /** For swimmers to go round, like the pier: each deck from end to end, and a tower bridge's piers. */
    obstacles,
    /** After dark, the tower bridge's windows and walkways light up (its lamps are always lit). */
    night: (n: number) => {
      for (const g of glass) g.mat.color.lerpColors(g.day, g.night, n);
    },
    glows: () => ({ halos, pools }),
    dispose() {
      textures.forEach((t) => t.dispose());
    },
  };
}

// ---------------------------------------------------------------- Tower Bridge

const PORTLAND = '#e7dfcf';
const PORTLAND_SHADE = '#d6ccb8';
const PORTLAND_DARK = '#c2b59e';
const GRANITE = '#8f8a84';
const GRANITE_LIGHT = '#a7a29a';
const GRANITE_DARK = '#77726c';
const SLATE = '#5d7d9c';
const SLATE_DARK = '#4b6784';
const GOLD = '#f2c14e';
/** The steelwork's light blue and white. */
const BLUE = '#8fc4e8';
const BLUE_DEEP = '#4f8cc0';
const WHITE = '#f4f7fa';
const IRON = '#3e6f9e';
const ASPHALT = '#78716a';
const ASPHALT_BASCULE = '#6a645e';
const PAVING = '#cfc7b8';
const KERB = '#aba293';
const SLIT = '#3d4756';

/** The tower bridge's measurements, in its own frame (x across, z along from its `a` end, y up from the sea). */
const T = {
  /** Where the towers stand, as a share of the length. */
  towers: [0.32, 0.68],
  /** A tower's width across the bridge and its depth along it. */
  tw: 5.4,
  td: 2.5,
  /** The road arch through a tower: half its width, how high its sides go above the deck, and the point's height above that. */
  archHW: 1.82,
  archSpring: 1.3,
  archRise: 2.3,
  /** The tower's body, from its granite pier to the cornice. */
  base: 0.6,
  top: 5.9,
  /** The high walkways: their middle across, half their width, bottom and top. */
  walkX: 1.35,
  walkHW: 0.45,
  walkY0: 4.85,
  walkY1: 5.65,
  /** The chains, outside the railings: how far out, how high they leave the towers, and where they meet the little towers at the ends. */
  chainX: 2.05,
  chainTop: 5.35,
  chainEnd: 2.15,
  /** The little towers at either end: their middle across, and how far in from the end. */
  endX: 2.3,
  endZ: 0.55,
};

/**
 * A pointed arch from (hw, 0) over to (-hw, 0), its point `rise` above:
 * two arcs, each centred on the far side of the middle, meeting at the top.
 */
function archPoints(hw: number, rise: number, n = 5): [number, number][] {
  const c = Math.max(0, (rise * rise - hw * hw) / (2 * hw));
  const r = hw + c;
  const top = Math.acos(Math.min(1, c / r));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (top * i) / n;
    pts.push([-c + r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - top + (top * i) / n;
    pts.push([c + r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** A shape's outline extruded `depth` along +z, centred on z = 0. */
function extrude(shape: Shape, depth: number) {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A tower's body: a block `tw` across, from y0 to y1, with the road's pointed arch through it along z. */
function towerBody(depth: number, y0: number, y1: number, ys: number) {
  const s = new Shape();
  s.moveTo(-T.tw / 2, y0);
  s.lineTo(-T.tw / 2, y1);
  s.lineTo(T.tw / 2, y1);
  s.lineTo(T.tw / 2, y0);
  s.lineTo(T.archHW, y0);
  for (const [x, y] of archPoints(T.archHW, T.archRise)) s.lineTo(x, ys + y);
  s.lineTo(-T.archHW, y0);
  s.closePath();
  return extrude(s, depth);
}

/** A lancet: an upright window with a pointed top, its sill at y = 0, facing +z. */
function lancetShape(w: number, h: number) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  for (const [x, y] of archPoints(w / 2, w * 0.75, 3).slice(1)) s.lineTo(x, h + y);
  s.closePath();
  return s;
}

/**
 * A lancet window on a tower's face: a stone surround and glass that lights
 * up after dark. `p` is the middle of its sill on the face, `ry` turns it to
 * face out (0 faces +z).
 */
function lancet(k: Kit, wk: Kit, p: V3, ry: number, w: number, h: number) {
  const out = (d: number): V3 => [p[0] + Math.sin(ry) * d, p[1], p[2] + Math.cos(ry) * d];
  k.add(extrude(lancetShape(w + 0.16, h + 0.06), 0.08), PORTLAND_DARK, { p: out(0.02), r: [0, ry, 0] });
  wk.addGlow(extrude(lancetShape(w, h), 0.04), '#ffffff', { p: out(0.05), r: [0, ry, 0] });
  k.box(w + 0.26, 0.07, 0.16, PORTLAND_SHADE, { p: out(0.06), r: [0, ry, 0] });
}

/** A hipped roof: a box whose top pinches in to a ridge along x. */
function hipRoof(w: number, h: number, d: number) {
  const g = new BoxGeometry(w, h, d).toNonIndexed();
  g.translate(0, h / 2, 0);
  const pos = g.getAttribute('position');
  const ridge = Math.max(0, w / 2 - d / 2);
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < h * 0.99) continue;
    pos.setX(i, Math.sign(pos.getX(i)) * ridge);
    pos.setZ(i, 0);
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** A gold finial: a ball and a spike. */
function finial(k: Kit, x: number, y: number, z: number, s = 1) {
  k.sphere(0.075 * s, GOLD, { p: [x, y + 0.05 * s, z] }, 8, 6);
  k.cone(0.035 * s, 0.26 * s, GOLD, { p: [x, y + 0.24 * s, z] }, 6);
}

/** A Victorian lamp post on the deck, on the line of the railing: its lantern lit after dark. */
function lampPost(k: Kit, x: number, y: number, z: number) {
  k.cyl(0.07, 0.09, 0.22, IRON, { p: [x, y + 0.11, z] }, 8);
  k.cyl(0.04, 0.055, 1.62, IRON, { p: [x, y + 0.92, z] }, 8);
  k.cyl(0.11, 0.07, 0.08, IRON, { p: [x, y + 1.76, z] }, 8);
  k.addGlow(new CylinderGeometry(0.1, 0.075, 0.24, 6), '#fff3c4', { p: [x, y + 1.92, z] });
  k.cone(0.14, 0.16, IRON, { p: [x, y + 2.12, z] }, 6);
  k.sphere(0.03, GOLD, { p: [x, y + 2.22, z] }, 6, 4);
}

function towerBridge(b: Bridge) {
  const L = b.length;
  const w = b.width;
  const d = b.deck;
  const hw = w / 2;
  const k = new Kit(1900 + b.i);
  const wk = new Kit(1950 + b.i);
  const colliders: Collider[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  // In the bridge's own frame: x across, z along it from its `a` end.
  const at = (x: number, z: number) => ({ x: b.ax + b.ux * z + b.uz * x, z: b.az + b.uz * z - b.ux * x });
  const halo = (x: number, y: number, z: number, s: number) => {
    const p = at(x, z);
    halos.push([p.x, y, p.z, s]);
  };
  const pool = (x: number, z: number, s: number) => {
    const p = at(x, z);
    pools.push([p.x, d + 0.02, p.z, s]);
  };
  const zt = T.towers.map((f) => f * L);
  const mid = L / 2;
  const td2 = T.td / 2;

  // ---------- The deck ----------
  // A steel deck on blue girders: a warm grey road with a dashed white line, a pavement either side, and the bascules' split in the middle.
  k.box(w, 0.26, L, '#8197a8', { p: [0, d - 0.21, L / 2] });
  const leaf0 = zt[0] + td2;
  const leaf1 = zt[1] - td2;
  for (const [z0, z1, c] of [[0, leaf0, ASPHALT], [leaf0, leaf1, ASPHALT_BASCULE], [leaf1, L, ASPHALT]] as const) k.box(2.1, 0.1, z1 - z0, c, { p: [0, d - 0.05, (z0 + z1) / 2], jitter: 0.015 });
  for (const s of [-1, 1]) {
    k.box(0.6, 0.12, L, PAVING, { p: [s * 1.37, d - 0.03, L / 2], jitter: 0.02 });
    k.box(0.07, 0.13, L, KERB, { p: [s * 1.07, d - 0.025, L / 2] });
  }
  for (let z = 0.45; z < L - 0.3; z += 0.9) if (Math.abs(z - mid) > 0.3) k.box(0.07, 0.02, 0.42, WHITE, { p: [0, d + 0.005, z], jitter: 0 });
  // Where the two leaves meet: a dark seam right across, and a steel plate either side of it.
  k.box(w - 0.04, 0.03, 0.05, '#2a2725', { p: [0, d + 0.02, mid], jitter: 0 });
  for (const s of [-1, 1]) k.box(2.1, 0.012, 0.16, '#8e8780', { p: [0, d + 0.003, mid + s * 0.12], jitter: 0 });
  // The girders down either side: light blue, a white band along the top, and panels picked out in white.
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.05);
    k.box(0.12, 0.42, L, BLUE, { p: [x, d - 0.2, L / 2], jitter: 0.015 });
    k.box(0.15, 0.05, L, WHITE, { p: [x, d + 0.02, L / 2], jitter: 0 });
    for (let z = 0.6; z < L - 0.3; z += 1.2) k.box(0.13, 0.36, 0.05, WHITE, { p: [x + s * 0.01, d - 0.2, z], jitter: 0 });
  }

  // ---------- The railings ----------
  // Cast iron, painted: balusters between posts, rails top and bottom, broken where the leaves part.
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.04);
    for (const [z0, z1] of [[0, mid - 0.05], [mid + 0.05, L]]) {
      k.box(0.08, 0.06, z1 - z0, BLUE, { p: [x, d + RAIL, (z0 + z1) / 2] });
      k.box(0.05, 0.04, z1 - z0, IRON, { p: [x, d + 0.55, (z0 + z1) / 2], jitter: 0 });
      k.box(0.05, 0.05, z1 - z0, IRON, { p: [x, d + 0.1, (z0 + z1) / 2], jitter: 0 });
    }
    let j = 0;
    for (let z = 0.04; z <= L - 0.03; z += 0.3, j++) {
      const post = j % 4 === 0 || Math.abs(z - mid) < 0.16;
      k.box(post ? 0.08 : 0.035, RAIL, post ? 0.08 : 0.035, IRON, { p: [x, d + RAIL / 2, z], jitter: 0 });
      if (post) k.sphere(0.055, BLUE, { p: [x, d + RAIL + 0.06, z] }, 6, 4);
    }
    for (const z of [0.04, L - 0.04, mid - 0.08, mid + 0.08]) k.box(0.1, RAIL + 0.1, 0.1, IRON, { p: [x, d + (RAIL + 0.1) / 2, z] });
    // Keep walkers on the deck: a row of little colliders along the rail.
    for (let z = 0.1; z <= L - 0.1; z += 0.4) {
      const p = at(s * (hw + 0.02), z);
      colliders.push({ x: p.x, z: p.z, r: 0.12 });
    }
  }
  // Lamp posts along the deck, on the line of the railings.
  for (const z of [2.5, L - 2.5, mid - 1.15, mid + 1.15]) {
    for (const s of [-1, 1]) {
      lampPost(k, s * (hw - 0.04), d, z);
      halo(s * (hw - 0.04), d + 1.92, z, 1.5);
      pool(s * (hw - 0.4), z, 1.35);
    }
  }

  // ---------- The two towers ----------
  for (const [ti, z] of zt.entries()) {
    // The granite pier, rising out of the sea, with a cutwater at either end against the tide.
    k.rbox(T.tw + 1.0, 3.8, T.td + 0.6, 0.12, GRANITE, { p: [0, T.base - 1.9, z], jitter: 0.05 });
    k.rbox(T.tw + 1.15, 0.22, T.td + 0.75, 0.06, GRANITE_LIGHT, { p: [0, T.base - 0.11, z] });
    k.box(T.tw + 1.04, 0.12, T.td + 0.64, GRANITE_DARK, { p: [0, 0.16, z], jitter: 0 });
    for (const s of [-1, 1]) {
      k.add(new CylinderGeometry(1, 1, 3.6, 4), GRANITE, { p: [s * (T.tw / 2 + 0.5), T.base - 1.9 + 0.1, z], s: [0.95, 1, (T.td + 0.6) / 2], jitter: 0.05 });
      k.add(new CylinderGeometry(0.4, 1, 0.5, 4), GRANITE_LIGHT, { p: [s * (T.tw / 2 + 0.5), T.base + 0.03, z], s: [0.95, 1, (T.td + 0.6) / 2] });
    }
    // Granite legs up past the deck, then the Portland stone body with the road's arch through it.
    for (const s of [-1, 1]) k.box(T.tw / 2 - T.archHW + 0.08, 0.75, T.td + 0.08, GRANITE_LIGHT, { p: [s * (T.archHW + (T.tw / 2 - T.archHW) / 2), T.base + 0.37, z], jitter: 0.04 });
    k.add(towerBody(T.td, T.base + 0.74, T.top, d + T.archSpring), PORTLAND, { p: [0, 0, z], jitter: 0.025 });
    // String courses round the legs and over the arch, and a cornice under the roof.
    for (const y of [T.base + 0.74, 3.2]) {
      for (const s of [-1, 1]) {
        k.box(0.1, 0.1, T.td + 0.1, PORTLAND_SHADE, { p: [s * (T.tw / 2 + 0.03), y, z], jitter: 0 });
        for (const f of [-1, 1]) k.box(T.tw / 2 - T.archHW, 0.1, 0.1, PORTLAND_SHADE, { p: [s * (T.archHW + (T.tw / 2 - T.archHW) / 2), y, z + f * (td2 + 0.03)], jitter: 0 });
      }
    }
    k.box(T.tw + 0.1, 0.1, T.td + 0.1, PORTLAND_SHADE, { p: [0, d + T.archSpring + T.archRise + 0.25, z], jitter: 0 });
    k.box(T.tw + 0.26, 0.16, T.td + 0.26, PORTLAND_DARK, { p: [0, T.top + 0.08, z] });
    // A voussoir ring round the arch, on both faces.
    for (const f of [-1, 1]) {
      const ring = new Shape();
      const outer = archPoints(T.archHW + 0.16, T.archRise + 0.16);
      const inner = archPoints(T.archHW, T.archRise).reverse();
      ring.moveTo(outer[0][0], outer[0][1]);
      for (const [x, y] of outer.slice(1)) ring.lineTo(x, y);
      for (const [x, y] of inner) ring.lineTo(x, y);
      ring.closePath();
      k.add(extrude(ring, 0.08), PORTLAND_DARK, { p: [0, d + T.archSpring, z + f * (td2 + 0.03)] });
    }
    // The upper stage, set back a little, and its hipped roof in slate with a gold finial at either end of the ridge.
    const up0 = T.top + 0.16;
    k.box(T.tw - 0.6, 0.7, T.td - 0.3, PORTLAND, { p: [0, up0 + 0.35, z], jitter: 0.025 });
    k.box(T.tw - 0.45, 0.08, T.td - 0.15, PORTLAND_SHADE, { p: [0, up0 + 0.72, z] });
    const rh = 1.3;
    k.add(hipRoof(T.tw - 0.5, rh, T.td - 0.2), SLATE, { p: [0, up0 + 0.76, z], jitter: 0.03 });
    const ridge = (T.tw - 0.5) / 2 - (T.td - 0.2) / 2;
    for (const s of [-1, 1]) finial(k, s * ridge, up0 + 0.76 + rh, z, 1.2);
    k.box(ridge * 2, 0.06, 0.08, GOLD, { p: [0, up0 + 0.78 + rh, z], jitter: 0 });
    // Four corner turrets, octagonal, with pointed slate roofs and gold finials.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (T.tw / 2 - 0.3);
        const tz = z + sz * (td2 - 0.3);
        k.cyl(0.52, 0.56, 0.9, GRANITE_LIGHT, { p: [x, T.base + 0.4, tz] }, 8);
        k.cyl(0.46, 0.46, 6.9 - T.base - 0.85, PORTLAND, { p: [x, (6.9 + T.base + 0.85) / 2, tz], jitter: 0.02 }, 8);
        k.cyl(0.55, 0.5, 0.16, PORTLAND_DARK, { p: [x, 6.95, tz] }, 8);
        k.cone(0.55, 0.95, sx * sz > 0 ? SLATE : SLATE_DARK, { p: [x, 7.5, tz] }, 8);
        finial(k, x, 7.95, tz);
        // Arrow slits, facing out.
        for (const y of [2.4, 4.0, 5.6]) k.box(0.07, 0.36, 0.07, SLIT, { p: [x + sx * 0.42, y, tz + sz * 0.18], jitter: 0 });
      }
    }
    // Lancet windows: up the faces you see from the sea, over the arch, and on the upper stage.
    for (const s of [-1, 1]) {
      const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      const fx = s * (T.tw / 2 + 0.01);
      lancet(k, wk, [fx, 1.75, z], ry, 0.34, 0.6);
      lancet(k, wk, [fx, 3.45, z], ry, 0.34, 0.7);
      for (const dz of [-0.32, 0.32]) lancet(k, wk, [fx, 4.85, z + dz], ry, 0.26, 0.55);
      lancet(k, wk, [s * (T.tw / 2 - 0.29), up0 + 0.12, z], ry, 0.26, 0.32);
      halo(fx + s * 0.25, 2.1, z, 0.9);
      halo(fx + s * 0.25, 5.15, z, 1.1);
      // Over the arch on the faces along the bridge: a pair on the outer face, one between the walkways on the inner face.
      const outer = ti === 0 ? -1 : 1;
      const fz = z + s * (td2 + 0.01);
      const xs = s === outer ? [-0.62, 0.62] : [0];
      for (const x of xs) lancet(k, wk, [x, 4.75, fz], s > 0 ? 0 : Math.PI, 0.3, 0.55);
    }
    // The legs stand outside the railings; walkers keep to the deck between them.
    for (const sx of [-1, 1]) for (const dz of [-(td2 - 0.3), 0, td2 - 0.3]) {
      const p = at(sx * (T.tw / 2 - 0.3), z + dz);
      colliders.push({ x: p.x, z: p.z, r: 0.48 });
    }
  }

  // ---------- The high walkways ----------
  // Two, side by side between the tops of the towers: light blue and white lattice round glass that lights up after dark.
  const wz0 = zt[0] + td2;
  const wz1 = zt[1] - td2;
  const wl = wz1 - wz0;
  const panels = 6;
  for (const s of [-1, 1]) {
    const cx = s * T.walkX;
    k.box(T.walkHW * 2 + 0.06, 0.08, wl, BLUE, { p: [cx, T.walkY0 + 0.04, (wz0 + wz1) / 2] });
    k.box(T.walkHW * 2 + 0.16, 0.09, wl + 0.06, BLUE, { p: [cx, T.walkY1, (wz0 + wz1) / 2] });
    k.box(T.walkHW * 2 + 0.02, 0.05, wl, WHITE, { p: [cx, T.walkY1 + 0.07, (wz0 + wz1) / 2], jitter: 0 });
    wk.addGlow(new BoxGeometry(T.walkHW * 2 - 0.12, T.walkY1 - T.walkY0 - 0.12, wl), '#ffffff', { p: [cx, (T.walkY0 + T.walkY1) / 2, (wz0 + wz1) / 2] });
    for (const f of [-1, 1]) {
      const x = cx + f * T.walkHW;
      k.box(0.09, 0.12, wl, BLUE, { p: [x, T.walkY1 - 0.08, (wz0 + wz1) / 2] });
      k.box(0.09, 0.12, wl, BLUE, { p: [x, T.walkY0 + 0.1, (wz0 + wz1) / 2] });
      for (let j = 0; j <= panels; j++) {
        const z = wz0 + (wl * j) / panels;
        k.box(0.08, T.walkY1 - T.walkY0 - 0.1, 0.07, BLUE_DEEP, { p: [x, (T.walkY0 + T.walkY1) / 2, z], jitter: 0 });
        if (j === panels) break;
        const z2 = wz0 + (wl * (j + 1)) / panels;
        const ya = T.walkY0 + 0.14;
        const yb = T.walkY1 - 0.12;
        k.beam([x + f * 0.01, ya, z], [x + f * 0.01, yb, z2], 0.045, 0.06, WHITE);
        k.beam([x + f * 0.01, yb, z], [x + f * 0.01, ya, z2], 0.045, 0.06, WHITE);
      }
    }
    // Lanterns hung under the walkway, lighting the road below.
    for (const dz of [-0.85, 0.85]) {
      const z = mid + dz;
      k.box(0.03, 0.14, 0.03, IRON, { p: [cx, T.walkY0 - 0.06, z], jitter: 0 });
      k.addGlow(new BoxGeometry(0.15, 0.2, 0.15), '#fff3c4', { p: [cx, T.walkY0 - 0.24, z] });
      k.cone(0.14, 0.1, IRON, { p: [cx, T.walkY0 - 0.1, z] }, 4);
      halo(cx, T.walkY0 - 0.24, z, 1.25);
      pool(cx * 0.6, z, 1.3);
    }
    halo(cx, (T.walkY0 + T.walkY1) / 2, mid, 1.6);
  }

  // ---------- The chains and the little towers at the ends ----------
  for (const [ti, z] of zt.entries()) {
    const out = ti === 0 ? -1 : 1;
    const endZ = ti === 0 ? T.endZ : L - T.endZ;
    const z0 = z + out * td2;
    const z1 = endZ - out * 0.45;
    const sag = 1.7;
    const curve = (t: number): [number, number] => [T.chainTop + (T.chainEnd - T.chainTop) * t - 4 * sag * t * (1 - t), z0 + (z1 - z0) * t];
    const N = 10;
    for (const s of [-1, 1]) {
      const x = s * T.chainX;
      for (let i = 0; i <= N; i++) {
        const [y, cz] = curve(i / N);
        // Two chords and the lattice between them.
        k.box(0.05, 0.3, 0.05, WHITE, { p: [x, y, cz], jitter: 0 });
        if (i < N) {
          const [y2, cz2] = curve((i + 1) / N);
          k.beam([x, y + 0.15, cz], [x, y2 + 0.15, cz2], 0.11, 0.1, BLUE);
          k.beam([x, y - 0.15, cz], [x, y2 - 0.15, cz2], 0.11, 0.1, BLUE);
          k.beam([x, y + 0.13, cz], [x, y2 - 0.13, cz2], 0.04, 0.05, WHITE);
        }
        // A hanger down to a bracket off the deck's girder, wherever the chain is high enough to need one.
        if (i > 0 && i < N && y - 0.15 > d + 0.5) {
          k.beam([x, y - 0.16, cz], [x, d - 0.12, cz], 0.035, 0.035, IRON);
          k.box(Math.abs(x) - hw + 0.08, 0.08, 0.08, BLUE_DEEP, { p: [s * (hw + (Math.abs(x) - hw) / 2), d - 0.16, cz] });
        }
      }
      // Where the chain meets a tower: a plate on the turret.
      k.box(0.16, 0.5, 0.2, BLUE_DEEP, { p: [x, T.chainTop, z0 + out * 0.05] });

      // The little tower at the end, where the chain comes down: granite footings, Portland stone, a slate roof and a finial.
      const ex = s * T.endX;
      const ground = Math.max(-1.6, Math.min(0, heightAt(at(ex, endZ).x, at(ex, endZ).z)) - 1.2);
      k.box(1.2, d + 0.3 - ground, 1.2, GRANITE, { p: [ex, (ground + d + 0.3) / 2, endZ], jitter: 0.05 });
      k.box(1.28, 0.12, 1.28, GRANITE_LIGHT, { p: [ex, d + 0.3, endZ] });
      k.box(0.96, 1.7, 0.96, PORTLAND, { p: [ex, d + 0.3 + 0.85, endZ], jitter: 0.03 });
      k.box(1.12, 0.14, 1.12, PORTLAND_DARK, { p: [ex, d + 2.05, endZ] });
      k.add(new CylinderGeometry(0, 0.82, 0.8, 4), SLATE, { p: [ex, d + 2.52, endZ], r: [0, Math.PI / 4, 0] });
      finial(k, ex, d + 2.88, endZ);
      for (const f of [-1, 1]) lancet(k, wk, [ex, d + 1.0, endZ + f * 0.49], f > 0 ? 0 : Math.PI, 0.24, 0.42);
      // A lantern on its inner face, over the way on.
      const lx = s * (T.endX - 0.5);
      k.box(0.18, 0.04, 0.04, IRON, { p: [lx - s * 0.05, d + 1.85, endZ], jitter: 0 });
      k.addGlow(new BoxGeometry(0.15, 0.22, 0.15), '#fff3c4', { p: [lx - s * 0.12, d + 1.72, endZ] });
      k.cone(0.13, 0.12, IRON, { p: [lx - s * 0.12, d + 1.89, endZ] }, 4);
      halo(lx - s * 0.12, d + 1.72, endZ, 1.4);
      pool(s * (hw - 0.35), endZ, 1.3);
      const c = at(ex, endZ);
      colliders.push({ x: c.x, z: c.z, r: 0.66 });
    }
  }

  const group = new Group();
  const lit = k.build({ glowMaterial: lampMaterial() });
  // The windows and the walkways' glass: slate grey by day, warm after dark.
  const day = new Color('#4d6176');
  const night = new Color('#ffcf85');
  const mat = new MeshBasicMaterial({ vertexColors: true, color: day.clone(), toneMapped: false });
  const lights = wk.build({ glowMaterial: mat });
  group.add(lit, lights);
  group.position.set(b.ax, 0, b.az);
  group.rotation.y = b.yaw;

  // Swimmers go round: the deck end to end (chains and all), and each tower's pier.
  const obstacles: Obstacle[] = [{ ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, r: T.chainX + 0.15, top: d }];
  for (const z of zt) {
    const p = at(-(T.tw / 2 + 1.2), z);
    const q = at(T.tw / 2 + 1.2, z);
    obstacles.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, r: td2 + 0.3, top: 9 });
  }
  return { group, colliders, obstacles, halos, pools, glass: { mat, day, night } };
}

/**
 * Clear the way on and off a bridge where it lands on something built (the
 * quay): whatever of `group` stands on the deck's end or just behind it, where
 * you step on, is taken out, and so are its colliders. Kit meshes are cut by
 * whole parts and instanced ones by whole instances; only small, low things
 * go (a bollard, a crate), never anything as big as the bus.
 */
export function clearLandings(group: Object3D, colliders: Collider[]) {
  const zones = BRIDGES.flatMap((b) =>
    ([0, 1] as const).map((end) => {
      const [x, z] = end === 0 ? [b.ax, b.az] : [b.bx, b.bz];
      const out = end === 0 ? -1 : 1;
      return { b, x, z, out };
    }),
  );
  /** In a zone: across the deck's width (and a little more), from just past its end back over where you step on. */
  const inZone = (x: number, z: number, y: number) =>
    zones.some(({ b, x: ex, z: ez, out }) => {
      const along = ((x - ex) * b.ux + (z - ez) * b.uz) * out;
      const across = Math.abs((x - ex) * b.uz - (z - ez) * b.ux);
      return along > -0.45 && along < 0.75 && across < b.width / 2 + 0.25 && y < b.deck + 1.6;
    });
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i];
    if (c.r < 0.7 && inZone(c.x, c.z, 0)) colliders.splice(i, 1);
  }
  group.updateMatrixWorld(true);
  const v = new Vector3();
  const lo = new Vector3();
  const hi = new Vector3();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    if ((m as InstancedMesh).isInstancedMesh) {
      const im = m as InstancedMesh;
      const mm = new Matrix4();
      const zero = new Matrix4().makeScale(0, 0, 0);
      let hit = false;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mm);
        v.setFromMatrixPosition(mm).applyMatrix4(im.matrixWorld);
        if (inZone(v.x, v.z, v.y)) (im.setMatrixAt(i, zero), (hit = true));
      }
      if (hit) im.instanceMatrix.needsUpdate = true;
      return;
    }
    const parts = m.userData.parts as number[] | undefined;
    if (!parts) return;
    const pos = m.geometry.getAttribute('position');
    const keep: boolean[] = [];
    let at = 0;
    for (const n of parts) {
      lo.set(Infinity, Infinity, Infinity);
      hi.set(-Infinity, -Infinity, -Infinity);
      for (let i = at; i < at + n; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        lo.min(v);
        hi.max(v);
      }
      at += n;
      const small = hi.x - lo.x < 1.4 && hi.z - lo.z < 1.4 && hi.y - lo.y < 1.8;
      v.addVectors(lo, hi).multiplyScalar(0.5);
      keep.push(!(small && inZone(v.x, v.z, v.y)));
    }
    if (keep.every(Boolean)) return;
    const geo = new BufferGeometry();
    const kept = parts.filter((_, i) => keep[i]);
    const count = kept.reduce((s, n) => s + n, 0);
    for (const [name, a] of Object.entries(m.geometry.attributes)) {
      const size = a.itemSize;
      const arr = new Float32Array(count * size);
      let o2 = 0;
      let from = 0;
      parts.forEach((n, i) => {
        if (keep[i]) {
          arr.set((a.array as Float32Array).subarray(from * size, (from + n) * size), o2);
          o2 += n * size;
        }
        from += n;
      });
      geo.setAttribute(name, new BufferAttribute(arr, size, a.normalized));
    }
    m.geometry.dispose();
    m.geometry = geo;
    m.userData.parts = kept;
  });
}
