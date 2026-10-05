// Speak corporate, in the games card: the greeter at the badge desk reads out
// something plain, and you pick the most corporate way to say it, three times.
// The rules are rules/jargon.ts. Played at the gate out to Synergy Isle; a
// passing score opens it (the store does that, see world/store.ts).

import { makeRng, randomSeed } from './rules/rng';
import { ROUNDS, deal, fluency, pick, reply, type Desk } from './rules/jargon';
import { el, styleOnce, type GameEnv, type Panel } from './round';

const STYLE = /* css */ `
.jg { display: grid; gap: 14px; justify-items: center; text-align: center; }
.jg__kicker { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
.jg__plain {
  font-family: var(--font-read); font-size: clamp(1.7rem, 1.1rem + 3vw, 2.6rem); font-style: italic; line-height: 1.1;
  color: var(--ink); overflow-wrap: anywhere; outline: none;
}
.jg__options { width: 100%; margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.jg__opt {
  width: 100%; min-height: 54px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 8px 14px; border: 0; border-radius: 14px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink); font: inherit; font-weight: 650; text-align: left; cursor: pointer; overflow-wrap: anywhere;
  transition: box-shadow var(--dur-2), background var(--dur-2), transform var(--dur-2) var(--ease-spring);
}
@media (hover: hover) { .jg__opt:not(:disabled):hover { box-shadow: inset 0 0 0 2px var(--c); } }
.jg__opt:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.jg__opt:not(:disabled):active { transform: scale(0.98); }
.jg__opt:disabled { cursor: default; }
.jg__n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-3); box-shadow: inset 0 0 0 1px var(--line-strong); }
html.isl-touch .jg__n { display: none; }
.jg__mark { font-weight: 800; font-size: 1.1rem; }
.jg__opt.is-right { background: color-mix(in oklab, var(--leaf) 16%, var(--bg-raised)); box-shadow: inset 0 0 0 2px var(--leaf); }
.jg__opt.is-wrong { background: color-mix(in oklab, var(--coral) 14%, var(--bg-raised)); box-shadow: inset 0 0 0 2px var(--coral); }
.jg__opt.is-dim { opacity: 0.55; }
.jg__reveal { width: 100%; display: grid; justify-items: center; gap: 12px; }
.jg__reveal[hidden] { display: none; }
.jg__say { max-width: 40ch; font-family: var(--font-read); font-size: 17px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.jg__next {
  display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 10px 24px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 86%, #000); color: var(--accent-ink); font: inherit; font-weight: 700; cursor: pointer;
}
.jg__next:focus-visible { outline: 3px solid var(--c); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .jg__opt { transition: none; } }
`;

export function startJargon(host: HTMLElement, env: GameEnv): Panel {
  styleOnce('jargon', STYLE);
  const root = el('div', 'jg');
  const kicker = el('p', 'jg__kicker');
  const plain = el('h3', 'jg__plain');
  plain.tabIndex = -1;
  const options = el('ol', 'jg__options');
  const reveal = el('div', 'jg__reveal');
  reveal.hidden = true;
  const said = el('p', 'jg__say');
  const next = el('button', 'jg__next');
  next.type = 'button';
  reveal.append(said, next);
  root.append(kicker, plain, options, reveal);
  host.append(root);

  let desk: Desk = deal(makeRng(randomSeed()));
  let answered = true;
  let over = false;

  function ask() {
    const q = desk.questions[desk.index];
    answered = false;
    reveal.hidden = true;
    kicker.textContent = `${desk.index + 1} of ${ROUNDS}: say it the corporate way`;
    plain.textContent = `“${q.line.plain}”`;
    options.replaceChildren(
      ...q.choices.map((text, i) => {
        const li = el('li');
        const b = el('button', 'jg__opt');
        b.type = 'button';
        b.dataset.choice = String(i);
        const n = el('span', 'jg__n', String(i + 1));
        n.setAttribute('aria-hidden', 'true');
        const mark = el('span', 'jg__mark');
        mark.setAttribute('aria-hidden', 'true');
        b.append(n, el('span', '', text), mark);
        li.append(b);
        return li;
      }),
    );
    env.announce(`${kicker.textContent}. ${q.line.plain}`);
    if (!host.inert) options.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  function choose(choice: number) {
    const q = desk.questions[desk.index];
    if (!q || answered) return;
    answered = true;
    const r = pick(desk, choice);
    desk = r.desk;
    [...options.querySelectorAll<HTMLButtonElement>('.jg__opt')].forEach((b, i) => {
      b.disabled = true;
      const mark = b.querySelector('.jg__mark')!;
      if (i === q.answer) (b.classList.add('is-right'), (mark.textContent = '✓'));
      else if (i === choice) (b.classList.add('is-wrong'), (mark.textContent = '✗'));
      else b.classList.add('is-dim');
    });
    said.textContent = reply(r.right, q);
    next.textContent = r.over ? 'See how you did →' : 'Next one →';
    reveal.hidden = false;
    env.sound(r.right ? 'perfect' : 'miss');
    env.announce(said.textContent);
    next.focus({ preventScroll: true });
    reveal.scrollIntoView({ block: 'nearest', behavior: env.reducedMotion ? 'auto' : 'smooth' });
  }

  const onNext = () => {
    if (!answered || over) return;
    env.sound('tap');
    if (desk.index >= desk.questions.length) over = true;
    else ask();
  };
  next.addEventListener('click', onNext);
  options.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]');
    if (b && !b.disabled) choose(Number(b.dataset.choice));
  });

  ask();

  return {
    get score() {
      return desk.right;
    },
    get over() {
      return over;
    },
    hud: () => ({ score: `${desk.right} right`, info: `${Math.min(desk.index + (answered ? 0 : 1), ROUNDS)} of ${ROUNDS}` }),
    key(e) {
      if (!answered) {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) return choose(n - 1), true;
        return false;
      }
      if (e.key === 'Enter') return onNext(), true;
      return false;
    },
    summary: () => `${fluency(desk.right)}.`,
    destroy: () => root.remove(),
  };
}

