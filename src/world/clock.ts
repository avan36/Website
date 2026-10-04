// Island time: the island keeps the clock of the place it was made in, so a
// visitor sees it the way it is right now there: morning light, dusk, the
// windows lit after dark, the commuter train running at rush hour. Pure
// functions of a Date (no DOM, no state), so they're tested without a browser.
//
// Wall-clock time (for the timetable) comes from Intl in the island's time
// zone, which handles daylight saving. Daylight comes from the sun itself:
// its elevation at the island's latitude and longitude for that instant,
// which already knows nothing about clocks changing.

const TIME_ZONE = 'America/Los_Angeles';
/** Where the sun is worked out from, in degrees. */
const LATITUDE = 37.5;
const LONGITUDE = -122.2;

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface IslandTime {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
  /** Hours since midnight, with the minutes as a fraction (e.g. 7.5 is 7:30). */
  hours: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let fmt: Intl.DateTimeFormat | null = null;

/** The wall-clock time on the island at a given instant. */
export function islandTime(date: Date): IslandTime {
  fmt ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    hour,
    minute,
    hours: hour + minute / 60 + second / 3600,
  };
}

/** How far the island's clock is ahead of UTC at an instant, in minutes (negative: behind). */
function offsetMinutes(date: Date) {
  const t = islandTime(date);
  const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, date.getUTCSeconds());
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant it is `hour:minute` on the island, on the island's date at
 * `base`. For the debug override (`?time=22:00`): "today at ten, island time".
 */
export function atIslandTime(hour: number, minute: number, base = new Date()): Date {
  const t = islandTime(base);
  const wall = Date.UTC(t.year, t.month - 1, t.day, hour, minute);
  // Guess with today's offset, then correct once in case the clocks change in between.
  let d = new Date(wall - offsetMinutes(base) * 60000);
  d = new Date(wall - offsetMinutes(d) * 60000);
  return d;
}

/** Parse "22:00", "7:30" or "7" into an instant today, island time. Null if it isn't a time. */
export function parseIslandTime(text: string | null | undefined, base = new Date()): Date | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(text ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return atIslandTime(h, min, base);
}

/** The sun's height above the horizon on the island at an instant, in degrees. */
export function sunElevation(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - start) / 86400000; // fractional, from 0
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  // Local solar time: UTC shifted by longitude (four minutes a degree).
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solar = utcHours + LONGITUDE / 15;
  const hourAngle = 15 * (solar - 12);
  const s = Math.sin(LATITUDE * DEG) * Math.sin(declination * DEG) + Math.cos(LATITUDE * DEG) * Math.cos(declination * DEG) * Math.cos(hourAngle * DEG);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

/**
 * How light it is, 0 (night) to 1 (day), easing through dawn and dusk: dark
 * once the sun is 7° below the horizon (past civil twilight), full day once
 * it's 5° above.
 */
export function daylight(date: Date): number {
  return smoothstep(-7, 5, sunElevation(date));
}

/** Rush hour: weekday mornings 6:30 to 9:30 and evenings 16:00 to 19:30, island time. */
export function commuteHours(date: Date): boolean {
  const t = islandTime(date);
  if (t.weekday === 0 || t.weekday === 6) return false;
  return (t.hours >= 6.5 && t.hours < 9.5) || (t.hours >= 16 && t.hours < 19.5);
}

/** "7:05 pm", the island's time for people. */
export function formatIslandTime(date: Date): string {
  const t = islandTime(date);
  const h12 = t.hour % 12 || 12;
  return `${h12}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'am' : 'pm'}`;
}
