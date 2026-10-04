import { describe, expect, it } from 'vitest';
import { createStore, emptyState, pickCatch, reduce, sanitize } from '../store';
import { world } from './fixtures';

const w = world();
const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), m };
};

describe('reduce', () => {
  it('finds a word once, counting toward the total', () => {
    const a = reduce(w, emptyState(), { type: 'find', id: 'attercop' });
    expect(a.state.progress.found).toEqual(['attercop']);
    expect(a.events).toEqual([{ type: 'found', id: 'attercop', count: 1, total: w.lostWords.length }]);
    const b = reduce(w, a.state, { type: 'find', id: 'attercop' });
    expect(b.state).toBe(a.state);
    expect(b.events).toEqual([]);
  });

  it('ignores words that do not exist', () => {
    expect(reduce(w, emptyState(), { type: 'find', id: 'xyzzy' }).events).toEqual([]);
  });

  it('completes the hoard on the last word, and night falls', () => {
    let s = emptyState();
    let events: ReturnType<typeof reduce>['events'] = [];
    for (const lw of w.lostWords) ({ state: s, events } = reduce(w, s, { type: 'find', id: lw.id }));
    expect(events.map((e) => e.type)).toEqual(['found', 'hoard-complete', 'night']);
    expect(s.progress.night).toBe(true);
  });

  it("won't switch night on before the hoard is full", () => {
    expect(reduce(w, emptyState(), { type: 'night', on: true }).state.progress.night).toBe(false);
  });

  it('announces arrivals only when the place changes', () => {
    const a = reduce(w, emptyState(), { type: 'move', pos: { x: 1, z: 1 }, at: 'plaza' });
    expect(a.events).toEqual([{ type: 'arrived', at: 'plaza' }]);
    expect(reduce(w, a.state, { type: 'move', pos: { x: 2, z: 2 } }).events).toEqual([]);
  });

  it('records each catch once but reports every cast', () => {
    const a = reduce(w, emptyState(), { type: 'catch', slug: 'first' });
    const b = reduce(w, a.state, { type: 'catch', slug: 'first' });
    expect(b.state.progress.caught).toEqual(['first']);
    expect(b.events).toEqual([{ type: 'caught', slug: 'first', fresh: false }]);
  });
});

describe('pickCatch', () => {
  it('prefers posts not caught yet', () => {
    const s = reduce(w, emptyState(), { type: 'catch', slug: 'first' }).state;
    for (let i = 0; i < 20; i++) expect(pickCatch(w, s, Math.random)?.slug).toBe('second');
  });
});

describe('sanitize', () => {
  it('drops progress for words and posts that no longer exist', () => {
    const s = sanitize(w, { progress: { found: ['attercop', 'gone', 'attercop', 7], caught: ['first', 'deleted'], night: true }, presence: { at: 'nowhere', pos: { x: 'a' } } });
    expect(s.progress).toEqual({ found: ['attercop'], caught: ['first'], night: false, wardrobe: [], worn: {} });
    expect(s.presence).toEqual({ at: null, pos: null });
  });

  it('survives garbage', () => {
    expect(sanitize(w, 'nope')).toEqual(emptyState());
  });
});

describe('createStore', () => {
  it('persists progress and tells subscribers what happened', () => {
    const local = memory();
    const session = memory();
    const store = createStore(w, { local, session });
    const seen: string[] = [];
    store.subscribe((_, events) => seen.push(...events.map((e) => e.type)));
    store.dispatch({ type: 'find', id: 'wordhord' });
    expect(seen).toEqual(['found']);
    expect(JSON.parse(local.m.get('world:progress:v1')!).found).toEqual(['wordhord']);
    // A fresh store (a new page) picks up where the last one left off.
    expect(createStore(w, { local, session }).has('wordhord')).toBe(true);
  });

  it('keeps quiet about plain movement', () => {
    const store = createStore(w, { local: memory(), session: memory() });
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch({ type: 'move', pos: { x: 1, z: 2 } });
    expect(calls).toBe(0);
    expect(store.state.presence.pos).toEqual({ x: 1, z: 2 });
  });
});

describe('wardrobe', () => {
  const at = (s: ReturnType<typeof emptyState>, place: string) => reduce(w, s, { type: 'move', pos: null, at: place });

  it('unlocks the piece kept at a place on arrival, once', () => {
    const a = at(emptyState(), 'busy-beer');
    expect(a.state.progress.wardrobe).toEqual(['hard-hat']);
    expect(a.events).toEqual([
      { type: 'arrived', at: 'busy-beer' },
      { type: 'unlocked', id: 'hard-hat', count: 1, total: w.outfits.length },
    ]);
    const b = at(at(a.state, 'plaza').state, 'busy-beer');
    expect(b.state.progress.wardrobe).toEqual(['hard-hat']);
    expect(b.events.map((e) => e.type)).toEqual(['arrived']);
  });

  it('unlocks nothing at the plaza', () => {
    expect(at(emptyState(), 'plaza').state.progress.wardrobe).toEqual([]);
  });

  it('completes the wardrobe on the last piece', () => {
    let s = emptyState();
    let events: ReturnType<typeof reduce>['events'] = [];
    for (const o of w.outfits) ({ state: s, events } = at(s, o.place));
    expect(events.map((e) => e.type)).toEqual(['arrived', 'unlocked', 'wardrobe-complete']);
    expect(s.progress.wardrobe).toHaveLength(w.outfits.length);
  });

  it('wears only unlocked pieces, one per slot', () => {
    let s = emptyState();
    expect(reduce(w, s, { type: 'wear', id: 'hard-hat' }).events).toEqual([]);
    s = at(at(s, 'busy-beer').state, 'quizmate').state;
    let r = reduce(w, s, { type: 'wear', id: 'hard-hat' });
    expect(r.events).toEqual([{ type: 'dressed', slot: 'head', id: 'hard-hat' }]);
    r = reduce(w, r.state, { type: 'wear', id: 'mortarboard' });
    expect(r.state.progress.worn).toEqual({ head: 'mortarboard' });
    // Wearing it again changes nothing.
    expect(reduce(w, r.state, { type: 'wear', id: 'mortarboard' }).state).toBe(r.state);
    r = reduce(w, r.state, { type: 'unwear', slot: 'head' });
    expect(r.events).toEqual([{ type: 'dressed', slot: 'head', id: null }]);
    expect(r.state.progress.worn).toEqual({});
    expect(reduce(w, r.state, { type: 'unwear', slot: 'head' }).state).toBe(r.state);
  });

  it('keeps the wardrobe when the word hoard is reset', () => {
    let s = at(emptyState(), 'middle-place').state;
    s = reduce(w, s, { type: 'wear', id: 'cardinal-scarf' }).state;
    s = reduce(w, s, { type: 'find', id: 'attercop' }).state;
    s = reduce(w, s, { type: 'reset' }).state;
    expect(s.progress.found).toEqual([]);
    expect(s.progress.wardrobe).toEqual(['cardinal-scarf']);
    expect(s.progress.worn).toEqual({ neck: 'cardinal-scarf' });
  });

  it('sanitizes: unknown pieces go, and only unlocked pieces in the right slot stay on', () => {
    const s = sanitize(w, {
      progress: { wardrobe: ['hard-hat', 'top-hat', 'hard-hat', 'sunglasses'], worn: { head: 'hard-hat', face: 'hard-hat', neck: 'cardinal-scarf', body: 3 } },
    });
    expect(s.progress.wardrobe).toEqual(['hard-hat', 'sunglasses']);
    expect(s.progress.worn).toEqual({ head: 'hard-hat' });
  });

  it('persists what you unlock and wear', () => {
    const local = memory();
    const session = memory();
    const store = createStore(w, { local, session });
    const seen: string[] = [];
    store.subscribe((_, events) => seen.push(...events.map((e) => e.type)));
    store.dispatch({ type: 'move', pos: { x: 0, z: 0 }, at: 'etymon' });
    store.dispatch({ type: 'wear', id: 'reading-glasses' });
    expect(seen).toEqual(['arrived', 'unlocked', 'dressed']);
    const again = createStore(w, { local, session });
    expect(again.state.progress.wardrobe).toEqual(['reading-glasses']);
    expect(again.worn()).toEqual({ face: 'reading-glasses' });
  });
});
