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
    expect(s.progress).toEqual({ found: ['attercop'], caught: ['first'], night: false, games: {} });
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
