// Every name the island answers to, and how a typed noun finds its thing:
// places by title, name or alias, scenery by any of its nouns, posts by title,
// lost words by the word itself. Names and input go through the same key(),
// so "the Old Library", "old library" and "library" all line up.

import type { LostWord, Place, Post, Scenery, World } from '../../world/schema';
import { key } from './parser';

/**
 * The things whose names fit a noun best. An exact name beats a name found
 * inside the noun ("library building" → library), which beats the noun found
 * inside a name ("ancient" → ancient tree). Several at the same level means
 * the noun is ambiguous ("tower" is the library and the lighthouse).
 */
export function matchNames<T>(noun: string, items: T[], names: (t: T) => string[]): T[] {
  if (!noun) return [];
  const nw = noun.split(' ');
  let top = 0;
  let hits: T[] = [];
  for (const t of items) {
    let score = 0;
    for (const k of names(t)) {
      if (!k) continue;
      const kw = k.split(' ');
      if (k === noun) score = Math.max(score, 3);
      else if (kw.every((w) => nw.includes(w))) score = Math.max(score, 2);
      else if (noun.length >= 3 && nw.every((w) => kw.includes(w))) score = Math.max(score, 1);
    }
    if (score > top) (top = score), (hits = [t]);
    else if (score && score === top) hits.push(t);
  }
  return hits;
}

export function createLexicon(world: World) {
  const placeKeys = new Map<string, string[]>(
    world.places.map((p) => [p.id, [...new Set([p.title, p.name, p.id.replace(/-/g, ' '), ...p.aliases].map(key).filter(Boolean))]]),
  );
  const sceneryKeys = (s: Scenery) => s.names.map(key);

  /** The short name you'd type for a place: its first alias that means only it. */
  const handles = new Map<string, string>();
  for (const p of world.places) {
    const own = placeKeys.get(p.id)!;
    const unique = [...p.aliases.map(key), ...own].find((k) => k && world.places.every((q) => q === p || !placeKeys.get(q.id)!.includes(k)));
    handles.set(p.id, unique ?? key(p.title));
  }

  return {
    places: (noun: string): Place[] => matchNames(noun, world.places, (p) => placeKeys.get(p.id)!),
    scenery: (place: Place, noun: string): Scenery[] => matchNames(noun, place.scenery, sceneryKeys),
    /** Scenery anywhere on the island, with where it is. */
    sceneryAnywhere: (noun: string) =>
      matchNames(
        noun,
        world.places.flatMap((p) => p.scenery.map((s) => ({ place: p, scenery: s }))),
        (x) => sceneryKeys(x.scenery),
      ),
    posts: (noun: string): Post[] => matchNames(noun, world.posts, (p) => [key(p.title), key(p.slug.replace(/-/g, ' '))]),
    words: (noun: string): LostWord[] => matchNames(noun, world.lostWords, (w) => [key(w.word)]),
    /** What to type to go to a place ("library", "bottle"). */
    handle: (p: Place) => handles.get(p.id)!,
    placeKeys: (p: Place) => placeKeys.get(p.id)!,
    sceneryKeys,
  };
}

export type Lexicon = ReturnType<typeof createLexicon>;

/** "The old library" → "the old library"; "Message in a bottle" → "the message in a bottle". */
export function ref(p: Place): string {
  return /^the\s/i.test(p.title) ? `the ${p.title.slice(4)}` : `the ${p.title[0].toLowerCase()}${p.title.slice(1)}`;
}

/** A scenery item's display name, with its article: "the journal". */
export const thing = (s: Scenery) => `the ${s.names[0]}`;
/** "it" or "them", for a scenery item. */
export const pronoun = (s: Scenery) => (/[^s]s$/.test(s.names[0]) ? 'them' : 'it');
