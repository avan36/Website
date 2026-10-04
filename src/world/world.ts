// The world, authored. This is the one file to edit to change the island:
// move a place, add a path, rewrite what you see when you arrive, or hide a
// new word. Projects and the person come from src/data/projects.ts; posts
// come from the blog. buildWorld() stitches them together and validates the
// lot, so a mistake fails the build with a sentence, not a blank canvas.

import { person, projects } from '../data/projects';
import { parseWorld, type Post, type World, type WorldInput } from './schema';

const SITE = 'https://ambrosevannier.com';

type PlaceInput = WorldInput['places'][number];

/** The parts of a project place that come from the project itself. */
function projectPlace(slug: string, place: Omit<PlaceInput, 'id' | 'kind' | 'project' | 'name' | 'blurb' | 'href' | 'color'>): PlaceInput {
  const p = projects.find((x) => x.slug === slug);
  if (!p) throw new Error(`world.ts: no project called "${slug}" in src/data/projects.ts`);
  return { id: slug, kind: 'project', project: slug, name: p.name, blurb: p.blurb, href: `/work/${slug}`, color: p.hex, ...place };
}

const places: PlaceInput[] = [
  {
    id: 'plaza',
    kind: 'hub',
    archetype: 'plaza',
    name: 'The plaza',
    title: 'The plaza',
    blurb: 'Where every path on the island meets.',
    color: '#e8c48e',
    at: { x: 0, z: 4.5 },
    footprint: 0.1,
    clearing: 3.5,
    aliases: ['plaza', 'square', 'middle', 'centre', 'center', 'start'],
    description:
      "You're in a small sandy plaza in the middle of the island. Every path from here leads to something I've made, and the sea is never more than a short walk away.",
    scenery: [
      { id: 'paths', names: ['paths', 'path', 'trails'], description: 'Well-trodden paths of packed sand fan out in every direction. Some have clearly been walked more than others.' },
      { id: 'sea', names: ['sea', 'ocean', 'water', 'waves'], description: 'Turquoise and calm. Out past the pier, a few gulls are arguing about something.' },
    ],
  },
  projectPlace('middle-place', {
    archetype: 'cabin',
    title: 'The cabin',
    at: { x: -13, z: -3 },
    footprint: 2.7,
    clearing: 4.6,
    aliases: ['cabin', 'log cabin', 'hut', 'journal'],
    description:
      'A snug log cabin with smoke curling from the chimney and flowers in every window box. On the porch, a journal lies open on a little table beside an empty chair, as if someone just stepped inside.',
    scenery: [
      { id: 'journal', names: ['journal', 'diary', 'notebook', 'book'], description: "The journal is bound in teal, with a pencil tucked in its spine. The last entry picks up exactly where the one before it left off." },
      { id: 'firewood', names: ['firewood', 'woodpile', 'logs', 'wood'], description: 'A tidy stack of split logs, enough for a long winter of writing.' },
      { id: 'chair', names: ['chair', 'porch', 'table'], description: "A wooden chair, angled toward the sea. It looks like a good place to think." },
      { id: 'lantern', names: ['lantern', 'lamp'], description: 'A lantern hangs by the door, already lit for the evening.' },
    ],
  }),
  projectPlace('busy-beer', {
    archetype: 'taproom',
    title: 'The taproom',
    at: { x: 12.5, z: 7.5 },
    footprint: 2.7,
    clearing: 4.6,
    aliases: ['taproom', 'pub', 'bar', 'tavern', 'beer'],
    description:
      'A timber-framed taproom with an arched door, string lights sagging between two poles, and a sign that swings whenever the breeze picks up. Out front, mugs sit on a barrel table between a pair of stools.',
    scenery: [
      { id: 'barrels', names: ['barrels', 'barrel', 'casks', 'kegs'], description: 'Oak barrels stacked against the wall, most of them empty.' },
      { id: 'sign', names: ['sign', 'swinging sign'], description: 'It reads: "Know what you\'ll love before you order."' },
      { id: 'mugs', names: ['mugs', 'mug', 'table', 'stools'], description: 'Two mugs, one full, one empty. Somebody already knows what they like.' },
      { id: 'lights', names: ['lights', 'string lights', 'bulbs'], description: 'Warm little bulbs on a sagging wire. They hum faintly.' },
    ],
  }),
  projectPlace('map-of-evolution', {
    archetype: 'tree',
    title: 'The ancient tree',
    at: { x: -1, z: -10.5 },
    footprint: 1.7,
    clearing: 4.5,
    faces: 0.2,
    aliases: ['tree', 'ancient tree', 'oak'],
    description:
      'An enormous old tree on a gentle rise, its roots spilling down the slope and its canopy full of blossom. A swing hangs from one branch, and there is a little round door in the trunk, far too small for you.',
    scenery: [
      { id: 'roots', names: ['roots', 'root'], description: 'Thick roots twist down into the ground in every direction, like branches growing the other way.' },
      { id: 'door', names: ['door', 'round door', 'little door'], description: "A tiny round door set into the trunk. You knock. Four billion years of relatives don't answer." },
      { id: 'swing', names: ['swing', 'branch'], description: 'A plank swing on two ropes. It sways a little, though no one is on it.' },
      { id: 'mushrooms', names: ['mushrooms', 'mushroom', 'toadstools'], description: 'A ring of spotted mushrooms. Fungi: closer cousins of yours than of the tree, as it happens.' },
    ],
  }),
  projectPlace('etymon', {
    archetype: 'library',
    title: 'The old library',
    at: { x: -9.6, z: -11.6 },
    footprint: 2.7,
    clearing: 4.2,
    aliases: ['library', 'old library', 'tower'],
    description:
      'A sandstone library with a blue slate roof and a round tower wrapped in ivy. A giant book lies open on a stone lectern outside, and as its pages turn, letters lift off them and drift up into the air.',
    scenery: [
      { id: 'book', names: ['book', 'giant book', 'lectern', 'pages'], description: 'The pages turn by themselves. Each one is a single word, followed all the way back to where it came from.' },
      { id: 'bookshelf', names: ['bookshelf', 'shelf', 'shelves', 'books'], description: 'A little outdoor bookshelf, open to anyone. Dictionaries, mostly, and a few very old ones.' },
      { id: 'noticeboard', names: ['noticeboard', 'board', 'notices'], description: 'Pinned pages flutter on the board. One reads: "Words we lost. Have you seen them? Ask inside."' },
      { id: 'letters', names: ['letters', 'letter'], description: 'Loose letters drift past: an æ, a þ, a ð. Old English, by the look of it.' },
    ],
  }),
  projectPlace('privacy-research', {
    archetype: 'lighthouse',
    title: 'The lighthouse',
    at: { x: 18.5, z: -16.5 },
    footprint: 1.7,
    clearing: 3.2,
    faces: Math.atan2(-18.5, 16.5),
    aliases: ['lighthouse', 'tower', 'light', 'beam'],
    description:
      'A striped lighthouse at the end of a rocky headland. Its beam sweeps slowly over the water, picking out every passing ship, and a weather vane creaks on the top.',
    scenery: [
      { id: 'rocks', names: ['rocks', 'rock', 'cliff', 'headland'], description: 'Dark rocks at the foot of the tower, wet with spray. There are cracks you could slip a hand into.' },
      { id: 'beam', names: ['beam', 'light', 'lamp'], description: 'The beam passes over you, then over 11,000 ships, one at a time. It notes which ones are flying the right flag.' },
      { id: 'vane', names: ['vane', 'weather vane', 'weathervane'], description: 'The weather vane points wherever the wind says. Today, out to sea.' },
    ],
  }),
  projectPlace('quizmate', {
    archetype: 'schoolhouse',
    title: 'The schoolhouse',
    at: { x: -11, z: 9.5 },
    footprint: 2.6,
    clearing: 4.4,
    aliases: ['schoolhouse', 'school', 'classroom'],
    description:
      'A one-room schoolhouse in clapboard, with a bell in the little tower and a flag on the pole. An apple waits on the step, and a chalkboard stands outside on an A-frame.',
    scenery: [
      { id: 'chalkboard', names: ['chalkboard', 'board', 'blackboard'], description: "Today's lesson, in neat chalk: \"Quiz on Friday. Everyone gets feedback.\" Someone has added something in the corner in different handwriting." },
      { id: 'apple', names: ['apple'], description: 'A shiny red apple, for the teacher. You leave it where it is.' },
      { id: 'bell', names: ['bell', 'tower'], description: "The school bell. You're tempted, but class isn't in." },
    ],
  }),
  projectPlace('eqoscan', {
    archetype: 'depot',
    title: 'The recycling depot',
    at: { x: 12, z: -5.5 },
    footprint: 2.5,
    clearing: 4.4,
    aliases: ['depot', 'recycling', 'recycling depot', 'shed'],
    description:
      'An open-fronted shed with a recycling badge on the back wall. A conveyor belt rattles out front, carrying bottles and boxes past a row of colored bins.',
    scenery: [
      { id: 'bins', names: ['bins', 'bin', 'compost'], description: 'A bin for every kind of packaging, and a compost bin at the end of the row, busy with ants.' },
      { id: 'conveyor', names: ['conveyor', 'belt', 'rollers'], description: 'Everything on the belt gets a quick look before it is sorted. Most of it was more packaging than product.' },
      { id: 'crates', names: ['crates', 'crate', 'boxes'], description: 'Crates of flattened cardboard, waiting to be something else.' },
    ],
  }),
  {
    id: 'blog',
    kind: 'writing',
    archetype: 'pier',
    name: 'Writing',
    title: 'The pier',
    blurb: 'Notes and essays, posted from the end of the pier.',
    href: '/blog',
    color: '#2b8fb8',
    at: { x: 4, z: 26.9 },
    footprint: 0.45,
    faces: Math.PI,
    door: { x: 4, z: 25.4 },
    aliases: ['pier', 'jetty', 'dock', 'writing', 'blog', 'post box', 'postbox'],
    description:
      'The end of a long wooden pier, well out over the water. A post box stands here with a letter peeking out of the slot, and a little rowboat bumps gently against the posts below.',
    scenery: [
      { id: 'postbox', names: ['post box', 'postbox', 'box', 'letter'], description: 'Everything I write gets posted from here. The letter in the slot is the latest one.' },
      { id: 'rowboat', names: ['rowboat', 'boat', 'towel'], description: 'A little rowboat, tied up and half full of rainwater. A damp towel lies across the seat.' },
      { id: 'water', names: ['water', 'sea', 'fish'], description: 'Clear enough to see fish circling the posts. You could probably catch something from here.' },
    ],
  },
  {
    id: 'contact',
    kind: 'contact',
    archetype: 'bottle',
    name: 'Contact',
    title: 'Message in a bottle',
    blurb: 'Say hello. I read every message.',
    href: '/contact',
    color: '#ff5a36',
    at: { x: -14.444, z: 19.167 },
    footprint: 0.5,
    faces: 0.5,
    door: { x: -13.344, z: 18.267 },
    aliases: ['bottle', 'message', 'beach', 'contact', 'shore'],
    description:
      'A quiet stretch of beach, off the beaten path. A glass bottle has washed up in the sand with a rolled-up note inside, and a small crab is very interested in it.',
    scenery: [
      { id: 'note', names: ['note', 'paper', 'message'], description: 'The note inside is blank, waiting. Open the bottle to write one.' },
      { id: 'crab', names: ['crab'], description: 'The crab scuttles sideways, keeping one eye on you.' },
      { id: 'shells', names: ['shells', 'shell', 'starfish', 'sand'], description: 'Shells and a starfish, scattered by the last tide.' },
      { id: 'guestbook', names: ['guestbook', 'notes', 'rolled notes'], description: 'A few rolled-up notes from earlier visitors, tucked in the sand beside the bottle. Open the bottle to read them, or to leave one of your own.' },
    ],
  },
];

const routes: WorldInput['routes'] = [
  // Paved: the paths you see, one from the plaza to every place.
  { from: 'plaza', to: 'map-of-evolution', bend: -0.12 },
  { from: 'plaza', to: 'middle-place', bend: -0.12 },
  { from: 'plaza', to: 'quizmate', bend: -0.12 },
  { from: 'plaza', to: 'busy-beer', bend: 0.12 },
  { from: 'plaza', to: 'eqoscan', bend: 0.12 },
  { from: 'plaza', to: 'etymon', bend: -0.12 },
  { from: 'plaza', to: 'privacy-research', bend: 0.12 },
  { from: 'plaza', to: 'blog', bend: -0.12 },
  // Unpaved: shortcuts across the grass, so neighbours connect directly.
  { from: 'plaza', to: 'contact', paved: false },
  { from: 'middle-place', to: 'etymon', paved: false },
  { from: 'etymon', to: 'map-of-evolution', paved: false },
  { from: 'middle-place', to: 'quizmate', paved: false },
  { from: 'quizmate', to: 'contact', paved: false },
  { from: 'busy-beer', to: 'eqoscan', paved: false },
  { from: 'eqoscan', to: 'privacy-research', paved: false },
];

// Eight words English lost, from Etymon's museum of lost words, each hidden
// where it belongs. Find them all to fill the word hoard.
const lostWords: WorldInput['lostWords'] = [
  {
    id: 'overmorrow',
    word: 'overmorrow',
    gloss: 'the day after tomorrow',
    story:
      'English once had a tidy word for the day after tomorrow, just like German übermorgen and Dutch overmorgen. It died out in the 1600s, and English never found another one-word answer.',
    first: 1500,
    died: 1650,
    place: 'middle-place',
    in: 'journal',
    at: { x: -15.4, z: 0.6 },
    hint: 'A journal never forgets what comes next.',
  },
  {
    id: 'crapulous',
    word: 'crapulous',
    gloss: 'sick or unwell from too much drinking or eating',
    story:
      'Greek kraipalē was the morning-after headache; Latin borrowed it as crāpula, drunkenness. English took crapulous in the 1500s for the bloated misery of overindulgence. Despite appearances it has nothing to do with crap, which comes from a medieval word for chaff.',
    first: 1535,
    died: 1900,
    place: 'busy-beer',
    in: 'barrels',
    at: { x: 14.6, z: 11.2 },
    hint: 'Look among the empties behind the taproom.',
  },
  {
    id: 'attercop',
    word: 'attercop',
    gloss: 'a spider; a spiteful person',
    story:
      'Ātor was poison; the second half may mean head or cup, and nobody is sure. The word lingered in northern dialects, and Tolkien gave it to Bilbo, who taunts the giant spiders of Mirkwood with ‘Attercop! Attercop!’',
    first: 1000,
    died: 1600,
    place: 'map-of-evolution',
    in: 'roots',
    at: { x: 3.4, z: -12.2 },
    hint: 'Something has spun a web among the roots of the oldest tree.',
  },
  {
    id: 'wordhord',
    word: 'wordhord',
    gloss: "a hoard of words; one's store of words and lore",
    story:
      'When Beowulf answers the coastguard of Denmark, the poet says he ‘wordhord onleac’: he unlocked his word-hoard. The Anglo-Saxons pictured speech as treasure kept in a locked chest; the Latin vocabulary arrived only in the 1500s.',
    first: 1000,
    died: 1100,
    place: 'etymon',
    in: 'bookshelf',
    at: { x: -13.6, z: -12.4 },
    hint: 'Some words are shelved where anyone can borrow them.',
  },
  {
    id: 'uhtcearu',
    word: 'uhtcearu',
    gloss: 'sorrow before dawn; care in the hours before daybreak',
    story:
      'Ūht was the dark hour before dawn; cearu was care. The compound is known from a single poem, The Wife\'s Lament in the Exeter Book, where a woman exiled from her husband lies awake with uhtceare. Every language needs a word for 4 a.m. worry. English had one, once.',
    first: 970,
    died: 1100,
    place: 'privacy-research',
    in: 'rocks',
    at: { x: 20.9, z: -12.6 },
    hint: 'The lighthouse keeper keeps watch till dawn. Check the rocks below.',
  },
  {
    id: 'ultracrepidarian',
    word: 'ultracrepidarian',
    gloss: 'someone who gives opinions on matters beyond their knowledge',
    story:
      'Pliny tells how the painter Apelles let a shoemaker correct a sandal in one of his pictures, but when the man went on to criticise the leg, retorted that a cobbler should not judge above the sandal. In 1819 William Hazlitt turned the rebuke into a word, branding the critic William Gifford an ‘ultra-crepidarian’.',
    first: 1819,
    died: 1900,
    place: 'quizmate',
    in: 'chalkboard',
    at: { x: -12.9, z: 13.3 },
    hint: 'Someone has been correcting the teacher.',
  },
  {
    id: 'emmet',
    word: 'emmet',
    gloss: 'an ant (dialect); in Cornwall, a tourist',
    story:
      'Old English ǣmete became two words: in some dialects it wore down into ant, in others it stayed emmet. Emmet survives in the West Country, and in Cornwall it is a teasing name for the tourists who swarm the beaches every summer. Like you, for instance.',
    first: 900,
    died: 1700,
    place: 'eqoscan',
    in: 'bins',
    at: { x: 15.6, z: -7.4 },
    hint: 'Follow the ants at the recycling depot.',
  },
  {
    id: 'curglaff',
    word: 'curglaff',
    gloss: 'the shock of cold water when you first plunge in',
    story:
      'A Scots word recorded in the early 1800s by John Jamieson, the great lexicographer of Scots, for the shock felt in bathing when one first plunges into cold water. Every winter sea-swimmer knows the feeling; standard English never found a word for it.',
    first: 1808,
    died: 1900,
    place: 'blog',
    in: 'rowboat',
    at: { x: 4.45, z: 21.6 },
    hint: 'Someone went for a swim off the pier. Their towel is still damp.',
  },
];

const activities: WorldInput['activities'] = [
  {
    id: 'fishing',
    kind: 'fishing',
    place: 'blog',
    at: { x: 3.5, z: 23.2 },
    name: 'Fish off the pier',
    description: 'Cast a line off the pier. Whatever bites is something I wrote.',
  },
];

// The explorer's wardrobe: one piece at every house, yours the moment you
// arrive. Wear one per slot (head, face, neck, body), in any view.
const outfits: WorldInput['outfits'] = [
  {
    id: 'cardinal-scarf',
    name: 'cardinal scarf',
    slot: 'neck',
    place: 'middle-place',
    color: '#c41e3a',
    description: 'A long knitted scarf in Wesleyan cardinal red, warm enough for a winter of writing on the porch.',
    hint: 'Someone left a scarf on the cabin porch, by the journal.',
  },
  {
    id: 'hard-hat',
    name: 'hard hat',
    slot: 'head',
    place: 'busy-beer',
    color: '#f5b82e',
    description: 'A yellow hard hat from the taproom, where the brewing gets serious. Safety first, then a pint.',
    hint: 'The taproom keeps one by the barrels for brew days.',
  },
  {
    id: 'leaf-crown',
    name: 'leaf crown',
    slot: 'head',
    place: 'map-of-evolution',
    color: '#57c15a',
    description: 'A crown of leaves and blossom woven from the ancient tree. Every leaf a different branch of the family.',
    hint: 'The oldest tree on the island sheds something to wear.',
  },
  {
    id: 'reading-glasses',
    name: 'reading glasses',
    slot: 'face',
    place: 'etymon',
    color: '#8a5a2b',
    description: 'Round tortoiseshell glasses from the library, for very small print and very old words.',
    hint: 'The library lends more than books.',
  },
  {
    id: 'sunglasses',
    name: 'sunglasses',
    slot: 'face',
    place: 'privacy-research',
    color: '#1f2a44',
    description: "The lighthouse keeper's dark glasses. The beam sees everything; now it can't see your eyes.",
    hint: 'The lighthouse beam is bright. The keeper keeps something for that.',
  },
  {
    id: 'mortarboard',
    name: 'graduation cap',
    slot: 'head',
    place: 'quizmate',
    color: '#24304a',
    description: 'A mortarboard with a golden tassel, from the schoolhouse. You passed the quiz.',
    hint: 'Pass by the schoolhouse and you might graduate.',
  },
  {
    id: 'recycling-vest',
    name: 'recycling vest',
    slot: 'body',
    place: 'eqoscan',
    color: '#3faa5b',
    description: 'A green high-visibility vest from the recycling depot, with reflective stripes. Sort responsibly.',
    hint: 'The depot crew wear something bright. Ask at the conveyor.',
  },
  {
    id: 'fishing-hat',
    name: 'fishing hat',
    slot: 'head',
    place: 'blog',
    color: '#b9a06a',
    description: 'A floppy bucket hat with a fly hooked in the band, from the end of the pier.',
    hint: 'Walk out to the end of the pier, where the anglers stand.',
  },
  {
    id: 'sailor-hat',
    name: "sailor's cap",
    slot: 'head',
    place: 'contact',
    color: '#f4f1ea',
    description: "A white sailor's cap that washed up beside the bottle. It smells of salt and good news.",
    hint: 'Something besides a bottle washed up on the quiet beach.',
  },
];

const geography: WorldInput['geography'] = {
  coast: {
    radius: 23.5,
    ripples: [
      { freq: 3, amp: 1.4, phase: 0.7 },
      { freq: 5, amp: 0.9, phase: 2.3 },
      { freq: 8, amp: 0.45, phase: 1.1 },
    ],
  },
  headlands: [{ toward: 'privacy-research', reach: 7.5, spread: 0.17, rocks: 0.24 }],
  hills: [{ at: 'map-of-evolution', height: 1.1, spread: 5.5 }],
  pier: { x: 4, start: 16.9, end: 28, width: 1.9, deck: 0.82 },
  // New land to the east: room for the railway loop, the quay and a spare plot.
  shores: [{ toward: { x: 1, z: 0.1 }, reach: 13, spread: 0.45 }],
  railway: { center: { x: 24, z: 1.5 }, rx: 6.5, rz: 9, square: 3.2, bed: 1.3, station: 0.25 },
  quay: { x0: 24, z0: 14.2, x1: 30.5, z1: 19.8, deck: 0.7, bus: { x: 27.4, z: 17.2 }, faces: Math.PI / 2 },
  plots: [{ id: 'workshop', at: { x: 24, z: 1.5 }, clearing: 3.5 }],
  spawn: { x: 0, z: 7.5 },
};

/** Build and validate the world. Throws a readable list if anything's off. */
export function buildWorld(posts: Post[]): World {
  return parseWorld({
    $schema: `${SITE}/world.schema.json`,
    version: 1,
    site: { url: SITE, title: `${person.name} · ${person.role}` },
    person: { name: person.name, role: person.role, intro: person.intro, about: '/about', github: person.github },
    projects: projects.map((p) => ({
      slug: p.slug,
      name: p.name,
      headline: p.headline,
      blurb: p.blurb,
      platforms: p.platforms,
      color: p.hex,
      body: p.body,
      tags: p.tags,
      links: p.links,
      href: `/work/${p.slug}`,
    })),
    posts: [...posts].sort((a, b) => b.date.localeCompare(a.date)),
    places,
    routes,
    lostWords,
    activities,
    outfits,
    geography,
  } satisfies WorldInput);
}
