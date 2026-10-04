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

  it('goes into buildings with a room, and nowhere else', () => {
    const a = reduce(w, emptyState(), { type: 'inside', at: 'etymon' });
    expect(a.state.presence).toMatchObject({ inside: 'etymon', at: 'etymon' });
    // Going in is arriving: the piece of the wardrobe kept there is yours too.
    expect(a.events.slice(0, 2)).toEqual([{ type: 'inside', at: 'etymon' }, { type: 'arrived', at: 'etymon' }]);
    const gift = w.outfits.find((o) => o.place === 'etymon');
    if (gift) expect(a.state.progress.wardrobe).toEqual([gift.id]);
    for (const at of ['blog', 'contact', 'map-of-evolution', 'nowhere']) expect(reduce(w, emptyState(), { type: 'inside', at }).events, at).toEqual([]);
    const out = reduce(w, a.state, { type: 'inside', at: null });
    expect(out.state.presence).toMatchObject({ inside: null, at: 'etymon' });
    expect(out.events).toEqual([{ type: 'inside', at: null }]);
  });

  it('takes you back outside when you walk somewhere else', () => {
    const a = reduce(w, emptyState(), { type: 'inside', at: 'quizmate' });
    expect(reduce(w, a.state, { type: 'move', pos: null }).state.presence.inside).toBe('quizmate');
    const b = reduce(w, a.state, { type: 'move', pos: null, at: 'plaza' });
    expect(b.state.presence.inside).toBeNull();
    expect(b.events).toContainEqual({ type: 'inside', at: null });
  });

  it('records each catch once but reports every cast', () => {
    const a = reduce(w, emptyState(), { type: 'catch', slug: 'first' });
    const b = reduce(w, a.state, { type: 'catch', slug: 'first' });
    expect(b.state.progress.caught).toEqual(['first']);
    expect(b.events).toEqual([{ type: 'caught', slug: 'first', fresh: false }]);
  });
});

describe('laps round the island', () => {
  it('keeps the fastest lap and says whether each one beat it', () => {
    const a = reduce(w, emptyState(), { type: 'lap', time: 41.5 });
    expect(a.state.progress.bestLap).toBe(41.5);
    expect(a.events).toEqual([{ type: 'lap', time: 41.5, best: true, previous: null }]);
    const b = reduce(w, a.state, { type: 'lap', time: 44 });
    expect(b.state).toBe(a.state);
    expect(b.events).toEqual([{ type: 'lap', time: 44, best: false, previous: 41.5 }]);
    const c = reduce(w, a.state, { type: 'lap', time: 39.25 });
    expect(c.state.progress.bestLap).toBe(39.25);
    expect(c.events).toEqual([{ type: 'lap', time: 39.25, best: true, previous: 41.5 }]);
  });

  it('ignores times that cannot be real', () => {
    for (const time of [NaN, -3, 0, 0.5, Infinity, 99999]) expect(reduce(w, emptyState(), { type: 'lap', time }).events).toEqual([]);
  });

  it('keeps the record when the word hoard is reset', () => {
    let s = reduce(w, emptyState(), { type: 'lap', time: 40 }).state;
    s = reduce(w, s, { type: 'find', id: 'attercop' }).state;
    const r = reduce(w, s, { type: 'reset' }).state;
    expect(r.progress.found).toEqual([]);
    expect(r.progress.bestLap).toBe(40);
  });

  it('reads a saved record back, and drops a broken one', () => {
    expect(sanitize(w, { progress: { bestLap: 38.2 } }).progress.bestLap).toBe(38.2);
    expect(sanitize(w, { progress: { bestLap: 'fast' } }).progress.bestLap).toBe(null);
    expect(sanitize(w, { progress: { bestLap: -1 } }).progress.bestLap).toBe(null);
  });

  it('saves a new record, and tells whoever finished a lap how it went', () => {
    const local = memory();
    const store = createStore(w, { local, session: memory() });
    const seen: unknown[] = [];
    store.subscribe((_, events) => seen.push(...events));
    expect(store.dispatch({ type: 'lap', time: 50 })).toEqual([{ type: 'lap', time: 50, best: true, previous: null }]);
    expect(store.dispatch({ type: 'lap', time: 55 })).toEqual([{ type: 'lap', time: 55, best: false, previous: 50 }]);
    // Only a new record changes anything worth announcing.
    expect(seen).toEqual([{ type: 'lap', time: 50, best: true, previous: null }]);
    expect(JSON.parse(local.m.get('world:progress:v1')!).bestLap).toBe(50);
    expect(createStore(w, { local, session: memory() }).state.progress.bestLap).toBe(50);
  });
});

describe('mini-game scores', () => {
  it('keeps the best score and counts every round', () => {
    const a = reduce(w, emptyState(), { type: 'score', game: 'stones', score: 12 });
    expect(a.events).toEqual([{ type: 'scored', game: 'stones', score: 12, best: 12, previous: 0, record: true }]);
    const b = reduce(w, a.state, { type: 'score', game: 'stones', score: 7 });
    expect(b.events).toEqual([{ type: 'scored', game: 'stones', score: 7, best: 12, previous: 12, record: false }]);
    expect(b.state.progress.games.stones).toEqual({ best: 12, plays: 2 });
    const c = reduce(w, b.state, { type: 'score', game: 'stones', score: 30.9 });
    expect(c.state.progress.games.stones).toEqual({ best: 30, plays: 3 });
    expect(c.events[0]).toMatchObject({ record: true, previous: 12 });
  });

  it('never calls a zero, or a tie, a new best', () => {
    const a = reduce(w, emptyState(), { type: 'score', game: 'crabs', score: 0 });
    expect(a.events[0]).toMatchObject({ record: false, best: 0 });
    const b = reduce(w, reduce(w, a.state, { type: 'score', game: 'crabs', score: 9 }).state, { type: 'score', game: 'crabs', score: 9 });
    expect(b.events[0]).toMatchObject({ record: false, best: 9 });
  });

  it('ignores games the world does not have, and nonsense scores', () => {
    expect(reduce(w, emptyState(), { type: 'score', game: 'darts', score: 5 }).events).toEqual([]);
    expect(reduce(w, emptyState(), { type: 'score', game: 'crates', score: NaN }).events).toEqual([]);
    expect(reduce(w, emptyState(), { type: 'score', game: 'crates', score: -4 }).state.progress.games.crates).toEqual({ best: 0, plays: 1 });
  });

  it('keeps best scores when the words are forgotten', () => {
    let s = reduce(w, emptyState(), { type: 'find', id: 'attercop' }).state;
    s = reduce(w, s, { type: 'score', game: 'crates', score: 14 }).state;
    s = reduce(w, s, { type: 'reset' }).state;
    expect(s.progress.found).toEqual([]);
    expect(s.progress.games).toEqual({ crates: { best: 14, plays: 1 } });
  });

  it('sanitizes saved scores: known games only, whole and in range', () => {
    const s = sanitize(w, {
      progress: { found: [], games: { stones: { best: 21.7, plays: 3 }, crabs: { best: -5, plays: 'x' }, crates: { best: 1e12 }, darts: { best: 99, plays: 1 }, junk: 4 } },
    });
    expect(s.progress.games).toEqual({ stones: { best: 21, plays: 3 }, crabs: { best: 0, plays: 0 }, crates: { best: 999_999, plays: 1 } });
    expect(sanitize(w, { progress: { games: 'lots' } }).progress.games).toEqual({});
  });

  it('shares scores through the saved progress, next to the word hoard', () => {
    const local = memory();
    const session = memory();
    const store = createStore(w, { local, session });
    store.dispatch({ type: 'find', id: 'wordhord' });
    store.dispatch({ type: 'score', game: 'stones', score: 18 });
    const again = createStore(w, { local, session });
    expect(again.best('stones')).toBe(18);
    expect(again.best('crabs')).toBe(0);
    expect(again.has('wordhord')).toBe(true);
  });

  it('reads saves from before there were games', () => {
    const local = memory();
    local.set('world:progress:v1', JSON.stringify({ found: ['emmet'], caught: ['first'], night: false }));
    const store = createStore(w, { local, session: memory() });
    expect(store.has('emmet')).toBe(true);
    expect(store.state.progress.games).toEqual({});
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
    expect(s.progress).toEqual({ found: ['attercop'], caught: ['first'], night: false, bestLap: null, games: {}, wardrobe: [], worn: {} });
    expect(s.presence).toEqual({ at: null, pos: null, inside: null });
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
