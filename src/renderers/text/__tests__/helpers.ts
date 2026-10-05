import { createGeo } from '../../../world/geo';
import { posts, world as makeWorld } from '../../../world/__tests__/fixtures';
import { createEngine, type EngineState, type Result } from '../engine';
import { plain } from '../output';

export const world = makeWorld();
export const geo = createGeo(world);
/** A fixed moment, so who's out walking where never changes between runs. */
export const NOW = 1_800_000_000;
export const engine = createEngine(world, geo, { random: () => 0.5, now: () => NOW });
export { posts };

/** Play a list of commands from a state, keeping every result. */
export function play(from: EngineState | string, ...commands: string[]) {
  let state = typeof from === 'string' ? engine.initial(from) : from;
  const results: Result[] = [];
  for (const c of commands) {
    const r = engine.run(state, c);
    results.push(r);
    state = r.state;
  }
  const last = results[results.length - 1];
  return { state, results, last, text: last ? plain(last.out) : '', all: results.map((r) => plain(r.out)).join('\n') };
}

/** What a single command says, from a fresh start somewhere. */
export const say = (at: string, ...commands: string[]) => play(at, ...commands).text;
