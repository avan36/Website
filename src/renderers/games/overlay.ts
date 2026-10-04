// The games' card: one mini-game in the page's shared <dialog>, so every view
// can play it the same way (the island, the map, and the text adventure for
// the games words can't draw). A start card with your best, the round on a
// canvas, then a score card: the score, your best, a little party for a new
// one, and "Play again" on Enter or one tap. Every view already ignores its
// own keys while the dialog is open, so nothing walks off mid-round.

import type { WorldStore } from '../../world/store';
import type { SoundName } from '../types';
import { GAME_INFO, gamesRow, nudge, scoreText, type GameId } from './catalog';
import { startCrabs } from './crabs';
import { startCrates } from './crates';
import type { GameEnv, Round, StartRound } from './round';
import { startStones } from './stones';

const START: Record<GameId, StartRound> = { stones: startStones, crabs: startCrabs, crates: startCrates };

export interface PlayOptions {
  store: WorldStore;
  sound: { play(name: SoundName): void };
  reducedMotion: boolean;
  touch: boolean;
  announce(text: string): void;
  /** The card closed (the view can carry on). */
  onClose?(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CLOSE =
  '<button class="w-close" value="close" formmethod="dialog" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
const RESTART =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';

const CSS = /* css */ `
.w-dialog.w-dialog--game { width: min(600px, calc(100vw - 24px)); max-height: min(94dvh, 860px); }
/* No blur behind a game: the view is paused anyway, and a blur redrawn under every frame is costly on phones. */
.w-dialog.w-dialog--game::backdrop { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(29, 26, 22, 0.55); }
.w-game { padding-bottom: 20px; }
.w-game .w-title { font-size: var(--step-2, 1.6rem); }
.w-game__stage {
  position: relative; margin: 14px -28px 0; aspect-ratio: 4 / 3; max-height: 62dvh;
  background: #2b8fb8; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; outline: none;
}
.w-game__stage:focus-visible { box-shadow: inset 0 0 0 3px var(--c); }
.w-game__stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.w-game__fx { pointer-events: none; z-index: 5; }
.w-game__hud {
  position: absolute; left: 10px; right: 10px; top: 10px; z-index: 2; display: flex; align-items: center; gap: 8px;
  pointer-events: none; font-variant-numeric: tabular-nums;
}
.w-game__hud[hidden] { display: none; }
.w-game__chip {
  padding: 6px 12px; border-radius: 999px; background: rgba(29, 26, 22, 0.62); color: #fff;
  font-weight: 750; font-size: 15px; line-height: 1.2; white-space: nowrap;
}
.w-game__chip:empty { display: none; }
.w-game__streak { background: #ffd56b; color: #3a2a24; }
.w-game__info { margin-left: auto; }
.w-game__restart {
  pointer-events: auto; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: rgba(29, 26, 22, 0.62); color: #fff; cursor: pointer;
}
.w-game__restart:focus-visible { outline: 3px solid #fff; outline-offset: 1px; }
.w-game__panel {
  position: absolute; inset: 0; z-index: 4; display: grid; align-content: center; justify-items: center; gap: 10px;
  padding: 22px 26px; text-align: center; color: #fff;
  background: radial-gradient(circle at 50% 40%, rgba(29, 26, 22, 0.55), rgba(29, 26, 22, 0.78));
}
.w-game__panel[hidden] { display: none; }
.w-game__pitch { max-width: 30rem; font-size: 15.5px; line-height: 1.45; color: rgba(255, 255, 255, 0.92); text-wrap: pretty; }
.w-game__how { font-size: 13.5px; font-weight: 650; color: rgba(255, 255, 255, 0.75); }
.w-game__best { font-size: 14px; font-weight: 700; padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); }
.w-game .w-btn kbd {
  display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px;
  background: rgba(255, 255, 255, 0.22); font: 700 12px/1 var(--font-ui);
}
html.isl-touch .w-game .w-btn kbd { display: none; }
.w-game__go, .w-game__again { min-height: 52px; padding: 0 26px; font-size: 17px; }
.w-game__go:focus-visible, .w-game__again:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.w-game__panel .w-btn--ghost { color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.5); }
.w-game__badge {
  padding: 5px 14px; border-radius: 999px; background: #ffd56b; color: #3a2a24; font-weight: 800; font-size: 14px;
  letter-spacing: 0.06em; text-transform: uppercase; animation: w-game-badge 900ms var(--ease-spring) both;
}
.w-game__badge[hidden] { display: none; }
@keyframes w-game-badge { from { transform: scale(0.4) rotate(-12deg); opacity: 0; } }
.w-game__big { font-family: var(--font-display); font-weight: 800; font-size: clamp(3.4rem, 15vw, 5rem); line-height: 0.95; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.w-game__unit { margin-top: -6px; font-weight: 700; color: rgba(255, 255, 255, 0.8); }
.w-game__nudge { max-width: 26rem; font-size: 15px; line-height: 1.4; color: rgba(255, 255, 255, 0.92); }
.w-game__btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 4px; }
.w-game__note { margin-top: 12px; font-size: 13px; color: var(--ink-3); }
@media (max-width: 520px) {
  .w-game__stage { aspect-ratio: 1 / 1; margin-inline: -20px; }
  .w-game__pitch { font-size: 14.5px; }
  .w-game__panel { gap: 8px; padding: 16px; }
  .w-game .w-games__list { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .w-game .w-games__item { padding: 8px 9px; }
  .w-game .w-games__name { font-size: 13px; line-height: 1.2; }
  .w-game .w-games__best { font-size: 12.5px; }
  .w-game .w-games__where { display: none; }
}
@media (prefers-reduced-motion: reduce) { .w-game__badge { animation: none; } }
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.dataset.games = '';
  el.textContent = CSS;
  document.head.append(el);
}

type Confetto = { x: number; y: number; vx: number; vy: number; r: number; spin: number; color: string };

/** Open a game's card. Returns a function that closes it. */
export function playGame(id: GameId, o: PlayOptions): () => void {
  style();
  const info = GAME_INFO[id];
  const { store } = o;
  const world = store.world;
  const where = world.activities.find((a) => a.game === id);
  const place = where ? world.places.find((p) => p.id === where.place) : null;
  const dialog = document.getElementById('w-dialog') as HTMLDialogElement;
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
  const bestText = () => {
    const rec = store.state.progress.games[id];
    if (!rec || !rec.plays) return 'No best yet. Set one!';
    return `Your best: ${scoreText(id, rec.best)}`;
  };

  dialog.innerHTML = `<form method="dialog" class="w-card w-game" style="--c:${info.color}">${CLOSE}
    <p class="w-kicker">Island game${place ? ` · ${esc(place.title)}` : ''}</p>
    <h2 class="w-title" id="w-dialog-title">${esc(info.name)}</h2>
    <div class="w-game__stage" tabindex="-1">
      <canvas aria-hidden="true"></canvas>
      <div class="w-game__hud" hidden><span class="w-game__chip w-game__score"></span><span class="w-game__chip w-game__streak"></span><span class="w-game__chip w-game__info"></span><button type="button" class="w-game__restart" aria-label="Start again">${RESTART}</button></div>
      <div class="w-game__panel w-game__start">
        <p class="w-game__pitch">${esc(info.pitch)}</p>
        <p class="w-game__how">${esc(o.touch ? info.touch : info.keys)}</p>
        <p class="w-game__best"></p>
        <button type="button" class="w-btn w-btn--c w-game__go">Play <kbd aria-hidden="true">Enter</kbd></button>
      </div>
      <div class="w-game__panel w-game__end" hidden aria-live="polite">
        <p class="w-game__badge" hidden>New best!</p>
        <p class="w-game__big"></p>
        <p class="w-game__unit"></p>
        <p class="w-game__nudge"></p>
        <div class="w-game__btns"><button type="button" class="w-btn w-btn--c w-game__again">Play again <kbd aria-hidden="true">Enter</kbd></button><button class="w-btn w-btn--ghost" value="close">Done</button></div>
      </div>
      <canvas class="w-game__fx" aria-hidden="true"></canvas>
    </div>
    <div class="w-game__row"></div>
  </form>`;
  dialog.classList.add('w-dialog--wide', 'w-dialog--game');
  const $ = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('.w-game');
  const stage = $<HTMLElement>('.w-game__stage');
  const canvas = $<HTMLCanvasElement>('.w-game__stage canvas');
  const fx = $<HTMLCanvasElement>('.w-game__fx');
  const hud = $<HTMLElement>('.w-game__hud');
  const startPanel = $<HTMLElement>('.w-game__start');
  const endPanel = $<HTMLElement>('.w-game__end');
  const goBtn = $<HTMLButtonElement>('.w-game__go');
  const againBtn = $<HTMLButtonElement>('.w-game__again');
  const row = $<HTMLElement>('.w-game__row');
  const scoreEl = $<HTMLElement>('.w-game__score');
  const streakEl = $<HTMLElement>('.w-game__streak');
  const infoEl = $<HTMLElement>('.w-game__info');
  const c = canvas.getContext('2d')!;
  const fc = fx.getContext('2d')!;

  const paintRow = () => (row.innerHTML = gamesRow(world, (g) => store.state.progress.games[g], id));
  $<HTMLElement>('.w-game__best').textContent = bestText();
  paintRow();

  const env: GameEnv = {
    reducedMotion: o.reducedMotion,
    touch: o.touch,
    sound: (n) => o.sound.play(n),
    announce: o.announce,
    random: Math.random,
    font: fontFamily,
  };

  type Mode = 'start' | 'play' | 'end';
  let mode: Mode = 'start';
  // A round to look at behind the start card; a fresh one when you press Play.
  let round: Round = START[id]({ ...env, sound: () => {} });
  let endT = 0;
  let guardUntil = 0;
  const confetti: Confetto[] = [];
  let W = 1;
  let H = 1;
  let dpr = 1;

  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [canvas, fx]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  function begin() {
    if (performance.now() < guardUntil) return;
    round = START[id](env);
    mode = 'play';
    endT = 0;
    confetti.length = 0;
    startPanel.hidden = true;
    endPanel.hidden = true;
    hud.hidden = false;
    stage.focus({ preventScroll: true });
    o.sound.play('pop');
    o.announce(`${info.name}. ${o.touch ? info.touch : info.keys}`);
  }

  function finish() {
    mode = 'end';
    const events = store.dispatch({ type: 'score', game: id, score: round.score });
    const e = events.find((x) => x.type === 'scored');
    const score = round.score;
    const best = e && e.type === 'scored' ? e.best : store.best(id);
    const record = !!(e && e.type === 'scored' && e.record);
    const previous = e && e.type === 'scored' ? e.previous : best;
    $<HTMLElement>('.w-game__badge').hidden = !record;
    $<HTMLElement>('.w-game__big').textContent = String(score);
    $<HTMLElement>('.w-game__unit').textContent = info.unit[score === 1 ? 0 : 1];
    $<HTMLElement>('.w-game__nudge').textContent = nudge(id, score, best, record, previous);
    $<HTMLElement>('.w-game__best').textContent = bestText();
    hud.hidden = true;
    endPanel.hidden = false;
    paintRow();
    o.sound.play(record ? 'fanfare' : 'pop');
    o.announce(`${scoreText(id, score)}. ${record ? 'A new best!' : `Your best is ${scoreText(id, best)}.`} Press Enter to play again.`);
    if (record && !o.reducedMotion) {
      const colors = ['#ffd56b', '#ff5a36', '#2b8fb8', '#20a464', '#8b5cf6', '#ffffff'];
      for (let i = 0; i < 90; i++) {
        confetti.push({ x: W / 2 + (Math.random() - 0.5) * 40, y: H * 0.45, vx: (Math.random() - 0.5) * 520, vy: -180 - Math.random() * 380, r: 3 + Math.random() * 3, spin: Math.random() * 6, color: colors[i % colors.length] });
      }
    }
    // A short pause before Play again takes a press, so the last tap of the round doesn't start the next.
    guardUntil = performance.now() + 450;
    againBtn.disabled = true;
    window.setTimeout(() => {
      if (mode !== 'end' || !dialog.open) return;
      againBtn.disabled = false;
      againBtn.focus({ preventScroll: true });
    }, 460);
  }

  // ---------- Input ----------
  const local = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let pointer: number | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (mode === 'start') return begin();
    if (mode !== 'play' || !e.isPrimary) return;
    e.preventDefault();
    pointer = e.pointerId;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    round.press(local(e));
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (mode === 'play') round.release(local(e));
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  goBtn.addEventListener('click', begin);
  againBtn.addEventListener('click', begin);
  $<HTMLButtonElement>('.w-game__restart').addEventListener('click', begin);

  const isGameKey = (code: string) => code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code.startsWith('Arrow') || code.startsWith('Digit') || code.startsWith('Numpad') || /^Key[A-Z]$/.test(code);
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' || e.key === 'Tab') return;
    const active = document.activeElement as HTMLElement | null;
    const onButton = active?.tagName === 'BUTTON';
    // Another button (Done, Close, Start again) keeps its own Enter and Space.
    if (onButton && active !== goBtn && active !== againBtn && (e.key === 'Enter' || e.code === 'Space')) return;
    if (mode === 'play') {
      if (e.code === 'KeyR' && !e.repeat) return e.preventDefault(), begin();
      if (!isGameKey(e.code)) return;
      e.preventDefault();
      if (!e.repeat) round.press(null, e.code);
      return;
    }
    // Start and end: Enter plays (whatever has focus); Space only presses a focused button.
    if (e.key === 'Enter' || (e.code === 'Space' && !onButton)) {
      e.preventDefault();
      if (!e.repeat) begin();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (mode === 'play' && isGameKey(e.code)) {
      e.preventDefault();
      round.release(null, e.code);
    }
  };
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('keyup', onKeyUp);

  // ---------- Frame ----------
  let raf = 0;
  let last = performance.now();
  let lastHud = '';
  const frame = (now: number) => {
    // The card was closed, or replaced by another one: stop.
    if (!dialog.open || !form.isConnected) return close();
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === 'play') {
      round.update(dt);
      if (round.over) {
        endT += dt;
        if (endT > 0.35) finish();
      }
      const h = round.hud();
      const key = `${h.score}|${h.info}|${h.streak ?? ''}`;
      if (key !== lastHud) {
        lastHud = key;
        scoreEl.textContent = h.score;
        infoEl.textContent = h.info;
        streakEl.textContent = h.streak ?? '';
      }
    } else if (mode === 'end') round.update(dt);
    // Not laid out yet (the card is still opening): nothing to draw into.
    if (W < 40 || H < 40) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    round.draw(c, W, H);
    // Confetti for a new best.
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fc.clearRect(0, 0, W, H);
    for (const p of confetti) {
      p.vy += 620 * dt;
      p.vx *= 1 - dt * 0.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * 8;
      fc.fillStyle = p.color;
      fc.fillRect(p.x - p.r, p.y - p.r * Math.abs(Math.cos(p.spin)), p.r * 2, p.r * 2 * Math.abs(Math.cos(p.spin)) + 1);
    }
    for (let i = confetti.length - 1; i >= 0; i--) if (confetti[i].y > H + 20) confetti.splice(i, 1);
  };
  raf = requestAnimationFrame(frame);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    dialog.removeEventListener('keydown', onKey);
    dialog.removeEventListener('keyup', onKeyUp);
    dialog.removeEventListener('close', close);
    dialog.classList.remove('w-dialog--game');
    if (form.isConnected) dialog.classList.remove('w-dialog--wide');
    o.onClose?.();
  }
  dialog.addEventListener('close', close);

  if (!dialog.open) dialog.showModal();
  goBtn.focus({ preventScroll: true });
  o.announce(`${info.name}. ${bestText()} Press Enter to play.`);
  o.sound.play('chime');
  return () => {
    if (dialog.open && form.isConnected) dialog.close();
    else close();
  };
}
