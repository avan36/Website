# The brief

This file and [`/pack.json`](https://ambrosevannier.com/pack.json) are a starter kit for whatever gets built next: a racing game, a new site, some other experiment.

- **The pack** is the content, as data: who Ambrose is, the projects, the posts, what matters, the colors and fonts, and the island's ideas (lost words, games, wardrobe, islanders, people out walking) with the island's coordinates taken out. Every link in it is absolute, and [`/pack.schema.json`](https://ambrosevannier.com/pack.schema.json) describes its exact shape.
- **This brief** is everything that doesn't fit in JSON: the taste, the voice, the rules, and the ideas already built that are worth borrowing.

## How to use it

**Starting a project with Claude Code**, paste something like this as the first message:

> Read https://github.com/avan36/Website/blob/main/docs/brief.md and https://ambrosevannier.com/pack.json first. They describe me, my work and my taste. I want to build [the idea]. Use the pack for all content (don't retype or invent any), and follow the brief's voice and rules.

**Using the data in code:** fetch the pack at build time, or keep a copy of the file in the new project:

```sh
curl -o pack.json https://ambrosevannier.com/pack.json
curl -o pack.schema.json https://ambrosevannier.com/pack.schema.json
```

Check it against the schema when you load it, so a change on this site can't quietly break the new one. Updates flow one way: edit the content here, and every project that fetches the pack picks it up.

**What's where in the pack:**

| Key | What it is |
| --- | --- |
| `person` | Name, role, intro, education, links |
| `name` | The story of the name, told the way Etymon tells a word's: an immortal basket-maker |
| `cares` | Four beliefs, each tied to the work that shows it |
| `path` | Milestones in order, each with a color |
| `projects` | Everything made: headline, blurb, body, tags, colors, screenshots, links, and the `landmark` that stands for it on the island |
| `posts` | The blog, newest first |
| `life` | The journal word count and the film and TV shelf |
| `style` | Every color token (light and dark) and the font stacks |
| `play` | Lost words, the seven mini-games, the wardrobe, the islanders with everything they say, and the people out walking (real people: they only ever say what's true of any visit) |
| `site.world` | A link to `/world.json`, if you do want the island too |

## What matters

These are the four beliefs from the About page (`cares` in the pack). They make good design rules.

1. **Your life is yours.** middle place keeps a journal on the device and in the person's own iCloud: no accounts, no tracking, nothing sold. The privacy research measured whether 11,000+ websites honor a request not to sell data. For new things: collect nothing you don't need, and keep what's private private.
2. **Show where things come from.** Etymon traces words back through every language they passed through; Map of Evolution does it for life. Origins, journeys and lineage show up everywhere, down to the About page's name card.
3. **Judgment is the scarce thing.** "The scarce thing was never the code. It was the judgment about what to build, and the people who showed up to use it." Choose carefully what to make, and make it for the people who'll use it.
4. **Learning should answer back.** QuizMate gives feedback the moment it's needed. Things should respond to people, quickly and kindly.

## Voice

- **Warm, brief, plain.** Short sentences, everyday words. Second person ("you") when talking to a visitor; Ambrose speaks as "I".
- **No em dashes.** Commas, colons and full stops do the work. The tests on this site check for them.
- **Small, gentle jokes.** Juniper keeps secrets "in the woodpile, but that's a different system". Never at anyone's expense.
- **Names keep their case.** middle place and busy beer are lowercase, even at the start of a sentence. Etymon, QuizMate, eQoScan and Map of Evolution are as written.
- **Never invent facts.** Made-up characters only repeat what a project's own page says. Demos say what's real and what's scripted: the crawler toy's 11,000+ is real and its dots aren't; the journal chat is scripted, not real model output; the packaging scanner shows no invented numbers; the word journeys are copied from Etymon's sources.
- **Placeholders never ship.** Anything unwritten is marked as a draft and stays hidden until it's real.

## Look

The colors and fonts are in `style` in the pack, read straight from `src/styles/tokens.css`.

- **Warm neutrals, never pure white or black.** "Sun on sand": cream backgrounds (`#fbf6ec`) and warm ink (`#1d1a16`), with a warm dark mode that follows the device.
- **Every project has its own color**, used everywhere it appears: on its building, its page, its links and its dot on the timeline. The accent for everything else is a burnt orange (`#d9461f`).
- **Two typefaces.** Bricolage Grotesque for headings and interface, Newsreader for reading.
- **Soft and rounded.** Rounded corners, soft warm shadows, springy but quick motion.
- **Readable.** Text meets contrast guidelines (the faintest text is 5.2:1 on the background).

## How things get built

Patterns from this site that are worth carrying into anything new:

- **Content is data, and views are separate.** The island is one world in JSON, drawn four ways: 3D, a pixel map, a text adventure and a plain list. Nothing in the data knows about pixels. A new idea is one more view of the same data.
- **Mistakes fail loudly, in a sentence.** The data is checked when the site builds, and a broken world stops the build with something like `"contact" can't be reached from "plaza": add a route to it.`
- **Everything has a plain fallback.** No WebGL gets the map, reduced motion gets the list, and the list works without JavaScript. The fancy version is never the only way in.
- **Phones are first-class.** Every game and toy works with a finger, and nothing scrolls sideways on a narrow screen.
- **Progress travels.** Switch views mid-walk and you're standing in the same spot with the same pockets: found words, best scores, what you're wearing.
- **Rules are pure and tested.** Game logic, the race course and the timetable are plain functions tested without a browser, with a small browser test suite on top.
- **Private stays private.** No journal content ever goes in the code (only a word count), and guestbook notes are never published without approval.

## Ideas already built

Things that worked here and could be borrowed, remixed or taken further:

- **A portfolio you can walk.** Every project is a building: the journal is a cabin, the taste app a taproom, the etymology site an old library, the privacy research a lighthouse, the classroom app a schoolhouse, the packaging scanner a recycling depot, the tree of life an ancient tree (`landmark` in the pack).
- **Hidden lost words.** Eight words English dropped, from Etymon's museum, tucked into the scenery where they belong. Find them all and night falls.
- **Fishing for posts.** Cast off the pier and what bites is a blog post.
- **A portal between views.** Step through on the 3D island and you come out on the pixel map, then in the text adventure, standing in the same place.
- **A boat race** round the island against the clock and a ghost of your best lap.
- **Seven mini-games:** skipping stones (timing), crab boop (whack-a-mole) and crate stack (precision) on the island, and four over footbridges on two islets that each teach something true about a project: Ask the bartender (busy beer), Spot the dark pattern (privacy), Etymology race (Etymon) and Sort the tree of life (Map of Evolution). All seven are in the pack.
- **A wardrobe** you earn by visiting places: a scarf from the cabin, a hard hat from the taproom, reading glasses from the library.
- **Islanders** in every building: a caretaker, a barkeep, a librarian, a lighthouse keeper, a teacher, a sorter, and in the mall a fry cook and a shopper, each with a few things to talk about.
- **Rooms you walk into**, built as a dollhouse in 3D and a pixel room on the map.
- **Real time.** The island keeps the clock of the place it was made in: morning light, dusk, lit windows after dark, and a commuter train that runs at rush hour.
- **Islets and bridges.** The island grew two islets off its west coast, joined to it by footbridges with railings: Root Isle for where words and living things come from, Boardwalk Isle with a beach bar and a pushy cookie-banner billboard. Off the east end, Tower Bridge runs from the quay (where the London bus is parked, facing it) out to Little London.
- **People out walking.** Friends and family stroll the island in their own scarves and coats: Pushkar, Jeremy, Eugene, Abdu and the protector, who walks a slow, wide patrol, on the main island, and Dad, Mom, Lucia, Andrew and Isaac on Little London. They stop as you come up and say a few small, true-of-any-visit things in turn: hello, the weather, the way to somewhere. Where they are is a function of the time, so every view agrees.
- **A quiet room.** Along from the mall on Little London, a townhouse with a green door and a brass plate that only says ROOMS. Inside: two armchairs facing each other, a box of tissues within reach, a clock only one chair can see, a calm painting and a plant, and Wren, who asks how you are and says "Take your time." It never says what it is.
- **A memory you can walk into.** Not everything on the island is work. Westfield, over Tower Bridge, is a building with a room and no page, with Five Guys inside, and one line in Ambrose's words: "I spent a lot of time here growing up, with my dad." In the data it's a place of kind `memory`.
- **A toy on every project page:** a journal chat that types itself out, a five-axis taste match, a tree of life that grows, a word that morphs through its history, a lighthouse beam over 11,000 dots, a barcode scan, a pop quiz.
- **A name card** told the way Etymon tells a word's story.
- **A word jar** that counts up from the number a returning visitor last saw.

### Sketch: a racing game from the pack

To show how the pieces fit:

- Each project becomes a checkpoint or a stretch of track, in its own color, themed by its `landmark` (round the lighthouse, through the library).
- Lost words are pickups along the track, and collecting one shows its `story`.
- Islanders are the commentators, speaking in their own voices, and the outfits become unlockable cosmetics.
- Best laps are kept the way the boat race keeps them, and there's a plain fallback for phones and reduced motion.

## Keeping it current

The pack is rebuilt from this site's own files every time it deploys, so there's nothing to keep in sync by hand:

| To change | Edit |
| --- | --- |
| Projects, intro, education | `src/data/projects.ts` |
| Name story, beliefs, milestones | `src/data/about.ts` |
| Word jar, shelf | `src/data/life.ts` |
| Posts | `posts/*.md` (or `/admin`) |
| Lost words, games, wardrobe, islanders, people out walking | `src/world/world.ts` |
| Colors and fonts | `src/styles/tokens.css` |

Edit this brief whenever the taste changes. It's the part a computer can't work out from the code.
