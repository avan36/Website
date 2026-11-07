// Structured data (schema.org JSON-LD) for search engines and AI assistants.
// It only restates what's already in person and projects, so it never says
// anything the pages don't. One Person, with one @id, ties the home page, the
// project pages and the blog together, and middleplace.app points at the same
// @id for its founder.
import { person, type Project } from './projects';

const ORIGIN = 'https://www.ambrosevannier.com';
export const PERSON_ID = `${ORIGIN}/#person`;

/** The person node, with the profiles that are also him. */
export function personNode() {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: person.name,
    url: `${ORIGIN}/`,
    jobTitle: person.role,
    description: person.intro,
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'Wesleyan University' },
    sameAs: [person.github, person.linkedin],
  };
}

const external = (p: Project) => p.links.map((l) => l.href).filter((h) => /^https?:/.test(h));

/** A project page: an app when it's on the App Store, otherwise a piece of work. */
export function projectNode(p: Project, pageUrl: string, description: string) {
  const links = external(p);
  const isApp = p.links.some((l) => l.kind === 'appstore');
  const home = p.links.find((l) => l.kind !== 'appstore' && /^https?:/.test(l.href))?.href;
  return {
    '@type': isApp ? 'SoftwareApplication' : 'CreativeWork',
    name: p.name,
    description,
    url: home ?? pageUrl,
    mainEntityOfPage: pageUrl,
    ...(isApp ? { operatingSystem: p.platforms.split(' · ').join(', ') } : {}),
    ...(links.length ? { sameAs: links } : {}),
    keywords: p.tags.join(', '),
    author: { '@id': PERSON_ID },
  };
}

/** Wrap nodes as one document, escaped so a "<" can't close the script tag early. */
export function jsonLdText(...nodes: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
