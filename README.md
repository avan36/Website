# ambrosevannier.com

My personal site. The home page is a tiny island you can explore. Every place on it is something I've made, and you can walk it in 3D, on a pixel map, or as a text adventure, or just read the list.

Those are four views of **one world**, and the world is data. The first half of this file is what's on the island and how to play it. The second half is how it's built.

- [What's on the island](#whats-on-the-island)
- [The rest of the site](#the-rest-of-the-site)
- [How it's built](#how-its-built)
- [Working on it](#working-on-it)

## What's on the island

### Four ways to see it

| View | What it is | Open it with |
| --- | --- | --- |
| Island | A low-poly 3D island: walk, swim, jump, go inside, take the boat out | `/?view=island` |
| Map | The same island in pixel art, walked the same way | `/?view=map` |
| Text | A text adventure: `look`, `go to library`, `talk to mabel` | `/?view=text` |
| List | Every place and project as plain HTML, no JavaScript needed | `/?view=list` or `/#work` |

Switch any time from the view menu at the top, or step through the portal on the plaza. You keep your spot and your pockets when you switch.

If you don't choose, the page does: the view you last used in this tab, or else the 3D island. Without WebGL you get the map, and with reduced motion turned on you get the list.

### Getting around

On the island and the map:

| | Keyboard and mouse | Touch |
| --- | --- | --- |
| Walk | WASD or the arrow keys, or click where you want to go (hold and drag to steer) | Tap where you want to go, or hold and drag |
| Run | Hold Shift, or double-click | Double-tap |
| Jump | Space. Let go early for a hop, press again in mid-air for a double jump | Tap your explorer, or long-press to jump higher |
| Swim | Walk into the sea. In deep water, Space is a kick | The same |
| Go in | Enter at a place's card, or walk into its door | Tap the place's card |
| Use something | E or Enter by a game, the boat or someone to talk to. F casts a line | Tap it |
| Turn the camera (3D only) | Q and E turn 45° when nothing's in reach. Right-drag turns, the wheel zooms | Two-finger twist and pinch |
| Leave a room | Escape, the Leave button, or walk out of the door | The Leave button |

On the island the double jump is a somersault; on the map it's a spin. Jumps are floatier on the hill by the ancient tree. The map picks its scale to fit your screen and zooms in by itself when you go inside.

In the text adventure, Enter acts, Tab completes, ↑ and ↓ go through your history, and Escape clears the line. Click any underlined word to run it; on a phone, suggestion chips sit above the keyboard. `HELP` lists what it understands. It forgives typos ("Did you mean…?", then `YES`), and it ignores "please". Try `MAP` for an ASCII map of the island drawn from the same height field as the 3D one.

### The places

Every path starts at the plaza. Walk up to a place and its card opens. Going in opens the building up where it stands, or, for somewhere without a room, wipes the screen in its color and takes you to its page. Each place keeps a piece for your wardrobe.

| Place | What it is | Opens | Inside | Wardrobe |
| --- | --- | --- | --- | --- |
| The plaza | Where every path meets, with the portal | | | |
| The cabin | [middle place](https://middleplace.app), the journal that writes back | `/work/middle-place` | Juniper, the caretaker | cardinal scarf |
| The taproom | busy beer, a taste companion for what you drink | `/work/busy-beer` | Otto, the barkeep | hard hat |
| The ancient tree | Map of Evolution | `/work/map-of-evolution` | No room | leaf crown |
| The old library | [Etymon](https://avan36.github.io/Etymology/), where English words came from | `/work/etymon` | Mabel, the librarian, and Pip, a reader | reading glasses |
| The lighthouse | Global Privacy Control research, on top of Foss Hill | `/work/privacy-research` | Morwenna, the lighthouse keeper | sunglasses |
| The schoolhouse | QuizMate, lessons and quizzes for the classroom | `/work/quizmate` | Ms Hazel, the teacher, and Tobias, a student | graduation cap |
| The recycling depot | eQoScan, a product's packaging footprint | `/work/eqoscan` | Rosa, the sorter | recycling vest |
| The workshop | How the island was built | `/colophon` | No room | tool belt |
| The pier | Writing | `/blog` | No room | fishing hat |
| Message in a bottle | Contact | `/contact` | No room | sailor's cap |
| Westfield | A memory, over Tower Bridge | No page | Clem, the fry cook, and Nell, a shopper | red cap |
| No. 12 | A quiet townhouse along from the mall, with a brass plate that only says ROOMS | No page | Wren, the listener | soft scarf |
| The glass tower | Not a project, just for fun: a tower on Synergy Isle so tall it has its own weather | No page | Skye, the Head of Vibes | fleece vest |

The lighthouse stands on **Foss Hill**, the rocky headland at the north-east corner. Big letters on the slope below it spell FOSS HILL, Hollywood style, facing the island, and a small pink, purple and blue flag waves on the hilltop.

Off the coast are four islets. Root Isle and Boardwalk Isle are to the west, over footbridges, with four of the games. Synergy Isle is further out past Boardwalk Isle, over a long bridge with a badge gate on it, and the glass tower stands on it. Little London is to the east, over Tower Bridge, with Westfield and No. 12 on it.

Everywhere has scenery to look at: in the text adventure you `EXAMINE` it, and in the spatial views it's the props you walk past.

### Inside the buildings

Nine buildings have a room. In both spatial views the camera eases in, the roof lifts off and the walls sink, and the room appears where the building stood, with the island still round it.

Each room has a few things to look at, some of them linked to the real project, and one or two islanders. Walk up to someone and press E, or tap them. They greet you, offer two to four topics (pick with the arrow keys), and say goodbye when you press Escape. The islanders are made up, and what they say about a project is only what its own page says. In the text adventure it's `ENTER`, `TALK TO JUNIPER`, `ASK OTTO ABOUT THE SCANNER`, `BYE` and `LEAVE`.

### People out walking

Not everyone is indoors. Pushkar, Jeremy, Eugene, Abdu and the protector stroll the island, and Dad, Mom, Lucia, Andrew and Isaac walk Little London. They stop as you come up, and each says a few small things in turn: hello, the weather, the way to somewhere. Walk up to one (or tap them) on the island or the map, `TALK TO` them in the text adventure, or see who's about at the bottom of the list.

### Lost words

Eight words English lost, from Etymon's museum of lost words, are hidden round the island, each in a piece of scenery that suits it.

- **On the island and the map** they're little scrolls tied with a ribbon in the place's color. Walk over one and it unrolls with a chime.
- **In the text adventure** you find them by looking closely. Examine the right thing and something catches your eye; examine it again, or `SEARCH` it, to find the word. `HINT` gets more specific each time you ask.

Each word comes with its meaning, its story and a bar for when it lived and died. The word hoard (the book in the top bar, with its "found/8" count) shows the words you've found as tiles and the rest as blanks with a riddle. In the text adventure, `INVENTORY` lists them and `SCORE` gives you a rank, from Tourist up to Keeper of the Word-Hoard.

**Find all eight and night falls on the island**, whatever the hour: the moon comes up, every lamp and window glows, and fireflies drift over the grass. After that, the hoard has a switch between night and day (`NIGHT` and `DAY` in the text adventure). "Forget what I found" starts the hunt over.

<details>
<summary>Spoilers: the eight words and where they're hidden</summary>

| Word | It meant | Hidden in |
| --- | --- | --- |
| overmorrow | the day after tomorrow | the journal on the cabin porch |
| crapulous | sick from too much drinking or eating | the barrels behind the taproom |
| attercop | a spider; a spiteful person | the roots of the ancient tree |
| wordhord | a hoard of words | the bookshelf outside the library |
| uhtcearu | sorrow in the hours before dawn | the rocks below the lighthouse |
| ultracrepidarian | someone with opinions beyond their knowledge | the schoolhouse chalkboard |
| emmet | an ant; in Cornwall, a tourist | the bins at the recycling depot |
| curglaff | the shock of cold water when you first plunge in | the rowboat by the pier |

</details>

### Mini-games

Eight games, each with your best score kept. Walk up to a game's signpost and press E, or tap it. Every game opens the same card: how to play, your best, and at the end your score, a "New best!" with confetti when it is one, and a nudge to have another go. In the three games on the main island, R starts the round over.

Three are on the main island and can be played in every view. The other four are on two islets off the west coast, over footbridges, and can only be played on the 3D island so far. Each of those teaches something true about the project it's for. The eighth, Speak corporate, is the badge desk at the end of Boardwalk Isle, and it's words and buttons, so every view can play it.

| Game | Where | How it plays | Score |
| --- | --- | --- | --- |
| Skipping stones | The north beach, along from the lighthouse | Five flat stones. Hold Space (or press and hold) and let go when the swinging needle is in the bright band. Perfect throws in a row skip further, and the band gets narrower | Skips |
| Crab boop | The beach by the bottle | Thirty seconds, nine holes. Boop crabs with 1 to 9, the Q W E / A S D / Z X C block, or a tap. Gold crabs are worth three, a long streak is worth more, and booping the starfish costs you three | Boops |
| Crate stack | Beside the recycling depot | A crane swings each crate over the tower. Drop it (Space, Enter or a tap) square on the last one: whatever hangs over falls off, so the tower narrows. Three perfect drops in a row win some width back. Miss the stack and it's over | Crates |
| Ask the bartender | The beach bar on Boardwalk Isle | Pick three of ten vibes (cozy, rainy day, nightcap…). Each one pushes five flavor axes, the eight-drink menu scores itself as you watch, and the top drink is poured with the reasons why | None: it's a drink |
| Spot the dark pattern | The kiosk on Boardwalk Isle | Fernhollow Kitchen's signup page hides eight tricks, from lopsided buttons to a countdown that quietly starts over. Flag the ones built to steer you, then see which ones Global Privacy Control would have settled for you, and whether your own browser sends it | Tricks found, of 8 |
| Etymology race | The giant dictionary on Root Isle | Ten words from a pool of 77. Which language did English borrow each one from, or which is its oldest ancestor? Quick answers score more, a streak multiplies everything up to ×2, and every answer shows the word's journey. The clock can be turned off | Points |
| Sort the tree of life | The young tree on Root Isle | Twelve living things, dealt from 59 (platypus, axolotl, zombie-ant fungus…), to hang on nine branches. Drag a card, tap it and then a branch, or press 1 to 9. Every card comes with a fact | Correct, of 12 |
| Speak corporate | The badge desk at the end of Boardwalk Isle, by the long bridge | The greeter reads out three plain things ("Let's talk later."). Pick the most corporate way to say each one ("Let's circle back and take this offline.") with 1 to 4 or a tap. Get two and the badge gate opens | Answers, of 3 |

In the text adventure, `PLAY` lists the games. Skipping stones is played in words (`THROW` when the sea goes flat as glass), and crab boop, crate stack and Speak corporate open the same card the other views use.

### The badge gate

A turnstile stands across the long bridge out to Synergy Isle, and it won't turn until you've talked your way through at the badge desk beside it. Get two of Speak corporate's three right and the gate opens for good, in every view. Past it is the glass tower, where the Head of Vibes keeps a spare fleece vest behind reception.

### Fishing for posts

At the end of the pier, cast a line (E, F or a tap), wait through a nibble or two, and reel in the moment the float goes under (Space or a tap; in the text adventure, `FISH`, then `REEL`). Too soon and it's gone; too slow and it gets away. What bites is never a fish. It's a post from the blog, one you haven't caught yet, with a button to read it or throw it back, and a count of how many of my posts you've caught.

### The speedboat race

A red speedboat is tied up at the very end of the pier. Climb in with E (or tap it) and drive with WASD or the arrow keys. On a phone there's a steering pad, gas and brake buttons, and a thumbstick wherever your thumb lands.

Press R to race a lap. After a 3, 2, 1 countdown, you go round the island through ten gates in order, with an arrow over the boat pointing at the next one. Miss a gate and you have to go back for it. At each gate you get your split against a ghost: your own best lap, replayed as a see-through blue boat. The finish card tells you how you did against your best, and a new best becomes the next ghost.

On the map, the boat's card offers "Race it in 3D", which puts you in the boat on the island. In the text adventure, `RACE` tells you about a lap, and `RACE IN 3D` hands you the wheel on the island.

### The wardrobe

Every place but the plaza keeps a piece of clothing, thirteen in all, and it's yours the moment you arrive (the table above says which is where). Open the wardrobe from the top bar and wear one piece per slot: head, face, neck and body. Your explorer wears them in 3D, in pixels and inside the rooms, and the text adventure tells you what you've got on (`WARDROBE`, `WEAR`, `TAKE OFF`). Pieces you haven't found yet are silhouettes with a hint.

### The portal

A ring of violet light hangs over the plaza. Walk into it, click it or type `PORTAL`, and choose where to: the 3D island, the pixel map, the text adventure, the list, or the blueprint. You're drawn in, a violet swirl fills the screen, and you step out of the same portal in the other view.

### Island time

The island keeps the clock of where it was made: Pacific time. Its light comes from where the sun really is there right now, so you might arrive at dawn, in the afternoon or after dark, when the sky is starry and every window and lamp is lit. The intro card says what time it is on the island.

- **The Caltrain.** A silver double-decker Caltrain runs on a little railway round the east end. Every day from five in the morning until one at night it goes round and round, stopping at the platform for a few seconds every lap. In the small hours it rests there. It stops for anyone standing on the track.
- **The skyline.** Far off to the north there's a city, or two cities that have run into each other: a big wheel, a clock tower, a glass shard, a slim pyramid. After dark their windows light up one by one.
- **The sea and sky.** Clouds with shadows, circling gulls, a sailboat that lights its lamp at night, and a ring of buoys at the swimming limit with red lamps after dark.

Visit at any hour you like: `?time=22:00` sets the island's clock to ten tonight and lets it run from there, and `?commute=on` or `?commute=off` makes the train run or rest.

### Little London

Down on the stone quay past the taproom, a red London double-decker is parked facing Tower Bridge: two towers in the water, walkways high between them, and chains swooping down to either end. Cross it to Little London, an islet with a red phone box, a pillar box, street lamps, and Westfield, a shopping centre whose glass roof lifts off whole when you go in. Inside there's Five Guys, an escalator and a row of shopfronts. It isn't a project. I spent a lot of time there growing up, with my dad.

Along from the mall is No. 12, a narrow brick townhouse with a sage green door and a window box of lavender. A small brass plate by the bell says ROOMS, and nothing else. Inside it's warm and hushed: two armchairs facing each other, tissues within reach, and Wren, who asks how you are and lets you take your time. A soft scarf hangs on the hook by the door.

Dad, Mom, Lucia, Andrew and Isaac are out walking the streets, and stop to say hello.

### Sound

Sound is off until you turn it on with the speaker in the top bar. Everything is made with Web Audio, with no sound files: the sea, footsteps, splashes and jumps, the race countdown, the school bell, and a sound for every game (each skip a semitone higher than the last).

### What the island remembers

Your progress is saved in this browser: the words you've found, the posts you've caught, your best at every game, your best lap and its ghost, your wardrobe and what you're wearing, the gates you've talked your way through, and whether night has fallen. Where you're standing, and which building you're in, last only as long as the tab, so a new visit starts at the plaza. "Forget what I found" clears the words, the catches and the night, and keeps your bests, your wardrobe and the open gates.

### For everyone

- The list view is server-rendered HTML that works without JavaScript. It's also what search engines read.
- With reduced motion, the page opens on the list. In the spatial views there's no intro swoop and no somersault, jumps are lower, wipes and camera turns are instant, and the text adventure prints at once instead of typing out.
- If WebGL is missing or lost, the island falls back to the map. If any other view fails, it falls back to the list.
- Every game has keys as well as touch. The map has a "Go to" list of every place for keyboard users, and the text adventure's map comes with a summary for screen readers.
- The HUD is tested on phones from 320px wide.

## The rest of the site

**Project pages** (`/work/<slug>`), one for each of the seven projects. Each one has a small interactive toy, screenshots in device frames, the facts (platform, what it's built with, where it is on the island), the App Store badge or a link to try it, and a "Next stop" ticket to the next project. If the project has an islet game, a link takes you back to the island right beside it. Arriving from the island, the color wipe finishes on the page.

| Project | The toy |
| --- | --- |
| middle place | Journal chat: a journal remembering an earlier entry, typing itself out on a phone. The page also has a writing desk: a word jar of how much I've journaled (a count only), which counts up from wherever it was on your last visit, and a shelf of what I'm watching |
| busy beer | Taste match: drag a five-axis radar of your palate, or pick a preset, and watch a menu of six beers re-rank |
| Map of Evolution | Tree of life: a tree grows from the first cell out to "You are here" |
| Etymon | Word journey: pick water, nice, salary, disaster or window, and watch it change stage by stage from its oldest form into English |
| Global Privacy Control | Crawl field: a lighthouse beam sweeps across 11,000 dots, one for every site the crawler checked |
| QuizMate | Pop quiz: three questions, with confetti and a fact for a right answer and a hint for a wrong one |
| eQoScan | Pack scan: scan a cereal box and see its packaging footprint |

- **Writing** (`/blog`): static, quiet reading, grouped by year, with an RSS feed at `/rss.xml`. Posts are Markdown in `posts/`, edited through Sveltia CMS at `/admin`.
- **About** (`/about`): my name told the way Etymon tells a word's story, what I care about, and where I've been.
- **Contact** (`/contact`): a bottle bobbing on the waves and a form that posts to a Cloudflare Worker (`contact-worker/`), which emails me. When you send, the page folds into a paper plane and flies off. There's a guestbook in a bottle too: leave a one-line note, and once I've approved it by hand, it can wash up for someone else (three at random per visit).
- **The blueprint** (`/blueprint`): the world data laid out on a drafting table. Click anything on the plan for its card and its JSON, browse tabs for every part of the world, and turn over the lost words' flip cards.
- **The colophon** (`/colophon`): how the site works, in more detail.
- **The 404** page: lost at sea, with a sailboat bobbing under a question mark.
- Everything in `public/` (the busy beer and QuizMate sites, terms, `app-ads.txt`) is served byte for byte, because the App Store and AdMob depend on those URLs.

## How it's built

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

### The world model

`src/world/world.ts` is the one file to edit to change the island. It describes:

- **Places**: where each thing stands (`at`, in world units, +z is south), what it is (`archetype`: cabin, lighthouse, pier, mall, townhouse, skyscraper…), what it opens (`href`), and what you see when you get there (`description`, `scenery` you can examine). Project places pull their name, color and blurb from `src/data/projects.ts`. Not every place is work: a `memory` is somewhere from Ambrose's own life, a building with a room and no page to open (Westfield, over Tower Bridge, is the first), a `quiet` place is just a room to sit in, with no page either (No. 12, the townhouse along from the mall), and a `folly` is somewhere made up just for fun, also a room and no page (the glass tower on Synergy Isle).
- **Routes**: which places connect. Paved ones become paths in the spatial views; the rest are shortcuts the text adventure narrates.
- **Lost words**: eight words English lost (from [Etymon](https://avan36.github.io/Etymology/)'s museum), each hidden in a specific piece of scenery and at a specific spot.
- **Interiors**: every building (and nothing else) has a room: a description, a few `things` to look at (each with a `prop` the renderers draw, and an optional link), and one or two islanders with a greeting, 2 to 4 `topics` and a farewell. Rooms have their own units, door in the middle of the front wall; `checkWorld` keeps everything on the floor, clear of the door and each other, and every link pointing at a real page. The islanders are fictional; what they say about a project only restates its page, and in Westfield they only say what's true of any visit (Five Guys is as it really is).
- **Activities**: fishing off the pier, which catches a post from the blog; the portal; a speedboat at the end of the pier to race round the island (the course itself is pure math in `src/world/race.ts`); and eight mini-games (`kind: 'minigame'` with a `game` id). Three are on the main island: skipping stones, crab boop and crate stack. Four are out on the islets, each teaching something true about a project: Ask the bartender (busy beer) and Spot the dark pattern (Global Privacy Control) on Boardwalk Isle, Etymology race (Etymon) and Sort the tree of life (Map of Evolution) on Root Isle. The eighth, Speak corporate, is the badge desk at the gate out to Synergy Isle. The games live in `src/renderers/games/`: pure rules, tested (the islet games' in `games/rules/`), and one shared card every view opens, which paints a game on a canvas or builds it from buttons and words. `games/catalog.ts` says which views can play each one: the four project games on the islets are on the 3D island only so far, so the map and the text adventure leave them out; Speak corporate is words and buttons, so all three play it. Best scores are part of the store's progress (Ask the bartender has none: it's a drink).
- **Outfits**: thirteen wardrobe pieces in four slots (head, face, neck, body), one per place, each with a hint. Arriving at the place unlocks its piece.
- **People out walking** (`wanderers`): real people from Ambrose's life, out in the open air rather than in a room. Each has a name, what they look like (`looks`, a scarf `color`, and a `coat` and `hat` if they wear them), what they're up to (`doing`), the island they `roams` (`main`, or an islet's id), a loop of waypoints they `walk` at a `pace`, stopping for `pause` seconds at each, and three to six `lines` they say in turn. They only say what's true of any visit, never anything about themselves. Where they are is a pure function of the time (`src/world/wander.ts`), so every view puts them in the same place; they stop for you as you come up. `checkWorld` keeps every walk on its own island's dry land, round the buildings and the games, off the railway, the quay, the ends of the bridges and the signs and flags, and every name different from everyone else's (the text adventure finds people by name).
- **Geography**: the island's shape as a recipe (coast ripples, a headland, a hill, the pier, the railway loop and the quay), plus **islets** (each with its own coast recipe round its middle: two off the west coast, Synergy Isle further out past Boardwalk Isle, and Little London off the east end, big enough for the mall, the townhouse and five people out walking) and **bridges** out to them (a level deck from land, or the quay, to other land, with railings). **Signs** are big standing letters on a hillside (`text`, `height`, where the line's middle is and which way it `faces`): FOSS HILL on the slope below the lighthouse is the first, and `signLetters` in `geo.ts` lays its letters out for every view. **Flags** are small flags on poles, their stripes the `--flag-*` colors in `tokens.css`. A bridge's `style` is a plain `footbridge` or a `tower` bridge, which the views draw as Tower Bridge: two towers in the water, walkways high between them and chains swooping down to either end. A bridge can have a `gate`: a turnstile where its deck leaves the land at its `from` end, shut until you score its `pass` at its `game`. `geo.ts` turns it into height (whichever island's ground is highest), coastline, paths, doors, decks you can walk on, the swimming water round every island, which island you're on, the way over the bridges (`nextStop`, which also steps round buildings in the way), and where each gate stands and which islands are behind it (`gates`, `gatesBetween`). `checkWorld` fails the build if a bridge starts in the sea, an islet can't be walked to, a game is left in the water, or a gate has no game to open it, has its game on its far side or more than 8 away, guards nothing (there's another way round), or a sign's letters stand in the sea, on a path or in front of a lost word. Synergy Isle stands far enough out that its swimming water never meets Boardwalk Isle's, so nobody swims round the gate.

Nothing in it knows about pixels, meshes or fonts. Renderers map archetypes to their own art. Island time (`src/world/clock.ts`), the train's timetable (`src/world/train.ts`) and where people out walking are (`src/world/wander.ts`) are pure functions of a date, tested without a browser.

`buildWorld()` validates everything with the zod schema in `schema.ts`, then runs cross-checks that span the whole world: every project has exactly one place, every place is reachable from the plaza, nothing overlaps, every lost word is hidden in scenery that exists. A mistake fails the build with a sentence:

```
The world doesn't hold together:
  • places: "contact" can't be reached from "plaza": add a route to it.
```

The same schema is published as JSON Schema at [`/world.schema.json`](https://ambrosevannier.com/world.schema.json), and the world itself at [`/world.json`](https://ambrosevannier.com/world.json).

### The content pack

`/world.json` is the island. [`/pack.json`](https://ambrosevannier.com/pack.json) is everything else, the half that travels: who I am (`src/data/projects.ts`, `src/data/about.ts`), the projects and posts, the word jar and shelf (`src/data/life.ts`), the site's colors and fonts (read from `src/styles/tokens.css`), and the island's ideas without their coordinates: the lost words, the games, the wardrobe, the islanders and the people out walking. Every link in it is absolute. `src/world/pack.ts` builds it and checks it with a zod schema, published at [`/pack.schema.json`](https://ambrosevannier.com/pack.schema.json).

It's there for whatever comes next: a racing game, another site, anything that wants the content without the island. [`docs/brief.md`](docs/brief.md) is its companion, the taste and rules that don't fit in JSON.

### Renderers

A renderer is anything that implements `mount(ctx)` from `src/renderers/types.ts`. It gets the world, its geometry, the shared store and an empty element, and it hands back `pause`, `resume` and `destroy`. The page shell (`src/renderers/shell.ts`) owns everything they share: the HUD and view switcher, the color wipe into a place, the lost-word and catch cards, the wardrobe, sound, and the fallbacks (no WebGL means the map; reduced motion means the list).

Renderers are loaded with `import()` only when chosen, so someone reading the list never downloads three.js.

| View | Folder | What it is |
| --- | --- | --- |
| Island | `src/renderers/island` | three.js, procedural low-poly, instanced vegetation, shader water; the bridges (Tower Bridge too) in `world/bridges.ts`, the gates on them in `play/gate.ts`, the islet games' props in `play/isletProps.ts`, the glass tower in `landmarks/skyscraper.ts`, people out walking in `play/wanderers.ts` (one kit mesh each) |
| Map | `src/renderers/map` | Canvas 2D pixel art drawn from the same height field; a shut gate is stamped across its deck (`map/gate.ts`); people out walking in `wanderers.ts` |
| Text | `src/renderers/text` | A pure parser/engine with tests, and a terminal UI |
| List | `src/components/island/ListView.astro` | Server-rendered HTML: the no-JS, reduced-motion and search-engine view |

`/?view=map` (or `island`, `text`, `list`) opens a view directly. Add `?debug` to get the world and the island on `window` for poking at.

Inside a building, the spatial views share more: `renderers/roomPlan.ts` is the room as geometry (where you can stand, what's within reach, a path round the furniture), and `renderers/room.ts` is the room's bar, the "Talk to" nudge and the one conversation box (E or Enter to talk, arrows between choices, Escape to close it or leave). In both spatial views the building opens up where it stands: the camera eases in, the roof lifts off and the room appears in its place, with the island still round it. On the map the room is painted by `map/room.ts`, and walking about in it is `map/inside.ts`, a self-contained piece that draws into any 2D canvas at any position and scale. On the island it's `island/interior/`, a Group any three.js scene can mount. The text adventure has `ENTER`, `TALK TO`, `ASK … ABOUT`, `LEAVE`. The store remembers which building you're in, so switching views keeps you inside.

### Shared state

`src/world/store.ts` remembers what a visitor has done: the lost words they've found, the posts they've caught, their best score at each mini-game, the gates they've talked their way through (a passing score at a gate's game opens it, and it stays open), whether night has fallen, their best lap round the island in the boat, the wardrobe they've collected and what they're wearing, and where they're standing. The rules are a pure `reduce(world, state, action) → { state, events }`, tested without a browser. Progress lives in `localStorage`; position lives in `sessionStorage`. Switch views mid-walk and you're still standing in the same spot with the same pockets.

## Working on it

```sh
npm install
npm run dev      # http://localhost:4321
npm test         # vitest: the world, the store, the renderers' pure logic
npm run build    # astro check, then tests, then the static build in dist/
npm run test:e2e # browser tests against dist/ (Playwright; see docs/e2e.md)
```

Node 22. Deployed on Vercel from `main`.
