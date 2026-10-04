// The blueprint page's only script. Everything it shows is already in the
// HTML; this just picks things: a place on the drawing, a tab, a card to turn
// over. Keys look like "place:etymon", "route:3", "word:emmet".

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountBlueprint() {
  const root = document.querySelector<HTMLElement>('[data-bp]');
  if (!root) return;
  const sheet = root.querySelector<HTMLElement>('[data-bp-sheet]')!;
  const svg = root.querySelector<SVGSVGElement>('[data-bp-svg]')!;
  const map = root.querySelector<HTMLElement>('[data-bp-map]')!;
  const live = root.querySelector<HTMLElement>('[data-bp-live]')!;
  const cards = new Map([...root.querySelectorAll<HTMLElement>('[data-card]')].map((el) => [el.dataset.card!, el]));
  const marks = [...svg.querySelectorAll<SVGElement>('[data-key]')];
  const stops = marks.filter((m) => m.hasAttribute('tabindex'));
  const firstKey = [...cards.keys()][0];
  let pinned = firstKey;
  // The card the page was built showing (the hub's).
  let shown = [...cards].find(([, el]) => !el.hidden)?.[0] ?? '';
  let started = false;

  function show(key: string, pin: boolean) {
    const card = cards.get(key);
    if (!card) return false;
    if (key !== shown) {
      cards.get(shown)?.setAttribute('hidden', '');
      card.removeAttribute('hidden');
      shown = key;
    }
    const rel = new Set((card.dataset.rel ?? '').split(' ').filter(Boolean));
    for (const m of marks) {
      m.classList.toggle('is-on', m.dataset.key === key);
      m.classList.toggle('is-rel', rel.has(m.dataset.key!));
    }
    map.classList.add('has-sel');
    if (pin) {
      pinned = key;
      for (const s of stops) s.setAttribute('tabindex', s.dataset.key === key ? '0' : '-1');
      if (!stops.some((s) => s.dataset.key === key)) stops[0]?.setAttribute('tabindex', '0');
      if (started) {
        try {
          history.replaceState(null, '', `#${key}`);
        } catch {
          /* sandboxed: the hash is a nicety */
        }
        live.textContent = card.querySelector('.bp-card__title')?.textContent ?? '';
      }
      const path = svg.querySelector<SVGPathElement>(`.bp-route--paved[data-key="${key}"]`);
      if (path) redraw([path]);
    }
    return true;
  }

  // Paths draw themselves in, one after another.
  function redraw(paths: Element[]) {
    for (const p of paths) p.classList.remove('is-drawing');
    void svg.getBoundingClientRect();
    for (const p of paths) p.classList.add('is-drawing');
  }
  const paved = [...svg.querySelectorAll('.bp-route--paved')];
  root.querySelector('[data-redraw]')?.addEventListener('click', () => redraw(paved));

  // ---------- The drawing ----------
  svg.addEventListener('click', (e) => {
    const m = (e.target as Element).closest<SVGElement>('[data-key]');
    if (m) show(m.dataset.key!, true);
  });
  // A mouse previews what it's over; the pinned card comes back when it leaves.
  svg.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const m = (e.target as Element).closest<SVGElement>('[data-key]');
    if (m) show(m.dataset.key!, false);
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') show(pinned, false);
  });
  svg.addEventListener('focusin', (e) => {
    const m = (e.target as Element).closest<SVGElement>('[data-key]');
    if (m) show(m.dataset.key!, true);
  });
  svg.addEventListener('keydown', (e) => {
    const i = stops.indexOf(document.activeElement as SVGElement);
    if (i < 0) return;
    const go = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next = -1;
    if (go) next = (i + go + stops.length) % stops.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = stops.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show(stops[i].dataset.key!, true);
      // Enter takes you to the card, the way following a link would.
      if (e.key === 'Enter') cards.get(stops[i].dataset.key!)?.querySelector<HTMLElement>('.bp-card__title')?.focus();
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    stops[next].focus();
  });

  // ---------- Buttons that pick something ----------
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-select]');
    if (!b || !show(b.dataset.select!, true)) return;
    const card = cards.get(b.dataset.select!)!;
    card.querySelector<HTMLElement>('.bp-card__title')?.focus({ preventScroll: true });
    // From below the drawing, bring the drawing (and the card) back into view.
    const r = sheet.getBoundingClientRect();
    if (!sheet.contains(b) && (r.top < -40 || r.top > innerHeight * 0.6))
      sheet.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  });

  // Routes listed in a place's card light up on the drawing while you point at them.
  root.addEventListener('pointerover', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-hint]');
    for (const m of marks) m.classList.toggle('is-hint', !!b && m.dataset.key === b.dataset.hint);
  });

  // Opening a card's JSON scrolls it into view inside the card's panel.
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.open && d.classList.contains('bp-json'))
        d.querySelector('pre')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
    },
    true,
  );

  // ---------- Tabs ----------
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const panes = new Map([...root.querySelectorAll<HTMLElement>('[data-pane]')].map((el) => [el.dataset.pane!, el]));
  function openTab(id: string, focus = false) {
    if (!panes.has(id)) return;
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const [k, p] of panes) p.hidden = k !== id;
  }
  openTab(tabs[0]?.dataset.tab ?? '');
  for (const t of tabs) {
    t.addEventListener('click', () => openTab(t.dataset.tab!));
    t.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(t);
      const go = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      const n = go ? (i + go + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (n < 0) return;
      e.preventDefault();
      openTab(tabs[n].dataset.tab!, true);
    });
  }
  // The counts at the top jump to their tab.
  for (const b of root.querySelectorAll<HTMLElement>('[data-tab-go]')) {
    b.addEventListener('click', () => {
      openTab(b.dataset.tabGo!);
      const tab = tabs.find((t) => t.dataset.tab === b.dataset.tabGo);
      tab?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
      tab?.focus({ preventScroll: true });
    });
  }

  // ---------- Cards that turn over ----------
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-flip]')) {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('[data-face="front"]')?.setAttribute('aria-hidden', String(on));
      b.querySelector('[data-face="back"]')?.setAttribute('aria-hidden', String(!on));
    });
  }

  // ---------- Counting up ----------
  const nums = [...root.querySelectorAll<HTMLElement>('[data-count]')];
  if (!reduced() && 'IntersectionObserver' in window) {
    for (const n of nums) n.textContent = '0';
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 900);
        const ease = 1 - (1 - k) ** 3;
        for (const n of nums) n.textContent = String(Math.round(+n.dataset.count! * ease));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(nums[0]?.parentElement ?? root);
  }

  // ---------- Start ----------
  const fromHash = decodeURIComponent(location.hash.slice(1));
  show(cards.has(fromHash) ? fromHash : firstKey, true);
  started = true;
  map.classList.add('is-ready');
  redraw(paved);
}
