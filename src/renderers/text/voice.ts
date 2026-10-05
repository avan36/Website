// The text adventure's own lines: everything it says that the world doesn't.
// World prose (descriptions, scenery, the lost words) lives in world.ts; this
// is the narrator. Second person, warm, brief. Ambrose speaks as "I" when it's
// his island talking. No em dashes: commas, colons and full stops do the work.
//
// Lines keyed by archetype are this renderer's art for each kind of place, the
// way the 3D island has a mesh for each.

import type { Archetype } from '../../world/schema';

export const RELEASE = 'Release 1 / Serial number 261003';

/** How you go into each kind of place (after "You "). */
export const WAY_IN: Record<Archetype, string> = {
  plaza: 'look around',
  cabin: 'step inside the cabin, out of the breeze',
  taproom: 'push open the arched door and step into the warm',
  tree: 'crouch down and squeeze through the little round door',
  library: 'climb the worn steps into the quiet of the library',
  lighthouse: 'climb the spiral stairs toward the light',
  schoolhouse: 'slip into the schoolhouse and take a seat at the back',
  depot: 'duck under the conveyor and into the depot',
  mall: 'step through the sliding doors into a warm gust of air, and fries',
  townhouse: 'go up the two steps, and the green door opens gently onto a quiet room',
  skyscraper: 'push through the revolving door, which is very agile, and into the lobby',
  workshop: 'step over the sawdust and into the workshop, where the notes are pinned up',
  pier: 'open the post box and pull out the letters',
  bottle: 'pull out the cork and unroll the note',
};

/** The invitation to go in, shown when you look around (after "[ENTER] to "). */
export const INVITE: Record<Archetype, string> = {
  plaza: '',
  cabin: 'step inside',
  taproom: 'pull up a stool',
  tree: 'squeeze through the little door',
  library: 'go inside',
  lighthouse: 'climb up to the light',
  schoolhouse: 'join the class',
  depot: 'look around the depot',
  mall: 'go in',
  townhouse: 'go in and sit for a while',
  skyscraper: 'step into the lobby',
  workshop: 'read how the island was built',
  pier: "read everything I've posted from here, or [READ] to list it",
  bottle: 'write me a message',
};

/** How the last stretch of a walk ends, when it ends somewhere special (after "to"). */
export const ARRIVE: Partial<Record<Archetype, string>> = {
  pier: 'down to the shore and out along the pier',
  bottle: 'down to the quiet beach where the bottle lies',
  lighthouse: 'out along the rocky headland to the lighthouse',
  tree: 'up the gentle rise to the ancient tree',
  workshop: 'across the tracks to the workshop inside the railway loop',
  mall: 'down to the quay, over Tower Bridge and across the road to the mall',
  townhouse: 'along from the mall to the townhouse with the green door',
  skyscraper: 'over to Boardwalk Isle, through the badge gate and all the way along the long bridge to the glass tower',
};

/** One extra line for each place after dark. */
export const NIGHT: Record<Archetype, string> = {
  plaza: 'Lanterns glow along every path, and the sky is thick with stars.',
  cabin: 'Warm light spills from every window. Somebody is still writing in there.',
  taproom: 'The string lights are bright against the dark, and the taproom hums like a jar of honey.',
  tree: 'Fireflies drift through the blossom, and the little door has a light on behind it.',
  library: 'The drifting letters glow faintly, like embers from a very old fire.',
  lighthouse: 'At night the beam is everything: a slow white spoke turning over black water.',
  schoolhouse: 'The schoolhouse is dark. Somebody left the chalk out.',
  depot: 'The conveyor has stopped for the night. Even recycling sleeps.',
  mall: 'The mall is lit up like a ship, and Tower Bridge has its lights on too, a string of them along the walkways.',
  townhouse: 'One lamp is on in the townhouse window, low and warm. The street is very quiet.',
  skyscraper: 'After dark the tower is a column of lit windows, every floor still on. Somebody up there is always circling back.',
  workshop: 'The workshop is dark except for the monitor, glowing through the window. The cursor is still blinking.',
  pier: 'The sea is black and full of stars, and the fish have come up to look at them.',
  bottle: 'The bottle catches the moonlight. The crab has gone to bed.',
};

/** Searching something that hides nothing. */
export const NOTHING = [
  'You search thoroughly and find nothing but sand.',
  'Nothing hidden there, as far as you can tell.',
  'You look high and low. It is exactly what it appears to be.',
  'Nothing. Not every corner of an island has a secret.',
  'You find a little sand and a lot of nothing.',
];

/** When there's no such word at all. */
export const UNKNOWN = [
  "I don't know the word '%s'.",
  "'%s'? That's not a word this island knows.",
  "I don't know how to '%s' here.",
];

export const WAIT = [
  'Time passes. A gull lands nearby, considers you, and leaves.',
  'You wait. The breeze picks up, then thinks better of it.',
  'Time passes. Somewhere, a wave arrives exactly on schedule.',
];

export const WAIT_FISHING = ['You wait. The float bobs on the swell.', 'You wait, very still. The line twitches, then nothing.', 'Patience. The float rides up and down.'];

/** "Your score is…" ranks, by words found. */
export const RANKS = ['Tourist', 'Beachcomber', 'Word Collector', 'Word Collector', 'Amateur Etymologist', 'Amateur Etymologist', 'Lexicographer', 'Lexicographer', 'Keeper of the Word-Hoard'];

/** A stable pick from a list, so the same thing always gets the same line. */
export function pick<T>(list: T[], seed: string | number): T {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const spell = (n: number) => NUMBERS[n] ?? String(n);
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a, b and c" */
export function andList(items: string[], word = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2026-03-04 → March 4, 2026 (no Intl, so it reads the same everywhere). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
