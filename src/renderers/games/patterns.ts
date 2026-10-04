// Spot the dark pattern, in the games card: a made-up signup page full of
// tricks. Flag the ones built to steer you, then see which Global Privacy
// Control would have settled for you. The tricks and the GPC notes are in
// rules/darkPatterns.ts. Played on Boardwalk Isle; it used to live on the
// Global Privacy Control page.

import { DECOYS, TRICKS, countBy, flag, gpcState, isComplete, mmss, tick, total, verdict } from './rules/darkPatterns';
import { el, styleOnce, type GameEnv, type Panel } from './round';

const STYLE = /* css */ `
.dp { display: grid; gap: 12px; }
.dp__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.dp__gpc {
  display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 999px;
  background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line-strong); font-size: 13px; font-weight: 600; color: var(--ink-2);
}
.dp__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
.dp__gpc.is-on .dp__dot { background: var(--leaf); box-shadow: 0 0 0 3px color-mix(in oklab, var(--leaf) 25%, transparent); }
.dp__gpc.is-off .dp__dot { background: var(--c); }
.dp__btn {
  margin-left: auto; min-height: 42px; padding: 8px 18px; border: 0; border-radius: 999px;
  background: var(--ink); color: var(--bg); font: inherit; font-weight: 650; font-size: 14px; cursor: pointer;
}
.dp__btn:focus-visible { outline: 3px solid var(--c); outline-offset: 2px; }
.dp__btn[hidden] { display: none; }
.dp__feedback { min-height: 2.8em; font-size: 14.5px; line-height: 1.4; color: var(--ink-2); }
.dp__feedback.is-hit { color: var(--ink); font-weight: 600; }

/* The mock site: its own made-up brand, always light. */
.mock {
  --fern: #2f6b45; --fern-ink: #ffffff;
  color-scheme: light; border-radius: 14px; overflow: hidden; background: #fdfcf8; color: #22261f;
  box-shadow: var(--shadow-2), inset 0 0 0 1px var(--line); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.mock__chrome { display: flex; align-items: center; gap: 10px; padding: 7px 12px; background: #ece8df; border-bottom: 1px solid #ddd6c8; }
.mock__lights { display: inline-flex; gap: 6px; }
.mock__lights i { width: 10px; height: 10px; border-radius: 50%; background: #cfc6b5; }
.mock__url { flex: 1; max-width: 300px; padding: 3px 12px; border-radius: 999px; background: #fdfcf8; font-size: 12px; color: #6b6458; }
.mock__page { padding: 16px 18px; display: grid; gap: 14px; justify-items: center; }
.mock__card { width: 100%; max-width: 420px; display: grid; gap: 10px; }
.mock__h { font-size: 1.25rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.01em; }
.mock__sub { font-size: 14px; color: #5b5a52; margin-top: -4px; }
.spot {
  position: relative; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left;
  cursor: pointer; border-radius: 6px; outline-offset: 3px;
}
.spot:hover { box-shadow: 0 0 0 2px color-mix(in oklab, var(--c) 45%, transparent); }
.spot:focus-visible { outline: 3px solid var(--c); }
.spot.is-found { box-shadow: 0 0 0 2.5px var(--c); }
.spot.is-missed { box-shadow: 0 0 0 2.5px var(--c); outline: 2px dashed var(--c); outline-offset: 4px; }
.spot.is-decoy { animation: dp-nope 360ms ease; }
@keyframes dp-nope { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.spot .pin {
  position: absolute; top: -10px; right: -10px; z-index: 2; display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px;
  border-radius: 999px; background: var(--c); color: #fff; font: 800 12px/1 var(--font-ui); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  animation: dp-pop 380ms var(--ease-spring); pointer-events: none;
}
.spot.is-missed .pin { background: #fff; color: var(--c); box-shadow: inset 0 0 0 2px var(--c); }
@keyframes dp-pop { from { transform: scale(0.3); opacity: 0; } }
.mock__brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 17px; color: var(--fern); padding: 2px 4px; }
.mock__urgent { display: flex; flex-wrap: wrap; gap: 8px; }
.mock__scarcity { padding: 4px 10px; border-radius: 999px; background: #fde5d6; color: #8a2f0c; font-size: 13px; font-weight: 700; }
.mock__timer { padding: 4px 10px; border-radius: 999px; background: #fff4c7; color: #6a4a00; font-size: 13px; font-weight: 600; }
.mock__timer b { font-variant-numeric: tabular-nums; }
.mock__field { display: grid; gap: 4px; width: 100%; }
.mock__label { font-size: 13px; font-weight: 600; }
.mock__input { display: block; padding: 10px 12px; border-radius: 8px; border: 1px solid #c9c3b6; background: #fff; color: #8b867b; font-size: 15px; }
.mock__check { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; align-items: start; font-size: 13.5px; line-height: 1.4; padding: 2px; }
.mock__check em { color: #8b867b; font-style: normal; }
.mock__box { width: 18px; height: 18px; margin-top: 1px; border-radius: 4px; border: 1.5px solid #8b867b; background: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 900; color: #fff; }
.mock__box.is-on { background: var(--fern); border-color: var(--fern); }
.mock__submit { justify-self: stretch; text-align: center; padding: 12px; border-radius: 10px; background: var(--fern); color: var(--fern-ink); font-weight: 700; font-size: 16px; }
.mock__shame { justify-self: center; font-size: 13px; color: #6b6458; text-decoration: underline; padding: 6px; }
.mock__policy { justify-self: center; font-size: 12px; color: var(--fern); text-decoration: underline; padding: 4px; }
.mock__banner { display: grid; gap: 12px; padding: 14px 18px; background: #fff; border-top: 1px solid #ddd6c8; box-shadow: 0 -8px 24px rgba(40, 30, 10, 0.08); }
.mock__btext { font-size: 13.5px; line-height: 1.5; color: #3d3b35; }
.mock__hidden { display: inline; font-size: inherit; color: inherit; line-height: inherit; }
.mock__toggle { display: flex; align-items: center; gap: 10px; font-size: 13px; line-height: 1.3; padding: 2px; }
.mock__toggle small { color: #8b867b; font-size: 12px; }
.mock__switch { flex: none; position: relative; width: 38px; height: 22px; border-radius: 11px; background: var(--fern); }
.mock__switch i { position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }
.mock__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 14px; }
.mock__manage { font-size: 11px; color: #b3ada1; padding: 4px; }
.mock__accept { padding: 12px 34px; border-radius: 10px; background: var(--fern); color: var(--fern-ink); font-weight: 800; font-size: 16px; }

/* The answers */
.dp-reveal { display: grid; gap: 14px; margin-top: 6px; outline: none; }
.dp-reveal[hidden] { display: none; }
.dp-reveal__title { font-size: 1.3rem; font-weight: 750; letter-spacing: -0.01em; }
.dp-reveal__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.trick { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line); }
.trick__n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--c); color: #fff; font-weight: 800; font-size: 13px; }
.trick__body { display: grid; gap: 6px; }
.trick__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.trick__name { font-weight: 700; }
.trick__status { padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; background: var(--line); color: var(--ink-3); }
.trick.is-found .trick__status { background: color-mix(in oklab, var(--leaf) 22%, transparent); color: color-mix(in oklab, var(--leaf) 55%, var(--ink)); }
.trick__what, .trick__gpc { font-size: 14px; line-height: 1.45; color: var(--ink-2); }
.trick__gpc { padding-left: 10px; border-left: 3px solid var(--line-strong); }
.trick__gpc.is-covers { border-color: var(--leaf); }
.trick__gpc.is-partly { border-color: var(--sun); }
.trick__gpc.is-no { border-color: var(--ink-3); }
.gpc { display: grid; gap: 10px; padding: 16px 18px; border-radius: 18px; background: var(--bg-raised); box-shadow: var(--shadow-1); font-size: 14.5px; line-height: 1.5; }
.gpc p, .gpc li { color: var(--ink-2); }
.gpc__title { font-size: 1.1rem; font-weight: 700; color: var(--ink); }
.gpc code { font-family: var(--font-mono); font-size: 0.88em; padding: 1px 5px; border-radius: 5px; background: var(--bg-sunken); color: var(--ink); }
.gpc__tally, .gpc__sub { font-weight: 650; color: var(--ink) !important; }
.gpc__not { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
.gpc__not li::marker { color: var(--c); }
.gpc a { color: inherit; font-weight: 650; text-decoration-color: var(--c); text-underline-offset: 3px; }
.gpc__you { padding: 10px 12px; border-radius: 10px; background: color-mix(in oklab, var(--c) 8%, var(--bg-raised)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--c) 25%, transparent); }
.dp__note { font-size: 12.5px; color: var(--ink-3); }
@media (prefers-reduced-motion: reduce) { .spot.is-decoy, .spot .pin { animation: none; } }
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const VERDICT = { covers: 'GPC handles this', partly: 'GPC helps, partly', no: 'GPC can’t help' } as const;

/** The made-up signup page. Every part of it is a button: press one to flag it as a trick. */
const MOCK = /* html */ `
<div class="mock" role="group" aria-label="Mock signup page for Fernhollow Kitchen. Every part of it is a button: activate one to flag it as a trick.">
  <div class="mock__chrome" aria-hidden="true"><span class="mock__lights"><i></i><i></i><i></i></span><span class="mock__url">fernhollow.example/join</span></div>
  <div class="mock__page">
    <button type="button" class="spot mock__brand" data-spot="brand"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 21c0-8 2-13 8-17-1 7-3 12-8 17Zm0 0C11 14 8 10 3 8c1 6 4 10 9 13Z" fill="currentColor" /></svg>Fernhollow Kitchen</button>
    <div class="mock__card">
      <div class="mock__urgent">
        <button type="button" class="spot mock__scarcity" data-spot="scarcity">🔥 Only 3 free spots left today!</button>
        <button type="button" class="spot mock__timer" data-spot="countdown" aria-label="Free membership offer countdown timer">Free membership ends in <b data-timer>00:45</b></button>
      </div>
      <p class="mock__h">Get a new weeknight recipe every Tuesday</p>
      <p class="mock__sub">Fifteen-minute dinners, tested by real home cooks.</p>
      <button type="button" class="spot mock__field" data-spot="email"><span class="mock__label">Email</span><span class="mock__input">you@example.com</span></button>
      <button type="button" class="spot mock__check" data-spot="prechecked"><span class="mock__box is-on" aria-hidden="true">✓</span><span>Share my profile with trusted partners for special offers</span></button>
      <button type="button" class="spot mock__check" data-spot="bundled"><span class="mock__box" aria-hidden="true"></span><span>I agree to the Terms of Service, Privacy Policy, and the sale of my personal information for advertising. <em>(required)</em></span></button>
      <button type="button" class="spot mock__submit" data-spot="submit">Join for free</button>
      <button type="button" class="spot mock__shame" data-spot="confirmshame">No thanks, I like wasting food</button>
      <button type="button" class="spot mock__policy" data-spot="policy">Privacy policy</button>
    </div>
  </div>
  <div class="mock__banner">
    <p class="mock__btext"><b>We value your privacy 🍪</b> We and our 312 partners use cookies to personalize content and ads. By continuing to browse you agree to this. You may also <button type="button" class="spot mock__hidden" data-spot="hidden-reject">continue with essential cookies only</button>.</p>
    <button type="button" class="spot mock__toggle" data-spot="flip-toggle"><span class="mock__switch" aria-hidden="true"><i></i></span><span><b>Do not sell or share my info</b><br /><small>Status: sharing enabled</small></span></button>
    <div class="mock__actions"><button type="button" class="spot mock__manage" data-spot="tiny-manage">Manage options</button><button type="button" class="spot mock__accept" data-spot="tiny-manage">Accept all</button></div>
  </div>
</div>`;

const REVEAL = /* html */ `
<h3 class="dp-reveal__title" tabindex="-1">The answers</h3>
<ol class="dp-reveal__list">${TRICKS.map(
  (t, i) => `<li class="trick" data-trick="${t.id}"><span class="trick__n" aria-hidden="true">${i + 1}</span><div class="trick__body">
    <p class="trick__head"><span class="trick__name">${esc(t.name)}</span><span class="trick__status" data-status>missed</span></p>
    <p class="trick__what">${esc(t.what)}</p>
    <p class="trick__gpc is-${t.gpc}"><b>${VERDICT[t.gpc]}.</b> ${esc(t.gpcNote)}</p></div></li>`,
).join('')}</ol>
<div class="gpc">
  <p class="gpc__title">What GPC actually does</p>
  <p>Global Privacy Control is one setting in your browser. When it's on, the browser adds a <code>Sec-GPC: 1</code> header to every request and sets <code>navigator.globalPrivacyControl</code> to <code>true</code> for page scripts. In California and a growing list of other US states, a site covered by the law has to treat that as your request to opt out of the sale and sharing of your personal information. You don't have to find the banner's hidden link or decode its toggle: the answer arrives before the banner even loads.</p>
  <p class="gpc__tally">Of the ${total} tricks here, GPC settles ${countBy('covers')}, helps with ${countBy('partly')}, and can't touch ${countBy('no')}.</p>
  <p class="gpc__sub">What it doesn't do</p>
  <ul class="gpc__not">
    <li>It isn't a cookie blocker. Analytics, “functional” cookies and first-party tracking aren't sales, so they can carry on.</li>
    <li>It doesn't unsubscribe you from a company's own emails or stop it collecting what you type into its forms.</li>
    <li>It does nothing about pressure tactics like fake timers, fake scarcity or guilt-trip buttons.</li>
    <li>Its legal force depends on where you live and whether the law covers that business. Outside those places it's a polite request.</li>
    <li>It only works if the site listens.</li>
  </ul>
  <p>That last point is the research. The lab's crawler visited 11,000+ websites with GPC switched on and checked whether each one actually honored it. <a href="https://gpc-web-ui.vercel.app" rel="noopener" target="_blank">See the live results ↗</a></p>
  <p class="gpc__you" data-gpc-long></p>
</div>
<p class="dp__note">Fernhollow Kitchen is made up, and so is every trick on its page. The GPC notes are a plain-language summary, not legal advice.</p>`;

export function startPatterns(host: HTMLElement, env: GameEnv): Panel {
  styleOnce('patterns', STYLE);
  const num = new Map(TRICKS.map((t, i) => [t.id, i + 1]));
  const decoyIds = new Set(DECOYS.map((d) => d.id));
  const root = el('div', 'dp');
  const bar = el('div', 'dp__bar');
  const chip = el('p', 'dp__gpc');
  const dot = el('span', 'dp__dot');
  dot.setAttribute('aria-hidden', 'true');
  // Your own browser, for real: does it send GPC?
  const gpc = gpcState(navigator as Navigator & { globalPrivacyControl?: unknown });
  chip.classList.add(`is-${gpc}`);
  chip.append(dot, gpc === 'on' ? 'Your browser: GPC is on' : gpc === 'off' ? 'Your browser: GPC is off' : 'Your browser: no GPC support');
  const revealBtn = el('button', 'dp__btn', 'Reveal answers');
  revealBtn.type = 'button';
  bar.append(chip, revealBtn);
  const feedback = el('p', 'dp__feedback', 'Some things on the page are perfectly honest. Flag the ones that aren’t.');
  feedback.setAttribute('aria-live', 'polite');
  const mock = el('div');
  mock.innerHTML = MOCK;
  const reveal = el('section', 'dp-reveal');
  reveal.hidden = true;
  reveal.setAttribute('aria-label', 'The answers');
  reveal.innerHTML = REVEAL;
  reveal.querySelector('[data-gpc-long]')!.textContent =
    gpc === 'on'
      ? 'Your browser has GPC on right now: navigator.globalPrivacyControl is true, so it is also sending Sec-GPC: 1 with its requests. Every site you visit is being told not to sell or share your data.'
      : gpc === 'off'
        ? 'Your browser supports GPC, but it is switched off: navigator.globalPrivacyControl is false. Look for it in your privacy settings.'
        : "Your browser doesn't report GPC at all. Brave, DuckDuckGo and Firefox (in its privacy settings) support it, and an extension like OptMeowt can add it to Chrome.";
  root.append(bar, feedback, mock, reveal);
  host.append(root);

  const spots = [...mock.querySelectorAll<HTMLButtonElement>('[data-spot]')];
  const timer = mock.querySelector<HTMLElement>('[data-timer]')!;
  let found = new Set<string>();
  let over = false;
  // The fake timer: counts down, then quietly starts over. That reset is the giveaway.
  let secs = 45;
  let clock = 0;

  const addPin = (id: string, missed = false) => {
    for (const s of spots.filter((x) => x.dataset.spot === id)) {
      s.classList.add(missed ? 'is-missed' : 'is-found');
      if (s.querySelector('.pin')) continue;
      const p = el('span', 'pin', String(num.get(id)));
      p.setAttribute('aria-hidden', 'true');
      s.append(p, el('span', 'visually-hidden', ` (trick ${num.get(id)}${missed ? ', missed' : ', flagged'})`));
    }
  };

  for (const s of spots) {
    s.addEventListener('click', () => {
      if (over) return;
      const id = s.dataset.spot!;
      const r = flag(found, id);
      found = r.found;
      feedback.classList.remove('is-hit');
      if (r.result.kind === 'found') {
        addPin(id);
        feedback.classList.add('is-hit');
        feedback.textContent = `Got one: ${r.result.trick.name}. ${r.result.trick.what}`;
        env.sound('perfect');
      } else if (r.result.kind === 'again') {
        feedback.textContent = `Already flagged: ${r.result.trick.name}.`;
      } else if (r.result.kind === 'decoy') {
        feedback.textContent = `Looks fine. ${r.result.why}`;
        env.sound('plonk');
        if (decoyIds.has(id) && !env.reducedMotion) {
          s.classList.remove('is-decoy');
          void s.offsetWidth;
          s.classList.add('is-decoy');
        }
      }
      if (isComplete(found)) {
        feedback.textContent += ` That's all ${total}!`;
        over = true;
      }
    });
  }
  revealBtn.addEventListener('click', () => {
    if (over) return;
    over = true;
    env.sound('tap');
  });

  return {
    get score() {
      return found.size;
    },
    get over() {
      return over;
    },
    hud: () => ({ score: `${found.size} of ${total} found`, info: '' }),
    update(dt) {
      clock += dt;
      while (clock >= 1) {
        clock -= 1;
        secs = tick(secs);
        timer.textContent = mmss(secs);
      }
    },
    summary: () => verdict(found.size),
    review: {
      label: 'See the answers',
      show() {
        for (const t of TRICKS) {
          if (!found.has(t.id)) addPin(t.id, true);
          const li = reveal.querySelector<HTMLElement>(`[data-trick="${t.id}"]`)!;
          li.classList.toggle('is-found', found.has(t.id));
          li.querySelector('[data-status]')!.textContent = found.has(t.id) ? 'found' : 'missed';
        }
        revealBtn.hidden = true;
        feedback.classList.remove('is-hit');
        feedback.textContent = `${found.size} of ${total}. The ones you missed are ringed on the page.`;
        reveal.hidden = false;
        const title = reveal.querySelector<HTMLElement>('.dp-reveal__title')!;
        title.focus({ preventScroll: true });
        title.scrollIntoView({ block: 'start', behavior: env.reducedMotion ? 'auto' : 'smooth' });
      },
    },
    destroy: () => root.remove(),
  };
}
