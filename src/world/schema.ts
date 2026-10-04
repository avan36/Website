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

export const ARCHETYPES = ['plaza', 'cabin', 'taproom', 'tree', 'library', 'lighthouse', 'schoolhouse', 'depot', 'pier', 'bottle'] as const;

/** The archetypes that are buildings you can walk into. */
export const BUILDINGS = ['cabin', 'taproom', 'library', 'lighthouse', 'schoolhouse', 'depot'] as const;

// ---------- Inside ----------
// A building's room. Coordinates are in room units (about a metre, like the
// island's), with the origin in the middle of the floor, +x east and +z
// toward the door, which is always in the middle of the front (south) wall.
// Renderers draw the room their own way; `prop` says what each thing is, the
// way `archetype` does for places.

/** A page a line or a thing points at: on this site, or the real thing elsewhere. */
export const PointerSchema = z.object({ label: z.string(), href: z.string() }).strict();

export const PROPS = ['desk', 'hearth', 'frame', 'board', 'counter', 'bookshelf', 'cabinet', 'lens', 'cat', 'globe', 'scanner', 'crates'] as const;

/** Something inside you can look at. */
export const ThingSchema = z
  .object({
    id: Id,
    /** Nouns that refer to it, first one is the display name. */
    names: z.array(z.string().min(1)).min(1),
    /** What it is, for the renderers' art. Wall things (frame, board, bookshelf, hearth, cabinet) stand against the back wall. */
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
export const WALL_PROPS: readonly (typeof PROPS)[number][] = ['frame', 'board', 'bookshelf', 'hearth', 'cabinet'];

export const PlaceSchema = z
  .object({
    id: Id,
    /** hub: a crossroads with nothing to open. project/writing/contact: opens a page. */
    kind: z.enum(['hub', 'project', 'writing', 'contact']),
    /** What it physically is. Each renderer maps archetypes to its own art. */
    archetype: z.enum(ARCHETYPES),
    /** The thing it stands for, e.g. "busy beer". */
    name: z.string(),
    /** What it is on the island, e.g. "The taproom". */
    title: z.string(),
    /** One line, shown on labels and cards. */
    blurb: z.string(),
    /** Page it opens. Omitted for hubs. */
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
export const GAMES = ['stones', 'crabs', 'crates'] as const;

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

// ---------- Geography ----------

/** The island's shape, as a recipe. geo.ts turns it into height and coastline. */
export const GeographySchema = z
  .object({
    /** Mean coast radius, plus sine ripples around the shore. */
    coast: z
      .object({
        radius: z.number().positive(),
        ripples: z.array(z.object({ freq: z.number().int().positive(), amp: z.number(), phase: z.number() }).strict()),
      })
      .strict(),
    /** Rocky shelves that push the coast out toward a place and end in a cliff.
     *  spread is the coast bulge's angular width; rocks is the rocky ground's. */
    headlands: z.array(
      z.object({ toward: Id, reach: z.number(), spread: z.number().positive(), rocks: z.number().positive() }).strict(),
    ),
    /** Gentle rises centred on a place. */
    hills: z.array(z.object({ at: Id, height: z.number(), spread: z.number().positive() }).strict()),
    /** The jetty that carries the writing place out to sea, running due south. */
    pier: z.object({ x: z.number(), start: z.number(), end: z.number(), width: z.number().positive(), deck: z.number() }).strict(),
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

  // Every place that opens a page says which one, and hubs don't.
  w.places.forEach((p, i) => {
    if (p.kind === 'hub' && p.href) add(`Hub "${p.id}" shouldn't open a page.`, ['places', i, 'href']);
    if (p.kind !== 'hub' && !p.href) add(`"${p.id}" needs an href.`, ['places', i, 'href']);
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
  w.geography.headlands.forEach((h, i) => {
    if (!places.has(h.toward)) add(`Headland ${i} points toward unknown place "${h.toward}".`, ['geography', 'headlands', i]);
  });
  w.geography.hills.forEach((h, i) => {
    if (!places.has(h.at)) add(`Hill ${i} is at unknown place "${h.at}".`, ['geography', 'hills', i]);
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
