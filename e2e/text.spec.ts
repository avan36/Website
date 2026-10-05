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

test('text adventure: someone out walking, found by name and talked to', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { found: await wordIds(page) });
  await page.goto('/?view=text&debug');
  await homeReady(page, 'text');
  const lines = await page.evaluate(() => ((window as unknown as { __world: { world: { wanderers: { id: string; lines: string[] }[] } } }).__world.world.wanderers.find((v) => v.id === 'protector')!.lines));
  // Wherever they are, "go to" walks you there (or they're right here), and then they talk.
  await say(page, 'go to the protector');
  const talk = await say(page, 'talk to the protector');
  await expect(talk).toContainText(/The protector: “/);
  const said = (await talk.innerText()).replace(/\s+/g, ' ');
  expect(lines.some((l) => said.includes(l))).toBe(true);
  expect(errors).toEqual([]);
});

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

  // From the library, "portal" walks back to the plaza and asks; again opens the menu.
  const back = await say(page, 'portal');
  await expect(back).toContainText(/portal/i);
  await page.locator('#tx-input').fill('portal');
  await page.locator('#tx-input').press('Enter');
  const island = page.locator('#w-dialog .w-portal__opt[value="island"]');
  await expect(island).toBeVisible({ timeout: 10_000 });
  await island.click();
  await page.waitForFunction(() => document.documentElement.dataset.view === 'island', null, { timeout: 30_000 });
  await homeReady(page, 'island');
  await expect(page).toHaveURL(/view=island/);
  expect(errors).toEqual([]);
});
