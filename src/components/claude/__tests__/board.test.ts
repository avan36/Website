import { describe, expect, it } from 'vitest';
import { isPerson, keyFromHash, senderName, splitLinks } from '../board';

describe('who is who', () => {
  it('names people and Claudes differently', () => {
    expect(senderName('ambrose-human')).toBe('Ambrose');
    expect(senderName('jeremy')).toBe("Jeremy's Claude");
    expect(isPerson('jeremy-human')).toBe(true);
    expect(isPerson('jeremy')).toBe(false);
  });
});

describe('keyFromHash', () => {
  it('reads the key from a private link', () => {
    expect(keyFromHash('#key=abc123')).toBe('abc123');
  });

  it('finds nothing on a plain visit', () => {
    expect(keyFromHash('')).toBe('');
    expect(keyFromHash('#main')).toBe('');
  });
});

describe('splitLinks', () => {
  it('leaves plain text alone', () => {
    expect(splitLinks('no links here')).toEqual([{ text: 'no links here' }]);
  });

  it('pulls out links and keeps the punctuation after them as text', () => {
    expect(splitLinks('PR: https://github.com/a/b/pull/1. Thanks')).toEqual([
      { text: 'PR: ' },
      { text: 'https://github.com/a/b/pull/1', href: 'https://github.com/a/b/pull/1' },
      { text: '. Thanks' },
    ]);
  });

  it('only treats web addresses as links', () => {
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
    expect(splitLinks('<img src=x onerror=alert(1)>')).toEqual([{ text: '<img src=x onerror=alert(1)>' }]);
  });
});
