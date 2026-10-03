// Floating HTML labels projected from 3D. Each one is a real link (so it is
// keyboard reachable and works as a plain link), and expands into a small
// card with an "Enter" button when the explorer is close.

import { Vector3, type PerspectiveCamera } from 'three';
import type { Place } from './world/shape';

interface El {
  root: HTMLDivElement;
  pill: HTMLAnchorElement;
  enter: HTMLButtonElement;
  x: number;
  y: number;
  state: string;
}

export interface LabelHandlers {
  activate: (id: string) => void;
  enter: (id: string) => void;
  hover: (id: string | null) => void;
}

export interface LabelState {
  visible: boolean;
  nearId: string | null;
  hoverId: string | null;
  focusId: string | null;
  /** Distance from the camera target to each place, for fading far labels. */
  dist: (id: string) => number;
  enteringId: string | null;
}

export class Labels {
  private els = new Map<string, El>();
  private v = new Vector3();
  private disposers: (() => void)[] = [];

  constructor(host: HTMLElement, places: Place[], handlers: LabelHandlers, touch: boolean) {
    for (const p of places) {
      const root = document.createElement('div');
      root.className = 'isl-label';
      root.dataset.id = p.id;
      root.style.setProperty('--c', p.color);
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
      this.els.set(p.id, { root, pill, enter, x: -1, y: -1, state: '' });
    }
  }

  focusEnter(id: string) {
    this.els.get(id)?.enter.focus({ preventScroll: true });
  }

  update(camera: PerspectiveCamera, anchors: Map<string, Vector3>, w: number, h: number, s: LabelState) {
    for (const [id, el] of this.els) {
      const a = anchors.get(id)!;
      const v = this.v.copy(a).project(camera);
      const onScreen = v.z < 1 && v.x > -1.3 && v.x < 1.3 && v.y > -1.3 && v.y < 1.4;
      const near = s.nearId === id;
      const hover = s.hoverId === id || s.focusId === id;
      const entering = s.enteringId === id;
      const far = s.dist(id) > 30 && !near && !hover;
      let state = 'is-off';
      if (s.visible && onScreen && !far) state = near ? 'is-near' : hover ? 'is-hover' : 'is-idle';
      if (s.enteringId) state = entering ? 'is-near is-going' : 'is-off';
      if (state !== el.state) {
        el.root.className = `isl-label ${state}`;
        el.enter.tabIndex = near ? 0 : -1;
        el.state = state;
      }
      if (state === 'is-off') continue;
      // Keep labels clear of the HUD and on screen (the near card most of all).
      const top = near ? Math.min(330, h * 0.5) : hover ? Math.min(250, h * 0.4) : 118;
      const x = Math.round(Math.min(Math.max((v.x * 0.5 + 0.5) * w, near || hover ? 140 : 70), w - (near || hover ? 140 : 70)));
      const y = Math.round(Math.min(Math.max((-v.y * 0.5 + 0.5) * h, top), h - 24));
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
