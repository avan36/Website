// The adventure: a separate mode with chapters you drive. The page works as a
// plain list with a map, and Drive opens the 3D chapter over it.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, phone, watchErrors } from './helpers';

for (const [name, device] of [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', phone(390, 844)],
] as const) {
  test.describe(name, () => {
    test.use(device);

    test(`drive Wesleyan and come back (${name})`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/adventure');
      await expect(page.getByRole('heading', { name: 'Wesleyan' })).toBeVisible();
      await expect(page.getByRole('img', { name: /map of Wesleyan/i })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.getByRole('button', { name: 'Drive' }).click();
      const stage = page.locator('[data-adv-stage]');
      await expect(stage).toBeVisible();
      await expect(stage.locator('canvas')).toBeVisible();
      await expect(stage.locator('[data-adv-lap]')).toHaveText('Lap 1/2');
      await expect(stage.locator('[data-adv-next]')).toHaveText('Next: Usdan');
      if (name === 'phone') await expect(stage.locator('[data-pad="gas"]')).toBeVisible();
      await expectNoHorizontalScroll(page);

      await stage.getByRole('button', { name: 'Chapters' }).click();
      await expect(stage).toBeHidden();
      await expect(stage.locator('canvas')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}

test('the island links to the adventure', async ({ page }) => {
  await page.goto('/?view=list');
  await expect(page.locator('a[href="/adventure"]').first()).toBeAttached();
});
