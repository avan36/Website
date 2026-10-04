// The content pack: everything about Ambrose and the work that isn't the
// island. Who, what's been made and written, what matters, the colors and
// type, and the island's fun as plain ideas (lost words, games, the wardrobe,
// the islanders) with every coordinate left out. It's the portable half of
// /world.json: a racing game, a new site or anything else can read it and lay
// things out its own way. Published as /pack.json, with a JSON Schema at
// /pack.schema.json. Every link in it is absolute, so it works from anywhere.
//
// Build-time only, like schema.ts.

import { z } from 'astro/zod';
import { cares, name, path } from '../data/about';
import { journalWords, journalWordsUpdated, shelf, type ShelfEntry } from '../data/life';
import { person, projects } from '../data/projects';
import { GAME_INFO } from '../renderers/games/catalog';
import tokens from '../styles/tokens.css?raw';
import { ARCHETYPES, GAMES, OUTFIT_SLOTS, type World } from './schema';

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Link = z.object({ label: z.string(), href: z.url() }).strict();
const Image = z.object({ src: z.url(), alt: z.string(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const Shelved = z.object({ title: z.string(), kind: z.enum(['film', 'tv']), take: z.string().optional() }).strict();

export const PackSchema = z
  .object({
    $schema: z.string(),
    version: z.literal(1),
    site: z.object({ url: z.url(), title: z.string(), world: z.url() }).strict(),
    person: z
      .object({
        name: z.string(),
        role: z.string(),
        intro: z.string(),
        about: z.url(),
        github: z.url(),
        education: z.array(z.object({ title: z.string(), detail: z.string() }).strict()),
      })
      .strict(),
    /** Where the name comes from, oldest stage first, the way Etymon tells a word's story. */
    name: z
      .object({
        parts: z.array(
          z
            .object({
              word: z.string(),
              lang: z.string(),
              stages: z.array(z.object({ lang: z.string(), form: z.string(), gloss: z.string() }).strict()).min(1),
              note: z.string().optional(),
            })
            .strict(),
        ),
        sum: z.string(),
      })
      .strict(),
    /** What matters, each with the work that shows it. Either a body or a quote. */
    cares: z.array(z.object({ title: z.string(), body: z.string().optional(), quote: z.string().optional(), links: z.array(Link) }).strict()),
    /** The path so far, in order. */
    path: z.array(z.object({ what: z.string(), detail: z.string(), color: Hex, href: z.url().optional() }).strict()),
    projects: z.array(
      z
        .object({
          slug: Id,
          name: z.string(),
          headline: z.string(),
          blurb: z.string(),
          platforms: z.string(),
          color: Hex,
          body: z.array(z.string()).min(1),
          tags: z.array(z.string()),
          /** Its page on the site. */
          page: z.url(),
          links: z.array(Link.extend({ kind: z.enum(['appstore', 'primary', 'text']).optional() }).strict()),
          icon: z.url().optional(),
          shots: z.array(Image.extend({ frame: z.enum(['phone', 'browser']) }).strict()),
          credits: z.array(Image).optional(),
          creditLine: z.string().optional(),
          /** The building that stands for it on the island: an idea any world can borrow. */
          landmark: z.object({ archetype: z.enum(ARCHETYPES), name: z.string() }).strict(),
        })
        .strict(),
    ),
    posts: z.array(z.object({ slug: z.string(), title: z.string(), description: z.string(), date: z.iso.date(), href: z.url() }).strict()),
    life: z
      .object({
        journal: z.object({ words: z.number().int().nonnegative(), updated: z.iso.date() }).strict(),
        shelf: z.object({ watching: z.array(Shelved), takes: z.array(Shelved) }).strict(),
      })
      .strict(),
    /** The site's look: its color tokens (CSS custom property names without the dashes) and font stacks. */
    style: z
      .object({
        colors: z.object({ light: z.record(z.string(), z.string()), dark: z.record(z.string(), z.string()) }).strict(),
        fonts: z.record(z.string(), z.string()),
      })
      .strict(),
    /** The island's fun, without the island. */
    play: z
      .object({
        /** Words English lost, from Etymon's museum. Years are first and last recorded use. */
        lostWords: z.array(
          z.object({ id: Id, word: z.string(), gloss: z.string(), story: z.string(), first: z.number().int(), died: z.number().int() }).strict(),
        ),
        games: z.array(
          z
            .object({
              id: z.enum(GAMES),
              name: z.string(),
              tagline: z.string(),
              pitch: z.string(),
              /** What the score counts: one and many. Left out for a game with no score. */
              unit: z.tuple([z.string(), z.string()]).optional(),
              color: Hex,
            })
            .strict(),
        ),
        /** Things to wear, each earned by visiting somewhere: a project, or another place on the island. */
        outfits: z.array(
          z
            .object({ id: Id, name: z.string(), slot: z.enum(OUTFIT_SLOTS), color: Hex, description: z.string(), project: Id.optional(), earnedAt: z.string() })
            .strict(),
        ),
        /** The made-up people who live in the project buildings. What they say about the work only restates its page. */
        islanders: z.array(
          z
            .object({
              id: Id,
              name: z.string(),
              role: z.string(),
              looks: z.string(),
              color: Hex,
              /** The project whose building they live in. */
              project: Id.optional(),
              home: z.string(),
              greeting: z.string(),
              topics: z.array(z.object({ id: Id, names: z.array(z.string()).min(1), reply: z.string(), link: Link.optional() }).strict()).min(1),
              farewell: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export type Pack = z.infer<typeof PackSchema>;

/** The color tokens and font stacks in a block of tokens.css. */
function readTokens(block: string) {
  const out: Record<string, string> = {};
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const isColor = (v: string) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(v);
const only = (o: Record<string, string>, keep: (k: string, v: string) => boolean) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keep(k, v)));

/** The look, read from tokens.css so it can't drift from the site. */
export function readStyle(css: string): Pack['style'] {
  const light = css.match(/^:root\s*\{([\s\S]*?)^\}/m)?.[1];
  const dark = css.match(/^:root\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m)?.[1];
  if (!light || !dark) throw new Error('pack.ts: tokens.css no longer has a :root block and a :root[data-theme=dark] block');
  const base = readTokens(light);
  return {
    colors: { light: only(base, (_, v) => isColor(v)), dark: only(readTokens(dark), (_, v) => isColor(v)) },
    fonts: Object.fromEntries(Object.entries(only(base, (k) => k.startsWith('font-'))).map(([k, v]) => [k.slice(5), v])),
  };
}

/** The pack, from the world (for what the island says) and the site's own data. */
export function buildPack(world: World, css: string = tokens): Pack {
  const site = world.site.url;
  const abs = (href: string) => (href.startsWith('/') ? site + href : href);
  const link = (l: { label: string; href: string }) => ({ label: l.label, href: abs(l.href) });
  const accent = readStyle(css).colors.light.accent;
  const hexOf = (slug?: string) => (slug && projects.find((p) => p.slug === slug)?.hex) || accent;
  const placeOf = (id: string) => world.places.find((p) => p.id === id)!;
  const shelved = (list: ShelfEntry[]) => list.filter((e) => !e.draft).map(({ draft: _, ...e }) => e);

  return PackSchema.parse({
    $schema: abs('/pack.schema.json'),
    version: 1,
    site: { url: site, title: world.site.title, world: abs('/world.json') },
    person: { ...world.person, about: abs(world.person.about), education: person.education },
    name: { parts: name.parts.map(({ em: _, ...p }) => p), sum: name.sum },
    cares: cares.map((c) => ({
      title: c.title,
      ...('quote' in c ? { quote: c.quote } : { body: c.body }),
      links: c.links.flatMap((l) => {
        if ('project' in l) return [{ label: l.label, href: abs(`/work/${l.project}`) }];
        const post = world.posts.find((p) => p.slug === l.post);
        return post ? [{ label: post.title, href: abs(post.href) }] : [];
      }),
    })),
    path: path.map((s) => ({ what: s.what, detail: s.detail, color: hexOf(s.tint), ...(s.href ? { href: abs(s.href) } : {}) })),
    projects: projects.map((p) => {
      const place = world.places.find((x) => x.project === p.slug)!;
      return {
        slug: p.slug,
        name: p.name,
        headline: p.headline,
        blurb: p.blurb,
        platforms: p.platforms,
        color: p.hex,
        body: p.body,
        tags: p.tags,
        page: abs(`/work/${p.slug}`),
        links: p.links.map((l) => ({ ...l, href: abs(l.href) })),
        ...(p.icon ? { icon: abs(p.icon) } : {}),
        shots: p.shots.map((s) => ({ ...s, src: abs(s.src) })),
        ...(p.credits ? { credits: p.credits.map((s) => ({ ...s, src: abs(s.src) })) } : {}),
        ...(p.creditLine ? { creditLine: p.creditLine } : {}),
        landmark: { archetype: place.archetype, name: place.title },
      };
    }),
    posts: world.posts.map((p) => ({ ...p, href: abs(p.href) })),
    life: { journal: { words: journalWords, updated: journalWordsUpdated }, shelf: { watching: shelved(shelf.watching), takes: shelved(shelf.takes) } },
    style: readStyle(css),
    play: {
      lostWords: world.lostWords.map(({ id, word, gloss, story, first, died }) => ({ id, word, gloss, story, first, died })),
      games: world.activities
        .filter((a) => a.kind === 'minigame' && a.game)
        .map((a) => {
          const g = GAME_INFO[a.game!];
          return { id: g.id, name: g.name, tagline: g.tagline, pitch: g.pitch, ...(g.unit ? { unit: g.unit } : {}), color: g.color };
        }),
      outfits: world.outfits.map((o) => {
        const place = placeOf(o.place);
        return { id: o.id, name: o.name, slot: o.slot, color: o.color, description: o.description, ...(place.project ? { project: place.project } : {}), earnedAt: place.title };
      }),
      islanders: world.places.flatMap((place) =>
        (place.interior?.people ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          looks: c.looks,
          color: c.color,
          ...(place.project ? { project: place.project } : {}),
          home: place.title,
          greeting: c.greeting,
          topics: c.topics.map((t) => ({ id: t.id, names: t.names, reply: t.reply, ...(t.link ? { link: link(t.link) } : {}) })),
          farewell: c.farewell,
        })),
      ),
    },
  });
}
