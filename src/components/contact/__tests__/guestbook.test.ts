import { describe, expect, it } from 'vitest';
import { checkGuestbook, oneLine, pickNotes, signature, GUESTBOOK_MAX_MESSAGE } from '../guestbook';
import { guestbook } from '../../../data/guestbook';

describe('checkGuestbook', () => {
  it('accepts a one-liner with or without a name', () => {
    expect(checkGuestbook({ message: '  Lovely island!  ' })).toEqual({ ok: true, value: { name: '', message: 'Lovely island!' } });
    expect(checkGuestbook({ name: ' A. ', message: 'Hi' })).toEqual({ ok: true, value: { name: 'A.', message: 'Hi' } });
  });

  it('folds newlines into one line', () => {
    expect(oneLine('a\n\n b\tc')).toBe('a b c');
    const r = checkGuestbook({ message: 'one\ntwo' });
    expect(r.ok && r.value.message).toBe('one two');
  });

  it('rejects empty, long, and linky notes', () => {
    expect(checkGuestbook({ message: '   ' })).toMatchObject({ ok: false, field: 'message' });
    expect(checkGuestbook({ message: 'x'.repeat(GUESTBOOK_MAX_MESSAGE) }).ok).toBe(true);
    expect(checkGuestbook({ message: 'x'.repeat(GUESTBOOK_MAX_MESSAGE + 1) })).toMatchObject({ ok: false, field: 'message' });
    expect(checkGuestbook({ message: 'visit https://spam.example' })).toMatchObject({ ok: false, field: 'message' });
    expect(checkGuestbook({ message: 'buy at cheap-stuff.com' })).toMatchObject({ ok: false, field: 'message' });
    expect(checkGuestbook({ name: 'n'.repeat(41), message: 'hi' })).toMatchObject({ ok: false, field: 'name' });
  });

  it('counts emoji as one character each', () => {
    expect(checkGuestbook({ message: '🌊'.repeat(GUESTBOOK_MAX_MESSAGE) }).ok).toBe(true);
  });
});

describe('pickNotes', () => {
  const notes = ['a', 'b', 'c', 'd', 'e'];

  it('returns up to n distinct entries without mutating the input', () => {
    const picked = pickNotes(notes, 3, () => 0.99);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(notes).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('handles empty and short lists', () => {
    expect(pickNotes([], 3)).toEqual([]);
    expect(pickNotes(['x'], 3)).toEqual(['x']);
    expect(pickNotes(notes, 0)).toEqual([]);
  });

  it('is deterministic for a given random source', () => {
    expect(pickNotes(notes, 2, () => 0)).toEqual(['a', 'b']);
  });
});

describe('guestbook data', () => {
  it('signs anonymous notes', () => {
    expect(signature('')).toBe('— a passing sailor');
    expect(signature('Ana')).toBe('— Ana');
  });

  it('only holds notes that pass the same checks', () => {
    for (const e of guestbook) {
      expect(checkGuestbook(e).ok).toBe(true);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
