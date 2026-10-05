// People out walking, on the pixel map: the same marshmallow sprite as the
// explorer and the islanders indoors, in their own scarf, coat and woolly
// hat, walking their loops by the clock (src/world/wander.ts, so they're
// where the 3D island and the text adventure say they are). Walk up and they
// stop, turn to you, and a name tag opens; its button (or E) has them say
// their next line. Tap one from further off and you walk over.

import type { Wanderer } from '../../world/schema';
import { turnBetween, walkClock, walker } from '../../world/wander';
import type { RendererContext } from '../types';
import { facingFor, paintExplorer, type ExplorerSprites, type Facing, type Wearable } from './explorer';
import { RECT, TEX } from './terrain';

/** How close you must be for someone to stop and their tag to pop up. */
const RANGE = 1.8;

const CSS = /* css */ `
.map-walker { max-width: 250px; }
.map-walker .map-walker__said { font: 500 14px/1.35 var(--font-read, Georgia, serif); margin-top: 3px; text-wrap: pretty; }
`;

type Thing = { x: number; z: number; sprite: null; after: (c: CanvasRenderingContext2D, sx: number, sy: number) => void };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** Dark ink on a light scarf, white on a dark one, for the button. */
const onColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#2a201b' : '#ffffff';
};

/** What a wanderer wears, as the sprite's wardrobe: a coat over the body and a woolly hat. */
const wearing = (v: Wanderer): Wearable[] => [
  ...(v.coat ? [{ id: 'coat', slot: 'body' as const, color: v.coat }] : []),
  ...(v.hat ? [{ id: 'beanie', slot: 'head' as const, color: v.hat }] : []),
];

export interface MapWanderers {
  /** Their sprites, moved as they walk: drawn with the other things that move, sorted where they stand. */
  things: Thing[];
  /** Whose tag is up. */
  readonly open: string | null;
  /** A click at a world point: on someone, walk over (or chat if they're here). True if it was someone. */
  hit(wx: number, wz: number): boolean;
  /** Someone is right beside (x, z): close enough that they, not a building's door, have your attention. */
  claims(x: number, z: number): boolean;
  /** Say hello, or the next thing (walking over first if they're a way off). */
  talk(id: string): void;
  /** Each frame: everyone walks on, whoever's close stops for you, and arriving by someone you were walking to. */
  update(pos: { x: number; z: number }, dt: number, allowed: boolean): void;
  /** Place the tag, given a world → screen mapping. */
  render(toScreen: (x: number, z: number) => { x: number; y: number }, visible: boolean): void;
  debug(): { id: string; x: number; z: number; moving: boolean; open: boolean; said: number }[];
  destroy(): void;
}

export function createMapWanderers(
  ctx: RendererContext,
  root: HTMLElement,
  o: {
    /** Walk to a spot: the route taken, or null if there's no way there. */
    walk: (x: number, z: number) => unknown;
    /** The route being walked now (to tell if you've gone somewhere else). */
    route: () => unknown;
    /** Stand still, facing this way. */
    halt: (face: Facing) => void;
    /** Whether the pass being drawn is the night one. */
    night: () => boolean;
  },
): MapWanderers {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const motion = !ctx.reducedMotion;

  type W = { v: Wanderer; lap: ReturnType<typeof walker>; art: ExplorerSprites; x: number; z: number; facing: Facing; moving: boolean; held: number; yaw: number; line: number; thing: Thing };
  const people: W[] = ctx.world.wanderers.map((v) => {
    const w = { v, lap: walker(v), art: paintExplorer(wearing(v), v.color), x: 0, z: 0, facing: 'down' as Facing, moving: false, held: 0, yaw: 0, line: 0 } as W;
    w.thing = {
      x: 0,
      z: 0,
      sprite: null,
      after: (c, sx, sy) => {
        const frames = o.night() ? w.art.framesNight[w.facing] : w.art.frames[w.facing];
        const step = w.moving && motion ? Math.floor(performance.now() / 150) % 4 : 0;
        const img = frames[step];
        c.drawImage(img, sx - (w.art.w >> 1), sy - w.art.h + 1);
      },
    };
    return w;
  });

  // ---------- The tag ----------
  const layer = document.createElement('div');
  layer.className = 'map-ui';
  const tag = document.createElement('div');
  tag.className = 'map-tag map-walker';
  tag.hidden = true;
  tag.innerHTML = `<p class="map-tag__kicker"></p><p class="map-tag__name"></p><p class="map-walker__said" aria-live="polite"></p><button type="button" class="map-tag__btn"><span>Say hello</span><kbd aria-hidden="true">E</kbd></button>`;
  const kickerEl = tag.querySelector<HTMLElement>('.map-tag__kicker')!;
  const nameEl = tag.querySelector<HTMLElement>('.map-tag__name')!;
  const saidEl = tag.querySelector<HTMLElement>('.map-walker__said')!;
  const btn = tag.querySelector<HTMLButtonElement>('.map-tag__btn')!;
  if (ctx.touch) btn.querySelector('kbd')!.remove();
  layer.append(tag);
  root.append(layer);
  tag.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => open && talk(open));

  let open: string | null = null;
  let shown: string | null = null;
  let pending: { id: string; route: unknown } | null = null;
  let size = { w: 0, h: 0 };
  const pos = { x: 0, z: 0 };
  const byId = (id: string) => people.find((w) => w.v.id === id);

  const paintTag = (w: W, said: string | null) => {
    tag.style.setProperty('--c', w.v.color);
    tag.style.setProperty('--on', onColor(w.v.color));
    kickerEl.textContent = w.v.doing;
    nameEl.textContent = cap(w.v.name);
    saidEl.textContent = said ? `“${said}”` : w.v.looks;
    btn.querySelector('span')!.textContent = said ? 'Chat' : 'Say hello';
    btn.setAttribute('aria-label', `Talk to ${w.v.name}`);
    size = { w: tag.offsetWidth, h: tag.offsetHeight };
  };

  function talk(id: string) {
    const w = byId(id);
    if (!w || (document.getElementById('w-dialog') as HTMLDialogElement | null)?.open) return;
    if (open !== id) {
      // A way off: walk over (their tag opens as you arrive, and they say hello).
      const d = Math.hypot(pos.x - w.x, pos.z - w.z) || 1;
      const r = o.walk(w.x + ((pos.x - w.x) / d) * 1.1, w.z + ((pos.z - w.z) / d) * 1.1);
      pending = r ? { id, route: o.route() } : null;
      if (r) ctx.sound.play('tap');
      return;
    }
    pending = null;
    o.halt(facingFor(w.x - pos.x, w.z - pos.z, 'up'));
    const line = w.v.lines[w.line % w.v.lines.length];
    w.line++;
    if (shown !== id) shown = id;
    tag.hidden = false;
    paintTag(w, line);
    ctx.sound.play('pop');
    ctx.ui.announce(`${cap(w.v.name)}: ${line}`);
  }

  /** The walk clock (wander.ts): the real time when the map opened, run on by its own frames. */
  let clock = walkClock();
  function step(dt: number) {
    clock += dt;
    const now = clock;
    for (const w of people) {
      const stopped = Math.hypot(pos.x - w.x, pos.z - w.z) < RANGE;
      if (stopped) w.held += dt;
      const s = w.lap.at(now - w.held);
      w.x = s.x;
      w.z = s.z;
      w.moving = s.moving && !stopped;
      const want = stopped ? Math.atan2(pos.x - w.x, pos.z - w.z) : s.heading;
      w.yaw = motion ? w.yaw + turnBetween(w.yaw, want) * Math.min(1, dt * 8) : want;
      w.facing = facingFor(Math.sin(w.yaw), Math.cos(w.yaw), w.facing);
      w.thing.x = w.x;
      w.thing.z = w.z;
    }
  }
  step(0);

  return {
    things: people.map((w) => w.thing),
    get open() {
      return open;
    },
    hit(wx, wz) {
      const px = (wx - RECT.x0) * TEX;
      const pz = (wz - RECT.z0) * TEX;
      for (const w of people) {
        const sx = (w.x - RECT.x0) * TEX;
        const sy = (w.z - RECT.z0) * TEX;
        if (Math.abs(px - sx) <= (w.art.w >> 1) + 2 && pz <= sy + 2 && pz >= sy - w.art.h - 2) {
          talk(w.v.id);
          return true;
        }
      }
      return false;
    },
    talk,
    claims: (x, z) => people.some((w) => Math.hypot(x - w.x, z - w.z) < RANGE * 0.7),
    update(p, dt, allowed) {
      pos.x = p.x;
      pos.z = p.z;
      step(dt);
      let best: string | null = null;
      let bestD = RANGE;
      if (allowed) {
        for (const w of people) {
          const d = Math.hypot(pos.x - w.x, pos.z - w.z);
          if (d < bestD) (best = w.v.id), (bestD = d);
        }
      }
      if (best && best !== open) {
        ctx.sound.play('pop');
        ctx.ui.announce(`${cap(byId(best)!.v.name)} is here. Press E to say hello.`);
      }
      open = best;
      // Walking over to someone: once they've stopped for you, they say hello; a different route calls it off.
      if (pending) {
        if (o.route() !== pending.route && o.route() !== null) pending = null;
        else if (open === pending.id) talk(pending.id);
        else if (o.route() === null) pending = null;
      }
    },
    render(toScreen, visible) {
      const w = visible && open ? byId(open)! : null;
      if (!w) {
        if (shown) {
          tag.hidden = true;
          if (tag.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        }
        shown = null;
        return;
      }
      if (w.v.id !== shown) {
        shown = w.v.id;
        tag.hidden = false;
        paintTag(w, null);
        tag.classList.remove('is-pop');
        void tag.offsetWidth;
        tag.classList.add('is-pop');
      }
      const at = toScreen(w.x, w.z - (w.art.h + 3) / TEX);
      const vw = root.clientWidth;
      const x = Math.round(Math.min(vw - 12 - size.w / 2, Math.max(12 + size.w / 2, at.x)) - size.w / 2);
      const y = Math.round(Math.max(84 + size.h, at.y - 10) - size.h);
      const t = `translate(${x}px, ${y}px)`;
      tag.style.setProperty('--t', t);
      tag.style.transform = t;
    },
    debug: () => people.map((w) => ({ id: w.v.id, x: w.x, z: w.z, moving: w.moving, open: open === w.v.id, said: w.line })),
    destroy() {
      style.remove();
      layer.remove();
    },
  };
}
