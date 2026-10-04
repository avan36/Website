// A floating prompt for something to do (not somewhere to go): the fishing
// spot's "Cast a line". It is built from the same parts as a place's label
// (pill, card, kicker, blurb, button), so it looks and moves like one, and
// keeps out of the HUD's way the same way an open label does.

import { Vector3, type PerspectiveCamera } from 'three';
import { accentVars, type Rect } from '../labels';

export interface PromptText {
  kicker: string;
  blurb: string;
  action: string;
  /** Dim the button (nothing to do yet, but you can). */
  muted?: boolean;
  /** Pulse the button: now! */
  urgent?: boolean;
}

export class Prompt {
  readonly root = document.createElement('div');
  private card = document.createElement('div');
  private pill = document.createElement('span');
  private kicker = document.createElement('p');
  private blurb = document.createElement('p');
  private button = document.createElement('button');
  private action = document.createElement('span');
  private v = new Vector3();
  private open = false;
  private text = '';
  private pulse: Animation | null = null;
  private x = -1;
  private y = -1;

  constructor(host: HTMLElement, o: { name: string; color: string; key: string; onPress: () => void }) {
    const av = accentVars(o.color);
    this.root.className = 'isl-label is-off';
    this.root.style.setProperty('--c', o.color);
    this.root.style.setProperty('--c-btn', av.btn);
    this.root.style.setProperty('--c-on', av.on);
    this.root.style.setProperty('--c-deep', av.deep);
    const inner = document.createElement('div');
    inner.className = 'isl-label__inner';
    this.card.className = 'isl-label__card';
    this.kicker.className = 'isl-label__kicker';
    this.blurb.className = 'isl-label__blurb';
    this.button.type = 'button';
    this.button.className = 'isl-label__enter';
    this.button.tabIndex = -1;
    const kbd = document.createElement('kbd');
    kbd.setAttribute('aria-hidden', 'true');
    kbd.textContent = o.key;
    this.button.append(this.action, kbd);
    this.card.append(this.kicker, this.blurb, this.button);
    this.pill.className = 'isl-label__pill';
    this.pill.innerHTML = '<span class="isl-label__dot" aria-hidden="true"></span><span class="isl-label__name"></span>';
    this.pill.querySelector('.isl-label__name')!.textContent = o.name;
    inner.append(this.card, this.pill);
    this.root.append(inner);
    host.append(this.root);
    const press = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      o.onPress();
    };
    this.button.addEventListener('click', press);
    this.pill.addEventListener('click', press);
    // Keep a press on the prompt from also reaching the canvas as a tap.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(t: PromptText) {
    const key = `${t.kicker}|${t.blurb}|${t.action}|${t.muted}|${t.urgent}`;
    if (key === this.text) return;
    this.text = key;
    this.kicker.textContent = t.kicker;
    this.blurb.textContent = t.blurb;
    this.action.textContent = t.action;
    this.button.style.opacity = t.muted ? '0.62' : '';
    this.pulse?.cancel();
    this.pulse = t.urgent ? this.button.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: 260, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }) : null;
  }

  /** Open or close it. Returns true if that changed anything. */
  show(open: boolean) {
    if (open === this.open) return false;
    this.open = open;
    this.root.className = `isl-label ${open ? 'is-near' : 'is-off'}`;
    this.button.tabIndex = open ? 0 : -1;
    if (!open && this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    return true;
  }

  get isOpen() {
    return this.open;
  }

  /** Float it over `anchor`, kept on screen and out of the HUD. Returns the screen area it takes. */
  place(camera: PerspectiveCamera, anchor: Vector3, w: number, h: number, avoid: Rect[]): Rect | null {
    if (!this.open) return null;
    const v = this.v.copy(anchor).project(camera);
    let x = (v.x * 0.5 + 0.5) * w;
    let y = (-v.y * 0.5 + 0.5) * h;
    const bw = Math.max(this.pill.offsetWidth || 110, this.card.offsetWidth || 252);
    const bh = (this.pill.offsetHeight || 32) + 18 + (this.card.offsetHeight || 150) + 8;
    x = Math.min(Math.max(x, bw / 2 + 10), w - bw / 2 - 10);
    y = Math.min(Math.max(y, bh + 10), h - 12);
    for (let pass = 0; pass < 2; pass++) {
      for (const r of avoid) {
        if (!(x + bw / 2 > r.l && x - bw / 2 < r.r && y > r.t && y - bh < r.b)) continue;
        if (r.t < h / 2) y = r.b + bh + 4;
        else y = r.t - 4;
      }
    }
    x = Math.round(x);
    y = Math.round(y);
    if (x !== this.x || y !== this.y) {
      this.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      this.x = x;
      this.y = y;
    }
    this.root.style.zIndex = '950';
    return { l: x - bw / 2 - 4, t: y - bh - 4, r: x + bw / 2 + 4, b: y + 4 };
  }

  focus() {
    this.button.focus({ preventScroll: true });
  }

  dispose() {
    this.pulse?.cancel();
    this.root.remove();
  }
}
