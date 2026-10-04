// The overlays every renderer shares: toasts, the lost-word card, the catch
// card and the word hoard. One <dialog> is reused for all three cards, so
// focus handling, Escape and the backdrop come from the platform. Inside a
// building, room.ts adds the room's bar and the conversation box.

import type { World } from '../world/schema';
import type { WorldStore } from '../world/store';
import type { RendererContext, ViewId } from './types';
import { createRoomUI } from './room';
import { gamesRow } from './games/catalog';

type UI = RendererContext['ui'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CLOSE =
  '<button class="w-close" value="close" formmethod="dialog" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';

const FISH =
  '<svg class="w-catch__fish" width="64" height="40" viewBox="0 0 64 40" aria-hidden="true"><path d="M4 20c8-12 22-17 36-12 6 2 10 6 13 12-3 6-7 10-13 12-14 5-28 0-36-12Z" fill="currentColor"/><path d="M50 20 63 9v22Z" fill="currentColor"/><circle cx="17" cy="17" r="2.6" fill="#fff"/><path d="M27 12c3 5 3 11 0 16" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

const ICON = (d: string, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const VIEW_ICONS: Record<ViewId | 'data', string> = {
  island: '<path d="M3.5 19.5c2.6-3.2 5.4-4.8 8.5-4.8s5.9 1.6 8.5 4.8"/><path d="M12 14.7c0-3.2.6-6 2-8.7"/><path d="M14 6c-2-1.6-5-1.6-7.2.3M14 6c1.6-1.9 4.5-2.3 6.6-.8M14 6c-.3 2.1.3 4.1 1.8 5.6"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6Z"/><path d="M9 4v14M15 6v14"/>',
  text: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="m7 10 3 2.5L7 15M12.5 15H17"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  data: '<path d="M8 4c-2 0-3 1-3 3v2.5c0 1.2-.8 2.2-2 2.5 1.2.3 2 1.3 2 2.5V17c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2.5c0 1.2.8 2.2 2 2.5-1.2.3-2 1.3-2 2.5V17c0 2-1 3-3 3"/>',
};

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const spell = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function createUI(world: World, store: WorldStore, announce: (s: string) => void): UI & { close(): void } {
  const dialog = document.getElementById('w-dialog') as HTMLDialogElement;
  const toasts = document.getElementById('w-toasts')!;
  const total = world.lostWords.length;
  const placeTitle = (id: string) => world.places.find((p) => p.id === id)?.title ?? '';
  const placeColor = (id: string) => world.places.find((p) => p.id === id)?.color ?? '#d9461f';

  function open(html: string, color: string, wide = false) {
    dialog.innerHTML = `<form method="dialog" class="w-card" style="--c:${color}">${CLOSE}${html}</form>`;
    dialog.classList.toggle('w-dialog--wide', wide);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[autofocus]')?.focus();
  }
  dialog.addEventListener('click', (e) => {
    // A click on the backdrop lands on the dialog itself.
    if (e.target === dialog) dialog.close();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-ui]');
    if (!t) return;
    const [cmd, arg] = t.dataset.ui!.split(':');
    if (cmd === 'hoard') openHoard();
    if (cmd === 'word') showWord(arg);
    if (cmd === 'night') store.dispatch({ type: 'night', on: !store.state.progress.night }), openHoard();
    if (cmd === 'reset' && confirm('Forget every word you found? They go back where they were hidden.')) store.dispatch({ type: 'reset' }), openHoard();
  });

  const progressBar = (count: number) =>
    `<div class="w-progress"><span>${count} of ${total} lost words found</span><span class="w-progress__track">${world.lostWords
      .map((_, i) => `<i class="${i < count ? 'on' : ''}"></i>`)
      .join('')}</span></div>`;

  function showWord(id: string) {
    const w = world.lostWords.find((x) => x.id === id);
    if (!w) return;
    const count = store.state.progress.found.length;
    // Its life on a 500 → today line.
    const from = 500;
    const to = new Date().getFullYear();
    const pct = (y: number) => (((y - from) / (to - from)) * 100).toFixed(1);
    const letters = [...w.word].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('');
    open(
      `<p class="w-kicker">Lost word · ${esc(placeTitle(w.place))}</p>
       <h2 class="w-word__word" id="w-dialog-title" lang="en">${letters}</h2>
       <p class="w-word__gloss">${esc(w.gloss)}</p>
       <p class="w-word__life"><span>${w.first}</span><span class="w-word__bar" aria-hidden="true"><i style="left:${pct(w.first)}%;right:${(100 - +pct(w.died)).toFixed(1)}%"></i></span><span>${w.died}</span></p>
       <p class="w-word__story">${esc(w.story)}</p>
       <p class="w-word__more">From the museum of lost words in <a href="/work/etymon">Etymon</a>.</p>
       <div class="w-foot">${progressBar(count)}<button class="w-btn" type="button" data-ui="hoard" autofocus>Word hoard</button></div>`,
      placeColor(w.place),
    );
    announce(`Lost word: ${w.word}. ${w.gloss}.`);
  }

  function showCatch(slug: string, fresh: boolean) {
    const p = world.posts.find((x) => x.slug === slug);
    if (!p) return;
    const caught = store.state.progress.caught.length;
    open(
      `<p class="w-kicker">${fresh ? 'Caught off the pier' : 'Caught again'}</p>
       ${FISH}
       <h2 class="w-title" id="w-dialog-title">${esc(p.title)}</h2>
       <p class="w-catch__date">${dateFmt.format(new Date(p.date + 'T00:00:00Z'))}</p>
       <p class="w-catch__desc">${esc(p.description)}</p>
       <p class="w-catch__tally">${caught === world.posts.length ? `You've caught every post I've written (${caught}).` : `${caught} of ${world.posts.length} posts caught.`}</p>
       <div class="w-foot"><a class="w-btn w-btn--c" href="${esc(p.href)}" autofocus>Read it</a><button class="w-btn w-btn--ghost" value="close">Throw it back</button></div>`,
      '#2b8fb8',
    );
    announce(`You caught a post: ${p.title}.`);
  }

  function openHoard() {
    const { found, night } = store.state.progress;
    const full = found.length === total;
    const slots = world.lostWords
      .map((w) => {
        const c = placeColor(w.place);
        if (found.includes(w.id))
          return `<button type="button" class="w-slot is-found" style="--c:${c}" data-ui="word:${w.id}"><span class="w-slot__where">${esc(placeTitle(w.place))}</span><span class="w-slot__word">${esc(w.word)}</span><span class="w-slot__gloss">${esc(w.gloss)}</span></button>`;
        const blanks = '<i></i>'.repeat(Math.min(w.word.length, 9));
        return `<div class="w-slot"><span class="w-slot__where">${esc(placeTitle(w.place))}</span><span class="w-slot__blank" aria-label="${w.word.length} letters">${blanks}</span><span class="w-slot__hint">${esc(w.hint)}</span></div>`;
      })
      .join('');
    open(
      `<p class="w-kicker">Word hoard</p>
       <h2 class="w-title" id="w-dialog-title">${full ? 'The hoard is full' : `${found.length} of ${total} found`}</h2>
       <p class="w-hoard__intro">${cap(spell(total))} words English lost are hidden around the island. Each one is a story about where words go. Find them all and the island changes.</p>
       ${full ? `<div class="w-hoard__full"><p><strong>Night has fallen on the island.</strong>The lanterns are lit. Switch between night and day whenever you like.</p><button type="button" class="w-switch" role="switch" aria-checked="${night}" aria-label="Night" data-ui="night"></button></div>` : ''}
       <div class="w-hoard__grid">${slots}</div>
       ${gamesRow(world, (g) => store.state.progress.games[g])}
       ${found.length ? '<button type="button" class="w-hoard__reset" data-ui="reset">Forget what I found</button>' : ''}`,
      '#1f2a44',
      true,
    );
  }

  function toast(t: { title: string; body?: string; color?: string; action?: { label: string; run(): void } }) {
    const el = document.createElement('div');
    el.className = 'w-toast';
    if (t.color) el.style.setProperty('--c', t.color);
    el.innerHTML = `<span class="w-toast__dot"></span><span class="w-toast__text"><span class="w-toast__title">${esc(t.title)}</span>${t.body ? `<span class="w-toast__body">${esc(t.body)}</span>` : ''}</span>`;
    if (t.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-toast__action';
      b.textContent = t.action.label;
      b.onclick = () => (dismiss(), t.action!.run());
      el.append(b);
    }
    while (toasts.children.length > 2) toasts.firstElementChild!.remove();
    toasts.append(el);
    announce(t.body ? `${t.title}. ${t.body}` : t.title);
    let timer = window.setTimeout(dismiss, 5200);
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', () => (timer = window.setTimeout(dismiss, 2400)));
    function dismiss() {
      clearTimeout(timer);
      el.classList.add('is-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }
  }

  /**
   * The portal's menu: every way of seeing the island, the 3D island first and
   * biggest, the text adventure and the blueprint tucked underneath. Resolves
   * with the view picked, or null if the visitor closed it (or picked the view
   * they're already in). The blueprint is a plain link to /blueprint.
   */
  function choosePortal(current: ViewId): Promise<ViewId | null> {
    const here = (v: ViewId) => (v === current ? ' is-here' : '');
    const tag = (v: ViewId) => (v === current ? '<span class="w-portal__here">You are here</span>' : '');
    // Picking the view you're in just closes the menu: you stay where you are.
    const big = (v: ViewId, name: string, note: string) =>
      `<button class="w-portal__opt w-portal__opt--main${here(v)}" value="${v}"><span class="w-portal__icon">${ICON(VIEW_ICONS[v], 30)}</span><span class="w-portal__text"><span class="w-portal__name">${name}${tag(v)}</span><span class="w-portal__note">${note}</span></span></button>`;
    const mid = (v: ViewId, name: string, note: string) =>
      `<button class="w-portal__opt${here(v)}" value="${v}"><span class="w-portal__icon">${ICON(VIEW_ICONS[v])}</span><span class="w-portal__text"><span class="w-portal__name">${name}${tag(v)}</span><span class="w-portal__note">${note}</span></span></button>`;
    const small = (v: ViewId, name: string) =>
      `<button class="w-portal__more${here(v)}" value="${v}">${ICON(VIEW_ICONS[v], 16)}${name}${v === current ? ' (here)' : ''}</button>`;
    dialog.returnValue = '';
    open(
      `<p class="w-kicker">The portal</p>
       <h2 class="w-title w-portal__title" id="w-dialog-title" tabindex="-1" autofocus>Where to?</h2>
       <p class="w-portal__intro">One island, a few ways to see it. Pick one and step through.</p>
       ${big('island', 'The 3D island', 'Walk, swim and fish your way around it')}
       <div class="w-portal__row">
         ${mid('map', 'The pixel map', 'Top-down, in pixel art')}
         ${mid('list', 'The list', 'Just the work, plainly')}
       </div>
       <div class="w-portal__extra"><span>Or</span>${small('text', 'Text adventure')}<a class="w-portal__more" href="/blueprint">${ICON(VIEW_ICONS.data, 16)}Under the hood</a></div>`,
      '#8b5cf6',
    );
    announce('The portal. Where to? Pick a way of seeing the island.');
    return new Promise((resolve) => {
      dialog.addEventListener(
        'close',
        () => {
          const v = dialog.returnValue as ViewId;
          resolve(['island', 'map', 'text', 'list'].includes(v) && v !== current ? v : null);
        },
        { once: true },
      );
    });
  }

  const room = createRoomUI(world, announce, toast);

  return {
    announce,
    toast,
    showWord,
    showCatch,
    openHoard,
    choosePortal,
    room,
    close: () => {
      if (dialog.open) dialog.close();
      room.exit();
    },
  };
}
