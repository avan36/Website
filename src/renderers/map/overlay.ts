// The map's HTML layer, over the canvas: the name tag that pops up when you
// reach a door (with a real button to go in), the fishing prompt, and a list
// of every place as buttons, hidden until it has keyboard focus, so nobody
// needs the canvas to get anywhere. Styled like an old handheld's menus:
// square frames, hard shadows, chunky type.

import type { Place } from '../../world/schema';

const CSS = /* css */ `
.map { position: absolute; inset: 0; overflow: hidden; }
.map-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block;
  touch-action: none; image-rendering: pixelated; cursor: default;
  opacity: 0; transition: opacity 500ms var(--ease-out);
}
html.isl-ready .map-canvas { opacity: 1; }
.map-ui { position: absolute; inset: 0; pointer-events: none; z-index: 3; }

.map-tag {
  --ink: #3a2a24;
  --paper: #fff8e8;
  position: absolute; left: 0; top: 0;
  display: grid; justify-items: center; gap: 2px;
  min-width: 132px; max-width: 260px;
  padding: 8px 12px 10px;
  background: var(--paper);
  color: var(--ink);
  border: 3px solid var(--ink);
  box-shadow: inset 0 0 0 2px #f0d6a2, 0 4px 0 rgba(58, 42, 36, 0.3);
  text-align: center;
  pointer-events: auto;
  will-change: transform;
}
.map-tag[hidden] { display: none; }
.map-tag::after {
  content: ''; position: absolute; left: 50%; top: 100%; width: 12px; height: 7px; margin: 3px 0 0 -6px;
  background: var(--ink);
  clip-path: polygon(0 0, 100% 0, 100% 2px, 10px 2px, 10px 4px, 8px 4px, 8px 7px, 4px 7px, 4px 4px, 2px 4px, 2px 2px, 0 2px);
}
.map-tag.is-pop { animation: map-pop 220ms steps(3, end); }
@keyframes map-pop { from { transform: var(--t) scale(0.6); opacity: 0.4; } }
.map-tag__kicker {
  font: 750 11px/1.2 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase;
  color: color-mix(in srgb, var(--c) 72%, var(--ink));
}
.map-tag__name { font: 750 17px/1.15 var(--font-display); letter-spacing: -0.01em; text-wrap: balance; }
.map-tag__btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; min-width: 112px; margin-top: 7px; padding: 0 14px;
  border: 3px solid var(--ink);
  background: var(--c); color: var(--on, #fff);
  font: 750 13px/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.22), inset 0 3px 0 rgba(255, 255, 255, 0.28);
  cursor: pointer;
}
.map-tag__btn[hidden] { display: none; }
.map-tag__btn:hover { filter: brightness(1.06); }
.map-tag__btn:active { box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.22); transform: translateY(1px); }
.map-tag__btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
.map-tag__btn kbd {
  display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 4px;
  background: rgba(255, 255, 255, 0.24); font: 750 12px/1 var(--font-mono);
}
html.isl-touch .map-tag__btn kbd { display: none; }
.map-tag--fish { --c: #2b8fb8; min-width: 0; padding: 6px 8px 8px; }
.map-tag--fish .map-tag__btn { margin-top: 0; }
.map-tag--fish.is-bite .map-tag__btn { --c: #ff5a36; animation: map-shake 300ms steps(2) infinite; }
.map-tag__note { font: 750 12px/1.3 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 6px; }
@keyframes map-shake { 50% { transform: translateX(2px); } }

.map-places {
  position: absolute; left: max(16px, env(safe-area-inset-left)); top: calc(max(16px, env(safe-area-inset-top)) + 64px);
  pointer-events: auto;
}
.map-places:not(:focus-within) {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.map-places:focus-within {
  padding: 8px; background: #fff8e8; border: 3px solid #3a2a24;
  box-shadow: inset 0 0 0 2px #f0d6a2, 0 4px 0 rgba(58, 42, 36, 0.3);
}
.map-places__head { padding: 2px 8px 6px; font: 750 11px/1.2 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; color: #6f5a4c; }
.map-places ul { list-style: none; margin: 0; padding: 0; display: grid; }
.map-places button {
  display: flex; align-items: baseline; gap: 10px; width: 100%; min-height: 40px; padding: 6px 10px 6px 26px;
  border: 0; background: transparent; color: #3a2a24; text-align: left; cursor: pointer; position: relative;
  font: 700 15px/1.2 var(--font-display);
}
.map-places button span { font: 700 11px/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: #8a7462; }
.map-places button:focus-visible { outline: none; background: #f6e3bd; }
.map-places button:focus-visible::before {
  content: ''; position: absolute; left: 9px; top: 50%; width: 8px; height: 10px; margin-top: -5px; background: #3a2a24;
  clip-path: polygon(0 0, 2px 0, 2px 2px, 4px 2px, 4px 4px, 6px 4px, 6px 6px, 4px 6px, 4px 8px, 2px 8px, 2px 10px, 0 10px);
}
@media (prefers-reduced-motion: reduce) {
  .map-tag.is-pop, .map-tag--fish.is-bite .map-tag__btn { animation: none; }
}
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Text that reads well on a color: dark ink on light accents, white on the rest. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 165 ? '#3a2a24' : '#ffffff';
}

export type FishPrompt = 'cast' | 'wait' | 'bite' | null;

export interface Overlay {
  /** Show the tag for a place at (x, y) in CSS pixels (its bottom middle), or hide it. */
  tag(place: Place | null, x?: number, y?: number): void;
  /** Show the fishing prompt above (x, y), in one of its states, or hide it. */
  fish(state: FishPrompt, x?: number, y?: number): void;
  destroy(): void;
}

export function createOverlay(
  root: HTMLElement,
  places: Place[],
  touch: boolean,
  on: { enter(id: string): void; go(id: string): void; fish(): void },
): Overlay {
  const style = document.createElement('style');
  style.dataset.map = '';
  style.textContent = CSS;
  document.head.append(style);

  const ui = document.createElement('div');
  ui.className = 'map-ui';
  root.append(ui);

  // ---------- The name tag ----------
  const tagEl = document.createElement('div');
  tagEl.className = 'map-tag';
  tagEl.hidden = true;
  tagEl.innerHTML = `<p class="map-tag__kicker"></p><p class="map-tag__name"></p><button type="button" class="map-tag__btn"><span>Enter</span><kbd aria-hidden="true">↵</kbd></button>`;
  const kicker = tagEl.querySelector<HTMLElement>('.map-tag__kicker')!;
  const nameEl = tagEl.querySelector<HTMLElement>('.map-tag__name')!;
  const enterBtn = tagEl.querySelector<HTMLButtonElement>('.map-tag__btn')!;
  ui.append(tagEl);
  let shown: Place | null = null;
  enterBtn.addEventListener('click', () => shown && on.enter(shown.id));
  // Taps on the tag shouldn't also walk the explorer somewhere.
  tagEl.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---------- The fishing prompt ----------
  const fishEl = document.createElement('div');
  fishEl.className = 'map-tag map-tag--fish';
  fishEl.hidden = true;
  fishEl.innerHTML = `<button type="button" class="map-tag__btn"><span>Cast a line</span><kbd aria-hidden="true">E</kbd></button><p class="map-tag__note" hidden>Wait for it...</p>`;
  const fishBtn = fishEl.querySelector<HTMLButtonElement>('.map-tag__btn')!;
  const fishLabel = fishBtn.querySelector('span')!;
  const fishNote = fishEl.querySelector<HTMLElement>('.map-tag__note')!;
  fishBtn.addEventListener('click', () => on.fish());
  fishEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  ui.append(fishEl);
  let fishState: FishPrompt = null;

  // ---------- Every place, as buttons ----------
  const nav = document.createElement('nav');
  nav.className = 'map-places';
  nav.setAttribute('aria-label', 'Places on the map');
  nav.innerHTML = `<p class="map-places__head">Go to</p><ul>${places
    .map((p) => `<li><button type="button" data-go="${esc(p.id)}">${esc(p.title)} <span>${esc(p.name)}</span></button></li>`)
    .join('')}</ul>`;
  nav.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-go]');
    if (b) on.go(b.dataset.go!);
  });
  // Arrow keys move through the list (and don't walk the explorer); Escape leaves it.
  nav.addEventListener('keydown', (e) => {
    const items = [...nav.querySelectorAll<HTMLButtonElement>('[data-go]')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      items[i].blur();
    } else if (e.key.startsWith('Arrow')) e.stopPropagation();
  });
  root.append(nav);

  let width = root.clientWidth;
  const ro = new ResizeObserver(() => (width = root.clientWidth));
  ro.observe(root);
  // Sizes are measured once whenever a tag's content changes, not every frame.
  const size = new WeakMap<HTMLElement, { w: number; h: number }>();
  const placed = new WeakMap<HTMLElement, number>();
  const measure = (el: HTMLElement) => {
    size.set(el, { w: el.offsetWidth, h: el.offsetHeight });
    placed.delete(el);
  };
  const place = (el: HTMLElement, x: number, y: number) => {
    // Keep clear of the HUD along the top and the screen's edges.
    const { w, h } = size.get(el) ?? { w: 0, h: 0 };
    const vw = width;
    const cx = Math.min(vw - 12 - w / 2, Math.max(12 + w / 2, x));
    const cy = Math.max(84 + h, y - 10);
    const tx = Math.round(cx - w / 2);
    const ty = Math.round(cy - h);
    // Only touch the style when it actually moves.
    const k = tx * 100000 + ty;
    if (placed.get(el) === k) return;
    placed.set(el, k);
    const t = `translate(${tx}px, ${ty}px)`;
    el.style.setProperty('--t', t);
    el.style.transform = t;
  };

  return {
    tag(p, x = 0, y = 0) {
      if (!p) {
        if (shown) {
          tagEl.hidden = true;
          if (tagEl.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        }
        shown = null;
        return;
      }
      if (p !== shown) {
        shown = p;
        tagEl.style.setProperty('--c', p.color);
        tagEl.style.setProperty('--on', onColor(p.color));
        kicker.textContent = p.title;
        nameEl.textContent = p.name;
        enterBtn.setAttribute('aria-label', `Go into ${p.title}: ${p.name}`);
        tagEl.hidden = false;
        tagEl.classList.remove('is-pop');
        measure(tagEl);
        tagEl.classList.add('is-pop');
      }
      place(tagEl, x, y);
    },
    fish(state, x = 0, y = 0) {
      if (state !== fishState) {
        fishState = state;
        fishEl.hidden = !state;
        fishEl.classList.toggle('is-bite', state === 'bite');
        fishBtn.hidden = state === 'wait';
        fishNote.hidden = state !== 'wait';
        fishLabel.textContent = state === 'bite' ? 'Reel it in!' : 'Cast a line';
        fishBtn.querySelector('kbd')!.textContent = touch ? '' : 'E';
        if (state) measure(fishEl);
      }
      if (state) place(fishEl, x, y);
    },
    destroy() {
      ro.disconnect();
      style.remove();
      ui.remove();
      nav.remove();
    },
  };
}
