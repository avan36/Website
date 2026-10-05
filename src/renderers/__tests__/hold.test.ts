import { describe, expect, it } from 'vitest';
import { holdable, Holds, padInput, type PadKey } from '../hold';

describe('Holds', () => {
  it('lets go of a button only when the last finger on it lifts', () => {
    const h = new Holds<PadKey>();
    h.press(1, 'gas');
    h.press(2, 'gas');
    expect(h.release(1)).toBe(null);
    expect(h.has('gas')).toBe(true);
    expect(h.release(2)).toBe('gas');
    expect(h.has('gas')).toBe(false);
  });

  it('ignores a lift it never saw go down, and a second lift for the same finger', () => {
    const h = new Holds<PadKey>();
    expect(h.release(9)).toBe(null);
    h.press(1, 'left');
    expect(h.release(1)).toBe('left');
    // pointerup, then lostpointercapture for the same finger.
    expect(h.release(1)).toBe(null);
    expect(h.size).toBe(0);
  });

  it('moves a finger whose lift went missing to the new button', () => {
    const h = new Holds<PadKey>();
    h.press(1, 'left');
    expect(h.press(1, 'right')).toBe('left');
    expect(h.has('left')).toBe(false);
    expect(h.has('right')).toBe(true);
    // Still held by another finger: nothing to let go of.
    h.press(2, 'right');
    expect(h.press(1, 'right')).toBe(null);
  });

  it('clears everything at once', () => {
    const h = new Holds<PadKey>();
    h.press(1, 'gas');
    h.press(2, 'left');
    h.clear();
    expect(h.size).toBe(0);
    expect(padInput(h)).toEqual({ throttle: 0, steer: 0 });
  });
});

describe('padInput', () => {
  const held = (...keys: PadKey[]) => {
    const h = new Holds<PadKey>();
    keys.forEach((k, i) => h.press(i, k));
    return h;
  };

  it('reads gas and brake as throttle, left and right as steering', () => {
    expect(padInput(held())).toEqual({ throttle: 0, steer: 0 });
    expect(padInput(held('gas'))).toEqual({ throttle: 1, steer: 0 });
    expect(padInput(held('brake', 'left'))).toEqual({ throttle: -1, steer: -1 });
    expect(padInput(held('gas', 'right'))).toEqual({ throttle: 1, steer: 1 });
  });

  it('cancels out opposite buttons held together', () => {
    expect(padInput(held('gas', 'brake', 'left', 'right'))).toEqual({ throttle: 0, steer: 0 });
  });
});

describe('holdable', () => {
  const fire = (el: EventTarget, type: string) => {
    const e = new Event(type, { cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const target = () => new EventTarget() as unknown as HTMLElement;

  it('stops menus and selection, and leaves touches alone unless asked', () => {
    const el = target();
    holdable(el);
    expect(fire(el, 'contextmenu')).toBe(true);
    expect(fire(el, 'selectstart')).toBe(true);
    expect(fire(el, 'touchstart')).toBe(false);
  });

  it('cancels touches when asked, or when the test says so', () => {
    const always = target();
    holdable(always, { touch: true });
    expect(fire(always, 'touchstart')).toBe(true);

    let playing = false;
    const some = target();
    holdable(some, { touch: () => playing });
    expect(fire(some, 'touchstart')).toBe(false);
    playing = true;
    expect(fire(some, 'touchstart')).toBe(true);
  });

  it('comes off again', () => {
    const el = target();
    const off = holdable(el, { touch: true });
    off();
    expect(fire(el, 'contextmenu')).toBe(false);
    expect(fire(el, 'touchstart')).toBe(false);
  });
});
