// Inside a building: the parts every spatial view shares. The bar along the
// top (where you are, the way out), the nudge when someone or something is
// within reach ("Talk to Juniper  E"), and one conversation box for talking
// to the islanders and looking at things. The map and the island draw the
// room their own way and call in here; the box looks the same in both (inked
// and square over the map, soft over the island), so do the words, and so
// does what the keyboard does:
//
//   E or Enter     talk to, or look at, whatever is within reach
//   Escape         close the box; with it closed, leave the room
//   arrows         move between the choices in the box
//
// The box isn't modal: the room stays on screen behind it. Focus moves into
// it when it opens and goes back where it was when it closes, and what people
// say is announced as they say it.

import type { Character, Place, Pointer, Thing, World } from '../world/schema';

export type RoomTarget = { kind: 'person' | 'thing'; id: string };

/**
 * On a wide screen the box docks to the right (see WorldUI.astro), so the
 * renderers draw the room in what's left: this many CSS pixels wide.
 */
export const BOX_SIDE = 440 + 48;
export const boxDocksRight = (cssW: number, cssH: number) => cssW >= 1000 && cssH >= 560;

export interface RoomHandlers {
  /** Go back outside (the Leave button, Escape, walking out of the door). */
  leave(): void;
  /** Open a page on this site from the room, with the renderer's wipe. */
  page(href: string): void;
  /** Someone or something has the visitor's attention: face it. */
  engage?(t: RoomTarget | null): void;
}

export interface RoomUI {
  /** In through the door of a place with a room: the bar goes up, and the room is described. */
  enter(placeId: string, on: RoomHandlers, opts?: { quiet?: boolean }): void;
  /** Back outside: everything comes down. */
  exit(): void;
  talk(personId: string): void;
  inspect(thingId: string): void;
  /** The room's overview: what it's like, who's here, what there is to look at. */
  look(): void;
  /** Close the box, back to walking about. */
  hush(): void;
  /** What's within reach, for the nudge (and E). */
  near(t: RoomTarget | null): void;
  /** Inside a room right now (its place id). */
  readonly at: string | null;
  /** The box is open. */
  readonly busy: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const the = (p: Place) => (/^the\s/i.test(p.title) ? `the ${p.title.slice(4)}` : p.title);

const CLOSE =
  '<button type="button" class="w-talk__close" data-talk="close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
const EYE =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

export function createRoomUI(world: World, announce: (s: string) => void, toast: (t: { title: string; body?: string; color?: string }) => void): RoomUI {
  const bar = document.getElementById('w-room')!;
  const barTitle = document.getElementById('w-room-title')!;
  const nudge = document.getElementById('w-near') as HTMLButtonElement;
  const nudgeText = nudge.querySelector<HTMLElement>('.w-near__text')!;
  const box = document.getElementById('w-talk')!;
  const html = document.documentElement;
  const touch = html.classList.contains('isl-touch');

  let place: Place | null = null;
  let on: RoomHandlers | null = null;
  let within: RoomTarget | null = null;
  /** Who's talking (for the topics already asked), and what they've been asked. */
  let talking: Character | null = null;
  const asked = new Map<string, Set<string>>();
  /** Where focus was before the box opened, to go back to. */
  let returnFocus: HTMLElement | null = null;

  const person = (id: string) => place?.interior?.people.find((c) => c.id === id) ?? null;
  const thing = (id: string) => place?.interior?.things.find((t) => t.id === id) ?? null;
  const thingName = (t: Thing) => `the ${t.names[0]}`;
  const internal = (href: string) => href.startsWith('/') && !href.startsWith('/busybeer/');

  function link(l: Pointer | undefined) {
    if (!l) return '';
    const external = !internal(l.href);
    return `<a class="w-talk__more" href="${esc(l.href)}"${external ? ' target="_blank" rel="noopener"' : ''} data-talk-link>${esc(l.label)} <span aria-hidden="true">${external ? '↗' : '→'}</span></a>`;
  }

  /** Open the box with this inside it, and move focus in. */
  function show(html: string, color: string, label: string) {
    if (box.hidden) returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    box.innerHTML = html;
    box.style.setProperty('--c', color);
    box.setAttribute('aria-label', label);
    box.hidden = false;
    nudge.hidden = true;
    const first = box.querySelector<HTMLElement>('[data-first]') ?? box.querySelector<HTMLElement>('.w-talk__choice') ?? box.querySelector<HTMLElement>('a, button');
    first?.focus({ preventScroll: true });
  }

  function hush() {
    if (box.hidden) return;
    box.hidden = true;
    box.innerHTML = '';
    talking = null;
    on?.engage?.(null);
    const back = returnFocus;
    returnFocus = null;
    if (back && document.contains(back) && !box.contains(back)) back.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    paintNudge();
  }

  function look() {
    if (!place?.interior) return;
    const room = place.interior;
    const people = room.people
      .map((c) => `<button type="button" class="w-talk__choice" data-talk="person:${c.id}" style="--who:${c.color}"><i aria-hidden="true"></i>Talk to ${esc(c.name)}, ${esc(c.role)}</button>`)
      .join('');
    const things = room.things.map((t) => `<button type="button" class="w-talk__choice" data-talk="thing:${t.id}">Look at ${esc(thingName(t))}</button>`).join('');
    const p = place;
    show(
      `${CLOSE}
       <div class="w-talk__head"><div class="w-talk__who"><span class="w-talk__kicker">Inside</span><h2 class="w-talk__name" id="w-talk-title">${esc(cap(the(p)))}</h2></div></div>
       <p class="w-talk__desc">${esc(room.description)}</p>
       <p class="w-talk__label">Who's here</p>
       <div class="w-talk__choices" role="group" aria-label="Who's here">${people}</div>
       <p class="w-talk__label">Have a look at</p>
       <div class="w-talk__choices" role="group" aria-label="Things to look at">${things}</div>
       <div class="w-talk__foot">
         <a class="w-talk__choice w-talk__choice--go" href="${esc(p.href ?? '/')}" data-talk-link>See ${esc(p.name)} <span aria-hidden="true">→</span></a>
         <button type="button" class="w-talk__choice" data-talk="leave">Leave ${esc(the(p))}</button>
       </div>`,
      p.color,
      `Inside ${the(p)}`,
    );
    announce(`Inside ${the(p)}. ${room.description}`);
  }

  function talk(id: string, topicId?: string) {
    const c = person(id);
    if (!c || !place) return;
    const firstTime = talking?.id !== c.id;
    talking = c;
    on?.engage?.({ kind: 'person', id });
    const done = asked.get(c.id) ?? new Set<string>();
    asked.set(c.id, done);
    const topic = topicId ? c.topics.find((t) => t.id === topicId) : undefined;
    if (topic) done.add(topic.id);
    const line = topic ? topic.reply : c.greeting;
    const choices = c.topics
      .map((t) => `<button type="button" class="w-talk__choice${done.has(t.id) ? ' is-asked' : ''}" data-talk="topic:${t.id}"${t.id === topic?.id ? ' aria-current="true"' : ''}>${esc(cap(t.names[0]))}</button>`)
      .join('');
    show(
      `${CLOSE}
       <div class="w-talk__head" style="--who:${c.color}"><span class="w-talk__face" aria-hidden="true"></span><div class="w-talk__who"><span class="w-talk__kicker">${esc(cap(c.role))}</span><h2 class="w-talk__name" id="w-talk-title">${esc(c.name)}</h2></div></div>
       <p class="w-talk__line is-said" style="--who:${c.color}" id="w-talk-line" aria-live="polite">${esc(line)}</p>
       ${topic ? link(topic.link) : ''}
       <p class="w-talk__label" id="w-talk-ask">Ask about</p>
       <div class="w-talk__choices" role="group" aria-labelledby="w-talk-ask">${choices}</div>
       <div class="w-talk__foot"><button type="button" class="w-talk__choice" data-talk="bye">Goodbye</button>${place.interior!.people.length > 1 ? `<button type="button" class="w-talk__choice" data-talk="look">Someone else</button>` : ''}</div>`,
      place.color,
      `Talking to ${c.name}`,
    );
    // Keep focus on the topic just asked (so arrows carry on from there), or the first one.
    const current = topic ? box.querySelector<HTMLElement>(`[data-talk="topic:${topic.id}"]`) : null;
    current?.focus({ preventScroll: true });
    if (firstTime || topic) announce(`${c.name}: ${line}`);
  }

  function inspect(id: string) {
    const t = thing(id);
    if (!t || !place) return;
    talking = null;
    on?.engage?.({ kind: 'thing', id });
    show(
      `${CLOSE}
       <div class="w-talk__head"><span class="w-talk__face w-talk__face--thing" aria-hidden="true">${EYE}</span><div class="w-talk__who"><span class="w-talk__kicker">Have a look</span><h2 class="w-talk__name" id="w-talk-title">${esc(cap(t.names[0]))}</h2></div></div>
       <p class="w-talk__line" id="w-talk-line">${esc(t.description)}</p>
       ${link(t.link)}
       <div class="w-talk__foot"><button type="button" class="w-talk__choice" data-talk="close" data-first>Done</button></div>`,
      place.color,
      cap(t.names[0]),
    );
    announce(`${cap(t.names[0])}. ${t.description}`);
  }

  function bye() {
    const c = talking;
    hush();
    if (c) toast({ title: c.name, body: c.farewell, color: c.color });
  }

  // ---------- Clicks and keys ----------

  box.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-talk-link]');
    if (a) {
      const href = a.getAttribute('href') ?? '';
      // Pages on this site go with the renderer's wipe; anything else opens as a link.
      if (internal(href) && !e.metaKey && !e.ctrlKey && !e.shiftKey && on) {
        e.preventDefault();
        on.page(href);
      }
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-talk]');
    if (!b) return;
    const [cmd, arg] = b.dataset.talk!.split(':');
    if (cmd === 'close') hush();
    else if (cmd === 'bye') bye();
    else if (cmd === 'leave') (hush(), on?.leave());
    else if (cmd === 'look') look();
    else if (cmd === 'person') talk(arg);
    else if (cmd === 'thing') inspect(arg);
    else if (cmd === 'topic' && talking) talk(talking.id, arg);
  });
  // Taps on the box shouldn't walk the explorer somewhere behind it.
  for (const el of [box, bar, nudge]) el.addEventListener('pointerdown', (e) => e.stopPropagation());

  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-room]');
    if (!b) return;
    if (b.dataset.room === 'leave') (hush(), on?.leave());
    else if (b.dataset.room === 'look') (box.hidden || talking ? look() : hush());
  });

  nudge.addEventListener('click', () => act());

  /** Talk to, or look at, whatever is within reach. */
  function act() {
    if (!within) return false;
    if (within.kind === 'person') talk(within.id);
    else inspect(within.id);
    return true;
  }

  const typing = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
  // Capture, so the room answers before the renderer underneath does anything with the same key.
  const onKey = (e: KeyboardEvent) => {
    if (!place || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (typing(t) || (document.getElementById('w-dialog') as HTMLDialogElement | null)?.open || t.closest?.('.isl-views')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!box.hidden) hush();
      else on?.leave();
      return;
    }
    if (!box.hidden) {
      // Arrows move between the choices; everything else stays with the box (no walking off mid-sentence).
      const inBox = box.contains(t);
      if (e.key.startsWith('Arrow')) {
        const items = [...box.querySelectorAll<HTMLElement>('.w-talk__choice, .w-talk__more')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        e.preventDefault();
        e.stopPropagation();
        items[i < 0 ? 0 : (i + step + items.length) % items.length]?.focus();
        return;
      }
      if (!inBox && (e.code === 'KeyE' || e.key === 'Enter')) {
        e.preventDefault();
        e.stopPropagation();
        box.querySelector<HTMLElement>('.w-talk__choice')?.focus();
      }
      if (/^Key[WASD]$/.test(e.code) || e.code === 'Space') e.stopPropagation();
      return;
    }
    const onControl = t !== document.body && (t.tagName === 'A' || t.tagName === 'BUTTON');
    if ((e.code === 'KeyE' || (e.key === 'Enter' && !onControl)) && !e.repeat && within) {
      e.preventDefault();
      e.stopPropagation();
      act();
    }
  };
  window.addEventListener('keydown', onKey, true);

  function paintNudge() {
    if (!place || !within || !box.hidden) return void (nudge.hidden = true);
    const c = within.kind === 'person' ? person(within.id) : null;
    const t = within.kind === 'thing' ? thing(within.id) : null;
    const text = c ? `Talk to ${c.name}` : t ? `Look at ${thingName(t)}` : '';
    if (!text) return void (nudge.hidden = true);
    nudgeText.textContent = text;
    nudge.style.setProperty('--c', c?.color ?? place.color);
    nudge.setAttribute('aria-label', `${text}${touch ? '' : ' (E)'}`);
    nudge.hidden = false;
  }

  return {
    enter(placeId, handlers, opts = {}) {
      const p = world.places.find((x) => x.id === placeId);
      if (!p?.interior) return;
      place = p;
      on = handlers;
      within = null;
      talking = null;
      html.classList.add('isl-inside');
      bar.style.setProperty('--c', p.color);
      barTitle.textContent = cap(the(p));
      bar.setAttribute('aria-label', `Inside ${the(p)}`);
      bar.hidden = false;
      if (opts.quiet) announce(`Inside ${the(p)}. Press Escape to leave.`);
      else look();
    },
    exit() {
      if (!place) return;
      hush();
      place = null;
      on = null;
      within = null;
      html.classList.remove('isl-inside');
      bar.hidden = true;
      nudge.hidden = true;
    },
    talk: (id) => talk(id),
    inspect,
    look,
    hush,
    near(t) {
      if (t?.id === within?.id && t?.kind === within?.kind) return;
      within = t;
      paintNudge();
    },
    get at() {
      return place?.id ?? null;
    },
    get busy() {
      return !box.hidden;
    },
  };
}
