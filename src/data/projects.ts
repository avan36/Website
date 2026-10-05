// Every project on the site, in island order. The island landmarks, the
// /work/<slug> pages and the plain list view are all generated from this.

export type Link = { label: string; href: string; kind?: 'appstore' | 'primary' | 'text' };
export type Shot = { src: string; alt: string; width: number; height: number; frame: 'phone' | 'browser' };

export type Project = {
  slug: string;
  name: string;
  /** One-line promise, used as the page headline. */
  headline: string;
  /** Short line shown on the island label and in the list view. */
  blurb: string;
  platforms: string;
  /** CSS custom property holding the accent color, e.g. var(--c-busy-beer). */
  color: string;
  /** Hex of the same accent, for WebGL. */
  hex: string;
  /** The island landmark that stands for this project. */
  landmark: 'cabin' | 'taproom' | 'tree' | 'library' | 'lighthouse' | 'schoolhouse' | 'depot';
  landmarkName: string;
  icon?: string;
  body: string[];
  tags: string[];
  links: Link[];
  shots: Shot[];
  credits?: { src: string; alt: string; width: number; height: number }[];
  creditLine?: string;
};

export const projects: Project[] = [
  {
    slug: 'middle-place',
    name: 'middle place',
    headline: 'The journal that writes back.',
    blurb: 'A journal that remembers, and answers.',
    platforms: 'iPhone · iPad · Mac',
    color: 'var(--c-middle-place)',
    hex: '#2e9c8f',
    landmark: 'cabin',
    landmarkName: 'The cabin',
    body: [
      'middle place is a journal that answers you. It remembers the people, the patterns, and where you left off, so you never start the story over.',
      'Everything stays on your device and in your own iCloud. No accounts, no tracking, nothing sold.',
    ],
    tags: ['SwiftUI', 'SwiftData', 'Local-first'],
    links: [
      { label: 'Download on the App Store', href: 'https://apps.apple.com/us/app/middle-place/id6777842850', kind: 'appstore' },
      { label: 'Visit middleplace.app', href: 'https://middleplace.app', kind: 'text' },
    ],
    shots: [
      { src: '/media/mh-chat.png', alt: 'The continuous chat thread in middle place.', width: 506, height: 1100, frame: 'phone' },
      { src: '/media/mh-life.jpg', alt: 'A warm reflection on where you are right now.', width: 506, height: 1100, frame: 'phone' },
    ],
  },
  {
    slug: 'busy-beer',
    name: 'busy beer',
    headline: "Know what you'll love before you order.",
    blurb: 'Point it at any menu. It knows your taste.',
    platforms: 'iPhone',
    color: 'var(--c-busy-beer)',
    hex: '#f29a1f',
    landmark: 'taproom',
    landmarkName: 'The taproom',
    icon: '/media/busybeer-icon.png',
    body: [
      'busy beer is an AI taste companion for everything you drink. Rate what you try and watch it map your palate across flavor axes.',
      "Then point the menu scanner at any drinks list to see what's actually worth ordering, ranked against your own taste.",
    ],
    tags: ['SwiftUI', 'Firebase', 'Gemini'],
    links: [
      { label: 'Download on the App Store', href: 'https://apps.apple.com/gb/app/busy-beer/id6782775632', kind: 'appstore' },
      { label: 'See the busy beer site', href: '/busybeer/', kind: 'text' },
    ],
    shots: [
      { src: '/media/bb-scan.webp', alt: 'The menu scanner ranking every drink on a list.', width: 840, height: 1827, frame: 'phone' },
      { src: '/media/bb-axes.webp', alt: 'A flavor-axes palate map built from your ratings.', width: 840, height: 1827, frame: 'phone' },
    ],
  },
  {
    slug: 'map-of-evolution',
    name: 'Map of Evolution',
    headline: 'Four billion years on one screen.',
    blurb: 'The whole tree of life, from the first cell to you.',
    platforms: 'Web',
    color: 'var(--c-map-of-evolution)',
    hex: '#4caf6a',
    landmark: 'tree',
    landmarkName: 'The ancient tree',
    body: [
      'Map of Evolution is an interactive tree of life, from the first cell to dinosaurs, bananas, and you.',
      'Play through history and watch the tree grow, find when any two organisms last shared an ancestor, or follow a guided tour. Germ cards show the diseases they cause, the antibiotics that treat them, and where in the US they turn up.',
    ],
    tags: ['React', 'TypeScript', 'Canvas'],
    links: [
      { label: 'Explore the tree', href: 'https://avan36.github.io/MapOfEvolution/', kind: 'primary' },
      { label: 'View source on GitHub', href: 'https://github.com/avan36/MapOfEvolution', kind: 'text' },
    ],
    shots: [
      { src: '/media/moe-tree.webp', alt: "Map of Evolution's radial tree of life, with branches for bacteria, plants and animals and a timeline from 4 billion years ago to today.", width: 1856, height: 956, frame: 'browser' },
      { src: '/media/moe-card.webp', alt: 'Tapping bony fish lights up its lineage and opens a card with photos, when it appeared, what it branches into and its family line back to the first cell.', width: 1856, height: 956, frame: 'browser' },
      { src: '/media/moe-germs.webp', alt: 'The Germs & medicine spotlight zoomed in on C. diff: the disease it causes and the antibiotics that treat it, including which bacteria they come from.', width: 1856, height: 956, frame: 'browser' },
    ],
  },
  {
    slug: 'etymon',
    name: 'Etymon',
    headline: 'Where every English word came from.',
    blurb: 'An animated history of English, one word at a time.',
    platforms: 'Web',
    color: 'var(--c-etymon)',
    hex: '#3a6fd8',
    landmark: 'library',
    landmarkName: 'The old library',
    body: [
      "Etymon is an interactive, animated history of English: where words came from, how they changed on the way, how popular they've been, and the words we lost.",
      'Watch 1,500 years of vocabulary flow as one river with a tributary for each source language, follow any word stage by stage from its ancient root to today on a timeline and a map, grow the family tree of a single root into dozens of modern words, or wander a museum of words English dropped, like wanhope and overmorrow.',
      "Words that aren't in the curated data are looked up live on Wiktionary, in about 50 languages, and turned into the same journey view.",
    ],
    tags: ['React', 'TypeScript', 'D3', 'Framer Motion'],
    links: [
      { label: 'Explore Etymon', href: 'https://avan36.github.io/Etymology/', kind: 'primary' },
      { label: 'View source on GitHub', href: 'https://github.com/avan36/Etymology', kind: 'text' },
    ],
    shots: [
      { src: '/media/etymon-river.webp', alt: 'The River of English: 1,500 years of new words as one river, with a stream for each source language and a glint for every word, from water and world to selfie and rizz.', width: 1440, height: 900, frame: 'browser' },
      { src: '/media/etymon-word.webp', alt: "A word page: disaster's 4,500 km journey on a map, from Proto-Indo-European through Ancient Greek, Italian and Middle French to English.", width: 1440, height: 900, frame: 'browser' },
    ],
  },
  {
    slug: 'privacy-research',
    name: 'Global Privacy Control',
    headline: 'Holding the web accountable.',
    blurb: 'A crawler that checked 11,000+ sites for privacy compliance.',
    platforms: 'Research · privacy-tech-lab',
    color: 'var(--c-privacy)',
    hex: '#e5484d',
    landmark: 'lighthouse',
    landmarkName: 'The lighthouse',
    body: [
      "I contributed to the Privacy Tech Lab's work on Global Privacy Control: OptMeowt, a browser extension that automatically tells sites not to sell your data, and a large-scale crawler that measured GPC compliance across 11,000+ websites.",
      'The findings live in an interactive public dashboard.',
    ],
    tags: ['Browser extensions', 'Selenium', 'Research'],
    links: [
      { label: 'See the live results', href: 'https://gpc-web-ui.vercel.app', kind: 'primary' },
      { label: 'The crawler', href: 'https://github.com/privacy-tech-lab/gpc-web-crawler', kind: 'text' },
      { label: 'OptMeowt', href: 'https://github.com/privacy-tech-lab/gpc-optmeowt', kind: 'text' },
      { label: 'Get OptMeowt for Chrome', href: 'https://chrome.google.com/webstore/detail/optmeowt/hdbnkdbhglahihjdbodmfefogcjbpgbo', kind: 'text' },
      { label: 'Get OptMeowt for Firefox', href: 'https://addons.mozilla.org/en-US/firefox/addon/optmeowt/', kind: 'text' },
    ],
    shots: [
      { src: '/media/gpc-arch.png', alt: 'The crawler architecture: a Selenium-driven browser running the OptMeowt extension, posting analysis to a REST API and database.', width: 1120, height: 723, frame: 'browser' },
    ],
    credits: [
      { src: '/media/wesleyan_shield.png', alt: 'Wesleyan University', width: 200, height: 200 },
      { src: '/media/plt_logo.png', alt: 'privacy-tech-lab', width: 200, height: 200 },
      { src: '/media/nsf.png', alt: 'National Science Foundation', width: 219, height: 220 },
    ],
    creditLine: 'Research supported by the National Science Foundation.',
  },
  {
    slug: 'quizmate',
    name: 'QuizMate',
    headline: 'Lessons and quizzes in minutes.',
    blurb: 'A learning app for the classroom.',
    platforms: 'iPhone · iPad',
    color: 'var(--c-quizmate)',
    hex: '#6c5ce7',
    landmark: 'schoolhouse',
    landmarkName: 'The schoolhouse',
    icon: '/media/quizmate-icon.png',
    body: [
      'A learning app for the classroom. Teachers build lessons and quizzes in minutes; students practice, compete with classmates, and get feedback the moment they need it.',
    ],
    tags: ['SwiftUI', 'iOS', 'Firebase'],
    links: [
      { label: 'Download on the App Store', href: 'https://apps.apple.com/gb/app/quizmate-learn-with-ai/id6740884440', kind: 'appstore' },
    ],
    shots: [],
  },
  {
    slug: 'eqoscan',
    name: 'eQoScan',
    headline: 'Scan a product, see its packaging footprint.',
    blurb: 'Hackathon winner. Cut the waste you bring home.',
    platforms: 'iPhone · WesHack winner',
    color: 'var(--c-eqoscan)',
    hex: '#20a464',
    landmark: 'depot',
    landmarkName: 'The recycling depot',
    icon: '/media/eqoscan-icon.png',
    body: [
      'A hackathon-winning iOS app that helps shoppers understand and cut down on the waste they bring home. Scan a product and see its packaging footprint.',
    ],
    tags: ['Swift', 'SwiftUI', 'Hackathon'],
    links: [
      { label: 'View source on GitHub', href: 'https://github.com/avan36/eQoScan', kind: 'text' },
    ],
    shots: [],
  },
];

export const bySlug = (slug: string) => projects.find((p) => p.slug === slug);

export const person = {
  name: 'Ambrose Vannier',
  role: 'Software developer',
  intro:
    'I build apps people love to use and tools that keep the web honest. Recently graduated from Wesleyan University, B.A. in Computer Science & History, May 2026.',
  github: 'https://github.com/avan36',
  linkedin: 'https://www.linkedin.com/in/ambrosev',
  education: [
    {
      title: 'Wesleyan University',
      detail:
        'B.A. in Computer Science & History, May 2026. Research with the Privacy Tech Lab, and fieldwork with the Assessment Lab studying how students learn alongside new technology.',
    },
    {
      title: 'Machine Learning Specialization',
      detail: "Stanford Online & DeepLearning.AI's specialization in supervised learning: regression, classification, and the math underneath.",
    },
  ],
};
