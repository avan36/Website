// Blocks into DOM. The engine says what to show; this decides how it looks:
// colored place names, commands you can click, the word card, the map. Built
// with createElement, never innerHTML, so nothing the world says is markup.

import { DIR_ARROWS, DIR_NAMES, DIRS } from './parser';
import { GROUND } from './map';
import type { Block, Span } from './output';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c || c === '') el.append(c);
  return el;
}

/** A command you can click: types it for you. */
export const cmdButton = (text: string, command: string, extra = '') => h('button', { type: 'button', class: `tx-cmd ${extra}`.trim(), 'data-cmd': command }, text);

function span(s: Span): Node {
  if (typeof s === 'string') return document.createTextNode(s);
  const style: Record<string, string> = s.color ? { '--c': s.color } : {};
  const tone = s.tone ? ` is-${s.tone}` : '';
  if (s.href) {
    const external = /^https?:/.test(s.href);
    return h('a', { href: s.href, class: `tx-link${tone}`, ...style, ...(external ? { target: '_blank', rel: 'noopener' } : {}) }, s.text);
  }
  if (s.cmd) {
    const b = cmdButton(s.text, s.cmd, `${s.color ? 'is-place' : ''}${tone}`);
    if (s.color) b.style.setProperty('--c', s.color);
    return b;
  }
  return h('span', { class: `tx-span${tone}${s.color ? ' is-place' : ''}`, ...style }, s.text);
}

/**
 * Spans in order. A command is a button, and a line may break after a button,
 * so punctuation right after one is kept with it ("REEL," never wraps the comma).
 */
function spans(xs: Span[]): Node[] {
  const out: Node[] = [];
  let glued = 0; // characters at the start of this string already kept with the command before it
  xs.forEach((s, i) => {
    if (typeof s === 'string') {
      const rest = s.slice(glued);
      glued = 0;
      if (rest) out.push(document.createTextNode(rest));
      return;
    }
    const next = xs[i + 1];
    const glue = (s.cmd || s.href) && typeof next === 'string' ? (/^[.,;:!?)’”]+/.exec(next)?.[0] ?? '') : '';
    out.push(glue ? h('span', { class: 'tx-glue' }, span(s), glue) : span(s));
    glued = glue.length;
  });
  return out;
}

/** "·····━━━━━━·····": a word's life on a line from 500 to now. */
function lifeline(first: number, died: number, width = 28) {
  const from = 500;
  const to = new Date().getFullYear();
  const at = (y: number) => Math.round(((y - from) / (to - from)) * (width - 1));
  const a = at(first);
  const b = Math.max(a, at(died));
  return Array.from({ length: width }, (_, i) => (i >= a && i <= b ? '━' : '·')).join('');
}

const DIR_OF_NAME = new Map(DIRS.map((d) => [DIR_NAMES[d], d]));

/** Which colour class a map character gets. */
const GROUND_CLASS: Record<string, string> = {
  [GROUND.sea]: 'sea',
  [GROUND.sand]: 'sand',
  [GROUND.grass]: 'grass',
  [GROUND.rock]: 'rock',
  [GROUND.path]: 'path',
  [GROUND.pier]: 'pier',
};

function mapPre(rows: string[], places: Map<string, string>): HTMLElement {
  const pre = h('pre', { class: 'tx-map__grid', 'aria-hidden': 'true' });
  for (const row of rows) {
    // Runs of the same kind of ground share one span: a few hundred nodes, not 1,344.
    let run = '';
    let kind = '';
    const flush = () => {
      if (!run) return;
      const color = places.get(run[0]);
      const el = h('span', { class: `g-${kind}` }, run);
      if (color) el.style.setProperty('--c', color);
      pre.append(el);
      run = '';
    };
    for (const ch of row) {
      const k = ch === GROUND.you ? 'you' : places.has(ch) ? 'place' : (GROUND_CLASS[ch] ?? 'blank');
      if (k !== kind || k === 'place' || k === 'you') flush(), (kind = k);
      run += ch;
    }
    flush();
    pre.append('\n');
  }
  return pre;
}

export function renderBlock(b: Block): HTMLElement {
  switch (b.kind) {
    case 'banner':
      return h('header', { class: 'tx-banner', 'data-reveal': '' }, h('h2', { class: 'tx-banner__title' }, b.title), ...b.lines.map((l) => h('p', { class: 'tx-banner__line' }, l)));
    case 'title':
      return h('h3', { class: 'tx-title', '--c': b.color }, h('span', { class: 'tx-title__mark', 'aria-hidden': 'true' }, '◆ '), b.text, b.sub ? h('span', { class: 'tx-title__sub' }, ` · ${b.sub}`) : null);
    case 'p':
      return h('p', { class: `tx-p${b.tone ? ` is-${b.tone}` : ''}` }, ...spans(b.spans));
    case 'exits':
      return h(
        'div',
        { class: 'tx-exits', role: 'list', 'aria-label': 'Exits' },
        ...b.exits.map((e) => {
          const d = e.dir ? DIR_OF_NAME.get(e.dir) : undefined;
          const names: Node[] = [];
          e.places.forEach((pl, i) => {
            if (i) names.push(document.createTextNode(i === e.places.length - 1 ? ' or ' : ', '));
            const b = cmdButton(pl.ref, pl.cmd, 'is-place');
            b.style.setProperty('--c', pl.color);
            names.push(b);
          });
          return h(
            'div',
            { class: 'tx-exits__row', role: 'listitem' },
            h('span', { class: 'tx-exits__dir' }, h('span', { class: 'tx-exits__arrow', 'aria-hidden': 'true' }, d ? `${DIR_ARROWS[d]} ` : '· '), cmdButton(e.dir ?? 'go', e.cmd, 'is-dir')),
            h('span', { class: 'tx-exits__to' }, ...names),
          );
        }),
      );
    case 'list':
      return h(
        'div',
        { class: 'tx-list' },
        b.title ? h('p', { class: 'tx-list__title' }, b.title) : null,
        h(
          'dl',
          { class: 'tx-list__items' },
          ...b.items.flatMap((it) => [h('dt', it.color ? { '--c': it.color } : {}, ...spans(it.label)), h('dd', {}, ...(it.text ? spans(it.text) : []))]),
        ),
      );
    case 'word':
      return h(
        'article',
        { class: 'tx-card tx-word', '--c': b.color, 'data-reveal': '', 'aria-label': `Lost word: ${b.word}` },
        h('p', { class: 'tx-card__kicker' }, `Lost word · ${b.where}`),
        h('p', { class: 'tx-word__word', lang: 'en' }, b.word),
        h('p', { class: 'tx-word__gloss' }, b.gloss),
        h('p', { class: 'tx-word__life' }, `${b.first} `, h('span', { class: 'tx-word__bar', 'aria-hidden': 'true' }, lifeline(b.first, b.died)), ` ${b.died}`),
        h('p', { class: 'tx-word__story' }, b.story),
        h('p', { class: 'tx-card__foot' }, `${b.count} of ${b.total} found`),
      );
    case 'catch':
      return h(
        'article',
        { class: 'tx-card tx-catch', '--c': '#2b8fb8', 'data-reveal': '', 'aria-label': `Caught: ${b.title}` },
        h('p', { class: 'tx-card__kicker' }, h('span', { class: 'tx-catch__fish', 'aria-hidden': 'true' }, "><(((º>  "), b.fresh ? 'Caught off the pier' : 'Caught again'),
        h('p', { class: 'tx-catch__title' }, h('a', { href: b.href, class: 'tx-link' }, b.title)),
        h('p', { class: 'tx-catch__date' }, b.date),
        h('p', { class: 'tx-catch__desc' }, b.description),
        h('p', { class: 'tx-card__foot' }, h('a', { href: b.href, class: 'tx-link is-key' }, 'Read it →'), `   ${b.count} of ${b.total} caught`),
      );
    case 'map': {
      const places = new Map(b.legend.map((l) => [l.glyph, l.color]));
      return h(
        'figure',
        { class: 'tx-map', 'data-reveal': '' },
        mapPre(b.rows, places),
        h('figcaption', { class: 'visually-hidden' }, b.summary),
        h(
          'div',
          { class: 'tx-map__legend', 'aria-hidden': 'true' },
          ...b.legend.map((l) => {
            const btn = cmdButton(l.title, l.cmd, `is-place${l.here ? ' is-here' : ''}`);
            btn.style.setProperty('--c', l.color);
            btn.tabIndex = -1;
            return h('span', { class: 'tx-map__entry' }, h('b', { class: 'tx-map__glyph', '--c': l.color }, l.glyph), ' ', btn);
          }),
        ),
        h('p', { class: 'tx-map__key', 'aria-hidden': 'true' }, ...b.key.flatMap(([g, name]) => [h('span', { class: `g-${g === GROUND.you ? 'you' : GROUND_CLASS[g]}` }, g), ` ${name}   `])),
      );
    }
  }
}

/** One turn: what you typed (if anything), then what came back. */
export function renderTurn(command: string | null, blocks: Block[]): HTMLElement {
  const turn = h('section', { class: 'tx-turn' });
  if (command !== null) turn.append(h('p', { class: 'tx-echo', 'aria-hidden': 'true' }, h('span', { class: 'tx-echo__prompt' }, '› '), command));
  const body = h('div', { class: 'tx-turn__body' });
  for (const b of blocks) body.append(renderBlock(b));
  turn.append(body);
  return turn;
}
