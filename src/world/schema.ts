// The schema for the world: the whole site described as data.
//
// A World is plain JSON. It says who the site is about, what they've made and
// written, and lays all of it out as places on a small island: where each one
// stands, how paths connect them, what you see when you look around, what is
// hidden there and what you can do. It says nothing about pixels, meshes or
// fonts. Renderers (the 3D island, the 2D map, the text adventure, the list,
// /world.json) read it and decide how it looks.
//
// Coordinates are in world units (about a metre). Origin is the middle of the
// island, +x is east and +z is SOUTH (so north is -z), which is how the 3D
// camera sees it and how the 2D map draws it.
//
// This file is build-time only (zod). Client code imports its types with
// `import type`, so none of this ships to the browser.

import { z } from 'astro/zod';
import { createGeo } from './geo';

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase-kebab-case');
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'colors are #rrggbb');
const Vec2 = z.object({ x: z.number(), z: z.number() }).strict();

// ---------- Content ----------

export const PersonSchema = z
  .object({
    name: z.string(),
    role: z.string(),
    intro: z.string(),
    /** The page that says more. */
    about: z.string(),
    github: z.url(),
  })
  .strict();

export const LinkSchema = z
  .object({
    label: z.string(),
    href: z.string(),
    kind: z.enum(['appstore', 'primary', 'text']).optional(),
  })
  .strict();

export const ProjectSchema = z
  .object({
    slug: Id,
    name: z.string(),
    headline: z.string(),
    blurb: z.string(),
    platforms: z.string(),
    color: Hex,
    body: z.array(z.string()).min(1),
    tags: z.array(z.string()),
    links: z.array(LinkSchema),
    href: z.string(),
    /** Screenshots, for views that show the work where it stands (a room's panel). */
    shots: z
      .array(z.object({ src: z.string(), alt: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), frame: z.enum(['phone', 'browser']) }).strict())
      .default([]),
  })
  .strict();

export const PostSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    /** ISO date, YYYY-MM-DD. */
    date: z.iso.date(),
    href: z.string(),
  })
  .strict();

// ---------- Places ----------

/** Something in a place you can look at. The text adventure reads these on
 *  "examine"; spatial renderers may draw them or ignore them. */
export const ScenerySchema = z
  .object({
    id: Id,
    /** Nouns that refer to it, first one is the display name. */
    names: z.array(z.string().min(1)).min(1),
    description: z.string(),
  })
  .strict();

export const ARCHETYPES = ['plaza', 'cabin', 'taproom', 'tree', 'library', 'lighthouse', 'schoolhouse', 'depot', 'mall', 'townhouse', 'skyscraper', 'workshop', 'pier', 'bottle'] as const;

/** The archetypes that are buildings you can walk into. */
export const BUILDINGS = ['cabin', 'taproom', 'library', 'lighthouse', 'schoolhouse', 'depot', 'mall', 'townhouse', 'skyscraper'] as const;

// ---------- Inside ----------
// A building's room. Coordinates are in room units (about a metre, like the
// island's), with the origin in the middle of the floor, +x east and +z
// toward the door, which is always in the middle of the front (south) wall.
// Renderers draw the room their own way; `prop` says what each thing is, the
// way `archetype` does for places.

/** A page a line or a thing points at: on this site, or the real thing elsewhere. */
export const PointerSchema = z.object({ label: z.string(), href: z.string() }).strict();

export const PROPS = ['desk', 'hearth', 'frame', 'board', 'counter', 'bookshelf', 'cabinet', 'lens', 'cat', 'globe', 'scanner', 'crates', 'grill', 'sacks', 'escalator', 'shopfront', 'pingpong', 'armchairs', 'sidetable', 'clock', 'plant'] as const;

/** Something inside you can look at. */
export const ThingSchema = z
  .object({
    id: Id,
    /** Nouns that refer to it, first one is the display name. */
    names: z.array(z.string().min(1)).min(1),
    /** What it is, for the renderers' art. Wall things (frame, board, bookshelf, hearth, cabinet, escalator, shopfront) stand against the back wall. */
    prop: z.enum(PROPS),
    at: Vec2,
    description: z.string(),
    link: PointerSchema.optional(),
  })
  .strict();

/** Something you can ask a person about, and what they say. */
export const TopicSchema = z
  .object({
    id: Id,
    /** Words for it, first one is what the choice says ("the journal"). */
    names: z.array(z.string().min(1)).min(1),
    reply: z.string(),
    link: PointerSchema.optional(),
  })
  .strict();

/** Someone who lives on the island. Fictional: when they talk about Ambrose's work they only say what the site already says. */
export const CharacterSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** Who they are here: "the caretaker". */
    role: z.string(),
    /** Extra words that mean them ("caretaker", "keeper"). */
    aliases: z.array(z.string()).default([]),
    /** What you see when you look at them. */
    looks: z.string(),
    /** Their scarf, apron or coat: the one color renderers give them. */
    color: Hex,
    at: Vec2,
    greeting: z.string(),
    topics: z.array(TopicSchema).min(2).max(4),
    farewell: z.string(),
  })
  .strict();

export const InteriorSchema = z
  .object({
    /** Width (east to west) and depth (back wall to door) of the floor. */
    size: z.object({ w: z.number().min(6).max(14), d: z.number().min(5).max(10) }).strict(),
    /** Second-person prose for when you step in or look around. */
    description: z.string(),
    things: z.array(ThingSchema).min(2).max(5),
    people: z.array(CharacterSchema).min(1).max(2),
  })
  .strict();

/** Wall things stand against the back wall; the rest stand on the floor. */
export const WALL_PROPS: readonly (typeof PROPS)[number][] = ['frame', 'board', 'bookshelf', 'hearth', 'cabinet', 'escalator', 'shopfront'];

export const PlaceSchema = z
  .object({
    id: Id,
    /** hub: a crossroads with nothing to open. project/writing/contact: opens a page.
     *  colophon: opens the page about how the site itself was made. memory:
     *  somewhere from Ambrose's own life, a building with no page to open:
     *  you go in and look round. quiet: somewhere to sit a while, a building
     *  with no page to open either, and nothing to show: just a room. folly:
     *  somewhere made up just for fun, a building with no page to open either
     *  (the glass tower on Synergy Isle). */
    kind: z.enum(['hub', 'project', 'writing', 'contact', 'colophon', 'memory', 'quiet', 'folly']),
    /** What it physically is. Each renderer maps archetypes to its own art. */
    archetype: z.enum(ARCHETYPES),
    /** The thing it stands for, e.g. "busy beer". */
    name: z.string(),
    /** What it is on the island, e.g. "The taproom". */
    title: z.string(),
    /** One line, shown on labels and cards. */
    blurb: z.string(),
    /** Page it opens. Omitted for hubs, memories and quiet places. */
    href: z.string().optional(),
    /** For kind 'project': the project's slug. */
    project: Id.optional(),
    color: Hex,
    at: Vec2,
    /** Radius of the thing itself: nothing may stand inside it. */
    footprint: z.number().positive(),
    /** Radius of level ground around it; 0 leaves the land as it is. */
    clearing: z.number().nonnegative().default(0),
    /** Which way its front faces, in radians (0 = south, π/2 = east).
     *  Omit to face the hub, turned a little toward the south. */
    faces: z.number().optional(),
    /** Where you stand to go in. Omit for just outside the front. */
    door: Vec2.optional(),
    /** Extra words that mean this place ("pub", "bar"). */
    aliases: z.array(z.string()).default([]),
    /** Second-person prose for when you arrive or look around. */
    description: z.string(),
    scenery: z.array(ScenerySchema).default([]),
    /** The room inside, for buildings you can walk into. */
    interior: InteriorSchema.optional(),
  })
  .strict();

/** A way between two places. Paved routes are drawn as paths; the rest are
 *  walks across open ground that only the text adventure spells out. */
export const RouteSchema = z
  .object({
    from: Id,
    to: Id,
    paved: z.boolean().default(true),
    /** How much a drawn path curves, as a fraction of its length; sign picks the side. */
    bend: z.number().min(-0.5).max(0.5).default(0),
  })
  .strict();

// ---------- Play ----------

/** A word English lost, hidden somewhere on the island. From Etymon's museum. */
export const LostWordSchema = z
  .object({
    id: Id,
    word: z.string(),
    gloss: z.string(),
    story: z.string(),
    /** First and last recorded use, as years. */
    first: z.number().int(),
    died: z.number().int(),
    /** The place it is hidden at, and the scenery it is hidden in (for text). */
    place: Id,
    in: Id,
    /** Exactly where it lies, for spatial renderers. */
    at: Vec2,
    /** A nudge, shown in the word hoard before it's found. */
    hint: z.string(),
  })
  .strict();

/** The island's mini-games. Each renderer that can play one knows it by this id. */
export const GAMES = ['stones', 'crabs', 'crates', 'bartender', 'patterns', 'etymology', 'evolution', 'jargon'] as const;

export const ActivitySchema = z
  .object({
    id: Id,
    /** fishing: off the pier. portal: to the other views. boat: a boat to race round the island. minigame: one of the island's games. */
    kind: z.enum(['fishing', 'portal', 'boat', 'minigame']),
    /** For kind 'minigame': which game is played here. */
    game: z.enum(GAMES).optional(),
    place: Id,
    at: Vec2,
    name: z.string(),
    description: z.string(),
  })
  .strict();

/** Where a piece of the wardrobe goes on the explorer. One item per slot. */
export const OUTFIT_SLOTS = ['head', 'face', 'neck', 'body'] as const;

/** A piece of clothing for the explorer, unlocked by visiting a place. */
export const OutfitSchema = z
  .object({
    id: Id,
    /** What it's called, e.g. "hard hat". */
    name: z.string(),
    slot: z.enum(OUTFIT_SLOTS),
    /** The place that unlocks it: arrive there (or go in) and it's yours. */
    place: Id,
    /** Its main color; renderers pick their own trim. */
    color: Hex,
    /** One line, shown once it's unlocked. */
    description: z.string(),
    /** A nudge, shown in the wardrobe before it's unlocked. */
    hint: z.string(),
  })
  .strict();

// ---------- People out walking ----------

/**
 * Someone out walking, in the open air rather than in a room: real people
 * from Ambrose's life. They say only what's true of any visit (hello, the
 * weather, the way to somewhere on the island), never anything about
 * themselves. Each walks a loop of waypoints on one island, `roams` (the
 * main island, or an islet by its id), pausing at each one, at `pace`
 * world units a second. Where they are is a pure function of the time
 * (src/world/wander.ts), so every view agrees on it.
 */
export const WandererSchema = z
  .object({
    id: Id,
    /** As they're known: "Pushkar", "Dad", "the protector". */
    name: z.string().min(1),
    /** Extra words that mean them, for the text adventure ("father"). */
    aliases: z.array(z.string()).default([]),
    /** What you see when you look at them: plain, and only clothes and colors. */
    looks: z.string(),
    /** Their scarf: the one color every view gives them. */
    color: Hex,
    /** A coat over the body, and a woolly hat, if they wear them. */
    coat: Hex.optional(),
    hat: Hex.optional(),
    /** What they're up to, after their name: "out for a walk", "keeping watch". */
    doing: z.string().default('out for a walk'),
    /** The island they walk on: "main", or an islet's id. */
    roams: Id,
    /** The loop they walk, waypoint to waypoint and back to the first. */
    walk: z.array(Vec2).min(2).max(12),
    pace: z.number().min(0.4).max(2.5).default(1.1),
    /** Seconds they stop at each waypoint, to look about and turn. */
    pause: z.number().min(0).max(20).default(4),
    /** What they say, one at a time, in turn. The first is their hello. */
    lines: z.array(z.string().min(1)).min(3).max(6),
  })
  .strict();

// ---------- Geography ----------

/** A coast as a recipe: a mean radius, plus sine ripples around the shore. */
const CoastSchema = z
  .object({
    radius: z.number().positive(),
    ripples: z.array(z.object({ freq: z.number().int().positive(), amp: z.number(), phase: z.number() }).strict()),
  })
  .strict();

/** The island's shape, as a recipe. geo.ts turns it into height and coastline. */
export const GeographySchema = z
  .object({
    /** The main island's coast, round the origin. */
    coast: CoastSchema,
    /** Rocky shelves that push the coast out toward a place and end in a cliff.
     *  spread is the coast bulge's angular width; rocks is the rocky ground's. */
    headlands: z.array(
      z.object({ toward: Id, reach: z.number(), spread: z.number().positive(), rocks: z.number().positive() }).strict(),
    ),
    /** Gentle rises centred on a place. */
    hills: z.array(z.object({ at: Id, height: z.number(), spread: z.number().positive() }).strict()),
    /** The jetty that carries the writing place out to sea, running due south. */
    pier: z.object({ x: z.number(), start: z.number(), end: z.number(), width: z.number().positive(), deck: z.number() }).strict(),
    /** Gentle shoulders of new land that push the coast out toward a point:
     *  grass and a sandy beach like the rest of the shore, no rocks. */
    shores: z.array(z.object({ toward: Vec2, reach: z.number(), spread: z.number().positive() }).strict()).default([]),
    /** A little railway: a rounded loop (a superellipse, `square` from 2 for an
     *  oval up to ~6 for a rounded rectangle) laid on a level bed at height
     *  `bed`. `station` is where the platform stands, as a fraction of the way
     *  round from due east, turning toward the south (clockwise from above).
     *  Paved paths cross it on level crossings; it never blocks a walk. */
    railway: z
      .object({
        center: Vec2,
        rx: z.number().positive(),
        rz: z.number().positive(),
        square: z.number().min(2).max(8).default(3),
        bed: z.number(),
        station: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    /** A stone quay at the water's edge (a level deck between two corners), and
     *  where on it the bus is parked, facing `faces` (0 = south, π/2 = east). */
    quay: z
      .object({ x0: z.number(), z0: z.number(), x1: z.number(), z1: z.number(), deck: z.number(), bus: Vec2, faces: z.number() })
      .strict()
      .optional(),
    /** Level, empty building plots kept for places still to come: nothing grows
     *  or is laid there. Build on one by adding a place at `at` with this
     *  clearing, and remove the plot. */
    plots: z.array(z.object({ id: Id, at: Vec2, clearing: z.number().positive() }).strict()).default([]),
    /** Little islands off the main one, each with its own coast round `at`
     *  (grass on top and a sandy beach, like the main island's shore). */
    islets: z.array(z.object({ id: Id, name: z.string(), at: Vec2, coast: CoastSchema }).strict()).default([]),
    /** Bridges: a level deck at height `deck`, with railings, from one point on
     *  land (or the quay, which is the main island's) straight to another on a
     *  different island. A footbridge is plain planks; a tower bridge stands two
     *  towers in the water, with walkways high between them and chains
     *  swooping down to either end, like Tower Bridge. Either way you walk the deck.
     *  A bridge may have a gate: a turnstile where its deck first leaves the
     *  land at its `from` end, shut until you score `pass` or more at its
     *  `game` (played at a desk on that side). Once open, it stays open. */
    bridges: z
      .array(
        z
          .object({
            from: Vec2,
            to: Vec2,
            width: z.number().min(1.6).max(4),
            deck: z.number(),
            style: z.enum(['footbridge', 'tower']).default('footbridge'),
            gate: z.object({ id: Id, name: z.string(), game: z.enum(GAMES), pass: z.number().int().positive() }).strict().optional(),
          })
          .strict(),
      )
      .default([]),
    /** Big standing letters on a hillside, like the Hollywood sign: `text` in
     *  capitals (A to Z and spaces), `height` tall, the line's middle at `at`,
     *  read by someone standing in front, facing `faces` (0 = south, π/2 =
     *  east). `name` is what the hill is called in words; `place` is the place
     *  it stands by. Each letter stands on the ground beneath it. */
    signs: z
      .array(
        z
          .object({
            id: Id,
            name: z.string(),
            text: z.string().regex(/^[A-Z]+( [A-Z]+)*$/, 'sign text is capital letters A to Z, a single space between words'),
            place: Id,
            at: Vec2,
            faces: z.number(),
            height: z.number().min(0.5).max(4),
          })
          .strict(),
      )
      .default([]),
    /** Small striped flags on short poles, waving in the wind. Their stripes
     *  are the --flag-* colors in tokens.css. */
    flags: z.array(z.object({ at: Vec2 }).strict()).default([]),
    /** Where a new visitor appears. */
    spawn: Vec2,
  })
  .strict();

// ---------- World ----------

export const WorldSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    site: z.object({ url: z.url(), title: z.string() }).strict(),
    person: PersonSchema,
    projects: z.array(ProjectSchema),
    posts: z.array(PostSchema),
    places: z.array(PlaceSchema).min(1),
    routes: z.array(RouteSchema),
    lostWords: z.array(LostWordSchema),
    activities: z.array(ActivitySchema),
    outfits: z.array(OutfitSchema).default([]),
    wanderers: z.array(WandererSchema).default([]),
    geography: GeographySchema,
  })
  .strict()
  .superRefine((w, ctx) => {
    for (const issue of checkWorld(w)) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  });

export type Person = z.infer<typeof PersonSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Scenery = z.infer<typeof ScenerySchema>;
export type Archetype = (typeof ARCHETYPES)[number];
export type Prop = (typeof PROPS)[number];
export type Pointer = z.infer<typeof PointerSchema>;
export type Thing = z.infer<typeof ThingSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Interior = z.infer<typeof InteriorSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type LostWord = z.infer<typeof LostWordSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type GameId = (typeof GAMES)[number];
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];
export type Outfit = z.infer<typeof OutfitSchema>;
export type Wanderer = z.infer<typeof WandererSchema>;
export type Geography = z.infer<typeof GeographySchema>;
export type World = z.infer<typeof WorldSchema>;
/** What authors write: defaults may be left out. */
export type WorldInput = z.input<typeof WorldSchema>;

// ---------- Cross-checks ----------
// Shape is zod's job; these are the rules that span the whole world. Each one
// is a mistake that would otherwise surface as a broken renderer.

type Issue = { message: string; path: (string | number)[] };

export function checkWorld(w: z.infer<typeof WorldSchema> | World): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, path: (string | number)[]) => issues.push({ message, path });

  const places = new Map<string, Place>();
  w.places.forEach((p, i) => {
    if (places.has(p.id)) add(`Two places share the id "${p.id}".`, ['places', i, 'id']);
    places.set(p.id, p);
  });

  // Every place that opens a page says which one, and hubs, memories and follies don't.
  w.places.forEach((p, i) => {
    const pageless = p.kind === 'memory' || p.kind === 'quiet' || p.kind === 'folly';
    if (p.kind === 'hub' && p.href) add(`Hub "${p.id}" shouldn't open a page.`, ['places', i, 'href']);
    if (pageless && p.href) add(`"${p.id}" is a ${p.kind}: it opens no page, so leave out its href.`, ['places', i, 'href']);
    if (pageless && !p.interior) add(`"${p.id}" is a ${p.kind}, with no page to open: give it a room to walk into instead.`, ['places', i]);
    if (p.kind !== 'hub' && !pageless && !p.href) add(`"${p.id}" needs an href.`, ['places', i, 'href']);
    if (p.kind === 'project' && !p.project) add(`Project place "${p.id}" needs a project slug.`, ['places', i, 'project']);
  });
  if (w.places.filter((p) => p.kind === 'hub').length !== 1) add('The world needs exactly one hub (where paths meet).', ['places']);

  // Every project has exactly one place, so nothing is unreachable.
  const slugs = new Set(w.projects.map((p) => p.slug));
  w.projects.forEach((proj, i) => {
    const n = w.places.filter((p) => p.project === proj.slug).length;
    if (n !== 1) add(`Project "${proj.slug}" has ${n} places on the island; it needs exactly one.`, ['projects', i]);
  });
  w.places.forEach((p, i) => {
    if (p.project && !slugs.has(p.project)) add(`"${p.id}" points at unknown project "${p.project}".`, ['places', i, 'project']);
    const proj = w.projects.find((x) => x.slug === p.project);
    if (proj && p.href !== proj.href) add(`"${p.id}" should open ${proj.href}, not ${p.href}.`, ['places', i, 'href']);
  });

  // Nothing stands inside anything else.
  for (let i = 0; i < w.places.length; i++) {
    for (let j = i + 1; j < w.places.length; j++) {
      const a = w.places[i];
      const b = w.places[j];
      const d = Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z);
      if (d < a.footprint + b.footprint + 1) add(`"${a.id}" and "${b.id}" overlap (${d.toFixed(1)} apart).`, ['places', j, 'at']);
    }
  }

  // Routes join real places, and every place can be reached from the hub.
  const adj = new Map<string, Set<string>>([...places.keys()].map((k) => [k, new Set<string>()]));
  w.routes.forEach((r, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!places.has(r[end])) add(`Route ${i} goes ${end} unknown place "${r[end]}".`, ['routes', i, end]);
    }
    if (r.from === r.to) add(`Route ${i} goes nowhere.`, ['routes', i]);
    adj.get(r.from)?.add(r.to);
    adj.get(r.to)?.add(r.from);
  });
  const hub = w.places.find((p) => p.kind === 'hub');
  if (hub) {
    const seen = new Set([hub.id]);
    const queue = [hub.id];
    while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n)) (seen.add(n), queue.push(n));
    w.places.forEach((p, i) => {
      if (!seen.has(p.id)) add(`"${p.id}" can't be reached from "${hub.id}": add a route to it.`, ['places', i]);
    });
  }

  // Scenery ids are unique within their place.
  w.places.forEach((p, i) => {
    const ids = new Set<string>();
    p.scenery.forEach((s, j) => {
      if (ids.has(s.id)) add(`"${p.id}" has two pieces of scenery called "${s.id}".`, ['places', i, 'scenery', j]);
      ids.add(s.id);
    });
  });

  // Lost words are hidden in real scenery, and lie near the place they belong to.
  const wordIds = new Set<string>();
  w.lostWords.forEach((lw, i) => {
    if (wordIds.has(lw.id)) add(`Two lost words share the id "${lw.id}".`, ['lostWords', i, 'id']);
    wordIds.add(lw.id);
    const p = places.get(lw.place);
    if (!p) return add(`Lost word "${lw.id}" is at unknown place "${lw.place}".`, ['lostWords', i, 'place']);
    if (!p.scenery.some((s) => s.id === lw.in)) add(`Lost word "${lw.id}" is hidden in "${lw.in}", which "${p.id}" doesn't have.`, ['lostWords', i, 'in']);
    const d = Math.hypot(lw.at.x - p.at.x, lw.at.z - p.at.z);
    if (d > 9) add(`Lost word "${lw.id}" lies ${d.toFixed(1)} from "${p.id}"; keep it within 9.`, ['lostWords', i, 'at']);
    if (lw.first > lw.died) add(`Lost word "${lw.id}" died before it was born.`, ['lostWords', i, 'died']);
  });

  // Every building has a room inside, and nothing else does (the pier and the bottle are all open air).
  const pages = new Set(['/about', '/blog', '/contact', '/colophon', ...w.projects.map((p) => p.href), ...w.posts.map((p) => p.href)]);
  w.places.forEach((p, i) => {
    const building = (BUILDINGS as readonly string[]).includes(p.archetype);
    if (building && !p.interior) add(`"${p.id}" is a ${p.archetype}: give it an interior to walk into.`, ['places', i]);
    if (!building && p.interior) add(`"${p.id}" is a ${p.archetype}, not a building: it can't have an interior.`, ['places', i, 'interior']);
    if (p.interior) issues.push(...checkInterior(p, pages).map((x) => ({ message: x.message, path: ['places', i, 'interior', ...x.path] })));
  });

  const games = new Set<string>();
  w.activities.forEach((a, i) => {
    if (!places.has(a.place)) add(`Activity "${a.id}" is at unknown place "${a.place}".`, ['activities', i, 'place']);
    // A mini-game says which game it is, once; nothing else does.
    if (a.kind === 'minigame' && !a.game) add(`Mini-game "${a.id}" needs a game.`, ['activities', i, 'game']);
    if (a.kind !== 'minigame' && a.game) add(`Only a mini-game has a game; "${a.id}" is ${a.kind}.`, ['activities', i, 'game']);
    if (a.game && games.has(a.game)) add(`The game "${a.game}" is on the island twice.`, ['activities', i, 'game']);
    if (a.game) games.add(a.game);
  });

  // Every outfit is unlocked somewhere real (and somewhere you can go into or
  // arrive at, not the hub you start in), one piece per place.
  const outfitIds = new Set<string>();
  const outfitAt = new Map<string, string>();
  (w.outfits ?? []).forEach((o, i) => {
    if (outfitIds.has(o.id)) add(`Two outfits share the id "${o.id}".`, ['outfits', i, 'id']);
    outfitIds.add(o.id);
    const p = places.get(o.place);
    if (!p) return add(`Outfit "${o.id}" is unlocked at unknown place "${o.place}".`, ['outfits', i, 'place']);
    if (p.kind === 'hub') add(`Outfit "${o.id}" is unlocked at the hub, where everyone starts; pick a place to visit.`, ['outfits', i, 'place']);
    const other = outfitAt.get(o.place);
    if (other) add(`"${o.place}" unlocks both "${other}" and "${o.id}"; give each place one piece.`, ['outfits', i, 'place']);
    outfitAt.set(o.place, o.id);
  });
  // People out walking: one of each, and nobody shares a name with anyone else
  // on the island, indoors or out (the text adventure finds people by name).
  const named = new Map<string, string>();
  for (const p of w.places) for (const c of p.interior?.people ?? []) named.set(c.name.toLowerCase(), `${c.name} in "${p.id}"`);
  const walkerIds = new Set<string>();
  (w.wanderers ?? []).forEach((v, i) => {
    if (walkerIds.has(v.id)) add(`Two people out walking share the id "${v.id}".`, ['wanderers', i, 'id']);
    walkerIds.add(v.id);
    const other = named.get(v.name.toLowerCase());
    if (other) add(`${v.name} is out walking, and ${other} has the same name: give one of them another.`, ['wanderers', i, 'name']);
    named.set(v.name.toLowerCase(), `${v.name}, out walking`);
  });
  w.geography.headlands.forEach((h, i) => {
    if (!places.has(h.toward)) add(`Headland ${i} points toward unknown place "${h.toward}".`, ['geography', 'headlands', i]);
  });
  // A plot is kept free for a place still to come; once one stands there, the plot goes.
  w.geography.plots.forEach((plot, i) => {
    for (const p of w.places) {
      const d = Math.hypot(plot.at.x - p.at.x, plot.at.z - p.at.z);
      if (d < plot.clearing + p.footprint) add(`"${p.id}" stands on plot "${plot.id}" (${d.toFixed(1)} away): remove the plot from geography.plots now it's built on.`, ['geography', 'plots', i]);
    }
  });
  w.geography.hills.forEach((h, i) => {
    if (!places.has(h.at)) add(`Hill ${i} is at unknown place "${h.at}".`, ['geography', 'hills', i]);
  });
  const signIds = new Set<string>();
  (w.geography.signs ?? []).forEach((s, i) => {
    if (signIds.has(s.id)) add(`Two signs share the id "${s.id}".`, ['geography', 'signs', i, 'id']);
    signIds.add(s.id);
    if (!places.has(s.place)) add(`Sign "${s.id}" stands by unknown place "${s.place}".`, ['geography', 'signs', i, 'place']);
  });

  // The ground itself can only be worked out once the places it hangs off are sound.
  const sound =
    hub &&
    w.routes.every((r) => places.has(r.from) && places.has(r.to)) &&
    w.geography.headlands.every((h) => places.has(h.toward)) &&
    w.geography.hills.every((h) => places.has(h.at));
  if (sound) issues.push(...checkGround(w as World));

  return issues;
}

/**
 * The islets and the bridges, and everything that stands on the ground: no
 * islet runs into another island, every bridge goes from land to other land
 * over the sea, every islet can be walked to, and every place and activity
 * (bar the boat, which floats) is on dry land you can walk to from the plaza.
 */
function checkGround(w: World): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, path: (string | number)[]) => issues.push({ message, path });
  const geo = createGeo(w);
  const at = (p: { x: number; z: number }) => `(${+p.x.toFixed(1)}, ${+p.z.toFixed(1)})`;
  const ids = new Set<string>();
  geo.islands.forEach((s, i) => {
    if (!i) return;
    if (ids.has(s.id)) add(`Two islets share the id "${s.id}".`, ['geography', 'islets', i - 1, 'id']);
    ids.add(s.id);
    for (const o of geo.islands.slice(0, i)) {
      // The main island's coast reaches further in some directions than others: measure it toward the islet.
      const toward = o.coast(Math.atan2(s.z - o.z, s.x - o.x));
      const gap = Math.hypot(s.x - o.x, s.z - o.z) - s.outer - (o.i ? o.outer : toward);
      if (gap < 2) add(`Islet "${s.id}" runs into ${o.i ? `islet "${o.id}"` : 'the main island'}: move it out to sea, with at least 2 of water between them.`, ['geography', 'islets', i - 1, 'at']);
    }
  });
  const name = (i: number) => (i ? `islet "${geo.islands[i].id}"` : 'the main island');
  geo.bridges.forEach((b, i) => {
    const path = ['geography', 'bridges', i];
    const [from, to] = b.joins;
    if (from < 0) add(`Bridge ${i} starts in the sea at ${at({ x: b.ax, z: b.az })}: start it on land.`, [...path, 'from']);
    if (to < 0) add(`Bridge ${i} ends in the sea at ${at({ x: b.bx, z: b.bz })}: end it on land.`, [...path, 'to']);
    if (from >= 0 && from === to) add(`Bridge ${i} starts and ends on ${name(from)}: a bridge goes from one island to another.`, path);
    let wet = false;
    for (let s = 0; s <= b.length; s += 0.25) if (geo.heightAt(b.ax + b.ux * s, b.az + b.uz * s) < 0) wet = true;
    if (!wet && from !== to) add(`Bridge ${i} never crosses the sea: the islands it joins already touch.`, path);
    if (b.deck < 0.6) add(`Bridge ${i}'s deck is ${b.deck} high: keep it above the swell (0.6 or more).`, [...path, 'deck']);
    for (const end of [0, 1] as const) {
      const l = geo.landing(b, end);
      if (!geo.isWalkable(l.x, l.z)) add(`You can't step off bridge ${i} at ${at(l)}: give its ${end ? 'end' : 'start'} some dry land beyond it.`, [...path, end ? 'to' : 'from']);
    }
  });
  geo.islands.forEach((s, i) => {
    if (i && geo.hops(0, i) === Infinity) add(`Islet "${s.id}" can't be reached on foot: add a bridge out to it.`, ['geography', 'islets', i - 1]);
  });
  // A gate opens with a game you play on its near side, close by, and guards an islet you can't get round it to.
  const gateIds = new Set<string>();
  for (const t of geo.gates) {
    const path = ['geography', 'bridges', t.bridge, 'gate'];
    if (gateIds.has(t.id)) add(`Two gates share the id "${t.id}".`, [...path, 'id']);
    gateIds.add(t.id);
    const desk = w.activities.find((a) => a.kind === 'minigame' && a.game === t.game);
    if (!desk) add(`Gate "${t.id}" opens with "${t.game}", which isn't played anywhere: add a mini-game for it by the gate.`, [...path, 'game']);
    else {
      const isle = geo.islandOf(desk.at.x, desk.at.z);
      const d = Math.hypot(desk.at.x - t.x, desk.at.z - t.z);
      if (isle !== null && isle !== t.side) add(`The game that opens gate "${t.id}" is on the far side of it: put "${desk.id}" where you stand before the gate.`, ['activities', w.activities.indexOf(desk), 'at']);
      else if (d > 8) add(`"${desk.id}" is ${d.toFixed(1)} from gate "${t.id}": keep the game that opens it within 8.`, ['activities', w.activities.indexOf(desk), 'at']);
    }
    if (!t.beyond.length) add(`Gate "${t.id}" guards nothing: there's another way round to everything past it.`, path);
  }
  // Where you can walk to from the plaza: the main island, every islet a bridge
  // reaches, and the decks in between (the pier's and the bridges', walkable but not land).
  const home = geo.islandOf(geo.hub.at.x, geo.hub.at.z) ?? 0;
  const reachable = (p: { x: number; z: number }) => {
    const isle = geo.islandOf(p.x, p.z);
    return isle === null || geo.hops(home, isle) < Infinity;
  };
  w.places.forEach((p, i) => {
    if (p.archetype === 'pier' || p === geo.hub) return; // out over the water by design; the hub is where you start
    const door = geo.door(p);
    if (!geo.isWalkable(door.x, door.z)) add(`"${p.id}"'s door is in the sea at ${at(door)}: move it onto land.`, ['places', i, 'at']);
    else if (!reachable(door)) add(`"${p.id}" is on an islet you can't walk to: add a bridge out to it.`, ['places', i, 'at']);
  });
  w.activities.forEach((a, i) => {
    if (a.kind === 'boat') return;
    if (!geo.isWalkable(a.at.x, a.at.z)) add(`Activity "${a.id}" is in the sea at ${at(a.at)}: move it onto land.`, ['activities', i, 'at']);
    else if (!reachable(a.at)) add(`Activity "${a.id}" is on an islet you can't walk to: add a bridge out to it.`, ['activities', i, 'at']);
    else if (a.kind === 'minigame' && geo.bridgeDist(a.at.x, a.at.z) < 2.5) add(`Mini-game "${a.id}" is in the way of a bridge: keep it 2.5 clear.`, ['activities', i, 'at']);
  });
  // A sign's letters stand on dry land, off every path and clear of places,
  // doors, bridges and the railway, and never on top of a lost word or a game.
  const spots = [...w.lostWords.map((l) => ({ what: `the lost word "${l.id}"`, at: l.at })), ...w.activities.map((a) => ({ what: `activity "${a.id}"`, at: a.at }))];
  const crowds = (x: number, z: number, r: number) => spots.find((s) => Math.hypot(s.at.x - x, s.at.z - z) < r);
  geo.signs.forEach((s, i) => {
    const path = ['geography', 'signs', i, 'at'];
    for (const l of s.letters) {
      const feet = [-0.5, 0, 0.5].map((k) => ({ x: l.x + l.ax * l.width * k, z: l.z + l.az * l.width * k }));
      if (feet.some((p) => !geo.isWalkable(p.x, p.z))) add(`Sign "${s.id}"'s ${l.ch} at ${at(l)} is in the sea: move the sign onto land.`, path);
      else if (feet.some((p) => !geo.isOpenGround(p.x, p.z))) add(`Sign "${s.id}"'s ${l.ch} at ${at(l)} is in the way of a path, a place or a bridge: move the sign to open ground.`, path);
      const near = feet.map((p) => crowds(p.x, p.z, 1.5)).find(Boolean);
      if (near) add(`Sign "${s.id}"'s ${l.ch} at ${at(l)} stands on ${near.what}: keep it 1.5 clear.`, path);
      // The camera looks from the south: a letter just south of a lost word would hide it.
      const hid = w.lostWords.find((x) => Math.abs(x.at.x - l.x) < l.width / 2 + 0.5 && l.z > x.at.z && l.z - x.at.z < 4);
      if (hid) add(`Sign "${s.id}"'s ${l.ch} at ${at(l)} hides the lost word "${hid.id}" from the camera: move the sign, or leave a gap in front of the word.`, path);
    }
  });
  geo.flags.forEach((f, i) => {
    const path = ['geography', 'flags', i, 'at'];
    if (!geo.isWalkable(f.x, f.z)) add(`Flag ${i} at ${at(f)} is in the sea: move it onto land.`, path);
    else if (!geo.isOpenGround(f.x, f.z)) add(`Flag ${i} at ${at(f)} is in the way of a path, a place or a bridge: move it to open ground.`, path);
    else if (geo.signDist(f.x, f.z) < 1) add(`Flag ${i} at ${at(f)} is in a sign's letters: keep it 1 clear.`, path);
    const near = crowds(f.x, f.z, 1.5);
    if (near) add(`Flag ${i} at ${at(f)} stands on ${near.what}: keep it 1.5 clear.`, path);
  });
  issues.push(...checkWalks(w, geo));
  return issues;
}

/** How far a walk keeps from a building's footprint, a game, the railway, the station, the quay and a sign or a flag. */
const WALK_CLEAR = { building: 0.8, game: 1.8, rail: 2, station: 3.2, quay: 0.6, sign: 1.2 };

/**
 * Everyone out walking stays on their own island's dry land, waypoint to
 * waypoint and round again: never into the sea or onto a bridge, through a
 * building or a game, across the railway, past the end of a bridge (and its
 * gate, if it has one), through a sign's letters or a flag, or out onto the
 * quay.
 */
function checkWalks(w: World, geo: ReturnType<typeof createGeo>): Issue[] {
  const issues: Issue[] = [];
  const at = (p: { x: number; z: number }) => `(${+p.x.toFixed(1)}, ${+p.z.toFixed(1)})`;
  const isles = new Map(geo.islands.map((s) => [s.i ? s.id : 'main', s.i]));
  const solids = w.places.filter((p) => p !== geo.hub && p.archetype !== 'pier' && p.archetype !== 'bottle');
  const spots = w.activities.filter((a) => a.kind === 'minigame' || a.kind === 'portal');
  (w.wanderers ?? []).forEach((v, i) => {
    const isle = isles.get(v.roams);
    if (isle === undefined) return issues.push({ message: `${v.name} roams "${v.roams}", which isn't an island: use "main" or an islet's id.`, path: ['wanderers', i, 'roams'] });
    const where = isle ? `islet "${v.roams}"` : 'the main island';
    v.walk.forEach((p, j) => {
      if (geo.islandOf(p.x, p.z) !== isle) issues.push({ message: `${v.name}'s waypoint ${j} at ${at(p)} isn't on ${where}: move it onto its land.`, path: ['wanderers', i, 'walk', j] });
    });
    const n = v.walk.length;
    for (let j = 0; j < n; j++) {
      const a = v.walk[j];
      const b = v.walk[(j + 1) % n];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
      let problem = '';
      for (let k = 0; k <= steps && !problem; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps };
        const solid = solids.find((s) => Math.hypot(p.x - s.at.x, p.z - s.at.z) < s.footprint + WALK_CLEAR.building);
        const game = spots.find((s) => Math.hypot(p.x - s.at.x, p.z - s.at.z) < WALK_CLEAR.game);
        if (geo.islandOf(p.x, p.z) !== isle) problem = `leaves ${where} at ${at(p)}`;
        else if (solid) problem = `goes through "${solid.id}" at ${at(p)}`;
        else if (game) problem = `goes through "${game.id}" at ${at(p)}`;
        else if (geo.railDist(p.x, p.z) < WALK_CLEAR.rail) problem = `crosses the railway at ${at(p)}`;
        else if (geo.station && Math.hypot(p.x - geo.station.x, p.z - geo.station.z) < WALK_CLEAR.station) problem = `goes over the station at ${at(p)}`;
        else if (geo.quayDist(p.x, p.z) < WALK_CLEAR.quay) problem = `goes out onto the quay at ${at(p)}`;
        else if (!geo.clearOfBridges(p.x, p.z)) problem = `goes across the end of a bridge at ${at(p)}`;
        else if (geo.signDist(p.x, p.z) < WALK_CLEAR.sign) problem = `goes through a sign's letters at ${at(p)}`;
        else if (geo.flags.some((f) => Math.hypot(p.x - f.x, p.z - f.z) < WALK_CLEAR.sign)) problem = `goes through a flag at ${at(p)}`;
      }
      if (problem) issues.push({ message: `${v.name}'s walk from waypoint ${j} to ${(j + 1) % n} ${problem}: move a waypoint.`, path: ['wanderers', i, 'walk', j] });
    }
  });
  return issues;
}

/** How close anything may stand to the door, and to anything else, in a room. */
export const DOOR_CLEAR = 1.6;
export const ROOM_GAP = 1.3;

/** A room holds together: everything on the floor, clear of the door and of each other, every link real. */
function checkInterior(p: Place | z.infer<typeof PlaceSchema>, pages: Set<string>): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, path: (string | number)[]) => issues.push({ message, path });
  const room = p.interior!;
  const { w, d } = room.size;
  const ids = new Set<string>();
  const spots: { id: string; at: { x: number; z: number }; path: (string | number)[] }[] = [];
  const link = (l: Pointer | undefined, path: (string | number)[]) => {
    if (!l) return;
    if (l.href.startsWith('/')) {
      if (!pages.has(l.href.replace(/#.*$/, '')) && !l.href.startsWith('/busybeer/')) add(`"${p.id}" links to ${l.href}, which isn't a page on this site.`, path);
    } else if (!/^https:\/\//.test(l.href)) add(`"${p.id}" links to ${l.href}: use a site path or an https:// address.`, path);
  };
  const place = (id: string, at: { x: number; z: number }, path: (string | number)[], wall = false) => {
    if (ids.has(id)) add(`"${p.id}" has two things or people called "${id}" inside.`, path);
    ids.add(id);
    if (Math.abs(at.x) > w / 2 - 0.6 || Math.abs(at.z) > d / 2 - 0.6) add(`"${id}" in "${p.id}" stands outside the room (${w} by ${d}).`, [...path, 'at']);
    if (wall && at.z > -d / 2 + 1.5) add(`"${id}" in "${p.id}" hangs on the back wall: put it within 1.5 of z = ${-d / 2}.`, [...path, 'at']);
    if (Math.hypot(at.x, at.z - d / 2) < DOOR_CLEAR) add(`"${id}" in "${p.id}" is in the way of the door.`, [...path, 'at']);
    for (const s of spots) if (Math.hypot(at.x - s.at.x, at.z - s.at.z) < ROOM_GAP) add(`"${id}" and "${s.id}" in "${p.id}" stand on top of each other.`, [...path, 'at']);
    spots.push({ id, at, path });
  };
  room.things.forEach((t, j) => {
    place(t.id, t.at, ['things', j], WALL_PROPS.includes(t.prop));
    link(t.link, ['things', j, 'link']);
  });
  room.people.forEach((c, j) => {
    place(c.id, c.at, ['people', j]);
    const topics = new Set<string>();
    c.topics.forEach((t, k) => {
      if (topics.has(t.id)) add(`${c.name} in "${p.id}" has two topics called "${t.id}".`, ['people', j, 'topics', k]);
      topics.add(t.id);
      link(t.link, ['people', j, 'topics', k, 'link']);
    });
  });
  return issues;
}

/** Validate a world, throwing one readable error listing every problem. */
export function parseWorld(input: unknown): World {
  const r = WorldSchema.safeParse(input);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  • ${i.path.join('.') || '(world)'}: ${i.message}`);
  throw new Error(`The world doesn't hold together:\n${lines.join('\n')}`);
}
