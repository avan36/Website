// The island's three mini-games, as data every view can share: what each is
// called, its color, how to play it with keys and with a finger, and what its
// score counts. No DOM and no drawing here (the shell imports this for the
// word hoard's "Games" row), so it costs next to nothing to load.

import type { GameId, World } from '../../world/schema';

export type { GameId };

export interface GameInfo {
  id: GameId;
  name: string;
  /** What the score counts: one and many. */
  unit: [string, string];
  color: string;
  /** A few words for the prompt on the island and the map. */
  tagline: string;
  /** How it plays, on the start card. */
  pitch: string;
  /** How to play, for keys and for touch. */
  keys: string;
  touch: string;
}

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
  },
};

export const GAME_IDS = Object.keys(GAME_INFO) as GameId[];

export const isGame = (id: string): id is GameId => id in GAME_INFO;

/** "1 skip", "12 skips". */
export const scoreText = (id: GameId, n: number) => `${n} ${GAME_INFO[id].unit[n === 1 ? 0 : 1]}`;

/** The games this world puts on the island, with where each one is. */
export function gameSpots(world: World) {
  return world.activities.flatMap((a) => {
    if (a.kind !== 'minigame' || !a.game || !isGame(a.game)) return [];
    const place = world.places.find((p) => p.id === a.place);
    return [{ ...GAME_INFO[a.game], activity: a, place: place ?? null }];
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The "Island games" row: every game on the island, your best at it, and
 * where to find it. Shared by the word hoard and the games' own card.
 */
export function gamesRow(world: World, record: (id: GameId) => { best: number; plays: number } | undefined, current?: GameId) {
  const spots = gameSpots(world);
  if (!spots.length) return '';
  const cells = spots
    .map((g) => {
      const r = record(g.id);
      return `<li class="w-games__item${g.id === current ? ' is-here' : ''}" style="--gc:${g.color}"><span class="w-games__name">${esc(g.name)}</span><span class="w-games__best">${r?.plays ? `Best: ${esc(scoreText(g.id, r.best))}` : 'Not played yet'}</span><span class="w-games__where">${esc(g.place?.title ?? '')}</span></li>`;
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
