// Sort the tree of life, in the games card: drag each living thing onto its
// branch of a pocket tree of life (or tap a card and then a branch, or press
// the branch's number). Every placement shows a fact from Map of Evolution
// (rules/evolutionSorterData.ts); the rules are rules/evolutionSorter.ts.
// Played on Root Isle; it used to live on the Map of Evolution page.

import { makeRng, randomSeed } from './rules/rng';
import { ROUND_SIZE, dealRound, feedback, isDone, place, startSort, tally, verdict, type SortState } from './rules/evolutionSorter';
import { BRANCHES, SPECIES, type BranchId, type Species } from './rules/evolutionSorterData';
import { el, styleOnce, type GameEnv, type Panel } from './round';
import { holdable } from '../hold';

/** Pixels of movement before a press becomes a drag. */
const DRAG_START = 6;

const STYLE = /* css */ `
.es { display: grid; gap: 12px; }
.es__how { font-size: 13.5px; color: var(--ink-3); }
.es__tray { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; min-height: 92px; }
.es__tray[hidden] { display: none; }
.es__card {
  display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 88px; padding: 10px 8px;
  border: 0; border-radius: 14px; background: var(--bg-raised); box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line-strong);
  color: var(--ink); font: inherit; font-weight: 650; text-align: center; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  transition: box-shadow var(--dur-2), transform var(--dur-2) var(--ease-spring), opacity var(--dur-2);
}
.es__card .e { font-size: 1.9rem; line-height: 1; }
.es__card .n { font-size: 13.5px; line-height: 1.2; overflow-wrap: anywhere; }
@media (hover: hover) { .es__card:hover { box-shadow: var(--shadow-1), inset 0 0 0 2px color-mix(in oklab, var(--c) 60%, transparent); } }
.es__card:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.es__card[aria-pressed='true'] { box-shadow: 0 8px 22px -10px color-mix(in oklab, var(--c) 80%, transparent), inset 0 0 0 2.5px var(--c); transform: translateY(-3px); }
.es__card.is-lifted { opacity: 0.35; }
.es__card.is-new { animation: es-pop 420ms var(--ease-spring) both; }
.es__ghost { position: fixed; left: 0; top: 0; z-index: 1000; margin: 0; pointer-events: none; cursor: grabbing; box-shadow: var(--shadow-3), inset 0 0 0 2.5px var(--c) !important; rotate: -3deg; }
.es__feedback { min-height: 4.6em; padding: 10px 14px; border-radius: 14px; background: color-mix(in oklab, var(--bg-raised) 70%, transparent); box-shadow: inset 0 0 0 1px var(--line); }
.es__line { font-weight: 700; color: var(--ink); }
.es__line.is-right::before { content: '✓ '; color: color-mix(in oklab, var(--leaf) 65%, var(--ink)); }
.es__line.is-wrong::before { content: '✗ '; color: color-mix(in oklab, var(--coral) 75%, var(--ink)); }
.es__fact { margin-top: 4px; font-family: var(--font-read); font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
.es__fact:empty { display: none; }
.es__branches { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.es__branch {
  position: relative; width: 100%; height: 100%; display: grid; justify-items: center; align-content: start; gap: 2px; min-height: 92px; padding: 9px 4px 8px;
  border: 0; border-radius: 14px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink); font: inherit; cursor: pointer;
  transition: box-shadow var(--dur-2), background var(--dur-2), transform var(--dur-2) var(--ease-spring);
}
@media (hover: hover) { .es__branch:hover { box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--c) 60%, transparent); } }
.es__branch:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.es__branch.is-armed { box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--c) 45%, transparent); }
.es__branch.is-over { background: color-mix(in oklab, var(--c) 14%, var(--bg-raised)); box-shadow: inset 0 0 0 2.5px var(--c); transform: scale(1.04); }
.es__branch.is-good { animation: es-good 700ms var(--ease-out); }
.es__branch.is-bad { animation: es-bad 420ms var(--ease-out); }
.es__key { position: absolute; top: 6px; left: 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink-3); }
html.isl-touch .es__key { display: none; }
.es__bemoji { font-size: 1.6rem; line-height: 1.1; }
.es__blabel { max-width: 100%; font-size: 13px; font-weight: 700; line-height: 1.15; text-wrap: balance; }
.es__count { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); min-height: 1.2em; }
.es__placed { display: flex; flex-wrap: wrap; justify-content: center; gap: 1px; font-size: 1.05rem; line-height: 1.2; }
.es__placed .miss { opacity: 0.85; border-radius: 6px; box-shadow: 0 0 0 1.5px var(--coral); }
.es__misses { display: grid; gap: 6px; margin: 4px 0 0; padding: 12px 14px; list-style: none; border-radius: 14px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line); font-size: 14.5px; color: var(--ink-2); }
.es__misses[hidden] { display: none; }
.es__misses b { color: var(--ink); }
@keyframes es-pop { from { opacity: 0; transform: scale(0.85); } }
@keyframes es-good { 0% { box-shadow: inset 0 0 0 2.5px var(--leaf), 0 0 0 0 color-mix(in oklab, var(--leaf) 50%, transparent); } 100% { box-shadow: inset 0 0 0 1px var(--line-strong), 0 0 0 14px transparent; } }
@keyframes es-bad { 0%, 100% { transform: none; } 20%, 60% { transform: translateX(-5px); box-shadow: inset 0 0 0 2.5px var(--coral); } 40%, 80% { transform: translateX(5px); box-shadow: inset 0 0 0 2.5px var(--coral); } }
@media (max-width: 520px) {
  .es__tray { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .es__card { min-height: 76px; }
  .es__branch { min-height: 84px; }
  .es__blabel { font-size: 12.5px; }
}
@media (prefers-reduced-motion: reduce) {
  .es__card, .es__branch { transition: none; }
  .es__card.is-new, .es__branch.is-good, .es__branch.is-bad { animation: none; }
  .es__card[aria-pressed='true'], .es__branch.is-over { transform: none; }
  .es__ghost { rotate: none; }
}
`;

const label = (id: BranchId) => BRANCHES.find((b) => b.id === id)?.label ?? id;

export function startEvolution(host: HTMLElement, env: GameEnv): Panel {
  styleOnce('evolution', STYLE);
  const motion = !env.reducedMotion;
  const root = el('div', 'es');
  const how = el('p', 'es__how', env.touch ? 'Drag a card onto its branch, or tap the card and then the branch.' : 'Drag a card onto its branch, or pick a card and press its branch’s number.');
  const tray = el('div', 'es__tray');
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', 'Living things to sort');
  const fb = el('div', 'es__feedback');
  fb.setAttribute('aria-live', 'polite');
  const line = el('p', 'es__line', 'Where does each one belong on the tree?');
  const fact = el('p', 'es__fact');
  fb.append(line, fact);
  const list = el('ul', 'es__branches');
  list.setAttribute('aria-label', 'Branches of the tree of life');
  const selectedNote = el('p', 'visually-hidden');
  selectedNote.id = `es-selected-${Math.random().toString(36).slice(2, 8)}`;
  const targets = BRANCHES.map((b, i) => {
    const li = el('li');
    const t = el('button', 'es__branch');
    t.type = 'button';
    t.dataset.branch = b.id;
    t.title = b.blurb;
    t.setAttribute('aria-describedby', selectedNote.id);
    const k = el('span', 'es__key', String(i + 1));
    k.setAttribute('aria-hidden', 'true');
    const e = el('span', 'es__bemoji', b.emoji);
    e.setAttribute('aria-hidden', 'true');
    const count = el('span', 'es__count');
    count.setAttribute('aria-hidden', 'true');
    const placed = el('span', 'es__placed');
    placed.setAttribute('aria-hidden', 'true');
    t.append(k, e, el('span', 'es__blabel', b.label), count, placed);
    li.append(t);
    list.append(li);
    return t;
  });
  const misses = el('ul', 'es__misses');
  misses.hidden = true;
  root.append(how, tray, fb, list, selectedNote, misses);
  host.append(root);
  const targetOf = (id: BranchId) => targets.find((t) => t.dataset.branch === id)!;
  const dialog = host.closest('dialog') ?? document.body;

  let state: SortState = startSort(dealRound(SPECIES, makeRng(randomSeed())));
  let selected: string | null = state.tray[0]?.id ?? null;
  let over = false;

  // ---------- Drawing ----------
  function card(s: Species, fresh: boolean) {
    const b = el('button', `es__card${fresh && motion ? ' is-new' : ''}`);
    b.type = 'button';
    b.dataset.id = s.id;
    b.setAttribute('aria-pressed', String(s.id === selected));
    const e = el('span', 'e', s.emoji);
    e.setAttribute('aria-hidden', 'true');
    b.append(e, el('span', 'n', s.name));
    b.addEventListener('animationend', () => b.classList.remove('is-new'), { once: true });
    return b;
  }
  function renderTray(freshId?: string) {
    const have = new Map([...tray.querySelectorAll<HTMLButtonElement>('.es__card')].map((c) => [c.dataset.id!, c]));
    tray.replaceChildren(...state.tray.map((s) => have.get(s.id) ?? card(s, s.id === freshId)));
    sync();
  }
  function sync() {
    tray.querySelectorAll<HTMLButtonElement>('.es__card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === selected)));
    const s = state.tray.find((x) => x.id === selected);
    selectedNote.textContent = s ? `Selected: ${s.name}.` : 'Pick a card first.';
    targets.forEach((t) => t.classList.toggle('is-armed', !!s && !over));
  }
  function renderCounts() {
    for (const t of targets) {
      const id = t.dataset.branch as BranchId;
      const here = state.placed.filter((p) => p.species.branch === id);
      t.querySelector('.es__placed')!.replaceChildren(
        ...here.map((p) => {
          const s = el('span', p.correct ? '' : 'miss', p.species.emoji);
          s.title = p.correct ? p.species.name : `${p.species.name} (you said ${label(p.chosen)})`;
          return s;
        }),
      );
      t.querySelector('.es__count')!.textContent = here.length ? String(here.length) : '';
      t.setAttribute('aria-label', `${label(id)}${here.length ? `, ${here.length} placed: ${here.map((p) => p.species.name).join(', ')}` : ''}`);
    }
  }
  const select = (id: string | null) => {
    selected = id;
    sync();
  };

  // ---------- Placing ----------
  function flyTo(from: DOMRect, to: HTMLElement, src: HTMLElement) {
    if (!motion) return;
    const end = to.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.className = 'es__card es__ghost';
    ghost.removeAttribute('aria-pressed');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { width: `${from.width}px`, height: `${from.height}px` });
    ghost.style.setProperty('--c', getComputedStyle(host).getPropertyValue('--c'));
    // Inside the dialog, so it flies over the card (the page under a modal is behind it).
    dialog.append(ghost);
    const dx = end.left + end.width / 2 - from.width / 2;
    const dy = end.top + end.height / 2 - from.height / 2;
    ghost
      .animate(
        [
          { transform: `translate(${from.left}px, ${from.top}px) scale(1)`, opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
      )
      .finished.finally(() => ghost.remove());
  }
  function bump(t: HTMLElement, cls: 'is-good' | 'is-bad') {
    if (!motion) return;
    t.classList.remove('is-good', 'is-bad');
    void t.offsetWidth; // restart the animation
    t.classList.add(cls);
    t.addEventListener('animationend', () => t.classList.remove(cls), { once: true });
  }

  function placeOn(branch: BranchId, speciesId = selected, fromRect?: DOMRect) {
    if (over) return;
    if (!speciesId) {
      line.className = 'es__line';
      line.textContent = 'Pick a card first, then its branch.';
      fact.textContent = '';
      return;
    }
    const cardEl = tray.querySelector<HTMLElement>(`[data-id="${CSS.escape(speciesId)}"]`);
    const slot = state.tray.findIndex((s) => s.id === speciesId);
    const r = place(state, speciesId, branch);
    if (!r) return;
    state = r.state;
    const p = r.placement;
    const home = targetOf(p.species.branch);
    if (cardEl) flyTo(fromRect ?? cardEl.getBoundingClientRect(), home, cardEl);
    if (p.correct) bump(home, 'is-good');
    else {
      bump(targetOf(branch), 'is-bad');
      window.setTimeout(() => bump(home, 'is-good'), 300);
    }
    env.sound(p.correct ? 'perfect' : 'miss');
    line.className = `es__line ${p.correct ? 'is-right' : 'is-wrong'}`;
    line.textContent = feedback(p, BRANCHES);
    fact.textContent = `${p.species.what} ${p.species.fact}`;
    // The card that slid into this slot is up next.
    const next = state.tray[Math.min(slot, state.tray.length - 1)];
    selected = next ? next.id : null;
    renderTray(state.tray[slot]?.id);
    renderCounts();
    if (isDone(state)) {
      over = true;
      sync();
    } else if (next && !host.inert) tray.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus({ preventScroll: true });
  }

  // ---------- Clicks and keys ----------
  let suppressClick = false;
  tray.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.es__card');
    if (!c || suppressClick) return;
    select(c.dataset.id!);
    env.sound('tap');
  });
  targets.forEach((t) => t.addEventListener('click', () => placeOn(t.dataset.branch as BranchId)));

  // ---------- Dragging (mouse, pen and touch) ----------
  type Drag = { id: string; pointer: number; x0: number; y0: number; dx: number; dy: number; card: HTMLElement; ghost?: HTMLElement; over?: HTMLElement | null; w: number; h: number };
  let drag: Drag | null = null;
  const hit = (x: number, y: number) => {
    const t = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-branch]');
    return t && root.contains(t) ? t : null;
  };
  const setOver = (t: HTMLElement | null) => {
    if (drag?.over === t) return;
    drag?.over?.classList.remove('is-over');
    t?.classList.add('is-over');
    if (drag) drag.over = t;
  };
  // A card held to drag doesn't open a menu or select its name (a tap still clicks).
  holdable(tray);
  tray.addEventListener('pointerdown', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.es__card');
    if (!c || e.button !== 0 || drag || over) return;
    const r = c.getBoundingClientRect();
    drag = { id: c.dataset.id!, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, card: c, w: r.width, h: r.height };
    c.setPointerCapture(e.pointerId);
  });
  // Near the top or bottom of the card, scroll it so far-off branches come into reach (phones).
  let lastX = 0;
  let lastY = 0;
  let scrollRaf = 0;
  const EDGE = 72;
  const edgeScroll = () => {
    scrollRaf = 0;
    if (!drag?.ghost) return;
    const v = lastY < EDGE ? -(EDGE - lastY) : lastY > innerHeight - EDGE ? lastY - (innerHeight - EDGE) : 0;
    if (!v) return;
    (host.closest('dialog') ?? document.scrollingElement)?.scrollBy(0, Math.round(v / 4));
    setOver(hit(lastX, lastY));
    scrollRaf = requestAnimationFrame(edgeScroll);
  };
  tray.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START) return;
      const g = drag.card.cloneNode(true) as HTMLElement;
      g.className = 'es__card es__ghost';
      g.removeAttribute('aria-pressed');
      g.setAttribute('aria-hidden', 'true');
      Object.assign(g.style, { width: `${drag.w}px`, height: `${drag.h}px` });
      g.style.setProperty('--c', getComputedStyle(host).getPropertyValue('--c'));
      dialog.append(g);
      drag.ghost = g;
      drag.card.classList.add('is-lifted');
      select(drag.id);
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    lastX = e.clientX;
    lastY = e.clientY;
    setOver(hit(e.clientX, e.clientY));
    if (!scrollRaf) scrollRaf = requestAnimationFrame(edgeScroll);
  });
  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    d.card.classList.remove('is-lifted');
    d.over?.classList.remove('is-over');
    if (!d.ghost) return; // a plain tap: the click selects it
    suppressClick = true;
    window.setTimeout(() => (suppressClick = false), 0);
    const target = cancelled ? null : hit(e.clientX, e.clientY);
    const rect = d.ghost.getBoundingClientRect();
    if (target) {
      d.ghost.remove();
      placeOn(target.dataset.branch as BranchId, d.id, rect);
      return;
    }
    // Dropped nowhere: float back to the tray.
    const home = d.card.getBoundingClientRect();
    if (!motion) return d.ghost.remove();
    d.ghost
      .animate([{ transform: d.ghost.style.transform }, { transform: `translate(${home.left}px, ${home.top}px)` }], { duration: 260, easing: 'ease-out', fill: 'forwards' })
      .finished.finally(() => d.ghost!.remove());
  };
  tray.addEventListener('pointerup', (e) => endDrag(e, false));
  tray.addEventListener('pointercancel', (e) => endDrag(e, true));

  renderTray();
  renderCounts();

  return {
    get score() {
      return tally(state.placed).correct;
    },
    get over() {
      return over;
    },
    hud: () => {
      const t = tally(state.placed);
      return { score: `${t.correct} correct`, info: `Placed ${t.total} of ${ROUND_SIZE}` };
    },
    key(e) {
      const n = Number(e.key);
      if (!over && n >= 1 && n <= BRANCHES.length) return placeOn(BRANCHES[n - 1].id), true;
      return false;
    },
    summary: () => {
      const t = tally(state.placed);
      return verdict(t.correct, t.total);
    },
    review: {
      label: 'See your tree',
      show() {
        // Every branch with what you put on it (misses ringed), and where the misses really go.
        tray.hidden = true;
        how.hidden = true;
        const t = tally(state.placed);
        line.className = 'es__line';
        line.textContent = t.misses.length ? `${t.misses.length} on the wrong branch:` : 'Every one on the right branch.';
        fact.textContent = '';
        misses.hidden = !t.misses.length;
        misses.replaceChildren(
          ...t.misses.map((p) => {
            const li = el('li');
            li.append(`${p.species.emoji} `, el('b', '', p.species.name), `: ${label(p.species.branch)}, not ${label(p.chosen)}. `, p.species.what);
            return li;
          }),
        );
        fb.scrollIntoView({ block: 'nearest' });
      },
    },
    destroy: () => {
      cancelAnimationFrame(scrollRaf);
      dialog.querySelectorAll('.es__ghost').forEach((g) => g.remove());
      root.remove();
    },
  };
}
