// The text adventure: a few commands give sensible answers, and the portal
// leads on to the 3D island.
import { expect, test, type Page } from '@playwright/test';
import { homeReady, seed, watchErrors, wordIds } from './helpers';

/** Types a command and returns the turn it printed. */
async function say(page: Page, command: string) {
  const turns = page.locator('.view-host[data-view="text"] .tx-turn');
  const before = await turns.count();
  await page.locator('#tx-input').fill(command);
  await page.locator('#tx-input').press('Enter');
  await expect(turns).toHaveCount(before + 1);
  return turns.last();
}

test('text adventure: help, look, go, and the portal', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { found: await wordIds(page) });
  await page.goto('/?view=text&debug');
  await homeReady(page, 'text');
  await expect(page.locator('#tx-input')).toBeVisible();

  const help = await say(page, 'help');
  await expect(help).toContainText(/look/i);
  await expect(help).toContainText(/go to/i);

  const look = await say(page, 'look');
  await expect(look.locator('.tx-title')).toContainText(/plaza/i);
  await expect(look.locator('.tx-exits')).toBeVisible();

  const go = await say(page, 'go to library');
  await expect(go.locator('.tx-title')).toContainText(/library/i);

  // From the library, "portal" walks back to the plaza and asks; again steps through.
  const back = await say(page, 'portal');
  await expect(back).toContainText(/portal/i);
  await page.locator('#tx-input').fill('portal');
  await page.locator('#tx-input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.view === 'island', null, { timeout: 30_000 });
  await homeReady(page, 'island');
  await expect(page).toHaveURL(/view=island/);
  expect(errors).toEqual([]);
});
