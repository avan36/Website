// The contract between the page and a renderer. A renderer is anything that
// can draw the world and let someone move around it: the 3D island, the 2D
// map, the text adventure. The page (shell.ts) owns everything they share:
// the HUD, the color wipe into a place, the lost-word cards, sound, and the
// store that remembers where you are and what you've found.

import type { Geo } from '../world/geo';
import type { World } from '../world/schema';
import type { WorldStore } from '../world/store';

export type ViewId = 'island' | 'map' | 'text' | 'list';

export type SoundName = 'step' | 'tap' | 'pop' | 'land' | 'chime' | 'bell' | 'whoosh' | 'jump';

export interface RendererContext {
  world: World;
  geo: Geo;
  store: WorldStore;
  /** An empty, full-viewport element that belongs to this renderer. The HUD sits above it. */
  host: HTMLElement;
  reducedMotion: boolean;
  touch: boolean;
  /** Short sounds (silent unless the visitor turned sound on). */
  sound: { play(name: SoundName): void; readonly on: boolean };
  /** The place the visitor just came back out of, if they used this page to go in. */
  returnTo: string | null;
  /**
   * Go into a place: plays the color wipe from (x, y) in viewport pixels,
   * then opens its page, or `href` instead (a page on this site that belongs
   * to that place, like one post at the pier).
   */
  go(placeId: string, from?: { x: number; y: number }, href?: string): void;
  ui: {
    /** Say something to screen readers. */
    announce(text: string): void;
    /** A small, self-dismissing note at the bottom of the screen. */
    toast(t: { title: string; body?: string; color?: string; action?: { label: string; run(): void } }): void;
    /** Open the card for a lost word (the story, where it came from, how many are left). */
    showWord(id: string): void;
    /** Open the card for a post caught off the pier. */
    showCatch(slug: string, fresh: boolean): void;
    /** Open the word hoard: every lost word, found or not. */
    openHoard(): void;
    /** Open the wardrobe: every outfit piece, unlocked or not, and what's being worn. */
    openWardrobe(): void;
  };
  /**
   * Call once the first frame is on screen: the loader goes away. If the
   * visitor is coming back out of a place, the page then shrinks the colored
   * cover away from `reveal` (viewport pixels, default the middle). Pass
   * 'self' if you play that reveal yourself.
   */
  ready(reveal?: { x: number; y: number } | 'self'): void;
  /** Call if the renderer can't carry on (lost GPU, missing API): the page falls back to the list. */
  fail(reason: unknown): void;
  /** Call the first time the visitor moves: hides the controls hint, tucks the intro card away on phones. */
  firstMove(): void;
}

export interface RendererHandle {
  /** Stop animating (tab hidden, another view on top). */
  pause(): void;
  resume(): void;
  /** Free everything and remove what you added to `host`. */
  destroy(): void;
}

export type Renderer = { mount(ctx: RendererContext): Promise<RendererHandle> };
