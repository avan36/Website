import { describe, expect, it } from 'vitest';
import { atIslandTime, commuteHours, dayPart, daylight, formatIslandTime, islandTime, pageClock, parseIslandTime, sunElevation, timeLine } from '../clock';

// Instants are written in UTC; the island runs 8 hours behind in winter and 7 in summer.
const utc = (s: string) => new Date(`${s}Z`);

describe('island time', () => {
  it('reads the wall clock in the island time zone', () => {
    const t = islandTime(utc('2026-01-15T20:30:00')); // winter: UTC-8
    expect([t.hour, t.minute, t.weekday]).toEqual([12, 30, 4]); // Thursday
    expect(t.hours).toBeCloseTo(12.5);
  });

  it('follows daylight saving', () => {
    expect(islandTime(utc('2026-07-15T20:30:00')).hour).toBe(13); // summer: UTC-7
    // The spring-forward night: 1:59 is followed by 3:00.
    expect(islandTime(utc('2026-03-08T09:59:00')).hour).toBe(1);
    expect(islandTime(utc('2026-03-08T10:00:00')).hour).toBe(3);
  });

  it('rolls the date over at the island midnight, not UTC midnight', () => {
    const t = islandTime(utc('2026-01-16T03:00:00')); // still the evening of the 15th
    expect([t.day, t.hour]).toEqual([15, 19]);
  });

  it('turns a wall time back into an instant, either side of a clock change', () => {
    const winter = atIslandTime(22, 0, utc('2026-01-15T20:00:00'));
    expect(winter.toISOString()).toBe('2026-01-16T06:00:00.000Z');
    const summer = atIslandTime(22, 0, utc('2026-07-15T20:00:00'));
    expect(summer.toISOString()).toBe('2026-07-16T05:00:00.000Z');
    const t = islandTime(atIslandTime(7, 45, utc('2026-10-04T18:00:00')));
    expect([t.hour, t.minute, t.day]).toEqual([7, 45, 4]);
  });

  it('parses the debug override', () => {
    const base = utc('2026-01-15T20:00:00');
    expect(islandTime(parseIslandTime('22:00', base)!).hour).toBe(22);
    expect(islandTime(parseIslandTime('7', base)!).hour).toBe(7);
    expect(parseIslandTime('25:00', base)).toBeNull();
    expect(parseIslandTime('noon', base)).toBeNull();
    expect(parseIslandTime(null, base)).toBeNull();
  });

  it('formats for people', () => {
    expect(formatIslandTime(utc('2026-01-16T06:05:00'))).toBe('10:05 pm');
    expect(formatIslandTime(utc('2026-01-15T08:00:00'))).toBe('12:00 am');
  });
});

describe('daylight', () => {
  const at = (h: number, m = 0, base = '2026-06-21T20:00:00') => atIslandTime(h, m, utc(base));

  it('is full day at noon and full night at midnight, summer and winter', () => {
    for (const base of ['2026-06-21T20:00:00', '2026-12-21T20:00:00']) {
      expect(daylight(at(12, 30, base)), base).toBe(1);
      expect(daylight(at(0, 30, base)), base).toBe(0);
    }
  });

  it('puts the sun high at midsummer noon and low at midwinter noon', () => {
    expect(sunElevation(at(13, 10))).toBeGreaterThan(70);
    expect(sunElevation(at(12, 10, '2026-12-21T20:00:00'))).toBeLessThan(32);
  });

  it('eases through dusk instead of switching', () => {
    let prev = 1;
    const seen: number[] = [];
    for (let m = 0; m <= 180; m += 10) {
      const d = daylight(new Date(at(19, 0).getTime() + m * 60000));
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
      seen.push(d);
    }
    expect(seen.some((d) => d > 0.1 && d < 0.9)).toBe(true);
    expect(seen[0]).toBeGreaterThan(0.9); // 7 pm at midsummer: still light
    expect(seen[seen.length - 1]).toBe(0); // 10 pm: dark
  });

  it('gets dark earlier in winter', () => {
    const base = '2026-12-21T20:00:00';
    expect(daylight(at(18, 0, base))).toBe(0);
    expect(daylight(at(18, 0))).toBe(1);
  });
});

describe('commute hours', () => {
  const on = (h: number, m: number, base: string) => commuteHours(atIslandTime(h, m, utc(base)));
  const weekday = '2026-10-07T19:00:00'; // a Wednesday
  const saturday = '2026-10-10T19:00:00';

  it('runs on weekday mornings and evenings', () => {
    expect(on(6, 30, weekday)).toBe(true);
    expect(on(8, 15, weekday)).toBe(true);
    expect(on(17, 45, weekday)).toBe(true);
    expect(on(19, 29, weekday)).toBe(true);
  });

  it('rests in the middle of the day, at night and at weekends', () => {
    expect(on(6, 29, weekday)).toBe(false);
    expect(on(9, 30, weekday)).toBe(false);
    expect(on(12, 0, weekday)).toBe(false);
    expect(on(19, 30, weekday)).toBe(false);
    expect(on(23, 0, weekday)).toBe(false);
    expect(on(8, 0, saturday)).toBe(false);
    expect(on(17, 0, '2026-10-11T19:00:00')).toBe(false); // Sunday
  });
});

describe('the page clock', () => {
  const now = () => utc('2026-10-07T19:00:00').getTime(); // Wednesday, noon on the island

  it('is the real time without an override', () => {
    const c = pageClock('', now);
    expect(c.overridden).toBe(false);
    expect(c.date().getTime()).toBe(now());
  });

  it('jumps to ?time= and runs on from there', () => {
    let t = now();
    const c = pageClock('?time=22:00', () => t);
    expect(c.overridden).toBe(true);
    expect(islandTime(c.date()).hour).toBe(22);
    expect(daylight(c.date())).toBe(0);
    t += 30 * 60000;
    expect(islandTime(c.date()).minute).toBe(30);
  });

  it('runs the train at rush hour, or as ?commute= says', () => {
    expect(pageClock('?time=08:00', now).commute(pageClock('?time=08:00', now).date())).toBe(true);
    expect(pageClock('?time=12:00', now).commute(pageClock('?time=12:00', now).date())).toBe(false);
    const forced = pageClock('?time=12:00&commute=on', now);
    expect(forced.commute(forced.date())).toBe(true);
    const off = pageClock('?time=08:00&commute=off', now);
    expect(off.commute(off.date())).toBe(false);
  });
});

describe('the time line on the home page', () => {
  it('names the part of the day from the sky, not just the clock', () => {
    // A January day: sunrise about 7:20, sunset about 5:10 (winter, UTC-8).
    expect(dayPart(utc('2026-01-15T11:00:00'))).toBe('small-hours'); // 3 am
    expect(dayPart(utc('2026-01-15T15:20:00'))).toBe('dawn'); // 7:20 am
    expect(dayPart(utc('2026-01-15T17:30:00'))).toBe('morning'); // 9:30 am
    expect(dayPart(utc('2026-01-15T22:00:00'))).toBe('afternoon'); // 2 pm
    expect(dayPart(utc('2026-01-16T01:15:00'))).toBe('dusk'); // 5:15 pm
    expect(dayPart(utc('2026-01-16T06:00:00'))).toBe('night'); // 10 pm
    // In July it's still light at 6 pm (summer, UTC-7).
    expect(dayPart(utc('2026-07-15T01:00:00'))).toBe('evening');
  });

  it('says the time, the sky, and whether the train is running', () => {
    const night = timeLine(utc('2026-01-16T06:26:00'), { commute: false, night: false });
    expect(night.part).toBe('night');
    expect(night.text).toBe("It's 10:26 pm on the island, Pacific time. Night has fallen: the lanterns are lit and the windows glow.");
    const rush = timeLine(utc('2026-01-15T16:30:00'), { commute: true, night: false });
    expect(rush.text).toMatch(/^It's 8:30 am on the island, Pacific time\. .* The Caltrain is running\.$/);
  });

  it('owns up when a full word hoard made it night in the daytime', () => {
    const t = timeLine(utc('2026-01-15T22:00:00'), { commute: false, night: true });
    expect(t.part).toBe('night');
    expect(t.text).toMatch(/2:00 pm .* every lost word/);
    // At night anyway, it just says night.
    expect(timeLine(utc('2026-01-16T06:00:00'), { commute: false, night: true }).text).toMatch(/Night has fallen/);
  });

  it('never uses an em dash', () => {
    for (const h of [1, 7, 9, 14, 17, 19, 22]) expect(timeLine(atIslandTime(h, 0, utc('2026-04-01T12:00:00')), { commute: true, night: false }).text).not.toContain('—');
  });
});
