// The Writing feed at /rss.xml. Full post HTML is included so readers can read
// in their feed reader; links point at the clean /blog/<slug> URLs.
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postUrl } from '../components/blog/posts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: 'Ambrose Vannier — Writing',
    description: 'Essays and notes by Ambrose Vannier on software, technology and the things he builds.',
    site: context.site ?? 'https://ambrosevannier.com',
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: postUrl(post),
      content: post.rendered?.html,
    })),
    customData: '<language>en-us</language>',
  });
}
