// Runs on the home page. Tiny and three.js-free: it wires the HUD and the
// list view, and only when the visitor is actually playing does it pull in
// the game with a dynamic import().

import { Sound } from './audio';
import type { GameHandle } from './game';

const html = document.documentElement;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);

const stage = $<HTMLElement>('#isl-stage');
const labelsHost = $<HTMLElement>('#isl-labels');
const wipe = $<HTMLElement>('#isl-wipe');
const cover = $<HTMLElement>('#isl-cover');
const card = $<HTMLElement>('#isl-card');
const live = $<HTMLElement>('#isl-live');

const store = {
  get(area: 'local' | 'session', k: string) {
    try {
      return (area === 'local' ? localStorage : sessionStorage).getItem(k);
    } catch {
      return null;
    }
  },
  set(area: 'local' | 'session', k: string, v: string | null) {
    try {
      const s = area === 'local' ? localStorage : sessionStorage;
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
if (touch) html.classList.add('isl-touch');
const sound = new Sound();

let game: GameHandle | null = null;
let booting: Promise<void> | null = null;

function announce(msg: string) {
  if (live) live.textContent = msg;
}

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

function fallbackToList() {
  html.classList.remove('isl-gl', 'isl-returning', 'isl-ready');
  html.classList.add('isl-nogl');
  setMode('list', false);
}

async function startGame() {
  if (game) {
    game.resume();
    return;
  }
  if (booting || !stage || !labelsHost || !wipe) return booting ?? undefined;
  const returnTo = store.get('session', 'island:return');
  html.classList.remove('isl-ready');
  booting = (async () => {
    try {
      const { createGame } = await import('./game');
      game = await createGame({
        stage,
        labelsHost,
        wipe,
        cover,
        returnTo,
        reducedMotion,
        touch,
        sound,
        onReady: () => {
          html.classList.add('isl-ready');
          store.set('session', 'island:return', null);
        },
        onIntroDone: () => {
          html.classList.add('isl-played');
          if (!store.get('local', 'island:hinted')) html.classList.add('isl-hinting');
        },
        onFirstMove: () => {
          html.classList.remove('isl-hinting');
          store.set('local', 'island:hinted', '1');
          if (touch || window.innerWidth < 640) collapseCard(true);
        },
        onLost: () => {
          game?.destroy();
          game = null;
          fallbackToList();
        },
      });
      // Test/debug handle: dev builds, or production with ?debug in the URL.
      if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
        (window as unknown as { __island?: GameHandle }).__island = game;
      }
    } catch (err) {
      console.warn('Island could not start, showing the list view instead.', err);
      game = null;
      fallbackToList();
    } finally {
      booting = null;
    }
  })();
  return booting;
}

function setMode(mode: 'play' | 'list', persist = true) {
  const play = mode === 'play';
  html.classList.toggle('isl-mode-play', play);
  html.classList.toggle('isl-mode-list', !play);
  if (persist) store.set('session', 'island:view', play ? 'island' : 'list');
  document.querySelectorAll<HTMLButtonElement>('[data-isl-list]').forEach((b) => b.setAttribute('aria-pressed', String(!play)));
  if (play) {
    window.scrollTo(0, 0);
    void startGame();
    announce('Island view. Use WASD or the arrow keys to explore, or tab through the places.');
  } else {
    game?.pause();
    html.classList.remove('isl-returning');
    announce('List view.');
  }
}

function collapseCard(collapsed: boolean) {
  if (!card) return;
  card.classList.toggle('is-collapsed', collapsed);
  card.querySelector('[data-isl-card-toggle]')?.setAttribute('aria-expanded', String(!collapsed));
  store.set('local', 'island:card', collapsed ? 'collapsed' : null);
}

// ---------- Wire up ----------

document.querySelectorAll<HTMLButtonElement>('[data-isl-list]').forEach((b) =>
  b.addEventListener('click', () => {
    setMode('list');
    $<HTMLElement>('#list-top')?.focus({ preventScroll: true });
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-isl-play]').forEach((b) =>
  b.addEventListener('click', () => {
    setMode('play');
    $<HTMLElement>('[data-isl-list]')?.focus({ preventScroll: true });
  }),
);
const soundButtons = document.querySelectorAll<HTMLButtonElement>('[data-isl-sound]');
soundButtons.forEach((b) =>
  b.addEventListener('click', () => {
    const on = !sound.on;
    sound.setOn(on);
    soundButtons.forEach((x) => x.setAttribute('aria-pressed', String(on)));
  }),
);
card?.querySelector('[data-isl-card-toggle]')?.addEventListener('click', () => collapseCard(!card.classList.contains('is-collapsed')));
if (store.get('local', 'island:card') === 'collapsed') collapseCard(true);

window.addEventListener('hashchange', () => {
  if (location.hash === '#work' && html.classList.contains('isl-mode-play')) {
    setMode('list');
    document.getElementById('work')?.scrollIntoView();
  }
});

// bfcache: free the GPU when leaving, rebuild when coming back.
window.addEventListener('pagehide', () => {
  game?.destroy();
  game = null;
  sound.dispose();
});
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  wipe?.getAnimations().forEach((a) => a.cancel());
  if (wipe) wipe.hidden = true;
  if (html.classList.contains('isl-mode-play')) {
    const ret = store.get('session', 'island:return');
    if (ret) html.classList.add('isl-returning');
    void startGame();
  }
});

// ---------- Go ----------

if (!hasWebGL()) {
  fallbackToList();
} else {
  html.classList.add('isl-gl');
  if (html.classList.contains('isl-mode-play')) void startGame();
  else store.set('session', 'island:return', null);
}
