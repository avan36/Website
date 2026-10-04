// Ask the bartender, in the games card: pick three vibes and the bartender
// pours, with the menu logic laid out on the counter (vibe, flavor axes,
// scores). The rules are rules/bartender.ts. There's no score to beat: it's a
// drink. Played at the beach bar on Boardwalk Isle; it used to live on the
// busy beer page.

import { AXES, MAX_VIBES, MENU, VIBES, explain, preference, rank, reasonText, signed, toggleVibe, vibe } from './rules/bartender';
import { el, styleOnce, type GameEnv, type Panel } from './round';

const STYLE = /* css */ `
.bt { display: grid; gap: 16px; }
.bt__step { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
.bt__n { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--c); color: #2a1600; font-size: 13px; font-weight: 800; }
.bt__count { font-weight: 600; font-size: 13.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.bt__vibes { border: 0; margin: 0; padding: 0; min-width: 0; }
.bt__vibes legend { padding: 0; }
.bt__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.bt__vibe {
  position: relative; border: 0; min-height: 44px; padding: 8px 16px; border-radius: 999px; background: var(--bg-raised);
  box-shadow: inset 0 0 0 1px var(--line-strong); font: inherit; font-size: 14.5px; font-weight: 650; color: var(--ink-2); cursor: pointer;
  transition: transform var(--dur-2) var(--ease-spring), box-shadow var(--dur-2), background-color var(--dur-2), color var(--dur-2);
}
.bt__vibe:hover { color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--c); transform: translateY(-1px); }
.bt__vibe:active { transform: scale(0.96); }
.bt__vibe:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.bt__vibe[aria-pressed='true'] { background: var(--c); color: #2a1600; box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--c) 70%, #000); }
.bt__vibe[aria-pressed='true']::before { content: '✓ '; }
.bt__vibe[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; transform: none; }
.bt__vibe kbd { margin-left: 6px; font: 700 11px var(--font-mono); color: var(--ink-3); }
.bt__vibe[aria-pressed='true'] kbd { color: rgba(42, 22, 0, 0.6); }
html.isl-touch .bt__vibe kbd { display: none; }
.bt__hint { min-height: 1.4em; margin-top: 6px; font-size: 13.5px; color: var(--ink-3); }

.bt__pour { display: grid; gap: 12px; padding: 16px 18px; border-radius: 18px; background: var(--bg-raised); box-shadow: var(--shadow-2); min-height: 96px; }
.bt__wait { font-family: var(--font-read); font-style: italic; font-size: 18px; color: var(--ink-2); align-self: center; }
.bt__wait[hidden], .bt__card[hidden], .bt__reset[hidden] { display: none; }
.bt__card { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 14px; align-items: start; }
.bt__glass { overflow: visible; }
.bt__pour.is-poured .bt__glass { animation: bt-slide 620ms var(--ease-spring); }
@keyframes bt-slide { from { transform: translateX(-40px) rotate(-8deg); opacity: 0; } }
.bt__text { display: grid; gap: 6px; }
.bt__kicker { font-size: 12.5px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.bt__name { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.bt__line { font-family: var(--font-read); font-size: 16.5px; color: var(--ink-2); }
.bt__why { margin: 4px 0 0; padding-left: 1.1em; display: grid; gap: 4px; font-size: 14px; color: var(--ink-2); }
.bt__why li::marker { color: var(--c); }
.bt__reset { justify-self: start; border: 0; min-height: 42px; padding: 8px 18px; border-radius: 999px; background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); font: inherit; font-size: 14px; font-weight: 650; color: var(--ink); cursor: pointer; }
.bt__reset:hover { box-shadow: inset 0 0 0 1.5px var(--c); }
.bt__reset:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }

.bt__ticket { padding: 14px; border-radius: 14px; background: var(--bg-raised); box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line); }
.bt__scroll { overflow-x: auto; }
.bt__table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 14px; }
.bt__table th, .bt__table td { padding: 6px 4px; text-align: center; border-bottom: 1px solid var(--line); }
.bt__table thead th { font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }
.bt__table tbody th, .bt__table tfoot th { text-align: left; font-weight: 650; white-space: nowrap; padding-right: 10px; }
.bt__table td { font-family: var(--font-mono); font-weight: 600; color: var(--ink-3); }
.bt__table td.is-pos { color: color-mix(in oklab, var(--c) 55%, var(--ink)); }
.bt__table td.is-neg { color: var(--ink-2); }
.bt__table tfoot th, .bt__table tfoot td { border-top: 2px dashed var(--line-strong); border-bottom: 0; }
.bt__table tfoot td { font-weight: 800; color: var(--ink); }
.bt__empty td { text-align: left; font-family: var(--font-read); font-style: italic; color: var(--ink-3); }
.bt__how { margin-top: 10px; font-size: 13.5px; color: var(--ink-3); }

.bt__scores { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.bt__sc { display: grid; grid-template-columns: 18px minmax(7.5em, auto) minmax(0, 1fr) 2.2em; align-items: center; gap: 10px; padding: 5px 10px; border-radius: 10px; transition: background-color var(--dur-3) var(--ease-out); }
.bt__sc.is-top { background: color-mix(in oklab, var(--c) 16%, var(--bg-raised)); box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--c) 55%, transparent); }
.bt__outline { fill: none; stroke: var(--ink); stroke-opacity: 0.22; stroke-width: 1; }
.bt__dname { font-weight: 650; font-size: 14px; white-space: nowrap; }
.bt__bar { position: relative; height: 12px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bt__fill { position: absolute; inset: 0 auto 0 0; width: var(--w); border-radius: inherit; background: color-mix(in oklab, var(--c) 70%, var(--ink-3)); transition: width var(--dur-3) var(--ease-out); }
.bt__sc.is-top .bt__fill { background: var(--c); }
.bt__mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1.5px; background: var(--line-strong); }
.bt__num { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 14px; }
.bt__note { font-size: 12.5px; color: var(--ink-3); }
@media (max-width: 420px) {
  .bt__ticket { padding: 10px; }
  .bt__table th, .bt__table td { padding: 6px 2px; }
  .bt__table thead th { font-size: 10px; letter-spacing: 0; }
  .bt__sc { grid-template-columns: 18px minmax(6.5em, auto) minmax(0, 1fr) 2em; gap: 8px; padding: 5px 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .bt__vibe, .bt__fill, .bt__sc { transition: none; }
  .bt__pour.is-poured .bt__glass { animation: none; }
}
`;

/** A little glass of a drink's color. */
const glass = (hue: string, w: number, h: number, cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 32" width="${w}" height="${h}" aria-hidden="true"><path data-fill d="M4.4 7 H19.6 L17.9 28.6 Q17.7 30.4 15.9 30.4 H8.1 Q6.3 30.4 6.1 28.6 Z" fill="${hue}" /><path d="M3.6 4.2 Q5.6 1.4 8.6 2.8 Q12 0.6 15.4 2.8 Q18.6 1.2 20.4 4.2 L19.8 8.4 H4.2 Z" fill="#fffaf0" /><path d="M3.8 4 H20.2 L18 28.8 Q17.8 30.6 15.9 30.6 H8.1 Q6.2 30.6 6 28.8 Z" class="bt__outline" /></svg>`;

/** The keys for the ten vibes, in order. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function startBartender(host: HTMLElement, env: GameEnv): Panel {
  styleOnce('bartender', STYLE);
  const root = el('div', 'bt');
  root.innerHTML = /* html */ `
    <fieldset class="bt__vibes">
      <legend class="bt__step"><span class="bt__n" aria-hidden="true">1</span>Pick three vibes <span class="bt__count" data-count>0 of ${MAX_VIBES}</span></legend>
      <div class="bt__chips">${VIBES.map((v, i) => `<button type="button" class="bt__vibe" data-vibe="${v.id}" aria-pressed="false">${v.label}${i < KEYS.length ? `<kbd aria-hidden="true">${KEYS[i]}</kbd>` : ''}</button>`).join('')}</div>
      <p class="bt__hint" data-hint aria-live="polite"></p>
    </fieldset>
    <div class="bt__pour" data-pour aria-live="polite">
      <p class="bt__wait" data-wait>Pick three vibes and I'll pour.</p>
      <div class="bt__card" data-card hidden>
        ${glass('#e0a12e', 48, 64, 'bt__glass')}
        <div class="bt__text"><p class="bt__kicker">Tonight you're drinking</p><p class="bt__name" data-name></p><p class="bt__line" data-line></p><ul class="bt__why" data-why></ul></div>
      </div>
      <button type="button" class="bt__reset" data-reset hidden>Start over</button>
    </div>
    <div class="bt__ticket">
      <p class="bt__step"><span class="bt__n" aria-hidden="true">2</span>The order ticket</p>
      <div class="bt__scroll"><table class="bt__table">
        <caption class="visually-hidden">How each picked vibe leans on the five flavor axes, and the total.</caption>
        <thead><tr><th scope="col"><span class="visually-hidden">Vibe</span></th>${AXES.map((a) => `<th scope="col">${a}</th>`).join('')}</tr></thead>
        <tbody data-rows></tbody>
        <tfoot><tr data-total><th scope="row">Your lean</th>${AXES.map(() => '<td>0</td>').join('')}</tr></tfoot>
      </table></div>
      <p class="bt__how">Each drink scores by how far it sits above or below the middle on every axis, times your lean. Low counts as much as high when you lean away.</p>
    </div>
    <div>
      <p class="bt__step"><span class="bt__n" aria-hidden="true">3</span>The menu, scored</p>
      <ol class="bt__scores" data-scores aria-label="Menu scores, best first">${MENU.map((d) => `<li class="bt__sc" data-id="${d.id}">${glass(d.hue, 18, 24, '')}<span class="bt__dname">${d.name}</span><span class="bt__bar" aria-hidden="true"><span class="bt__fill" style="--w:50%"></span><span class="bt__mid"></span></span><span class="bt__num" data-num>50</span></li>`).join('')}</ol>
    </div>
    <p class="bt__note">A toy version of the idea. The vibe weights and drink profiles are rough and made up for fun, not how the app rates real drinks.</p>`;
  host.append(root);

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-vibe]')];
  const count = $('[data-count]');
  const hint = $('[data-hint]');
  const rowsEl = $('[data-rows]');
  const totalCells = [...root.querySelectorAll<HTMLTableCellElement>('[data-total] td')];
  const list = $<HTMLOListElement>('[data-scores]');
  const rows = new Map([...list.children].map((li) => [(li as HTMLElement).dataset.id!, li as HTMLLIElement]));
  const pour = $('[data-pour]');
  const wait = $('[data-wait]');
  const card = $('[data-card]');
  const reset = $<HTMLButtonElement>('[data-reset]');
  let picked: string[] = [];
  let lastWinner = '';

  const cell = (n: number) => {
    const c = el('td', n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : '', signed(n));
    return c;
  };

  function render() {
    count.textContent = `${picked.length} of ${MAX_VIBES}`;
    const full = picked.length >= MAX_VIBES;
    for (const chip of chips) {
      const on = picked.includes(chip.dataset.vibe!);
      chip.setAttribute('aria-pressed', String(on));
      if (full && !on) chip.setAttribute('aria-disabled', 'true');
      else chip.removeAttribute('aria-disabled');
    }

    // The ticket: a row per vibe, then the summed lean.
    rowsEl.replaceChildren();
    if (!picked.length) {
      const tr = el('tr', 'bt__empty');
      const td = el('td', '', 'Nothing on the ticket yet.');
      td.colSpan = AXES.length + 1;
      tr.append(td);
      rowsEl.append(tr);
    }
    for (const id of picked) {
      const v = vibe(id)!;
      const tr = el('tr');
      const th = el('th', '', v.label);
      th.scope = 'row';
      tr.append(th, ...v.weights.map((w) => cell(w)));
      rowsEl.append(tr);
    }
    const pref = preference(picked);
    totalCells.forEach((td, i) => {
      td.textContent = signed(pref[i]);
      td.className = pref[i] > 0 ? 'is-pos' : pref[i] < 0 ? 'is-neg' : '';
    });

    // The menu: re-ranked, the rows sliding into their new places.
    const ranked = rank(picked);
    const before = new Map([...rows].map(([id, li]) => [id, li.getBoundingClientRect().top]));
    ranked.forEach((d, i) => {
      const li = rows.get(d.id)!;
      li.querySelector<HTMLElement>('.bt__fill')!.style.setProperty('--w', `${d.score.toFixed(1)}%`);
      li.querySelector<HTMLElement>('[data-num]')!.textContent = String(Math.round(d.score));
      li.classList.toggle('is-top', full && i === 0);
      list.append(li);
    });
    if (!env.reducedMotion) {
      for (const [id, li] of rows) {
        const dy = before.get(id)! - li.getBoundingClientRect().top;
        if (Math.abs(dy) >= 0.5) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }

    // The pour.
    reset.hidden = picked.length === 0;
    if (!full) {
      card.hidden = true;
      wait.hidden = false;
      pour.classList.remove('is-poured');
      const left = MAX_VIBES - picked.length;
      wait.textContent = picked.length === 0 ? "Pick three vibes and I'll pour." : `${left} more and I'll pour. ${left === 1 ? 'Almost there.' : 'Take your time.'}`;
      lastWinner = '';
      return;
    }
    const top = ranked[0];
    wait.hidden = true;
    card.hidden = false;
    $('[data-name]').textContent = top.name;
    $('[data-line]').textContent = top.pour;
    card.querySelector('[data-fill]')!.setAttribute('fill', top.hue);
    const why = $<HTMLUListElement>('[data-why]');
    why.replaceChildren(...explain(picked, top).map((r) => el('li', '', reasonText(r))));
    const runner = ranked[1];
    why.append(el('li', '', `Scored ${Math.round(top.score)}. Runner-up: ${runner.name} at ${Math.round(runner.score)}.`));
    if (top.id !== lastWinner) {
      pour.classList.remove('is-poured');
      void pour.offsetWidth;
      pour.classList.add('is-poured');
      lastWinner = top.id;
      env.sound('fanfare');
      env.announce(`Tonight you're drinking ${top.name}. ${top.pour}`);
      pour.scrollIntoView({ block: 'nearest', behavior: env.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function press(chip: HTMLButtonElement) {
    if (chip.getAttribute('aria-disabled') === 'true') {
      hint.textContent = 'Three is plenty. Tap one of yours to swap it out.';
      env.sound('miss');
      return;
    }
    hint.textContent = '';
    picked = toggleVibe(picked, chip.dataset.vibe!);
    env.sound('pop');
    render();
  }
  for (const chip of chips) chip.addEventListener('click', () => press(chip));
  reset.addEventListener('click', () => {
    picked = [];
    hint.textContent = '';
    render();
    chips[0].focus({ preventScroll: true });
  });

  render();
  if (!host.inert) chips[0].focus({ preventScroll: true });

  return {
    score: 0,
    over: false,
    // Nothing to keep score of: the drink is the point.
    hud: () => null,
    key(e) {
      const i = KEYS.indexOf(e.key);
      if (i < 0 || i >= chips.length) return false;
      press(chips[i]);
      return true;
    },
    destroy: () => root.remove(),
  };
}
