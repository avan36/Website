import { describe, expect, it } from 'vitest';
import { BITE_WINDOW, CAST_TIME, Fishing, REEL_TIME, type FishEvent } from '../fishing';

/** Step a game forward in small ticks, collecting what happened. */
function run(f: Fishing, seconds: number, events: FishEvent[] = []) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    const e = f.update(1 / 60);
    if (e) events.push(e);
  }
  return events;
}

/** Run until the bobber dunks. */
function untilBite(f: Fishing) {
  const events: FishEvent[] = [];
  for (let i = 0; i < 60 * 10 && f.phase !== 'bite'; i++) {
    const e = f.update(1 / 60);
    if (e) events.push(e);
  }
  return events;
}

const fixed = (v: number) => () => v;

describe('fishing', () => {
  it('casts, plops, nibbles and then bites', () => {
    const f = new Fishing(fixed(0.5));
    expect(f.cast()).toBe(true);
    expect(f.cast()).toBe(false); // the line is already out
    const events = untilBite(f);
    expect(events[0]).toBe('plop');
    expect(events.filter((e) => e === 'nibble').length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)).toBe('bite');
  });

  it('lands the catch if you pull inside the window', () => {
    const f = new Fishing(fixed(0.2));
    f.cast();
    untilBite(f);
    run(f, BITE_WINDOW * 0.8);
    expect(f.pull()).toBe('hooked');
    expect(run(f, REEL_TIME + 0.05)).toEqual(['landed']);
    expect(f.phase).toBe('idle');
  });

  it('lets it get away if you wait too long', () => {
    const f = new Fishing(fixed(0.9));
    f.cast();
    untilBite(f);
    const events = run(f, BITE_WINDOW + REEL_TIME + 0.1);
    expect(events).toEqual(['escaped', 'empty']);
    expect(f.pull()).toBeNull();
  });

  it('comes back empty if you pull before the bite', () => {
    const f = new Fishing(fixed(0.5));
    f.cast();
    run(f, CAST_TIME + 0.1);
    expect(f.pull()).toBe('early');
    expect(run(f, REEL_TIME + 0.05)).toEqual(['empty']);
  });

  it('jiggles the bobber only during a nibble', () => {
    const f = new Fishing(fixed(0.5));
    f.cast();
    expect(f.nibble()).toBe(-1);
    let saw = false;
    for (let i = 0; i < 600 && f.phase !== 'bite'; i++) {
      if (f.update(1 / 60) !== 'nibble') continue;
      saw = true;
      expect(f.nibble()).toBeGreaterThanOrEqual(0);
      run(f, 0.4);
      if (f.phase === 'wait') expect(f.nibble()).toBe(-1);
    }
    expect(saw).toBe(true);
  });

  it('can be put away at any point', () => {
    const f = new Fishing(fixed(0.5));
    f.cast();
    run(f, 1);
    f.cancel();
    expect(f.phase).toBe('idle');
    expect(f.update(1)).toBeNull();
    expect(f.cast()).toBe(true);
  });
});
