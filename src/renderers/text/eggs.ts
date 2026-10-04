// Things nobody needs to type, answered anyway: the classics (xyzzy, plugh),
// a little shell (it is a website, after all), and what happens when you try
// to swim, climb, sit, eat or ring things. Kept few, and kept short.
//
// An answer is either something to say, or another command to run instead
// ("knock" at the tree is "examine door"), so this never reaches into the engine.

import type { Place, World } from '../../world/schema';
import { cmd, p, say, type Block, type Effect, type Span } from './output';
import { key, type Command } from './parser';
import { ref } from './lexicon';

export type EggAnswer = { out: Block[]; effects?: Effect[] } | { instead: string };

export type EggContext = {
  world: World;
  here: Place;
  hub: Place;
  found: string[];
  /** The places one step away. */
  next: Place[];
  /** What to type to walk to a place. */
  goCmd(p: Place): string;
};

const said = (...lines: string[]): EggAnswer => ({ out: lines.map(say) });

const SHOUTS: Record<string, string> = {
  dance: 'You dance a little. Nobody is watching, which is the best way.',
  sing: 'You hum a sea shanty. A gull joins in, badly.',
  shout: '“HELLO!” The island says it back, politely.',
  yell: '“HELLO!” The island says it back, politely.',
  scream: 'You scream into the breeze. It feels great. A crab looks concerned.',
};

export function egg({ world, here, hub, found, next, goCmd }: EggContext, c: Command): EggAnswer | null {
  const has = (n: string) => here.scenery.some((x) => x.names.some((m) => key(m) === n));
  switch (c.verb) {
    case 'xyzzy':
      return said('A hollow voice says, “Wrong cave.”');
    case 'plugh':
      return said('A hollow voice says “plugh” back, a little embarrassed for both of you.');
    case 'zork':
      return said('Wrong island. There are no grues here, and it is never pitch black. Not until you find every word, anyway.');
    case 'sudo':
      return said('Nice try. You are not in the sudoers file. This incident will be reported to the crab.');
    case 'hello':
      return said(
        `Hello! I'm ${world.person.name.split(' ')[0]}, or the part of me that lives on this island. Have a look around: every place here is something I've made. When you want to say hello properly, there's a [bottle](contact) on the beach.`,
      );
    case 'ls': {
      const spans: Span[] = [];
      for (const sc of here.scenery) spans.push(cmd(sc.names[0].replace(/\s+/g, '-'), `examine ${sc.names[0]}`), '  ');
      for (const pl of next) spans.push({ text: `../${pl.id}/`, cmd: goCmd(pl), color: pl.color }, '  ');
      return { out: [p(...spans)] };
    }
    case 'pwd':
      return { out: [p(`/island/${here.id}`)] };
    case 'cd':
      if (c.rest[0] === '-') return { instead: 'back' };
      if (c.noun && !['~', '/', '..'].includes(c.rest[0])) return { instead: `go to ${c.noun}` };
      return here.id === hub.id ? said(`You're already at ${ref(hub)}, the root of everything.`) : { instead: goCmd(hub) };
    case 'quit':
      if (c.words[0] === 'save' || c.words[0] === 'restore') return said('No need. The island remembers what you’ve found, all by itself.');
      return said('There’s no quitting an island, only leaving it. The [island](view island), the [map](view map) and the [list](view list) are all up in the corner whenever you like.');
    case 'swim': {
      if (here.archetype !== 'pier' && here.archetype !== 'bottle' && here.kind !== 'hub') return said('The sea is a short walk away, whichever way you go.');
      // The word for that feeling is hidden off the pier, if the world has one there.
      const word = world.lostWords.find((w) => world.places.find((x) => x.id === w.place)?.archetype === 'pier');
      if (word && found.includes(word.id)) return said(`You dip a toe in. *${word.word[0].toUpperCase()}${word.word.slice(1)}!* Now you have the word for it.`);
      return said('You dip a toe in. The cold hits all at once, a shock there ought to be a word for. Someone who swims off the pier might know it.');
    }
    case 'ring':
      if (has('bell')) return { out: [say('DING. A gull startles off the roof. Class still isn’t in.')], effects: [{ type: 'sound', name: 'bell' }] };
      return said('There’s nothing here to ring.');
    case 'knock':
      if (has('door')) return { instead: 'examine door' };
      return said(here.href ? 'Nobody answers, but it isn’t locked. [ENTER]?' : 'There’s nothing here to knock on.');
    case 'climb':
      if (here.archetype === 'tree') return said('The lowest branch is well above your head. The swing is as high as you’re getting today.');
      if (here.archetype === 'lighthouse') return said('The stairs are inside. [ENTER] to climb up.');
      return said('There’s nothing here worth climbing.');
    case 'sit':
      if (has('chair') || has('swing') || has('stools')) return said('You sit for a while. It is, as promised, a good place to think.');
      return said('You sit down for a moment. The island carries on around you.');
    case 'eat':
      if (c.noun.includes('apple')) return said('It’s for the teacher.');
      if (c.noun.includes('mushroom')) return said('Absolutely not.');
      return said('You’re not hungry. Curious, but not hungry.');
    case 'drink':
      if (here.archetype === 'taproom') return said('You’d love to, and the app inside would tell you exactly what to order. [ENTER] and see.');
      return said('Nothing to drink here but sea water, and you know better.');
    case 'jump':
      return said(SHOUTS[c.words[0]] ?? 'Wheee! You land exactly where you started.');
    case 'sleep':
      return said('Not now. There’s too much to see.');
    default:
      return null;
  }
}
