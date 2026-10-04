// The 2D pixel map, played through its ?debug handle (window.__map, see
// src/renderers/map/index.ts). Every lost word is marked found first, so none
// lies on a path to stop a walk and open the word card.
import { expect, test, type Page } from '@playwright/test';
import { closeDialog, homeReady, seed, watchErrors, wordIds, type DebugWindow, type MapPlayer } from './helpers';

const player = (page: Page) => page.evaluate(() => (window as DebugWindow).__map!.player());

async function openMap(page: Page) {
  const errors = watchErrors(page);
  await seed(page, { found: await wordIds(page) });
  await page.goto('/?view=map&debug');
  await homeReady(page, 'map');
  await page.waitForFunction(() => !!(window as DebugWindow).__map);
  return errors;
}

/** Highest the explorer gets (map units) over the next `ms`, sampled every frame in the page. */
function peak(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<number>((done) => {
        let top = 0;
        const t0 = performance.now();
        const frame = () => {
          top = Math.max(top, (window as DebugWindow).__map!.player().air);
          if (performance.now() - t0 < ms) requestAnimationFrame(frame);
          else done(top);
        };
        frame();
      }),
    ms,
  );
}

test.describe('map', () => {
  test('walks to a door', async ({ page }) => {
    const errors = await openMap(page);
    const places = await page.evaluate(() => (window as DebugWindow).__map!.places());
    // A project's house, not the plaza (the plaza is open ground).
    const target = places.find((p) => p.id !== 'plaza' && p.id !== 'blog') ?? places[0];
    await page.evaluate(() => (window as DebugWindow).__map!.teleport(0, 7.5));
    const routed = await page.evaluate((d) => (window as DebugWindow).__map!.walkTo(d.x, d.z), target.door);
    expect(routed, `a path to ${target.id}'s door`).toBeTruthy();
    await page.waitForFunction(() => !(window as DebugWindow).__map!.path(), null, { timeout: 45_000 });
    await closeDialog(page);
    const at = await player(page);
    expect(Math.hypot(at.x - target.door.x, at.z - target.door.z), `stopped at ${JSON.stringify(at)}, door ${JSON.stringify(target.door)}`).toBeLessThan(0.8);
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.near())).toBe(target.id);
    expect(errors).toEqual([]);
  });

  test('walking up into a door goes inside', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    const building = await page.evaluate(() => {
      const w = (window as DebugWindow).__world!.world;
      const id = w.places.find((p) => p.interior)!.id;
      return (window as DebugWindow).__map!.places().find((p) => p.id === id)!;
    });
    // A step below the door, then up into it.
    await page.evaluate((d) => (window as DebugWindow).__map!.teleport(d.x, d.z + 1.2), building.door);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => !!(window as DebugWindow).__map!.inside(), null, { timeout: 20_000 });
    await page.keyboard.up('ArrowUp');
    expect(await page.evaluate(() => (window as DebugWindow).__map!.inside()!.at)).toBe(building.id);
    expect(errors).toEqual([]);
  });

  test('a building opens up where it stands, and closes behind you', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    const building = await page.evaluate(() => {
      const w = (window as DebugWindow).__world!.world;
      const id = w.places.find((p) => p.interior)!.id;
      return (window as DebugWindow).__map!.places().find((p) => p.id === id)!;
    });
    const outside = await page.evaluate(() => (window as DebugWindow).__map!.scale());
    await page.evaluate((d) => (window as DebugWindow).__map!.teleport(d.x, d.z + 1.2), building.door);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => (window as DebugWindow).__map!.mode() === 'door', null, { timeout: 20_000 });
    await page.keyboard.up('ArrowUp');

    // The camera lands zoomed in on the room, on whole pixels, with the room's bar up.
    await page.waitForFunction(() => (window as DebugWindow).__map!.mode() === 'inside', null, { timeout: 20_000 });
    const inside = await page.evaluate(() => (window as DebugWindow).__map!.scale());
    expect(inside.Z, 'zoomed in').toBeGreaterThan(outside.S);
    expect(Number.isInteger(inside.Z), `a whole scale, not ${inside.Z}`).toBe(true);
    await expect(page.locator('#w-room')).toBeVisible();

    // Leave: the room closes, the camera comes back out, and you're on the doorstep.
    await page.locator('#w-room [data-room="leave"]').click();
    await page.waitForFunction(() => (window as DebugWindow).__map!.mode() === 'play' && !(window as DebugWindow).__map!.inside(), null, { timeout: 20_000 });
    expect((await page.evaluate(() => (window as DebugWindow).__map!.scale())).Z).toBe(outside.S);
    const at = await player(page);
    expect(Math.hypot(at.x - building.door.x, at.z - building.door.z), `out at ${JSON.stringify(at)}`).toBeLessThan(0.3);
    await expect(page.locator('#w-room')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('jumps, and jumps again in the air', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    await page.evaluate(() => (window as DebugWindow).__map!.teleport(0, 7.5));
    await expect.poll(async () => (await player(page)).air).toBe(0);

    // One jump: hold Space to the top.
    const one = peak(page, 1500);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => (window as DebugWindow).__map!.player().air > 3);
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    const single = await one;
    await page.waitForFunction(() => (window as DebugWindow).__map!.player().air === 0);
    expect(single, 'a jump leaves the ground').toBeGreaterThan(5);
    expect((await player(page)).twice).toBe(false);

    // Double: press again while still in the air.
    const two = peak(page, 2500);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => (window as DebugWindow).__map!.player().air > 6);
    await page.keyboard.up('Space');
    const mid: MapPlayer = await player(page);
    expect(mid.air, 'still in the air for the second press').toBeGreaterThan(0);
    expect(mid.twice).toBe(false);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => (window as DebugWindow).__map!.player().twice);
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    const double = await two;
    expect(double, `double jump ${double.toFixed(1)} vs single ${single.toFixed(1)}`).toBeGreaterThan(single * 1.2);

    // And lands.
    await page.waitForFunction(() => {
      const p = (window as DebugWindow).__map!.player();
      return p.air === 0 && !p.twice;
    });
    expect(errors).toEqual([]);
  });

  test('walks off the beach into the sea and swims', async ({ page }) => {
    const errors = await openMap(page);
    // The beach west of the plaza, two steps from the water.
    const r = await page.evaluate(() => (window as DebugWindow).__world!.geo.coastRadius(Math.PI));
    await page.evaluate((r) => (window as DebugWindow).__map!.teleport(-(r - 2), 0.5), r);
    expect((await player(page)).wet, 'starts on dry sand').toBe(0);

    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => (window as DebugWindow).__map!.player().wet === 2, null, { timeout: 20_000 });
    await page.keyboard.up('ArrowLeft');
    const me = await player(page);
    expect(me.wet).toBe(2);
    expect(me.air, 'afloat, not jumping').toBe(0);
    // In deep water Space kicks; it doesn't jump.
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect(await player(page)).toMatchObject({ air: 0, wet: 2 });
    expect(errors).toEqual([]);
  });

  test('the portal opens its menu, and takes you to the text adventure', async ({ page }) => {
    const errors = await openMap(page);
    const portal = await page.evaluate(() => (window as DebugWindow).__world!.world.activities.find((a) => a.kind === 'portal')!.at);
    await page.evaluate((p) => (window as DebugWindow).__map!.teleport(p.x, p.z + 1.6), portal);
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.portal().near)).toBe(true);

    // Walking into it opens its menu of views. Closing it leaves you on the map...
    await page.keyboard.down('ArrowUp');
    await expect(page.locator('#w-dialog .w-portal__opt--main')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('Escape');
    await expect(page.locator('#w-dialog')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.dataset.view)).toBe('map');
    // The menu's close event lands a moment after it shuts: Enter before then does nothing.
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.portal())).toMatchObject({ tag: true, choosing: false });
    // ...and Enter at it opens the menu again; the text adventure is tucked underneath.
    await page.keyboard.press('Enter');
    const text = page.locator('#w-dialog .w-portal__more[value="text"]');
    await expect(text).toBeVisible();
    await text.click();
    await page.waitForFunction(() => (window as DebugWindow).__map?.mode() !== 'play', null, { timeout: 10_000 });

    await page.waitForFunction(() => document.documentElement.dataset.view === 'text', null, { timeout: 20_000 });
    await expect(page.locator('.view-host[data-view="text"] #tx-input')).toBeVisible();
    await expect(page).toHaveURL(/view=text/);
    expect(errors).toEqual([]);
  });
});
