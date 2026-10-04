# ambrosevannier.com

My personal site. The home page is a tiny island you can explore. Every place on it is something I've made, and you can walk it in 3D, on a pixel map, or as a text adventure, or just read the list.

Those are four views of **one world**, and the world is data.

```
                    ┌────────────────────────── src/world ──────────────────────────┐
 src/data/projects ─┤  world.ts      what's on the island: places, prose, secrets   │
 posts/*.md ────────┤  schema.ts     zod schema + cross-checks (fails the build)    │
                    │  geo.ts        coast, height, paths, doors: pure math         │
                    │  store.ts      what a visitor has done: pure reducer + events │
                    └───────────────┬───────────────────────────────┬───────────────┘
                                    │ JSON embedded in the page     │ /world.json
                 ┌──────────────────┼───────────────────┐           ▼
                 ▼                  ▼                   ▼       your renderer?
          renderers/island    renderers/map     renderers/text      ListView.astro
          three.js, 3D        canvas, pixels    a parser, words     plain HTML
                 └──────────────────┴───────────────────┘
                     one contract: renderers/types.ts
                     one host: renderers/shell.ts (HUD, wipes, shared cards)
```

## The world model

`src/world/world.ts` is the one file to edit to change the island. It describes:

- **Places**: where each thing stands (`at`, in world units, +z is south), what it is (`archetype`: cabin, lighthouse, pier…), what it opens (`href`), and what you see when you get there (`description`, `scenery` you can examine). Project places pull their name, color and blurb from `src/data/projects.ts`.
- **Routes**: which places connect. Paved ones become paths in the spatial views; the rest are shortcuts the text adventure narrates.
- **Lost words**: eight words English lost (from [Etymon](https://avan36.github.io/Etymology/)'s museum), each hidden in a specific piece of scenery and at a specific spot.
- **Activities**: fishing off the pier, which catches a post from the blog, and a speedboat at the end of the pier to race round the island (the course itself is pure math in `src/world/race.ts`).
- **Interiors**: every building (and nothing else) has a room: a description, a few `things` to look at (each with a `prop` the renderers draw, and an optional link), and one or two islanders with a greeting, 2 to 4 `topics` and a farewell. Rooms have their own units, door in the middle of the front wall; `checkWorld` keeps everything on the floor, clear of the door and each other, and every link pointing at a real page. The islanders are fictional; what they say about a project only restates its page.
- **Activities**: fishing off the pier, which catches a post from the blog; the portal; and seven mini-games (`kind: 'minigame'` with a `game` id). Three are on the main island: skipping stones, crab boop and crate stack. Four are out on the islets, each teaching something true about a project: Ask the bartender (busy beer) and Spot the dark pattern (Global Privacy Control) on Boardwalk Isle, Etymology race (Etymon) and Sort the tree of life (Map of Evolution) on Root Isle. The games live in `src/renderers/games/`: pure rules, tested (the islet games' in `games/rules/`), and one shared card every view opens, which paints a game on a canvas or builds it from buttons and words. `games/catalog.ts` says which views can play each one: the islet games are on the 3D island only so far, so the map and the text adventure leave them out. Best scores are part of the store's progress (Ask the bartender has none: it's a drink).
- **Geography**: the island's shape as a recipe (coast ripples, a headland, a hill, the pier), plus **islets** off the west coast (each with its own coast recipe round its middle) and **footbridges** out to them (a level deck from land to other land, with railings). `geo.ts` turns it into height (whichever island's ground is highest), coastline, paths, doors, decks you can walk on, the swimming water round every island, which island you're on, and the way over the bridges (`nextStop`, which also steps round buildings in the way). `checkWorld` fails the build if a bridge starts in the sea, an islet can't be walked to, or a game is left in the water.

Nothing in it knows about pixels, meshes or fonts. Renderers map archetypes to their own art.

`buildWorld()` validates everything with the zod schema in `schema.ts`, then runs cross-checks that span the whole world: every project has exactly one place, every place is reachable from the plaza, nothing overlaps, every lost word is hidden in scenery that exists. A mistake fails the build with a sentence:

```
The world doesn't hold together:
  • places: "contact" can't be reached from "plaza": add a route to it.
```

The same schema is published as JSON Schema at [`/world.schema.json`](https://ambrosevannier.com/world.schema.json), and the world itself at [`/world.json`](https://ambrosevannier.com/world.json).

## The content pack

`/world.json` is the island. [`/pack.json`](https://ambrosevannier.com/pack.json) is everything else, the half that travels: who I am (`src/data/projects.ts`, `src/data/about.ts`), the projects and posts, the word jar and shelf (`src/data/life.ts`), the site's colors and fonts (read from `src/styles/tokens.css`), and the island's ideas without their coordinates: the lost words, the games, the wardrobe and the islanders. Every link in it is absolute. `src/world/pack.ts` builds it and checks it with a zod schema, published at [`/pack.schema.json`](https://ambrosevannier.com/pack.schema.json).

It's there for whatever comes next: a racing game, another site, anything that wants the content without the island. [`docs/brief.md`](docs/brief.md) is its companion, the taste and rules that don't fit in JSON.

## Renderers

A renderer is anything that implements `mount(ctx)` from `src/renderers/types.ts`. It gets the world, its geometry, the shared store and an empty element, and it hands back `pause`, `resume` and `destroy`. The page shell (`src/renderers/shell.ts`) owns everything they share: the HUD and view switcher, the color wipe into a place, the lost-word and catch cards, sound, and the fallbacks (no WebGL means the map; reduced motion means the list).

Renderers are loaded with `import()` only when chosen, so someone reading the list never downloads three.js.

| View | Folder | What it is |
| --- | --- | --- |
| Island | `src/renderers/island` | three.js, procedural low-poly, instanced vegetation, shader water; the bridges in `world/bridges.ts`, the islet games' props in `play/isletProps.ts` |
| Map | `src/renderers/map` | Canvas 2D pixel art drawn from the same height field |
| Text | `src/renderers/text` | A pure parser/engine with tests, and a terminal UI |
| List | `src/components/island/ListView.astro` | Server-rendered HTML: the no-JS, reduced-motion and search-engine view |

`/?view=map` (or `island`, `text`, `list`) opens a view directly.

Inside a building, the spatial views share more: `renderers/roomPlan.ts` is the room as geometry (where you can stand, what's within reach, a path round the furniture), and `renderers/room.ts` is the room's bar, the "Talk to" nudge and the one conversation box (E or Enter to talk, arrows between choices, Escape to close it or leave). In both spatial views the building opens up where it stands: the camera eases in, the roof lifts off and the room appears in its place, with the island still round it. On the map the room is painted by `map/room.ts`, and walking about in it is `map/inside.ts`, a self-contained piece that draws into any 2D canvas at any position and scale. On the island it's `island/interior/`, a Group any three.js scene can mount. The text adventure has `ENTER`, `TALK TO`, `ASK … ABOUT`, `LEAVE`. The store remembers which building you're in, so switching views keeps you inside.

## Shared state

`src/world/store.ts` remembers what a visitor has done: the lost words they've found, the posts they've caught, their best score at each mini-game, whether night has fallen, their best lap round the island in the boat, and where they're standing. The rules are a pure `reduce(world, state, action) → { state, events }`, tested without a browser. Progress lives in `localStorage`; position lives in `sessionStorage`. Switch views mid-walk and you're still standing in the same spot with the same pockets.

## The rest of the site

- `/work/<slug>`: a page per project, each with a small interactive demo (`src/components/work/toys`).
- `/blog`: static, quiet reading. Posts are Markdown in `posts/`, edited through Sveltia CMS at `/admin`.
- `/contact`: a form that posts to a Cloudflare Worker (`contact-worker/`).
- Everything in `public/` (the busy beer and QuizMate sites, terms, `app-ads.txt`) is served byte for byte, because the App Store and AdMob depend on those URLs.

## Working on it

```sh
npm install
npm run dev      # http://localhost:4321
npm test         # vitest: the world, the store, the renderers' pure logic
npm run build    # astro check, then tests, then the static build in dist/
npm run test:e2e # browser tests against dist/ (Playwright; see docs/e2e.md)
```

Node 22. Deployed on Vercel from `main`.
