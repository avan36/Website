import { describe, expect, it } from 'vitest';
import { COUNTDOWN_START, DECOYS, TRICKS, countBy, flag, gpcState, isComplete, mmss, progressText, tick, total, verdict } from '../darkPatterns';

describe('tricks', () => {
  it('has unique ids across tricks and decoys', () => {
    const ids = [...TRICKS.map((t) => t.id), ...DECOYS.map((d) => d.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(total).toBe(TRICKS.length);
    expect(countBy('covers') + countBy('partly') + countBy('no')).toBe(total);
  });

  it('flags tricks once, without mutating the old set', () => {
    const start = new Set<string>();
    const a = flag(start, 'prechecked');
    expect(a.result.kind).toBe('found');
    expect(start.size).toBe(0);
    expect(a.found.has('prechecked')).toBe(true);
    const b = flag(a.found, 'prechecked');
    expect(b.result.kind).toBe('again');
    expect(b.found.size).toBe(1);
  });

  it('treats decoys and unknown spots as misses', () => {
    const d = flag(new Set(), 'email');
    expect(d.result.kind).toBe('decoy');
    expect(d.found.size).toBe(0);
    expect(flag(new Set(), 'zzz').result.kind).toBe('unknown');
  });

  it('knows when every trick is found', () => {
    let found = new Set<string>();
    for (const t of TRICKS) {
      expect(isComplete(found)).toBe(false);
      found = flag(found, t.id).found;
    }
    expect(isComplete(found)).toBe(true);
    expect(progressText(found)).toBe(`${total} of ${total} found`);
    expect(verdict(total)).toMatch(/Every/);
    expect(verdict(0)).toBeTruthy();
  });
});

describe('fake countdown', () => {
  it('counts down and quietly resets', () => {
    expect(tick(10)).toBe(9);
    expect(tick(0)).toBe(COUNTDOWN_START);
    expect(mmss(COUNTDOWN_START)).toBe('04:59');
    expect(mmss(7)).toBe('00:07');
  });
});

describe('gpcState', () => {
  it('reads navigator.globalPrivacyControl', () => {
    expect(gpcState({ globalPrivacyControl: true })).toBe('on');
    expect(gpcState({ globalPrivacyControl: false })).toBe('off');
    expect(gpcState({})).toBe('unsupported');
    expect(gpcState(undefined)).toBe('unsupported');
  });
});
