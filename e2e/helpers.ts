import { expect, type Page } from '@playwright/test';

/** A phone, as Playwright's device presets describe one, at a given width. */
export const phone = (width: number, height = 740) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

/**
 * Collects page errors and console errors. Failures to load things from other
 * hosts (web fonts, analytics: the sandbox proxy blocks some) are ignored, and
 * so is the 404 status of a page that is meant to be missing.
 */
export function watchErrors(page: Page, { allow404 = false } = {}) {
  const errors: string[] = [];
  const origin = () => {
    try {
      return new URL(page.url()).origin;
    } catch {
      return '';
    }
  };
  const external = (url: string) => !!url && /^https?:/.test(url) && !url.startsWith(origin());
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url ?? '';
    if (/Failed to load resource/.test(text) && (external(url) || (allow404 && /404/.test(text)))) return;
    if (/net::ERR_|ERR_TUNNEL|ERR_PROXY/.test(text) && external(url)) return;
    errors.push(`console: ${text}${url ? ` (${url})` : ''}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400 || external(r.url())) return;
    if (allow404 && r.status() === 404 && r.request().resourceType() === 'document') return;
    errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

/** Word ids, so tests can mark every lost word found: then none lie on the paths to trip over. */
export async function wordIds(page: Page): Promise<string[]> {
  const r = await page.request.get('/world.json');
  const w = (await r.json()) as { lostWords: { id: string }[] };
  return w.lostWords.map((x) => x.id);
}

/**
 * Before the page loads: every lost word already found (it's still day: night
 * only falls when the last one is picked up in play), and, optionally, where
 * the explorer stands, which skips the island's intro.
 */
export async function seed(page: Page, { found = [] as string[], at = null as { x: number; z: number } | null } = {}) {
  await page.addInitScript(
    ({ found, at }) => {
      try {
        localStorage.setItem('world:progress:v1', JSON.stringify({ found, caught: [], night: false }));
        localStorage.setItem('island:hinted', '1');
        if (at) sessionStorage.setItem('world:presence:v1', JSON.stringify({ at: null, pos: at }));
      } catch {
        /* storage blocked: the tests that need it will say so */
      }
    },
    { found, at },
  );
}

/** Waits for the home page's current view to be up (the stage marks itself ready). */
export async function homeReady(page: Page, view?: string) {
  await page.waitForFunction(
    (v) => {
      const h = document.documentElement;
      return (h.classList.contains('isl-ready') || h.classList.contains('isl-mode-list')) && (!v || h.dataset.view === v);
    },
    view,
    { timeout: 90_000 },
  );
}

/** Closes the shared dialog (a found word, a catch) if one is open. */
export async function closeDialog(page: Page) {
  await page.evaluate(() => {
    const d = document.getElementById('w-dialog') as HTMLDialogElement | null;
    if (d?.open) d.close();
  });
}

/** No horizontal page scroll. */
export async function expectNoHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

// ---------- The ?debug handles (see src/renderers/map/index.ts, island/game.ts, shell.ts) ----------

export type MapPlayer = { x: number; z: number; air: number; twice: boolean; wet: number; run: number };
export type MapHandle = {
  player(): MapPlayer;
  teleport(x: number, z: number): void;
  walkTo(x: number, z: number): boolean;
  path(): unknown[] | null;
  near(): string | null;
  mode(): string;
  swimRoom(): number;
  portal(): { near: boolean; tag: boolean; choosing: boolean };
  places(): { id: string; door: { x: number; z: number } }[];
  inside(): { at: string } | null;
  /** Device pixels to a map pixel: the map's own (S), and the camera's right now (Z: more inside a building). */
  scale(): { S: number; Z: number };
};
export type IslandPlayer = { x: number; z: number; y: number; airborne: boolean; water: string; doubleJumped: boolean };
export type IslandDebug = {
  state(): string;
  player(): IslandPlayer;
  tick(seconds: number): void;
  teleport(x: number, z: number): void;
  render(): void;
  frames(): number;
  portal(): { near: boolean } | null;
  clickPortal(): void;
  portalled(): { x: number; y: number } | null;
  near(): string | null;
  places(): { id: string; x: number; z: number; stand: { x: number; z: number } }[];
  inside(): { at: string; x: number; z: number } | null;
  walkTo(x: number, z: number): { x: number; z: number } | null;
  games(): { id: string; x: number; z: number; stand: { x: number; z: number }; open: boolean }[];
  fx(): { level: string; effects: string[] };
  setFx(level: string, effects?: string[]): void;
};
export type WorldHandle = {
  world: { activities: { kind: string; at: { x: number; z: number } }[]; places: { id: string; interior?: unknown }[] };
  geo: { coastRadius(theta: number): number };
  setView(v: string): Promise<void>;
};
export type DebugWindow = Window & { __map?: MapHandle; __island?: { pause(): void; resume(): void; debug: IslandDebug }; __world?: WorldHandle };
