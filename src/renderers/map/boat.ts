// The speedboat on the map. The race round the island is run in 3D, so out at
// the end of the pier the map offers to take you there: straight into the
// boat, on the island, with your best lap so far. One small card, added and
// removed by index.ts; the boat's sprite is drawn with everything else.

import { boatOf, wishForBoat } from '../boat';
import type { RendererContext } from '../types';
import { formatLap } from '../../world/race';

/** Stand this close to the end of the pier for the card to come up. */
const RANGE = 3;

const CSS = /* css */ `
.map-boat {
  position: absolute; left: 50%; transform: translateX(-50%);
  top: calc(max(16px, env(safe-area-inset-top)) + 64px); z-index: 4;
  display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.92); box-shadow: var(--shadow-2); font-family: var(--font-ui);
  max-width: calc(100vw - 32px);
}
.map-boat[hidden] { display: none; }
.map-boat p { display: grid; line-height: 1.2; font-size: 14px; font-weight: 650; color: var(--ink); }
.map-boat p span { font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.map-boat button {
  height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: #e5484d; color: #fff;
  font: 700 15px var(--font-ui); cursor: pointer; white-space: nowrap;
}
.map-boat button:hover { background: #d93a40; }
`;

export function createBoatCard(root: HTMLElement, ctx: RendererContext) {
  const { world, geo, store } = ctx;
  const boat = boatOf(world);
  const pier = world.places.find((p) => p.id === boat?.place);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'map-boat';
  el.hidden = true;
  el.innerHTML = '<p><b>The speedboat</b><span></span></p><button type="button">Race it in 3D</button>';
  const sub = el.querySelector('span')!;
  root.append(el);
  let shown = false;

  function go() {
    if (!pier) return;
    // Arrive at the pier on the island, in the boat.
    store.dispatch({ type: 'move', at: pier.id, pos: geo.door(pier) });
    wishForBoat();
    ctx.sound.play('whoosh');
    document.querySelector<HTMLButtonElement>('[data-view-set="island"]')?.click();
  }
  el.querySelector('button')!.addEventListener('click', go);

  return {
    /** Where the explorer is: near the end of the pier, the card comes up. */
    update(x: number, z: number) {
      if (!boat) return;
      const near = Math.hypot(x - geo.pier.x, z - (boat.at.z - 2.5)) < RANGE;
      if (near === shown) return;
      shown = near;
      el.hidden = !near;
      if (near) {
        const best = store.state.progress.bestLap;
        sub.textContent = best !== null ? `Your best lap: ${formatLap(best)}` : 'A lap round the island, against the clock';
        ctx.ui.announce('A speedboat is tied up here. Race it round the island in the 3D view.');
      }
    },
    destroy() {
      el.remove();
      style.remove();
    },
  };
}
