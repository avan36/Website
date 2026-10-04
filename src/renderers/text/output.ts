// What the engine says, as data. The engine never writes HTML: it returns
// blocks (a place heading, a paragraph, the exits, a found word, the map) and
// effects (go into a place, record a find, cast a line), and the page decides
// how they look and what they do. Tests read the blocks back as plain text.

import type { SoundName, ViewId } from '../types';

/** A run of text. A `cmd` makes it something you can click to type. */
export type Span = string | { text: string; cmd?: string; href?: string; color?: string; tone?: 'em' | 'key' | 'dim' };

export type ExitLine = {
  /** Compass name ("north-east"), or null for a way that has no direction. */
  dir: string | null;
  /** Usually one place; two or more when they lie the same way. */
  places: { id: string; ref: string; color: string; cmd: string }[];
  cmd: string;
};

export type ListItem = { label: Span[]; text?: Span[]; color?: string };

export type MapLegend = { glyph: string; title: string; color: string; cmd: string; here: boolean };

export type Block =
  | { kind: 'banner'; title: string; lines: string[] }
  | { kind: 'title'; text: string; color: string; sub?: string }
  | { kind: 'p'; spans: Span[]; tone?: 'dim' | 'flavour' | 'alert' }
  | { kind: 'exits'; exits: ExitLine[] }
  | { kind: 'list'; title?: string; items: ListItem[] }
  | { kind: 'word'; word: string; gloss: string; first: number; died: number; story: string; color: string; where: string; count: number; total: number }
  | { kind: 'catch'; title: string; date: string; description: string; href: string; fresh: boolean; count: number; total: number }
  | { kind: 'map'; rows: string[]; legend: MapLegend[]; key: [string, string][]; summary: string };

/** A timer the page sets on the engine's behalf; when it fires, it calls engine.signal(). */
export type Signal = { name: 'bite' | 'escape'; cast: number };

export type Effect =
  | { type: 'move'; place: string }
  | { type: 'go'; place: string }
  | { type: 'open'; href: string }
  | { type: 'find'; id: string }
  | { type: 'fish' }
  | { type: 'view'; id: ViewId }
  | { type: 'night'; on: boolean }
  | { type: 'clear' }
  | { type: 'timer'; ms: number; signal: Signal }
  | { type: 'sound'; name: SoundName };

// ---------- Building blocks ----------

export const p = (...spans: Span[]): Block => ({ kind: 'p', spans });
export const dim = (...spans: Span[]): Block => ({ kind: 'p', spans, tone: 'dim' });
export const cmd = (text: string, command = text.toLowerCase()): Span => ({ text, cmd: command });

/**
 * The engine's own copy, with a little markup: [LOOK] is a command you can
 * click, [the library](go to library) one with its own text, *this* is
 * emphasis. Only for strings the engine wrote; world prose goes in as is.
 */
export function md(s: string): Span[] {
  const out: Span[] = [];
  const re = /\[([^\]]+)\](?:\(([^)]+)\))?|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[3]) out.push({ text: m[3], tone: 'em' });
    else out.push({ text: m[1], cmd: (m[2] ?? m[1]).toLowerCase() });
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export const say = (s: string): Block => ({ kind: 'p', spans: md(s) });

export const spanText = (s: Span) => (typeof s === 'string' ? s : s.text);

/** Everything a list of blocks says, as plain text (for tests, and screen readers). */
export function plain(blocks: Block[]): string {
  const spans = (xs: Span[]) => xs.map(spanText).join('');
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'banner':
          return [b.title, ...b.lines].join('\n');
        case 'title':
          return b.sub ? `${b.text} (${b.sub})` : b.text;
        case 'p':
          return spans(b.spans);
        case 'exits':
          return b.exits.map((e) => `${e.dir ?? 'Also'}: ${e.places.map((x) => x.ref).join(' or ')}`).join('\n');
        case 'list':
          return [b.title ?? '', ...b.items.map((i) => [spans(i.label), i.text ? spans(i.text) : ''].filter(Boolean).join('  '))].filter(Boolean).join('\n');
        case 'word':
          return `${b.word}: ${b.gloss} (${b.first} to ${b.died}). ${b.story}`;
        case 'catch':
          return `${b.title}, ${b.date}. ${b.description}`;
        case 'map':
          return [...b.rows, ...b.legend.map((l) => `${l.glyph} ${l.title}`), ...b.key.map(([g, n]) => `${g} ${n}`)].join('\n');
      }
    })
    .join('\n');
}
