// The 3D island (three.js, software WebGL here), played through its ?debug
// handle (window.__island.debug, see src/renderers/island/game.ts). The game
// loop is paused and stepped with tick(), so the physics don't depend on how
// fast this machine draws.
import { expect, test, type Page } from '@playwright/test';
import { homeReady, seed, watchErrors, wordIds, type DebugWindow } from './helpers';

const me = (page: Page) => page.evaluate(() => (window as DebugWindow).__island!.debug.player());
const tick = (page: Page, s: number) => page.evaluate((s) => (window as DebugWindow).__island!.debug.tick(s), s);

/** Opens the island standing on the plaza (a saved spot skips the intro), paused. */
async function openIsland(page: Page, query = '') {
  const errors = watchErrors(page);
  await seed(page, { found: await wordIds(page), at: { x: 0, z: 9 } });
  await page.goto(`/?view=island&debug${query}`);
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

  test('the effects over the picture follow ?fx=, and switch on and off while it runs', async ({ page }) => {
    const errors = await openIsland(page, '&fx=lite');
    const fx = () => page.evaluate(() => (window as DebugWindow).__island!.debug.fx());
    expect(await fx()).toEqual({ level: 'lite', effects: ['bloom', 'tilt', 'grade'] });
    const draw = (level: string, effects?: string[]) =>
      page.evaluate(([level, effects]) => {
        const d = (window as DebugWindow).__island!.debug;
        d.setFx(level as string, effects as string[] | undefined);
        d.render();
      }, [level, effects] as const);
    await draw('off');
    expect(await fx()).toEqual({ level: 'off', effects: [] });
    await draw('high', ['bloom']);
    expect(await fx()).toEqual({ level: 'high', effects: ['bloom'] });
    await draw('high');
    expect((await fx()).effects).toEqual(['bloom', 'tilt', 'grade']);
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

  test('going into a building opens it up where it stands, and leaving closes it', async ({ page }) => {
    const errors = await openIsland(page);
    const id = await page.evaluate(() => (window as DebugWindow).__world!.world.places.find((p) => p.interior)!.id);
    const state = () => page.evaluate(() => (window as DebugWindow).__island!.debug.state());
    await page.evaluate((id) => {
      const d = (window as DebugWindow).__island!.debug;
      const p = d.places().find((x) => x.id === id)!;
      d.teleport(p.stand.x, p.stand.z);
    }, id);
    await tick(page, 0.5);
    expect(await page.evaluate(() => (window as DebugWindow).__island!.debug.near()), 'at its door').toBe(id);

    // In: the house opens up (waiting a moment for the room's shaders), and you're in its room, on the island.
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await tick(page, 0.2), page.evaluate(() => (window as DebugWindow).__island!.debug.inside()?.at ?? null)), { timeout: 60_000 })
      .toBe(id);
    await expect(page.locator('#w-room')).toBeVisible();

    // Out by the Leave button: the house closes up behind you and you're outside its door.
    await page.locator('#w-room [data-room="leave"]').click();
    await expect.poll(async () => (await tick(page, 0.2), state()), { timeout: 60_000 }).toBe('play');
    expect(await page.evaluate(() => (window as DebugWindow).__island!.debug.inside())).toBeNull();
    expect(await page.evaluate(() => (window as DebugWindow).__island!.debug.near())).toBe(id);
    expect(errors).toEqual([]);
  });

  test('a footbridge takes you out to an islet, dry, and its game plays in the card', async ({ page }) => {
    const errors = await openIsland(page);
    // Click-to-walk from the plaza to the etymology race on Root Isle: the way goes over a bridge, never through the sea.
    const walk = await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      const g = d.games().find((x) => x.id === 'etymology')!;
      d.walkTo(g.stand.x, g.stand.z);
      let wet = 0;
      let west = 0;
      for (let i = 0; i < 60; i++) {
        d.tick(0.5);
        const p = d.player();
        if (p.water !== 'dry') wet++;
        west = Math.min(west, p.x);
        if (Math.hypot(p.x - g.stand.x, p.z - g.stand.z) < 0.6) break;
      }
      const p = d.player();
      return { wet, west, left: Math.hypot(p.x - g.stand.x, p.z - g.stand.z), open: d.games().find((x) => x.id === 'etymology')!.open };
    });
    expect(walk.wet, 'half-seconds spent in the water').toBe(0);
    expect(walk.west, 'out past the west coast').toBeLessThan(-25);
    expect(walk.left, 'how far from the spot it stopped').toBeLessThan(0.6);
    expect(walk.open, 'the prompt is up').toBe(true);

    // Enter plays it: the card names the islet, and a round deals four answers.
    await page.keyboard.press('Enter');
    const card = page.locator('#w-dialog[open] .w-game');
    await expect(card).toBeVisible();
    await expect(card.locator('.w-kicker')).toContainText('Root Isle');
    await card.locator('.w-game__go').click();
    await expect(card.locator('.er__opt')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('Tower Bridge takes you out to Westfield, dry, and the mall opens up round you with no page to open', async ({ page }) => {
    const errors = await openIsland(page);
    // Click-to-walk from the plaza to the mall's door on Little London: past the bus, along the quay and over the bridge.
    const walk = await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      const m = d.places().find((x) => x.id === 'westfield')!;
      d.walkTo(m.stand.x, m.stand.z);
      let wet = 0;
      let east = 0;
      for (let i = 0; i < 160; i++) {
        d.tick(0.5);
        const p = d.player();
        if (p.water !== 'dry') wet++;
        east = Math.max(east, p.x);
        if (Math.hypot(p.x - m.stand.x, p.z - m.stand.z) < 0.6) break;
      }
      const p = d.player();
      return { wet, east, left: Math.hypot(p.x - m.stand.x, p.z - m.stand.z), near: d.near() };
    });
    expect(walk.wet, 'half-seconds spent in the water').toBe(0);
    expect(walk.east, 'out past the east end').toBeGreaterThan(45);
    expect(walk.left, 'how far from the door it stopped').toBeLessThan(0.6);
    expect(walk.near, 'at its door').toBe('westfield');

    // In: the card says what it was, and has no buttons, since a memory has no page.
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await tick(page, 0.2), page.evaluate(() => (window as DebugWindow).__island!.debug.inside()?.at ?? null)), { timeout: 60_000 })
      .toBe('westfield');
    await expect(page.locator('#w-room')).toBeVisible();
    const card = page.locator('#w-talk');
    await expect(card).toBeVisible();
    await expect(card.locator('.w-talk__name')).toHaveText('Westfield');
    await expect(card).toContainText('I spent a lot of time here growing up, with my dad.');
    await expect(card.locator('.w-talk__cta')).toHaveCount(0);
    await expect(card.locator('[data-talk="thing:five-guys"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('stepping through the portal switches the view', async ({ page }) => {
    const errors = await openIsland(page);
    // Just in front of the ring on the plaza.
    const portal = await page.evaluate(() => (window as DebugWindow).__world!.world.activities.find((a) => a.kind === 'portal')!.at);
    await page.evaluate((p) => (window as DebugWindow).__island!.debug.teleport(p.x, p.z + 1.8), portal);
    await tick(page, 0.3);
    expect(await page.evaluate(() => (window as DebugWindow).__island!.debug.portal()?.near), 'the portal card is up').toBe(true);

    // The portal asks where to: pick the pixel map from its menu.
    await page.keyboard.press('Enter');
    await expect(page.locator('#w-dialog .w-portal__opt[value="map"]')).toBeVisible();
    await page.locator('#w-dialog .w-portal__opt[value="map"]').click();
    for (let i = 0; i < 20 && !(await page.evaluate(() => (window as DebugWindow).__island?.debug.portalled() ?? true)); i++) await tick(page, 0.1);
    await page.evaluate(() => (window as DebugWindow).__island?.resume());

    await page.waitForFunction(() => document.documentElement.dataset.view !== 'island', null, { timeout: 30_000 });
    await homeReady(page);
    expect(await page.evaluate(() => document.documentElement.dataset.view)).toBe('map');
    expect(errors).toEqual([]);
  });
});
