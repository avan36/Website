import { describe, expect, it } from 'vitest';
import type { EngineState, Result } from '../engine';
import { plain, type Effect, type Signal } from '../output';
import { gameNamed } from '../games';
import { engine, play, say } from './helpers';

const effects = (r: { effects: Effect[] }, type: Effect['type']) => r.effects.filter((e) => e.type === type);
const timer = (r: Result) => (effects(r, 'timer')[0] as Extract<Effect, { type: 'timer' }> | undefined)?.signal;
/** Let the sea do what the page's timers would. */
const fire = (s: EngineState, sig: Signal) => engine.signal(s, sig);

/** Throw a whole round of five, each when the sea is at `when`. */
function round(when: 'wait' | 'flat' | 'ripple' | 'swell', from = play('busy-beer', 'play stones')) {
  let s = from.state;
  let r = from.last;
  const all: Result[] = [r];
  for (let i = 0; i < 5; i++) {
    if (when !== 'wait') {
      r = fire(s, timer(r)!);
      s = r.state;
      all.push(r);
      for (const next of ['ripple', 'swell'] as const) {
        if (s.stones!.sea === when) break;
        r = fire(s, { name: next, cast: s.stones!.token });
        s = r.state;
      }
    }
    r = engine.run(s, 'throw');
    s = r.state;
    all.push(r);
  }
  return { state: s, last: r, all };
}

describe('the games, in words', () => {
  it('knows each game by a few names', () => {
    expect(gameNamed('stones')).toBe('stones');
    expect(gameNamed('skipping stones')).toBe('stones');
    expect(gameNamed('crab')).toBe('crabs');
    expect(gameNamed('tower')).toBe('crates');
    expect(gameNamed('chess')).toBeNull();
  });

  it('mentions the game where it is played, with a chip on phones', () => {
    expect(say('busy-beer', 'look')).toMatch(/PLAY STONES/);
    expect(say('contact', 'look')).toMatch(/PLAY CRABS/);
    expect(say('eqoscan', 'look')).toMatch(/PLAY CRATES/);
    expect(engine.suggest(engine.initial('eqoscan')).map((c) => c.cmd)).toContain('play crates');
  });

  it('lists every game and your bests on PLAY, anywhere without one', () => {
    const s = { ...engine.initial('plaza'), bests: { crabs: 31 } };
    const text = plain(engine.run(s, 'play').out);
    expect(text).toMatch(/PLAY STONES/);
    expect(text).toMatch(/Your best: 31 boops/);
    expect(text).toMatch(/Not played yet/);
    expect(say('plaza', 'play chess')).toMatch(/no game called 'chess'/);
  });

  it('walks you to a game first, then plays it', () => {
    const r = play('plaza', 'play crates');
    expect(r.state.at).toBe('eqoscan');
    expect(effects(r.last, 'game')).toEqual([]);
    expect(r.text).toMatch(/PLAY CRATES/);
    const again = engine.run(r.state, 'play crates');
    expect(effects(again, 'game')).toEqual([{ type: 'game', id: 'crates' }]);
  });

  it('opens the card for the games words cannot draw', () => {
    expect(effects(play('contact', 'play crabs').last, 'game')).toEqual([{ type: 'game', id: 'crabs' }]);
    // PLAY on its own plays the game that's here.
    expect(effects(play('contact', 'play').last, 'game')).toEqual([{ type: 'game', id: 'crabs' }]);
  });

  it('skips stones by timing: perfect when the sea is flat, and a score at the end', () => {
    const r = round('flat');
    const score = effects(r.last, 'score')[0] as Extract<Effect, { type: 'score' }>;
    // random() is 0.5 in the tests: 8 skips, plus the streak (0, 1, 2, 3, 4).
    expect(score).toEqual({ type: 'score', game: 'stones', score: 8 * 5 + 10 });
    expect(plain(r.last.out)).toMatch(/50 skips\* in all|50 skips in all/);
    expect(plain(r.last.out)).toMatch(/Your first best/);
    expect(r.state.stones).toBeNull();
    expect(r.state.bests.stones).toBe(50);
    expect(plain(r.all.map((x) => x.out).flat())).toMatch(/five in a row/);
  });

  it('skips less in the ripples, and hardly at all too soon or too late', () => {
    const ripple = effects(round('ripple').last, 'score')[0] as Extract<Effect, { type: 'score' }>;
    const soon = effects(round('wait').last, 'score')[0] as Extract<Effect, { type: 'score' }>;
    const late = effects(round('swell').last, 'score')[0] as Extract<Effect, { type: 'score' }>;
    expect(ripple.score).toBe(4 * 5);
    expect(soon.score).toBe(5);
    expect(late.score).toBe(5);
  });

  it('says when a round beats your best, and when it does not', () => {
    const start = (best: number) => play({ ...engine.initial('busy-beer'), bests: { stones: best } }, 'play stones');
    expect(plain(round('flat', start(20)).last.out)).toMatch(/A new best, beating 20!/);
    expect(plain(round('wait', start(20)).last.out)).toMatch(/Your best is 20/);
  });

  it('ignores the sea once the stones are put down, or for an old stone', () => {
    const r = play('busy-beer', 'play stones');
    const sig = timer(r.last)!;
    const left = engine.run(r.state, 'north');
    expect(left.state.stones).toBeNull();
    expect(fire(left.state, sig).out).toEqual([]);
    expect(fire(r.state, { ...sig, cast: sig.cast + 5 }).out).toEqual([]);
  });

  it('has nothing to throw without a stone in hand', () => {
    expect(say('plaza', 'throw')).toMatch(/nothing to throw/);
    expect(say('busy-beer', 'skip')).toMatch(/PLAY STONES/);
  });

  it('puts your bests in SCORE', () => {
    const s = { ...engine.initial('plaza'), bests: { stones: 44 } };
    expect(plain(engine.run(s, 'score').out)).toMatch(/skipping stones 44 skips/);
  });

  it('says it all without an em dash', () => {
    const r = round('flat');
    const text = [...r.all.map((x) => plain(x.out)), say('plaza', 'play'), say('contact', 'play crabs'), say('eqoscan', 'play crates'), say('plaza', 'throw')].join('\n');
    expect(text).not.toContain('—');
  });
});
