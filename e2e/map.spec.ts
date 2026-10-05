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
  test('someone out walking stops as you come up, and says hello', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    const lines = await page.evaluate(() => ((window as DebugWindow).__world!.world as unknown as { wanderers: { id: string; lines: string[] }[] }).wanderers.find((v) => v.id === 'jeremy')!.lines);
    const jeremy = () => page.evaluate(() => (window as DebugWindow).__map!.wanderers().find((v) => v.id === 'jeremy')!);
    await page.evaluate(() => {
      const m = (window as DebugWindow).__map!;
      const v = m.wanderers().find((x) => x.id === 'jeremy')!;
      m.teleport(v.x + 1, v.z + 0.3);
    });
    await expect.poll(async () => (await jeremy()).open).toBe(true);
    const tag = page.locator('.map-walker');
    await expect(tag).toBeVisible();
    await expect(tag).toContainText('Jeremy');
    await page.keyboard.press('KeyE');
    await expect(tag).toContainText(lines[0]);
    expect((await jeremy()).said).toBe(1);
    expect((await jeremy()).moving).toBe(false);
    expect(errors).toEqual([]);
  });

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

  test('talking to someone in a room never traps you: a tap on the floor or a step says goodbye and walks', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    const room = await page.evaluate(() => {
      const p = ((window as DebugWindow).__world!.world.places as { id: string; interior?: { people: { id: string; name: string; at: { x: number; z: number } }[] } }[]).find(
        (x) => x.interior?.people.length,
      )!;
      return { id: p.id, person: p.interior!.people[0] };
    });
    const inside = () => page.evaluate(() => (window as DebugWindow).__map!.inside());
    const away = (from: { x: number; z: number }) => async () => {
      const p = (await inside())!;
      return Math.hypot(p.x - from.x, p.z - from.z);
    };
    const box = page.locator('#w-talk');
    const talking = `Talking to ${room.person.name}`;
    expect(await page.evaluate((id) => (window as DebugWindow).__map!.enter(id), room.id)).toBe(true);
    await page.waitForFunction(() => (window as DebugWindow).__map!.mode() === 'inside', null, { timeout: 20_000 });

    const talk = async () => {
      expect(await page.evaluate((id) => (window as DebugWindow).__map!.approach(id), room.person.id)).toBe(true);
      await expect.poll(async () => (await inside())?.busy, { timeout: 20_000 }).toBe(true);
      await expect(box).toHaveAttribute('aria-label', talking);
    };
    await talk();

    // A click on the floor across the room: the conversation closes and you walk there.
    const from = (await inside())!;
    const at = await page.evaluate(({ x, z }) => (window as DebugWindow).__map!.roomScreen(x, z), { x: -room.person.at.x * 0.6, z: room.person.at.z + 1.2 });
    const canvas = (await page.locator('.view-host[data-view="map"] canvas').first().boundingBox())!;
    await page.mouse.click(canvas.x + at!.x, canvas.y + at!.y);
    await expect(box).not.toHaveAttribute('aria-label', talking);
    await expect.poll(away(from), { timeout: 10_000 }).toBeGreaterThan(0.5);

    // And with the keys: talk again, then a step (D) says goodbye and moves you.
    await talk();
    const still = (await inside())!;
    await page.keyboard.down('KeyD');
    await expect.poll(away(still), { timeout: 10_000 }).toBeGreaterThan(0.3);
    await page.keyboard.up('KeyD');
    expect((await inside())!.busy, 'the conversation is closed').toBe(false);
    expect(errors).toEqual([]);
  });

  test('crosses Tower Bridge from the quay to the mall, dry all the way', async ({ page }) => {
    const errors = await openMap(page);
    await closeDialog(page);
    const mall = await page.evaluate(() => {
      const w = (window as DebugWindow).__world!.world as unknown as { places: { id: string; archetype: string }[] };
      const id = w.places.find((p) => p.archetype === 'mall')!.id;
      return (window as DebugWindow).__map!.places().find((p) => p.id === id)!;
    });
    // On the quay, by the bus's nose, where the bridge starts.
    await page.evaluate(() => (window as DebugWindow).__map!.teleport(29.4, 17.2));
    expect(await page.evaluate((d) => (window as DebugWindow).__map!.walkTo(d.x, d.z), mall.door), 'a way over').toBe(true);
    // Stop if it ever gets its feet wet: the deck is the only way over. The map walks in real time and slows with the
    // frame rate, so a long walk gets a long wait when the 3D tests share the machine (about 12 s on its own).
    await page.waitForFunction(() => !(window as DebugWindow).__map!.path() || (window as DebugWindow).__map!.player().wet > 0, null, { timeout: 90_000, polling: 50 });
    const at = await player(page);
    expect(at.wet, 'walked the deck, not the sea').toBe(0);
    expect(Math.hypot(at.x - mall.door.x, at.z - mall.door.z), `stopped at ${JSON.stringify(at)}`).toBeLessThan(0.8);
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.near())).toBe(mall.id);
    expect(errors).toEqual([]);
  });

  test('the badge gate keeps the long bridge to the glass tower shut until it is open', async ({ page }) => {
    const errors = watchErrors(page);
    const tower = async () => {
      await page.goto('/?view=map&debug');
      await homeReady(page, 'map');
      await page.waitForFunction(() => !!(window as DebugWindow).__map);
      await closeDialog(page);
      return page.evaluate(() => (window as DebugWindow).__map!.places().find((p) => p.id === 'synergy-tower')!);
    };
    // Shut: no way over from Boardwalk Isle, and the badge desk's tag pops up at the turnstile.
    await seed(page, { found: await wordIds(page), at: { x: -34.5, z: 17.5 } });
    const t = await tower();
    expect(await page.evaluate(() => (window as DebugWindow).__map!.gates())).toMatchObject([{ id: 'badge-gate', open: false }]);
    expect(await page.evaluate((d) => (window as DebugWindow).__map!.walkTo(d.x, d.z), t.door), 'no way past the gate').toBe(false);
    const gate = await page.evaluate(() => (window as DebugWindow).__map!.gates()[0]);
    await page.evaluate((g) => (window as DebugWindow).__map!.teleport(g.x + 0.62, g.z - 0.78), gate);
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.games().find((g) => g.id === 'jargon')!.open)).toBe(true);
    await expect(page.locator('.map-game:not([hidden]) .map-tag__name')).toHaveText('Speak corporate');
    expect(errors).toEqual([]);
  });

  test('once the badge gate is open, walks the long bridge to the glass tower, dry all the way', async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { found: await wordIds(page), at: { x: -34.5, z: 17.5 }, gates: ['badge-gate'] });
    await page.goto('/?view=map&debug');
    await homeReady(page, 'map');
    await page.waitForFunction(() => !!(window as DebugWindow).__map);
    await closeDialog(page);
    const t = await page.evaluate(() => (window as DebugWindow).__map!.places().find((p) => p.id === 'synergy-tower')!);
    expect(await page.evaluate(() => (window as DebugWindow).__map!.gates()[0].open)).toBe(true);
    expect(await page.evaluate((d) => (window as DebugWindow).__map!.walkTo(d.x, d.z), t.door), 'a way over').toBe(true);
    await page.waitForFunction(() => !(window as DebugWindow).__map!.path() || (window as DebugWindow).__map!.player().wet > 0, null, { timeout: 90_000, polling: 50 });
    const at = await player(page);
    expect(at.wet, 'walked the deck, not the sea').toBe(0);
    expect(Math.hypot(at.x - t.door.x, at.z - t.door.z), `stopped at ${JSON.stringify(at)}`).toBeLessThan(0.8);
    await expect.poll(() => page.evaluate(() => (window as DebugWindow).__map!.near())).toBe('synergy-tower');
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
