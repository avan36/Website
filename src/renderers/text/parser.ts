// Turning what someone typed into a command. Forgiving on purpose: "walk to
// the library please", "go nw", "x journal" and "look closely at the barrels"
// all mean something. Pure string work, so it's tested on its own.

export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** The eight directions, clockwise from north (the order geo's compass() uses). */
export const DIRS: Dir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const DIR_NAMES: Record<Dir, string> = {
  n: 'north',
  ne: 'north-east',
  e: 'east',
  se: 'south-east',
  s: 'south',
  sw: 'south-west',
  w: 'west',
  nw: 'north-west',
};
export const DIR_ARROWS: Record<Dir, string> = { n: '↑', ne: '↗', e: '→', se: '↘', s: '↓', sw: '↙', w: '←', nw: '↖' };

const DIR_WORDS: Record<string, Dir> = {};
for (const d of DIRS) {
  DIR_WORDS[d] = d;
  DIR_WORDS[DIR_NAMES[d]] = d;
}

export const dirOf = (word: string): Dir | undefined => DIR_WORDS[word];

export type Verb =
  | 'look' | 'examine' | 'search' | 'go' | 'enter' | 'back' | 'read' | 'open'
  | 'inventory' | 'hint' | 'help' | 'map' | 'fish' | 'reel' | 'wait' | 'take'
  | 'about' | 'work' | 'writing' | 'contact' | 'where' | 'exits' | 'clear' | 'undo'
  | 'again' | 'view' | 'portal' | 'yes' | 'no' | 'night' | 'day' | 'score' | 'race' | 'play' | 'throw'
  | 'wardrobe' | 'wear' | 'remove'
  // Inside a building.
  | 'talk' | 'ask' | 'leave' | 'bye'
  // A few for fun.
  | 'xyzzy' | 'plugh' | 'sudo' | 'hello' | 'ls' | 'cd' | 'pwd' | 'quit' | 'swim'
  | 'ring' | 'knock' | 'climb' | 'sit' | 'eat' | 'drink' | 'jump' | 'sleep' | 'zork';

/** Every way of saying each verb. Longer phrases win ("look at" before "look"). */
const PHRASES: Record<Verb, string[]> = {
  look: ['look', 'l', 'look around', 'look about', 'take a look', 'have a look', 'look here', 'describe'],
  examine: ['examine', 'x', 'inspect', 'check', 'check out', 'study', 'look at', 'observe', 'what is', 'whats', 'cat', 'admire', 'touch', 'smell', 'listen to'],
  search: ['search', 'look in', 'look inside', 'look under', 'look behind', 'look through', 'look beneath', 'look among', 'search through', 'rummage', 'rummage in', 'rummage through', 'dig', 'dig in', 'dig through', 'investigate', 'feel', 'peek', 'peer into'],
  go: ['go', 'walk', 'run', 'head', 'travel', 'move', 'visit', 'take me', 'follow', 'wander', 'stroll', 'hike', 'jog', 'goto', 'cd to', 'go over', 'walk over', 'teleport'],
  enter: ['enter', 'go in', 'go inside', 'go into', 'get in', 'step in', 'step into', 'step inside', 'head in', 'head inside', 'walk in', 'walk into', 'come in', 'inside'],
  back: ['back', 'go back', 'return', 'b', 'retreat', 'turn back', 'head back', 'walk back'],
  read: ['read', 'read about'],
  open: ['open', 'unlock', 'uncork', 'push', 'launch', 'visit page'],
  inventory: ['inventory', 'i', 'inv', 'hoard', 'word hoard', 'words', 'pockets', 'found', 'my words'],
  hint: ['hint', 'hints', 'clue', 'clues', 'nudge', 'stuck', 'im stuck', 'help me'],
  help: ['help', 'h', 'commands', 'instructions', 'what can i do', 'how do i play', 'how to play', 'info', 'man'],
  map: ['map', 'm', 'show map', 'show me map', 'map please'],
  fish: ['fish', 'cast', 'go fishing', 'cast line', 'cast a line', 'cast my line', 'cast off', 'angle'],
  reel: ['reel', 'reel in', 'reel it in', 'pull', 'pull in', 'pull up', 'yank', 'strike', 'hook'],
  wait: ['wait', 'z', 'rest', 'sit tight', 'pause'],
  take: ['take', 'get', 'grab', 'pick up', 'steal', 'pocket', 'collect'],
  about: ['about', 'about me', 'about ambrose', 'who', 'whoami', 'who are you', 'who is ambrose', 'who made this', 'bio', 'ambrose', 'me'],
  work: ['work', 'projects', 'portfolio', 'apps', 'what have you made', 'what did you make', 'show work', 'my work'],
  writing: ['writing', 'posts', 'blog', 'articles', 'essays', 'show posts', 'list posts'],
  contact: ['contact', 'email', 'get in touch', 'write to me', 'reach out', 'hire', 'hire me', 'hire ambrose', 'send message', 'message ambrose'],
  where: ['where', 'where am i', 'location', 'whereami'],
  exits: ['exits', 'ways', 'directions', 'where can i go', 'paths out'],
  clear: ['clear', 'cls', 'clear screen'],
  undo: ['undo'],
  again: ['again', 'g', 'repeat'],
  view: ['view', 'switch to', 'switch', 'switch view', 'change view', 'show view'],
  portal: ['portal', 'use portal', 'enter portal', 'go through', 'step through', 'walk through', 'jump through', 'go through portal', 'step through portal', 'step into portal', 'jump into portal', 'through portal', 'step into the light'],
  yes: ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'please do', 'yes please'],
  no: ['no', 'nope', 'nah', 'no thanks'],
  night: ['night', 'nighttime', 'night time', 'dusk', 'lights off'],
  day: ['day', 'daytime', 'day time', 'dawn', 'lights on'],
  score: ['score', 'progress', 'points'],
  talk: ['talk', 'talk to', 'talk with', 'speak', 'speak to', 'speak with', 'chat', 'chat to', 'chat with', 'greet', 'say hello to', 'say hi to', 'converse with'],
  ask: ['ask', 'ask about', 'question', 'tell me about', 'what about', 'inquire about', 'enquire about'],
  leave: ['leave', 'out', 'go out', 'get out', 'step out', 'head out', 'walk out', 'go outside', 'outside', 'step outside', 'head outside', 'exit building', 'leave building', 'outdoors', 'go outdoors'],
  bye: ['bye', 'goodbye', 'good bye', 'farewell', 'see you', 'see ya', 'cheerio', 'thanks bye', 'thank you'],
  race: [
    'race', 'boat race', 'race the boat', 'race a lap', 'race round the island', 'race around the island', 'take the boat', 'take boat', 'take the speedboat',
    'take speedboat', 'board', 'board the boat', 'board boat', 'get in the boat', 'get in boat', 'get in the speedboat', 'get into the boat', 'sail',
    'go boating', 'drive the boat', 'drive boat', 'drive the speedboat', 'start the boat', 'untie the boat', 'take the boat out', 'lap',
  ],
  play: ['play', 'play a game', 'play game', 'play the game', 'games', 'game', 'minigame', 'minigames', 'mini game', 'mini games', 'have a go', 'high scores', 'best scores', 'scores'],
  throw: ['throw', 't', 'throw stone', 'throw it', 'skip', 'skim', 'skip stone', 'skim stone', 'toss', 'fling', 'let go', 'let fly', 'release'],
  wardrobe: ['wardrobe', 'outfits', 'outfit', 'clothes', 'closet', 'costumes', 'what am i wearing', 'dress up', 'my clothes'],
  wear: ['wear', 'put on', 'don', 'try on', 'equip', 'dress in', 'change into'],
  remove: ['take off', 'remove', 'unwear', 'doff', 'unequip', 'undress'],
  xyzzy: ['xyzzy'],
  plugh: ['plugh', 'plover'],
  sudo: ['sudo'],
  hello: ['hello', 'hi', 'hey', 'hiya', 'howdy', 'greetings', 'good morning', 'good evening', 'yo', 'hello there'],
  ls: ['ls', 'dir', 'll', 'ls -la', 'ls -l'],
  cd: ['cd'],
  pwd: ['pwd'],
  quit: ['quit', 'exit', 'q', 'logout', 'restart', 'restore', 'save'],
  swim: ['swim', 'dive', 'paddle', 'bathe', 'go swimming', 'jump in'],
  ring: ['ring', 'toll', 'ding'],
  knock: ['knock', 'knock on'],
  climb: ['climb', 'climb up', 'scale'],
  sit: ['sit', 'sit on', 'sit down', 'swing', 'swing on'],
  eat: ['eat', 'bite', 'taste'],
  drink: ['drink', 'sip', 'order', 'order a', 'have a drink', 'cheers'],
  jump: ['jump', 'hop', 'leap', 'dance', 'sing', 'shout', 'yell', 'scream'],
  sleep: ['sleep', 'nap', 'lie down'],
  zork: ['zork', 'frotz', 'grue', 'adventure', 'colossal cave'],
};

const TABLE: { words: string[]; verb: Verb }[] = (Object.entries(PHRASES) as [Verb, string[]][])
  .flatMap(([verb, list]) => list.map((s) => ({ words: s.split(' '), verb })))
  .sort((a, b) => b.words.length - a.words.length);

/** Canonical verbs, for fuzzy matching and Tab completion. */
export const VERB_WORDS = [...new Set(Object.values(PHRASES).flatMap((l) => l.filter((s) => !s.includes(' ') && s.length > 2)))];

/** Politeness and preamble that change nothing. */
const PREAMBLE = [
  'please', 'can you', 'could you', 'would you', 'i want to', 'i wanna', 'i would like to', 'id like to', 'i like to',
  'lets', 'let me', 'try to', 'try', 'just', 'now', 'then', 'ok', 'okay', 'i', 'can i', 'may i', 'i will', 'ill',
].map((s) => s.split(' ')).sort((a, b) => b.length - a.length);

/** Words that carry no meaning in a noun phrase. */
const FILLER = new Set([
  'the', 'a', 'an', 'at', 'to', 'please', 'some', 'my', 'this', 'that', 'these', 'those', 'of', 'in', 'on', 'into',
  'inside', 'around', 'with', 'for', 'towards', 'toward', 'over', 'there', 'here', 'thing', 'again', 'now', 'it', 'its',
  'them', 'up', 'out', 'onto', 'by', 'and', 'way', 'little', 'area', 'side',
]);
/** Words that mean "look harder". */
const CLOSELY = new Set(['closely', 'carefully', 'thoroughly', 'properly', 'hard', 'harder', 'closer', 'more', 'again']);

export type Command = {
  verb: Verb | null;
  /** The meaningful words after the verb, articles and filler gone. */
  noun: string;
  /** A compass direction, if that's what the command is about. */
  dir?: Dir;
  /** "examine the barrels closely": look harder than usual. */
  closely: boolean;
  /** Every word, lowercased, before anything was taken out. */
  words: string[];
  /** The words after the verb, before filler was taken out. */
  rest: string[];
};

/** Lowercase, no punctuation, compass names joined up: the form every name is compared in. */
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/\b(north|south)[\s-]*(east|west)\b/g, '$1-$2')
    .replace(/[^a-z0-9\s.\-æþðǣāōū]/g, ' ')
    .split(/\s+/)
    .map((w) => (w === '..' ? w : w.replace(/^[.\-]+|[.\-]+$/g, '')))
    .filter(Boolean);
}

/** A noun phrase stripped down to what matters: "the old library" → "old library". */
export const nounOf = (ws: string[]) => ws.filter((w) => !FILLER.has(w)).join(' ');

/** A name in the same form as nounOf() makes, so the two compare equal. */
export const key = (s: string) => nounOf(words(s));

const startsWith = (ws: string[], phrase: string[]) => phrase.every((w, i) => ws[i] === w);

export function parse(input: string): Command {
  if (/^\s*\?+\s*$/.test(input)) return { verb: 'help', noun: '', closely: false, words: ['?'], rest: [] };
  const all = words(input);
  let ws = all;
  // Drop preamble ("please", "can you", "i want to"), but never the whole command ("i" is inventory).
  for (let changed = true; changed; ) {
    changed = false;
    for (const ph of PREAMBLE) {
      if (ws.length > ph.length && startsWith(ws, ph)) {
        ws = ws.slice(ph.length);
        changed = true;
        break;
      }
    }
  }
  // Trailing politeness: "map please".
  while (ws.length > 1 && (ws[ws.length - 1] === 'please' || ws[ws.length - 1] === 'thanks')) ws = ws.slice(0, -1);

  let verb: Verb | null = null;
  let rest = ws;
  const hit = TABLE.find((t) => startsWith(ws, t.words));
  if (hit) {
    verb = hit.verb;
    rest = ws.slice(hit.words.length);
  }
  // "sudo make me a sandwich", "cd ..": keep everything after the verb as typed.
  const closely = rest.some((w) => CLOSELY.has(w));
  const noun = nounOf(rest.filter((w) => !CLOSELY.has(w)));
  const cmd: Command = { verb, noun, closely, words: all, rest };

  // Directions: "n", "north-east", "go sw", "walk north".
  const dir = dirOf(noun) ?? (rest.length === 1 ? dirOf(rest[0]) : undefined);
  if (!verb && dirOf(ws.join(' '))) return { ...cmd, verb: 'go', dir: dirOf(ws.join(' ')), noun: '' };
  if ((verb === 'go' || verb === 'look') && dir) return { ...cmd, dir };
  return cmd;
}
