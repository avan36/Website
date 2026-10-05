// The island's mini-games, as data every view can share: what each is
// called, its color, how to play it with keys and with a finger, what its
// score counts, and which views can play it. No DOM and no drawing here (the
// shell imports this for the word hoard's "Games" row), so it costs next to
// nothing to load.

import type { GameId, World } from '../../world/schema';

export type { GameId };

/** The views that play games: the island and the map draw them, the text adventure plays some in words. */
export type GameView = 'island' | 'map' | 'text';

export interface GameInfo {
  id: GameId;
  name: string;
  /** What the score counts: one and many. Null for a game with no score (it's just for fun). */
  unit: [string, string] | null;
  color: string;
  /** A few words for the prompt on the island and the map. */
  tagline: string;
  /** How it plays, on the start card. */
  pitch: string;
  /** How to play, for keys and for touch. */
  keys: string;
  touch: string;
  /** Where it can be played. The islets' games are only on the 3D island so far: the map walks out to the islets but doesn't play their games yet, and the text adventure doesn't go there. */
  views: GameView[];
}

const EVERYWHERE: GameView[] = ['island', 'map', 'text'];

export const GAME_INFO: Record<GameId, GameInfo> = {
  stones: {
    id: 'stones',
    name: 'Skipping stones',
    unit: ['skip', 'skips'],
    color: '#2b8fb8',
    tagline: 'How many skips can you get out of five stones?',
    pitch: 'Five flat stones. Let go when the meter is in the bright band and watch them skip. Perfect throws in a row skip further.',
    keys: 'Hold Space (or Enter), let go in the band.',
    touch: 'Press and hold, let go in the band.',
    views: EVERYWHERE,
  },
  crabs: {
    id: 'crabs',
    name: 'Crab boop',
    unit: ['boop', 'boops'],
    color: '#ff5a36',
    tagline: 'Thirty seconds, nine holes, a lot of crabs.',
    pitch: 'Thirty seconds of crabs. Boop each one back into the sand before it scuttles off. Gold crabs are worth three. Leave the starfish be.',
    keys: 'Keys 1 to 9, or Q W E, A S D, Z X C: one per hole.',
    touch: 'Tap the crabs.',
    views: EVERYWHERE,
  },
  crates: {
    id: 'crates',
    name: 'Crate stack',
    unit: ['crate', 'crates'],
    color: '#20a464',
    tagline: 'How high can you stack them?',
    pitch: 'The crane swings a crate over the stack. Drop it square on the last one. Whatever hangs over falls off, so the tower gets narrower. Land three perfect drops in a row to win some back.',
    keys: 'Space, Enter or a click drops the crate.',
    touch: 'Tap to drop the crate.',
    views: EVERYWHERE,
  },
  // Four that used to be on the project pages, now on the islets. Each one teaches something true about its project.
  bartender: {
    id: 'bartender',
    name: 'Ask the bartender',
    unit: null,
    color: '#f29a1f',
    tagline: "Tell me the mood in three words and I'll pour you something.",
    pitch: 'Pick three vibes and the bartender pours. No secrets behind the bar: watch each vibe push the five flavor axes, and the menu score itself.',
    keys: 'Keys 1 to 9 and 0 pick vibes, or Tab to one and press Enter.',
    touch: 'Tap three vibes.',
    views: ['island'],
  },
  patterns: {
    id: 'patterns',
    name: 'Spot the dark pattern',
    unit: ['trick', 'tricks'],
    color: '#e5484d',
    tagline: 'A signup page full of tricks. How many can you spot?',
    pitch: "Fernhollow Kitchen wants you on its recipe newsletter, and it isn't playing fair. Flag anything on the page that's built to steer you, then see which tricks Global Privacy Control would have settled for you.",
    keys: 'Click anything suspicious, or Tab to it and press Enter.',
    touch: 'Tap anything that looks like a trick.',
    views: ['island'],
  },
  etymology: {
    id: 'etymology',
    name: 'Etymology race',
    unit: ['point', 'points'],
    color: '#3a6fd8',
    tagline: 'Ten words, a ticking clock. Where did English get them?',
    pitch: 'Ten words, a ticking clock. Guess which language English borrowed each one from, or pick its oldest ancestor out of a line-up. Quick answers score more, and a streak multiplies everything.',
    keys: 'Keys 1 to 4 answer. Enter for the next word.',
    touch: 'Tap an answer.',
    views: ['island'],
  },
  evolution: {
    id: 'evolution',
    name: 'Sort the tree of life',
    unit: ['correct', 'correct'],
    color: '#4caf6a',
    tagline: 'Is a whale a fish? Twelve living things, nine branches.',
    pitch: 'Is a whale a fish? Is a horseshoe crab a crab? Put twelve living things on their branch of the tree of life, with a fact from the map for every one.',
    keys: 'Keys 1 to 9 put the chosen card on a branch. Tab to choose another card.',
    touch: 'Drag a card onto its branch, or tap the card, then the branch.',
    views: ['island'],
  },
};

export const GAME_IDS = Object.keys(GAME_INFO) as GameId[];

export const isGame = (id: string): id is GameId => id in GAME_INFO;

/** Can this view play this game? */
export const playableIn = (id: GameId, view: GameView) => GAME_INFO[id].views.includes(view);

/** Does it keep a score (and so a best)? */
export const isScored = (id: GameId) => GAME_INFO[id].unit !== null;

/** "1 skip", "12 skips" (just the number, for a game with no score). */
export const scoreText = (id: GameId, n: number) => {
  const unit = GAME_INFO[id].unit;
  return unit ? `${n} ${unit[n === 1 ? 0 : 1]}` : String(n);
};

/** The islet a spot is on, if it's off the main island. */
export function isletAt(world: World, at: { x: number; z: number }) {
  return world.geography.islets.find((s) => Math.hypot(at.x - s.at.x, at.z - s.at.z) < s.coast.radius + 1) ?? null;
}

/**
 * The games this world puts on the island, with where each one is (the
 * islet it's on, or the place it's by). With a view, only the games that
 * view can play.
 */
export function gameSpots(world: World, view?: GameView) {
  return world.activities.flatMap((a) => {
    if (a.kind !== 'minigame' || !a.game || !isGame(a.game)) return [];
    if (view && !playableIn(a.game, view)) return [];
    const place = world.places.find((p) => p.id === a.place);
    return [{ ...GAME_INFO[a.game], activity: a, place: place ?? null, where: isletAt(world, a.at)?.name ?? place?.title ?? '' }];
  });
}

/** The view the page is showing, if there's a page (the shell marks it on <html>). */
const viewNow = (): GameView | undefined => {
  const v = typeof document === 'undefined' ? undefined : document.documentElement.dataset.view;
  return v === 'island' || v === 'map' || v === 'text' ? v : undefined;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The "Island games" row: every game you can play in this view (`view`, or
 * the one the page is showing), your best at it, and where to find it.
 * Shared by the word hoard and the games' own card.
 */
export function gamesRow(world: World, record: (id: GameId) => { best: number; plays: number } | undefined, current?: GameId, view: GameView | undefined = viewNow()) {
  const spots = gameSpots(world, view);
  if (!spots.length) return '';
  const cells = spots
    .map((g) => {
      const r = record(g.id);
      const best = !isScored(g.id) ? 'Just for fun' : r?.plays ? `Best: ${scoreText(g.id, r.best)}` : 'Not played yet';
      return `<li class="w-games__item${g.id === current ? ' is-here' : ''}" style="--gc:${g.color}"><span class="w-games__name">${esc(g.name)}</span><span class="w-games__best">${esc(best)}</span><span class="w-games__where">${esc(g.where)}</span></li>`;
    })
    .join('');
  return `<div class="w-games"><p class="w-games__head">Island games</p><ul class="w-games__list" role="list">${cells}</ul></div>`;
}

/**
 * What to say under a score to make one more go irresistible: how close
 * the best was, or how it just fell.
 */
export function nudge(id: GameId, score: number, best: number, record: boolean, previous: number): string {
  if (record) return previous > 0 ? `${scoreText(id, score - previous)} better than your last best. Can you top it?` : 'Your first best. Now beat it.';
  if (score === 0) return 'Everyone starts somewhere. Have another go.';
  if (score === best) return 'Level with your best. One more go?';
  const gap = best - score;
  if (gap <= Math.max(2, Math.round(best * 0.15))) return `So close: ${scoreText(id, gap)} short of your best.`;
  return `Your best is ${scoreText(id, best)}. One more go?`;
}
