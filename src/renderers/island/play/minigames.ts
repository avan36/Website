// The mini-games on the island: a little prop at each spot (a pile of flat
// stones on the beach, holes in the sand with a crab peeking out, a stack of
// crates by the depot), each with a signpost in its game's color, and a
// prompt like the fishing spot's that opens as you walk up. The games
// themselves run in the shared games card (src/renderers/games/overlay.ts);
// this only puts them on the island and says when you're close enough.

import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type PerspectiveCamera, type Raycaster } from 'three';
import { GAME_INFO, scoreText, type GameId } from '../../games/catalog';
import type { Rect } from '../labels';
import { Kit } from '../world/kit';
import type { Collider } from '../world/nature';
import { ACTIVITIES, groundAt, isWalkable } from '../world/shape';
import { Prompt, type PromptText } from './prompt';

export { playGame } from '../../games/overlay';

/** How close you must be for a game's prompt to open. */
export const GAME_RANGE = 2.5;

const hitMaterial = new MeshBasicMaterial({ visible: false });

interface Spot {
  id: GameId;
  x: number;
  z: number;
  /** Where you stand to play: just south of the prop, facing it. */
  stand: { x: number; z: number };
  anchor: Vector3;
  prompt: Prompt;
  hit: Mesh;
  text: PromptText | null;
}

export class MiniGames {
  readonly group = new Group();
  readonly colliders: Collider[] = [];
  readonly spots: Spot[] = [];
  /** The game whose prompt is up. */
  open: GameId | null = null;
  private crab: Group | null = null;
  private crabAt = { x: 0, z: 0, y: 0 };

  constructor(
    host: HTMLElement,
    private o: { reducedMotion: boolean; best: (id: GameId) => number; onPress: (id: GameId) => void },
  ) {
    this.group.name = 'minigames';
    for (const a of ACTIVITIES) {
      if (a.kind !== 'minigame' || !a.game) continue;
      const id = a.game as GameId;
      const info = GAME_INFO[id];
      const y = groundAt(a.x, a.z);
      const prop = this.build(id, info.color);
      prop.position.set(a.x, y, a.z);
      this.group.add(prop);
      // Stand a step south of it (toward the camera), or wherever's dry nearby.
      const stand = [1.5, 1.2, 0.9].map((d) => ({ x: a.x, z: a.z + d })).find((p) => isWalkable(p.x, p.z)) ?? { x: a.x, z: a.z + 1 };
      const hit = new Mesh(new CylinderGeometry(1.4, 1.4, 2.2, 10), hitMaterial);
      hit.position.set(a.x, y + 1.1, a.z);
      hit.userData.game = id;
      hit.updateMatrixWorld(true);
      const prompt = new Prompt(host, { name: info.name, color: info.color, key: 'E', onPress: () => o.onPress(id) });
      this.spots.push({ id, x: a.x, z: a.z, stand, anchor: new Vector3(a.x, y + 2.3, a.z), prompt, hit, text: null });
      this.colliders.push({ x: a.x - 0.95, z: a.z - 0.15, r: 0.22 });
      if (id === 'crates') this.colliders.push({ x: a.x + 0.35, z: a.z - 0.2, r: 0.75 });
    }
    this.refresh();
  }

  /** A signpost in the game's color, and the game's own little scene beside it. */
  private build(id: GameId, color: string) {
    const root = new Group();
    const k = new Kit(id.length * 7 + 3);
    // The signpost, to the west of the prop.
    k.cyl(0.06, 0.07, 1.25, '#8a5a36', { p: [-0.95, 0.62, -0.15] }, 6);
    k.rbox(0.92, 0.5, 0.08, 0.05, color, { p: [-0.95, 1.2, -0.1], r: [0, 0.18, 0] });
    k.rbox(0.7, 0.3, 0.03, 0.03, '#fff8e8', { p: [-0.95, 1.2, -0.05], r: [0, 0.18, 0] });
    if (id === 'stones') {
      // A little cairn of flat stones, and a couple more lying about.
      const greys = ['#a59c92', '#bdb5a8', '#8f877e', '#c9c1b5'];
      for (let i = 0; i < 4; i++) k.cyl(0.24 - i * 0.03, 0.26 - i * 0.03, 0.08, greys[i], { p: [0.25 + (i % 2) * 0.04, 0.05 + i * 0.085, -0.1], r: [0, i * 0.7, 0.05] }, 9);
      k.cyl(0.16, 0.17, 0.06, greys[1], { p: [0.8, 0.03, 0.3], r: [0, 0.4, 0.08] }, 8);
      k.cyl(0.13, 0.14, 0.05, greys[2], { p: [-0.2, 0.03, 0.45], r: [0, 1.1, 0] }, 8);
      // A glyph on the sign: three skips.
      for (let i = 0; i < 3; i++) k.cyl(0.05 - i * 0.01, 0.05 - i * 0.01, 0.02, '#2b8fb8', { p: [-1.18 + i * 0.22, 1.2, -0.02], r: [Math.PI / 2, 0, 0] }, 8);
    } else if (id === 'crabs') {
      // Holes in the sand, three by two.
      for (let i = 0; i < 6; i++) k.cyl(0.22, 0.24, 0.03, '#5c4126', { p: [-0.2 + (i % 3) * 0.6, 0.015, -0.35 + Math.floor(i / 3) * 0.6] }, 10);
      for (let i = 0; i < 3; i++) k.cyl(0.05, 0.05, 0.02, '#ff6b5b', { p: [-1.12 + i * 0.17, 1.2, -0.02], r: [Math.PI / 2, 0, 0] }, 8);
      // One crab, popping in and out of a hole.
      const c = new Kit(9);
      c.sphere(0.2, '#ff6b5b', { s: [1, 0.6, 0.8] }, 10, 6);
      for (const s of [-1, 1]) {
        c.sphere(0.08, '#ff6b5b', { p: [s * 0.24, 0.06, 0.12] }, 6, 4);
        c.cyl(0.015, 0.015, 0.12, '#e5484d', { p: [s * 0.07, 0.12, 0.08] }, 4);
        c.sphere(0.035, '#ffffff', { p: [s * 0.07, 0.19, 0.08] }, 6, 4);
      }
      this.crab = c.build();
      this.crab.position.set(0.4, 0, 0.25);
      this.crabAt = { x: 0.4, z: 0.25, y: 0 };
      root.add(this.crab);
    } else {
      // A stack of crates, a little untidy, in the depot's bin colors.
      k.rbox(0.62, 0.42, 0.62, 0.04, '#20a464', { p: [0.05, 0.21, -0.2], r: [0, 0.1, 0] });
      k.rbox(0.62, 0.42, 0.62, 0.04, '#2b8fb8', { p: [0.72, 0.21, -0.15], r: [0, -0.15, 0] });
      k.rbox(0.62, 0.42, 0.62, 0.04, '#f2c14e', { p: [0.4, 0.63, -0.18], r: [0, 0.25, 0] });
      k.rbox(0.62, 0.42, 0.62, 0.04, '#e5484d', { p: [0.42, 1.05, -0.2], r: [0, -0.05, 0] });
      for (let i = 0; i < 3; i++) k.box(0.13, 0.08, 0.02, '#20a464', { p: [-0.95, 1.12 + i * 0.07, -0.02] });
    }
    root.add(k.build());
    return root;
  }

  /** Point the prompts at your current bests. */
  refresh() {
    for (const s of this.spots) {
      const info = GAME_INFO[s.id];
      const best = this.o.best(s.id);
      s.text = { kicker: 'Island game', blurb: best > 0 ? `${info.tagline} Your best: ${scoreText(s.id, best)}.` : info.tagline, action: best > 0 ? 'Play again' : 'Play' };
      s.prompt.set(s.text);
    }
  }

  /** Where you stand to play a game. */
  stand(id: GameId) {
    return this.spots.find((s) => s.id === id)!.stand;
  }

  /**
   * Who's in reach, if anything else (a place's card, the portal, the water)
   * isn't more important. Returns true when a prompt has just opened.
   */
  near(x: number, z: number, allowed: boolean) {
    let best: GameId | null = null;
    let bestD = GAME_RANGE;
    if (allowed) {
      for (const s of this.spots) {
        const d = Math.min(Math.hypot(x - s.x, z - s.z), Math.hypot(x - s.stand.x, z - s.stand.z));
        if (d < bestD) (best = s.id), (bestD = d);
      }
    }
    const opened = best !== null && best !== this.open;
    this.open = best;
    return opened;
  }

  /** The game whose spot a pointer ray hits, if any. */
  pick(raycaster: Raycaster): GameId | null {
    let hit: { id: GameId; d: number } | null = null;
    for (const s of this.spots) {
      const h = raycaster.intersectObject(s.hit, false)[0];
      if (h && (!hit || h.distance < hit.d)) hit = { id: s.id, d: h.distance };
    }
    return hit?.id ?? null;
  }

  update(time: number) {
    if (!this.crab) return;
    // The crab pops up, looks about, and ducks back down.
    const k = (time * 0.45) % 1;
    const up = this.o.reducedMotion ? 1 : k < 0.12 ? k / 0.12 : k < 0.62 ? 1 : k < 0.72 ? 1 - (k - 0.62) / 0.1 : 0;
    this.crab.position.y = this.crabAt.y - 0.2 + up * 0.22;
    this.crab.visible = up > 0.02;
    if (!this.o.reducedMotion) this.crab.rotation.y = Math.sin(time * 2.2) * 0.4;
  }

  /** Float the open prompt over its spot. Returns the screen areas the prompts take, for the labels to avoid. */
  place(camera: PerspectiveCamera, w: number, h: number, avoid: Rect[], visible: boolean): Rect[] {
    const rects: Rect[] = [];
    for (const s of this.spots) {
      s.prompt.show(visible && this.open === s.id);
      const r = s.prompt.place(camera, s.anchor, w, h, avoid);
      if (r) rects.push(r, { l: r.l, t: r.b, r: r.r, b: r.b + 90 });
    }
    return rects;
  }

  /** Debugging: every spot, and whether its prompt is up. */
  list() {
    return this.spots.map((s) => ({ id: s.id, x: s.x, z: s.z, stand: s.stand, open: this.open === s.id }));
  }

  dispose() {
    for (const s of this.spots) {
      s.prompt.dispose();
      s.hit.geometry.dispose();
    }
  }
}
