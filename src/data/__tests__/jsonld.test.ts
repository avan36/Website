import { describe, expect, it } from 'vitest';
import { jsonLdText, PERSON_ID, personNode, projectNode } from '../jsonld';
import { bySlug, person, projects } from '../projects';

describe('structured data', () => {
  it('describes Ambrose with the one @id middleplace.app also points at', () => {
    const node = personNode();
    expect(node['@id']).toBe('https://www.ambrosevannier.com/#person');
    expect(node.name).toBe(person.name);
    expect(node.sameAs).toEqual([person.github, person.linkedin]);
  });

  it('marks middle place as his app, at middleplace.app, with its App Store page', () => {
    const mp = bySlug('middle-place')!;
    const node = projectNode(mp, 'https://www.ambrosevannier.com/work/middle-place', 'desc');
    expect(node['@type']).toBe('SoftwareApplication');
    expect(node.url).toBe('https://middleplace.app');
    expect(node.sameAs).toContain('https://apps.apple.com/us/app/middle-place/id6777842850');
    expect(node.operatingSystem).toBe('iPhone, iPad, Mac');
    expect(node.author).toEqual({ '@id': PERSON_ID });
  });

  it('only restates the project data, for every project', () => {
    for (const p of projects) {
      const node = projectNode(p, `https://www.ambrosevannier.com/work/${p.slug}`, p.body[0]);
      expect(node.name).toBe(p.name);
      expect(node['@type']).toBe(p.links.some((l) => l.kind === 'appstore') ? 'SoftwareApplication' : 'CreativeWork');
    }
  });

  it('escapes "<" so the data can never close its script tag', () => {
    const text = jsonLdText({ name: '</script><b>' });
    expect(text).not.toContain('<');
    expect(JSON.parse(text)['@graph'][0].name).toBe('</script><b>');
  });
});
