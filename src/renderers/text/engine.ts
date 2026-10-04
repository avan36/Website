// The text adventure: the island as something you type into. A pure function
// from (state, what you typed) to (new state, what to show, what to do). No
// DOM, no clock, no storage: the page owns those, and the tests drive it with
// nothing but strings.
//
//   const engine = createEngine(world, geo);
//   let state = engine.initial('plaza');
//   const { state: next, out, effects } = engine.run(state, 'walk to the library');
//
// `out` is blocks to show (see output.ts). `effects` ask the page to do
// something: go into a place, record a found word, cast a line, set a timer.

import type { Geo } from '../../world/geo';
import type { LostWord, Outfit, OutfitSlot, Place, Post, Scenery, World } from '../../world/schema';
import type { ViewId } from '../types';
import { closest } from './fuzzy';
import { createLexicon, pronoun, ref, thing } from './lexicon';
import { drawIsland, GROUND, mapWithYou, type IslandMap } from './map';
import { cmd, dim, md, p, say, type Block, type Effect, type ExitLine, type ListItem, type Signal, type Span } from './output';
import { DIR_ARROWS, DIR_NAMES, DIRS, key, parse, VERB_WORDS, words, type Command, type Dir } from './parser';
import { createTravel, type Leg } from './travel';
import { egg } from './eggs';
import { andList, ARRIVE, cap, INVITE, longDate, NIGHT, NOTHING, pick, RANKS, RELEASE, spell, UNKNOWN, WAIT, WAIT_FISHING, WAY_IN } from './voice';

/** How long the float sits before something bites, and how long you have to reel it in. */
export const BITE_MS: [number, number] = [2200, 4200];
export const ESCAPE_MS = 5000;

type Pending =
  /** "north-east" led two ways: which place did you mean? */
  | { kind: 'which'; options: string[]; enter: boolean }
  /** "Did you mean …?": yes runs this. */
  | { kind: 'confirm'; command: string };

export type EngineState = {
  /** The place you're at. */
  at: string;
  /** Where you were before, for BACK. */
  from: string | null;
  /** Mirrors of the store's progress, refreshed by the page before every turn. */
  found: string[];
  caught: string[];
  night: boolean;
  /** Outfit pieces unlocked, and what's being worn (also mirrors of the store). */
  wardrobe: string[];
  worn: Partial<Record<OutfitSlot, string>>;
  /** Scenery you've examined once that hides a word ("place/scenery"): look again and you find it. */
  noticed: string[];
  /** The last thing you looked at, for "search it". */
  it: { place: string; noun: string } | null;
  fishing: { phase: 'waiting' | 'biting'; cast: number } | null;
  casts: number;
  pending: Pending | null;
  /** How many times you've asked for a hint about each word. */
  hints: Record<string, number>;
  last: string | null;
  turns: number;
};

export type Result = { state: EngineState; out: Block[]; effects: Effect[] };

export type Chip = { label: string; cmd: string; tone?: 'go' | 'urgent' };

export type EngineOptions = { random?: () => number };

const VIEWS: Record<string, ViewId> = { island: 'island', '3d': 'island', map: 'map', '2d': 'map', pixel: 'map', text: 'text', list: 'list', plain: 'list' };

export function createEngine(world: World, geo: Geo, { random = Math.random }: EngineOptions = {}) {
  const byId = new Map(world.places.map((pl) => [pl.id, pl]));
  const place = (id: string) => byId.get(id)!;
  const hub = geo.hub;
  const travel = createTravel(world, geo);
  const lex = createLexicon(world);
  const total = world.lostWords.length;
  const fishing = world.activities.find((a) => a.kind === 'fishing');
  let island: IslandMap | null = null; // drawn the first time someone asks for the map

  const wordIn = (pl: Place, s: Scenery) => world.lostWords.find((w) => w.place === pl.id && w.in === s.id);
  const project = (pl: Place) => world.projects.find((x) => x.slug === pl.project);
  const goCmd = (pl: Place) => `go to ${lex.handle(pl)}`;
  const placeSpan = (pl: Place, text = ref(pl)): Span => ({ text, cmd: goCmd(pl), color: pl.color });

  // ---------- Results ----------

  const result = (state: EngineState, out: Block[] = [], effects: Effect[] = []): Result => ({ state, out, effects });

  // ---------- Describing ----------

  function exitLines(pl: Place): ExitLine[] {
    const lines: ExitLine[] = [];
    for (const d of DIRS) {
      const here = travel.exits(pl.id).filter((e) => e.dir === d);
      if (!here.length) continue;
      lines.push({
        dir: DIR_NAMES[d],
        cmd: DIR_NAMES[d],
        places: here.map((e) => {
          const to = place(e.to);
          return { id: to.id, ref: ref(to), color: to.color, cmd: here.length > 1 ? goCmd(to) : DIR_NAMES[d] };
        }),
      });
    }
    return lines;
  }

  function describe(s: EngineState, pl: Place): Block[] {
    const out: Block[] = [{ kind: 'title', text: pl.title, color: pl.color, sub: key(pl.name) !== key(pl.title) ? pl.name : undefined }, p(pl.description)];
    if (s.night) out.push({ kind: 'p', spans: [NIGHT[pl.archetype]], tone: 'flavour' });
    if (pl.scenery.length) {
      const items = pl.scenery.map((sc) => ({ text: thing(sc), cmd: `examine ${sc.names[0]}` }));
      const spans: Span[] = ['You could examine '];
      items.forEach((it, i) => spans.push(it, i < items.length - 2 ? ', ' : i === items.length - 2 ? ' or ' : '.'));
      out.push({ kind: 'p', spans, tone: 'dim' });
    }
    if (fishing?.place === pl.id) out.push(dim(fishing.description, ' ', ...md('Type [FISH] to try your luck.')));
    if (pl.href) {
      const verb = pl.kind === 'contact' ? 'OPEN' : 'ENTER';
      const what = project(pl)?.name;
      out.push({ kind: 'p', spans: md(`[${verb}] to ${INVITE[pl.archetype]}${what ? ` and see *${what}*` : ''}.`), tone: 'dim' });
    }
    out.push({ kind: 'exits', exits: exitLines(pl) });
    return out;
  }

  // ---------- Moving ----------

  function narrate(legs: Leg[]): Span[] {
    const parts = legs.map((l, i) => {
      const to = place(l.to);
      const dir = DIR_NAMES[l.dir];
      const last = i === legs.length - 1;
      const arrive = (last && ARRIVE[to.archetype]) || `to ${ref(to)}`;
      if (i === 0) return `${l.paved ? 'follow the path' : 'cut across the grass'} ${dir} ${arrive}`;
      const prev = legs[i - 1];
      const how = l.paved !== prev.paved ? (l.paved ? 'pick up the path ' : 'cut across the grass ') : l.dir === prev.dir ? 'carry on ' : '';
      return `${how}${dir} ${arrive}`;
    });
    const from = place(legs[0].from);
    const leave = from.archetype === 'pier' ? 'You walk back along the pier, then ' : 'You ';
    const body = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, then ${parts[parts.length - 1]}`;
    return [cap(`${leave}${body}.`)];
  }

  /** Walk somewhere by the shortest way, telling the story of the walk, and look around. */
  function walk(s: EngineState, toId: string, opts: { enter?: boolean } = {}): Result {
    const to = place(toId);
    if (toId === s.at) {
      if (opts.enter) return enter(s);
      return result(s, [say(`You're already at ${ref(to)}.`), ...describe(s, to).slice(-1)]);
    }
    const legs = travel.route(s.at, toId);
    if (!legs) return result(s, [say(`There's no way to ${ref(to)} from here.`)]);
    const out: Block[] = [];
    if (s.fishing) out.push(dim('You reel in your line and leave the pier.'));
    out.push({ kind: 'p', spans: narrate(legs) });
    let next: EngineState = { ...s, from: s.at, at: toId, fishing: null, pending: null, it: null };
    const effects: Effect[] = [{ type: 'move', place: toId }, { type: 'sound', name: 'step' }];
    // Every house keeps something to wear; arriving makes it yours (the store does the same on the move).
    const gift = world.outfits.find((o) => o.place === toId && !s.wardrobe.includes(o.id));
    if (gift) next = { ...next, wardrobe: [...s.wardrobe, gift.id] };
    const gifted = gift ? [unlockedLine(gift, next)] : [];
    if (opts.enter) {
      const r = enter(next);
      return result(r.state, [...out, ...gifted, ...r.out], [...effects, ...r.effects]);
    }
    return result(next, [...out, ...describe(next, to), ...gifted], effects);
  }

  function goDir(s: EngineState, d: Dir, enterAfter = false): Result {
    const options = travel.exits(s.at).filter((e) => e.dir === d);
    if (!options.length) {
      const ways = [...new Set(travel.exits(s.at).map((e) => DIR_NAMES[e.dir]))];
      return result(s, [p(`You can't go that way. Paths lead ${andList(ways, 'or')}.`)]);
    }
    if (options.length === 1) return walk(s, options[0].to, { enter: enterAfter });
    return which(s, options.map((e) => e.to), `${cap(spell(options.length))} ways lead ${DIR_NAMES[d]}:`, enterAfter);
  }

  /** Ask which of several places was meant. `lead` is a question ("Do you mean") or a statement ending in a colon. */
  function which(s: EngineState, ids: string[], lead: string, enterAfter = false): Result {
    const end = lead.endsWith(':') ? '. Which one?' : '?';
    const spans: Span[] = [`${lead} `];
    ids.forEach((id, i) => spans.push(placeSpan(place(id)), i < ids.length - 2 ? ', ' : i === ids.length - 2 ? ' or ' : end));
    return result({ ...s, pending: { kind: 'which', options: ids, enter: enterAfter } }, [p(...spans)]);
  }

  function enter(s: EngineState): Result {
    const pl = place(s.at);
    if (!pl.href) return result(s, [say(`There's nothing to go into here: ${ref(pl)} is all open air. Every path out of it leads somewhere you can, though. Try [MAP].`)]);
    return result(s, [p(`You ${WAY_IN[pl.archetype]}.`)], [{ type: 'sound', name: 'whoosh' }, { type: 'go', place: pl.id }]);
  }

  // ---------- Looking ----------

  /** A place you can't see from here: what it is, and which way. */
  function farPlace(s: EngineState, pl: Place): Block[] {
    const here = place(s.at);
    const d = travel.towards(here, pl);
    return [p(placeSpan(pl, cap(ref(pl))), `: ${pl.blurb} It's ${DIR_NAMES[d]} of here. `, ...md(`[Go there](${goCmd(pl)}) to see it properly.`))];
  }

  function examine(s: EngineState, noun: string, closely: boolean, searching = false): Result {
    const here = place(s.at);
    if (!noun) return result(s, [p(...whatSpans(here, searching ? 'Search what? ' : 'Examine what? ', searching ? 'search' : 'examine'))]);
    const sc = lex.scenery(here, noun);
    if (sc.length) return scenery(s, here, sc[0], closely || searching);
    if (['me', 'myself', 'self', 'yourself', 'you'].includes(noun))
      return result(s, [say("You look like someone who explores websites properly. I appreciate that. The [ABOUT] page is about me, not you, but it's a start.")]);
    const named = sceneryNamed(noun);
    if (named) return result(s, [p(`There's no ${named.scenery.names[0]} here. `, placeSpan(named.place, cap(ref(named.place))), ` has one, ${DIR_NAMES[travel.towards(here, named.place)]} of here.`)]);
    const pls = lex.places(noun);
    if (pls.some((x) => x.id === here.id)) return searching ? result(s, [p(...whatSpans(here, 'Search what, exactly? ', 'search'))]) : look(s);
    if (pls.length === 1) return result(s, farPlace(s, pls[0]));
    if (pls.length > 1) return which(s, pls.map((x) => x.id), `Do you mean`);
    const elsewhere = lex.sceneryAnywhere(noun);
    if (elsewhere.length) {
      const { place: pl, scenery: x } = elsewhere[0];
      return result(s, [p(`There's no ${x.names[0]} here. `, placeSpan(pl, cap(ref(pl))), ` has one, ${DIR_NAMES[travel.towards(here, pl)]} of here.`)]);
    }
    const lw = lex.words(noun)[0];
    if (lw) return result(s, s.found.includes(lw.id) ? [wordBlock(lw, s.found.length)] : [say(`*${lw.word}*? That word is still lost somewhere on the island. Maybe a [HINT] would help.`)]);
    const post = lex.posts(noun)[0];
    if (post) return result(s, [postLine(post)]);
    if (words(here.description).includes(noun.split(' ').pop()!))
      return result(s, [say(`The ${noun} is just part of the scenery. Lovely, but nothing more to it.`)]);
    return unknownNoun(s, noun, 'examine');
  }

  /** Scenery somewhere else called exactly this by its main name ("journal"), which beats a place's alias for it. */
  const sceneryNamed = (noun: string) => lex.sceneryAnywhere(noun).find((x) => key(x.scenery.names[0]) === noun);

  /** "Examine what? You could try the journal, the chair or the lantern." */
  function whatSpans(pl: Place, lead: string, verb: string): Span[] {
    if (!pl.scenery.length) return [lead + "There's not much here to look at."];
    const spans: Span[] = [`${lead}You could try `];
    pl.scenery.forEach((sc, i) => spans.push(cmd(thing(sc), `${verb} ${sc.names[0]}`), i < pl.scenery.length - 2 ? ', ' : i === pl.scenery.length - 2 ? ' or ' : '.'));
    return spans;
  }

  function scenery(s: EngineState, pl: Place, sc: Scenery, closely: boolean): Result {
    const lw = wordIn(pl, sc);
    const k = `${pl.id}/${sc.id}`;
    const it = { place: pl.id, noun: sc.names[0] };
    if (lw && !s.found.includes(lw.id) && (closely || s.noticed.includes(k))) return find(s, pl, sc, lw);
    if (closely && !lw) return result({ ...s, it }, [p(`You search ${thing(sc)}. ${pick(NOTHING, k)}`)]);
    const out: Block[] = [p(sc.description)];
    if (lw && s.found.includes(lw.id)) out.push({ kind: 'p', spans: md(`This is where you found *${lw.word}*.`), tone: 'dim' });
    else if (lw) out.push({ kind: 'p', spans: md(`Something about ${thing(sc)} catches your eye. You could [search ${pronoun(sc)}](search ${sc.names[0]}).`), tone: 'flavour' });
    return result({ ...s, it, noticed: lw && !s.noticed.includes(k) ? [...s.noticed, k] : s.noticed }, out);
  }

  function find(s: EngineState, pl: Place, sc: Scenery, lw: LostWord): Result {
    const found = [...s.found, lw.id];
    const out: Block[] = [p(`You search ${thing(sc)} carefully. There, where nobody thought to look, is a word English lost.`), wordBlock(lw, found.length)];
    if (found.length === total)
      out.push({ kind: 'p', spans: md(`That's all ${spell(total)}. The word hoard is full, and the sun goes down on the island. Have a [LOOK] around.`), tone: 'flavour' });
    else if (found.length === 1)
      out.push(dim(...md(`It's in your [INVENTORY] now, and in the word hoard up top. ${cap(spell(total - 1))} more are hidden around the island. [HINT] if you get stuck.`)));
    else out.push(dim(...md(`${cap(spell(found.length))} of ${spell(total)} found. [HINT] points to the next.`)));
    return result({ ...s, found, night: found.length === total ? true : s.night, it: { place: pl.id, noun: sc.names[0] } }, out, [{ type: 'find', id: lw.id }]);
  }

  function wordBlock(lw: LostWord, count: number): Block {
    const pl = place(lw.place);
    return { kind: 'word', word: lw.word, gloss: lw.gloss, first: lw.first, died: lw.died, story: lw.story, color: pl.color, where: pl.title, count, total };
  }

  function look(s: EngineState, d?: Dir): Result {
    const here = place(s.at);
    if (!d) return result(s, describe(s, here));
    const ways = travel.exits(here.id).filter((e) => e.dir === d);
    if (!ways.length) return result(s, [p(`To the ${DIR_NAMES[d]}: grass, then sand, then a great deal of sea.`)]);
    const spans: Span[] = [`To the ${DIR_NAMES[d]}: `];
    ways.forEach((e, i) => spans.push(placeSpan(place(e.to)), i < ways.length - 1 ? ' and ' : '. '));
    spans.push(place(ways[0].to).blurb);
    return result(s, [p(...spans)]);
  }

  // ---------- The rest of the island's content ----------

  function postLine(post: Post): Block {
    return p({ text: `“${post.title}”`, href: post.href, tone: 'em' }, `, ${longDate(post.date)}. ${post.description} `, ...md(`[Read it](read ${post.title}).`));
  }

  function posts(s: EngineState): Result {
    const pier = world.places.find((x) => x.kind === 'writing');
    if (!world.posts.length) return result(s, [say("Nothing posted yet. The post box is empty, but I'm working on it.")]);
    const items: ListItem[] = world.posts.map((x) => ({
      label: [{ text: x.title, cmd: `read ${x.title}`, tone: 'em' }],
      text: [{ text: `${longDate(x.date)}. `, tone: 'dim' }, x.description],
    }));
    const out: Block[] = [{ kind: 'list', title: 'Writing', items }];
    if (pier) out.push(dim('Everything I write gets posted from the end of ', placeSpan(pier), s.at === pier.id ? '. Which is here.' : '.', ' ', ...md('[READ] a title to open it.')));
    return result(s, out);
  }

  function projects(s: EngineState): Result {
    const here = place(s.at);
    const items: ListItem[] = world.projects.map((proj) => {
      const pl = world.places.find((x) => x.project === proj.slug)!;
      const where = pl.id === here.id ? 'You are here.' : `${cap(ref(pl))}, ${DIR_NAMES[travel.towards(here, pl)]}.`;
      return { color: pl.color, label: [{ text: proj.name, cmd: goCmd(pl), color: pl.color }], text: [`${proj.blurb} `, { text: where, tone: 'dim' }] };
    });
    return result(s, [{ kind: 'list', title: 'Things I’ve made', items }, dim(...md('Each one is a place on the island. Walk there and [ENTER] to see it.'))]);
  }

  function about(s: EngineState, noun: string): Result {
    if (noun && !['me', 'ambrose', 'you', 'yourself', 'him', 'author', 'this'].includes(noun) && !lex.places(noun).length && !lex.words(noun).length)
      return examine(s, noun, false);
    const pl = noun ? lex.places(noun)[0] : undefined;
    if (pl?.project) {
      const proj = project(pl)!;
      return result(s, [
        { kind: 'title', text: proj.name, color: pl.color, sub: proj.platforms },
        say(`*${proj.headline}*`),
        ...proj.body.map((b) => p(b)),
        dim(`It's `, placeSpan(pl, ref(pl)), s.at === pl.id ? ', right here. ' : ' on the island. ', ...md(s.at === pl.id ? '[ENTER] to see it.' : `[Walk there](${goCmd(pl)}) and go in.`)),
      ]);
    }
    if (pl) return look(s);
    const person = world.person;
    return result(s, [
      { kind: 'title', text: person.name, color: '#e8c48e', sub: person.role },
      p(person.intro),
      say(`This island is my portfolio: every place on it is something I've made. Type [WORK] for the list, [WRITING] for what I've written, or [CONTACT] to say hello.`),
      p({ text: 'More about me', href: person.about }, ' · ', { text: person.github.replace(/^https?:\/\//, ''), href: person.github }),
    ]);
  }

  function contact(s: EngineState): Result {
    const bottle = world.places.find((x) => x.kind === 'contact');
    if (!bottle) return result(s, [say('Say hello any time.')]);
    if (s.at === bottle.id) return result(s, [say(`${bottle.blurb} [OPEN] the bottle to write me a note.`)]);
    const r = walk(s, bottle.id);
    return result(r.state, [say(`${bottle.blurb} The best way to reach me washes up on the beach.`), ...r.out], r.effects);
  }

  function inventory(s: EngineState): Result {
    const out: Block[] = [];
    if (!s.found.length) out.push(say(`Your pockets are empty, apart from a little sand. ${cap(spell(total))} lost words are hidden around the island, each one tucked into something you can examine. [HINT] if you'd like a nudge.`));
    else {
      const items: ListItem[] = s.found.map((id) => {
        const lw = world.lostWords.find((w) => w.id === id)!;
        const pl = place(lw.place);
        return { color: pl.color, label: [{ text: lw.word, color: pl.color, cmd: `examine ${lw.word}` }], text: [lw.gloss] };
      });
      out.push({ kind: 'list', title: `Your word hoard: ${s.found.length} of ${total}`, items });
      if (s.found.length < total) out.push(dim(...md(`${cap(spell(total - s.found.length))} still lost. [HINT] if you'd like a nudge.`)));
    }
    if (s.caught.length) out.push(dim(`Caught off the pier: ${s.caught.length} of ${world.posts.length} posts.`));
    if (world.outfits.length) {
      const wearing = world.outfits.filter((o) => s.worn[o.slot] === o.id);
      out.push(dim(...md(`In your [WARDROBE]: ${s.wardrobe.length} of ${world.outfits.length} things to wear${wearing.length ? `, and you have on ${andList(wearing.map((o) => `the ${o.name}`))}` : ''}.`)));
    }
    return result(s, out);
  }

  // ---------- The wardrobe ----------

  const SLOT_WORDS: Record<OutfitSlot, string[]> = {
    head: ['hat', 'cap', 'helmet', 'head', 'crown'],
    face: ['glasses', 'specs', 'spectacles', 'shades', 'face'],
    neck: ['scarf', 'neck'],
    body: ['vest', 'jacket', 'body'],
  };
  const wearCmd = (o: Outfit) => `wear ${o.name}`;
  const article = (o: Outfit) => (/^[aeiou]/i.test(o.name) ? 'an' : 'a');

  /** Outfit pieces a noun could mean, best first: a whole name, then every word of it, then the slot. */
  function outfitsNamed(noun: string, among: readonly Outfit[] = world.outfits): Outfit[] {
    const n = key(noun);
    if (!n) return [];
    const ws = n.split(' ');
    const names = (o: Outfit) => [key(o.name), key(o.id.replace(/-/g, ' '))];
    const exact = among.filter((o) => names(o).includes(n));
    if (exact.length) return exact;
    const partial = among.filter((o) => names(o).some((name) => ws.every((w) => name.split(' ').includes(w))));
    if (partial.length) return partial;
    return among.filter((o) => ws.some((w) => SLOT_WORDS[o.slot].includes(w)));
  }

  function unlockedLine(o: Outfit, s: EngineState): Block {
    const pl = place(o.place);
    return {
      kind: 'p',
      tone: 'flavour',
      spans: [
        `Something is waiting for you here: ${article(o)} `,
        { text: o.name, color: pl.color, tone: 'key' },
        `. It fits. That's ${s.wardrobe.length} of ${world.outfits.length} for your wardrobe. `,
        cmd('Wear it', wearCmd(o)),
        ' or see your ',
        cmd('WARDROBE', 'wardrobe'),
        '.',
      ],
    };
  }

  function wardrobe(s: EngineState): Result {
    const n = world.outfits.length;
    if (!n) return result(s, [say('There’s nothing to wear on this island. Yet.')]);
    const items: ListItem[] = world.outfits.map((o) => {
      const pl = place(o.place);
      if (!s.wardrobe.includes(o.id)) return { label: [{ text: '???', tone: 'dim' }], text: [{ text: o.hint, tone: 'em' }, ' ', placeSpan(pl, `(${ref(pl)})`)], color: '#9a9184' };
      const on = s.worn[o.slot] === o.id;
      return {
        color: pl.color,
        label: [{ text: o.name, color: pl.color, cmd: on ? `take off ${o.name}` : wearCmd(o) }],
        text: [on ? 'wearing it. ' : '', o.description],
      };
    });
    const wearing = world.outfits.filter((o) => s.worn[o.slot] === o.id);
    return result(s, [
      { kind: 'list', title: `Your wardrobe: ${s.wardrobe.length} of ${n}`, items },
      dim(
        ...(wearing.length ? [`You're wearing ${andList(wearing.map((o) => `the ${o.name}`))}. `] : ['You’re wearing just your scarf. ']),
        ...md(s.wardrobe.length < n ? `Every house on the island keeps something to wear: walk up to one and it’s yours. Click a name to [WEAR] it.` : 'You’ve found every piece. Dress however you like; it shows in every view.'),
      ),
    ]);
  }

  function wear(s: EngineState, noun: string): Result {
    if (!noun) return result(s, [say(s.wardrobe.length ? 'Wear what? Your [WARDROBE] has everything you’ve found.' : 'You’ve nothing to wear yet. Every house on the island keeps something; go and visit one.')]);
    const mine = world.outfits.filter((o) => s.wardrobe.includes(o.id));
    const have = outfitsNamed(noun, mine);
    if (!have.length) {
      const elsewhere = outfitsNamed(noun)[0];
      if (elsewhere) {
        const pl = place(elsewhere.place);
        return result(s, [p(`You haven't found that yet. `, { text: elsewhere.hint, tone: 'em' }, ' Try ', placeSpan(pl), '.')]);
      }
      return result(s, [say(`You've nothing like that to wear. Your [WARDROBE] has everything you've found.`)]);
    }
    const o = have.find((x) => s.worn[x.slot] !== x.id) ?? have[0];
    if (s.worn[o.slot] === o.id) return result(s, [say(`You're already wearing the ${o.name}.`)]);
    const before = world.outfits.find((x) => s.worn[o.slot] === x.id);
    const next = { ...s, worn: { ...s.worn, [o.slot]: o.id } };
    const line = before ? `You swap the ${before.name} for the ${o.name}.` : `You put on the ${o.name}.`;
    return result(next, [p(line, ' ', { text: o.description, tone: 'dim' })], [{ type: 'wear', id: o.id }, { type: 'sound', name: 'pop' }]);
  }

  function takeOff(s: EngineState, noun: string): Result {
    const wearing = world.outfits.filter((o) => s.worn[o.slot] === o.id);
    if (!wearing.length) return result(s, [say('You’re not wearing anything from the wardrobe. The scarf stays: it’s part of you.')]);
    const all = ['all', 'everything', 'clothes', 'outfit'].includes(key(noun));
    const off = all ? wearing : outfitsNamed(noun, wearing).slice(0, 1);
    if (!noun || !off.length) return result(s, [p('Take off what? You’re wearing ', ...wearing.flatMap((o, i) => [i ? (i === wearing.length - 1 ? ' and ' : ', ') : '', cmd(`the ${o.name}`, `take off ${o.name}`)]), '.')]);
    const worn = { ...s.worn };
    for (const o of off) delete worn[o.slot];
    return result({ ...s, worn }, [say(`You take off ${andList(off.map((o) => `the ${o.name}`))} and tuck ${off.length > 1 ? 'them' : 'it'} away in your [WARDROBE].`)], off.map((o) => ({ type: 'unwear' as const, slot: o.slot })));
  }

  function hint(s: EngineState): Result {
    const here = place(s.at);
    const left = world.lostWords.filter((w) => !s.found.includes(w.id));
    if (!left.length) return result(s, [say(`Your hoard is full: all ${spell(total)} words found. The island is yours. Type [NIGHT] or [DAY] to change the sky.`)]);
    const lw = left.reduce((a, b) => (travel.walkDistance(here.id, b.place) < travel.walkDistance(here.id, a.place) ? b : a));
    const pl = place(lw.place);
    const sc = pl.scenery.find((x) => x.id === lw.in)!;
    const level = s.hints[lw.id] ?? 0;
    const where: Span[] = pl.id === here.id ? ['It’s somewhere right here.'] : [placeSpan(pl, cap(ref(pl))), ` is ${DIR_NAMES[travel.towards(here, pl)]} of here.`];
    const out: Block[] =
      level === 0
        ? [p({ text: lw.hint, tone: 'em' }, ' ', ...where)]
        : level === 1
          ? [p(`Try examining ${thing(sc)} at `, placeSpan(pl), '. ', ...(pl.id === here.id ? [] : where))]
          : [p(...md(`[Search ${sc.names[0]}](search ${sc.names[0]}) at `), placeSpan(pl), '. You’ve got this.')];
    return result({ ...s, hints: { ...s.hints, [lw.id]: level + 1 } }, out);
  }

  function help(s: EngineState): Result {
    const row = (label: string, command: string, text: string): ListItem => ({ label: [cmd(label, command)], text: [text] });
    return result(s, [
      say('Type what you want to do, in plain words, and press Enter. Or click anything underlined.'),
      {
        kind: 'list',
        items: [
          row('LOOK', 'look', 'look around (L for short)'),
          row('NORTH, SE…', 'exits', 'walk that way (N, NE, E…)'),
          row('GO TO THE LIBRARY', 'go to library', 'walk anywhere by name'),
          row('EXAMINE JOURNAL', 'examine', 'look closer (X for short)'),
          row('SEARCH', 'search', 'find what’s hidden'),
          row('ENTER', 'enter', 'open the page a place stands for'),
          row('MAP', 'map', 'see the whole island'),
          row('HINT', 'hint', 'a nudge toward a lost word'),
          row('INVENTORY', 'inventory', 'the words you’ve found (I)'),
          row('WARDROBE', 'wardrobe', 'things to wear, one from every house (WEAR, TAKE OFF)'),
          row('WORK · WRITING · ABOUT', 'work', 'the plain facts'),
        ],
      },
      dim(...md(`${cap(spell(total))} lost words are hidden on the island, and you can [FISH] off the pier. [BACK] retraces your steps.`)),
    ]);
  }

  function mapBlock(s: EngineState): Block[] {
    island ??= drawIsland(world, geo);
    const here = place(s.at);
    const { rows } = mapWithYou(island, geo, here);
    const legend = world.places.map((pl) => ({ glyph: island!.glyph.get(pl.id)!, title: pl.title, color: pl.color, cmd: goCmd(pl), here: pl.id === here.id }));
    const key: [string, string][] = [[GROUND.you, 'you'], [GROUND.path, 'path'], [GROUND.pier, 'pier'], [GROUND.grass, 'grass'], [GROUND.sand, 'sand'], [GROUND.rock, 'rocks'], [GROUND.sea, 'sea']];
    const others = world.places.filter((x) => x.id !== here.id).map((x) => `${x.title} to the ${DIR_NAMES[travel.towards(here, x)]}`);
    const summary = `A map of the island, north at the top. You are at ${ref(here)}. ${others.join('. ')}.`;
    return [{ kind: 'map', rows, legend, key, summary }, dim(`You are here (@), at ${ref(here)}. North is up.`)];
  }

  // ---------- Fishing ----------

  function fish(s: EngineState): Result {
    if (!fishing) return result(s, [say('There are no fish in these waters. Not yet.')]);
    const pier = place(fishing.place);
    if (s.at !== pier.id) return result(s, [p(`You'd need to be on ${ref(pier)}. It's `, placeSpan(pier, `${DIR_NAMES[travel.towards(place(s.at), pier)]} of here`), '.')]);
    if (s.fishing) return result(s, [say(s.fishing.phase === 'biting' ? 'Something is on the line right now! [REEL] it in!' : 'Your line is already in the water. Patience. [WAIT], or [REEL] it back in.')]);
    if (!world.posts.length) return result(s, [say('You cast, and wait, and wait. Nothing is biting today.')]);
    const cast = s.casts + 1;
    const ms = Math.round(BITE_MS[0] + random() * (BITE_MS[1] - BITE_MS[0]));
    const line =
      cast === 1
        ? 'You bait the hook with a crumb of something and cast. The line arcs out over the water, and the float settles with a plip. Now you wait.'
        : 'You cast again. The float lands with a plip and bobs on the swell.';
    return result({ ...s, casts: cast, fishing: { phase: 'waiting', cast } }, [p(line)], [{ type: 'timer', ms, signal: { name: 'bite', cast } }]);
  }

  function reel(s: EngineState): Result {
    if (!s.fishing) return result(s, [say(s.at === fishing?.place ? 'There’s nothing on the line. [CAST] first.' : 'You have nothing to reel in.')]);
    if (s.fishing.phase === 'waiting')
      return result({ ...s, fishing: null }, [say('You reel in too soon. The hook comes back bare, and a fish somewhere is laughing at you. [CAST] again?')]);
    return result({ ...s, fishing: null }, [p('You reel in, hand over hand. Something flashes silver under the surface, and then it’s flapping on the planks.')], [{ type: 'fish' }]);
  }

  /** A timer the engine asked for has gone off. */
  function signal(s: EngineState, sig: Signal): Result {
    if (!s.fishing || s.fishing.cast !== sig.cast) return result(s);
    if (sig.name === 'bite' && s.fishing.phase === 'waiting')
      return result(
        { ...s, fishing: { phase: 'biting', cast: sig.cast } },
        [{ kind: 'p', spans: md('The float dips. Then it dips again, hard. Something’s biting! Type [REEL], quick!'), tone: 'alert' }],
        [{ type: 'sound', name: 'tap' }, { type: 'timer', ms: ESCAPE_MS, signal: { name: 'escape', cast: sig.cast } }],
      );
    if (sig.name === 'escape' && s.fishing.phase === 'biting')
      return result({ ...s, fishing: null }, [say('The line goes slack. Whatever it was has got away. [CAST] again?')]);
    return result(s);
  }

  /** What the page caught when it carried out a 'fish' effect. */
  function landed(s: EngineState, post: Post, fresh: boolean): Result {
    const caught = fresh ? [...s.caught, post.slug] : s.caught;
    return result({ ...s, caught }, [
      p(fresh ? 'It isn’t a fish at all. It’s something I wrote:' : 'You’ve caught this one before. Still a good read:'),
      { kind: 'catch', title: post.title, date: longDate(post.date), description: post.description, href: post.href, fresh, count: caught.length, total: world.posts.length },
      dim(...md(`[CAST] again, or [READ](read ${post.title}) it.`)),
    ]);
  }

  // ---------- Not understood ----------

  /** Things you might have meant, best first, with what typing each would do. */
  function vocabulary(s: EngineState): { word: string; say: string; command: string }[] {
    const here = place(s.at);
    const v: { word: string; say: string; command: string }[] = [];
    for (const sc of here.scenery) for (const n of lex.sceneryKeys(sc)) v.push({ word: n, say: thing(sc), command: `examine ${sc.names[0]}` });
    for (const pl of world.places) for (const n of lex.placeKeys(pl)) v.push({ word: n, say: pl.id === here.id ? ref(pl) : `the ${n}`, command: pl.id === here.id ? 'look' : goCmd(pl) });
    for (const d of DIRS) v.push({ word: DIR_NAMES[d], say: DIR_NAMES[d], command: DIR_NAMES[d] });
    for (const pl of world.places) for (const sc of pl.scenery) for (const n of lex.sceneryKeys(sc)) v.push({ word: n, say: `the ${n}`, command: `examine ${n}` });
    return v;
  }

  function unknownNoun(s: EngineState, noun: string, verb: string): Result {
    const hit = closest(noun, vocabulary(s), (x) => x.word);
    if (hit) {
      const command = hit.command.startsWith('examine ') && verb !== 'examine' ? `${verb} ${hit.command.slice(8)}` : hit.command;
      return result({ ...s, pending: { kind: 'confirm', command } }, [p(`There's no '${noun}' here. Did you mean `, cmd(hit.say, command), '?')]);
    }
    return result(s, [p(`You don't see any ${noun} here.`)]);
  }

  function unknown(s: EngineState, c: Command, raw: string): Result {
    const first = c.words[0] ?? '';
    // A slip in the verb: "exmaine journal" → "examine journal".
    const verb = closest(first, VERB_WORDS, (w) => w);
    if (verb && c.words.length > 1) {
      const command = [verb, ...c.words.slice(1)].join(' ');
      return result({ ...s, pending: { kind: 'confirm', command } }, [p(`I don't know the word '${first}'. Did you mean `, cmd(command.toUpperCase(), command), '?')]);
    }
    // A slip in a name: "libary" → the library.
    const whole = key(raw);
    const hit = closest(whole, vocabulary(s), (x) => x.word);
    if (hit) return result({ ...s, pending: { kind: 'confirm', command: hit.command } }, [p(`There's no '${whole}' here. Did you mean `, cmd(hit.say, hit.command), '?')]);
    if (verb) return result({ ...s, pending: { kind: 'confirm', command: verb } }, [p(`I don't know the word '${first}'. Did you mean `, cmd(verb.toUpperCase(), verb), '?')]);
    return result(s, [p(pick(UNKNOWN, s.turns).replace('%s', first)), dim(...md('Try [LOOK], a direction like [NORTH], or [HELP].'))]);
  }

  // ---------- The turn ----------

  function back(s: EngineState): Result {
    if (!s.from) return result(s, [say('You haven’t been anywhere else yet. Every walk starts somewhere: try [NORTH].')]);
    return walk(s, s.from);
  }

  function goNoun(s: EngineState, noun: string, enterAfter = false): Result {
    if (['home', 'hub', 'start', 'beginning'].includes(noun)) return walk(s, hub.id, { enter: enterAfter });
    if (noun === 'back') return back(s);
    if (['in', 'inside', 'indoors'].includes(noun) || (!noun && enterAfter)) return enter(s);
    if (!noun) {
      const ways = [...new Set(travel.exits(s.at).map((e) => DIR_NAMES[e.dir]))];
      return result(s, [p(`Go where? Paths lead ${andList(ways, 'or')}. Or name a place: `, ...md('[go to the library](go to library).'))]);
    }
    const pls = lex.places(noun);
    if (pls.length === 1) return walk(s, pls[0].id, { enter: enterAfter });
    if (pls.length > 1) return which(s, pls.map((x) => x.id), 'Do you mean', enterAfter);
    const here = place(s.at);
    if (lex.scenery(here, noun).length) return result(s, [say(`You're standing right by ${thing(lex.scenery(here, noun)[0])}.`)]);
    const elsewhere = lex.sceneryAnywhere(noun)[0];
    if (elsewhere) return walk(s, elsewhere.place.id);
    return unknownNoun(s, noun, 'go to');
  }

  function view(s: EngineState, noun: string): Result {
    const id = VIEWS[noun.split(' ')[0]];
    if (!id) return result(s, [say('Which view? The [island](view island), the [map](view map), the [list](view list), or this one.')]);
    if (id === 'text') return result(s, [say('You’re already here. Words are the best view, if you ask me.')]);
    return result(s, [say(`Switching to the ${id === 'island' ? 'island' : id}. See you there.`)], [{ type: 'view', id }]);
  }

  function dispatch(s: EngineState, c: Command, raw: string): Result {
    const here = place(s.at);
    // "search it", "examine them": whatever you looked at last.
    const usesIt = !c.noun && c.rest.some((w) => w === 'it' || w === 'them') && s.it?.place === s.at;
    const noun = usesIt ? key(s.it!.noun) : c.noun;
    const next = [...new Set(travel.exits(here.id).map((e) => e.to))].map(place);
    const fun = egg({ world, here, hub, found: s.found, next, goCmd }, c);
    if (fun) return 'instead' in fun ? dispatch(s, parse(fun.instead), fun.instead) : result(s, fun.out, fun.effects);
    switch (c.verb) {
      case null: {
        // A bare noun: scenery here is examined, a place is walked to.
        if (lex.scenery(here, noun).length || sceneryNamed(noun)) return examine(s, noun, false);
        if (lex.places(noun).length) return goNoun(s, noun);
        if (lex.words(noun).length || lex.sceneryAnywhere(noun).length || lex.posts(noun).length) return examine(s, noun, false);
        return unknown(s, c, raw);
      }
      case 'look':
        if (c.dir) return look(s, c.dir);
        return noun ? examine(s, noun, c.closely) : look(s);
      case 'examine':
        return examine(s, noun, c.closely);
      case 'search':
        return examine(s, noun, true, true);
      case 'go':
        if (c.dir) return goDir(s, c.dir);
        return goNoun(s, noun);
      case 'enter':
        if (c.dir) return goDir(s, c.dir, true);
        if (!noun || lex.places(noun).some((x) => x.id === s.at) || ['door', 'building'].includes(noun)) return enter(s);
        if (lex.scenery(here, noun).length) return result(s, [say(`You can't get into ${thing(lex.scenery(here, noun)[0])}. [ENTER] on its own goes inside.`)]);
        return goNoun(s, noun, true);
      case 'open': {
        if (!noun || noun === 'door' || lex.places(noun).some((x) => x.id === s.at)) return enter(s);
        const sc = lex.scenery(here, noun)[0];
        if (sc) return wordIn(here, sc) ? examine(s, noun, true) : here.href ? enter(s) : examine(s, noun, false);
        return goNoun(s, noun, true);
      }
      case 'read': {
        if (!noun) return here.kind === 'writing' ? posts(s) : here.href ? enter(s) : result(s, [say('There’s nothing to read here. [WRITING] lists everything I’ve written.')]);
        if (['posts', 'writing', 'blog', 'everything', 'all'].includes(noun)) return posts(s);
        const sc = lex.scenery(here, noun)[0];
        if (sc) {
          if (!wordIn(here, sc) && here.kind === 'writing' && world.posts[0]) return result(s, [say('The letter in the slot is the latest thing I wrote:'), postLine(world.posts[0])]);
          return examine(s, noun, true);
        }
        const post = lex.posts(noun)[0];
        if (post) return result(s, [p(`You unfold “${post.title}” and start to read.`)], [{ type: 'open', href: post.href }]);
        if (lex.places(noun).length) return about(s, noun);
        return examine(s, noun, false);
      }
      case 'back':
        return back(s);
      case 'inventory':
        return inventory(s);
      case 'score':
        return result(s, [
          say(`Your score is ${s.found.length} of a possible ${total}, in ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}. That gives you the rank of *${RANKS[Math.min(RANKS.length - 1, Math.round((s.found.length / Math.max(1, total)) * (RANKS.length - 1)))]}*.`),
          dim(`You've also caught ${s.caught.length} of ${world.posts.length} posts off the pier.`),
        ]);
      case 'hint':
        return hint(s);
      case 'help':
        return help(s);
      case 'map':
        if (noun === 'view') return view(s, 'map');
        // "map of evolution" is a place, not a request for the map.
        if (noun) return dispatch(s, { ...c, verb: null, noun: key(raw) }, raw);
        return result(s, mapBlock(s));
      case 'fish':
        return fish(s);
      case 'reel':
        return reel(s);
      case 'wait':
        return result(s, [p(pick(s.fishing ? WAIT_FISHING : WAIT, s.turns))]);
      case 'wardrobe':
        return wardrobe(s);
      case 'wear':
        return wear(s, noun);
      case 'remove':
        return takeOff(s, noun);
      case 'take':
        // "take the hat off"
        if (c.rest.includes('off')) return takeOff(s, noun.replace(/\boff\b/, '').trim());
        if (lex.words(noun).length) return examine(s, noun, false);
        return result(s, [say('Everything on this island stays where it is. Except words: those you can keep. [SEARCH] for them.')]);
      case 'about':
        return about(s, noun);
      case 'work':
        return projects(s);
      case 'writing':
        return posts(s);
      case 'contact':
        return contact(s);
      case 'where': {
        const what = project(here)?.name ?? (here.kind === 'hub' ? null : here.name);
        return result(s, [p(`You're at `, { text: ref(here), color: here.color }, what ? `, which is ${what}. ` : '. ', ...md('[MAP] shows the whole island.'))]);
      }
      case 'exits':
        return result(s, [{ kind: 'exits', exits: exitLines(here) }]);
      case 'clear':
        return result(s, [{ kind: 'title', text: here.title, color: here.color }, dim(...md('A clean page. [LOOK] to look around again.'))], [{ type: 'clear' }]);
      case 'undo': {
        if (!s.from) return result(s, [say('Nothing to undo. You’ve only just arrived.')]);
        const r = back(s);
        return result(r.state, [dim('Time only runs one way here, but your feet don’t.'), ...r.out], r.effects);
      }
      case 'view':
        return view(s, noun);
      case 'night':
      case 'day': {
        const on = c.verb === 'night';
        if (s.found.length < total) return result(s, [say(`Night only falls once the word hoard is full. ${cap(spell(total - s.found.length))} to go.`)]);
        if (on === s.night) return result(s, [say(on ? 'It’s already night. Enjoy the stars.' : 'It’s already day.')]);
        return result({ ...s, night: on }, [say(on ? 'The sun slips into the sea, and the lanterns come on one by one.' : 'The sun comes back up, as it does.')], [{ type: 'night', on }]);
      }
      case 'yes':
        return result(s, [say('Glad to hear it.')]);
      case 'no':
        return result(s, [say('Fair enough.')]);
      default:
        return unknown(s, c, raw);
    }
  }

  /** Answer a question the last turn asked, if this is an answer. */
  function answer(s: EngineState, c: Command, raw: string): Result | null {
    const pending = s.pending!;
    const cleared = { ...s, pending: null };
    if (pending.kind === 'confirm') {
      if (c.verb === 'yes') return run({ ...cleared, turns: s.turns - 1 }, pending.command);
      if (c.verb === 'no') return result(cleared, [say('Fair enough.')]);
      return null;
    }
    // "which one?": a number, a name, or a direction picks one.
    const n = Number(raw.trim());
    const byNumber = Number.isInteger(n) && n >= 1 && n <= pending.options.length ? pending.options[n - 1] : null;
    const named = byNumber ?? pending.options.find((id) => lex.places(c.noun || key(raw)).some((x) => x.id === id)) ?? null;
    if (named) return walk(cleared, named, { enter: pending.enter });
    return null;
  }

  function run(state: EngineState, input: string): Result {
    const raw = input.trim();
    const s: EngineState = { ...state, turns: state.turns + 1 };
    if (!raw) return result(s, [say('I beg your pardon?')]);
    const c = parse(raw);
    if (c.verb === 'again') {
      if (!s.last) return result(s, [say('Again? You haven’t done anything yet.')]);
      return run(state, s.last);
    }
    const remembered = { ...s, last: raw };
    if (s.pending) {
      const r = answer(remembered, c, raw);
      if (r) return r;
      remembered.pending = null;
    }
    return dispatch(remembered, c, raw);
  }

  // ---------- Starting, and helping the page ----------

  function initial(
    at: string,
    progress: { found?: string[]; caught?: string[]; night?: boolean; wardrobe?: string[]; worn?: Partial<Record<OutfitSlot, string>> } = {},
  ): EngineState {
    return {
      at: byId.has(at) ? at : hub.id,
      from: null,
      found: progress.found ?? [],
      caught: progress.caught ?? [],
      night: progress.night ?? false,
      wardrobe: progress.wardrobe ?? [],
      worn: progress.worn ?? {},
      noticed: [],
      it: null,
      fishing: null,
      casts: 0,
      pending: null,
      hints: {},
      last: null,
      turns: 0,
    };
  }

  /** The opening: a title and a look around (or, coming back out of a place, just the look). */
  function start(s: EngineState, { returning = false } = {}): Result {
    const here = place(s.at);
    if (returning) return result(s, [p(`You step back out of ${ref(here)}, blinking in the light.`), ...describe(s, here)]);
    const name = world.person.name.split(' ')[0];
    const lead = world.person.intro.split(/(?<=\.)\s/)[0];
    return result(s, [
      { kind: 'banner', title: 'The Island', lines: [`An interactive portfolio by ${world.person.name}`, RELEASE] },
      say(`Hi, I'm ${name}. ${lead} Every place on this island is something I've made. Type [HELP] if you're lost, or just start exploring.`),
      ...describe(s, here),
    ]);
  }

  /** Commands worth a tap right now, for phones. */
  function suggest(s: EngineState): Chip[] {
    if (s.pending?.kind === 'which') return s.pending.options.map((id) => ({ label: place(id).title, cmd: goCmd(place(id)), tone: 'go' as const }));
    if (s.fishing?.phase === 'biting') return [{ label: 'REEL!', cmd: 'reel', tone: 'urgent' }];
    const here = place(s.at);
    const chips: Chip[] = [];
    if (s.fishing) chips.push({ label: 'Wait', cmd: 'wait' }, { label: 'Reel in', cmd: 'reel' });
    if (s.pending?.kind === 'confirm') chips.push({ label: 'Yes', cmd: 'yes', tone: 'go' });
    if (here.href) chips.push({ label: here.kind === 'contact' ? 'Open the bottle' : 'Enter', cmd: 'enter', tone: 'go' });
    if (here.kind === 'writing') chips.push({ label: 'Read', cmd: 'read' });
    if (fishing?.place === here.id && !s.fishing) chips.push({ label: 'Fish', cmd: 'fish', tone: 'go' });
    for (const line of exitLines(here)) {
      for (const pl of line.places) chips.push({ label: `${DIR_ARROWS[DIRS.find((d) => DIR_NAMES[d] === line.dir)!]} ${pl.ref.replace(/^the /, '')}`, cmd: pl.cmd });
    }
    chips.push({ label: 'Look', cmd: 'look' });
    for (const sc of here.scenery) chips.push({ label: `Examine ${sc.names[0]}`, cmd: `examine ${sc.names[0]}` });
    chips.push({ label: 'Map', cmd: 'map' }, { label: 'Hint', cmd: 'hint' }, { label: 'Inventory', cmd: 'inventory' }, { label: 'Wardrobe', cmd: 'wardrobe' }, { label: 'Help', cmd: 'help' });
    return chips;
  }

  /** Tab completion: whole inputs that finish the last word typed. */
  function complete(s: EngineState, text: string): string[] {
    const m = /^(.*?)([^\s]*)$/.exec(text)!;
    const head = m[1];
    const part = m[2].toLowerCase();
    const here = place(s.at);
    const before = parse(head).verb;
    const sceneryNames = here.scenery.map((sc) => sc.names[0]);
    const placeNames = world.places.map((pl) => lex.handle(pl));
    const dirs = DIRS.map((d) => DIR_NAMES[d]);
    let pool: string[];
    if (!head.trim()) pool = [...VERB_WORDS.filter((w) => w.length > 2), ...dirs, ...sceneryNames, ...placeNames];
    else if (before === 'go' || before === 'enter' || before === 'cd') pool = [...placeNames, ...dirs];
    else if (before === 'view') pool = ['island', 'map', 'list'];
    else if (before === 'wear' || before === 'remove') pool = world.outfits.filter((o) => s.wardrobe.includes(o.id)).map((o) => key(o.name));
    else pool = [...sceneryNames, ...placeNames];
    const out = [...new Set(pool.filter((w) => w.startsWith(part) && w !== part))];
    return out.map((w) => head + w);
  }

  return { initial, start, run, signal, landed, suggest, complete, describe: (s: EngineState) => describe(s, place(s.at)), map: mapBlock };
}

export type Engine = ReturnType<typeof createEngine>;
