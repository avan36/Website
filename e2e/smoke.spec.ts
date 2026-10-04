// Every main page loads without errors, on a desktop and on a phone.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, homeReady, phone, watchErrors } from './helpers';

const PAGES = [
  '/',
  '/?view=map',
  '/?view=text',
  '/?view=list',
  '/about',
  '/colophon',
  '/blueprint',
  '/blog',
  '/contact',
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
          // A fresh tab each time: the home page remembers its view per tab.
          const page = await context.newPage();
          const errors = watchErrors(page);
          const res = await page.goto(path, { waitUntil: 'load' });
          expect(res?.status(), `${path} status`).toBe(200);
          if (path === '/' || path.startsWith('/?')) {
            await homeReady(page, path.match(/view=(\w+)/)?.[1]);
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
