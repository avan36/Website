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

## What's on the island

### Four ways to see it

| View | What you do |
| --- | --- |
| **3D island** | Walk (or swim) a low-poly island in three.js, cross the bridges to the islets, take the boat out. |
| **Pixel map** | The same island as top-down pixel art, walked with WASD, the arrow keys or a finger. |
| **Text adventure** | `GO TO`, `LOOK`, `EXAMINE`, `ENTER`, `TALK TO`, `ASK … ABOUT`, `LEAVE`, `INVENTORY`: the island in words. |
| **List** | Plain HTML of everything on it, for no-JS, reduced motion and search engines. |

The portal in the middle of the plaza steps you into the next view (island → map → text → island). The view switcher in the HUD does the same, and `/?view=…` opens one directly.

### Places

Every project has a building, and every building has a room you can walk into, with things to look at and an islander or two to talk to.

| Place | What it is |
| --- | --- |
| The plaza | The crossroads, with the portal |
| The cabin | middle place, the journaling app |
| The taproom | busy beer, the drinks taste companion |
| The ancient tree | Map of Evolution |
| The old library | Etymon, the word museum |
| The lighthouse | Global Privacy Control research |
| The schoolhouse | QuizMate |
| The recycling depot | eQoScan |
| The workshop | How the site was built (the colophon and the blueprint) |
| The pier | The blog, and fishing |
| Message in a bottle | Contact, and the guestbook |
| Westfield | A memory rather than a project: the mall on Little London, Five Guys included |
| The glass tower | Not a project, just for fun: a glass tower on Synergy Isle so tall it has its own weather, with the Head of Vibes in the lobby |

Off the coast are four islets: **Boardwalk Isle** and **Root Isle** to the west over footbridges, **Synergy Isle** further out past Boardwalk Isle over a long bridge with a badge gate on it, and **Little London** to the east over **Tower Bridge**, with Westfield, a London street and a red bus on the quay.

### Things to do

- **Lost words**: eight words English lost (overmorrow, crapulous, attercop, wordhord, uhtcearu, ultracrepidarian, emmet, curglaff) are hidden in the scenery. Find them all and night falls.
- **Fishing**: cast off the pier and reel in a post from the blog.
- **Boat race**: take the speedboat at the end of the pier and race a lap round the island through the gates. Your best lap is kept.
- **Mini-games**: eight of them, with best scores kept.

  | Game | Where | Views |
  | --- | --- | --- |
  | Skipping stones | Main island | all three |
  | Crab boop | Main island | all three |
  | Crate stack | Main island | all three |
  | Ask the bartender (busy beer) | Boardwalk Isle | 3D island |
  | Spot the dark pattern (Global Privacy Control) | Boardwalk Isle | 3D island |
  | Etymology race (Etymon) | Root Isle | 3D island |
  | Sort the tree of life (Map of Evolution) | Root Isle | 3D island |
  | Speak corporate (the badge gate) | Boardwalk Isle | all three |

- **The badge gate**: a turnstile stands on the long bridge out to Synergy Isle, and the greeter at the badge desk beside it reads out three plain things ("Let's talk later."). Pick the most corporate way to say two of them ("Let's circle back and take this offline.") and the gate opens for good, in every view.

- **Wardrobe**: twelve pieces to find, one near each place (a cardinal scarf on the cabin porch, a hard hat at the taproom, a leaf crown from the tree, reading glasses at the library, sunglasses at the lighthouse, a graduation cap at the schoolhouse, a recycling vest at the depot, a tool belt in the workshop, a fishing hat on the pier, a red cap at Westfield, a sailor's cap on the quiet beach and a fleece vest in the glass tower). Mix and match them on the explorer: head, face, neck and body.
- **Talk to the islanders**: each room has someone with a few topics. What they say about a project only repeats what's on its page.
- **Island time**: the island keeps California time. The light follows the real sun, windows light up after dark, and the commuter train runs round its loop at rush hour (`src/world/clock.ts`, `src/world/train.ts`). It stops for anyone standing on the line.
- **Sound**: small synthesized sounds (footsteps, the sea, the games), off by default.
- **Progress travels**: words found, posts caught, scores, laps, outfits and where you're standing carry over when you switch views.

### Elsewhere on the site

- `/work/<slug>`: a page per project, each with a small interactive toy (a taste match, a pop quiz, a word's journey, a tree of life, a packaging scan…).
- `/about`: who I am, with my name's etymology told the way Etymon tells a word's.
- `/blog` and `/rss.xml`: the writing.
- `/contact`: a form, plus a guestbook of hand-approved notes (`src/data/guestbook.ts`).
- `/colophon` and `/blueprint`: how it works, and the whole world laid out to explore, both generated from the real world at build time.
- The middle place page has a writing desk: a word jar of how much I've journaled (a count only) and a shelf of what I'm watching (`src/data/life.ts`).

## The world model

`src/world/world.ts` is the one file to edit to change the island. It describes:

- **Places**: where each thing stands (`at`, in world units, +z is south), what it is (`archetype`: cabin, lighthouse, pier, mall, skyscraper…), what it opens (`href`), and what you see when you get there (`description`, `scenery` you can examine). Project places pull their name, color and blurb from `src/data/projects.ts`. Not every place is work: a `memory` is somewhere from Ambrose's own life, a building with a room and no page to open (Westfield, over Tower Bridge, is the first), and a `folly` is somewhere made up just for fun, also a room and no page (the glass tower on Synergy Isle).
- **Routes**: which places connect. Paved ones become paths in the spatial views; the rest are shortcuts the text adventure narrates.
- **Lost words**: eight words English lost (from [Etymon](https://avan36.github.io/Etymology/)'s museum), each hidden in a specific piece of scenery and at a specific spot.
- **Interiors**: every building (and nothing else) has a room: a description, a few `things` to look at (each with a `prop` the renderers draw, and an optional link), and one or two islanders with a greeting, 2 to 4 `topics` and a farewell. Rooms have their own units, door in the middle of the front wall; `checkWorld` keeps everything on the floor, clear of the door and each other, and every link pointing at a real page. The islanders are fictional; what they say about a project only restates its page, and in Westfield they only say what's true of any visit (Five Guys is as it really is).
- **Activities**: fishing off the pier, which catches a post from the blog; the portal; a speedboat at the end of the pier to race round the island (the course itself is pure math in `src/world/race.ts`); and eight mini-games (`kind: 'minigame'` with a `game` id). Three are on the main island: skipping stones, crab boop and crate stack. Four are out on the islets, each teaching something true about a project: Ask the bartender (busy beer) and Spot the dark pattern (Global Privacy Control) on Boardwalk Isle, Etymology race (Etymon) and Sort the tree of life (Map of Evolution) on Root Isle. The eighth, Speak corporate, is the badge desk at the gate out to Synergy Isle. The games live in `src/renderers/games/`: pure rules, tested (the islet games' in `games/rules/`), and one shared card every view opens, which paints a game on a canvas or builds it from buttons and words. `games/catalog.ts` says which views can play each one: the four project games on the islets are on the 3D island only so far, so the map and the text adventure leave them out; Speak corporate is words and buttons, so all three play it. Best scores are part of the store's progress (Ask the bartender has none: it's a drink).
- **Outfits**: twelve wardrobe pieces in four slots (head, face, neck, body), each with a hint and a spot where it's found.
- **Geography**: the island's shape as a recipe (coast ripples, a headland, a hill, the pier), plus **islets** (each with its own coast recipe round its middle: two off the west coast, Synergy Isle further out past Boardwalk Isle, and Little London off the east end) and **bridges** out to them (a level deck from land, or the quay, to other land, with railings). A bridge's `style` is a plain `footbridge` or a `tower` bridge, which the views draw as Tower Bridge: two towers in the water, walkways high between them and chains swooping down to either end. A bridge can have a `gate`: a turnstile where its deck leaves the land at its `from` end, shut until you score its `pass` at its `game`. `geo.ts` turns it into height (whichever island's ground is highest), coastline, paths, doors, decks you can walk on, the swimming water round every island, which island you're on, the way over the bridges (`nextStop`, which also steps round buildings in the way), and where each gate stands and which islands are behind it (`gates`, `gatesBetween`). `checkWorld` fails the build if a bridge starts in the sea, an islet can't be walked to, a game is left in the water, or a gate has no game to open it, has its game on its far side or more than 8 away, or guards nothing (there's another way round). Synergy Isle stands far enough out that its swimming water never meets Boardwalk Isle's, so nobody swims round the gate.

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
| Island | `src/renderers/island` | three.js, procedural low-poly, instanced vegetation, shader water; the bridges (Tower Bridge too) in `world/bridges.ts`, the gates on them in `play/gate.ts`, the islet games' props in `play/isletProps.ts`, the glass tower in `landmarks/skyscraper.ts` |
| Map | `src/renderers/map` | Canvas 2D pixel art drawn from the same height field; a shut gate is stamped across its deck (`map/gate.ts`) |
| Text | `src/renderers/text` | A pure parser/engine with tests, and a terminal UI |
| List | `src/components/island/ListView.astro` | Server-rendered HTML: the no-JS, reduced-motion and search-engine view |

`/?view=map` (or `island`, `text`, `list`) opens a view directly.

Inside a building, the spatial views share more: `renderers/roomPlan.ts` is the room as geometry (where you can stand, what's within reach, a path round the furniture), and `renderers/room.ts` is the room's bar, the "Talk to" nudge and the one conversation box (E or Enter to talk, arrows between choices, Escape to close it or leave). In both spatial views the building opens up where it stands: the camera eases in, the roof lifts off and the room appears in its place, with the island still round it. On the map the room is painted by `map/room.ts`, and walking about in it is `map/inside.ts`, a self-contained piece that draws into any 2D canvas at any position and scale. On the island it's `island/interior/`, a Group any three.js scene can mount. The text adventure has `ENTER`, `TALK TO`, `ASK … ABOUT`, `LEAVE`. The store remembers which building you're in, so switching views keeps you inside.

## Shared state

`src/world/store.ts` remembers what a visitor has done: the lost words they've found, the posts they've caught, their best score at each mini-game, the gates they've talked their way through (a passing score at a gate's game opens it, and it stays open), whether night has fallen, their best lap round the island in the boat, and where they're standing. The rules are a pure `reduce(world, state, action) → { state, events }`, tested without a browser. Progress lives in `localStorage`; position lives in `sessionStorage`. Switch views mid-walk and you're still standing in the same spot with the same pockets.

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
