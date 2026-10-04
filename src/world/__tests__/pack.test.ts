import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorld } from '../world';
import { buildPack, readStyle, type Pack } from '../pack';
import { posts, world } from './fixtures';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const pack = buildPack(world(), css);

/** Every [key, value] pair anywhere in the pack. */
function* entries(v: unknown): Generator<[string, unknown]> {
  if (Array.isArray(v)) for (const x of v) yield* entries(x);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      yield [k, x];
      yield* entries(x);
    }
}

describe('the content pack', () => {
  it('carries every project, post and lost word, and every islander from every room', () => {
    const w = world();
    expect(pack.projects.map((p) => p.slug)).toEqual(w.projects.map((p) => p.slug));
    expect(pack.posts.map((p) => p.slug)).toEqual(w.posts.map((p) => p.slug));
    expect(pack.play.lostWords.map((x) => x.word)).toEqual(w.lostWords.map((x) => x.word));
    const people = w.places.flatMap((p) => p.interior?.people ?? []);
    expect(pack.play.islanders.map((c) => c.id)).toEqual(people.map((c) => c.id));
    expect(pack.play.games.map((g) => g.id)).toEqual(['stones', 'crabs', 'crates', 'bartender', 'patterns', 'etymology', 'evolution']);
    // A game with no score says so by having no unit.
    expect(pack.play.games.find((g) => g.id === 'bartender')).not.toHaveProperty('unit');
  });

  it('gives each project the building that stands for it on the island', () => {
    const w = world();
    for (const p of pack.projects) {
      const place = w.places.find((x) => x.project === p.slug)!;
      expect(p.landmark).toEqual({ archetype: place.archetype, name: place.title });
    }
  });

  it('makes every link absolute, so it works from anywhere', () => {
    const links = [...entries(pack)].filter(([k]) => ['href', 'src', 'page', 'icon', 'about', 'github', 'url', 'world', '$schema'].includes(k));
    expect(links.length).toBeGreaterThan(40);
    for (const [k, v] of links) expect(v, k).toMatch(/^https:\/\//);
  });

  it('leaves the island out: no coordinates, places, routes or geography', () => {
    const keys = new Set([...entries(pack)].map(([k]) => k));
    for (const k of ['at', 'x', 'z', 'door', 'footprint', 'places', 'routes', 'geography', 'hint', 'in']) expect(keys.has(k), k).toBe(false);
  });

  it('reads the look from tokens.css, light and dark', () => {
    expect(pack.style.colors.light.bg).toBe('#fbf6ec');
    expect(pack.style.colors.light.line).toBe('rgba(29, 26, 22, 0.1)');
    expect(pack.style.colors.dark.bg).toBe('#12100d');
    expect(pack.style.colors.light.accent).toBe('#d9461f');
    for (const p of pack.projects) expect(Object.values(pack.style.colors.light)).toContain(p.color);
    expect(pack.style.fonts.read).toMatch(/^'Newsreader Variable'/);
    expect(Object.values(pack.style.colors.light).every((v) => !v.includes('/*'))).toBe(true);
    expect(() => readStyle('a { color: red; }')).toThrow(/tokens\.css/);
  });

  it('links the essay when the blog has it, and drops the link when it does not', () => {
    const judgment = (p: Pack) => p.cares.find((c) => c.quote)!;
    expect(judgment(pack).links).toEqual([]);
    const essay = { slug: 'the-future-of-software', title: 'The future of software', description: 'An essay.', date: '2026-05-01', href: '/blog/the-future-of-software' };
    const withEssay = buildPack(buildWorld([...posts, essay]), css);
    expect(judgment(withEssay).links).toEqual([{ label: essay.title, href: 'https://ambrosevannier.com/blog/the-future-of-software' }]);
  });

  it('never ships a draft from the shelf', () => {
    expect(JSON.stringify(pack)).not.toContain('PLACEHOLDER');
    for (const e of [...pack.life.shelf.watching, ...pack.life.shelf.takes]) expect(e).not.toHaveProperty('draft');
  });

  it('keeps every string the islanders and games say free of em dashes', () => {
    const said = [...entries(pack.play)].filter(([, v]) => typeof v === 'string').map(([, v]) => v as string);
    for (const s of said) expect(s).not.toContain('—');
  });
});
