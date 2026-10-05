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
  const inside = interiors[slug];
  return { id: slug, kind: 'project', project: slug, name: p.name, blurb: p.blurb, href: `/work/${slug}`, color: p.hex, ...place, ...(inside ? { interior: inside } : {}) };
}

// ---------- Inside ----------
// Every building has a room you can walk into, with a few things to look at
// and an islander or two to talk to. The islanders are made up; what they say
// about the work is only ever what the work's own page already says, and the
// links go to the real thing. Rooms are in their own units: (0, 0) is the
// middle of the floor, the door is in the middle of the front (+z) wall.

type InteriorInput = NonNullable<PlaceInput['interior']>;
const APP_STORE = (slug: string) => projects.find((p) => p.slug === slug)?.links.find((l) => l.kind === 'appstore')?.href ?? `/work/${slug}`;
const see = (slug: string, label = `See ${projects.find((p) => p.slug === slug)?.name ?? 'it'}`) => ({ label, href: `/work/${slug}` });
const ABOUT = { label: 'About Ambrose', href: '/about' };

const interiors: Record<string, InteriorInput> = {
  'middle-place': {
    size: { w: 9, d: 7 },
    description:
      'Inside, the cabin is all warm wood and lamplight. A fire crackles in the stone hearth, a kettle hums on its hook, and a writing desk sits under the window, angled toward the sea.',
    things: [
      {
        id: 'desk',
        names: ['writing desk', 'desk', 'journal', 'pencil'],
        prop: 'desk',
        at: { x: 2.8, z: -1.2 },
        description:
          'A writing desk under the window, with a pencil worn down to a stub and a teal journal lying open. It is the kind of journal that answers back: it remembers the people, the patterns, and where you left off.',
        link: see('middle-place'),
      },
      {
        id: 'hearth',
        names: ['hearth', 'fire', 'fireplace', 'kettle'],
        prop: 'hearth',
        at: { x: -2.4, z: -2.9 },
        description: "A stone hearth with a kettle on the hook. The fire pops now and then, as if it agrees with something you didn't say out loud.",
      },
      {
        id: 'picture',
        names: ['picture', 'frame', 'painting', 'stitching'],
        prop: 'frame',
        at: { x: 0.6, z: -2.9 },
        description:
          'A framed picture of a phone screen: one long, continuous chat with a journal, picking up exactly where it left off. Someone has stitched a line underneath: never start the story over.',
        link: { label: 'Visit middleplace.app', href: 'https://middleplace.app' },
      },
    ],
    people: [
      {
        id: 'juniper',
        name: 'Juniper',
        role: 'the caretaker',
        aliases: ['caretaker'],
        looks: 'A round little islander in a mustard scarf, poking the fire with great seriousness.',
        color: '#e9b949',
        at: { x: -1.4, z: 0.2 },
        greeting: "Oh, hello! Come in, come in, mind the kettle. I look after the cabin. Ask me anything, I've had a lot of quiet to think.",
        topics: [
          {
            id: 'journal',
            names: ['the journal', 'journal', 'middle place', 'app'],
            reply: "That's middle place: a journal that answers you. It remembers the people, the patterns, and where you left off, so you never start the story over.",
            link: see('middle-place'),
          },
          {
            id: 'privacy',
            names: ['privacy', 'secrets', 'data', 'icloud'],
            reply: "Everything stays on your device and in your own iCloud. No accounts, no tracking, nothing sold. I keep my own secrets in the woodpile, but that's a different system.",
            link: see('middle-place', 'Read more'),
          },
          {
            id: 'get',
            names: ['the App Store', 'app store', 'download', 'get it', 'getting it'],
            reply: "It's on the App Store, for iPhone, iPad and Mac. Take it somewhere cozy.",
            link: { label: 'Download on the App Store', href: APP_STORE('middle-place') },
          },
          {
            id: 'fire',
            names: ['the fire', 'fire', 'kettle', 'tea'],
            reply: "Oak, mostly. It's been going since I got here, and I'm not about to be the one who lets it out. Tea's nearly ready, if you're staying.",
          },
        ],
        farewell: "Mind the step on your way out. Come back when you've got something to write down.",
      },
    ],
  },
  'busy-beer': {
    size: { w: 9, d: 7 },
    description:
      'It is warm in here, and loud in a friendly way. A long counter runs down one side under a row of brass taps, a chalkboard menu hangs on the back wall, and the whole place smells faintly of hops and toast.',
    things: [
      {
        id: 'counter',
        names: ['counter', 'taps', 'tap', 'bar'],
        prop: 'counter',
        at: { x: 2.7, z: -1.3 },
        description: 'A long oak counter with a row of brass taps, polished to a shine. One handle has been carved into the shape of a tiny phone, pointed at the menu.',
      },
      {
        id: 'menu',
        names: ['menu', 'chalkboard', 'board', 'drinks'],
        prop: 'board',
        at: { x: -1.2, z: -2.9 },
        description:
          'A chalkboard menu of every drink on tap, each with a score chalked beside it, ranked from most to least likely to make you happy. You, specifically.',
        link: see('busy-beer'),
      },
      {
        id: 'chart',
        names: ['chart', 'palate', 'poster', 'flavor chart'],
        prop: 'frame',
        at: { x: -3.5, z: -2.9 },
        description: "A hand-drawn chart pinned up by the stools: someone's palate, mapped across flavor axes, with a dot for every drink they've rated.",
        link: see('busy-beer'),
      },
    ],
    people: [
      {
        id: 'otto',
        name: 'Otto',
        role: 'the barkeep',
        aliases: ['barkeep', 'bartender', 'barman'],
        looks: 'A broad, cheerful islander in a brown apron, drying the same mug for the fourth time.',
        color: '#9a6232',
        at: { x: 0.9, z: 0.3 },
        greeting: "Evening! Or morning. It's always a good time in here. What can I get you? Mostly I get people talking.",
        topics: [
          {
            id: 'app',
            names: ['busy beer', 'the app', 'app', 'taste'],
            reply: 'busy beer is an AI taste companion for everything you drink. Rate what you try, and it maps your palate across flavor axes. Puts me out of a job, a little.',
            link: see('busy-beer'),
          },
          {
            id: 'scanner',
            names: ['the menu scanner', 'menu scanner', 'scanner', 'menu'],
            reply: "Point the menu scanner at any drinks list and it shows what's actually worth ordering, ranked against your own taste. No more pointing at the third one down and hoping.",
            link: see('busy-beer'),
          },
          {
            id: 'get',
            names: ['the App Store', 'app store', 'download', 'get it', 'getting it'],
            reply: "It's on the App Store, for iPhone. Cheers to that.",
            link: { label: 'Download on the App Store', href: APP_STORE('busy-beer') },
          },
          {
            id: 'sign',
            names: ['the sign', 'sign', 'motto'],
            reply: "Know what you'll love before you order. I painted it myself. Took three tries to fit the apostrophe.",
          },
        ],
        farewell: "Mind how you go. The stools will be here.",
      },
    ],
  },
  etymon: {
    size: { w: 10, d: 7 },
    description:
      'Inside it is hushed and smells of old paper. Shelves climb to the ceiling, a great map hangs on the back wall with a red thread pinned across it, and a few loose letters drift lazily under the reading lamps.',
    things: [
      {
        id: 'shelves',
        names: ['shelves', 'bookshelf', 'books', 'shelf'],
        prop: 'bookshelf',
        at: { x: -3.4, z: -2.9 },
        description: "Floor-to-ceiling dictionaries, most of them very old. One shelf is labeled Words We Lost, and it's mostly empty. They have a habit of wandering off.",
        link: { label: 'Explore Etymon', href: 'https://avan36.github.io/Etymology/' },
      },
      {
        id: 'map',
        names: ['map', 'wall map', 'thread', 'red thread'],
        prop: 'board',
        at: { x: 0.2, z: -2.9 },
        description: 'A wall map with a red thread pinned from city to city: one word followed stage by stage, from its ancient root all the way to the English you speak today.',
        link: see('etymon'),
      },
      {
        id: 'catalogue',
        names: ['card catalogue', 'catalogue', 'catalog', 'drawers', 'cards'],
        prop: 'cabinet',
        at: { x: 3.4, z: -2.9 },
        description: 'Hundreds of tiny drawers, one for every root. You slide one open: a single root, branching into dozens of modern words like a family tree.',
        link: see('etymon'),
      },
    ],
    people: [
      {
        id: 'mabel',
        name: 'Mabel',
        role: 'the librarian',
        aliases: ['librarian'],
        looks: 'A neat islander in a red cardigan, with spectacles on a chain and a pencil behind each ear.',
        color: '#c0392b',
        at: { x: -1.8, z: 0.2 },
        greeting: "Welcome. Voices low, please, the words are resting. I'm the librarian. Is there something you'd like to look up?",
        topics: [
          {
            id: 'etymon',
            names: ['etymon', 'the library', 'library'],
            reply: "Etymon is an interactive, animated history of English: where words came from, how they changed on the way, how popular they've been, and the words we lost.",
            link: see('etymon'),
          },
          {
            id: 'river',
            names: ['the river', 'river', 'history'],
            reply: 'Fifteen hundred years of vocabulary, flowing as one river, with a tributary for each source language. I could watch it for hours. I have.',
            link: { label: 'Explore Etymon', href: 'https://avan36.github.io/Etymology/' },
          },
          {
            id: 'lost',
            names: ['lost words', 'lost', 'words', 'museum'],
            reply: "There's a whole museum of words English dropped, like wanhope and overmorrow. A few of them got loose on this island. If you find one, keep it in your word hoard.",
            link: see('etymon'),
          },
          {
            id: 'missing',
            names: ['missing words', 'missing', 'wiktionary'],
            reply: "If a word isn't on my shelves, it gets looked up live on Wiktionary, in about 50 languages, and sent off on the same journey. Very modern of us.",
            link: see('etymon'),
          },
        ],
        farewell: 'Come back any time. And return your words on time.',
      },
      {
        id: 'pip',
        name: 'Pip',
        role: 'a reader',
        aliases: ['reader', 'scholar'],
        looks: 'A small islander in a lavender scarf, buried in a dictionary bigger than they are.',
        color: '#9b87d6',
        at: { x: 2.0, z: 0.6 },
        greeting: "Oh! Sorry, I was in the middle of a word. Did you know words travel? Further than you'd think.",
        topics: [
          {
            id: 'disaster',
            names: ['disaster', 'journeys', 'travel'],
            reply: 'Take disaster. It came about 4,500 km to get here, from Proto-Indo-European through Ancient Greek, Italian and Middle French, then into English. Etymon draws the whole trip on a map.',
            link: see('etymon'),
          },
          {
            id: 'name',
            names: ['names', 'the name', 'ambrose', 'his name'],
            reply: 'The person who made this island has a name with a story too. Ambrose goes back to Greek ámbrotos, immortal, and a vannier is a basket-maker. So, roughly: an immortal basket-maker.',
            link: ABOUT,
          },
        ],
        farewell: "Bye! Mind the drifting letters. They're Old English, and very old.",
      },
    ],
  },
  'privacy-research': {
    size: { w: 7, d: 6 },
    description:
      'You climb the spiral stairs into the lamp room. The great lens turns in the middle of it all, throwing light out over the water, and the wind hums against the glass.',
    things: [
      {
        id: 'lens',
        names: ['lens', 'lamp', 'light', 'beam'],
        prop: 'lens',
        at: { x: 0.4, z: -1.2 },
        description: 'The great glass lens, ringed like an onion. It turns slowly, and every ship it passes gets one honest look.',
      },
      {
        id: 'logbook',
        names: ['logbook', 'log', 'desk', 'book'],
        prop: 'desk',
        at: { x: -2.1, z: 0.8 },
        description:
          "The keeper's logbook. Column after column of websites, more than 11,000 of them, each with a tick or a cross: did it honor a visitor's request not to sell their data?",
        link: see('privacy-research', 'See the research'),
      },
      {
        id: 'cat',
        names: ['cat', 'ginger cat', 'optmeowt', 'collar'],
        prop: 'cat',
        at: { x: 2.2, z: 1.1 },
        description:
          "A ginger cat curled up on a coil of rope. The tag on its collar reads OptMeowt, after the browser extension that tells sites not to sell your data. It takes the job very seriously.",
        link: { label: 'OptMeowt on GitHub', href: 'https://github.com/privacy-tech-lab/gpc-optmeowt' },
      },
    ],
    people: [
      {
        id: 'morwenna',
        name: 'Morwenna',
        role: 'the lighthouse keeper',
        aliases: ['keeper', 'lighthouse keeper'],
        looks: 'A weathered islander in a navy coat, with a telescope under one arm and salt in her eyebrows.',
        color: '#2c4a8a',
        at: { x: -1.9, z: -1.3 },
        greeting: 'Ahoy. Up you come. I keep the light, and the light keeps an eye on things. What can I tell you?',
        topics: [
          {
            id: 'light',
            names: ['the light', 'light', 'beam', 'ships'],
            reply: "Every ship that passes, the beam checks whether it's flying the right flag. The crawler did the same for the web: it measured Global Privacy Control compliance across 11,000+ websites.",
            link: see('privacy-research', 'See the research'),
          },
          {
            id: 'optmeowt',
            names: ['optmeowt', 'the extension', 'extension'],
            reply: 'OptMeowt is a browser extension that automatically tells sites not to sell your data. The cat is named after it, not the other way round.',
            link: see('privacy-research', 'See the research'),
          },
          {
            id: 'results',
            names: ['the results', 'results', 'dashboard', 'findings'],
            reply: 'The findings live in an interactive public dashboard. I check it more often than the weather.',
            link: { label: 'See the live results', href: 'https://gpc-web-ui.vercel.app' },
          },
          {
            id: 'lab',
            names: ['the lab', 'privacy tech lab', 'research', 'lab'],
            reply: "Ambrose contributed to the Privacy Tech Lab's work on Global Privacy Control, research supported by the National Science Foundation. I just keep the lamp lit.",
            link: see('privacy-research', 'See the research'),
          },
        ],
        farewell: "Fair winds. Watch the third stair, it's always been a bit loose.",
      },
    ],
  },
  quizmate: {
    size: { w: 9, d: 7 },
    description:
      "One room, rows of little desks, and the particular quiet of a class that's about to start. The chalkboard is full, the globe is slightly crooked, and there's a gold star stuck to the ceiling, somehow.",
    things: [
      {
        id: 'chalkboard',
        names: ['chalkboard', 'board', 'blackboard', 'lesson'],
        prop: 'board',
        at: { x: 0.8, z: -2.9 },
        description: "Today's lesson and Friday's quiz, in tidy chalk. Every answer has a little note beside it: what was right, and what to look at again.",
        link: see('quizmate'),
      },
      {
        id: 'desks',
        names: ['desks', 'desk', 'tablets', 'tablet'],
        prop: 'desk',
        at: { x: -2.6, z: -0.4 },
        description: 'Rows of little desks, each with a tablet propped up and open to a quiz. Practice first, then take on the whole class.',
        link: see('quizmate'),
      },
      {
        id: 'globe',
        names: ['globe', 'world'],
        prop: 'globe',
        at: { x: 3.1, z: -1.6 },
        description: "A globe on a wooden stand. It spins a little too freely, and someone has drawn this island on it in pencil, roughly where it isn't.",
      },
    ],
    people: [
      {
        id: 'hazel',
        name: 'Ms Hazel',
        role: 'the teacher',
        aliases: ['hazel', 'teacher', 'miss hazel'],
        looks: "A tall islander in a pink cardigan, holding a piece of chalk like a conductor's baton.",
        color: '#e58fb5',
        at: { x: -0.7, z: -1.2 },
        greeting: "Ah, a new face! Take any seat. We were just about to have a quiz. Don't worry, everyone gets feedback here.",
        topics: [
          {
            id: 'quizmate',
            names: ['quizmate', 'the app', 'app', 'lessons'],
            reply: 'QuizMate is a learning app for the classroom. Teachers build lessons and quizzes in minutes; students practice, compete with classmates, and get feedback the moment they need it.',
            link: see('quizmate'),
          },
          {
            id: 'feedback',
            names: ['feedback', 'the quiz', 'quiz', 'friday'],
            reply: "The moment you need it, not three weeks later. That's the whole idea.",
            link: see('quizmate'),
          },
          {
            id: 'get',
            names: ['the App Store', 'app store', 'download', 'get it', 'getting it'],
            reply: "It's on the App Store, for iPhone and iPad. Tell your teacher I sent you.",
            link: { label: 'Download on the App Store', href: APP_STORE('quizmate') },
          },
        ],
        farewell: "Off you go. Don't forget your homework. There isn't any, but don't forget it.",
      },
      {
        id: 'tobias',
        name: 'Tobias',
        role: 'a student',
        aliases: ['student', 'pupil', 'kid'],
        looks: 'A small islander in a yellow scarf, sitting very straight in the front row, practicing.',
        color: '#f2c14e',
        at: { x: 2.0, z: 0.8 },
        greeting: "Shh, I'm practicing. I'm top of the class. Well, second. Well, I'm on the list.",
        topics: [
          {
            id: 'competing',
            names: ['competing', 'the class', 'winning', 'practice'],
            reply: 'You practice, then you compete with your classmates. I like the competing part. I am getting better at the practicing part.',
            link: see('quizmate'),
          },
          {
            id: 'learning',
            names: ['learning', 'technology', 'school'],
            reply: 'The person who made this island did fieldwork with the Assessment Lab, studying how students learn alongside new technology. I am a student. I am learning alongside it right now.',
            link: ABOUT,
          },
        ],
        farewell: "Bye! If you see the bell rope, don't.",
      },
    ],
  },
  eqoscan: {
    size: { w: 9, d: 7 },
    description:
      'The depot is cool and echoey, stacked high with bales of flattened cardboard. A handheld scanner hangs by the sorting bench, and a blue ribbon is pinned proudly to the back wall.',
    things: [
      {
        id: 'scanner',
        names: ['scanner', 'handheld scanner', 'bench', 'sorting bench'],
        prop: 'scanner',
        at: { x: 2.5, z: -1.2 },
        description: 'A handheld scanner on a hook by the sorting bench. Point it at anything on the shelf and it shows you its packaging footprint. Most of it was more packaging than product.',
        link: see('eqoscan'),
      },
      {
        id: 'ribbon',
        names: ['ribbon', 'blue ribbon', 'prize', 'award'],
        prop: 'frame',
        at: { x: -0.6, z: -2.9 },
        description: 'A blue ribbon pinned to the wall: WesHack winner. It has been dusted very recently. Possibly this morning. Possibly twice.',
        link: see('eqoscan'),
      },
      {
        id: 'bales',
        names: ['bales', 'cardboard', 'crates', 'boxes'],
        prop: 'crates',
        at: { x: -3.0, z: -1.0 },
        description: 'Bales of flattened cardboard, tied up with string and stacked to the rafters, waiting to become something else.',
      },
    ],
    people: [
      {
        id: 'rosa',
        name: 'Rosa',
        role: 'the sorter',
        aliases: ['sorter'],
        looks: 'A brisk islander in an orange hi-vis scarf, with a clipboard and a pencil she keeps losing behind her ear.',
        color: '#ef8a3c',
        at: { x: 0.3, z: 0.4 },
        greeting: "Hi there! Watch your feet, the belt's running. I sort everything that comes through here. Usually twice.",
        topics: [
          {
            id: 'eqoscan',
            names: ['eqoscan', 'the app', 'app', 'scanning'],
            reply: 'eQoScan is an iOS app that helps shoppers understand and cut down on the waste they bring home. Scan a product and see its packaging footprint.',
            link: see('eqoscan'),
          },
          {
            id: 'hackathon',
            names: ['the hackathon', 'hackathon', 'weshack', 'ribbon'],
            reply: "It won WesHack! That's the ribbon. I'd frame it, but frames come in so much packaging.",
            link: see('eqoscan'),
          },
          {
            id: 'source',
            names: ['the code', 'code', 'source', 'github'],
            reply: "The source is on GitHub, if you like seeing how things are put together. I do. It's half of why I sort things.",
            link: { label: 'View source on GitHub', href: 'https://github.com/avan36/eQoScan' },
          },
          {
            id: 'packaging',
            names: ['packaging', 'waste', 'recycling'],
            reply: 'Most of what comes down that belt was more packaging than product. Breaks my heart a little, every box.',
          },
        ],
        farewell: 'Take care! Recycle your goodbyes.',
      },
    ],
  },
};

// Not every building is work. The mall over Tower Bridge is somewhere from
// Ambrose's own life: no page to open, just a place to walk round. Five Guys is
// as it is in real life (fresh-cut fries, free toppings, the extra scoop in the
// bag); the islanders are made up, and only say what's true of any visit.
const westfield: InteriorInput = {
  size: { w: 13, d: 9 },
  description:
    "Inside, it's bright and echoey under the glass roof. Shopfronts glow all along the back, an escalator hums up to the next floor, and over to one side, behind a counter in red and white tiles, is Five Guys.",
  things: [
    {
      id: 'five-guys',
      names: ['Five Guys', 'five guys', 'counter', 'burgers', 'burger', 'fries', 'grill', 'menu'],
      prop: 'grill',
      at: { x: -4, z: 0.4 },
      description:
        'Five Guys: a counter in red and white tiles, a menu board, and a grill hissing away behind it. Burgers, fries and milkshakes, and when your fries come, there is always an extra scoop tipped loose into the bag.',
    },
    {
      id: 'potatoes',
      names: ['sacks of potatoes', 'potatoes', 'sacks', 'potato', 'sack'],
      prop: 'sacks',
      at: { x: -5.4, z: 2.6 },
      description: 'Sacks of potatoes, stacked up by the counter. They come in as potatoes and go out as fries, which is the whole trick.',
    },
    {
      id: 'shops',
      names: ['shops', 'shopfronts', 'shop windows', 'shop', 'windows'],
      prop: 'shopfront',
      at: { x: -3.4, z: -3.9 },
      description: 'A row of shopfronts with their lights on and their doors wide open, which is how a whole afternoon disappears.',
    },
    {
      id: 'directory',
      names: ['map', 'directory', 'you are here', 'red dot', 'board'],
      prop: 'board',
      at: { x: 0.9, z: -3.9 },
      description: 'A map of the whole centre, floor by floor, with a red dot that says YOU ARE HERE. Somehow that is always the hardest thing on it to find.',
    },
    {
      id: 'escalator',
      names: ['escalator', 'escalators', 'moving stairs', 'stairs', 'upstairs'],
      prop: 'escalator',
      at: { x: 4.3, z: -3.4 },
      description: "An escalator, humming up to the next floor. It's very hard not to try running up the down one.",
    },
  ],
  people: [
    {
      id: 'clem',
      name: 'Clem',
      role: 'the fry cook',
      aliases: ['cook', 'fry cook', 'chef'],
      looks: 'A cheerful islander in a red cap and a white apron, with a fry basket in one hand.',
      color: '#d22630',
      at: { x: -1.7, z: 0.7 },
      greeting: 'Hiya! Burgers, fries, shakes. That is the menu, and it is the whole of my expertise. Ask away.',
      topics: [
        {
          id: 'burgers',
          names: ['the burgers', 'burgers', 'burger', 'toppings'],
          reply: 'Two patties as standard, and the toppings are free, so most people have all of them. Grilled while you watch, wrapped in foil, handed over hot.',
        },
        {
          id: 'fries',
          names: ['the fries', 'fries', 'chips', 'potatoes', 'cajun'],
          reply: "Cut from those sacks of potatoes, fried, and served regular or Cajun. The cup's full, then I tip another scoop into the bag. Everybody knows. Nobody says anything.",
        },
        {
          id: 'shakes',
          names: ['milkshakes', 'shakes', 'milkshake', 'mix-ins'],
          reply: "Milkshakes, with as many mix-ins as you can talk me into. I've seen people ask for all of them. I've seen people regret it. Same people.",
        },
      ],
      farewell: 'Mind the escalator on your way out. Come back hungry.',
    },
    {
      id: 'nell',
      name: 'Nell',
      role: 'a shopper',
      aliases: ['shopper'],
      looks: 'A brisk islander in a green coat, with more shopping bags than hands.',
      color: '#2f8f6b',
      at: { x: 2.4, z: 1 },
      greeting: "Oh, hello! Don't mind the bags. I only popped in for one thing.",
      topics: [
        {
          id: 'shops',
          names: ['the shops', 'shops', 'shopping', 'bags'],
          reply: "I came in for one thing, and I still haven't found it. I have found everything else.",
        },
        {
          id: 'bridge',
          names: ['the bridge', 'tower bridge', 'bridge', 'towers'],
          reply: 'Tower Bridge! The middle of it lifts to let tall ships through. The real one has been doing that since 1894, and it still stops the traffic every time.',
        },
        {
          id: 'time',
          names: ['the time', 'time', 'afternoon', 'clock'],
          reply: "Time does something funny in here. You come in after lunch, and somehow it's dark when you leave.",
        },
      ],
      farewell: 'Bye! If you find the one thing I came in for, it is yours.',
    },
  ],
};

// A quiet house on Little London, with a brass plate that only says ROOMS.
// Inside: two armchairs facing each other, tissues within reach, a clock only
// one chair can see. The islander who keeps it is made up, and says only
// gentle, ordinary things.
const quietRoom: InteriorInput = {
  size: { w: 9, d: 7 },
  description:
    "Inside it's warm and hushed. Two armchairs face each other across a small rug, a lamp makes a soft pool of light, and the noise of the street stops at the door. Nobody is in a hurry in here.",
  things: [
    {
      id: 'armchairs',
      names: ['armchairs', 'armchair', 'chairs', 'chair', 'rug', 'notepad'],
      prop: 'armchairs',
      at: { x: 0.6, z: -0.6 },
      description:
        'Two deep armchairs, facing each other across a small rug: close enough to talk quietly, far enough apart to breathe. A notepad and a pen rest on the arm of the far one, closed.',
    },
    {
      id: 'tissues',
      names: ['box of tissues', 'tissues', 'tissue', 'side table', 'table', 'lamp'],
      prop: 'sidetable',
      at: { x: -2.3, z: 0.6 },
      description: 'A little side table by the near armchair, with a lamp on it and a box of tissues, one already pulled up, ready. Nobody will mind if you take one.',
    },
    {
      id: 'clock',
      names: ['clock', 'little clock', 'shelf'],
      prop: 'clock',
      at: { x: -2.2, z: -2.0 },
      description: 'A small clock on a shelf behind the near armchair, turned so that only the far armchair can see it. It ticks so softly you have to listen for it.',
    },
    {
      id: 'painting',
      names: ['painting', 'picture', 'frame', 'calm sea'],
      prop: 'frame',
      at: { x: 1.6, z: -2.9 },
      description: 'A painting of a calm sea at dusk: a long horizon, a low sun, and nothing else. It is very easy to look at.',
    },
    {
      id: 'plant',
      names: ['plant', 'pot plant', 'leaves', 'pot'],
      prop: 'plant',
      at: { x: 3.4, z: -2.3 },
      description: 'A leafy plant in a clay pot, turned now and then so it grows straight. It is doing well. Most things do, given time and a bit of light.',
    },
  ],
  people: [
    {
      id: 'wren',
      name: 'Wren',
      role: 'the listener',
      aliases: ['listener'],
      looks: 'A calm islander in a soft sage cardigan, with a notepad they hardly ever write in.',
      color: '#8fae9b',
      at: { x: 2.9, z: 0.7 },
      greeting: 'Hello. Come in, and sit wherever feels right. How are you doing, really?',
      topics: [
        {
          id: 'how',
          names: ['how I am', 'how i am', 'how i feel', 'feelings', 'me', 'myself'],
          reply: "Take your time. There's no right answer here, and no wrong one. Whatever you bring in with you is welcome.",
        },
        {
          id: 'quiet',
          names: ['the quiet', 'quiet', 'silence'],
          reply: "We don't have to fill it. Sometimes the quiet does half the work.",
        },
        {
          id: 'clock',
          names: ['the clock', 'clock', 'time'],
          reply: "I keep an eye on it, so you don't have to. That's why it sits where it does.",
        },
        {
          id: 'tissues',
          names: ['the tissues', 'tissues', 'crying'],
          reply: "They're there for anyone. Nobody has ever needed to say sorry for using one.",
        },
      ],
      farewell: 'We can stop here for today. Be gentle with yourself on the way out.',
    },
  ],
};

// Not everything is work, or even real. Out past Boardwalk Isle, through a
// gate that only opens for the right words, stands a glass tower for a company
// that doesn't exist. Its one islander speaks only in office jargon. Nothing
// here is about anyone real: it's a joke about the words, gently told.
const tower: InteriorInput = {
  size: { w: 11, d: 8 },
  description:
    'The lobby is all glass and pale stone, three floors high, and very quiet in the way only a lot of money is quiet. A reception desk curves round one side, a living wall drips politely behind it, and somewhere a fountain is making a point.',
  things: [
    {
      id: 'kombucha',
      names: ['kombucha tap', 'kombucha', 'tap', 'reception', 'reception desk', 'desk'],
      prop: 'counter',
      at: { x: 3.4, z: -1.4 },
      description: 'The reception desk, with a kombucha tap where a bell would be. Three flavours: Ginger, Lemongrass and Q3. Nobody knows what Q3 tastes like. Nobody has asked.',
    },
    {
      id: 'ping-pong',
      names: ['ping-pong table', 'ping-pong', 'ping pong', 'table tennis', 'table', 'paddles'],
      prop: 'pingpong',
      at: { x: -2.6, z: 0.6 },
      description: 'A ping-pong table in perfect condition. The net is taut, the paddles are still in their wrapper, and the ball has never once been hit. It is mostly there to be in photos.',
    },
    {
      id: 'poster',
      names: ['poster', 'motivational poster', 'rowboat', 'teamwork'],
      prop: 'frame',
      at: { x: -2.4, z: -3.4 },
      description: 'A framed poster of a single rowboat on a misty lake at dawn. Underneath, in thin capitals: TEAMWORK. It is a lot to ask of one rowboat.',
    },
    {
      id: 'lanyards',
      names: ['lanyards', 'lanyard', 'badges', 'badge', 'visitor badges', 'hooks'],
      prop: 'board',
      at: { x: 1.4, z: -3.4 },
      description: 'A rack of visitor lanyards on little brass hooks, each with a badge that says HELLO, MY ROLE IS. Yours is already printed. It says GUEST, in a very encouraging font.',
    },
  ],
  people: [
    {
      id: 'skye',
      name: 'Skye',
      role: 'the Head of Vibes',
      aliases: ['head of vibes', 'vibes', 'greeter', 'receptionist'],
      looks: 'A bright islander in a fleece vest over a fleece vest, with a lanyard, a headset and a smile that has been through a workshop.',
      color: '#4f7ea8',
      at: { x: 0.4, z: 0.2 },
      greeting: "Welcome, welcome! Love that you're here. I'm Head of Vibes, so I'm basically the North Star for how this lobby feels. What can I unblock for you?",
      topics: [
        {
          id: 'tower',
          names: ['the tower', 'tower', 'building', 'skyscraper', 'weather'],
          reply: "The tower? It's our flagship. Very tall, very glass, rounded at the top so the clouds feel included. It has its own weather, which we see as a strength.",
        },
        {
          id: 'job',
          names: ['your job', 'job', 'vibes', 'head of vibes', 'work'],
          reply: "Great question. At a high level, I own the vibes end to end. I align on them, I double-click on them, and at the end of the day I make sure they're scalable.",
        },
        {
          id: 'kombucha',
          names: ['the kombucha', 'kombucha', 'drinks', 'q3'],
          reply: "The kombucha is a big part of our culture. Q3 is our most forward-looking flavour. I'd love to circle back with tasting notes once we have bandwidth.",
        },
      ],
      farewell: "Amazing. Let's touch base soon. Mind the revolving door, it's very agile.",
    },
  ],
};

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
      {
        id: 'portal',
        names: ['portal', 'ring of light', 'ring', 'light'],
        description: 'A ring of violet light, a little taller than you, hanging just above the cobbles. It hums, very quietly. Through it the plaza looks the same and completely different: carved out of low hills in one glance, drawn in chunky pixels in the next.',
      },
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
      'A timber-framed taproom with an arched door, string lights sagging between two poles, and a sign that swings whenever the breeze picks up. Out front, mugs sit on a barrel table between a pair of stools. Further east, a little railway runs round to a station, and below it a stone quay where Tower Bridge sets off for Little London.',
    scenery: [
      { id: 'barrels', names: ['barrels', 'barrel', 'casks', 'kegs'], description: 'Oak barrels stacked against the wall, most of them empty.' },
      { id: 'sign', names: ['sign', 'swinging sign'], description: 'It reads: "Know what you\'ll love before you order."' },
      { id: 'mugs', names: ['mugs', 'mug', 'table', 'stools'], description: 'Two mugs, one full, one empty. Somebody already knows what they like.' },
      { id: 'lights', names: ['lights', 'string lights', 'bulbs'], description: 'Warm little bulbs on a sagging wire. They hum faintly.' },
      { id: 'train', names: ['train', 'caltrain', 'railway', 'rails', 'tracks', 'station', 'platform', 'carriages'], description: "Out past the taproom, a little railway loops round the east end of the island. The train is a Caltrain: silver, two decks high, with a red nose at each end and its name painted down the sides. It goes round and round the loop all day and well into the night, stopping at the platform for a moment every lap. Only in the small hours, between one and five, does it rest there with its doors open." },
      { id: 'quay', names: ['quay', 'crates', 'bus stop sign', 'stone quay'], description: "Down by the water, a stone quay with bollards along its edge, a couple of crates waiting to go somewhere, and a bus stop sign with no bus. Tower Bridge runs east from the end of it, out to Little London." },
      { id: 'bus', names: ['bus', 'london bus', 'double-decker', 'double decker', 'red bus'], description: "Over the water on Little London, a red London double-decker goes round and round the islet on a little road of its own. It used to wait here on the quay, facing Tower Bridge, thinking about it. In the end it went." },
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
    aliases: ['lighthouse', 'tower', 'light', 'beam', 'foss hill'],
    description:
      'A striped lighthouse on top of Foss Hill, the rocky headland at the island\'s north-east corner. Big white letters stand on the hillside below it, spelling FOSS HILL, and a small pink, purple and blue flag waves beside the tower. Its beam sweeps slowly over the water, picking out every passing ship, and a weather vane creaks on the top. Far off to the north, a city skyline sits on the horizon.',
    scenery: [
      { id: 'rocks', names: ['rocks', 'rock', 'cliff', 'headland'], description: 'Dark rocks at the foot of the tower, wet with spray. There are cracks you could slip a hand into.' },
      { id: 'foss-hill', names: ['foss hill', 'hill', 'hillside', 'letters', 'sign'], description: 'FOSS HILL, in letters taller than you, standing in a row on the slope below the lighthouse and facing the island. You can read them from most of the island.' },
      { id: 'flag', names: ['flag', 'small flag', 'pole', 'flagpole'], description: 'A small pink, purple and blue flag on a short pole, waving in the sea wind.' },
      { id: 'beam', names: ['beam', 'light', 'lamp'], description: 'The beam passes over you, then over 11,000 ships, one at a time. It notes which ones are flying the right flag.' },
      { id: 'vane', names: ['vane', 'weather vane', 'weathervane'], description: 'The weather vane points wherever the wind says. Today, out to sea.' },
      { id: 'skyline', names: ['skyline', 'city', 'skyscrapers', 'horizon'], description: "Far across the water to the north there's a city, or two cities that have run into each other. From the west: a big wheel, a clock tower, a glass shard and a building shaped like a bullet; then a slim pyramid, a tall rounded tower and a crowd of glass blocks. After dark their windows light up one by one." },
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
    id: 'workshop',
    kind: 'colophon',
    archetype: 'workshop',
    name: 'How it was built',
    title: 'The workshop',
    blurb: 'Where the island was made, and how.',
    href: '/colophon',
    color: '#d97757',
    at: { x: 24, z: 1.5 },
    footprint: 2.2,
    clearing: 3.5,
    aliases: ['workshop', 'work shed', 'colophon', 'how it was built', 'making of', 'behind the scenes'],
    description:
      "A timber workshop inside the railway loop, with a big window on the front and the door propped open. Out front, a workbench stands between two sawhorses, covered in blueprints and offcuts. Through the window a monitor glows, a cursor blinking on its screen. This is where the island was made, and the notes on how are pinned up inside.",
    scenery: [
      { id: 'workbench', names: ['workbench', 'bench', 'tools', 'vice'], description: 'A heavy bench, scarred and pencil-marked, with a vice at one end. Half a lighthouse is clamped in it, waiting for its stripes.' },
      { id: 'blueprints', names: ['blueprints', 'blueprint', 'plans', 'drawings'], description: 'Plans for the whole island, drawn from above in blue. Every place is a circle with a note beside it, and every path is a curve with a number on it. Nothing here says how anything looks, only where it is and what it is.' },
      { id: 'terminal', names: ['terminal', 'monitor', 'screen', 'computer', 'cursor', 'window'], description: 'Through the window, a monitor full of green text. The last line says the build passed. Below it, the cursor blinks, waiting for the next thing to make.' },
      { id: 'pinboard', names: ['pinboard', 'prompts', 'notes', 'pins', 'cork board', 'corkboard'], description: 'A cork board crowded with index cards, each one a request in handwriting. "Put a little train on the island." "Give the explorer a wardrobe." "Hide eight lost words." Some are crossed out, which seems to mean done.' },
      { id: 'sawdust', names: ['sawdust', 'shavings', 'floor', 'offcuts'], description: 'Curls of sawdust and offcuts of low-poly timber, all at slightly different angles. Somebody sweeps up now and then, but not often.' },
      { id: 'sawhorses', names: ['sawhorses', 'sawhorse', 'trestles', 'plank'], description: 'Two sawhorses with a plank across them, marked out for cutting. Measure twice, build once, run the tests three times.' },
    ],
  },
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
      'The end of a long wooden pier, well out over the water. A post box stands here with a letter peeking out of the slot, and a little rowboat bumps gently against the posts below. Tied up at the very end, a red speedboat is ready to go.',
    scenery: [
      { id: 'postbox', names: ['post box', 'postbox', 'box', 'letter'], description: 'Everything I write gets posted from here. The letter in the slot is the latest one.' },
      { id: 'rowboat', names: ['rowboat', 'boat', 'towel'], description: 'A little rowboat, tied up and half full of rainwater. A damp towel lies across the seat.' },
      { id: 'speedboat', names: ['speedboat', 'motorboat', 'speed boat'], description: 'A small red speedboat, tied up at the very end of the pier and rocking on the swell. Out past the buoys, a ring of gates runs right round the island.' },
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
  {
    id: 'westfield',
    kind: 'memory',
    archetype: 'mall',
    name: 'Westfield',
    title: 'The mall',
    blurb: 'I spent a lot of time here growing up, with my dad.',
    color: '#c8102e',
    at: { x: 56.2, z: 13.4 },
    footprint: 3.3,
    clearing: 4.4,
    faces: -0.4,
    aliases: ['westfield', 'mall', 'shopping centre', 'shopping center', 'shopping mall', 'shops', 'five guys', 'little london'],
    description:
      "Over Tower Bridge, on an island of its own, there's a shopping centre with a long glass roof and WESTFIELD in big letters over the doors. Every time they slide open, out comes a warm gust of air and the smell of fries. A red bus goes round and round outside. I spent a lot of time here growing up, with my dad.",
    scenery: [
      { id: 'sign', names: ['sign', 'westfield', 'letters'], description: 'WESTFIELD, in big letters over the doors. You would know it anywhere.' },
      { id: 'doors', names: ['doors', 'sliding doors', 'entrance', 'door'], description: 'Glass doors that slide open as you come near. Out comes a warm gust of air, and fries, every time.' },
      { id: 'roof', names: ['roof', 'glass roof', 'glass'], description: 'A long glass roof, curved like a wave, so the whole place is full of daylight.' },
      {
        id: 'bridge',
        names: ['bridge', 'tower bridge', 'towers', 'walkways', 'chains'],
        description:
          'Tower Bridge, back the way you came: two stone towers with pointed roofs, walkways strung high between them, and blue and white chains swooping down to either end. The middle of the road can lift for tall ships. Today it is staying down.',
      },
      {
        id: 'bus',
        names: ['bus', 'london bus', 'double-decker', 'double decker', 'red bus', 'road'],
        description:
          "A red London double-decker, with LONDON in gold down its sides and on the lit blind over the cab. It drives round and round Little London on its own little road, on the left, and pulls in at the stop every time it comes by. It never goes anywhere else. It doesn't seem to mind. If you stand in the road, it waits for you.",
      },
      {
        id: 'bus-stop',
        names: ['bus stop', 'stop', 'shelter', 'timetable', 'bench'],
        description: "A bus stop on the south side of the road: a red and white sign on a pole, and a little shelter with a bench. There's no timetable. The bus comes round when it comes round, about every half a minute.",
      },
      { id: 'phone-box', names: ['phone box', 'telephone box', 'red phone box', 'telephone', 'phone'], description: 'A red telephone box by the path, with its little windows and its crown on top. You step in. There is nobody to call, but it feels like there should be.' },
    ],
    interior: westfield,
  },
  {
    id: 'no-12',
    kind: 'quiet',
    archetype: 'townhouse',
    name: 'No. 12',
    title: 'The townhouse',
    blurb: 'A quiet room, if you want somewhere to sit for a while.',
    color: '#6f8f7a',
    at: { x: 64.6, z: 12.2 },
    footprint: 2.3,
    clearing: 3.6,
    faces: -0.3,
    aliases: ['townhouse', 'town house', 'no 12', 'number 12', 'number twelve', 'twelve', 'quiet room', 'quiet house', 'rooms', 'green door'],
    description:
      "Along from the mall, a narrow brick townhouse with a sage green door, a fanlight over it and a window box of lavender. A small brass plate by the bell says ROOMS, and nothing else. It's quiet here, the kind of quiet you can hear.",
    scenery: [
      { id: 'plate', names: ['brass plate', 'plate', 'bell', 'sign'], description: 'A small brass plate, polished thin, that says ROOMS. Under it, a bell. Ring it, or just go in: the door is on the latch.' },
      { id: 'door', names: ['door', 'green door', 'fanlight', 'knocker'], description: 'A sage green door with a brass knocker and a half-moon of glass over it. It opens gently, and closes the same way.' },
      { id: 'lavender', names: ['lavender', 'window box', 'flowers'], description: 'A window box of lavender. When the breeze picks up, so does the smell.' },
      { id: 'steps', names: ['steps', 'step', 'railings'], description: 'Two stone steps up to the door, worn smooth in the middle, with black railings either side.' },
    ],
    interior: quietRoom,
  },
  {
    id: 'synergy-tower',
    kind: 'folly',
    archetype: 'skyscraper',
    name: 'Synergy Tower',
    title: 'The glass tower',
    blurb: 'A glass tower so tall it has its own weather.',
    color: '#4f7ea8',
    at: { x: -54, z: 42 },
    footprint: 2.4,
    clearing: 3.4,
    aliases: ['synergy tower', 'synergy isle', 'glass tower', 'skyscraper', 'office', 'offices', 'corporate island', 'lobby', 'head of vibes'],
    description:
      "Through the badge gate and over the long bridge, Synergy Isle is all business. A glass tower rises out of the middle of it, so tall it has its own weather, with a rounded crown on top like a lid on a very serious jar. Two smaller glass blocks stand beside it, and a lanyard flaps from a lamp post where someone has given up on it.",
    scenery: [
      { id: 'tower', names: ['tower', 'glass tower', 'crown', 'top', 'clouds', 'weather'], description: 'You lean back and keep leaning. The glass goes up and up, gently tapering, until the rounded crown at the top disappears into its own little cloud. It might be raining up there. It is hard to tell.' },
      { id: 'blocks', names: ['glass blocks', 'blocks', 'offices', 'office blocks', 'windows'], description: 'Two shorter glass office blocks, which would be tall anywhere else. Every window has a plant in it, angled toward the tower as if for approval.' },
      { id: 'lanyard', names: ['lanyard', 'lamp post', 'badge'], description: 'A lanyard on a lamp post, flapping in the breeze. The badge on the end says VISITOR, and under that, in pen: back in 5.' },
      { id: 'gate', names: ['gate', 'badge gate', 'turnstile', 'turnstiles', 'barrier'], description: 'Back along the bridge, the turnstile at the far end blinks green now. It remembers you. It remembers everyone who speaks fluent corporate.' },
    ],
    interior: tower,
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
  { from: 'plaza', to: 'workshop', bend: -0.05 },
  // Unpaved: shortcuts across the grass, so neighbours connect directly.
  { from: 'plaza', to: 'contact', paved: false },
  { from: 'middle-place', to: 'etymon', paved: false },
  { from: 'etymon', to: 'map-of-evolution', paved: false },
  { from: 'middle-place', to: 'quizmate', paved: false },
  { from: 'quizmate', to: 'contact', paved: false },
  { from: 'busy-beer', to: 'eqoscan', paved: false },
  { from: 'eqoscan', to: 'privacy-research', paved: false },
  { from: 'workshop', to: 'busy-beer', paved: false },
  { from: 'workshop', to: 'eqoscan', paved: false },
  // Down to the quay and over Tower Bridge, and along from the mall to the townhouse.
  { from: 'busy-beer', to: 'westfield', paved: false },
  { from: 'westfield', to: 'no-12', paved: false },
  // Over to Boardwalk Isle, through the badge gate and out along the long bridge.
  { from: 'quizmate', to: 'synergy-tower', paved: false },
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
  {
    id: 'portal',
    kind: 'portal',
    place: 'plaza',
    at: { x: 0, z: 4.5 },
    name: 'The portal',
    description: 'A ring of light in the middle of the plaza. Step through it to see the island another way: in 3D, as a pixel-art map, or as a text adventure.',
  },
  {
    id: 'boat',
    kind: 'boat',
    place: 'blog',
    at: { x: 2, z: 28.4 },
    name: 'Race round the island',
    description: 'A little speedboat is tied up at the end of the pier. Take it out for a lap of the island, through every gate, and race the clock.',
  },
  // Three little games, each with a best score kept in your pockets.
  {
    id: 'skipping-stones',
    kind: 'minigame',
    game: 'stones',
    place: 'privacy-research',
    at: { x: 8.5, z: -20 },
    name: 'Skipping stones',
    description: 'A pile of flat stones on the north beach, along the shore from the lighthouse, and a calm sea. Five stones a round: let go at just the right moment and they skip for miles.',
  },
  {
    id: 'crab-boop',
    kind: 'minigame',
    game: 'crabs',
    place: 'contact',
    at: { x: -17.6, z: 14.8 },
    name: 'Crab boop',
    description: 'A patch of beach riddled with holes, and a crab in every one. Boop them back into the sand before they scuttle off. Watch out for the starfish.',
  },
  {
    id: 'crate-stack',
    kind: 'minigame',
    game: 'crates',
    place: 'eqoscan',
    at: { x: 12.5, z: 0 },
    name: 'Crate stack',
    description: 'Crates waiting by the depot, and a crane to swing them. Drop each one square on the last and see how high the tower goes.',
  },
  // Four more on the islets off the west coast, one for each of four projects,
  // over the bridges. Each teaches something true about the project it's for.
  {
    id: 'ask-the-bartender',
    kind: 'minigame',
    game: 'bartender',
    place: 'busy-beer',
    at: { x: -34.2, z: 11.6 },
    name: 'Ask the bartender',
    description: "A little beach bar on Boardwalk Isle. Tell the bartender the mood in three words and watch the menu score itself before your drink slides over.",
  },
  {
    id: 'spot-the-dark-pattern',
    kind: 'minigame',
    game: 'patterns',
    place: 'privacy-research',
    at: { x: -30, z: 10.6 },
    name: 'Spot the dark pattern',
    description: "A kiosk on the boardwalk, with a signup page that isn't playing fair. Find the tricks built to steer you, then see which ones Global Privacy Control would have settled for you.",
  },
  {
    id: 'etymology-race',
    kind: 'minigame',
    game: 'etymology',
    place: 'etymon',
    at: { x: -33.3, z: -16.6 },
    name: 'Etymology race',
    description: 'A giant dictionary open on a lectern on Root Isle. Ten words and a ticking clock: guess where English got each one, or pick its oldest ancestor out of a line-up.',
  },
  {
    id: 'sort-the-tree-of-life',
    kind: 'minigame',
    game: 'evolution',
    place: 'map-of-evolution',
    at: { x: -29.3, z: -17.4 },
    name: 'Sort the tree of life',
    description: 'A young tree on Root Isle with nine branches, and a basket of living things to hang on them. Is a whale a fish? Is a horseshoe crab a crab?',
  },
  // And the gate out to Synergy Isle: a badge desk at the near end of the long
  // bridge, where you get through by saying plain things the corporate way.
  {
    id: 'badge-desk',
    kind: 'minigame',
    game: 'jargon',
    place: 'synergy-tower',
    at: { x: -32.4, z: 18.4 },
    name: 'The badge desk',
    description: 'A security desk at the end of Boardwalk Isle, by the turnstile onto the long bridge. The greeter will badge you through to Synergy Isle if you can say plain things the corporate way.',
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
    id: 'tool-belt',
    name: 'tool belt',
    slot: 'body',
    place: 'workshop',
    color: '#8a5a2b',
    description: "A leather tool belt from the workshop, with a hammer, a tape measure and a carpenter's pencil in its pockets. Everything you need to build an island.",
    hint: 'Somebody hung a belt of tools by the workbench, inside the railway loop.',
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
    id: 'red-cap',
    name: 'red cap',
    slot: 'head',
    place: 'westfield',
    color: '#d22630',
    description: "A red cap like the fry cook's, from the mall over Tower Bridge. It smells faintly of fries, which you get used to.",
    hint: 'The fry cook at the mall wears one, and keeps a spare behind the counter.',
  },
  {
    id: 'soft-scarf',
    name: 'soft scarf',
    slot: 'neck',
    place: 'no-12',
    color: '#8fae9b',
    description: 'A soft sage scarf from the hook by the green door. It feels like being told to take your time.',
    hint: 'There is a hook by a green door on Little London, with something soft on it.',
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
  {
    id: 'fleece-vest',
    name: 'fleece vest',
    slot: 'body',
    place: 'synergy-tower',
    color: '#6b7684',
    description: 'A grey fleece vest from the glass tower, zipped right up. Warm, soft and fully aligned.',
    hint: 'Past the badge gate, the Head of Vibes keeps a spare vest behind reception.',
  },
];

// People out walking: real people from Ambrose's life, on the main island
// and on Little London. They only say what's true of any visit (hello, the
// weather, the way to somewhere), never anything about themselves. Each walks
// a loop and stops at every corner of it; see src/world/wander.ts.
const wanderers: WorldInput['wanderers'] = [
  {
    id: 'pushkar',
    name: 'Pushkar',
    looks: 'In a mustard scarf and a navy coat, out for a stroll between the depot and the plaza.',
    color: '#e9a23b',
    coat: '#2f3e66',
    roams: 'main',
    walk: [{ x: 5.4, z: 0.6 }, { x: 8.8, z: -2 }, { x: 7.4, z: -6.4 }, { x: 3.6, z: -4.4 }],
    lines: [
      'Hello! Nice day for a walk round the island.',
      "The recycling depot's just there. The belt never stops.",
      'If you see a silver train, it goes round the east end all day, island time.',
      'Mind the crates by the depot. People will try to stack anything.',
    ],
  },
  {
    id: 'jeremy',
    name: 'Jeremy',
    looks: 'In a green scarf and a grey coat, ambling along between the cabin and the schoolhouse.',
    color: '#3f9e6b',
    coat: '#8c8f93',
    roams: 'main',
    walk: [{ x: -4.6, z: 1.2 }, { x: -8.4, z: 2.4 }, { x: -7.8, z: 6.2 }, { x: -4.4, z: 7.6 }],
    lines: [
      'Oh, hi! Lovely to see you.',
      "The cabin's off to the west. Someone always has the kettle on.",
      "The schoolhouse is just down there. There's a quiz on Friday. There's always a quiz on Friday.",
      "Take your time. The island isn't going anywhere.",
    ],
  },
  {
    id: 'eugene',
    name: 'Eugene',
    looks: 'In a red scarf and a brown coat, with a blue woolly hat, walking up toward the old tree.',
    color: '#c8443a',
    coat: '#7a5236',
    hat: '#3d6fb6',
    roams: 'main',
    walk: [{ x: -3.6, z: -5.4 }, { x: -5.6, z: -8.2 }, { x: -4.4, z: -14.8 }, { x: -3.2, z: -6.4 }],
    lines: [
      "Hello there. Have you seen the old tree yet? It's just up the rise.",
      "The library's over to the west. Voices low in there, the words are resting.",
      'Keep an eye out as you go: there are words hidden all over this island.',
      'Lovely light up here this time of day.',
    ],
  },
  {
    id: 'abdu',
    name: 'Abdu',
    looks: 'In an orange scarf and an olive coat, wandering down toward the pier.',
    color: '#ef7d3c',
    coat: '#6b7046',
    roams: 'main',
    walk: [{ x: 6, z: 10.4 }, { x: 9.8, z: 12.6 }, { x: 8.8, z: 16.6 }, { x: 6.4, z: 14.8 }],
    lines: [
      'Hey! Good to see you.',
      "The pier's just there. Cast a line off the end and see what bites.",
      "There's a speedboat tied up at the very end, if you fancy a lap of the island.",
      "Bit of a breeze off the sea today. The gulls don't seem to mind.",
    ],
  },
  {
    id: 'protector',
    name: 'the protector',
    aliases: ['protector'],
    looks: 'In a long dark coat and a deep green scarf, walking slowly round the island, with a quiet, watchful look.',
    color: '#2f6b4f',
    coat: '#2e3440',
    hat: '#2e3440',
    doing: 'keeping watch',
    roams: 'main',
    walk: [
      { x: 2.6, z: -14.4 },
      { x: -4.6, z: -16.4 },
      { x: -5.2, z: -8.6 },
      { x: -11.2, z: -7.4 },
      { x: -16.6, z: -7.2 },
      { x: -17.4, z: 0.6 },
      { x: -16.4, z: 4.4 },
      { x: -7.6, z: 4.6 },
      { x: -6.8, z: 14.4 },
      { x: 5.8, z: 13.2 },
      { x: 7.2, z: -3.4 },
    ],
    pace: 0.9,
    pause: 6,
    lines: [
      "I keep an eye on things here. Everyone's all right.",
      "Go on, have a look round. I'll be about.",
      'If you ever lose your way, head for the plaza. Every path leads back there.',
      'The lighthouse watches over the water. I watch over the rest.',
    ],
  },
  {
    id: 'tati',
    name: 'Tati',
    looks: 'In a frayed denim mini skirt with a sparkly trim, a lace top and a turquoise scarf, in a hurry round the plaza.',
    color: '#3fb8c4',
    skirt: '#46576a',
    doing: 'running late',
    roams: 'main',
    walk: [{ x: 1.6, z: 8.6 }, { x: 4.2, z: 7.2 }, { x: 3.6, z: 10.4 }, { x: 0.6, z: 11.4 }],
    pace: 1.4,
    pause: 3,
    lines: [
      "It's OK, I'm OK.",
      "Where's my sports car?",
      "I'm running late. It's 10:35!",
      "Don't get in my space. Don't get greedy.",
    ],
  },
  {
    id: 'dad',
    name: 'Dad',
    aliases: ['father', 'my dad', 'papa'],
    looks: 'In a navy scarf and a camel coat, smiling as you come up.',
    color: '#2c4170',
    coat: '#b98d5e',
    roams: 'little-london',
    walk: [{ x: 60.4, z: 19.6 }, { x: 64.4, z: 18.8 }, { x: 65.6, z: 21.2 }, { x: 61.6, z: 22.2 }],
    lines: [
      "Hello! I'm so glad you came by.",
      "Westfield's just there. Five Guys is inside, if you're hungry.",
      'Tower Bridge takes you back to the island when you are ready. No rush.',
      'Look both ways when you cross the road. The bus always stops, but still.',
    ],
  },
  {
    id: 'mom',
    name: 'Mom',
    aliases: ['mother', 'my mom', 'mum', 'mama'],
    looks: 'In a rose pink scarf and a cream coat, waving as you come up.',
    color: '#e58fa8',
    coat: '#efe3cf',
    roams: 'little-london',
    walk: [{ x: 61.2, z: 27 }, { x: 64.6, z: 26.8 }, { x: 67.2, z: 25.2 }, { x: 63.6, z: 26.4 }],
    lines: [
      "Oh, hello! It's so good to see you.",
      'Have you eaten? There are burgers in Westfield. Have something.',
      "It's breezy out here by the water. Keep warm.",
      "I'm glad you came all this way.",
    ],
  },
  {
    id: 'lucia',
    name: 'Lucia',
    looks: 'In a lilac scarf and a teal coat, walking along behind the mall.',
    color: '#a98bd6',
    coat: '#2d8c8a',
    roams: 'little-london',
    walk: [{ x: 54.2, z: 9.6 }, { x: 56.2, z: 8.4 }, { x: 59.6, z: 8.4 }, { x: 56.2, z: 9.1 }],
    lines: [
      'Hi! Welcome to Little London.',
      "There's a red phone box by the path. There's nobody to call, but it's nice to step in.",
      'If it rains, Westfield has a glass roof. Very handy.',
    ],
  },
  {
    id: 'andrew',
    name: 'Andrew',
    looks: 'In a yellow scarf and a charcoal coat, with a red woolly hat, walking the east end of the islet.',
    color: '#f2c14e',
    coat: '#4a4d52',
    hat: '#c8433a',
    roams: 'little-london',
    walk: [{ x: 71.8, z: 11.6 }, { x: 72.4, z: 15.6 }, { x: 71.8, z: 19.6 }, { x: 71.6, z: 15.6 }],
    lines: [
      'Hey, hello! Good to see you.',
      'The mall is big. Look for the map with the red dot that says YOU ARE HERE.',
      'Tower Bridge is the long way back. It is also the only way back.',
      "Grey sky or blue, it's a nice spot for a walk.",
    ],
  },
  {
    id: 'isaac',
    name: 'Isaac',
    looks: 'In a sky blue scarf and a green coat, with a grey woolly hat, out for a wander.',
    color: '#7cc0e6',
    coat: '#4f8a4b',
    hat: '#9a958c',
    roams: 'little-london',
    walk: [{ x: 61.4, z: 14.6 }, { x: 62.6, z: 17.8 }, { x: 60.2, z: 20 }, { x: 59.8, z: 17.4 }],
    lines: [
      'Hello! Out exploring?',
      "There's a quiet house along there with a brass plate on the door. It's a good place to sit for a while.",
      "The bus goes round and round. It stops at the stop every time, just in case.",
      "Have a good look round. There's no hurry.",
    ],
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
  // New land to the east: room for the railway loop, the quay and the workshop inside it.
  shores: [{ toward: { x: 1, z: 0.1 }, reach: 13, spread: 0.45 }],
  railway: { center: { x: 24, z: 1.5 }, rx: 6.5, rz: 9, square: 3.2, bed: 1.3, station: 0.25 },
  quay: { x0: 24, z0: 14.2, x1: 30.5, z1: 19.8, deck: 0.7 },
  // Two islets off the west coast, a footbridge out to each: Root Isle, for
  // where words and living things come from, and Boardwalk Isle, with a beach
  // bar and a pushy kiosk. Their games are on the island's activities. Off the
  // east end, Little London: Tower Bridge from the quay, out to Westfield. And
  // further out past Boardwalk Isle, through a badge gate on a long footbridge,
  // Synergy Isle, far enough out that nobody swims round the gate.
  islets: [
    { id: 'root-isle', name: 'Root Isle', at: { x: -31.7, z: -14.8 }, coast: { radius: 6.6, ripples: [{ freq: 3, amp: 0.5, phase: 1.2 }, { freq: 5, amp: 0.3, phase: 0.4 }] } },
    { id: 'boardwalk-isle', name: 'Boardwalk Isle', at: { x: -33.1, z: 14.1 }, coast: { radius: 6.6, ripples: [{ freq: 3, amp: 0.5, phase: 2.6 }, { freq: 4, amp: 0.35, phase: 0.9 }] } },
    { id: 'little-london', name: 'Little London', at: { x: 59.6, z: 15.6 }, coast: { radius: 14.6, ripples: [{ freq: 3, amp: 0.5, phase: 0.4 }, { freq: 5, amp: 0.3, phase: 1.9 }] } },
    { id: 'synergy-isle', name: 'Synergy Isle', at: { x: -54, z: 42 }, coast: { radius: 7.6, ripples: [{ freq: 3, amp: 0.4, phase: 1.7 }, { freq: 5, amp: 0.25, phase: 0.2 }] } },
  ],
  // Round Little London, a road for the red bus, with its stop on the south side.
  busRoute: { center: { x: 59.9, z: 15.3 }, rx: 10, rz: 9.2, square: 2.3, bed: 1.05, stop: 0.3 },
  bridges: [
    { from: { x: -15.6, z: -10.5 }, to: { x: -27, z: -13.5 }, width: 2.4, deck: 1.15 },
    { from: { x: -16.8, z: 11 }, to: { x: -28.3, z: 13.2 }, width: 2.4, deck: 1.15 },
    // Tower Bridge, level with the quay at the bus's end and straight out to Little London.
    { from: { x: 30.2, z: 17.2 }, to: { x: 46.4, z: 17.2 }, width: 3.4, deck: 0.76, style: 'tower' },
    // The long bridge from Boardwalk Isle out to Synergy Isle, with the badge gate at its near end.
    { from: { x: -35.6, z: 19.1 }, to: { x: -50.1, z: 37.2 }, width: 2.4, deck: 1.15, gate: { id: 'badge-gate', name: 'the badge gate', game: 'jargon', pass: 2 } },
  ],
  // FOSS HILL in big letters on the slope below the lighthouse, facing the island (and the camera, from the south),
  // with a gap between the words where the lost word in the rocks peeks through; and a small flag on the hilltop.
  signs: [{ id: 'foss-hill', name: 'Foss Hill', text: 'FOSS HILL', place: 'privacy-research', at: { x: 20.6, z: -10 }, faces: 0, height: 1.6 }],
  flags: [{ at: { x: 23, z: -15.5 } }],
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
      shots: p.shots,
    })),
    posts: [...posts].sort((a, b) => b.date.localeCompare(a.date)),
    places,
    routes,
    lostWords,
    activities,
    outfits,
    wanderers,
    geography,
  } satisfies WorldInput);
}
