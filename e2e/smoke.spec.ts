// Every main page loads without errors, on a desktop and on a phone.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, islandReady, phone, watchErrors } from './helpers';

const PAGES = [
  '/',
  '/island',
  '/island?view=map',
  '/island?view=text',
  '/island?view=list',
  '/about',
  '/colophon',
  '/blueprint',
  '/blog',
  '/contact',
  '/adventure',
  '/work/middle-place',
  '/work/busy-beer',
  '/work/map-of-evolution',
  '/work/privacy-research',
  '/work/quizmate',
  '/work/eqoscan',
  '/work/etymon',
];
const MISSING = '/this-page-does-not-exist';

for (const [name, device] of [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', phone(390, 844)],
] as const) {
  test.describe(name, () => {
    test.use(device);

    test(`pages load with no errors (${name})`, async ({ context, page }) => {
      // The first blog post, whatever it is today.
      const blog = await page.request.get('/blog');
      const post = (await blog.text()).match(/href="(\/blog\/[^"#?]+)"/)?.[1];
      expect(post, 'a post linked from /blog').toBeTruthy();

      for (const path of [...PAGES, post!]) {
        await test.step(path, async () => {
          // A fresh tab each time: the island remembers its view per tab.
          const page = await context.newPage();
          const errors = watchErrors(page);
          const res = await page.goto(path, { waitUntil: 'load' });
          expect(res?.status(), `${path} status`).toBe(200);
          if (path.startsWith('/island')) {
            await islandReady(page, path.match(/view=(\w+)/)?.[1]);
            // A moment for the first frames and any late errors.
            await page.waitForTimeout(1000);
          } else {
            await expect(page.locator('h1').first()).toBeVisible();
          }
          await expectNoHorizontalScroll(page);
          expect(errors, `errors on ${path}`).toEqual([]);
          await page.close();
        });
      }

      await test.step('404', async () => {
        const errors = watchErrors(page, { allow404: true });
        const res = await page.goto(MISSING);
        expect(res?.status()).toBe(404);
        await expect(page.locator('h1').first()).toBeVisible();
        await expectNoHorizontalScroll(page);
        expect(errors).toEqual([]);
      });
    });
  });
}

test.describe('the home page', () => {
  test('reads as a page, with the island peeking in and nothing heavy loaded', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: "Hi, I'm Ambrose." })).toBeVisible();
    await expect(page.locator('.peek img')).toBeVisible();
    await expect(page.locator('.post').first()).toBeVisible();
    await expect(page.locator('[data-signup]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the peek opens the island, and the island comes back home', async ({ page }) => {
    await page.goto('/');
    await page.locator('.peek').click();
    await page.waitForURL('**/island');
    await islandReady(page);
    await page.locator('.isl-brand').click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.locator('.peek')).toBeVisible();
  });

  test('old links still land: views on the island, work on the home page', async ({ page }) => {
    await page.goto('/?view=text');
    await page.waitForURL('**/island?view=text');
    await islandReady(page, 'text');
    await page.goto('/#work');
    await expect(page.getByRole('heading', { name: "Things I've made" })).toBeInViewport();
  });

  test('the Island link in the header and footer goes to the island', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('.site-header a[href="/island"]')).toBeVisible();
    await expect(page.locator('.site-footer a[href="/island"]')).toBeVisible();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the home page and the list can still be read', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: "Hi, I'm Ambrose." })).toBeVisible();
    await page.goto('/island');
    await expect(page.locator('#work-title')).toBeVisible();
  });
});

test('with reduced motion the island opens on the list', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/island');
  await islandReady(page, 'list');
});

test('world.json is valid JSON with places and lost words', async ({ request }) => {
  const res = await request.get('/world.json');
  expect(res.ok()).toBe(true);
  const world = await res.json();
  expect(Array.isArray(world.places) && world.places.length).toBeTruthy();
  expect(Array.isArray(world.lostWords) && world.lostWords.length).toBeTruthy();
  expect(world.activities.some((a: { kind: string }) => a.kind === 'portal')).toBe(true);
});

test('pack.json is the portable half: content with every link absolute', async ({ request }) => {
  const res = await request.get('/pack.json');
  expect(res.ok()).toBe(true);
  const pack = await res.json();
  expect(pack.projects.length).toBeGreaterThan(0);
  expect(pack.projects.every((p: { page: string }) => p.page.startsWith('https://'))).toBe(true);
  expect(pack.play.lostWords.length).toBeGreaterThan(0);
  expect(pack).not.toHaveProperty('places');
  const schema = await request.get('/pack.schema.json');
  expect(schema.ok()).toBe(true);
  expect((await schema.json()).title).toBe('Content pack');
});
