// What's on screen while you're in the boat: the lap timer and the buttons
// over the water, the countdown, a word at each gate, the card at the finish,
// and on touch screens the controls (a pad of buttons, and a stick wherever
// you put your thumb down). Plain DOM over the canvas, styled here so it all
// lives in one place and leaves the page's own HUD alone.

const CSS = /* css */ `
html.isl-boating .isl-card, html.isl-boating .isl-hint, html.isl-boating .isl-hoard-fab, html.isl-boating .isl-sound-fab { display: none !important; }
.isl-boat {
  position: absolute; inset: 0; z-index: 6; pointer-events: none; font-family: var(--font-ui); color: var(--ink);
  /* A thumb held on a button mustn't select the words round it or open the callout menu. */
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
}
.isl-boat[hidden] { display: none; }
.isl-boat button { pointer-events: auto; font: inherit; cursor: pointer; }
.isl-boat__top {
  position: absolute; left: 50%; transform: translateX(-50%);
  top: calc(max(16px, env(safe-area-inset-top)) + 58px);
  display: grid; justify-items: center; gap: 8px; width: max-content; max-width: calc(100vw - 32px);
}
@media (min-width: 1100px) { .isl-boat__top { top: max(16px, env(safe-area-inset-top)); } }
.isl-boat__clock {
  display: grid; justify-items: center; gap: 0; padding: 7px 20px 8px; border-radius: 18px;
  background: rgba(255, 255, 255, 0.86); -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: var(--shadow-1); min-width: 168px;
}
.isl-boat__time { font-family: var(--font-display); font-weight: 750; font-size: 30px; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.isl-boat__sub { font-size: 13px; font-weight: 650; color: var(--ink-3); white-space: nowrap; }
.isl-boat__gates { display: flex; gap: 4px; margin: 4px 0 1px; }
.isl-boat__gates i { width: 9px; height: 9px; border-radius: 50%; background: rgba(29, 26, 22, 0.14); transition: background 200ms; }
.isl-boat__gates i.on { background: #2fb36a; }
.isl-boat__gates i.next { background: #f5b301; }
.isl-boat__acts { display: flex; gap: 8px; }
.isl-boat__btn {
  display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border: 0; border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.86); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: var(--shadow-1); color: var(--ink); font-size: 15px; font-weight: 700; white-space: nowrap; touch-action: manipulation;
  transition: transform var(--dur-2) var(--ease-spring), background var(--dur-2);
}
.isl-boat__btn:hover { transform: translateY(-2px); background: #fff; }
.isl-boat__btn:active { transform: scale(0.96); }
.isl-boat__btn.is-go { background: #e5484d; color: #fff; }
.isl-boat__btn.is-go:hover { background: #d93a40; }
.isl-boat__btn kbd, .isl-boat__card kbd, .isl-boat__keys kbd {
  display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 6px;
  background: rgba(29, 26, 22, 0.08); font: 700 12px var(--font-ui); color: inherit;
}
.isl-boat__btn.is-go kbd, .isl-boat__card .is-go kbd { background: rgba(255, 255, 255, 0.22); }
html.isl-touch .isl-boat kbd { display: none; }
.isl-boat__big {
  position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%);
  font-family: var(--font-display); font-weight: 800; font-size: clamp(64px, 18vw, 140px); line-height: 1;
  color: #fff; text-shadow: 0 4px 0 rgba(29, 26, 22, 0.25), 0 10px 30px rgba(29, 26, 22, 0.3);
  letter-spacing: -0.04em; white-space: nowrap;
}
.isl-boat__big.is-pop { animation: isl-boat-pop 900ms var(--ease-out) both; }
@keyframes isl-boat-pop { 0% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } 18% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.92); } }
.isl-boat__flash {
  position: absolute; left: 50%; top: 27%; transform: translate(-50%, 0);
  display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: var(--r-pill);
  background: rgba(29, 26, 22, 0.78); color: #fff; font-weight: 700; font-size: 16px; white-space: nowrap;
  opacity: 0; transition: opacity 250ms;
}
.isl-boat__flash.is-on { opacity: 1; }
.isl-boat__gap { font-variant-numeric: tabular-nums; padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); }
.isl-boat__gap.is-good { background: #2fb36a; }
.isl-boat__gap.is-bad { background: #e5484d; }
.isl-boat__card {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(340px, calc(100vw - 32px)); padding: 22px 22px 18px; border-radius: var(--r-lg);
  background: rgba(255, 255, 255, 0.94); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  box-shadow: var(--shadow-3, var(--shadow-2)); text-align: center; pointer-events: auto;
}
.isl-boat__card[hidden] { display: none; }
.isl-boat__card.is-pop { animation: isl-boat-card 420ms var(--ease-spring) both; }
@keyframes isl-boat-card { from { transform: translate(-50%, -44%) scale(0.92); opacity: 0; } }
.isl-boat__kicker { font-size: 12px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.isl-boat__result { font-family: var(--font-display); font-weight: 800; font-size: 52px; line-height: 1.05; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-top: 4px; }
.isl-boat__note { margin-top: 4px; font-size: 15px; color: var(--ink-2); font-weight: 600; }
.isl-boat__note.is-best { color: #1f8a50; }
.isl-boat__card .isl-boat__acts { flex-direction: column; margin-top: 16px; }
.isl-boat__card .isl-boat__btn { justify-content: center; background: var(--bg-sunken, #f3ede2); box-shadow: none; }
.isl-boat__card .isl-boat__btn.is-go { background: #e5484d; }
.isl-boat__card .isl-boat__btn:focus-visible, .isl-boat__btn:focus-visible { outline: 3px solid #2b8fb8; outline-offset: 2px; }
.isl-boat__keys {
  position: absolute; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  padding: 9px 16px; border-radius: var(--r-pill); background: rgba(29, 26, 22, 0.72); color: #fff;
  font-size: 13.5px; font-weight: 600; white-space: nowrap;
}
.isl-boat__keys kbd { background: rgba(255, 255, 255, 0.18); margin-right: 3px; }
.isl-boat__keys span + span::before { content: '·'; margin: 0 10px; opacity: 0.5; }
html.isl-touch .isl-boat__keys { display: none; }
.isl-boat__pad { display: none; }
html.isl-touch .isl-boat__pad {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;
  position: absolute; left: max(14px, env(safe-area-inset-left)); right: max(14px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom)); touch-action: none;
}
.isl-boat__pad > div { display: flex; gap: 10px; align-items: flex-end; }
.isl-boat__key {
  width: 66px; height: 66px; display: grid; place-items: center; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, 0.8); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: var(--shadow-1); color: var(--ink); touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.isl-boat__key svg { pointer-events: none; }
.isl-boat__key.is-gas { width: 80px; height: 80px; background: rgba(229, 72, 77, 0.92); color: #fff; }
.isl-boat__key.is-held { transform: scale(0.92); filter: brightness(0.92); }
.isl-boat__stick {
  position: absolute; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.75); background: rgba(29, 26, 22, 0.12); display: none;
}
.isl-boat__stick.is-on { display: block; }
.isl-boat__stick i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255, 255, 255, 0.92); box-shadow: var(--shadow-1); }
@media (max-width: 520px) {
  .isl-boat__time { font-size: 26px; }
  .isl-boat__btn { height: 40px; padding: 0 14px; font-size: 14px; }
  .isl-boat__flash { top: 30%; font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  .isl-boat__big.is-pop, .isl-boat__card.is-pop { animation: none; }
}
`;

import { holdable, Holds, padInput, type PadKey } from '../../hold';

const ARROW = (d: string) => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

export type HudMode = 'free' | 'countdown' | 'racing' | 'finished';

export class BoatHud {
  readonly root = document.createElement('div');
  /** What the on-screen pad is asking for. */
  readonly pad = { throttle: 0, steer: 0 };
  private style: HTMLStyleElement;
  private time: HTMLElement;
  private sub: HTMLElement;
  private gates: HTMLElement;
  private race: HTMLButtonElement;
  private big: HTMLElement;
  private flashEl: HTMLElement;
  private card: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private flashTimer = 0;
  private shownTime = '';
  private held = new Holds<PadKey>();
  private unhold: () => void;

  constructor(
    host: HTMLElement,
    private o: { reducedMotion: boolean; onRace(): void; onExit(): void; onCruise(): void },
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.append(this.style);
    const r = this.root;
    r.className = 'isl-boat';
    r.hidden = true;
    r.innerHTML = `
      <div class="isl-boat__top">
        <div class="isl-boat__clock" role="timer" aria-live="off">
          <span class="isl-boat__time">0:00.00</span>
          <span class="isl-boat__gates" aria-hidden="true"></span>
          <span class="isl-boat__sub"></span>
        </div>
        <div class="isl-boat__acts">
          <button type="button" class="isl-boat__btn is-go" data-act="race"><span>Race a lap</span><kbd>R</kbd></button>
          <button type="button" class="isl-boat__btn" data-act="exit"><span>Get out</span><kbd>E</kbd></button>
        </div>
      </div>
      <div class="isl-boat__big" aria-hidden="true"></div>
      <div class="isl-boat__flash" aria-hidden="true"></div>
      <div class="isl-boat__card" role="dialog" aria-labelledby="isl-boat-result" hidden>
        <p class="isl-boat__kicker">Lap of the island</p>
        <p class="isl-boat__result" id="isl-boat-result"></p>
        <p class="isl-boat__note"></p>
        <div class="isl-boat__acts">
          <button type="button" class="isl-boat__btn is-go" data-act="race"><span>Race again</span><kbd>R</kbd></button>
          <button type="button" class="isl-boat__btn" data-act="exit"><span>Back to the pier</span><kbd>E</kbd></button>
          <button type="button" class="isl-boat__btn" data-act="cruise"><span>Keep cruising</span><kbd>Esc</kbd></button>
        </div>
      </div>
      <p class="isl-boat__keys" aria-hidden="true"><span><kbd>W</kbd><kbd>S</kbd>go and slow</span><span><kbd>A</kbd><kbd>D</kbd>steer</span><span><kbd>R</kbd>race</span><span><kbd>E</kbd>get out</span></p>
      <div class="isl-boat__pad">
        <div>
          <button type="button" class="isl-boat__key" data-key="left" aria-label="Steer left">${ARROW('M15 5l-7 7 7 7')}</button>
          <button type="button" class="isl-boat__key" data-key="right" aria-label="Steer right">${ARROW('M9 5l7 7-7 7')}</button>
        </div>
        <div>
          <button type="button" class="isl-boat__key" data-key="brake" aria-label="Slow down">${ARROW('M6 9l6 6 6-6')}</button>
          <button type="button" class="isl-boat__key is-gas" data-key="gas" aria-label="Go">${ARROW('M6 15l6-6 6 6')}</button>
        </div>
      </div>
      <div class="isl-boat__stick" aria-hidden="true"><i></i></div>`;
    host.append(r);
    const q = <T extends HTMLElement>(s: string) => r.querySelector(s) as T;
    this.time = q('.isl-boat__time');
    this.sub = q('.isl-boat__sub');
    this.gates = q('.isl-boat__gates');
    this.race = q('.isl-boat__top [data-act="race"]');
    this.big = q('.isl-boat__big');
    this.flashEl = q('.isl-boat__flash');
    this.card = q('.isl-boat__card');
    this.stick = q('.isl-boat__stick');
    this.knob = q('.isl-boat__stick i');

    r.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      e.preventDefault();
      const act = b.dataset.act;
      if (act === 'race') o.onRace();
      if (act === 'exit') o.onExit();
      if (act === 'cruise') o.onCruise();
    });
    // Keep presses on the HUD from reaching the canvas as a tap or a stick.
    r.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.stopPropagation();
    });

    // The pad: hold a button, with any number of fingers at once. Each finger
    // is captured by its button, so it lets go where it lifts, wherever that is.
    const keyEl = (k: PadKey) => r.querySelector(`[data-key="${k}"]`);
    const press = (e: PointerEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (!b || e.button > 0) return;
      e.preventDefault();
      const k = b.dataset.key as PadKey;
      const was = this.held.press(e.pointerId, k);
      if (was) keyEl(was)?.classList.remove('is-held');
      b.classList.add('is-held');
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      this.readPad();
    };
    const release = (e: PointerEvent) => {
      const k = this.held.release(e.pointerId);
      if (k) keyEl(k)?.classList.remove('is-held');
      this.readPad();
    };
    const pad = q('.isl-boat__pad');
    pad.addEventListener('pointerdown', press);
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('lostpointercapture', release);
    // The pad reads pointers only, so the touches themselves can be cancelled:
    // no text selection, magnifier, callout or double-tap zoom under a thumb.
    const offPad = holdable(pad, { touch: true });
    // The rest (the timer, Race a lap, Get out) keeps its clicks, but no menus.
    const offRoot = holdable(r);
    this.unhold = () => (offPad(), offRoot());
  }

  private readPad() {
    Object.assign(this.pad, padInput(this.held));
  }

  /** Let go of every button on the pad (the window lost focus, say). */
  releasePad() {
    this.held.clear();
    this.readPad();
    this.root.querySelectorAll('.is-held').forEach((x) => x.classList.remove('is-held'));
  }

  show(on: boolean) {
    this.root.hidden = !on;
    document.documentElement.classList.toggle('isl-boating', on);
    if (!on) {
      this.releasePad();
      this.stickOff();
      this.hideCard();
      this.count('');
    }
  }

  mode(m: HudMode) {
    this.race.querySelector('span')!.textContent = m === 'racing' || m === 'countdown' ? 'Restart' : 'Race a lap';
    this.race.classList.toggle('is-go', m === 'free' || m === 'finished');
  }

  /** The stopwatch (null: blank, between races). */
  setTime(t: number | null, text: string) {
    const s = t === null ? '0:00.00' : text;
    if (s !== this.shownTime) this.time.textContent = this.shownTime = s;
  }

  setSub(text: string) {
    if (this.sub.textContent !== text) this.sub.textContent = text;
  }

  /** A dot per gate: passed, next, still to come (or none, cruising). */
  setGates(total: number, done: number, next: number | null) {
    if (this.gates.childElementCount !== total) this.gates.innerHTML = '<i></i>'.repeat(total);
    this.gates.hidden = next === null;
    [...this.gates.children].forEach((el, i) => (el.className = i < done ? 'on' : i === done && next !== null ? 'next' : ''));
  }

  /** Big words in the middle: 3, 2, 1, Go! ('' clears them). */
  count(text: string) {
    this.big.textContent = text;
    this.big.classList.remove('is-pop');
    if (text && !this.o.reducedMotion) {
      void this.big.offsetWidth;
      this.big.classList.add('is-pop');
    }
  }

  /** A short word over the water: a gate passed, with the gap to the best. */
  flash(text: string, gap?: { text: string; good: boolean }) {
    this.flashEl.innerHTML = '';
    const t = document.createElement('span');
    t.textContent = text;
    this.flashEl.append(t);
    if (gap) {
      const g = document.createElement('span');
      g.className = `isl-boat__gap ${gap.good ? 'is-good' : 'is-bad'}`;
      g.textContent = gap.text;
      this.flashEl.append(g);
    }
    this.flashEl.classList.add('is-on');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flashEl.classList.remove('is-on'), 1500);
  }

  showCard(result: string, note: string, best: boolean) {
    clearTimeout(this.flashTimer);
    this.flashEl.classList.remove('is-on');
    this.card.querySelector('.isl-boat__result')!.textContent = result;
    const n = this.card.querySelector('.isl-boat__note')!;
    n.textContent = note;
    n.classList.toggle('is-best', best);
    this.card.hidden = false;
    this.card.classList.remove('is-pop');
    void this.card.offsetWidth;
    this.card.classList.add('is-pop');
    this.card.querySelector<HTMLElement>('[data-act="race"]')?.focus({ preventScroll: true });
  }

  hideCard() {
    if (this.card.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.card.hidden = true;
  }

  get cardOpen() {
    return !this.card.hidden;
  }

  /** The thumbstick, drawn where the thumb went down, knob at an offset. */
  stickAt(x: number, y: number, dx: number, dy: number) {
    this.stick.classList.add('is-on');
    this.stick.style.left = `${x}px`;
    this.stick.style.top = `${y}px`;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  stickOff() {
    this.stick.classList.remove('is-on');
  }

  dispose() {
    clearTimeout(this.flashTimer);
    this.unhold();
    document.documentElement.classList.remove('isl-boating');
    this.root.remove();
    this.style.remove();
  }
}
