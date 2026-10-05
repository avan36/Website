import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flagStripes } from '../flag';

const FLAG_STRIPES = flagStripes(readFileSync('src/styles/tokens.css', 'utf8'));

describe('the small flag', () => {
  it('is pink, purple and blue, top to bottom, in stripes 2:1:2', () => {
    expect(FLAG_STRIPES.map((s) => s.color)).toEqual(['#d60270', '#9b4f96', '#0038a8']);
    expect(FLAG_STRIPES.map((s) => +(s.to - s.from).toFixed(2))).toEqual([0.4, 0.2, 0.4]);
    expect(FLAG_STRIPES[0].from).toBe(0);
    expect(FLAG_STRIPES[2].to).toBe(1);
  });

  it('reads its colors from the tokens, and says which one is missing', () => {
    const css = ':root { --flag-pink: #AA0000; --flag-purple: #00aa00; --flag-blue: #0000aa; }';
    expect(flagStripes(css).map((s) => s.color)).toEqual(['#aa0000', '#00aa00', '#0000aa']);
    expect(() => flagStripes(':root { --flag-pink: #aa0000; }')).toThrow(/--flag-purple/);
  });
});
