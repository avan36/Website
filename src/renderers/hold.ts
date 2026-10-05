// Controls you hold down with a finger: the boat's pad, the thumbstick on the
// water, a mini-game's stage. On a phone a long press is also the browser's
// cue to select text, show the magnifier or open the callout menu, which
// steals the press mid-game. The CSS side (user-select, touch-callout,
// touch-action) lives with each control; this is the script side, plus the
// bookkeeping for which finger holds which button, kept pure so it's tested.

/**
 * Stop a long press on `el` from selecting text or opening a menu.
 * `touch` also cancels the touch itself as it starts (iOS ignores the CSS
 * alone for a press held still): pointer events still arrive, but no click
 * follows, so pass it only where presses are read from pointer events.
 * Returns a function that takes it all off again.
 */
export function holdable(el: HTMLElement, { touch = false as boolean | ((e: TouchEvent) => boolean) } = {}): () => void {
  const stop = (e: Event) => e.preventDefault();
  const onTouch = (e: TouchEvent) => {
    if (e.cancelable && (touch === true || (typeof touch === 'function' && touch(e)))) e.preventDefault();
  };
  el.addEventListener('contextmenu', stop);
  el.addEventListener('selectstart', stop);
  if (touch) el.addEventListener('touchstart', onTouch, { passive: false });
  return () => {
    el.removeEventListener('contextmenu', stop);
    el.removeEventListener('selectstart', stop);
    if (touch) el.removeEventListener('touchstart', onTouch);
  };
}

/** Which button each finger (pointer) is holding, any number at once. */
export class Holds<K extends string = string> {
  private by = new Map<number, K>();

  /** A finger goes down on a button. Returns the button it was holding before, if a lift went missing. */
  press(pointerId: number, key: K): K | null {
    const was = this.by.get(pointerId) ?? null;
    this.by.set(pointerId, key);
    return was !== null && was !== key && !this.has(was) ? was : null;
  }

  /** A finger lifts (or the press is cancelled, or loses its capture). Returns the button let go, if none still hold it. */
  release(pointerId: number): K | null {
    const k = this.by.get(pointerId);
    if (k === undefined) return null;
    this.by.delete(pointerId);
    return this.has(k) ? null : k;
  }

  /** Let go of everything (the boat's left, the window lost focus). */
  clear() {
    this.by.clear();
  }

  has(key: K) {
    for (const k of this.by.values()) if (k === key) return true;
    return false;
  }

  get size() {
    return this.by.size;
  }
}

export type PadKey = 'gas' | 'brake' | 'left' | 'right';

/** What the boat's pad asks for, from the buttons held: gas and brake cancel out, and so do left and right. */
export function padInput(holds: { has(key: PadKey): boolean }) {
  return {
    throttle: (holds.has('gas') ? 1 : 0) - (holds.has('brake') ? 1 : 0),
    steer: (holds.has('right') ? 1 : 0) - (holds.has('left') ? 1 : 0),
  };
}
