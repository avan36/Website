// Floating HTML labels projected from 3D. Each one is a real link (so it is
// keyboard reachable and works as a plain link), and expands into a small
// card with an "Enter" button when the explorer is close.

import { Vector3, type PerspectiveCamera } from 'three';
import type { Place } from './world/shape';

interface El {
  root: HTMLDivElement;
  pill: HTMLAnchorElement;
  enter: HTMLButtonElement;
  card: HTMLDivElement;
  pw: number;
  ph: number;
  x: number;
  y: number;
  state: string;
}

export interface LabelHandlers {
  activate: (id: string) => void;
  enter: (id: string) => void;
  hover: (id: string | null) => void;
}

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface LabelState {
  visible: boolean;
  /** Screen areas (the HUD) labels must stay out of. */
  avoid: Rect[];
  nearId: string | null;
  hoverId: string | null;
  focusId: string | null;
  /** Distance from the camera target to each place, for fading far labels. */
  dist: (id: string) => number;
  enteringId: string | null;
}

// Pick a readable button and kicker color for each accent.
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum([r, g, b]: number[]) {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const mix = (rgb: number[], k: number) => rgb.map((c) => Math.round(c * k));
const css = (rgb: number[]) => `rgb(${rgb.join(' ')})`;
export function accentVars(hex: string) {
  const rgb = hexToRgb(hex);
  const dark = mix(rgb, 0.78);
  const whiteOnDark = 1.05 / (lum(dark) + 0.05);
  const deep = mix(rgb, 0.62);
  return whiteOnDark >= 4.5
    ? { btn: css(dark), on: '#ffffff', deep: css(deep) }
    : { btn: hex, on: '#1d1a16', deep: css(mix(rgb, 0.55)) };
}

export class Labels {
  private els = new Map<string, El>();
  private v = new Vector3();
  private disposers: (() => void)[] = [];

  constructor(host: HTMLElement, places: Pick<Place, 'id' | 'color' | 'name' | 'kicker' | 'blurb' | 'href'>[], handlers: LabelHandlers, touch: boolean) {
    for (const p of places) {
      const root = document.createElement('div');
      root.className = 'isl-label';
      root.dataset.id = p.id;
      root.style.setProperty('--c', p.color);
      const av = accentVars(p.color);
      root.style.setProperty('--c-btn', av.btn);
      root.style.setProperty('--c-on', av.on);
      root.style.setProperty('--c-deep', av.deep);
      const inner = document.createElement('div');
      inner.className = 'isl-label__inner';
      const card = document.createElement('div');
      card.className = 'isl-label__card';
      card.id = `isl-card-${p.id}`;
      const kicker = document.createElement('p');
      kicker.className = 'isl-label__kicker';
      kicker.textContent = p.kicker;
      const blurb = document.createElement('p');
      blurb.className = 'isl-label__blurb';
      blurb.textContent = p.blurb;
      const enter = document.createElement('button');
      enter.type = 'button';
      enter.className = 'isl-label__enter';
      enter.innerHTML = `<span>${touch ? 'Tap to enter' : 'Enter'}</span><kbd aria-hidden="true">↵</kbd>`;
      enter.setAttribute('aria-label', `Enter ${p.name}`);
      enter.tabIndex = -1;
      card.append(kicker, blurb, enter);
      const pill = document.createElement('a');
      pill.className = 'isl-label__pill';
      pill.href = p.href;
      pill.innerHTML = `<span class="isl-label__dot" aria-hidden="true"></span><span class="isl-label__name"></span>`;
      pill.querySelector('.isl-label__name')!.textContent = p.name;
      pill.setAttribute('aria-describedby', card.id);
      inner.append(card, pill);
      root.append(inner);
      host.append(root);

      const onClick = (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let new-tab clicks through
        e.preventDefault();
        handlers.activate(p.id);
      };
      const onEnter = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        handlers.enter(p.id);
      };
      const over = () => handlers.hover(p.id);
      const out = () => handlers.hover(null);
      pill.addEventListener('click', onClick);
      enter.addEventListener('click', onEnter);
      root.addEventListener('pointerenter', over);
      root.addEventListener('pointerleave', out);
      pill.addEventListener('focus', over);
      pill.addEventListener('blur', out);
      this.disposers.push(() => root.remove());
      this.els.set(p.id, { root, pill, enter, card, pw: 0, ph: 0, x: -1, y: -1, state: '' });
    }
  }

  focusEnter(id: string) {
    this.els.get(id)?.enter.focus({ preventScroll: true });
  }

  update(camera: PerspectiveCamera, anchors: Map<string, Vector3>, w: number, h: number, s: LabelState) {
    const order = [...this.els].sort(([a], [b]) => {
      const ra = a === s.nearId || a === s.enteringId ? 0 : a === s.hoverId || a === s.focusId ? 1 : 2;
      const rb = b === s.nearId || b === s.enteringId ? 0 : b === s.hoverId || b === s.focusId ? 1 : 2;
      return ra - rb;
    });
    const avoid = [...s.avoid];
    for (const [id, el] of order) {
      const a = anchors.get(id)!;
      const v = this.v.copy(a).project(camera);
      const onScreen = v.z < 1 && v.x > -1.3 && v.x < 1.3 && v.y > -1.3 && v.y < 1.4;
      const near = s.nearId === id;
      const hover = s.hoverId === id || s.focusId === id;
      const entering = s.enteringId === id;
      const far = s.dist(id) > 34 && !near && !hover;
      let state = 'is-off';
      if (s.visible && onScreen && !far) state = near ? 'is-near' : hover ? 'is-hover' : 'is-idle';
      if (s.enteringId) state = entering ? 'is-near is-going' : 'is-off';

      // Keep labels on screen (the near card most of all), then out of the HUD.
      const open = near || hover || entering;
      let x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h;
      if (state !== 'is-off') {
        if (!el.pw) {
          el.pw = el.pill.offsetWidth || 120;
          el.ph = el.pill.offsetHeight || 32;
        }
        const bw = open ? Math.max(el.pw, el.card.offsetWidth || 252) : el.pw;
        const bh = el.ph + 18 + (open ? (el.card.offsetHeight || 150) + 8 : 0);
        x = Math.min(Math.max(x, bw / 2 + 10), w - bw / 2 - 10);
        y = Math.min(Math.max(y, bh + 10), h - 12);
        for (let pass = 0; pass < 2; pass++) {
          for (const r of avoid) {
            const hit = x + bw / 2 > r.l && x - bw / 2 < r.r && y > r.t && y - bh < r.b;
            if (!hit) continue;
            if (!open) {
              state = 'is-off';
              break;
            }
            // Slide the open card below a top bar, or above a bottom panel.
            if (r.t < h / 2) y = r.b + bh + 4;
            else y = r.t - 4;
          }
          if (state === 'is-off') break;
        }
        if (open && state !== 'is-off') avoid.push({ l: x - bw / 2 - 4, t: y - bh - 4, r: x + bw / 2 + 4, b: y + 4 });
      }
      if (state !== el.state) {
        el.root.className = `isl-label ${state}`;
        el.enter.tabIndex = near ? 0 : -1;
        el.state = state;
        if (state !== 'is-off') el.pw = 0; // re-measure after a state change
      }
      if (state === 'is-off') continue;
      x = Math.round(x);
      y = Math.round(y);
      if (x !== el.x || y !== el.y) {
        el.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.x = x;
        el.y = y;
      }
      el.root.style.zIndex = String(near ? 900 : hover ? 800 : Math.round(500 - s.dist(id) * 5));
    }
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.els.clear();
  }
}
