// The props for the games out on the islets, in the same kit as the island's
// other games (minigames.ts puts a signpost beside each one): a beach bar and
// a pushy billboard on Boardwalk Isle, a giant dictionary on a lectern and a
// young tree with nine branches on Root Isle. Each is built in its spot's own
// frame (+z toward the camera, the signpost to the west) and says where it's
// solid.

import { CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, SRGBColorSpace } from 'three';
import type { GameId } from '../../games/catalog';
import { letterGeometries, type Glow } from '../landmarks/builders';
import { Kit, litMaterial } from '../world/kit';

const WOOD = '#b98352';
const WOOD_LIGHT = '#d6a86f';
const WOOD_DARK = '#7d5134';
const CREAM = '#fff3df';
const STONE = '#bcb5a9';
const STONE_DARK = '#a1998e';
const LAMP = '#ffd27a';
/** Lamps and bulbs: always bright, and haloed after dark. */
const glowMaterial = () => new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

export type IsletProp = {
  root: Group;
  /** Solid bits, in the spot's frame. */
  solid: { x: number; z: number; r: number }[];
  /** What lights up at night, in the spot's frame (as a landmark's glows). */
  glows?: { halos: Glow[]; pools: Glow[] };
  update?(time: number, still: boolean): void;
  dispose?(): void;
};

/** A picture painted on a canvas, as a texture (the billboard's banner, the bar's menu). */
function painted(w: number, h: number, paint: (g: CanvasRenderingContext2D, font: string) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    paint(g, getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif');
    tex.needsUpdate = true;
  };
  draw();
  // The display font may still be on its way: paint again once it's here.
  document.fonts?.ready.then(draw).catch(() => {});
  return tex;
}

const face = (tex: CanvasTexture, w: number, h: number) => {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.receiveShadow = true;
  return m;
};

/** Ask the bartender: a little beach bar, a counter under a striped awning, mugs, stools and a chalkboard menu. */
function bar(color: string): IsletProp {
  const root = new Group();
  const k = new Kit(611);
  for (const x of [-0.25, 1.75]) for (const z of [-0.75, 0.2]) k.box(0.12, 2.05, 0.12, WOOD_DARK, { p: [x, 1.02, z] });
  // The back: boards, a shelf, bottles.
  k.box(2.0, 1.25, 0.08, WOOD, { p: [0.75, 0.62, -0.76] });
  k.box(1.9, 0.05, 0.22, WOOD_LIGHT, { p: [0.75, 1.32, -0.66] });
  ['#e0a12e', '#4f8a3c', '#8c3a14', '#f5b942', '#2a1a12'].forEach((c, i) => k.cyl(0.05, 0.06, 0.26, c, { p: [0.02 + i * 0.36, 1.48, -0.66] }, 7));
  // The counter, its top, and slats down the front.
  k.rbox(2.1, 0.95, 0.5, 0.04, WOOD, { p: [0.75, 0.475, 0.08] });
  k.rbox(2.3, 0.08, 0.68, 0.03, WOOD_LIGHT, { p: [0.75, 0.98, 0.08] });
  for (let i = 0; i < 6; i++) k.box(0.05, 0.8, 0.02, WOOD_DARK, { p: [-0.1 + i * 0.34, 0.45, 0.34] });
  // Mugs on the counter, with foam.
  for (const [x, c] of [[0.2, '#f2c94c'], [0.55, '#2a1a12'], [1.3, '#e0a12e']] as const) {
    k.cyl(0.075, 0.07, 0.17, c, { p: [x, 1.1, 0.14] }, 8);
    k.cyl(0.08, 0.075, 0.05, '#fffaf0', { p: [x, 1.2, 0.14] }, 8);
  }
  // The awning: stripes in the bar's orange and cream, sloping down to the front, with a scalloped edge.
  for (let i = 0; i < 7; i++) k.box(0.36, 0.05, 1.55, i % 2 ? CREAM : color, { p: [-0.4 + i * 0.36, 2.12, -0.27], r: [0.22, 0, 0], jitter: 0.02 });
  for (let i = 0; i < 7; i++) k.cyl(0.17, 0.17, 0.04, i % 2 ? CREAM : color, { p: [-0.4 + i * 0.36, 1.9, 0.48], r: [Math.PI / 2, 0, 0] }, 10);
  // A string of bulbs along the awning's edge, and a lantern on the counter.
  const halos: Glow[] = [];
  for (let i = 0; i < 7; i++) {
    const x = -0.4 + i * 0.36;
    k.addGlow(new SphereGeometry(0.055, 6, 4), i % 2 ? '#ffe2a0' : LAMP, { p: [x, 1.7, 0.5] });
    halos.push([x, 1.7, 0.5, 0.55]);
  }
  k.cyl(0.07, 0.08, 0.04, WOOD_DARK, { p: [1.9, 1.04, 0.12] }, 8);
  k.addGlow(new SphereGeometry(0.08, 8, 6), LAMP, { p: [1.9, 1.14, 0.12] });
  halos.push([1.9, 1.14, 0.12, 1.1]);
  // Two stools out front.
  for (const x of [0.25, 1.25]) {
    k.cyl(0.04, 0.05, 0.62, WOOD_DARK, { p: [x, 0.31, 0.72] }, 6);
    k.cyl(0.19, 0.19, 0.08, color, { p: [x, 0.66, 0.72] }, 10);
  }
  // A chalkboard menu on an A-frame.
  k.box(0.05, 0.9, 0.05, WOOD_DARK, { p: [2.25, 0.42, 0.28], r: [0.2, 0, 0] });
  k.box(0.05, 0.9, 0.05, WOOD_DARK, { p: [2.25, 0.42, 0.62], r: [-0.2, 0, 0] });
  root.add(k.build({ glowMaterial: glowMaterial() }));
  const menu = painted(256, 320, (g, font) => {
    g.fillStyle = '#2f3a33';
    g.fillRect(0, 0, 256, 320);
    g.strokeStyle = '#8a5a36';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 306);
    g.fillStyle = '#f4f1e6';
    g.textAlign = 'center';
    g.font = `800 40px ${font}`;
    g.fillText('Ask me', 128, 74);
    g.font = `600 26px ${font}`;
    ['Three vibes,', 'one drink.', '', 'IPA · Stout', 'Gose · Cider'].forEach((l, i) => g.fillText(l, 128, 126 + i * 36));
  });
  const board = face(menu, 0.5, 0.62);
  board.position.set(2.25, 0.62, 0.62);
  board.rotation.set(-0.2, 0, 0);
  root.add(board);
  return { root, solid: [{ x: 0.75, z: -0.3, r: 1.05 }, { x: 2.25, z: 0.45, r: 0.3 }], glows: { halos, pools: [[0.75, 0.03, 0.75, 1.7]] }, dispose: () => menu.dispose() };
}

/** Spot the dark pattern: a billboard of a cookie banner (Accept all, big and green; Manage options, small and grey), over a little kiosk. */
function billboard(color: string): IsletProp {
  const root = new Group();
  const k = new Kit(612);
  for (const x of [-0.05, 1.85]) k.box(0.14, 2.6, 0.14, WOOD_DARK, { p: [x, 1.3, -0.3] });
  k.rbox(2.3, 1.45, 0.1, 0.04, WOOD_DARK, { p: [0.9, 1.92, -0.32] });
  // The kiosk below: a counter in the game's red, with a striped front.
  k.rbox(1.3, 0.85, 0.55, 0.05, color, { p: [0.9, 0.43, 0.2] });
  k.rbox(1.42, 0.07, 0.66, 0.03, CREAM, { p: [0.9, 0.88, 0.2] });
  for (let i = 0; i < 4; i++) k.box(0.12, 0.7, 0.02, CREAM, { p: [0.45 + i * 0.3, 0.42, 0.48] });
  // Two lamps on arms over the board, to read it by after dark.
  for (const x of [0.35, 1.45]) {
    k.box(0.05, 0.05, 0.42, WOOD_DARK, { p: [x, 2.72, -0.12] });
    k.cyl(0.1, 0.06, 0.12, '#3d3a36', { p: [x, 2.68, 0.08] }, 8);
    k.addGlow(new SphereGeometry(0.06, 8, 6), LAMP, { p: [x, 2.62, 0.08] });
  }
  // A stack of leaflets on the counter.
  k.box(0.32, 0.06, 0.24, '#fdfcf8', { p: [0.6, 0.95, 0.2], r: [0, 0.2, 0] });
  k.box(0.32, 0.06, 0.24, '#fde5d6', { p: [1.15, 0.95, 0.22], r: [0, -0.15, 0] });
  root.add(k.build({ glowMaterial: glowMaterial() }));
  const banner = painted(512, 320, (g, font) => {
    g.fillStyle = '#fdfcf8';
    g.fillRect(0, 0, 512, 320);
    // A cookie.
    g.fillStyle = '#c8894a';
    g.beginPath();
    g.arc(70, 72, 40, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b3417';
    for (const [x, y] of [[56, 60], [82, 66], [66, 88], [88, 90], [50, 82]]) g.fillRect(x, y, 9, 9);
    g.fillStyle = '#22261f';
    g.textAlign = 'left';
    g.font = `800 34px ${font}`;
    g.fillText('We value your', 128, 62);
    g.fillText('privacy', 128, 100);
    g.font = `500 21px ${font}`;
    g.fillStyle = '#5b5a52';
    g.fillText('By continuing to browse you agree', 30, 156);
    g.fillText('to this. And to our 312 partners.', 30, 184);
    // Accept all: big, bright, impossible to miss.
    g.fillStyle = '#2f6b45';
    g.beginPath();
    g.roundRect(236, 214, 248, 72, 14);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `800 32px ${font}`;
    g.textAlign = 'center';
    g.fillText('Accept all', 360, 261);
    // Manage options: tiny and grey.
    g.fillStyle = '#c9c3b6';
    g.font = `500 15px ${font}`;
    g.fillText('manage options', 120, 258);
    // Only 3 left!
    g.save();
    g.translate(430, 54);
    g.rotate(0.18);
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(-62, -24, 124, 48, 24);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `800 19px ${font}`;
    g.fillText('3 left!', 0, 7);
    g.restore();
  });
  const sign = face(banner, 2.12, 1.3);
  sign.position.set(0.9, 1.92, -0.26);
  root.add(sign);
  return {
    root,
    solid: [{ x: -0.05, z: -0.3, r: 0.15 }, { x: 1.85, z: -0.3, r: 0.15 }, { x: 0.9, z: 0.2, r: 0.62 }],
    glows: { halos: [[0.35, 2.62, 0.08, 0.9], [1.45, 2.62, 0.08, 0.9]], pools: [[0.9, 0.03, 0.7, 1.5]] },
    dispose: () => banner.dispose(),
  };
}

/** Etymology race: a giant dictionary open on a stone lectern, letters lifting off its pages, a stack of books and a chequered flag. */
function lectern(color: string): IsletProp {
  const root = new Group();
  const k = new Kit(613);
  k.rbox(0.7, 0.66, 0.56, 0.06, STONE, { p: [0.55, 0.33, -0.15] });
  k.box(0.44, 0.38, 0.36, STONE_DARK, { p: [0.55, 0.84, -0.15] });
  // The book, open, tilted toward you.
  const PW = 0.7;
  const PD = 0.9;
  const book = new Kit(614);
  for (const s of [-1, 1]) {
    book.box(PW + 0.06, 0.06, PD + 0.08, color, { p: [s * (PW / 2 + 0.02), 0, 0], r: [0, 0, s * 0.12] });
    book.box(PW - 0.04, 0.1, PD - 0.04, '#fff3df', { p: [s * (PW / 2 + 0.01), 0.07, 0], r: [0, 0, s * 0.12], jitter: 0.01 });
    for (let l = 0; l < 5; l++) book.box(PW * (l === 4 ? 0.4 : 0.66), 0.012, 0.035, '#6f6457', { p: [s * (PW / 2 + 0.02), 0.125, -PD / 2 + 0.2 + l * 0.13], r: [0, 0, s * 0.12], jitter: 0 });
  }
  book.box(0.08, 0.08, PD + 0.1, '#2d5bb8', { p: [0, -0.02, 0] });
  book.box(0.05, 0.01, 0.3, '#e5484d', { p: [0.08, 0.13, PD / 2 + 0.08], r: [0.9, 0, 0], jitter: 0 });
  const open = book.build();
  open.position.set(0.55, 1.08, -0.15);
  open.rotation.set(0.42, 0, 0);
  root.add(open);
  // A stack of old books at the foot of the lectern.
  ['#8c3a14', '#4f8a3c', '#3a6fd8'].forEach((c, i) => k.rbox(0.5 - i * 0.04, 0.12, 0.36, 0.02, c, { p: [1.25, 0.06 + i * 0.12, 0.15], r: [0, i * 0.35 - 0.2, 0] }));
  // A reading lantern on a post beside it.
  k.cyl(0.05, 0.06, 1.5, WOOD_DARK, { p: [-0.2, 0.75, -0.55] }, 6);
  k.box(0.3, 0.04, 0.04, WOOD_DARK, { p: [-0.08, 1.48, -0.55] });
  k.addGlow(new SphereGeometry(0.1, 8, 6), LAMP, { p: [0.04, 1.34, -0.55] });
  // A chequered flag: it's a race.
  k.cyl(0.035, 0.04, 1.9, WOOD_DARK, { p: [1.7, 0.95, -0.4] }, 6);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.box(0.14, 0.14, 0.02, (i + j) % 2 ? '#1d1a16' : '#fffaf0', { p: [1.79 + i * 0.14, 1.78 - j * 0.14, -0.4], jitter: 0 });
  root.add(k.build({ glowMaterial: glowMaterial() }));

  // Letters lifting off the pages and drifting up, one at a time, like the library's.
  const glyphs = letterGeometries();
  const per = 2;
  const meshes = glyphs.map((g) => {
    const m = new InstancedMesh(g, litMaterial(), per);
    m.castShadow = false;
    m.frustumCulled = false;
    root.add(m);
    return m;
  });
  const o = new Object3D();
  const hide = new Matrix4().makeScale(0, 0, 0);
  return {
    root,
    solid: [{ x: 0.55, z: -0.15, r: 0.45 }, { x: 1.7, z: -0.4, r: 0.1 }, { x: 1.25, z: 0.15, r: 0.3 }, { x: -0.2, z: -0.55, r: 0.1 }],
    glows: { halos: [[0.04, 1.34, -0.55, 1.2]], pools: [[0.3, 0.03, -0.1, 1.4]] },
    update(time, still) {
      meshes.forEach((m, gi) => {
        for (let i = 0; i < per; i++) {
          // Each letter has its own slot in a cycle: up off the book, wobbling, shrinking away.
          const t = (time * 0.32 + gi * 0.25 + i * 0.5) % 1;
          if (still || t > 0.9) {
            m.setMatrixAt(i, hide);
            continue;
          }
          const x = 0.55 + Math.sin(gi * 2.1 + i * 1.7) * 0.25 + Math.sin(time * 1.3 + gi) * 0.08 * t;
          o.position.set(x, 1.25 + t * 1.5, -0.2 - t * 0.2);
          o.rotation.set(0, Math.sin(time * 0.8 + gi + i) * 0.6, Math.sin(time + gi) * 0.2);
          o.scale.setScalar(0.55 * Math.sin(Math.min(1, t / 0.9) * Math.PI));
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      });
    },
    dispose: () => meshes.forEach((m) => m.geometry.dispose()),
  };
}

/** Sort the tree of life: a young tree with nine branches, a little tag on each, and a basket of living things at its foot. */
function sapling(color: string): IsletProp {
  const root = new Group();
  const k = new Kit(615);
  const bark = '#8a5a3b';
  const tx = 0.65;
  const tz = -0.25;
  k.cyl(0.1, 0.17, 1.5, bark, { p: [tx, 0.75, tz] }, 7);
  // Nine branches in three tiers, each ending in a little tag in its own color (the nine tips of the tree).
  const tags = ['#57c15a', '#c98a52', '#f2c14e', '#7f6bd6', '#2b8fb8', '#3fae8c', '#e58f4f', '#6b8e3a', '#5aa9e6'];
  const greens = ['#57c15a', '#6cc35b', '#4aa449'];
  let n = 0;
  for (const [y, count, reach] of [[0.95, 3, 0.62], [1.35, 3, 0.52], [1.72, 3, 0.4]] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + y * 2.1;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      k.cyl(0.025, 0.04, reach, bark, { p: [tx + dx * reach * 0.45, y + 0.12, tz + dz * reach * 0.45], r: [dz * 0.95, 0, -dx * 0.95] }, 5);
      const ex = tx + dx * reach * 0.9;
      const ez = tz + dz * reach * 0.9;
      k.ico(0.2, greens[n % 3], { p: [ex, y + 0.33, ez], s: [1, 0.8, 1] }, 1);
      k.box(0.04, 0.14, 0.01, '#d8cbb2', { p: [ex, y + 0.1, ez + 0.03], jitter: 0 });
      k.rbox(0.13, 0.17, 0.03, 0.02, tags[n], { p: [ex, y - 0.04, ez + 0.04], jitter: 0 });
      n++;
    }
  }
  k.ico(0.3, greens[0], { p: [tx, 2.05, tz], s: [1, 0.85, 1] }, 1);
  // The basket, with a few living things peeking out.
  k.cyl(0.32, 0.25, 0.3, '#c99a5b', { p: [1.55, 0.15, 0.35] }, 10);
  k.torus(0.31, 0.04, '#a8783f', { p: [1.55, 0.3, 0.35], r: [Math.PI / 2, 0, 0] }, 4, 14);
  for (const [x, z, c, r] of [[1.47, 0.3, '#ff6b5b', 0.1], [1.63, 0.4, '#f2c14e', 0.09], [1.55, 0.26, '#57c15a', 0.08]] as const) k.sphere(r, c, { p: [x, 0.36, z] }, 8, 6);
  // A little sign leaning on the basket in the game's color.
  k.rbox(0.36, 0.24, 0.04, 0.03, color, { p: [1.95, 0.32, 0.45], r: [-0.3, -0.3, 0] });
  // A paper lantern hanging from the trunk, for the evening.
  k.box(0.02, 0.3, 0.02, '#6f6457', { p: [tx + 0.2, 1.05, tz + 0.18] });
  k.addGlow(new SphereGeometry(0.11, 8, 6), LAMP, { p: [tx + 0.2, 0.84, tz + 0.18], s: [1, 1.25, 1] });
  root.add(k.build({ glowMaterial: glowMaterial() }));
  return { root, solid: [{ x: tx, z: tz, r: 0.3 }, { x: 1.55, z: 0.35, r: 0.34 }], glows: { halos: [[tx + 0.2, 0.84, tz + 0.18, 1.0]], pools: [[tx + 0.2, 0.03, tz + 0.4, 1.3]] } };
}

const PROPS: Partial<Record<GameId, (color: string) => IsletProp>> = { bartender: bar, patterns: billboard, etymology: lectern, evolution: sapling };

/** The prop for an islet game (null for the main island's own three). */
export function isletProp(id: GameId, color: string): IsletProp | null {
  return PROPS[id]?.(color) ?? null;
}
