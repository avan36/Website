# CLAUDE.md

Ambrose Vannier's personal site (ambrosevannier.com): Astro 7, TypeScript, three.js. The home page is an island you can explore, and every place on it is a project. Read `README.md` for the full tour and `docs/brief.md` for the taste and voice. Those two files are the source of truth, and this one points at them.

## Commands

```sh
npm run dev       # http://localhost:4321
npm test          # vitest: world, store, games' rules, renderers' pure logic
npm run check     # astro check (types)
npm run build     # astro check, then vitest, then the static build in dist/
npm run test:e2e  # Playwright against dist/, so build first (docs/e2e.md)
```

Node 22. Chromium is at `/opt/pw-browsers/chromium` in cloud sessions, so don't run `playwright install`. Run the e2e suite before merging anything that touches the home page. Vercel only runs `npm run build`, which has no browser tests.

## How it fits together

- **One world, four views.** `src/world/world.ts` is the island as data: places, routes, lost words, activities, interiors, outfits and geography. The renderers in `src/renderers/` (`island` for 3D, `map` for pixels, `text` for the adventure) and `src/components/island/ListView.astro` all draw that same data. Nothing in `src/world/` knows about pixels, meshes or the DOM.
- **To change the island, edit `world.ts`.** `buildWorld()` validates it with the zod schema in `schema.ts`, and `checkWorld` cross-checks the rest: reachability, overlaps, room layouts, links, bridges and islets. A broken world fails the build with a sentence that says what to fix. Read that sentence and fix the data. Don't loosen the check.
- **Pure logic is kept apart and tested.** That covers geometry (`geo.ts`), the visitor's state (`store.ts`, a pure reducer that emits events), the race (`race.ts`), island time (`clock.ts`), the train (`train.ts`), room geometry (`renderers/roomPlan.ts`) and game rules (`renderers/games/`, `games/rules/`). Add tests next to the code you change, in the nearest `__tests__/`.
- **The renderer contract** is `src/renderers/types.ts` (`mount(ctx)` returns `pause`, `resume` and `destroy`). Anything views share belongs in `renderers/shell.ts`: the HUD, wipes, cards, sound and fallbacks.
- **The mini-games** are listed in `renderers/games/catalog.ts`. Its `views` field says which views can play each one. The islet games are on the 3D island only for now.
- **Generated outputs:** `/world.json`, `/world.schema.json`, `/pack.json` (built by `src/world/pack.ts`) and `/pack.schema.json`. `/colophon` and `/blueprint` are built from the real world at build time. Change the source, never those outputs.
- **Content lives in data files:** `src/data/projects.ts`, `about.ts`, `life.ts` and `guestbook.ts`, plus `posts/*.md` for the blog. Posts are also edited through Sveltia CMS at `/admin`.

## Rules

- **No em dashes** in anything a visitor reads: prose, islanders, cards and the README. Use commas, colons and full stops instead. Tests check the world and the pack for them.
- **Voice:** warm, brief and plain, with short sentences. Write "you" to the visitor, and Ambrose speaks as "I". Keep jokes small and gentle.
- **Names keep their case.** middle place and busy beer are always lowercase. Etymon, QuizMate, eQoScan and Map of Evolution are written exactly like that.
- **Never invent facts.** Islanders and demos only repeat what a project's own page says. If a demo is scripted, it says so. Westfield's islanders only say what's true of any visit.
- **Placeholders never ship.** Anything unwritten is marked as a draft and stays hidden.
- **Private stays private.** No journal content goes anywhere in the code, only the word count in `life.ts`. Guestbook notes are added by hand after Ambrose approves them, never automatically.
- **`public/` is served byte for byte.** That includes the busy beer and QuizMate sites, the terms pages and `app-ads.txt`. The App Store and AdMob depend on those URLs, so don't move, rename or "tidy" them.
- **Plain fallbacks stay.** No WebGL falls back to the map, reduced motion to the list, and the list works without JavaScript. Every game and toy has to work with a finger, and nothing may scroll sideways at phone width.
- **Colors and fonts** come from `src/styles/tokens.css`. Use warm neutrals, never pure white or black. Each project has its own color and keeps it everywhere it appears.

## Keeping docs in step

When you add or change something a visitor can see or do, update the docs that describe it in the same change:

- `README.md`: "What's on the island" for visitors, plus the developer sections.
- `docs/brief.md`: "Ideas already built" and the pack table.
- `e2e/`: when gameplay or the HUD changes.

## Git

- Commit subjects are plain sentences about what changed, in the site's voice, with no `feat:` prefixes. For example: `Little London: an islet off the east end, Tower Bridge out from the quay, and Westfield on it`.
- `main` deploys to Vercel. Branches under `claude/**` don't deploy (see `vercel.json`).
