// The footbridges out to the islets: a plank deck on posts, a railing either
// side, a lantern at each end, and a wooden arch at the main island's end
// with the islet's name on it. The railings are colliders, so you walk the
// deck and never off its side; swimmers can't get under it either (like the
// pier, its posts are in the way), so they go round the islet instead.

import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace } from 'three';
import type { Glow } from '../landmarks/builders';
import { Kit } from './kit';
import type { Collider } from './nature';
import { BRIDGES, ISLANDS, heightAt } from './shape';

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

export function buildBridges() {
  const group = new Group();
  group.name = 'bridges';
  const colliders: Collider[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  const textures: CanvasTexture[] = [];

  for (const b of BRIDGES) {
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
    const built = k.build({ glowMaterial: new MeshStandardMaterial({ vertexColors: true, emissive: LAMP, emissiveIntensity: 0.6, toneMapped: false }) });
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
    const sign = new Mesh(new PlaneGeometry(1.9, 0.48), new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
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
    /** For swimmers to go round, like the pier: each deck, from end to end. */
    obstacles: BRIDGES.map((b) => ({ ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, r: b.width / 2, top: b.deck })),
    /** The lanterns, for the night. */
    night: () => {},
    glows: () => ({ halos, pools }),
    dispose() {
      textures.forEach((t) => t.dispose());
    },
  };
}
