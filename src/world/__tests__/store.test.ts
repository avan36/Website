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
    expect(a.events).toEqual([{ type: 'inside', at: 'etymon' }, { type: 'arrived', at: 'etymon' }]);
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

describe('pickCatch', () => {
  it('prefers posts not caught yet', () => {
    const s = reduce(w, emptyState(), { type: 'catch', slug: 'first' }).state;
    for (let i = 0; i < 20; i++) expect(pickCatch(w, s, Math.random)?.slug).toBe('second');
  });
});

describe('sanitize', () => {
  it('drops progress for words and posts that no longer exist', () => {
    const s = sanitize(w, { progress: { found: ['attercop', 'gone', 'attercop', 7], caught: ['first', 'deleted'], night: true }, presence: { at: 'nowhere', pos: { x: 'a' } } });
    expect(s.progress).toEqual({ found: ['attercop'], caught: ['first'], night: false });
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
