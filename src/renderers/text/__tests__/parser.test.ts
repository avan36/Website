import { describe, expect, it } from 'vitest';
import { key, parse, words } from '../parser';

const verb = (s: string) => parse(s).verb;

describe('parse', () => {
  it('knows the classic abbreviations', () => {
    expect(verb('l')).toBe('look');
    expect(verb('x journal')).toBe('examine');
    expect(verb('i')).toBe('inventory');
    expect(verb('z')).toBe('wait');
    expect(verb('g')).toBe('again');
    expect(verb('?')).toBe('help');
  });

  it('reads synonyms, longest phrase first', () => {
    expect(verb('look at the journal')).toBe('examine');
    expect(verb('look in the barrels')).toBe('search');
    expect(verb('look under the rocks')).toBe('search');
    expect(verb('inspect sign')).toBe('examine');
    expect(verb('take a look')).toBe('look');
    expect(verb('take me to the pier')).toBe('go');
    expect(verb('go inside')).toBe('enter');
    expect(verb('go into the library')).toBe('enter');
    expect(verb('cast a line')).toBe('fish');
    expect(verb('reel it in')).toBe('reel');
    expect(verb('word hoard')).toBe('inventory');
    expect(verb('switch to map')).toBe('view');
  });

  it('drops articles, filler and politeness from the noun', () => {
    expect(parse('walk to the library please').noun).toBe('library');
    expect(parse('please go to the old library').noun).toBe('old library');
    expect(parse('could you examine the giant book').noun).toBe('giant book');
    expect(parse('i want to look at a crab').noun).toBe('crab');
    expect(parse('I would like to search the rowboat').verb).toBe('search');
  });

  it('keeps a lone "i" as inventory, not politeness', () => {
    expect(parse('i').verb).toBe('inventory');
    expect(parse('ok').verb).toBe('yes');
  });

  it('understands directions however they are written', () => {
    for (const s of ['ne', 'northeast', 'north-east', 'north east', 'go ne', 'go north east', 'walk north-east', 'head to the north-east']) {
      const c = parse(s);
      expect(c.verb, s).toBe('go');
      expect(c.dir, s).toBe('ne');
    }
    expect(parse('s').dir).toBe('s');
    expect(parse('w').dir).toBe('w');
    expect(parse('look north').dir).toBe('n');
    expect(parse('look north').verb).toBe('look');
  });

  it('notices when you want a closer look', () => {
    expect(parse('examine the barrels closely').closely).toBe(true);
    expect(parse('examine the barrels closely').noun).toBe('barrels');
    expect(parse('x barrels').closely).toBe(false);
  });

  it('keeps the shell commands intact', () => {
    expect(parse('cd ..').rest).toEqual(['..']);
    expect(verb('sudo rm -rf /')).toBe('sudo');
  });

  it('returns no verb for a bare noun', () => {
    expect(parse('library').verb).toBeNull();
    expect(parse('the giant book').noun).toBe('giant book');
  });
});

describe('words and keys', () => {
  it('normalise case, punctuation and compass names', () => {
    expect(words("Look at the Journal!")).toEqual(['look', 'at', 'the', 'journal']);
    expect(words('North East')).toEqual(['north-east']);
    expect(words("what's that?")).toEqual(['whats', 'that']);
  });

  it('make names and input compare equal', () => {
    expect(key('The old library')).toBe(key('old library'));
    expect(key('Message in a bottle')).toBe('message bottle');
  });
});
