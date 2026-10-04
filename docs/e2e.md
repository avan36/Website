# End-to-end tests

A small Playwright suite in `e2e/` that drives the built site in Chromium. It
looks for the things unit tests can't see: pages that throw in a real browser,
a HUD that breaks on a narrow phone, and gameplay that stops working.

## Running it

```sh
npm run build      # the tests run against dist/
npm run test:e2e   # all of them, about 2–3 minutes
npx playwright test e2e/map.spec.ts            # one file
npx playwright test -g "double"                # by name
```

`playwright.config.ts` starts `e2e/static-server.mjs`, a tiny server for
`dist/` with Vercel's clean URLs (`/about` serves `about.html`; unknown paths
get `404.html` with a 404). It runs on port 4791 (`E2E_PORT` to change) and
never reuses a server that is already running there.

Browser: if `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is set, or `/opt/pw-browsers/chromium`
exists, that Chromium is used. Otherwise it's Playwright's own, so on a new
machine run `npx playwright install chromium` once. WebGL runs on SwiftShader
(software), so no GPU is needed.

The suite isn't part of `npm run build`, because Vercel runs that and has no
browser. Run it before merging anything that touches the home page.

On a failure, `test-results/` has a screenshot and a trace for each failed test:
`npx playwright show-trace test-results/<test>/trace.zip`.

## What's covered

| File | Tests |
| --- | --- |
| `smoke.spec.ts` | Every main page (home in all four views, about, colophon, blog, a post, contact, every `/work/*` page, a 404) loads with no page errors, console errors or failed requests, and no sideways scroll, on a desktop and on a phone. `/world.json` is valid. Failures loading from other hosts (fonts, analytics) are ignored. |
| `phone-layout.spec.ts` | At 320, 375 and 390px (touch, `isMobile`), in the island and map views: the top bar fits and the brand doesn't overlap the nav; the collapsed intro card's title fits; the view switcher pill holds its icon and chevron; a toast stays a small pill; no sideways scroll. |
| `map.spec.ts` | The pixel map: walking to a door, going in, crossing Tower Bridge from the quay to the mall without getting wet, a jump and a double jump, wading into the sea until you swim, and the portal into the text adventure. |
| `island.spec.ts` | The 3D island: loads with WebGL and keeps drawing, Space jumps and you land, a building opens up round you as you go in and closes as you leave, a walk over a footbridge to an islet game that stays dry and opens its card, a walk over Tower Bridge to Westfield that stays dry and goes in to a card with no page to open, and the portal switches to the map. |
| `text.spec.ts` | The text adventure: `help`, `look` and `go to library` answer sensibly, and `portal` steps through to the 3D island. |

## Writing tests that don't flake

- Open the home page with `?debug` to get the test handles: `window.__map`
  (`src/renderers/map/index.ts`), `window.__island.debug`
  (`src/renderers/island/game.ts`) and `window.__world` (`src/renderers/shell.ts`).
- On the 3D island, `__island.pause()` and then `debug.tick(seconds)`: the
  physics step at 60 per second however slowly the frames draw.
- Teleport next to what you're testing rather than walking across the island.
- Wait for a state (`page.waitForFunction`, `expect.poll`) rather than for time.
- `seed()` in `e2e/helpers.ts` marks every lost word found before the page
  loads, so none lies on a path to stop a walk and open the word card. With
  `at`, it also skips the island's intro.
- The HUD fades in after the view is ready; wait for it to settle before
  measuring anything (see `openHud` in `phone-layout.spec.ts`).

A test marked `test.fail()` records a known bug: it passes while the bug is
there and fails once it's fixed, which is the cue to remove the mark.
