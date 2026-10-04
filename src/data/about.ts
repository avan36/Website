// The facts on the About page that aren't a project: where the name comes
// from, what matters, and the path so far. The About page draws them, and
// /pack.json carries them to whatever gets built next. Colors and project
// links go by slug, so they follow src/data/projects.ts.

/** One stage of a word's journey, oldest first, the way Etymon draws it. */
export type NameStage = { lang: string; form: string; gloss: string };

export type NamePart = {
  word: string;
  /** The language the word is in now, as an HTML lang code. */
  lang: string;
  stages: NameStage[];
  /** A line under the journey. `em` is the word in it set in italics. */
  note?: string;
  em?: string;
};

export const name: { parts: NamePart[]; sum: string } = {
  parts: [
    {
      word: 'Ambrose',
      lang: 'en',
      stages: [
        { lang: 'Proto-Indo-European', form: '*mer-', gloss: 'to die' },
        { lang: 'Ancient Greek', form: 'brotós', gloss: 'mortal' },
        { lang: 'Ancient Greek', form: 'ámbrotos', gloss: 'not mortal: immortal' },
        { lang: 'Ancient Greek', form: 'Ambrósios', gloss: 'a name: divine, immortal' },
        { lang: 'Latin', form: 'Ambrosius', gloss: '' },
        { lang: 'English', form: 'Ambrose', gloss: '' },
      ],
      note: 'The same root gives us ambrosia, the food that kept the Greek gods from dying.',
      em: 'ambrosia',
    },
    {
      word: 'Vannier',
      lang: 'fr',
      stages: [
        { lang: 'Latin', form: 'vannus', gloss: 'a winnowing basket' },
        { lang: 'French', form: 'van', gloss: 'the wide basket for sifting grain' },
        { lang: 'French', form: 'vannier', gloss: 'one who weaves them: a basket-maker' },
      ],
    },
  ],
  sum: "So, roughly: an immortal basket-maker. I'll take it.",
};

/** A link under a belief: to a project's page, or to a post (titled by the post). */
export type CareLink = { label: string; project: string } | { post: string };

export type Care = { title: string; links: CareLink[] } & ({ body: string } | { quote: string });

export const cares: Care[] = [
  {
    title: 'Your life is yours.',
    body: 'middle place keeps your journal on your device and in your own iCloud: no accounts, no tracking, nothing sold. With the Privacy Tech Lab, I helped measure whether 11,000+ websites honor a visitor’s request not to sell their data.',
    links: [
      { label: 'middle place', project: 'middle-place' },
      { label: 'The research', project: 'privacy-research' },
    ],
  },
  {
    title: 'Show where things come from.',
    body: 'Etymon follows English words back through every language they passed through on the way here. Map of Evolution does the same for life, from the first cell to you.',
    links: [
      { label: 'Etymon', project: 'etymon' },
      { label: 'Map of Evolution', project: 'map-of-evolution' },
    ],
  },
  {
    title: 'Judgment is the scarce thing.',
    quote: 'The scarce thing was never the code. It was the judgment about what to build, and the people who showed up to use it.',
    links: [{ post: 'the-future-of-software' }],
  },
  {
    title: 'Learning should answer back.',
    body: 'QuizMate gives students feedback the moment they need it. My fieldwork with the Assessment Lab looked at how students learn alongside new technology.',
    links: [{ label: 'QuizMate', project: 'quizmate' }],
  },
];

/** A step on the path. `tint` is the project whose color it wears (the accent if none). */
export type Step = { what: string; detail: string; tint?: string; href?: string };

export const path: Step[] = [
  { what: 'Wesleyan University', detail: 'B.A. in Computer Science & History, May 2026' },
  { what: 'Privacy Tech Lab', detail: 'Research on Global Privacy Control, supported by the National Science Foundation', tint: 'privacy-research', href: '/work/privacy-research' },
  { what: 'The Assessment Lab', detail: 'Fieldwork on how students learn alongside new technology', tint: 'quizmate' },
  { what: 'WesHack', detail: 'Won with eQoScan, an app that shows a product’s packaging footprint', tint: 'eqoscan', href: '/work/eqoscan' },
  { what: 'Machine Learning Specialization', detail: 'Stanford Online & DeepLearning.AI: supervised learning and the math underneath', tint: 'map-of-evolution' },
  { what: 'On the App Store', detail: 'QuizMate, busy beer and middle place', tint: 'busy-beer', href: '/#work' },
];
