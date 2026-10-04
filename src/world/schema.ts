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

export const ActivitySchema = z
  .object({
    id: Id,
    kind: z.enum(['fishing']),
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
export type Place = z.infer<typeof PlaceSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type LostWord = z.infer<typeof LostWordSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];
export type Outfit = z.infer<typeof OutfitSchema>;
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

  w.activities.forEach((a, i) => {
    if (!places.has(a.place)) add(`Activity "${a.id}" is at unknown place "${a.place}".`, ['activities', i, 'place']);
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

  return issues;
}

/** Validate a world, throwing one readable error listing every problem. */
export function parseWorld(input: unknown): World {
  const r = WorldSchema.safeParse(input);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  • ${i.path.join('.') || '(world)'}: ${i.message}`);
  throw new Error(`The world doesn't hold together:\n${lines.join('\n')}`);
}
