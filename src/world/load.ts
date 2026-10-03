// Build-time entry point: the world with the blog's posts in it. Astro pages
// and endpoints call this; tests call buildWorld() with their own posts.

import { getPosts, isoDate, postUrl } from '../components/blog/posts';
import { buildWorld } from './world';
import type { World } from './schema';

let cached: Promise<World> | null = null;

export function loadWorld() {
  return (cached ??= getPosts().then((posts) =>
    buildWorld(
      posts.map((p) => ({ slug: p.id, title: p.data.title, description: p.data.description, date: isoDate(p.data.date), href: postUrl(p) })),
    ),
  ));
}
