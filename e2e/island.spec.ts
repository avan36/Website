// The 3D island (three.js, software WebGL here), played through its ?debug
// handle (window.__island.debug, see src/renderers/island/game.ts). The game
// loop is paused and stepped with tick(), so the physics don't depend on how
// fast this machine draws.
import { expect, test, type Page } from '@playwright/test';
import { homeReady, seed, watchErrors, wordIds, type DebugWindow } from './helpers';

const me = (page: Page) => page.evaluate(() => (window as DebugWindow).__island!.debug.player());
const tick = (page: Page, s: number) => page.evaluate((s) => (window as DebugWindow).__island!.debug.tick(s), s);

/** Opens the island standing on the plaza (a saved spot skips the intro), paused. */
async function openIsland(page: Page) {
  const errors = watchErrors(page);
  await seed(page, { found: await wordIds(page), at: { x: 0, z: 9 } });
  await page.goto('/?view=island&debug');
  await homeReady(page, 'island');
  await page.waitForFunction(() => (window as DebugWindow).__island?.debug.state() === 'play', null, { timeout: 90_000 });
  await page.evaluate(() => (window as DebugWindow).__island!.pause());
  await tick(page, 0.5);
  return errors;
}

test.describe('3D island', () => {
  test('loads with WebGL and draws frames', async ({ page }) => {
    const errors = await openIsland(page);
    await expect(page.locator('html')).toHaveClass(/\bisl-gl\b/);
    await expect(page.locator('.view-host[data-view="island"] canvas').first()).toBeVisible();
    // Running again, it keeps drawing.
    const f0 = await page.evaluate(() => (window as DebugWindow).__island!.debug.frames());
    await page.evaluate(() => (window as DebugWindow).__island!.resume());
    await page.waitForFunction((f0) => (window as DebugWindow).__island!.debug.frames() > f0 + 3, f0, { timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.dataset.view)).toBe('island');
    expect(errors).toEqual([]);
  });

  test('Space jumps, and the explorer lands again', async ({ page }) => {
    const errors = await openIsland(page);
    const ground = await me(page);
    expect(ground.airborne).toBe(false);

    await page.keyboard.down('Space');
    let top = ground.y;
    let wasAirborne = false;
    for (let i = 0; i < 20; i++) {
      await tick(page, 1 / 30);
      const p = await me(page);
      top = Math.max(top, p.y);
      wasAirborne ||= p.airborne;
    }
    await page.keyboard.up('Space');
    expect(wasAirborne, 'left the ground').toBe(true);
    expect(top - ground.y, 'how high it rose').toBeGreaterThan(0.5);

    await tick(page, 2);
    const after = await me(page);
    expect(after.airborne).toBe(false);
    expect(Math.abs(after.y - ground.y), 'back on the ground').toBeLessThan(0.2);
    expect(errors).toEqual([]);
  });

  test('stepping through the portal switches the view', async ({ page }) => {
    const errors = await openIsland(page);
    // Just in front of the ring on the plaza.
    const portal = await page.evaluate(() => (window as DebugWindow).__world!.world.activities.find((a) => a.kind === 'portal')!.at);
    await page.evaluate((p) => (window as DebugWindow).__island!.debug.teleport(p.x, p.z + 1.8), portal);
    await tick(page, 0.3);
    expect(await page.evaluate(() => (window as DebugWindow).__island!.debug.portal()?.near), 'the portal card is up').toBe(true);

    await page.keyboard.press('Enter');
    for (let i = 0; i < 20 && !(await page.evaluate(() => (window as DebugWindow).__island?.debug.portalled() ?? true)); i++) await tick(page, 0.1);
    await page.evaluate(() => (window as DebugWindow).__island?.resume());

    await page.waitForFunction(() => document.documentElement.dataset.view !== 'island', null, { timeout: 30_000 });
    await homeReady(page);
    expect(await page.evaluate(() => document.documentElement.dataset.view)).toBe('map'); // PORTAL_NEXT in src/renderers/portal.ts
    expect(errors).toEqual([]);
  });
});
