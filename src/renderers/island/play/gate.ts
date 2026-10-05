// The gates across the bridges, on the 3D island: a pair of glass turnstile
// flaps between two steel posts, a badge reader with a light on it, and a
// frame overhead with a sign. Shut, the flaps meet in the middle and a row of
// colliders keeps you on the near side (the railings keep you on the deck).
// Once the visitor has passed the gate's game (the store remembers), the light
// goes green and the flaps swing open, for good.

import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Gate } from '../../../world/geo';
import { GAME_INFO, isGame } from '../../games/catalog';
import type { Glow } from '../landmarks/builders';
import { damp } from '../util/math';
import { Kit } from '../world/kit';
import type { Collider } from '../world/nature';
import { BRIDGES } from '../world/shape';

const STEEL = '#c9ced3';
const STEEL_DARK = '#5b6168';
const RED = '#e5484d';
const GREEN = '#3fbf6a';

/** How close you must be to a shut gate for its game's prompt to open. */
export const GATE_RANGE = 2.6;

function sign(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const paint = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(4, 4, c.width - 8, c.height - 8, 18);
    g.fill();
    g.fillStyle = '#fbf6ec';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
    g.font = `800 50px ${font}`;
    g.fillText(text, c.width / 2, c.height / 2 + 3, c.width - 40);
    tex.needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint).catch(() => {});
  return tex;
}

type Built = {
  gate: Gate;
  open: boolean;
  /** 0 shut, 1 open: the flaps swing with it. */
  k: number;
  flaps: { g: Group; side: number }[];
  light: MeshBasicMaterial;
  colliders: Collider[];
};

export class Gates {
  readonly group = new Group();
  /** The colliders of the gates still shut (the scene's own list holds them too, until they open). */
  readonly colliders: Collider[] = [];
  private gates: Built[] = [];
  private textures: CanvasTexture[] = [];
  private halos: Glow[] = [];

  constructor(gates: Gate[], isOpen: (id: string) => boolean) {
    this.group.name = 'gates';
    for (const gate of gates) {
      const color = isGame(gate.game) ? GAME_INFO[gate.game].color : '#4f7ea8';
      const b = BRIDGES[gate.bridge];
      const y = b.deck;
      const hw = gate.half;
      const root = new Group();
      root.position.set(gate.x, y, gate.z);
      root.rotation.y = b.yaw;
      const k = new Kit(700 + gate.bridge);
      // Two posts at the rails, a frame overhead, and a badge reader on a pillar by the right-hand post.
      for (const s of [-1, 1]) {
        k.rbox(0.18, 1.1, 0.34, 0.04, STEEL, { p: [s * (hw - 0.14), 0.55, 0] });
        k.box(0.1, 2.5, 0.1, STEEL_DARK, { p: [s * (hw + 0.02), 1.25, -0.25] });
      }
      k.box(hw * 2 + 0.2, 0.12, 0.14, STEEL_DARK, { p: [0, 2.5, -0.25] });
      k.rbox(0.16, 1.0, 0.16, 0.03, STEEL_DARK, { p: [hw - 0.4, 0.5, -0.55] });
      k.box(0.18, 0.22, 0.04, '#2c3036', { p: [hw - 0.4, 1.05, -0.47], r: [-0.4, 0, 0] });
      root.add(k.build());
      // The light on the reader: red while shut, green once you're through.
      const light = new MeshBasicMaterial({ color: RED, toneMapped: false });
      const lamp = new Mesh(new BoxGeometry(0.12, 0.05, 0.03), light);
      lamp.position.set(hw - 0.4, 1.16, -0.45);
      lamp.rotation.x = -0.4;
      root.add(lamp);
      // The sign: PLEASE BADGE IN.
      const tex = sign('PLEASE BADGE IN', color);
      this.textures.push(tex);
      const board = new Mesh(new PlaneGeometry(hw * 2 - 0.2, 0.36), new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }));
      board.position.set(0, 2.2, -0.17);
      const back = board.clone();
      back.rotation.y = Math.PI;
      back.position.z = -0.33;
      root.add(board, back);
      // The flaps: glass on a hinge at each post, meeting in the middle while shut.
      const glass = new MeshStandardMaterial({ color: '#cfe6f2', roughness: 0.15, transparent: true, opacity: 0.7 });
      const trim = new MeshStandardMaterial({ color: color, roughness: 0.5 });
      const flaps = [-1, 1].map((side) => {
        const g = new Group();
        g.position.set(side * (hw - 0.24), 0, 0);
        const w = hw - 0.26;
        const pane = new Mesh(new BoxGeometry(w, 0.7, 0.03), glass);
        pane.position.set(-side * (w / 2), 0.62, 0);
        const edge = new Mesh(new BoxGeometry(w, 0.05, 0.05), trim);
        edge.position.set(-side * (w / 2), 0.98, 0);
        g.add(pane, edge);
        root.add(g);
        return { g, side };
      });
      this.group.add(root);
      // Shut: a row of colliders right across the deck.
      const colliders: Collider[] = [];
      for (let x = -hw + 0.3; x <= hw - 0.3 + 1e-6; x += 0.3) colliders.push({ x: gate.x + b.uz * x, z: gate.z - b.ux * x, r: 0.22 });
      const open = isOpen(gate.id);
      const built: Built = { gate, open, k: open ? 1 : 0, flaps, light, colliders };
      if (!open) this.colliders.push(...colliders);
      this.paint(built);
      this.gates.push(built);
      this.halos.push([gate.x, y + 1.16, gate.z, 0.8]);
    }
  }

  private paint(g: Built) {
    g.light.color.set(g.open ? GREEN : RED);
    for (const f of g.flaps) f.g.rotation.y = f.side * g.k * (Math.PI / 2) * 0.95;
  }

  /** Open any gate the store says is open now. Returns the colliders that no longer stand in the way. */
  sync(isOpen: (id: string) => boolean): Collider[] {
    const freed: Collider[] = [];
    for (const g of this.gates) {
      if (g.open || !isOpen(g.gate.id)) continue;
      g.open = true;
      g.light.color.set(GREEN);
      for (const c of g.colliders) {
        const i = this.colliders.indexOf(c);
        if (i >= 0) this.colliders.splice(i, 1);
        freed.push(c);
      }
    }
    return freed;
  }

  /** The shut gate you're close to, if any (for its game's prompt). */
  near(x: number, z: number) {
    return this.gates.find((g) => !g.open && Math.hypot(x - g.gate.x, z - g.gate.z) < GATE_RANGE)?.gate ?? null;
  }

  update(dt: number, still: boolean) {
    for (const g of this.gates) {
      const want = g.open ? 1 : 0;
      if (g.k === want) continue;
      g.k = still ? want : damp(g.k, want, 4, dt);
      if (Math.abs(g.k - want) < 0.002) g.k = want;
      this.paint(g);
    }
  }

  night() {}
  glows() {
    return { halos: this.halos, pools: [] as Glow[] };
  }

  /** Debugging: each gate, where it stands and whether it's open. */
  list() {
    return this.gates.map((g) => ({ id: g.gate.id, x: g.gate.x, z: g.gate.z, open: g.open, swing: g.k }));
  }

  dispose() {
    this.textures.forEach((t) => t.dispose());
  }
}
