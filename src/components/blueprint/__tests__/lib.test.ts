import { describe, expect, it } from 'vitest';
import { drawIsland, esc, highlightJson, humanize, prettyJson, renderFields, renderValue } from '../lib';
import { world } from '../../../world/__tests__/fixtures';

describe('the blueprint helpers', () => {
  it('names fields like a person would', () => {
    expect(humanize('lostWords')).toBe('Lost words');
    expect(humanize('first-seen')).toBe('First seen');
    expect(humanize('$schema')).toBe('Schema');
  });

  it('highlights JSON without changing it', () => {
    const v = { a: 'x "<y>"', n: -1.5, ok: true, none: null, list: [1, 2] };
    const html = highlightJson(v);
    const text = html
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    expect(JSON.parse(text)).toEqual(v);
    expect(html).toContain('<span class="j-k">&quot;a&quot;</span>');
    expect(html).toContain('<span class="j-n">-1.5</span>');
    expect(html).toContain('<span class="j-b">true</span>');
  });

  it('keeps short things on one line', () => {
    expect(prettyJson({ x: 1, z: 2 })).toBe('{ "x": 1, "z": 2 }');
    expect(prettyJson({})).toBe('{}');
  });

  it('renders any field it has never heard of, escaped', () => {
    const html = renderFields({ known: 1, someNewThing: { nested: ['<b>', 2] }, color: '#ff0000', page: '/blog' }, ['known']);
    expect(html).not.toContain('Known');
    expect(html).toContain('Some new thing');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('--sw:#ff0000');
    expect(html).toContain('href="/blog"');
    expect(renderFields({ a: 1 }, ['a'])).toBe('');
    expect(renderValue(undefined)).toContain('none');
    expect(esc('"\'')).toBe('&quot;&#39;');
  });

  it('draws the island from the world', () => {
    const w = world();
    const d = drawIsland(w);
    expect(d.coast.startsWith('M')).toBe(true);
    expect(d.places.map((p) => p.id)).toEqual(w.places.map((p) => p.id));
    expect(d.routes).toHaveLength(w.routes.length);
    for (const r of d.routes) expect(r.d, `${r.from} to ${r.to}`).toMatch(/^M/);
    expect(d.contours.length).toBeGreaterThan(0);
  });
});
