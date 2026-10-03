// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ambrosevannier.com',
  // Emit flat `name.html` files. With Vercel's cleanUrls they're served at
  // `/name`, and the old `/blog.html` and `/blog/<slug>.html` links redirect.
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [
    sitemap({
      // The app sub-sites keep their own hand-written pages.
      filter: (page) => !page.includes('/admin'),
    }),
  ],
});
