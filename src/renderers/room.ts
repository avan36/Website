// Inside a building: the parts every spatial view shares. The bar along the
// top (where you are, the way out), the nudge when someone or something is
// within reach ("Talk to Juniper  E"), and one box for the work the building
// stands for, talking to the islanders and looking at things. You talk to
// someone by walking up to them. The map and the island draw the
// room their own way and call in here; the box looks the same in both (inked
// and square over the map, soft over the island), so do the words, and so
// does what the keyboard does:
//
//   E or Enter     talk to, or look at, whatever is within reach
//   Escape         close the box (saying goodbye, mid-conversation); with it closed, leave the room
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
  /** Go back outside (the bar's Leave button, Escape, walking out of the door). */
  leave(): void;
  /** Open a page on this site from the room, with the renderer's wipe. */
  page(href: string): void;
  /** Someone or something has the visitor's attention: face it. */
  engage?(t: RoomTarget | null): void;
}

export interface RoomUI {
  /** In through the door of a place with a room: the bar goes up, and the work it stands for comes up beside it. */
  enter(placeId: string, on: RoomHandlers, opts?: { quiet?: boolean }): void;
  /** Back outside: everything comes down. */
  exit(): void;
  talk(personId: string): void;
  inspect(thingId: string): void;
  /** Close the box, back to walking about. */
  hush(): void;
  /** What's within reach, for the nudge (and E). */
  near(t: RoomTarget | null): void;
  /** Inside a room right now (its place id). */
  readonly at: string | null;
  /** The box is open and has the keys (not while it's only passing, as you come in). */
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
  /**
   * The box is showing the room's overview at rest: the work this building
   * stands for, and what to look at. It doesn't hold the keys or take
   * focus, so you walk about with it up. On a wide screen it stays docked
   * beside the room (a conversation takes its place, and it comes back after);
   * on a narrow one it's there as you come in, and your first step or a tap on
   * the room puts it away. Going into it (Tab, a click) makes it an ordinary box.
   */
  let passive = false;
  /** What the box is showing. */
  let showing: 'look' | 'talk' | 'thing' | null = null;
  /** The overview was put away (its close button): it stays away this visit. */
  let tucked = false;
  const docked = () => boxDocksRight(window.innerWidth, window.innerHeight);

  const person = (id: string) => place?.interior?.people.find((c) => c.id === id) ?? null;
  const thing = (id: string) => place?.interior?.things.find((t) => t.id === id) ?? null;
  const thingName = (t: Thing) => `the ${t.names[0]}`;
  const internal = (href: string) => href.startsWith('/') && !href.startsWith('/busybeer/');

  function link(l: Pointer | undefined) {
    if (!l) return '';
    const external = !internal(l.href);
    return `<a class="w-talk__more" href="${esc(l.href)}"${external ? ' target="_blank" rel="noopener"' : ''} data-talk-link>${esc(l.label)} <span aria-hidden="true">${external ? '↗' : '→'}</span></a>`;
  }

  /** Open the box with this inside it, and move focus in (unless it's only passing, see `passive`). */
  function show(html: string, color: string, label: string, what: NonNullable<typeof showing>, passing = false) {
    passive = passing;
    showing = what;
    if (box.hidden && !passing) returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    box.innerHTML = html;
    box.style.setProperty('--c', color);
    box.setAttribute('aria-label', label);
    box.hidden = false;
    if (passing) return paintNudge();
    nudge.hidden = true;
    const first = box.querySelector<HTMLElement>('[data-first]') ?? box.querySelector<HTMLElement>('.w-talk__choice') ?? box.querySelector<HTMLElement>('a, button');
    first?.focus({ preventScroll: true });
  }

  /** Done with whatever's in the box: back to the overview at rest beside the room (on a wide screen), or to just walking. */
  function hush() {
    if (box.hidden || passive) return;
    // Closing a conversation is saying goodbye.
    const c = talking;
    close();
    rest();
    if (c) toast({ title: c.name, body: c.farewell, color: c.color });
  }

  function rest() {
    if (place?.interior && docked() && !tucked) look(true, true);
  }

  /** Put the overview away for this visit. */
  function tuck() {
    tucked = true;
    close();
  }

  /** Take the box down altogether. */
  function close() {
    if (box.hidden) return;
    const passing = passive;
    passive = false;
    showing = null;
    const hadFocus = box.contains(document.activeElement);
    box.hidden = true;
    box.innerHTML = '';
    talking = null;
    on?.engage?.(null);
    const back = returnFocus;
    returnFocus = null;
    if (back && document.contains(back) && !box.contains(back)) back.focus({ preventScroll: true });
    else if (!passing || hadFocus) (document.activeElement as HTMLElement | null)?.blur?.();
    paintNudge();
  }

  /**
   * The room's overview: the work this building stands for, its page (the big
   * button) and where to get it or try it (the smaller one), and what to look
   * at. The room's own description is read out, not shown. At rest it's
   * `passive`; asked for, it's a box like any other.
   */
  function look(passing = false, quiet = false) {
    if (!place?.interior) return;
    const room = place.interior;
    const work = place.project ? world.projects.find((x) => x.slug === place!.project) : undefined;
    const shots = (work?.shots ?? [])
      .slice(0, 3)
      .map((x) => `<img class="w-talk__shot is-${x.frame}" src="${esc(x.src)}" alt="${esc(x.alt)}" width="${x.width}" height="${x.height}" loading="lazy" decoding="async">`)
      .join('');
    const about = work
      ? `<div class="w-talk__work">
           <p class="w-talk__headline">${esc(work.headline)}</p>
           ${work.body.map((b) => `<p class="w-talk__body">${esc(b)}</p>`).join('')}
           ${shots ? `<div class="w-talk__shots">${shots}</div>` : ''}
         </div>`
      : '';
    const things = room.things.map((t) => `<button type="button" class="w-talk__choice" data-talk="thing:${t.id}">Look at ${esc(thingName(t))}</button>`).join('');
    const p = place;
    show(
      `${CLOSE}
       <div class="w-talk__head"><div class="w-talk__who"><span class="w-talk__kicker">Inside ${esc(the(p))}</span><h2 class="w-talk__name" id="w-talk-title">${esc(work ? work.name : cap(the(p)))}</h2></div></div>
       ${about}
       <div class="w-talk__ctas">
         <a class="w-talk__choice w-talk__choice--go w-talk__cta" href="${esc(p.href ?? '/')}" data-talk-link><span>${work ? `Read more<span class="w-talk__long"> about ${esc(work.name)}</span>` : 'The full page'}</span> <span aria-hidden="true">→</span></a>
         ${lead(work)}
       </div>
       ${things ? `<p class="w-talk__label">Have a look at</p><div class="w-talk__choices" role="group" aria-label="Things to look at">${things}</div>` : ''}`,
      p.color,
      `Inside ${the(p)}`,
      'look',
      passing,
    );
    if (!quiet) announce(`Inside ${the(p)}. ${work ? `${work.name}: ${work.headline} ` : ''}${room.description}`);
  }

  /** The work's own way in, beside its page: the App Store, or the thing itself (or failing those, its first link). */
  function lead(work: World['projects'][number] | undefined) {
    const l = work?.links.find((x) => x.kind === 'appstore' || x.kind === 'primary') ?? work?.links[0];
    if (!l) return '';
    const external = !internal(l.href);
    // "Download on the App Store" is just "App Store" on a phone, so it fits beside the page's button.
    const label = l.kind === 'appstore' ? `<span class="w-talk__long">Download on the </span>App Store` : esc(l.label);
    return `<a class="w-talk__choice w-talk__choice--alt w-talk__cta" href="${esc(l.href)}"${external ? ' target="_blank" rel="noopener"' : ''} data-talk-link><span>${label}</span> <span aria-hidden="true">${external ? '↗' : '→'}</span></a>`;
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
    // A topic named for a project keeps the project's own case: busy beer, QuizMate, eQoScan.
    const label = (name: string) => world.projects.find((x) => x.name.toLowerCase() === name)?.name ?? cap(name);
    const choices = c.topics
      .map((t) => `<button type="button" class="w-talk__choice${done.has(t.id) ? ' is-asked' : ''}" data-talk="topic:${t.id}"${t.id === topic?.id ? ' aria-current="true"' : ''}>${esc(label(t.names[0]))}</button>`)
      .join('');
    show(
      `${CLOSE}
       <div class="w-talk__head" style="--who:${c.color}"><span class="w-talk__face" aria-hidden="true"></span><div class="w-talk__who"><span class="w-talk__kicker">${esc(cap(c.role))}</span><h2 class="w-talk__name" id="w-talk-title">${esc(c.name)}</h2></div></div>
       <p class="w-talk__line is-said" style="--who:${c.color}" id="w-talk-line" aria-live="polite">${esc(line)}</p>
       ${topic ? link(topic.link) : ''}
       <p class="w-talk__label" id="w-talk-ask">Ask about</p>
       <div class="w-talk__choices" role="group" aria-labelledby="w-talk-ask">${choices}</div>`,
      place.color,
      `Talking to ${c.name}`,
      'talk',
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
       ${link(t.link)}`,
      place.color,
      cap(t.names[0]),
      'thing',
    );
    announce(`${cap(t.names[0])}. ${t.description}`);
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
    if (cmd === 'close') showing === 'look' ? tuck() : hush();
    else if (cmd === 'thing') inspect(arg);
    else if (cmd === 'topic' && talking) talk(talking.id, arg);
  });
  // Taps on the box shouldn't walk the explorer somewhere behind it.
  for (const el of [box, bar, nudge]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Tabbing into the overview makes it an ordinary box (arrows between its choices); a
  // click in it (a link, say) doesn't. On a narrow screen, a tap anywhere else puts it away.
  let clicked = false;
  box.addEventListener('pointerdown', () => (clicked = true), true);
  box.addEventListener('focusin', () => {
    if (!clicked) passive = false;
    clicked = false;
  });
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (passive && !box.hidden && !docked() && !box.contains(t) && !bar.contains(t) && !nudge.contains(t)) close();
  };
  window.addEventListener('pointerdown', onDown, true);

  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-room]');
    if (!b) return;
    if (b.dataset.room === 'leave') (close(), on?.leave());
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
      // The overview at rest beside the room is part of being inside: Escape leaves.
      if (box.hidden || (passive && docked())) on?.leave();
      else if (passive) close();
      else hush();
      return;
    }
    if (!box.hidden && passive) {
      // The overview at rest: the keys walk (on a narrow screen a step puts it away, though
      // not a key still held from walking in through the door); E talks to whoever's in reach.
      if (/^Arrow|^Key[WASD]$|^Space$/.test(e.code)) return void (e.repeat || docked() || close());
      const control = t !== document.body && (t.tagName === 'A' || t.tagName === 'BUTTON');
      if ((e.code === 'KeyE' || (e.key === 'Enter' && !control)) && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (within) act();
        else box.querySelector<HTMLElement>('.w-talk__choice')?.focus();
      }
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
    if (!place || !within || (!box.hidden && !passive)) return void (nudge.hidden = true);
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
      tucked = false;
      if (opts.quiet) (announce(`Inside ${the(p)}. Press Escape to leave.`), rest());
      else look(true);
    },
    exit() {
      if (!place) return;
      close();
      place = null;
      on = null;
      within = null;
      html.classList.remove('isl-inside');
      bar.hidden = true;
      nudge.hidden = true;
    },
    talk: (id) => talk(id),
    inspect,
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
      return !box.hidden && !passive;
    },
  };
}
