// The island's mini-games, in words. Skipping stones plays right here: the
// sea goes flat for a moment, and you THROW before the next wave rolls in.
// The crabs and the crates need pictures, so PLAY opens the same little games
// card the island and the map use. Pure, like the engine: timers are effects
// the page sets, and best scores are a mirror of the store's.

import type { Place, World } from '../../world/schema';
import { GAME_INFO, isGame, scoreText, type GameId } from '../games/catalog';
import { MAX_STREAK_BONUS, STONES } from '../games/stones';
import type { EngineState, Result } from './engine';
import { dim, md, p, say, type Block, type Effect, type Signal, type Span } from './output';

/** A round of skipping stones in progress. */
export type StonesRound = {
  /** Which wait this is (timers for an earlier one are ignored). */
  token: number;
  /** The stone in hand, from 0. */
  stone: number;
  skips: number;
  streak: number;
  /** The sea: choppy (wait), flat (throw now!), a ripple (still fine), a swell (too late). */
  sea: 'wait' | 'flat' | 'ripple' | 'swell';
};

/** How long the sea stays choppy before it goes flat, then flat, then rippled, in milliseconds. */
export const SEA_MS = { wait: [1400, 3400] as [number, number], flat: 1900, ripple: 1600 };

type State = EngineState;

/** Words that mean each game. */
const NAMES: Record<GameId, string[]> = {
  stones: ['stones', 'stone', 'skipping', 'skipping stones', 'skip', 'skimming', 'skim', 'pebbles', 'ducks and drakes'],
  crabs: ['crabs', 'crab', 'crab boop', 'boop', 'whack', 'whack a crab', 'holes'],
  crates: ['crates', 'crate', 'crate stack', 'stack', 'stacking', 'tower', 'crane', 'boxes'],
};

export const gameNamed = (noun: string): GameId | null => (Object.keys(NAMES) as GameId[]).find((id) => NAMES[id].includes(noun)) ?? null;

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const plips = (n: number) => Array(Math.min(n, 6)).fill('plip').join(', ');

export function createTextGames(o: {
  world: World;
  random: () => number;
  /** Walk to a place, the engine's way. */
  walk: (s: State, to: string) => Result;
  ref: (pl: Place) => string;
}) {
  const { world, random } = o;
  const spots = world.activities.flatMap((a) => (a.kind === 'minigame' && a.game && isGame(a.game) ? [{ id: a.game, activity: a, place: world.places.find((x) => x.id === a.place)! }] : []));
  const here = (at: string) => spots.find((g) => g.place.id === at) ?? null;
  const spotOf = (id: GameId) => spots.find((g) => g.id === id) ?? null;
  const bestOf = (s: State, id: GameId) => s.bests[id] ?? 0;
  const res = (state: State, out: Block[] = [], effects: Effect[] = []): Result => ({ state, out, effects });

  /** One line for a place's description: what game is played here, and how to start. */
  function describe(pl: Place): Block[] {
    const g = here(pl.id);
    if (!g) return [];
    return [dim(g.activity.description, ' ', ...md(`Type [PLAY ${g.id.toUpperCase()}] to have a go.`))];
  }

  /** Every game on the island, with your best and where it is. */
  function list(s: State): Block[] {
    return [
      say('Three little games are tucked around the island:'),
      {
        kind: 'list',
        items: spots.map((g) => {
          const best = bestOf(s, g.id);
          const text: Span[] = [`${g.activity.description.split('. ')[0]}. `, best ? `Your best: ${scoreText(g.id, best)}.` : 'Not played yet.'];
          return { label: [{ text: `PLAY ${g.id.toUpperCase()}`, cmd: `play ${g.id}` }], text, color: GAME_INFO[g.id].color };
        }),
      },
    ];
  }

  /** PLAY, PLAY STONES, PLAY CRABS… */
  function play(s: State, noun: string): Result {
    const named = noun ? gameNamed(noun) : here(s.at)?.id ?? null;
    if (!named) {
      if (noun) return res(s, [say(`There's no game called '${noun}' on the island.`), ...list(s)]);
      return res(s, list(s));
    }
    const g = spotOf(named);
    if (!g) return res(s, [say('That game isn’t on this island.')]);
    if (s.at !== g.place.id) {
      const there = o.walk(s, g.place.id);
      return res(there.state, [...there.out, p(...md(`The ${GAME_INFO[named].name.toLowerCase()} are right here. [PLAY ${named.toUpperCase()}]?`))], there.effects);
    }
    if (named === 'stones') return startStones(s);
    const info = GAME_INFO[named];
    const best = bestOf(s, named);
    return res(
      s,
      [
        p(named === 'crabs' ? 'The crabs won’t sit still long enough to be written down. A little window opens onto the beach instead.' : 'Stacking crates is hard to do in words. A little window opens onto the depot instead.'),
        dim(best ? `Your best: ${scoreText(named, best)}.` : info.tagline),
      ],
      [{ type: 'game', id: named }],
    );
  }

  // ---------- Skipping stones, in words ----------

  const wait = (token: number): Effect => ({ type: 'timer', ms: Math.round(SEA_MS.wait[0] + random() * (SEA_MS.wait[1] - SEA_MS.wait[0])), signal: { name: 'flat', cast: token } });

  function startStones(s: State): Result {
    const token = (s.stones?.token ?? s.turns * 10) + 1;
    const round: StonesRound = { token, stone: 0, skips: 0, streak: 0, sea: 'wait' };
    const best = bestOf(s, 'stones');
    return res({ ...s, stones: round }, [
      p('You pick a flat stone off the pile and weigh it in your hand. The sea is choppy, but it settles every so often. When it goes flat as glass, ', ...md('[THROW]. Too soon or too late and the waves swallow it.')),
      dim(`Five stones. ${best ? `Your best is ${scoreText('stones', best)}.` : 'Every skip counts.'} Stone one: watch the water…`),
    ], [wait(token)]);
  }

  /** The sea changing, while a stone is in hand. */
  function signal(s: State, sig: Signal): Result | null {
    if (sig.name !== 'flat' && sig.name !== 'ripple' && sig.name !== 'swell') return null;
    const r = s.stones;
    if (!r || r.token !== sig.cast) return res(s);
    if (sig.name === 'flat' && (r.sea === 'wait' || r.sea === 'swell'))
      return res(
        { ...s, stones: { ...r, sea: 'flat' } },
        [{ kind: 'p', spans: md('The sea goes flat as glass. [THROW], now!'), tone: 'alert' }],
        [{ type: 'sound', name: 'tap' }, { type: 'timer', ms: SEA_MS.flat, signal: { name: 'ripple', cast: r.token } }],
      );
    if (sig.name === 'ripple' && r.sea === 'flat')
      return res({ ...s, stones: { ...r, sea: 'ripple' } }, [dim('A ripple runs across the water. Still a good moment.')], [{ type: 'timer', ms: SEA_MS.ripple, signal: { name: 'swell', cast: r.token } }]);
    if (sig.name === 'swell' && r.sea === 'ripple') return res({ ...s, stones: { ...r, sea: 'swell' } }, [dim(...md('A wave rolls in. Choppy again. [THROW] anyway, or wait for the next lull.'))], [wait(r.token)]);
    return res(s);
  }

  /** THROW: how many skips depends on the sea. */
  function throwStone(s: State): Result {
    const r = s.stones;
    if (!r) {
      const g = spotOf('stones');
      if (g && s.at === g.place.id) return res(s, [say('Pick up a stone first: [PLAY STONES].')]);
      return res(s, [say(g ? `You've nothing to throw. There are flat stones on the beach by ${o.ref(g.place)}: [PLAY STONES].` : 'You’ve nothing to throw.')]);
    }
    let skips: number;
    let line: string;
    let streak = 0;
    if (r.sea === 'flat') {
      streak = r.streak + 1;
      skips = 7 + Math.floor(random() * 3) + Math.min(r.streak, MAX_STREAK_BONUS);
      line = streak > 1 ? `A perfect throw, ${NUMBERS[streak] ?? streak} in a row!` : 'A perfect throw!';
    } else if (r.sea === 'ripple') {
      skips = 3 + Math.floor(random() * 3);
      line = 'A good throw, ripples and all.';
    } else {
      skips = Math.floor(random() * 3);
      line = r.sea === 'wait' ? 'Too soon: the chop catches it.' : 'Too late: the wave catches it.';
    }
    const total = r.skips + skips;
    const flight = skips ? `It skims out low: ${plips(skips)}… ${skips} ${skips === 1 ? 'skip' : 'skips'}.` : 'Plonk. Straight in.';
    const out: Block[] = [p(`${line} ${flight}`)];
    const effects: Effect[] = [{ type: 'sound', name: skips ? 'skip' : 'plonk' }];
    const stone = r.stone + 1;
    if (stone < STONES) {
      const token = r.token + 1;
      out.push(dim(`${total} ${total === 1 ? 'skip' : 'skips'} so far. Stone ${NUMBERS[stone + 1]} of five: watch the water…`));
      effects.push(wait(token));
      return res({ ...s, stones: { token, stone, skips: total, streak, sea: 'wait' } }, out, effects);
    }
    // The last stone: the score, and the best.
    const best = bestOf(s, 'stones');
    const record = total > best;
    out.push({ kind: 'p', spans: md(`That's all five: *${total} ${total === 1 ? 'skip' : 'skips'}* in all. ${record ? (best ? `A new best, beating ${best}!` : 'Your first best.') : total === best ? 'Level with your best.' : `Your best is ${best}.`} [PLAY STONES] again?`), tone: record ? 'alert' : undefined });
    effects.push({ type: 'score', game: 'stones', score: total }, { type: 'sound', name: record ? 'fanfare' : 'chime' });
    return res({ ...s, stones: null, bests: { ...s.bests, stones: Math.max(best, total) } }, out, effects);
  }

  /** A line for SCORE: your bests. */
  function scores(s: State): Block[] {
    const played = spots.filter((g) => bestOf(s, g.id) > 0);
    if (!played.length) return [];
    return [dim(`Your best scores: ${played.map((g) => `${GAME_INFO[g.id].name.toLowerCase()} ${scoreText(g.id, bestOf(s, g.id))}`).join(', ')}.`)];
  }

  return { describe, list, play, signal, throwStone, scores, here: (at: string) => here(at)?.id ?? null };
}
