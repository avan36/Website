// The text adventure as a renderer: a warm terminal you type into. The engine
// (engine.ts) decides what happens; this file shows it, takes your typing,
// and carries out the effects: telling the store where you are, recording
// finds and catches, going into places, switching views.

import './text.css';
import type { RendererContext, RendererHandle } from '../types';
import { createEngine, type EngineState, type Result } from './engine';
import type { Block } from './output';
import { Typewriter } from './typewriter';
import { h, renderTurn } from './view';

/** Turns kept on screen; older ones scroll away for good. */
const MAX_TURNS = 120;
const MAX_HISTORY = 50;

export async function mount(ctx: RendererContext): Promise<RendererHandle> {
  const { world, geo, store } = ctx;
  const engine = createEngine(world, geo);

  // ---------- Where to start ----------
  // Coming back out of a place, then where the visitor already is, then the place nearest where they stood.
  const presence = store.state.presence;
  const startAt = ctx.returnTo ?? presence.at ?? (presence.pos ? geo.nearestPlace(presence.pos.x, presence.pos.z).place.id : geo.hub.id);
  const progress = () => store.state.progress;
  let state: EngineState = engine.initial(startAt, progress());

  // ---------- DOM ----------
  const log = h('div', { class: 'tx-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'The story so far' });
  const scroller = h('div', { class: 'tx-scroll' }, log);
  const input = h('input', {
    class: 'tx-input',
    id: 'tx-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    maxlength: '160',
    placeholder: 'What do you do?',
    'aria-describedby': 'tx-keys',
  });
  const chips = h('div', { class: 'tx-chips', role: 'group', 'aria-label': 'Things to try' });
  const form = h(
    'form',
    { class: 'tx-dock', 'aria-label': 'Command' },
    ctx.touch ? chips : null,
    h('label', { class: 'tx-line', for: 'tx-input' }, h('span', { class: 'tx-prompt', 'aria-hidden': 'true' }, '›'), h('span', { class: 'visually-hidden' }, 'What do you do?'), input),
    h('p', { class: 'tx-keys', id: 'tx-keys' }, ctx.touch ? 'Type a command, or tap a suggestion.' : 'Enter to act · Tab completes · ↑ for history · type HELP for ideas'),
  );
  const root = h('div', { class: `tx${ctx.touch ? ' is-touch' : ''}` }, scroller, form);
  ctx.host.append(root);

  const typewriter = new Typewriter(ctx.reducedMotion);
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => (timers.delete(t), fn()), ms);
    timers.add(t);
  };
  const paintNight = () => root.classList.toggle('is-night', progress().night);
  paintNight();

  // ---------- Output ----------

  function show(command: string | null, blocks: Block[]) {
    // Only the newest turn's commands are Tab stops; older ones stay clickable.
    for (const el of log.querySelectorAll<HTMLElement>('.tx-turn:last-child .tx-cmd, .tx-turn:last-child .tx-link')) el.tabIndex = -1;
    const turn = renderTurn(command, blocks);
    log.append(turn);
    while (log.children.length > MAX_TURNS) log.firstElementChild!.remove();
    // Bring the new turn into view, its top just under the HUD if it's long, else the bottom of everything.
    const clear = parseFloat(getComputedStyle(log).paddingTop) - 8;
    const top = Math.min(turn.offsetTop - clear, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTo({ top: Math.max(0, top), behavior: ctx.reducedMotion ? 'auto' : 'smooth' });
    typewriter.play(turn.querySelector('.tx-turn__body')!);
  }

  /** Where effects that leave the page start their wipe: the middle of the input line. */
  const origin = () => {
    const r = input.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /** Carry out what the engine asked for; returns more to show (a catch). */
  function apply(r: Result): Block[] {
    const extra: Block[] = [];
    for (const e of r.effects) {
      switch (e.type) {
        case 'move': {
          const place = world.places.find((p) => p.id === e.place)!;
          store.dispatch({ type: 'move', at: place.id, pos: place.kind === 'hub' ? place.at : geo.door(place) });
          break;
        }
        case 'find':
          store.dispatch({ type: 'find', id: e.id });
          ctx.sound.play('chime');
          break;
        case 'fish': {
          const caught = store.fish();
          if (!caught) break;
          const landed = engine.landed(state, caught.post, caught.fresh);
          state = landed.state;
          extra.push(...landed.out);
          ctx.sound.play('land');
          break;
        }
        case 'sound':
          ctx.sound.play(e.name);
          break;
        case 'night':
          store.dispatch({ type: 'night', on: e.on });
          break;
        case 'clear':
          typewriter.finish();
          log.replaceChildren();
          break;
        case 'timer':
          later(() => {
            const fired = engine.signal(sync(), e.signal);
            state = fired.state;
            if (fired.out.length) show(null, [...fired.out, ...apply(fired)]);
            paintChips();
          }, e.ms);
          break;
        case 'go':
          later(() => (typewriter.finish(), ctx.go(e.place, origin())), ctx.reducedMotion ? 60 : 650);
          break;
        case 'open':
          later(() => (typewriter.finish(), ctx.go('blog', origin(), e.href)), ctx.reducedMotion ? 60 : 500);
          break;
        case 'view':
          later(() => document.querySelector<HTMLButtonElement>(`[data-view-set="${e.id}"]`)?.click(), 450);
          break;
        case 'portal':
          later(() => (typewriter.finish(), ctx.portal(e.id, origin())), ctx.reducedMotion ? 60 : 700);
          break;
      }
    }
    return extra;
  }

  /** The engine's state, with progress fresh from the store (another view, or the hoard card, may have changed it). */
  function sync(): EngineState {
    const p = progress();
    state = { ...state, found: p.found, caught: p.caught, night: p.night };
    return state;
  }

  // ---------- Input ----------

  const history: string[] = [];
  let browsing = -1;
  let draft = '';
  let completing: { list: string[]; i: number } | null = null;
  let moved = false;

  function submit(command: string, fromKeyboard = true) {
    typewriter.finish();
    const text = command.trim();
    if (!moved) (moved = true), ctx.firstMove();
    if (text && history[history.length - 1] !== text) history.push(text), history.length > MAX_HISTORY && history.shift();
    browsing = -1;
    draft = '';
    const r = engine.run(sync(), text);
    state = r.state;
    const extra = apply(r);
    show(r.effects.some((e) => e.type === 'clear') ? null : text, [...r.out, ...extra]);
    paintChips();
    if (fromKeyboard || !ctx.touch) input.focus({ preventScroll: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    completing = null;
    submit(v);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      if (browsing === -1) draft = input.value;
      browsing = e.key === 'ArrowUp' ? (browsing === -1 ? history.length - 1 : Math.max(0, browsing - 1)) : browsing === -1 ? -1 : browsing + 1;
      if (browsing >= history.length) browsing = -1;
      input.value = browsing === -1 ? draft : history[browsing];
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    } else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
      // Only take Tab when there's something to complete, so it still moves focus otherwise.
      completing ??= { list: engine.complete(state, input.value), i: -1 };
      if (!completing.list.length) return (completing = null);
      e.preventDefault();
      completing.i = (completing.i + 1) % completing.list.length;
      input.value = completing.list[completing.i];
    } else if (e.key === 'Escape' && input.value) {
      input.value = '';
    }
  });
  input.addEventListener('input', () => (completing = null));

  // Clicking a command in the story types it for you.
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (t) return submit(t.dataset.cmd!, false);
    // A click on empty space (not a selection) goes back to the prompt, on desktop.
    if (!ctx.touch && !(e.target as HTMLElement).closest('a, button, input') && !getSelection()?.toString()) input.focus({ preventScroll: true });
  });
  root.addEventListener('pointerdown', () => typewriter.finish());

  // Start typing anywhere and it goes to the prompt.
  const onKey = (e: KeyboardEvent) => {
    if (typewriter.busy && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) typewriter.finish();
    const t = e.target as HTMLElement;
    if (t === input || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    if (t.closest('input, textarea, select, [contenteditable], dialog, .isl-views__menu')) return;
    if (t !== document.body && !root.contains(t)) return;
    input.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', onKey);

  // ---------- Suggestions (touch) ----------

  function paintChips() {
    if (!ctx.touch) return;
    chips.replaceChildren(
      ...engine.suggest(state).map((c) => h('button', { type: 'button', class: `tx-chip${c.tone ? ` is-${c.tone}` : ''}`, 'data-cmd': c.cmd }, c.label)),
    );
    chips.scrollLeft = 0;
  }

  // ---------- The on-screen keyboard ----------
  // Keep the prompt above it: size the panel to the visual viewport, not the layout one.
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const covered = window.innerHeight - vv.height > 80;
    root.style.height = covered ? `${vv.height}px` : '';
    root.style.transform = covered ? `translateY(${vv.offsetTop}px)` : '';
    if (covered) scroller.scrollTop = scroller.scrollHeight;
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);

  // ---------- Night ----------
  const unsubscribe = store.subscribe((_, events) => {
    if (events.some((e) => e.type === 'night')) paintNight();
  });

  // ---------- Go ----------
  const opening = engine.start(state, { returning: !!ctx.returnTo, portal: ctx.viaPortal });
  state = opening.state;
  show(null, opening.out);
  paintChips();
  ctx.ready();
  if (!ctx.touch) input.focus({ preventScroll: true });
  // Draw the island's map while nothing else is happening, so MAP answers at once.
  const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 400));
  idle(() => engine.map(state));

  return {
    pause: () => typewriter.finish(),
    resume() {},
    destroy() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      typewriter.destroy();
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      root.remove();
    },
  };
}
