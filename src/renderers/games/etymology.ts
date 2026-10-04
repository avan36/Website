// Etymology race, in the games card: a word appears, the clock starts, and
// you guess where English got it (or, every third word, its oldest known
// ancestor). Each answer shows the word's journey. The words and journeys are
// Etymon's own (rules/etymologyRaceData.ts); the rules are rules/etymologyRace.ts.
// Played on Root Isle; it used to live on the Etymon page.

import { makeRng, randomSeed } from './rules/rng';
import { TIME_LIMIT, answer, buildRound, formatYear, multiplier, rank, readableForm, startState, type Question, type RaceState } from './rules/etymologyRace';
import { RACE_LANGS, RACE_WORDS, type RaceWord } from './rules/etymologyRaceData';
import { el, styleOnce, type GameEnv, type Panel } from './round';

const STYLE = /* css */ `
.er { display: grid; gap: 14px; justify-items: center; text-align: center; }
.er__top { width: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.er__kicker { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); text-align: left; }
.er__switch { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; font-size: 13.5px; font-weight: 650; color: var(--ink-2); cursor: pointer; }
.er__switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.er__track { position: relative; width: 40px; height: 24px; border-radius: 999px; background: var(--line-strong); transition: background var(--dur-2); }
.er__track::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--bg-raised); box-shadow: var(--shadow-1); transition: transform var(--dur-2) var(--ease-spring);
}
.er__switch input:checked + .er__track { background: var(--c); }
.er__switch input:checked + .er__track::after { transform: translateX(16px); }
.er__switch input:focus-visible + .er__track { outline: 2px solid var(--c); outline-offset: 2px; }
.er__word {
  font-family: var(--font-read); font-size: clamp(2.3rem, 1.4rem + 4vw, 3.6rem); font-weight: 400; font-style: italic;
  line-height: 1.05; letter-spacing: -0.015em; color: var(--ink); overflow-wrap: anywhere; outline: none;
}
.er__gloss { max-width: 34rem; margin-top: -6px; font-family: var(--font-read); font-size: 16px; line-height: 1.4; color: var(--ink-2); }
.er__timer { position: relative; width: min(100%, 380px); height: 8px; margin-bottom: 8px; border-radius: 999px; background: var(--line); }
.er__timer[hidden] { display: none; }
.er__bar { position: absolute; inset: 0; border-radius: inherit; background: var(--c); transform-origin: left center; transform: scaleX(var(--left, 1)); }
.er__timer.is-low .er__bar { background: var(--coral, #ff6b5b); }
.er__secs { position: absolute; right: 0; top: 11px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.er__options { width: 100%; margin: 4px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.er__opt {
  position: relative; width: 100%; min-height: 54px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 8px 14px; border: 0; border-radius: 14px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  transition: box-shadow var(--dur-2), background var(--dur-2), transform var(--dur-2) var(--ease-spring);
}
@media (hover: hover) { .er__opt:not(:disabled):hover { box-shadow: inset 0 0 0 2px var(--c); } }
.er__opt:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.er__opt:not(:disabled):active { transform: scale(0.98); }
.er__opt:disabled { cursor: default; }
.er__n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-3); box-shadow: inset 0 0 0 1px var(--line-strong); }
html.isl-touch .er__n { display: none; }
.er__label { display: grid; gap: 2px; font-weight: 650; overflow-wrap: anywhere; }
.er__label.is-form { font-family: var(--font-read); font-size: 1.2rem; font-weight: 500; }
.er__hint { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink-3); }
.er__mark { font-weight: 800; font-size: 1.1rem; }
.er__opt.is-right { background: color-mix(in oklab, var(--leaf, #57c15a) 16%, var(--bg-raised)); box-shadow: inset 0 0 0 2px var(--leaf, #57c15a); }
.er__opt.is-wrong { background: color-mix(in oklab, var(--coral, #ff6b5b) 14%, var(--bg-raised)); box-shadow: inset 0 0 0 2px var(--coral, #ff6b5b); }
.er__opt.is-dim { opacity: 0.55; }
.er__opt.is-right .er__mark { color: color-mix(in oklab, var(--leaf, #57c15a) 60%, var(--ink)); }
.er__opt.is-wrong .er__mark { color: color-mix(in oklab, var(--coral, #ff6b5b) 70%, var(--ink)); }
.er__opt.is-wrong.is-shake { animation: er-shake 380ms var(--ease-out); }
@keyframes er-shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
.er__reveal { width: 100%; display: grid; justify-items: center; gap: 12px; margin-top: 4px; }
.er__reveal[hidden] { display: none; }
.er__verdict { font-size: 18px; font-weight: 700; color: var(--ink); }
.er__verdict .pts { color: color-mix(in oklab, var(--c) 70%, var(--ink)); font-family: var(--font-mono); }
.er__journey { width: 100%; margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 14px; }
.er__stage {
  position: relative; display: grid; gap: 1px; justify-items: center; min-width: 88px; max-width: 180px; padding: 7px 10px;
  border-radius: 10px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line);
  animation: er-in 520ms var(--ease-out) both; animation-delay: calc(var(--i) * 110ms);
}
.er__stage + .er__stage::before { content: '→'; position: absolute; left: -12px; top: 50%; translate: 0 -50%; font-size: 12px; color: var(--ink-3); }
.er__stage:last-child { box-shadow: inset 0 0 0 1.5px var(--c); }
.er__sf { font-family: var(--font-read); font-size: 1.1rem; color: var(--ink); overflow-wrap: anywhere; }
.er__sn { font-family: var(--font-read); font-size: 0.92rem; color: var(--ink-2); }
.er__sl { font-size: 13px; font-weight: 650; color: var(--ink-2); }
.er__sy { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.05em; color: var(--ink-3); }
.er__sm { font-family: var(--font-read); font-style: italic; font-size: 0.92rem; color: var(--ink-2); }
.er__story { max-width: 58ch; font-family: var(--font-read); font-size: 16px; line-height: 1.55; color: var(--ink-2); text-wrap: pretty; }
.er__next {
  display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 10px 24px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 86%, #000); color: #fff; font: inherit; font-weight: 700; cursor: pointer;
}
.er__next:focus-visible { outline: 3px solid var(--c); outline-offset: 3px; }
@keyframes er-in { from { opacity: 0; transform: translateY(8px); } }
@media (max-width: 520px) { .er__options { grid-template-columns: 1fr; } .er__opt { min-height: 50px; } }
@media (prefers-reduced-motion: reduce) {
  .er__stage, .er__opt.is-wrong.is-shake { animation: none; }
  .er__track, .er__track::after, .er__opt { transition: none; }
}
`;

const langName = (c: string) => RACE_LANGS[c] ?? c;

export function startEtymology(host: HTMLElement, env: GameEnv): Panel {
  styleOnce('etymology', STYLE);
  const root = el('div', 'er');
  const top = el('div', 'er__top');
  const prompt = el('p', 'er__kicker');
  const clock = el('label', 'er__switch');
  const box = el('input');
  box.type = 'checkbox';
  box.setAttribute('role', 'switch');
  box.checked = true;
  const track = el('span', 'er__track');
  track.setAttribute('aria-hidden', 'true');
  clock.append(box, track, 'Clock');
  top.append(prompt, clock);
  const word = el('h3', 'er__word');
  word.tabIndex = -1;
  const gloss = el('p', 'er__gloss');
  const timer = el('div', 'er__timer');
  const bar = el('span', 'er__bar');
  const secsEl = el('span', 'er__secs');
  secsEl.setAttribute('aria-hidden', 'true');
  timer.append(bar, secsEl);
  const options = el('ol', 'er__options');
  const reveal = el('div', 'er__reveal');
  reveal.hidden = true;
  const verdict = el('p', 'er__verdict');
  const journey = el('ol', 'er__journey');
  journey.setAttribute('aria-label', "The word's journey, oldest first");
  const story = el('p', 'er__story');
  const next = el('button', 'er__next');
  next.type = 'button';
  reveal.append(verdict, journey, story, next);
  root.append(top, word, gloss, timer, options, reveal);
  host.append(root);

  const round: Question[] = buildRound(RACE_WORDS, makeRng(randomSeed()), undefined, langName);
  let state: RaceState = startState();
  let q: Question | null = null;
  let answered = true;
  let over = false;
  let timed = box.checked;
  // The clock: seconds left, ticking only while a question is open (the card only steps while it's on screen).
  let remaining = 0;
  let warned = false;
  let lastSecs = -1;

  const paint = () => {
    if (!q) return;
    const limit = TIME_LIMIT[q.kind];
    const secs = Math.ceil(remaining);
    // Reduced motion: the bar steps once a second instead of gliding.
    const frac = env.reducedMotion ? secs / limit : remaining / limit;
    bar.style.setProperty('--left', Math.max(0, Math.min(1, frac)).toFixed(4));
    if (secs !== lastSecs) {
      if (timed && !answered && secs <= 5 && secs > 0 && lastSecs > secs) env.sound('tick');
      lastSecs = secs;
      secsEl.textContent = `${secs}s`;
      timer.classList.toggle('is-low', secs <= 5);
    }
  };

  box.addEventListener('change', () => {
    timed = box.checked;
    timer.hidden = !timed;
  });

  function ask() {
    q = round[state.index];
    answered = false;
    warned = false;
    lastSecs = -1;
    reveal.hidden = true;
    const w = q.word;
    prompt.textContent = q.kind === 'origin' ? 'Where did English get this word?' : 'Which is its oldest known ancestor?';
    word.textContent = w.word;
    gloss.textContent = w.gloss;
    options.replaceChildren(
      ...q.options.map((label, i) => {
        const li = el('li');
        const b = el('button', 'er__opt');
        b.type = 'button';
        b.dataset.choice = String(i);
        const n = el('span', 'er__n', String(i + 1));
        n.setAttribute('aria-hidden', 'true');
        const text = el('span', `er__label${q!.kind === 'ancestor' ? ' is-form' : ''}`);
        text.append(el('span', '', label));
        if (q!.hints) text.append(el('span', 'er__hint', q!.hints[i]));
        const mark = el('span', 'er__mark');
        mark.setAttribute('aria-hidden', 'true');
        b.append(n, text, mark);
        li.append(b);
        return li;
      }),
    );
    remaining = TIME_LIMIT[q.kind];
    timer.hidden = !timed;
    paint();
    env.announce(`Word ${state.index + 1} of ${round.length}: ${w.word}. ${prompt.textContent}${timed ? ` ${TIME_LIMIT[q.kind]} seconds.` : ''}`);
    if (!host.inert) options.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  function choose(choice: number | null) {
    if (!q || answered) return;
    answered = true;
    const res = answer(state, q, choice, timed ? remaining : null);
    state = res.state;
    [...options.querySelectorAll<HTMLButtonElement>('.er__opt')].forEach((b, i) => {
      b.disabled = true;
      const mark = b.querySelector('.er__mark')!;
      if (i === q!.answer) {
        b.classList.add('is-right');
        mark.textContent = '✓';
      } else if (i === choice) {
        b.classList.add('is-wrong', 'is-shake');
        mark.textContent = '✗';
      } else b.classList.add('is-dim');
    });
    const right = q.options[q.answer];
    verdict.replaceChildren();
    if (res.right) verdict.append(state.streak >= 3 ? `${state.streak} in a row! ` : 'Right! ', el('span', 'pts', `+${res.points}`));
    else verdict.textContent = choice == null ? `Time's up: it's ${right}.` : `Not quite: it's ${right}.`;
    env.sound(res.right ? 'perfect' : 'miss');
    renderJourney(q.word);
    story.textContent = q.word.story;
    next.textContent = state.index >= round.length ? 'See your score →' : 'Next word →';
    reveal.hidden = false;
    env.announce(`${verdict.textContent} ${q.word.story}`);
    next.focus({ preventScroll: true });
    // Keep the reveal in view: the card scrolls if it has to.
    reveal.scrollIntoView({ block: 'nearest', behavior: env.reducedMotion ? 'auto' : 'smooth' });
  }

  function renderJourney(w: RaceWord) {
    journey.replaceChildren(
      ...w.path.map((s, i) => {
        const li = el('li', 'er__stage');
        li.style.setProperty('--i', String(i));
        const f = readableForm(s.form);
        li.append(el('span', 'er__sf', f.text));
        if (f.native) li.append(el('span', 'er__sn', f.native));
        li.append(el('span', 'er__sl', langName(s.lang)), el('span', 'er__sy', formatYear(s.year)));
        if (s.meaning) li.append(el('span', 'er__sm', `‘${s.meaning}’`));
        return li;
      }),
    );
  }

  const onNext = () => {
    if (!answered || over) return;
    env.sound('tap');
    if (state.index >= round.length) over = true;
    else {
      ask();
      word.scrollIntoView({ block: 'nearest', behavior: env.reducedMotion ? 'auto' : 'smooth' });
    }
  };
  next.addEventListener('click', onNext);
  options.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]');
    if (b && !b.disabled) choose(Number(b.dataset.choice));
  });

  ask();

  return {
    get score() {
      return state.score;
    },
    get over() {
      return over;
    },
    hud: () => {
      const m = multiplier(state.streak);
      return {
        score: `${state.score.toLocaleString('en-US')} ${state.score === 1 ? 'point' : 'points'}`,
        info: `Word ${Math.min(state.index + (answered ? 0 : 1), round.length)} of ${round.length}`,
        streak: m > 1 ? `×${m}` : undefined,
      };
    },
    update(dt) {
      if (!q || answered || !timed) return;
      remaining = Math.max(0, remaining - dt);
      if (!warned && remaining <= 5) {
        warned = true;
        env.announce('5 seconds left.');
      }
      paint();
      if (remaining <= 0) choose(null);
    },
    key(e) {
      if (q && !answered) {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) return choose(n - 1), true;
        return false;
      }
      if (e.key === 'Enter') return onNext(), true;
      return false;
    },
    summary: () => `${rank(state.correct, round.length)}. ${state.correct} of ${round.length} right, best streak ${state.bestStreak}.`,
    destroy: () => root.remove(),
  };
}
