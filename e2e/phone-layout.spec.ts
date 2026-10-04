// The home page's HUD on narrow phones: nothing spills off screen, nothing
// overlaps, and the toasts stay small pills.
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, homeReady, phone, seed, watchErrors } from './helpers';

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/** The boxes and overflows the checks below need, measured in one go. */
function measure(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | Range | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null; // not shown
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const $ = (s: string) => document.querySelector(s);
    const toggle = $('[data-views-toggle]') as HTMLElement;
    // The current view's icon (one per view; only the current one shows).
    const icon = [...toggle.querySelectorAll('.isl-views__cur svg')].map(box).find(Boolean) ?? null;
    const title = $('.isl-card__title') as HTMLElement;
    // Where the text itself ends, which can spill past its box.
    const extent = (el: Element | null) => {
      if (!el) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      return box(r);
    };
    const chips = [...document.querySelectorAll('.isl-nav > *')].map(box).filter((b): b is Box => !!b);
    return {
      vw: window.innerWidth,
      brand: box($('.isl-brand')),
      brandText: extent($('.isl-brand')),
      nav: box($('.isl-nav')),
      chips,
      toggle: box(toggle),
      toggleOverflow: toggle.scrollWidth - toggle.clientWidth,
      icon,
      chevron: box(toggle.querySelector('.isl-views__chev')),
      card: box($('.isl-card')),
      title: box(title),
      titleOverflow: title.scrollWidth - title.clientWidth,
      titleText: extent(title),
      cardToggle: box($('[data-isl-card-toggle]')),
    };
  });
}

const inside = (inner: Box, outer: Box, slack = 0.5) =>
  inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;

/** Opens a play view, lets the HUD settle and collapses the intro card, as a phone does after the first move. */
async function openHud(page: Page, view: string) {
  await page.goto(`/?view=${view}`);
  await homeReady(page, view);
  // The HUD fades and slides in after the view is ready; measure it at rest.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.isl-top > *, .isl-card')].every((el) => {
      const cs = getComputedStyle(el);
      return cs.opacity === '1' && cs.transform === 'none';
    }),
  );
  const cardToggle = page.locator('[data-isl-card-toggle]');
  if ((await cardToggle.getAttribute('aria-expanded')) === 'true') await cardToggle.click();
  await expect(cardToggle).toHaveAttribute('aria-expanded', 'false');
  // The collapse animates.
  await page.waitForFunction(() => document.querySelector('.isl-card')!.getAnimations({ subtree: true }).length === 0);
}

/** Widths where the brand's name is known to spill out of its pill (see the test at the end). */
const BRAND_SPILLS = new Set<number>();

for (const width of [320, 375, 390]) {
  test.describe(`${width}px phone`, () => {
    test.use(phone(width));

    test(`HUD fits a ${width}px phone in the island and map views`, async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page);
      for (const view of ['island', 'map']) {
        await test.step(view, async () => {
          await openHud(page, view);

          const m = await measure(page);
          const ctx = JSON.stringify(m);

          // Top bar: brand and nav on screen, side by side, not overlapping.
          expect(m.brand && m.nav, ctx).toBeTruthy();
          expect(m.brand!.left, `brand off the left edge: ${ctx}`).toBeGreaterThanOrEqual(0);
          expect(m.nav!.right, `nav off the right edge: ${ctx}`).toBeLessThanOrEqual(m.vw + 0.5);
          for (const chip of m.chips) expect(chip.right, `a nav button is off screen: ${ctx}`).toBeLessThanOrEqual(m.vw + 0.5);
          const overlapX = m.brand!.right > m.nav!.left + 0.5 && m.brand!.left < m.nav!.right;
          const overlapY = m.brand!.top < m.nav!.bottom && m.nav!.top < m.brand!.bottom;
          expect(overlapX && overlapY, `brand overlaps the nav: ${ctx}`).toBe(false);
          if (!BRAND_SPILLS.has(width)) expect(m.brandText!.right, `brand text spills out of its pill: ${ctx}`).toBeLessThanOrEqual(m.brand!.right + 0.5);

          // The collapsed card's title fits on its line.
          expect(m.card && m.title, ctx).toBeTruthy();
          expect(m.titleOverflow, `card title overflows: ${ctx}`).toBeLessThanOrEqual(1);
          expect(m.card!.right, `card off screen: ${ctx}`).toBeLessThanOrEqual(m.vw + 0.5);
          if (m.cardToggle && m.titleText!.top < m.cardToggle.bottom && m.cardToggle.top < m.titleText!.bottom)
            expect(m.titleText!.right, `card title runs under its toggle: ${ctx}`).toBeLessThanOrEqual(m.cardToggle.left + 0.5);

          // The view switcher pill holds its icon and its chevron.
          expect(m.toggle && m.icon && m.chevron, ctx).toBeTruthy();
          expect(m.toggleOverflow, `view switcher content overflows: ${ctx}`).toBeLessThanOrEqual(1);
          expect(inside(m.icon!, m.toggle!), `view icon outside its pill: ${ctx}`).toBe(true);
          expect(inside(m.chevron!, m.toggle!), `chevron outside its pill: ${ctx}`).toBe(true);
          // Their boxes may touch (the chevron tucks in by 2px; both SVGs have empty margins), not pile up.
          expect(m.chevron!.left, `chevron overlaps the icon: ${ctx}`).toBeGreaterThanOrEqual(m.icon!.right - 4);

          // A toast (the same markup src/renderers/ui.ts makes) stays a compact pill.
          await page.evaluate(() => {
            document.getElementById('w-toasts')!.insertAdjacentHTML(
              'beforeend',
              '<div class="w-toast" data-e2e-toast><span class="w-toast__dot"></span><span class="w-toast__text"><span class="w-toast__title">It got away</span><span class="w-toast__body">Cast again?</span></span><button type="button" class="w-toast__action">Try again</button></div>',
            );
          });
          const toast = page.locator('[data-e2e-toast]');
          await expect(toast).toBeVisible();
          await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // it pops in
          const t = (await toast.boundingBox())!;
          expect(t.height, `toast is ${t.width}x${t.height}`).toBeLessThan(120);
          expect(t.width, `toast is ${t.width}x${t.height}`).toBeGreaterThan(t.height);
          expect(t.x, 'toast off the left edge').toBeGreaterThanOrEqual(0);
          expect(t.x + t.width, 'toast off the right edge').toBeLessThanOrEqual(m.vw + 0.5);
          await toast.evaluate((el) => el.remove());

          await expectNoHorizontalScroll(page);
        });
      }
      expect(errors).toEqual([]);
    });
  });
}
