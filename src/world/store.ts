// What a visitor has done, shared by every renderer: where they are, which
// lost words they've found, what they've caught off the pier, and their best
// score at each of the island's little games. Switch from the
// island to the map to the text adventure and you're still standing in the
// same spot with the same pockets.
//
// The rules live in reduce(), a pure function from (state, action) to
// (state, events), so they're tested without a browser. createStore() wraps it
// with persistence and subscriptions.

import type { World } from './schema';

export type Vec2 = { x: number; z: number };

export type Progress = {
  /** Lost words found, in the order they were found. */
  found: string[];
  /** Post slugs caught off the pier. */
  caught: string[];
  /** Night falls once the word hoard is full; the visitor can toggle it after. */
  night: boolean;
  /** The fastest lap round the island in the boat, in seconds (null until one is finished). */
  bestLap: number | null;
  /** Each mini-game's best score and how many rounds were played, by game id. */
  games: Record<string, GameRecord>;
};

export type GameRecord = { best: number; plays: number };

export type Presence = {
  /** The place the visitor is at (or last went into), if any. */
  at: string | null;
  /** Where they're standing, in world units, if a spatial renderer knows. */
  pos: Vec2 | null;
  /** The building they're inside (its place id), if they've gone in. */
  inside: string | null;
};

export type WorldState = { progress: Progress; presence: Presence };

export type Action =
  | { type: 'move'; pos: Vec2 | null; at?: string | null }
  | { type: 'inside'; at: string | null }
  | { type: 'find'; id: string }
  | { type: 'catch'; slug: string }
  | { type: 'night'; on: boolean }
  | { type: 'lap'; time: number }
  /** A round of a mini-game ended with this score. */
  | { type: 'score'; game: string; score: number }
  | { type: 'reset' };

export type WorldEvent =
  | { type: 'arrived'; at: string | null }
  | { type: 'inside'; at: string | null }
  | { type: 'found'; id: string; count: number; total: number }
  | { type: 'hoard-complete' }
  | { type: 'caught'; slug: string; fresh: boolean }
  | { type: 'night'; on: boolean }
  /** A lap round the island, finished: whether it beat the best, and the best before it. */
  | { type: 'lap'; time: number; best: boolean; previous: number | null }
  /** `record`: a new best (a score above zero that beats the last best). */
  | { type: 'scored'; game: string; score: number; best: number; previous: number; record: boolean };

/** A lap time worth keeping: a real number of seconds, not a glitch. */
export const validLap = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > 1 && t < 3600;

/** The highest score kept, so a tampered save can't fill the screen with digits. */
const MAX_SCORE = 999_999;

/** The mini-games this world has, by game id. */
export const gameIds = (world: World): string[] => world.activities.flatMap((a) => (a.kind === 'minigame' && a.game ? [a.game] : []));

export const emptyState = (): WorldState => ({
  progress: { found: [], caught: [], night: false, bestLap: null, games: {} },
  presence: { at: null, pos: null, inside: null },
});

export function reduce(world: World, state: WorldState, action: Action): { state: WorldState; events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  const { progress, presence } = state;
  switch (action.type) {
    case 'move': {
      const at = action.at === undefined ? presence.at : action.at;
      if (at !== null && !world.places.some((p) => p.id === at)) return { state, events };
      if (at !== presence.at) events.push({ type: 'arrived', at });
      // Walking somewhere else takes you back outside.
      const inside = presence.inside && at !== presence.inside ? null : presence.inside;
      if (inside !== presence.inside) events.push({ type: 'inside', at: null });
      return { state: { progress, presence: { at, pos: action.pos, inside } }, events };
    }
    case 'inside': {
      // Only into buildings that have a room.
      const at = action.at && world.places.some((p) => p.id === action.at && p.interior) ? action.at : null;
      if (action.at && !at) return { state, events };
      if (at === presence.inside) return { state, events };
      events.push({ type: 'inside', at });
      if (at && at !== presence.at) events.push({ type: 'arrived', at });
      return { state: { progress, presence: { ...presence, at: at ?? presence.at, inside: at } }, events };
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
    case 'lap': {
      if (!validLap(action.time)) return { state, events };
      const previous = progress.bestLap;
      const best = previous === null || action.time < previous;
      events.push({ type: 'lap', time: action.time, best, previous });
      return best ? { state: { presence, progress: { ...progress, bestLap: action.time } }, events } : { state, events };
    }
    case 'score': {
      if (!gameIds(world).includes(action.game) || !Number.isFinite(action.score)) return { state, events };
      const score = Math.min(MAX_SCORE, Math.max(0, Math.floor(action.score)));
      const was = progress.games[action.game] ?? { best: 0, plays: 0 };
      const record = score > was.best;
      const now: GameRecord = { best: Math.max(was.best, score), plays: was.plays + 1 };
      events.push({ type: 'scored', game: action.game, score, best: now.best, previous: was.best, record });
      return { state: { presence, progress: { ...progress, games: { ...progress.games, [action.game]: now } } }, events };
    }
    case 'reset':
      // Forgets the words and the catches; the lap record and the best scores are kept (the card only asks about words).
      return { state: { presence, progress: { ...emptyState().progress, bestLap: progress.bestLap, games: progress.games } }, events: progress.night ? [{ type: 'night', on: false }] : [] };
  }
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
  const lap = r.progress?.bestLap;
  s.progress.bestLap = validLap(lap) ? lap : null;
  const games = r.progress?.games;
  if (games && typeof games === 'object') {
    const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_SCORE, Math.max(0, Math.floor(v))) : 0);
    for (const id of gameIds(world)) {
      const g = (games as Record<string, unknown>)[id];
      if (!g || typeof g !== 'object') continue;
      const { best, plays } = g as Partial<GameRecord>;
      s.progress.games[id] = { best: count(best), plays: Math.max(count(plays), count(best) > 0 ? 1 : 0) };
    }
  }
  const at = r.presence?.at;
  if (typeof at === 'string' && world.places.some((p) => p.id === at)) s.presence.at = at;
  const pos = r.presence?.pos;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) s.presence.pos = { x: pos.x, z: pos.z };
  const inside = r.presence?.inside;
  if (typeof inside === 'string' && world.places.some((p) => p.id === inside && p.interior)) s.presence.inside = inside;
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
    /** Your best score at a mini-game (0 if you haven't played it). */
    best: (game: string) => state.progress.games[game]?.best ?? 0,
  };
}
