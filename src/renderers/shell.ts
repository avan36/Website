// The home page's host. It reads the world, keeps the store, wires the HUD,
// and mounts whichever renderer the visitor picked: the 3D island, the 2D map
// or the text adventure (the list is server-rendered and always there).
// Renderers are loaded with import() only when chosen, so a visitor who only
// reads the list never downloads three.js.

import { readGeo, readWorld } from '../world/client';
import { createStore } from '../world/store';
import { Sound } from './audio';
import { createUI } from './ui';
import type { Renderer, RendererContext, RendererHandle, ViewId } from './types';

const LOADERS: Record<Exclude<ViewId, 'list'>, () => Promise<Renderer>> = {
  island: () => import('./island'),
  map: () => import('./map'),
  text: () => import('./text'),
};
const VIEWS: ViewId[] = ['island', 'map', 'text', 'list'];
const NAMES: Record<ViewId, string> = { island: 'Island', map: 'Map', text: 'Text adventure', list: 'List' };

const html = document.documentElement;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const stage = $<HTMLElement>('#isl-stage')!;
const wipe = $<HTMLElement>('#isl-wipe')!;
const card = $<HTMLElement>('#isl-card');
const live = $<HTMLElement>('#isl-live');

const kv = (area: 'local' | 'session') => ({
  get(k: string) {
    try {
      return (area === 'local' ? localStorage : sessionStorage).getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      const s = area === 'local' ? localStorage : sessionStorage;
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
});
const local = kv('local');
const session = kv('session');

const world = readWorld();
const geo = readGeo();
const store = createStore(world);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
if (touch) html.classList.add('isl-touch');
const sound = new Sound();

const announce = (msg: string) => {
  if (live) live.textContent = msg;
};
const ui = createUI(world, store, announce);

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
const gl = hasWebGL();
if (gl) html.classList.add('isl-gl');

// ---------- Mounting ----------

let view: ViewId = (html.dataset.view as ViewId) || 'list';
let handle: RendererHandle | null = null;
let host: HTMLElement | null = null;
let token = 0;
let returnTo = session.get('island:return');

/** What to show instead when a view can't run here. */
const fallback = (v: ViewId): ViewId => (v === 'island' && !gl ? (reducedMotion ? 'list' : 'map') : v);

function unmount() {
  token++;
  handle?.destroy();
  handle = null;
  host?.remove();
  host = null;
  ui.close();
  store.flush();
}

async function mount(v: Exclude<ViewId, 'list'>) {
  const my = ++token;
  html.classList.remove('isl-ready');
  host = document.createElement('div');
  host.className = 'view-host';
  host.dataset.view = v;
  stage.prepend(host);
  const ctx: RendererContext = {
    world,
    geo,
    store,
    host,
    reducedMotion,
    touch,
    sound,
    returnTo,
    go,
    ui,
    ready: (reveal) => {
      if (my !== token) return;
      html.classList.add('isl-ready', 'isl-hud-on');
      if (reveal !== 'self') revealFrom(reveal);
      session.set('island:return', null);
      returnTo = null;
      if (!local.get('island:hinted')) window.setTimeout(() => my === token && html.classList.add('isl-hinting'), 3200);
      window.setTimeout(() => html.classList.add('isl-played'), 3200);
    },
    fail: (reason) => {
      if (my !== token) return;
      console.warn(`The ${v} view stopped; switching views.`, reason);
      if (v === 'island') gl3dLost = true;
      void setView(v === 'island' && !reducedMotion ? 'map' : 'list', { persist: false });
    },
    firstMove: () => {
      html.classList.remove('isl-hinting');
      local.set('island:hinted', '1');
      if (touch || window.innerWidth < 640) collapseCard(true);
    },
  };
  try {
    const mod = await LOADERS[v]();
    if (my !== token) return;
    const h = await mod.mount(ctx);
    if (my !== token) return h.destroy();
    handle = h;
    if (document.hidden) h.pause();
  } catch (err) {
    if (my !== token) return;
    ctx.fail(err);
  }
}

let gl3dLost = false;

type ViewOpts = { persist?: boolean; focus?: boolean; url?: boolean };

async function setView(next: ViewId, { persist = true, focus = false, url }: ViewOpts = {}) {
  url ??= persist;
  next = fallback(next);
  if (next === 'island' && gl3dLost) next = reducedMotion ? 'list' : 'map';
  const changed = next !== view || (next !== 'list' && !handle && !host);
  view = next;
  html.dataset.view = next;
  html.classList.toggle('isl-mode-play', next !== 'list');
  html.classList.toggle('isl-mode-list', next === 'list');
  document.querySelectorAll<HTMLButtonElement>('[data-view-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewSet === next)));
  if (persist) session.set('island:view', next);
  if (url) {
    // Shareable: /?view=text opens the text adventure.
    const u = new URL(location.href);
    u.searchParams.set('view', next);
    u.hash = '';
    history.replaceState(history.state, '', u);
  }
  if (!changed) return;
  unmount();
  if (next === 'list') {
    html.classList.remove('isl-returning');
    announce('List view.');
    if (focus) $<HTMLElement>('#list-top')?.focus({ preventScroll: true });
    return;
  }
  window.scrollTo(0, 0);
  announce(`${NAMES[next]} view.`);
  await mount(next);
  if (focus) $<HTMLElement>('[data-views-toggle]')?.focus({ preventScroll: true });
}

// ---------- Going into a place ----------

function go(placeId: string, from?: { x: number; y: number }) {
  const place = world.places.find((p) => p.id === placeId);
  if (!place?.href) return;
  store.dispatch({ type: 'move', at: placeId, pos: store.state.presence.pos });
  store.flush();
  session.set('island:wipe', JSON.stringify({ slug: placeId, color: place.color }));
  session.set('island:return', placeId);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = from?.x ?? w / 2;
  const y = from?.y ?? h / 2;
  const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 20;
  wipe.style.background = place.color;
  wipe.hidden = false;
  const anim = wipe.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], {
    duration: reducedMotion ? 10 : 620,
    easing: 'cubic-bezier(.7,0,.25,1)',
    fill: 'forwards',
  });
  anim.onfinish = () => window.location.assign(place.href!);
}

/** Coming back out of a place: shrink the cover away, centred on (x, y). */
function revealFrom(at?: { x: number; y: number }) {
  const cover = $<HTMLElement>('#isl-cover');
  if (!cover || !html.classList.contains('isl-returning')) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = at?.x ?? w / 2;
  const y = at?.y ?? h / 2;
  const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 20;
  const anim = cover.animate([{ clipPath: `circle(${R}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }], {
    duration: reducedMotion ? 10 : 700,
    easing: 'cubic-bezier(.6,0,.2,1)',
    fill: 'forwards',
  });
  anim.onfinish = () => {
    html.classList.remove('isl-returning');
    anim.cancel();
  };
}

// ---------- HUD ----------

function collapseCard(collapsed: boolean) {
  if (!card) return;
  card.classList.toggle('is-collapsed', collapsed);
  card.querySelector('[data-isl-card-toggle]')?.setAttribute('aria-expanded', String(!collapsed));
  local.set('island:card', collapsed ? 'collapsed' : null);
}
card?.querySelector('[data-isl-card-toggle]')?.addEventListener('click', () => collapseCard(!card.classList.contains('is-collapsed')));
if (local.get('island:card') === 'collapsed') collapseCard(true);

const soundButtons = document.querySelectorAll<HTMLButtonElement>('[data-isl-sound]');
soundButtons.forEach((b) =>
  b.addEventListener('click', () => {
    sound.setOn(!sound.on);
    soundButtons.forEach((x) => x.setAttribute('aria-pressed', String(sound.on)));
  }),
);

// View switcher: a small disclosure menu.
const viewsToggle = $<HTMLButtonElement>('[data-views-toggle]');
const viewsMenu = $<HTMLElement>('#isl-views-menu');
const setMenu = (open: boolean) => {
  if (!viewsMenu || !viewsToggle) return;
  viewsMenu.hidden = !open;
  viewsToggle.setAttribute('aria-expanded', String(open));
  if (open) viewsMenu.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
};
viewsToggle?.addEventListener('click', () => setMenu(!!viewsMenu?.hidden));
document.addEventListener('pointerdown', (e) => {
  if (viewsMenu && !viewsMenu.hidden && !(e.target as HTMLElement).closest('.isl-views')) setMenu(false);
});
viewsMenu?.addEventListener('keydown', (e) => {
  const items = [...viewsMenu.querySelectorAll<HTMLElement>('.isl-views__item, .isl-views__json')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'Escape') setMenu(false), viewsToggle?.focus();
  if (e.key === 'ArrowDown') e.preventDefault(), items[(i + 1) % items.length]?.focus();
  if (e.key === 'ArrowUp') e.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus();
});
document.querySelectorAll<HTMLButtonElement>('[data-view-set]').forEach((b) =>
  b.addEventListener('click', () => {
    setMenu(false);
    void setView(b.dataset.viewSet as ViewId, { focus: true });
  }),
);

// Word hoard: the count in the HUD, and what happens when a word turns up.
const hoardButtons = document.querySelectorAll<HTMLButtonElement>('[data-hoard-open]');
const paintHoard = (bump = false) => {
  const { found } = store.state.progress;
  const label = `${found.length}/${world.lostWords.length}`;
  document.querySelectorAll('[data-hoard-count]').forEach((el) => (el.textContent = label));
  hoardButtons.forEach((b) => {
    b.setAttribute('aria-label', `Word hoard: ${found.length} of ${world.lostWords.length} lost words found`);
    if (bump) b.classList.remove('is-bump'), void b.offsetWidth, b.classList.add('is-bump');
  });
  html.classList.toggle('isl-hoard-full', found.length === world.lostWords.length);
  html.classList.toggle('is-night', store.state.progress.night);
};
hoardButtons.forEach((b) => b.addEventListener('click', () => ui.openHoard()));
store.subscribe((_, events) => {
  for (const e of events) {
    if (e.type === 'found') paintHoard(true);
    if (e.type === 'hoard-complete')
      window.setTimeout(
        () =>
          ui.toast({
            title: 'The word hoard is full',
            body: 'Night falls on the island.',
            color: '#ffd56b',
            action: { label: 'See it', run: () => ui.openHoard() },
          }),
        1200,
      );
    if (e.type === 'night') paintHoard();
  }
  if (!events.some((e) => e.type === 'found')) paintHoard();
});
paintHoard();

// ---------- Page lifecycle ----------

window.addEventListener('hashchange', () => {
  if (location.hash === '#work' && view !== 'list') {
    void setView('list');
    document.getElementById('work')?.scrollIntoView();
  }
});
document.addEventListener('visibilitychange', () => (document.hidden ? handle?.pause() : handle?.resume()));

// bfcache: free the GPU when leaving, rebuild when coming back.
window.addEventListener('pagehide', () => {
  store.flush();
  unmount();
  sound.dispose();
});
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  wipe.getAnimations().forEach((a) => a.cancel());
  wipe.hidden = true;
  returnTo = session.get('island:return');
  if (view !== 'list') {
    if (returnTo) html.classList.add('isl-returning');
    void mount(view);
  }
});

// ---------- Go ----------

{
  // The head script already picked a view before first paint; respect it,
  // but correct it if this device can't run it.
  const first = VIEWS.includes(view) ? view : 'list';
  const fixed = fallback(first);
  if (fixed === 'list') session.set('island:return', null);
  view = '' as ViewId; // so setView mounts it
  void setView(fixed, { persist: fixed !== first, url: false });
}

// Test and debug handle: dev builds, or production with ?debug.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __world?: unknown }).__world = { world, store, geo, setView: (v: ViewId) => setView(v) };
}
