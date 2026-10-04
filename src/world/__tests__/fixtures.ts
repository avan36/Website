import { buildWorld } from '../world';
import type { Post } from '../schema';

export const posts: Post[] = [
  { slug: 'first', title: 'First post', description: 'The first one.', date: '2026-01-02', href: '/blog/first' },
  { slug: 'second', title: 'Second post', description: 'Another one.', date: '2026-03-04', href: '/blog/second' },
];

export const world = () => buildWorld(posts);
