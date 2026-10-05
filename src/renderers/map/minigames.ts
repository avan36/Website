// The mini-games on the pixel map: a sprite at each spot (a cairn of flat
// stones, crab holes with a crab popping in and out, a stack of crates), each
// by a signpost in its game's color, and a name tag with a Play button when
// you walk up. Playing opens the shared games card, the same one the 3D
// island uses (src/renderers/games/overlay.ts).

import { GAME_INFO, isGame, playableIn, scoreText, type GameId } from '../games/catalog';
import { playGame } from '../games/overlay';
import type { RendererContext } from '../types';
import { HEX } from './palette';
import { col, nightData, Pix, shade } from './pixels';
import { crab, type Sprite } from './sprites';
import { RECT, TEX } from './terrain';

/** How close you must be for a game's tag to pop up. */
const RANGE = 1.5;

const INK = col(HEX.ink);

const CSS = /* css */ `
.map-game .map-game__best { font: 700 11.5px/1.3 var(--font-mono); letter-spacing: 0.04em; color: #6f5a4c; margin-top: 2px; }
.map-game { max-width: 230px; }
`;

type Thing = { x: number; z: number; sprite: Sprite | null; after?: (c: CanvasRenderingContext2D, sx: number, sy: number) => void };

function sprite(p: Pix, under: Pix | null, ax: number, ay: number): Sprite {
  p.outline(INK);
  if (under) {
    under.stamp(p, 0, 0);
    p.data.set(under.data);
  }
  return { w: p.w, h: p.h, ax, ay, day: p.canvas(), night: p.canvas(nightData(p.data)), data: p.data };
}

/** A signpost with a board in the game's color, at (x, y) for its foot. */
function sign(p: Pix, x: number, y: number, color: string) {
  p.vline(x, y - 9, y, col('#8a5a36'));
  p.vline(x + 1, y - 9, y, col('#6b4228'));
  p.rect(x - 4, y - 14, 10, 6, col(color));
  p.rect(x - 3, y - 13, 8, 4, col(shade(color, 0.25)));
}

function paint(id: GameId): Sprite {
  const color = GAME_INFO[id].color;
  if (id === 'stones') {
    const p = new Pix(26, 18);
    sign(p, 4, 17, color);
    // Three skips on the board.
    p.px(3, 6, col(color));
    p.px(5, 5, col(color));
    p.px(7, 6, col(color));
    // A cairn of flat stones.
    const greys = ['#8f877e', '#a59c92', '#bdb5a8', '#d0c9bd'];
    greys.forEach((g, i) => p.ellipse(17 + (i % 2), 15.5 - i * 2.2, 5 - i * 0.8, 1.6, col(g)));
    p.ellipse(23, 16.5, 1.8, 1, col('#a59c92'));
    return sprite(p, null, 13, 17);
  }
  if (id === 'crabs') {
    const p = new Pix(30, 18);
    sign(p, 3, 17, color);
    p.px(2, 6, col('#ff6b5b'));
    p.px(4, 6, col('#ff6b5b'));
    p.px(6, 6, col('#ff6b5b'));
    // Holes in the sand, painted under the outline so they lie flat.
    const holes = new Pix(30, 18);
    for (let i = 0; i < 6; i++) {
      holes.ellipse(12 + (i % 3) * 7, 10 + Math.floor(i / 3) * 6, 2.8, 1.4, col('#d9b47c'));
      holes.ellipse(12 + (i % 3) * 7, 9.6 + Math.floor(i / 3) * 6, 2.2, 1, col('#5c4126'));
    }
    return sprite(p, holes, 15, 17);
  }
  if (id === 'jargon') {
    // The badge desk: a curved desk in pale stone with a band of the game's color, a screen, and the greeter behind it, headset on.
    const p = new Pix(30, 24);
    sign(p, 3, 23, color);
    p.rect(13, 3, 7, 7, col('#f2d3a2'));
    p.hline(13, 19, 3, col('#2c3036'));
    p.px(12, 6, col('#2c3036'));
    p.px(20, 6, col('#2c3036'));
    p.rect(12, 10, 9, 6, col('#6b7684'));
    p.rect(9, 14, 18, 8, col('#f1eee8'));
    p.hline(9, 26, 14, col('#ffffff'));
    p.hline(9, 26, 19, col(color));
    p.rect(22, 11, 4, 3, col('#2c3036'));
    p.px(23, 12, col('#9cd2e8'));
    return sprite(p, null, 15, 23);
  }
  const p = new Pix(24, 26);
  sign(p, 3, 25, color);
  const crate = (x: number, y: number, c: string) => {
    p.rect(x, y, 8, 7, col(c));
    p.hline(x, x + 7, y, col(shade(c, 0.18)));
    p.hline(x + 1, x + 6, y + 3, col(shade(c, -0.12)));
  };
  crate(9, 18, '#20a464');
  crate(16, 18, '#2b8fb8');
  crate(12, 11, '#f2c14e');
  crate(13, 4, '#e5484d');
  p.rect(2, 13, 2, 1, col(color));
  p.rect(2, 15, 2, 1, col(color));
  p.rect(4, 14, 2, 1, col(color));
  return sprite(p, null, 12, 25);
}

export interface MapGames {
  things: Thing[];
  /** Circles you can't walk through (the crate stack, the signposts). */
  blocks: { x: number; z: number; r: number }[];
  /** The game whose tag is up. */
  readonly open: GameId | null;
  /** A click at a world point: on a game's sprite, walk over and play. True if it was one. */
  hit(wx: number, wz: number): boolean;
  /** Walk to a game and play it (straight away if you're there). */
  play(id: GameId): void;
  /** Each frame: who's in reach, and arriving at a game you were walking to. */
  update(pos: { x: number; z: number }, allowed: boolean): void;
  /** Place the tag, given a world → screen mapping. */
  render(toScreen: (x: number, z: number) => { x: number; y: number }, visible: boolean): void;
  debug(): { id: GameId; x: number; z: number; stand: { x: number; z: number }; open: boolean }[];
  destroy(): void;
}

export function createMapGames(
  ctx: RendererContext,
  root: HTMLElement,
  o: {
    /** Walk to a spot: the route taken, or null if there's no way there. */
    walk: (x: number, z: number) => unknown;
    /** The route being walked now (to tell if you've gone somewhere else). */
    route: () => unknown;
    /** Stand still and face the game. */
    halt: () => void;
    /** The game that opens a shut gate you're standing at, if any (its tag pops up there too). */
    gate?: (x: number, z: number) => GameId | null;
  },
): MapGames {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const crabArt = [crab(0), crab(1)];
  const motion = !ctx.reducedMotion;

  // The games the map can play: the ones out on the islets are for the 3D island, so far.
  const spots = ctx.world.activities.flatMap((a) => {
    if (a.kind !== 'minigame' || !a.game || !isGame(a.game) || !playableIn(a.game, 'map')) return [];
    const id = a.game as GameId;
    const art = paint(id);
    return [{ id, x: a.at.x, z: a.at.z, art, stand: { x: a.at.x, z: a.at.z + 0.9 } }];
  });

  const things: Thing[] = spots.map((s) => ({
    x: s.x,
    z: s.z,
    sprite: s.art,
    after:
      s.id === 'crabs'
        ? (c, sx, sy) => {
            // A crab pops out of one hole, then another.
            const t = performance.now() / 1000;
            const k = motion ? (t * 0.5) % 1 : 0.3;
            if (k > 0.6) return;
            const hole = motion ? Math.floor(t * 0.5) % 6 : 1;
            const hx = sx - s.art.ax + 12 + (hole % 3) * 7;
            const hy = sy - s.art.ay + 9 + Math.floor(hole / 3) * 6;
            const a = crabArt[motion ? Math.floor(t * 5) % 2 : 0];
            c.drawImage(ctx.store.state.progress.night ? a.night : a.day, hx - a.ax, hy - a.ay + (k < 0.08 ? 2 : 0));
          }
        : undefined,
  }));
  const blocks = spots.flatMap((s) => {
    const signX = s.x + ((s.id === 'stones' ? 4 : 3) - s.art.ax) / TEX;
    const list = [{ x: signX, z: s.z - 0.05, r: 0.15 }];
    if (s.id === 'crates') list.push({ x: s.x + 0.15, z: s.z - 0.2, r: 0.75 });
    return list;
  });

  // ---------- The tag ----------
  const layer = document.createElement('div');
  layer.className = 'map-ui';
  const tag = document.createElement('div');
  tag.className = 'map-tag map-game';
  tag.hidden = true;
  tag.innerHTML = `<p class="map-tag__kicker">Island game</p><p class="map-tag__name"></p><p class="map-game__best"></p><button type="button" class="map-tag__btn"><span>Play</span><kbd aria-hidden="true">E</kbd></button>`;
  const nameEl = tag.querySelector<HTMLElement>('.map-tag__name')!;
  const bestEl = tag.querySelector<HTMLElement>('.map-game__best')!;
  const btn = tag.querySelector<HTMLButtonElement>('.map-tag__btn')!;
  if (ctx.touch) btn.querySelector('kbd')!.remove();
  layer.append(tag);
  root.append(layer);
  tag.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => open && play(open));

  let open: GameId | null = null;
  let shown: GameId | null = null;
  let pending: { id: GameId; route: unknown } | null = null;
  let size = { w: 0, h: 0 };
  let playing = false;

  const paintTag = (id: GameId) => {
    const info = GAME_INFO[id];
    const best = ctx.store.best(id);
    tag.style.setProperty('--c', info.color);
    tag.style.setProperty('--on', '#ffffff');
    nameEl.textContent = info.name;
    bestEl.textContent = best > 0 ? `Best: ${scoreText(id, best)}` : info.tagline;
    btn.querySelector('span')!.textContent = best > 0 ? 'Play again' : 'Play';
    btn.setAttribute('aria-label', `Play ${info.name}`);
  };

  function play(id: GameId) {
    if (playing || (document.getElementById('w-dialog') as HTMLDialogElement | null)?.open) return;
    const s = spots.find((x) => x.id === id)!;
    if (Math.hypot(pos.x - s.stand.x, pos.z - s.stand.z) > RANGE && o.gate?.(pos.x, pos.z) !== id) {
      const r = o.walk(s.stand.x, s.stand.z);
      pending = r ? { id, route: o.route() } : null;
      if (r) ctx.sound.play('tap');
      return;
    }
    pending = null;
    o.halt();
    playing = true;
    playGame(id, {
      store: ctx.store,
      sound: ctx.sound,
      reducedMotion: ctx.reducedMotion,
      touch: ctx.touch,
      announce: ctx.ui.announce,
      onClose: () => {
        playing = false;
        shown = null; // repaint the tag with the new best
      },
    });
  }

  const pos = { x: 0, z: 0 };
  return {
    things,
    blocks,
    get open() {
      return open;
    },
    hit(wx, wz) {
      const px = (wx - RECT.x0) * TEX;
      const pz = (wz - RECT.z0) * TEX;
      for (const s of spots) {
        const lx = Math.floor(px - ((s.x - RECT.x0) * TEX - s.art.ax));
        const ly = Math.floor(pz - ((s.z - RECT.z0) * TEX - s.art.ay));
        if (lx < -2 || ly < -2 || lx >= s.art.w + 2 || ly >= s.art.h + 2) continue;
        play(s.id);
        return true;
      }
      return false;
    },
    play,
    update(p, allowed) {
      pos.x = p.x;
      pos.z = p.z;
      // Walking over to play: once you're there, play; a different route calls it off.
      if (pending) {
        const route = o.route();
        const s = spots.find((x) => x.id === pending!.id)!;
        if (route === null) {
          pending = null;
          if (Math.hypot(pos.x - s.stand.x, pos.z - s.stand.z) < RANGE) play(s.id);
        } else if (route !== pending.route) pending = null;
      }
      let best: GameId | null = null;
      let bestD = RANGE;
      if (allowed) {
        for (const s of spots) {
          const d = Math.min(Math.hypot(pos.x - s.x, pos.z - s.z), Math.hypot(pos.x - s.stand.x, pos.z - s.stand.z));
          if (d < bestD) (best = s.id), (bestD = d);
        }
        best ??= o.gate?.(pos.x, pos.z) ?? null;
      }
      if (best && best !== open) {
        ctx.sound.play('pop');
        ctx.ui.announce(`${GAME_INFO[best].name}. Press E to play.`);
      }
      open = best;
    },
    render(toScreen, visible) {
      const id = visible ? open : null;
      if (!id) {
        if (shown) {
          tag.hidden = true;
          if (tag.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        }
        shown = null;
        return;
      }
      if (id !== shown) {
        shown = id;
        paintTag(id);
        tag.hidden = false;
        size = { w: tag.offsetWidth, h: tag.offsetHeight };
        tag.classList.remove('is-pop');
        void tag.offsetWidth;
        tag.classList.add('is-pop');
      }
      const s = spots.find((x) => x.id === id)!;
      // At a gate, the tag sits over you rather than over the desk.
      const gated = Math.hypot(pos.x - s.x, pos.z - s.z) > RANGE * 2 && o.gate?.(pos.x, pos.z) === id;
      const at = gated ? toScreen(pos.x, pos.z - 2) : toScreen(s.x, s.z - (s.art.ay + 2) / TEX);
      const vw = root.clientWidth;
      const x = Math.round(Math.min(vw - 12 - size.w / 2, Math.max(12 + size.w / 2, at.x)) - size.w / 2);
      const y = Math.round(Math.max(84 + size.h, at.y - 10) - size.h);
      const t = `translate(${x}px, ${y}px)`;
      tag.style.setProperty('--t', t);
      tag.style.transform = t;
    },
    debug: () => spots.map((s) => ({ id: s.id, x: s.x, z: s.z, stand: s.stand, open: open === s.id })),
    destroy() {
      style.remove();
      layer.remove();
    },
  };
}
