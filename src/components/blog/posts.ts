// Shared helpers for the blog: one sorted list of posts, date formatting and
// reading time, so the index, the post pages and the feed always agree.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** All posts, newest first. Ties fall back to the slug so order is stable. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts');
  return posts.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
  );
}

// Front-matter dates are calendar days, parsed as UTC midnight. Format in UTC
// so a post never shows the previous day.
const longDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const formatLong = (d: Date) => longDate.format(d);
export const formatDayMonth = (d: Date) => dayMonth.format(d);
export const yearOf = (d: Date) => d.getUTCFullYear();

/** Minutes to read at a relaxed 230 words a minute, never less than one. */
export function readingMinutes(markdown = ''): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export const postUrl = (post: Post) => `/blog/${post.id}`;
