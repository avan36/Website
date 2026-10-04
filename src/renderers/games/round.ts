// What every mini-game looks like to the overlay that runs it: a round you
// can step, draw into a canvas and poke (a press and a release, from a key or
// a finger). The rules inside each game are plain functions, tested on their
// own; a Round is just those rules with a clock and some paint.

import type { SoundName } from '../types';

export interface GameEnv {
  reducedMotion: boolean;
  touch: boolean;
  sound(name: SoundName): void;
  /** Say something to screen readers. */
  announce(text: string): void;
  random(): number;
  /** The page's display font family, for numbers drawn on the canvas. */
  font: string;
}

export type Point = { x: number; y: number };

export interface Round {
  /** Points so far (the final score once over). */
  readonly score: number;
  /** The round is finished: the overlay shows the score card. */
  readonly over: boolean;
  /** What the HUD over the canvas says: the score, the clock or count, and a streak if there is one. */
  hud(): { score: string; info: string; streak?: string };
  update(dt: number): void;
  /** Draw at w × h CSS pixels (the context is already scaled for the screen). */
  draw(c: CanvasRenderingContext2D, w: number, h: number): void;
  /** A press: a pointer at a point in the canvas (CSS pixels), or a key (its KeyboardEvent.code). */
  press(at: Point | null, code?: string): void;
  release(at: Point | null, code?: string): void;
}

export type StartRound = (env: GameEnv) => Round;

/**
 * A game played with buttons and words instead of paint (the four that came
 * from the project pages): it builds its own elements in the card and keeps
 * them up to date, and tells the card the same things a Round does.
 */
export interface Panel {
  /** Points so far (the final score once over). */
  readonly score: number;
  /** The round is finished: the card shows the score. */
  readonly over: boolean;
  /** The HUD's chips, or null for none (a game with no score). */
  hud(): { score: string; info: string; streak?: string } | null;
  /** Clocks and the like, every frame while it's being played. */
  update?(dt: number): void;
  /** A key the card has no use for (a number, say): true if the game used it. */
  key?(e: KeyboardEvent): boolean;
  /** One line for under the score: how the round went. */
  summary?(): string;
  /** A button on the score card that shows what you missed, with its label. */
  review?: { label: string; show(): void };
  destroy(): void;
}

/** Start a Panel in `host` (empty, inside the card's stage). */
export type StartPanel = (host: HTMLElement, env: GameEnv) => Panel;

/** Add a game's own styles to the page once. */
export function styleOnce(id: string, css: string) {
  if (document.querySelector(`style[data-game="${id}"]`)) return;
  const el = document.createElement('style');
  el.dataset.game = id;
  el.textContent = css;
  document.head.append(el);
}

/** A new element, with a class and text if you like. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ---------- Small helpers shared by the games ----------

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A deterministic random source (mulberry32), for tests and replays. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A word that floats up from a spot and fades: "Perfect!", "+3". */
export type Floater = { text: string; x: number; y: number; t: number; color: string; size: number };

export function drawFloaters(c: CanvasRenderingContext2D, list: Floater[], font: string, still: boolean) {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const f of list) {
    const k = clamp(f.t / 0.9);
    c.globalAlpha = 1 - k * k;
    c.font = `800 ${f.size}px ${font}`;
    const y = f.y - (still ? 0 : easeOut(k) * 26);
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(29, 26, 22, 0.5)';
    c.strokeText(f.text, f.x, y);
    c.fillStyle = f.color;
    c.fillText(f.text, f.x, y);
  }
  c.globalAlpha = 1;
}

export function stepFloaters(list: Floater[], dt: number) {
  for (const f of list) f.t += dt;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].t > 0.9) list.splice(i, 1);
}

/**
 * A backdrop that only changes with the size of the stage, painted once into
 * its own canvas and then copied each frame (gradients and speckles are
 * slow to redraw sixty times a second on a phone).
 */
export function backdrop(paint: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  let cv: HTMLCanvasElement | null = null;
  let key = '';
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    const s = c.getTransform().a || 1;
    const k = `${w}x${h}@${s}`;
    if (k !== key) {
      key = k;
      cv ??= document.createElement('canvas');
      cv.width = Math.round(w * s);
      cv.height = Math.round(h * s);
      const g = cv.getContext('2d')!;
      g.setTransform(s, 0, 0, s, 0, 0);
      paint(g, w, h);
    }
    c.drawImage(cv!, 0, 0, w, h);
  };
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
