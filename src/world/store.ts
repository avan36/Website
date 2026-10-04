// What a visitor has done, shared by every renderer: where they are, which
// lost words they've found, what they've caught off the pier, what they've
// unlocked for the wardrobe and are wearing. Switch from the
// island to the map to the text adventure and you're still standing in the
// same spot with the same pockets.
//
// The rules live in reduce(), a pure function from (state, action) to
// (state, events), so they're tested without a browser. createStore() wraps it
// with persistence and subscriptions.

import type { OutfitSlot, World } from './schema';

export type Vec2 = { x: number; z: number };

export type Progress = {
  /** Lost words found, in the order they were found. */
  found: string[];
  /** Post slugs caught off the pier. */
  caught: string[];
  /** Night falls once the word hoard is full; the visitor can toggle it after. */
  night: boolean;
  /** Outfit pieces unlocked by visiting places, in the order they were unlocked. */
  wardrobe: string[];
  /** What the explorer has on: at most one unlocked piece per slot. */
  worn: Partial<Record<OutfitSlot, string>>;
};

export type Presence = {
  /** The place the visitor is at (or last went into), if any. */
  at: string | null;
  /** Where they're standing, in world units, if a spatial renderer knows. */
  pos: Vec2 | null;
};

export type WorldState = { progress: Progress; presence: Presence };

export type Action =
  | { type: 'move'; pos: Vec2 | null; at?: string | null }
  | { type: 'find'; id: string }
  | { type: 'catch'; slug: string }
  | { type: 'night'; on: boolean }
  /** Unlock a piece directly (arriving at its place does this on its own). */
  | { type: 'unlock'; id: string }
  /** Put on an unlocked piece, replacing whatever was in its slot. */
  | { type: 'wear'; id: string }
  /** Take off whatever is in a slot. */
  | { type: 'unwear'; slot: OutfitSlot }
  | { type: 'reset' };

export type WorldEvent =
  | { type: 'arrived'; at: string | null }
  | { type: 'found'; id: string; count: number; total: number }
  | { type: 'hoard-complete' }
  | { type: 'caught'; slug: string; fresh: boolean }
  | { type: 'night'; on: boolean }
  | { type: 'unlocked'; id: string; count: number; total: number }
  | { type: 'wardrobe-complete' }
  /** A slot changed: `id` is what's in it now (null: nothing). */
  | { type: 'dressed'; slot: OutfitSlot; id: string | null };

export const emptyState = (): WorldState => ({
  progress: { found: [], caught: [], night: false, wardrobe: [], worn: {} },
  presence: { at: null, pos: null },
});

export function reduce(world: World, state: WorldState, action: Action): { state: WorldState; events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  const { progress, presence } = state;
  switch (action.type) {
    case 'move': {
      const at = action.at === undefined ? presence.at : action.at;
      if (at !== null && !world.places.some((p) => p.id === at)) return { state, events };
      if (at !== presence.at) events.push({ type: 'arrived', at });
      // Arriving somewhere (or going in) unlocks the wardrobe piece kept there.
      let next = progress;
      for (const o of world.outfits) if (o.place === at) next = unlock(world, next, o.id, events);
      return { state: { progress: next, presence: { at, pos: action.pos } }, events };
    }
    case 'unlock': {
      const next = unlock(world, progress, action.id, events);
      return next === progress ? { state, events } : { state: { presence, progress: next }, events };
    }
    case 'wear': {
      const o = world.outfits.find((x) => x.id === action.id);
      if (!o || !progress.wardrobe.includes(o.id) || progress.worn[o.slot] === o.id) return { state, events };
      events.push({ type: 'dressed', slot: o.slot, id: o.id });
      return { state: { presence, progress: { ...progress, worn: { ...progress.worn, [o.slot]: o.id } } }, events };
    }
    case 'unwear': {
      if (!progress.worn[action.slot]) return { state, events };
      const worn = { ...progress.worn };
      delete worn[action.slot];
      events.push({ type: 'dressed', slot: action.slot, id: null });
      return { state: { presence, progress: { ...progress, worn } }, events };
    }
    case 'find': {
      const total = world.lostWords.length;
      if (progress.found.includes(action.id) || !world.lostWords.some((w) => w.id === action.id)) return { state, events };
      const found = [...progress.found, action.id];
      events.push({ type: 'found', id: action.id, count: found.length, total });
      if (found.length === total) events.push({ type: 'hoard-complete' }, { type: 'night', on: true });
      return { state: { presence, progress: { ...progress, found, night: found.length === total ? true : progress.night } }, events };
    }
    case 'catch': {
      if (!world.posts.some((p) => p.slug === action.slug)) return { state, events };
      const fresh = !progress.caught.includes(action.slug);
      events.push({ type: 'caught', slug: action.slug, fresh });
      return fresh ? { state: { presence, progress: { ...progress, caught: [...progress.caught, action.slug] } }, events } : { state, events };
    }
    case 'night': {
      // Night is a reward: it can't be switched on before the hoard is full.
      const on = action.on && progress.found.length === world.lostWords.length;
      if (on === progress.night) return { state, events };
      events.push({ type: 'night', on });
      return { state: { presence, progress: { ...progress, night: on } }, events };
    }
    case 'reset': {
      // Forgetting words puts them back; the wardrobe is earned by walking, so it stays.
      const fresh = { ...emptyState().progress, wardrobe: progress.wardrobe, worn: progress.worn };
      return { state: { presence, progress: fresh }, events: progress.night ? [{ type: 'night', on: false }] : [] };
    }
  }
}

/** Add an outfit to the wardrobe (if it exists and isn't there yet), noting what happened in `events`. */
function unlock(world: World, progress: Progress, id: string, events: WorldEvent[]): Progress {
  if (progress.wardrobe.includes(id) || !world.outfits.some((o) => o.id === id)) return progress;
  const wardrobe = [...progress.wardrobe, id];
  const total = world.outfits.length;
  events.push({ type: 'unlocked', id, count: wardrobe.length, total });
  if (wardrobe.length === total) events.push({ type: 'wardrobe-complete' });
  return { ...progress, wardrobe };
}

/** Pick something to catch: a post not caught yet if there is one, else any. */
export function pickCatch(world: World, state: WorldState, random = Math.random) {
  if (!world.posts.length) return null;
  const fresh = world.posts.filter((p) => !state.progress.caught.includes(p.slug));
  const pool = fresh.length ? fresh : world.posts;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Keep only what still exists in this world (posts and words come and go). */
export function sanitize(world: World, raw: unknown): WorldState {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<{ progress: Partial<Progress>; presence: Partial<Presence> }>;
  const words = new Set(world.lostWords.map((w) => w.id));
  const posts = new Set(world.posts.map((p) => p.slug));
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  s.progress.found = [...new Set(strings(r.progress?.found))].filter((id) => words.has(id));
  s.progress.caught = [...new Set(strings(r.progress?.caught))].filter((slug) => posts.has(slug));
  s.progress.night = r.progress?.night === true && s.progress.found.length === words.size;
  const outfits = new Map(world.outfits.map((o) => [o.id, o]));
  s.progress.wardrobe = [...new Set(strings(r.progress?.wardrobe))].filter((id) => outfits.has(id));
  const worn = r.progress?.worn;
  if (worn && typeof worn === 'object') {
    for (const [slot, id] of Object.entries(worn)) {
      const o = typeof id === 'string' ? outfits.get(id) : undefined;
      if (o && o.slot === slot && s.progress.wardrobe.includes(o.id)) s.progress.worn[o.slot] = o.id;
    }
  }
  const at = r.presence?.at;
  if (typeof at === 'string' && world.places.some((p) => p.id === at)) s.presence.at = at;
  const pos = r.presence?.pos;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) s.presence.pos = { x: pos.x, z: pos.z };
  return s;
}

// ---------- The store ----------

type KV = { get(k: string): string | null; set(k: string, v: string): void };
const PROGRESS_KEY = 'world:progress:v1';
const PRESENCE_KEY = 'world:presence:v1';

const safe = (area: () => Storage): KV => ({
  get: (k) => {
    try {
      return area().getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      area().setItem(k, v);
    } catch {
      /* private mode or blocked: progress just won't outlive the tab */
    }
  },
});

export type Listener = (state: WorldState, events: WorldEvent[]) => void;
export type WorldStore = ReturnType<typeof createStore>;

/**
 * Progress lives in localStorage (it's yours to keep); presence lives in
 * sessionStorage (a new visit starts at the plaza). Pass your own storage in
 * tests.
 */
export function createStore(
  world: World,
  storage: { local: KV; session: KV } = { local: safe(() => localStorage), session: safe(() => sessionStorage) },
) {
  const parse = (s: string | null) => {
    try {
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  let state = sanitize(world, { progress: parse(storage.local.get(PROGRESS_KEY)), presence: parse(storage.session.get(PRESENCE_KEY)) });
  const listeners = new Set<Listener>();

  const save = () => {
    storage.local.set(PROGRESS_KEY, JSON.stringify(state.progress));
    storage.session.set(PRESENCE_KEY, JSON.stringify(state.presence));
  };

  function dispatch(action: Action) {
    const prev = state;
    const r = reduce(world, state, action);
    state = r.state;
    if (state === prev) return r.events;
    // Moving is constant and quiet; everything else is saved and announced.
    if (action.type === 'move' && !r.events.length) return r.events;
    save();
    for (const l of listeners) l(state, r.events);
    return r.events;
  }

  return {
    world,
    get state() {
      return state;
    },
    dispatch,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Write position now (call on pagehide, view switches). */
    flush: save,
    /** Cast a line: picks a post, records it, returns it with whether it's new. */
    fish(random = Math.random) {
      const post = pickCatch(world, state, random);
      if (!post) return null;
      const fresh = !state.progress.caught.includes(post.slug);
      dispatch({ type: 'catch', slug: post.slug });
      return { post, fresh };
    },
    has: (id: string) => state.progress.found.includes(id),
    /** The outfit pieces being worn right now, by slot. */
    worn: () => state.progress.worn,
  };
}
