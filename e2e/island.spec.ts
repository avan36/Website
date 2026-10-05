// The 3D island (three.js, software WebGL here), played through its ?debug
// handle (window.__island.debug, see src/renderers/island/game.ts). The game
// loop is paused and stepped with tick(), so the physics don't depend on how
// fast this machine draws.
import { expect, test, type Page } from '@playwright/test';
import { LINES } from '../src/renderers/games/rules/jargon';
import { homeReady, phone, seed, watchErrors, wordIds, type DebugWindow } from './helpers';

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
    // Click-to-walk from the plaza to the mall's door on Little London: along the quay, over the bridge and across the road.
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

  test('someone out walking on Little London stops as you come up, and says hello', async ({ page }) => {
    const errors = await openIsland(page);
    const lines = await page.evaluate(() => ((window as DebugWindow).__world!.world as unknown as { wanderers: { id: string; lines: string[] }[] }).wanderers.find((v) => v.id === 'andrew')!.lines);
    const andrew = () => page.evaluate(() => (window as DebugWindow).__island!.debug.wanderers().find((v) => v.id === 'andrew')!);
    // Just beside him, on the islet.
    await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      const v = d.wanderers().find((x) => x.id === 'andrew')!;
      d.teleport(v.x - 1.3, v.z + 0.4);
    });
    await tick(page, 0.6);
    const near = await andrew();
    expect(near.open, 'his prompt is up').toBe(true);
    expect(near.moving, 'he has stopped').toBe(false);
    const prompt = page.locator('.isl-label', { hasText: 'Andrew' });
    await expect(prompt).toContainText('Say hello');
    // E says hello, and again says the next thing.
    await page.keyboard.press('KeyE');
    await tick(page, 0.1);
    await expect(prompt).toContainText(lines[0]);
    await page.keyboard.press('KeyE');
    await tick(page, 0.1);
    await expect(prompt).toContainText(lines[1]);
    expect((await andrew()).said).toBe(2);
    // Walk away and he carries on.
    await page.evaluate(() => (window as DebugWindow).__island!.debug.teleport(57.6, 22));
    await tick(page, 1);
    const later = await andrew();
    expect(later.open).toBe(false);
    await tick(page, 6);
    expect(Math.hypot((await andrew()).x - later.x, (await andrew()).z - later.z), 'walked on').toBeGreaterThan(0.5);
    expect(errors).toEqual([]);
  });

  test('the red bus on Little London goes round, pulls in at the stop, and waits for you in the road', async ({ page }) => {
    const errors = await openIsland(page);
    const laps = await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      // Out of its way, in the middle of the loop.
      d.teleport(60.4, 16);
      const start = d.bus()!;
      let stops = 0;
      let moved = 0;
      let was = start.atStop && start.v === 0;
      let last = start;
      for (let i = 0; i < 160; i++) {
        d.tick(0.5);
        const b = d.bus()!;
        moved += Math.hypot(b.x - last.x, b.z - last.z);
        last = b;
        const waiting = b.atStop && b.v === 0;
        if (waiting && !was) stops++;
        was = waiting;
      }
      return { stops, moved };
    });
    // Eighty seconds: well over two laps of a road about 63 round, with a stop each time.
    expect(laps.moved, 'how far it drove').toBeGreaterThan(120);
    expect(laps.stops, 'times it pulled in at the stop').toBeGreaterThanOrEqual(2);

    // Step into the road just ahead of it as it drives: it stops short and waits, and you're not stuck.
    const held = await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      let b = d.bus()!;
      for (let i = 0; i < 200 && !(b.v > 2.5); i++) (d.tick(0.1), (b = d.bus()!));
      d.teleport(b.x + Math.sin(b.yaw) * 4.2, b.z + Math.cos(b.yaw) * 4.2);
      for (let i = 0; i < 30; i++) d.tick(0.1);
      const p = d.player();
      b = d.bus()!;
      return { held: b.held, v: b.v, gap: Math.hypot(p.x - b.x, p.z - b.z) };
    });
    expect(held.held, 'waiting for you').toBe(true);
    expect(held.v).toBe(0);
    expect(held.gap, 'stopped short of you').toBeGreaterThan(2.4);
    // Step back off the road and it goes on.
    const after = await page.evaluate(() => {
      const d = (window as DebugWindow).__island!.debug;
      d.teleport(60.4, 16);
      for (let i = 0; i < 30; i++) d.tick(0.1);
      return d.bus()!;
    });
    expect(after.held).toBe(false);
    expect(after.v).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the badge gate stops you on the long bridge until you speak corporate, then lets you through to the glass tower', async ({ page }) => {
    const errors = await openIsland(page);
    /** Click-to-walk to the glass tower's door, half a second at a time: how far it got, and whether it got wet. */
    const toTower = () =>
      page.evaluate(() => {
        const d = (window as DebugWindow).__island!.debug;
        const t = d.places().find((x) => x.id === 'synergy-tower')!;
        d.walkTo(t.stand.x, t.stand.z);
        let wet = 0;
        for (let i = 0; i < 160; i++) {
          d.tick(0.5);
          const p = d.player();
          if (p.water !== 'dry') wet++;
          if (Math.hypot(p.x - t.stand.x, p.z - t.stand.z) < 0.6) break;
        }
        const p = d.player();
        const gate = d.gates()[0];
        return { wet, left: Math.hypot(p.x - t.stand.x, p.z - t.stand.z), past: (p.x - gate.x) * -0.62 + (p.z - gate.z) * 0.78, gate, near: d.near(), prompt: d.games().find((g) => g.id === 'jargon')!.open };
      });
    // Shut: over the footbridge to Boardwalk Isle, and no further than the turnstile.
    const stopped = await toTower();
    expect(stopped.wet, 'half-seconds spent in the water').toBe(0);
    expect(stopped.gate.open).toBe(false);
    expect(stopped.past, 'still on the near side of the gate').toBeLessThan(0);
    expect(stopped.left, 'a long way from the tower').toBeGreaterThan(15);
    expect(stopped.prompt, 'the badge desk asks you to speak corporate').toBe(true);

    // Enter plays it: three plain things, and the corporate way to say each.
    await page.keyboard.press('Enter');
    const card = page.locator('#w-dialog[open] .w-game');
    await expect(card).toBeVisible();
    await expect(card.locator('.w-kicker')).toContainText('Boardwalk Isle');
    await card.locator('.w-game__go').click();
    for (let round = 0; round < 3; round++) {
      const plain = (await card.locator('.jg__plain').textContent())!.replace(/[“”]/g, '');
      const corporate = LINES.find((l) => l.plain === plain)!.corporate;
      await card.locator('.jg__opt', { hasText: corporate }).click();
      await expect(card.locator('.jg__opt.is-right')).toContainText(corporate);
      await card.locator('.jg__next').click();
    }
    await expect(card.locator('.w-game__big')).toHaveText('3');
    await expect(card.locator('.w-game__summary')).toContainText('turns green');
    await card.locator('.w-game__end button[value="close"]').click();
    await expect(page.locator('#w-dialog[open]')).toHaveCount(0);

    // Open, for good: the flaps swing back and the way is clear all the way to the tower's door.
    await page.evaluate(() => (window as DebugWindow).__island!.pause());
    const through = await toTower();
    expect(through.gate.open).toBe(true);
    expect(through.wet, 'half-seconds spent in the water').toBe(0);
    expect(through.left, 'how far from the door it stopped').toBeLessThan(0.6);
    expect(through.near, 'at its door').toBe('synergy-tower');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('world:progress:v1')!).gates)).toEqual(['badge-gate']);
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

  test.describe('on a phone', () => {
    test.use(phone(390));

    test("the boat's buttons hold under a thumb without selecting text or opening a menu", async ({ page }) => {
      const errors = await openIsland(page);
      await expect(page.locator('html')).toHaveClass(/\bisl-touch\b/);
      await page.evaluate(() => (window as DebugWindow).__island!.debug.boat!.board());
      await tick(page, 0.2);
      const gas = page.locator('.isl-boat__key[data-key="gas"]');
      await expect(gas).toBeVisible();
      await expect(gas).toHaveAccessibleName('Go');

      // Nothing on the HUD or the water can be selected, and the pad and the water take every touch themselves.
      const css = await page.evaluate(() => {
        const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
        const canvas = '.view-host[data-view="island"] canvas';
        return {
          keys: [...document.querySelectorAll('.isl-boat__key')].map((k) => [getComputedStyle(k).userSelect, getComputedStyle(k).touchAction]),
          btn: [cs('.isl-boat__btn').userSelect, cs('.isl-boat__btn').touchAction],
          time: cs('.isl-boat__time').userSelect,
          canvas: [cs(canvas).userSelect, cs(canvas).touchAction],
        };
      });
      expect(css.keys).toEqual(Array(4).fill(['none', 'none']));
      expect(css.btn).toEqual(['none', 'manipulation']);
      expect(css.time).toBe('none');
      expect(css.canvas).toEqual(['none', 'none']);

      // A real touch held on Go: the boat is asked to go, the touch is the game's, and nothing gets selected.
      type Seen = Window & { __touches?: boolean[]; __menus?: boolean[] };
      await page.evaluate(() => {
        const w = window as Seen;
        w.__touches = [];
        w.__menus = [];
        document.addEventListener('touchstart', (e) => w.__touches!.push(e.defaultPrevented));
        document.addEventListener('contextmenu', (e) => w.__menus!.push(e.defaultPrevented));
      });
      const b = (await gas.boundingBox())!;
      const point = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
      const cdp = await page.context().newCDPSession(page);
      const pad = () => page.evaluate(() => (window as DebugWindow).__island!.debug.boat!.info().pad);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect.poll(pad).toEqual({ throttle: 1, steer: 0 });
      await expect(gas).toHaveClass(/\bis-held\b/);
      // Held a while, and nudged a little, as a thumb does.
      await gas.dispatchEvent('contextmenu');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: point.x + 3 }] });
      await tick(page, 0.6);
      expect(await pad()).toEqual({ throttle: 1, steer: 0 });
      expect(await page.evaluate(() => (window as Seen).__touches)).toEqual([true]);
      expect(await page.evaluate(() => (window as Seen).__menus)).toEqual([true]);
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

      // Lifted: it lets go cleanly.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(pad).toEqual({ throttle: 0, steer: 0 });
      await expect(gas).not.toHaveClass(/\bis-held\b/);

      // Two thumbs: go and steer at once, and a cancelled touch lets go too.
      const left = (await page.locator('.isl-boat__key[data-key="left"]').boundingBox())!;
      const l = { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point, l] });
      await expect.poll(pad).toEqual({ throttle: 1, steer: -1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect.poll(pad).toEqual({ throttle: 0, steer: 0 });
      await expect(page.locator('.isl-boat .is-held')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
});
