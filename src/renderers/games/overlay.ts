// The games' card: one mini-game in the page's shared <dialog>, so every view
// can play it the same way (the island, the map, and the text adventure for
// the games words can't draw). A start card with your best, the round, then a
// score card: the score, your best, a little party for a new one, and "Play
// again" on Enter or one tap. Every view already ignores its own keys while
// the dialog is open, so nothing walks off mid-round.
//
// Most games are painted on a canvas (a Round). The four from the project
// pages are buttons and words (a Panel, built into the card), loaded the first
// time one is opened. A game with no score skips the start and score cards.

import type { WorldStore } from '../../world/store';
import type { SoundName } from '../types';
import { GAME_INFO, gamesRow, isletAt, isScored, nudge, scoreText, type GameId } from './catalog';
import { startCrabs } from './crabs';
import { startCrates } from './crates';
import type { GameEnv, Panel, Round, StartPanel, StartRound } from './round';
import { startStones } from './stones';

const START: Partial<Record<GameId, StartRound>> = { stones: startStones, crabs: startCrabs, crates: startCrates };
const PANELS: Partial<Record<GameId, () => Promise<StartPanel>>> = {
  bartender: () => import('./bartender').then((m) => m.startBartender),
  patterns: () => import('./patterns').then((m) => m.startPatterns),
  etymology: () => import('./etymology').then((m) => m.startEtymology),
  evolution: () => import('./evolution').then((m) => m.startEvolution),
};

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
.w-game__summary { max-width: 28rem; font-size: 14px; line-height: 1.4; color: rgba(255, 255, 255, 0.78); text-wrap: pretty; }
.w-game__summary:empty { display: none; }
.w-game__btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 4px; }
.w-game__btns .w-btn[hidden] { display: none; }
.w-game__note { margin-top: 12px; font-size: 13px; color: var(--ink-3); }

/* A game of buttons and words: the stage grows with it, the HUD sits on top, and it scrolls with the card. */
.w-game__stage--panel {
  aspect-ratio: auto; max-height: none; min-height: 440px; display: flex; flex-direction: column;
  background: color-mix(in oklab, var(--c) 7%, var(--bg-raised)); color: var(--ink);
  touch-action: auto; user-select: auto; -webkit-user-select: auto;
}
.w-game__stage--panel .w-game__hud { position: sticky; top: 0; left: 0; right: 0; padding: 10px 12px 0; margin-bottom: -2px; }
.w-game__stage--panel .w-game__panel { align-content: start; padding-top: clamp(28px, 7dvh, 64px); }
.w-game__body { position: relative; flex: 1; display: grid; align-content: start; padding: 14px 28px 22px; }
.w-game__body[inert] { opacity: 0.55; filter: saturate(0.6); }
.w-game__loading { margin: auto; color: var(--ink-3); font-weight: 650; }
@media (max-width: 520px) {
  .w-game__stage { aspect-ratio: 1 / 1; margin-inline: -20px; }
  .w-game__stage--panel { aspect-ratio: auto; min-height: 380px; }
  .w-game__body { padding: 12px 16px 18px; }
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
  const load = PANELS[id];
  const scored = isScored(id);
  const where = world.activities.find((a) => a.game === id);
  const placeTitle = where ? isletAt(world, where.at)?.name ?? world.places.find((p) => p.id === where.place)?.title : null;
  const dialog = document.getElementById('w-dialog') as HTMLDialogElement;
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
  const bestText = () => {
    const rec = store.state.progress.games[id];
    if (!rec || !rec.plays) return 'No best yet. Set one!';
    return `Your best: ${scoreText(id, rec.best)}`;
  };

  dialog.innerHTML = `<form method="dialog" class="w-card w-game" style="--c:${info.color}">${CLOSE}
    <p class="w-kicker">Island game${placeTitle ? ` · ${esc(placeTitle)}` : ''}</p>
    <h2 class="w-title" id="w-dialog-title">${esc(info.name)}</h2>
    <div class="w-game__stage${load ? ' w-game__stage--panel' : ''}" tabindex="-1">
      ${load ? '' : '<canvas aria-hidden="true"></canvas>'}
      <div class="w-game__hud" hidden><span class="w-game__chip w-game__score"></span><span class="w-game__chip w-game__streak"></span><span class="w-game__chip w-game__info"></span><button type="button" class="w-game__restart" aria-label="Start again">${RESTART}</button></div>
      ${load ? '<div class="w-game__body"><p class="w-game__loading">Setting up…</p></div>' : ''}
      <div class="w-game__panel w-game__start"${scored ? '' : ' hidden'}>
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
        <p class="w-game__summary"></p>
        <div class="w-game__btns"><button type="button" class="w-btn w-btn--c w-game__again">Play again <kbd aria-hidden="true">Enter</kbd></button><button type="button" class="w-btn w-btn--ghost w-game__review" hidden></button><button class="w-btn w-btn--ghost" value="close">Done</button></div>
      </div>
      <canvas class="w-game__fx" aria-hidden="true"></canvas>
    </div>
    <div class="w-game__row"></div>
  </form>`;
  dialog.classList.add('w-dialog--wide', 'w-dialog--game');
  const $ = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('.w-game');
  const stage = $<HTMLElement>('.w-game__stage');
  const canvas = load ? null : $<HTMLCanvasElement>('.w-game__stage canvas');
  const body = load ? $<HTMLElement>('.w-game__body') : null;
  const fx = $<HTMLCanvasElement>('.w-game__fx');
  const hud = $<HTMLElement>('.w-game__hud');
  const startPanel = $<HTMLElement>('.w-game__start');
  const endPanel = $<HTMLElement>('.w-game__end');
  const goBtn = $<HTMLButtonElement>('.w-game__go');
  const againBtn = $<HTMLButtonElement>('.w-game__again');
  const reviewBtn = $<HTMLButtonElement>('.w-game__review');
  const row = $<HTMLElement>('.w-game__row');
  const scoreEl = $<HTMLElement>('.w-game__score');
  const streakEl = $<HTMLElement>('.w-game__streak');
  const infoEl = $<HTMLElement>('.w-game__info');
  const c = canvas?.getContext('2d') ?? null;
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
  const quiet: GameEnv = { ...env, sound: () => {}, announce: () => {} };

  type Mode = 'start' | 'play' | 'end' | 'review';
  let mode: Mode = 'start';
  // A round to look at behind the start card; a fresh one when you press Play.
  let round: Round | null = START[id]?.(quiet) ?? null;
  let panel: Panel | null = null;
  let startOf: StartPanel | null = null;
  let waiting = false;
  let endT = 0;
  let guardUntil = 0;
  const confetti: Confetto[] = [];
  let W = 1;
  let H = 1;
  let dpr = 1;

  /** A fresh panel in the body: to play, or (inert, quiet) to look at behind the start card. */
  const mountPanel = (live: boolean) => {
    if (!body || !startOf) return;
    panel?.destroy();
    body.replaceChildren();
    body.inert = !live;
    panel = startOf(body, live ? env : quiet);
  };
  if (load) {
    load().then(
      (f) => {
        if (closed) return;
        startOf = f;
        // No score to keep: straight in. Otherwise a look at it behind the start card, or straight in if Play was already pressed.
        if (!scored || waiting) begin();
        else mountPanel(false);
      },
      () => body && (body.innerHTML = '<p class="w-game__loading">This game didn’t load. Close the card and try again?</p>'),
    );
  }

  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of canvas ? [canvas, fx] : [fx]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  function begin() {
    if (performance.now() < guardUntil) return;
    if (load && !startOf) {
      // Still loading: it starts the moment it's here.
      waiting = true;
      return;
    }
    waiting = false;
    if (load) {
      mountPanel(true);
      dialog.scrollTo({ top: 0 });
    } else round = START[id]!(env);
    mode = 'play';
    endT = 0;
    confetti.length = 0;
    startPanel.hidden = true;
    endPanel.hidden = true;
    hud.hidden = false;
    lastHud = '';
    if (!load) stage.focus({ preventScroll: true });
    if (scored) o.sound.play('pop');
    o.announce(`${info.name}. ${o.touch ? info.touch : info.keys}`);
  }

  function finish() {
    mode = 'end';
    const game = (round ?? panel)!;
    const events = store.dispatch({ type: 'score', game: id, score: game.score });
    const e = events.find((x) => x.type === 'scored');
    const score = game.score;
    const best = e && e.type === 'scored' ? e.best : store.best(id);
    const record = !!(e && e.type === 'scored' && e.record);
    const previous = e && e.type === 'scored' ? e.previous : best;
    const unit = info.unit!;
    $<HTMLElement>('.w-game__badge').hidden = !record;
    $<HTMLElement>('.w-game__big').textContent = String(score);
    $<HTMLElement>('.w-game__unit').textContent = unit[score === 1 ? 0 : 1];
    $<HTMLElement>('.w-game__nudge').textContent = nudge(id, score, best, record, previous);
    $<HTMLElement>('.w-game__summary').textContent = panel?.summary?.() ?? '';
    reviewBtn.hidden = !panel?.review;
    reviewBtn.textContent = panel?.review?.label ?? '';
    $<HTMLElement>('.w-game__best').textContent = bestText();
    hud.hidden = true;
    endPanel.hidden = false;
    if (panel) body!.inert = true;
    paintRow();
    o.sound.play(record ? 'fanfare' : 'pop');
    o.announce(`${scoreText(id, score)}. ${record ? 'A new best!' : `Your best is ${scoreText(id, best)}.`} Press Enter to play again.`);
    if (record && !o.reducedMotion) {
      const colors = ['#ffd56b', '#ff5a36', '#2b8fb8', '#20a464', '#8b5cf6', '#ffffff'];
      for (let i = 0; i < 90; i++) {
        confetti.push({ x: W / 2 + (Math.random() - 0.5) * 40, y: Math.min(H, 520) * 0.45, vx: (Math.random() - 0.5) * 520, vy: -180 - Math.random() * 380, r: 3 + Math.random() * 3, spin: Math.random() * 6, color: colors[i % colors.length] });
      }
    }
    // A tall stage (a game of buttons and words) scrolls back up to the score.
    if (panel) dialog.scrollTo({ top: 0, behavior: o.reducedMotion ? 'auto' : 'smooth' });
    // A short pause before Play again takes a press, so the last tap of the round doesn't start the next.
    guardUntil = performance.now() + 450;
    againBtn.disabled = true;
    window.setTimeout(() => {
      if (mode !== 'end' || !dialog.open) return;
      againBtn.disabled = false;
      againBtn.focus({ preventScroll: true });
    }, 460);
  }

  /** From the score card, back to the game as it ended, to see what you missed. */
  function review() {
    if (mode !== 'end' || !panel?.review) return;
    mode = 'review';
    confetti.length = 0;
    endPanel.hidden = true;
    hud.hidden = false;
    body!.inert = false;
    panel.review.show();
  }

  // ---------- Input ----------
  const local = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let pointer: number | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (mode === 'start' && !startPanel.hidden) return begin();
    // A game of buttons handles its own presses.
    if (mode !== 'play' || !e.isPrimary || !round) return;
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
    if (mode === 'play' && round) round.release(local(e));
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  if (!load) stage.addEventListener('contextmenu', (e) => e.preventDefault());
  goBtn.addEventListener('click', begin);
  againBtn.addEventListener('click', begin);
  reviewBtn.addEventListener('click', review);
  $<HTMLButtonElement>('.w-game__restart').addEventListener('click', begin);

  const isGameKey = (code: string) => code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code.startsWith('Arrow') || code.startsWith('Digit') || code.startsWith('Numpad') || /^Key[A-Z]$/.test(code);
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' || e.key === 'Tab') return;
    const active = document.activeElement as HTMLElement | null;
    const onButton = active?.tagName === 'BUTTON' || active?.tagName === 'A' || active?.tagName === 'INPUT';
    // Another button (Done, Close, Start again, a game's own) keeps its own Enter and Space.
    if (onButton && active !== goBtn && active !== againBtn && (e.key === 'Enter' || e.code === 'Space')) return;
    if (mode === 'play') {
      if (panel) {
        if (!e.repeat && panel.key?.(e)) e.preventDefault();
        return;
      }
      if (e.code === 'KeyR' && !e.repeat) return e.preventDefault(), begin();
      if (!isGameKey(e.code)) return;
      e.preventDefault();
      if (!e.repeat) round?.press(null, e.code);
      return;
    }
    // Start, end and looking back: Enter plays (whatever has focus); Space only presses a focused button.
    if ((e.key === 'Enter' || (e.code === 'Space' && !onButton)) && scored) {
      e.preventDefault();
      if (!e.repeat) begin();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (mode === 'play' && round && isGameKey(e.code)) {
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
    const game = round ?? panel;
    if (mode === 'play' && game) {
      if (round) round.update(dt);
      else panel?.update?.(dt);
      if (game.over && scored) {
        endT += dt;
        if (endT > 0.35) finish();
      }
      const h = game.hud();
      const key = h ? `${h.score}|${h.info}|${h.streak ?? ''}` : '-';
      if (key !== lastHud) {
        lastHud = key;
        hud.hidden = !h;
        scoreEl.textContent = h?.score ?? '';
        infoEl.textContent = h?.info ?? '';
        streakEl.textContent = h?.streak ?? '';
      }
    } else if (mode === 'end' && round) round.update(dt);
    // Not laid out yet (the card is still opening): nothing to draw into.
    if (W < 40 || H < 40) return;
    if (round && c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      round.draw(c, W, H);
    }
    // Confetti for a new best.
    if (!confetti.length && !fc.canvas.dataset.dirty) return;
    fc.canvas.dataset.dirty = confetti.length ? '1' : '';
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
    panel?.destroy();
    panel = null;
    dialog.removeEventListener('keydown', onKey);
    dialog.removeEventListener('keyup', onKeyUp);
    dialog.removeEventListener('close', close);
    dialog.classList.remove('w-dialog--game');
    if (form.isConnected) dialog.classList.remove('w-dialog--wide');
    o.onClose?.();
  }
  dialog.addEventListener('close', close);

  if (!dialog.open) dialog.showModal();
  if (scored) {
    goBtn.focus({ preventScroll: true });
    o.announce(`${info.name}. ${bestText()} Press Enter to play.`);
  } else o.announce(`${info.name}. ${info.pitch}`);
  o.sound.play('chime');
  return () => {
    if (dialog.open && form.isConnected) dialog.close();
    else close();
  };
}
