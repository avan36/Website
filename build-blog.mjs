// Turns posts/*.md into blog/<slug>.html plus the blog.html index.
// Runs on every Vercel deploy (`npm run build`); run it locally to preview.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const posts = fs.readdirSync('posts')
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const { data, content } = matter(fs.readFileSync(path.join('posts', file), 'utf8'));
    const date = new Date(data.date);
    return {
      slug: path.basename(file, '.md'),
      title: data.title,
      description: data.description,
      iso: date.toISOString().slice(0, 10),
      pretty: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
      html: marked.parse(content),
    };
  })
  .sort((a, b) => b.iso.localeCompare(a.iso));

const page = ({ title, description, main }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<meta name="author" content="Ambrose Vannier">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/media/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/media/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/media/apple-touch-icon.png">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<div class="page-bg" aria-hidden="true">
  <div class="noise-overlay"></div>
  <div class="mesh-blob blob-1"></div>
  <div class="mesh-blob blob-2"></div>
  <div class="mesh-blob blob-3"></div>
  <div class="mesh-blob blob-4"></div>
</div>

<header class="site-header">
  <div class="wrap-wide">
    <a class="brand" href="/index.html">
      <img class="brand-icon" src="/media/monogram.svg" width="38" height="38" alt="" />
      Ambrose Vannier
    </a>
    <nav class="nav" aria-label="Primary">
      <a class="nav-extra" href="/index.html#work">Work</a>
      <a href="/blog.html">Writing</a>
      <a href="https://github.com/avan36" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>

<main id="main">
${main}
</main>

<footer class="site-footer">
  <div class="wrap-wide">
    <div class="brand-foot">Ambrose Vannier</div>
    <div class="footer-links" aria-label="Footer">
      <a href="/index.html#work">Work</a>
      <a href="/blog.html">Writing</a>
      <a href="https://github.com/avan36" rel="noopener">GitHub</a>
    </div>
    <div class="copy">© ${new Date().getFullYear()} Ambrose Vannier</div>
  </div>
</footer>

<div class="cursor-blob"></div>
<div class="cursor-blob"></div>
<div class="cursor-blob"></div>
<div class="cursor-blob"></div>

<script>
  const blobs = document.querySelectorAll('.cursor-blob');
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let isBursting = false;
  const pos = Array.from({length: blobs.length}, () => ({x: mouseX, y: mouseY}));
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  window.addEventListener('mousedown', () => isBursting = true);
  window.addEventListener('mouseup', () => isBursting = false);
  function animate() {
    const targetScale = isBursting ? 1.5 : 1;
    pos[0].scale = pos[0].scale || 1;
    pos[0].scale += (targetScale - pos[0].scale) * 0.2;
    pos[0].x = mouseX;
    pos[0].y = mouseY;
    blobs[0].style.transform = \`translate3d(\${pos[0].x}px, \${pos[0].y}px, 0) scale(\${pos[0].scale})\`;
    if (isBursting) blobs[0].classList.add('burst-color'); else blobs[0].classList.remove('burst-color');
    for (let i = 1; i < blobs.length; i++) {
      const baseScale = 1 - i*0.15;
      const targetS = isBursting ? baseScale * 1.5 : baseScale;
      pos[i].scale = pos[i].scale || baseScale;
      pos[i].scale += (targetS - pos[i].scale) * 0.3;
      pos[i].x += (pos[i-1].x - pos[i].x) * 0.35;
      pos[i].y += (pos[i-1].y - pos[i].y) * 0.35;
      blobs[i].style.transform = \`translate3d(\${pos[i].x}px, \${pos[i].y}px, 0) scale(\${pos[i].scale})\`;
      if (isBursting) blobs[i].classList.add('burst-color'); else blobs[i].classList.remove('burst-color');
    }
    requestAnimationFrame(animate);
  }
  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !hasFinePointer) {
    blobs.forEach(b => b.style.display = 'none');
  } else {
    document.documentElement.classList.add('blob-cursor');
    animate();
  }
</script>
</body>
</html>
`;

fs.rmSync('blog', { recursive: true, force: true });
fs.mkdirSync('blog');

for (const p of posts) {
  fs.writeFileSync(path.join('blog', `${p.slug}.html`), page({
    title: `${p.title} — Ambrose Vannier`,
    description: p.description,
    main: `  <article class="article" itemscope itemtype="https://schema.org/BlogPosting">
    <a class="back-link" href="/blog.html">← All writing</a>
    <div class="meta"><time itemprop="datePublished" datetime="${p.iso}">${p.pretty}</time></div>
    <h1 itemprop="headline">${esc(p.title)}</h1>
    <div class="article-body" itemprop="articleBody">
${p.html}
    </div>
  </article>`,
  }));
}

fs.writeFileSync('blog.html', page({
  title: 'Writing — Ambrose Vannier',
  description: 'Essays by Ambrose Vannier.',
  main: `  <div class="article">
    <a class="back-link" href="/index.html">← Back to home</a>
    <h1>Writing</h1>
    <ul class="post-list">
${posts.map((p) => `      <li>
        <div class="meta"><time datetime="${p.iso}">${p.pretty}</time></div>
        <h2><a href="/blog/${p.slug}.html">${esc(p.title)}</a></h2>
        <p>${esc(p.description)}</p>
      </li>`).join('\n')}
    </ul>
  </div>`,
}));

console.log(`Built ${posts.length} post(s).`);
