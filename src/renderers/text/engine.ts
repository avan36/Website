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
// The one thing it asks the page for is the time (`now`), for who's out
// walking where (src/world/wander.ts); tests pass a fixed one.

import type { Geo } from '../../world/geo';
import type { Character, LostWord, Outfit, OutfitSlot, Place, Post, Scenery, Thing, Topic, Wanderer, World } from '../../world/schema';
import { walkClock, walker } from '../../world/wander';
import type { ViewId } from '../types';
import { portalOf } from '../portal';
import { boatOf } from '../boat';
import { formatLap } from '../../world/race';
import { closest } from './fuzzy';
import { createLexicon, matchNames, pronoun, ref, thing } from './lexicon';
import { drawIsland, GROUND, mapWithYou, type IslandMap } from './map';
import { cmd, dim, md, p, say, type Block, type Effect, type ExitLine, type ListItem, type Signal, type Span } from './output';
import { DIR_ARROWS, DIR_NAMES, DIRS, key, nounOf, parse, VERB_WORDS, words, type Command, type Dir } from './parser';
import { createTravel, type Leg } from './travel';
import { egg } from './eggs';
import { createTextGames, type StonesRound } from './games';
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
  /** Inside its building (only places with an interior have one). */
  inside: boolean;
  /** Who you're talking to in there, by id. */
  talking: string | null;
  /** How many times you've chatted to each person out walking (they say their lines in turn). */
  chats: Record<string, number>;
  /** Where you were before, for BACK. */
  from: string | null;
  /** Mirrors of the store's progress, refreshed by the page before every turn. */
  found: string[];
  caught: string[];
  night: boolean;
  /** The best lap round the island in the boat (raced on the 3D island), in seconds. */
  bestLap: number | null;
  /** Outfit pieces unlocked, and what's being worn (also mirrors of the store). */
  wardrobe: string[];
  worn: Partial<Record<OutfitSlot, string>>;
  /** Gates across the bridges that are open for you (a mirror of the store too). */
  gates: string[];
  /** Scenery you've examined once that hides a word ("place/scenery"): look again and you find it. */
  noticed: string[];
  /** The last thing you looked at, for "search it". */
  it: { place: string; noun: string } | null;
  fishing: { phase: 'waiting' | 'biting'; cast: number } | null;
  casts: number;
  /** A round of skipping stones in hand, and a mirror of the store's best scores (by game). */
  stones: StonesRound | null;
  bests: Record<string, number>;
  pending: Pending | null;
  /** How many times you've asked for a hint about each word. */
  hints: Record<string, number>;
  last: string | null;
  turns: number;
};

export type Result = { state: EngineState; out: Block[]; effects: Effect[] };

export type Chip = { label: string; cmd: string; tone?: 'go' | 'urgent' };

export type EngineOptions = {
  random?: () => number;
  /** The time, in seconds, for who's out walking where (walkClock by default: the real time). */
  now?: () => number;
};

const VIEWS: Record<string, ViewId> = { island: 'island', '3d': 'island', map: 'map', '2d': 'map', pixel: 'map', text: 'text', list: 'list', plain: 'list' };

export function createEngine(world: World, geo: Geo, { random = Math.random, now = () => walkClock() }: EngineOptions = {}) {
  const byId = new Map(world.places.map((pl) => [pl.id, pl]));
  const place = (id: string) => byId.get(id)!;
  const hub = geo.hub;
  const travel = createTravel(world, geo);
  const lex = createLexicon(world);
  const total = world.lostWords.length;
  const fishing = world.activities.find((a) => a.kind === 'fishing');
  const portal = portalOf(world);
  const boat = boatOf(world);
  const PORTAL_WORDS = ['portal', 'ring', 'ring of light', 'light'];
  let island: IslandMap | null = null; // drawn the first time someone asks for the map
  const games = createTextGames({ world, random, walk: (s, to) => walk(s, to), ref });

  // ---------- People out walking ----------
  // Where everyone is comes from the clock: they're "by" whichever place's door is nearest.
  const walkers = world.wanderers.map((v) => ({ v, lap: walker(v) }));
  const nearOf = (v: Wanderer) => {
    const at = walkers.find((w) => w.v === v)!.lap.at(now());
    return geo.nearestPlace(at.x, at.z).place;
  };
  /** Who's out walking by a place right now. */
  const passersBy = (pl: Place) => {
    const t = now();
    return walkers.filter(({ lap }) => {
      const at = lap.at(t);
      return geo.nearestPlace(at.x, at.z).place.id === pl.id;
    }).map((w) => w.v);
  };
  const walkerKeys = (v: Wanderer) => [v.name, v.id, ...v.aliases].map(key).filter(Boolean);
  const walkerNamed = (noun: string, among: Wanderer[] = world.wanderers) => matchNames(noun, among, walkerKeys)[0];
  const chatCmd = (v: Wanderer) => `talk to ${key(v.name)}`;
  const walkerSpan = (v: Wanderer, start = false): Span => ({ text: start ? cap(v.name) : v.name, cmd: chatCmd(v), color: v.color });

  /** "Pushkar is out for a walk nearby, and the protector is keeping watch. You could talk to Pushkar or the protector." */
  function passersLine(by: Wanderer[]): Block {
    const spans: Span[] = [];
    by.forEach((v, i) => spans.push(...(i ? [i === by.length - 1 ? ', and ' : ', '] : []), walkerSpan(v, !i), ` is ${v.doing}`));
    spans.push(' nearby. You could talk to ', ...orList(by.map((v) => walkerSpan(v))));
    return p(...spans);
  }

  /** Someone out walking says their next line. */
  function chat(s: EngineState, v: Wanderer): Result {
    const n = s.chats[v.id] ?? 0;
    const out: Block[] = [p({ text: `${cap(v.name)}: `, color: v.color, tone: 'em' }, `“${v.lines[n % v.lines.length]}”`)];
    if (!n) out.push(dim(...md(`[Talk to ${v.name}](${chatCmd(v)}) again, and there's more.`)));
    return result({ ...s, chats: { ...s.chats, [v.id]: n + 1 }, pending: null }, out, [{ type: 'sound', name: 'pop' }]);
  }

  /** Where someone out walking is, from here. */
  function whereWalker(here: Place, v: Wanderer, lead = ''): Block {
    const by = nearOf(v);
    if (by.id === here.id) return p(lead, walkerSpan(v, !lead), ` is ${v.doing} just outside.`);
    return p(lead, walkerSpan(v, !lead), ` is ${v.doing} by `, placeSpan(by), `, ${DIR_NAMES[travel.towards(here, by)]} of here.`);
  }

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
    if (boat?.place === pl.id) out.push(dim(boat.description, ' ', ...md('Type [RACE] to take it out.')));
    out.push(...games.describe(pl));
    const by = passersBy(pl);
    if (by.length) out.push(passersLine(by));
    if (portal?.place === pl.id) out.push(dim(...md(`In the middle of it all, a ring of violet light hangs over the cobbles, humming. Through it you can see the island other ways: in 3D, as a pixel map, as a plain list. [Step through](portal) if you're curious.`)));
    if (pl.href || pl.interior) {
      const verb = pl.kind === 'contact' ? 'OPEN' : 'ENTER';
      const what = project(pl)?.name;
      // Buildings have someone in; anywhere else, going in is the page itself.
      const inside = pl.interior?.people.map((c) => `${c.name}, ${c.role}`);
      const meet = inside ? ` and meet ${andList(inside)}` : what ? ` and see *${what}*` : '';
      out.push({ kind: 'p', spans: md(`[${verb}] to ${INVITE[pl.archetype]}${meet}.`), tone: 'dim' });
    }
    out.push({ kind: 'exits', exits: exitLines(pl) });
    return out;
  }

  // ---------- Moving ----------

  /** The bridges out to the islet a place stands on, in order from the main island (none on the main island). */
  const bridgesTo = (pl: Place) => {
    const isle = geo.islandOf(pl.at.x, pl.at.z);
    if (!isle) return [];
    const seen = new Map<number, Geo['bridges']>([[0, []]]);
    const queue = [0];
    while (queue.length) {
      const at = queue.shift()!;
      for (const b of geo.bridges) {
        const next = b.joins[0] === at ? b.joins[1] : b.joins[1] === at ? b.joins[0] : -1;
        if (next >= 0 && !seen.has(next)) (seen.set(next, [...seen.get(at)!, b]), queue.push(next));
      }
    }
    return seen.get(isle) ?? [];
  };
  /** The way out to the islet a place stands on (null on the main island), by the names you'd know its bridges by. */
  const bridgeTo = (pl: Place, back = false) => {
    const names = bridgesTo(pl).map((b) => (b.style === 'tower' ? 'Tower Bridge' : b.joins.includes(0) ? 'the footbridge' : 'the long bridge'));
    return names.length ? andList(back ? names.reverse() : names) : null;
  };
  /** A gate between you and a place that isn't open for you yet. */
  const shut = (s: EngineState, to: Place) => {
    const here = place(s.at);
    const from = geo.islandOf(here.at.x, here.at.z) ?? 0;
    const there = geo.islandOf(to.at.x, to.at.z) ?? 0;
    return geo.gatesBetween(from, there).find((g) => !s.gates.includes(g.id)) ?? null;
  };

  function narrate(legs: Leg[]): Span[] {
    const isle = (pl: Place) => geo.islandOf(pl.at.x, pl.at.z) ?? 0;
    const from = place(legs[0].from);
    // Starting out on an islet and leaving it: back over its bridges first.
    const back = isle(from) !== isle(place(legs[0].to)) ? bridgeTo(from, true) : null;
    const parts = legs.map((l, i) => {
      const to = place(l.to);
      const dir = DIR_NAMES[l.dir];
      const last = i === legs.length - 1;
      // A bridge only comes into it when the leg goes from one island to another (a walk along an islet stays on it).
      const at = place(l.from);
      const crosses = isle(at) !== isle(to) && !(i === 0 && back);
      const over = crosses ? (isle(to) ? bridgeTo(to) : bridgeTo(at, true)) : null;
      const arrive = (last && ARRIVE[to.archetype]) || (over ? `over ${over} to ${ref(to)}` : `to ${ref(to)}`);
      // Out to an islet there's no grass to cut across: you head for the bridge.
      const way = (paved: boolean) => (over ? 'head' : paved ? 'follow the path' : 'cut across the grass');
      if (i === 0) return `${way(l.paved)} ${dir} ${arrive}`;
      const prev = legs[i - 1];
      const how = over ? 'head ' : l.paved !== prev.paved ? (l.paved ? 'pick up the path ' : 'cut across the grass ') : l.dir === prev.dir ? 'carry on ' : '';
      return `${how}${dir} ${arrive}`;
    });
    const leave = from.archetype === 'pier' ? 'You walk back along the pier, then ' : back ? `You walk back over ${back}, then ` : 'You ';
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
    const gate = shut(s, to);
    if (gate) return atTheGate(s, gate, to);
    const out: Block[] = [];
    if (s.fishing) out.push(dim('You reel in your line and leave the pier.'));
    if (s.inside) out.push(dim(`You say goodbye and head back out of ${ref(place(s.at))}.`));
    if (s.stones) out.push(dim('You drop the stones back on the pile and leave the beach.'));
    out.push({ kind: 'p', spans: narrate(legs) });
    let next: EngineState = { ...s, from: s.at, at: toId, fishing: null, stones: null, pending: null, it: null, inside: false, talking: null };
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

  /** Turned back at a gate that's still shut: the greeter at its desk, and how to get through. */
  function atTheGate(s: EngineState, gate: Geo['gates'][number], to: Place): Result {
    const desk = world.activities.find((a) => a.game === gate.game);
    const isle = geo.islands[gate.side];
    const over = bridgeTo(to)?.split(' and ')[0] ?? 'the bridge';
    const play = `play ${gate.game}`;
    return result(s, [
      p(`You head over ${over} to ${isle?.name ?? 'the islet'}, as far as ${gate.name}. A turnstile stands across the long bridge, and it isn't turning for you yet.`),
      p(`The greeter at the security desk beams at you. “Love the energy! Before I can badge you through, let's align on vocabulary.”`, ' ', ...md(`[Speak corporate](${play}) to get through.`)),
      dim(`${desk?.description ?? ''} You wander back the way you came while you think it over.`.trim()),
    ]);
  }

  /** A gate just opened (the page says when): say so, and point the way through. */
  function opened(s: EngineState, id: string): Result {
    const gate = geo.gates.find((g) => g.id === id);
    const past = gate ? world.places.find((pl) => gate.beyond.includes(geo.islandOf(pl.at.x, pl.at.z) ?? -1)) : undefined;
    if (!gate) return result(s);
    const gates = s.gates.includes(id) ? s.gates : [...s.gates, id];
    return result({ ...s, gates }, [
      { kind: 'p', spans: [`The turnstile beeps and blinks green. You're badged through ${gate.name}, for good. `, ...(past ? [placeSpan(past, cap(ref(past))), ' is waiting at the end of the long bridge.'] : [])], tone: 'alert' },
    ]);
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
    if (!pl.href && !pl.interior) return result(s, [say(`There's nothing to go into here: ${ref(pl)} is all open air. Every path out of it leads somewhere you can, though. Try [MAP].`)]);
    if (s.inside) return result(s, [say(`You're already inside. ${openLine(pl)}`)]);
    // A building with a room: in you go. Anywhere else, going in means the page itself.
    if (pl.interior) {
      const next: EngineState = { ...s, inside: true, talking: null, fishing: null, pending: null, it: null };
      return result(next, [p(`You ${WAY_IN[pl.archetype]}.`), ...describeRoom(next, pl)], [{ type: 'sound', name: 'whoosh' }, { type: 'inside', at: pl.id }]);
    }
    return openPage(s);
  }

  /** Off to the page a place stands for (a memory has none: it's all here). */
  function openPage(s: EngineState): Result {
    const pl = place(s.at);
    if (!pl.href) return result(s, [say(`There's no page for ${ref(pl)}. It isn't something I made, just somewhere I spent a lot of time, so it's all here. [LEAVE] to step back outside.`)]);
    const lead = s.inside ? `You head for the door marked ${project(pl)?.name ?? pl.name}, where the real thing is.` : `You ${WAY_IN[pl.archetype]}.`;
    return result(s, [p(lead)], [{ type: 'sound', name: 'whoosh' }, { type: 'go', place: pl.id }]);
  }

  // ---------- Inside ----------

  const people = (pl: Place) => pl.interior?.people ?? [];
  const things = (pl: Place) => pl.interior?.things ?? [];
  const personKeys = (c: Character) => [c.name, c.id, c.role.replace(/^(the|a|an) /, ''), ...c.aliases].map(key).filter(Boolean);
  const thingKeys = (t: Thing) => t.names.map(key);
  const topicKeys = (t: Topic) => [...t.names, t.id].map(key);
  const personAt = (pl: Place, noun: string) => matchNames(noun, people(pl), personKeys);
  const thingAt = (pl: Place, noun: string) => matchNames(noun, things(pl), thingKeys);
  const talkCmd = (c: Character) => `talk to ${key(c.name)}`;
  const askCmd = (c: Character, t: Topic) => `ask ${key(c.name)} about ${key(t.names[0])}`;
  const openLine = (pl: Place) => (pl.href ? `[OPEN] the page to see *${project(pl)?.name ?? pl.name}* properly, or [LEAVE] to step back outside.` : '[LEAVE] to step back outside.');
  const orList = (spans: Span[], last = ' or ', end = '.') => spans.flatMap((x, i) => [x, i < spans.length - 2 ? ', ' : i === spans.length - 2 ? last : end]);

  /** "Mabel, the librarian, is here, and so is Pip, a reader." */
  function peopleLine(pl: Place): Block {
    const ps = people(pl);
    const spans: Span[] = [];
    ps.forEach((c, i) => {
      if (i) spans.push(', and so is ');
      spans.push({ text: c.name, cmd: talkCmd(c), color: c.color }, `, ${c.role}`);
      if (!i) spans.push(', is here');
    });
    spans.push('. ', ...md(ps.length > 1 ? 'You could [talk](talk) to either.' : `You could [talk to ${ps[0].name}](${talkCmd(ps[0])}).`));
    return p(...spans);
  }

  function describeRoom(_s: EngineState, pl: Place): Block[] {
    const room = pl.interior!;
    return [
      { kind: 'title', text: `Inside ${ref(pl)}`, color: pl.color },
      p(room.description),
      peopleLine(pl),
      { kind: 'p', spans: ['You could examine ', ...orList(room.things.map((t) => cmd(thing(t), `examine ${t.names[0]}`)))], tone: 'dim' },
      { kind: 'p', spans: md(openLine(pl)), tone: 'dim' },
    ];
  }

  const linkSpan = (l: { label: string; href: string } | undefined): Span[] => (l ? [' ', { text: `${l.label} →`, href: l.href }] : []);

  function examineThing(s: EngineState, t: Thing): Result {
    return result({ ...s, it: { place: s.at, noun: t.names[0] } }, [p(t.description, ...linkSpan(t.link))]);
  }

  function examinePerson(s: EngineState, c: Character): Result {
    return result(s, [p(c.looks, ' ', ...md(`[Talk to ${c.name}](${talkCmd(c)}).`))]);
  }

  /** What you can ask someone about, as things to click. */
  function topicsLine(c: Character, lead = 'Ask about '): Block {
    return { kind: 'p', spans: [lead, ...orList(c.topics.map((t) => cmd(t.names[0], askCmd(c, t)))), ' ', ...md('Or say [goodbye](bye).')], tone: 'dim' };
  }

  const whom = (ps: Character[], lead: string) => p(lead, ...orList(ps.map((c) => cmd(c.name, talkCmd(c))), ' or ', '?'));

  function talk(s: EngineState, noun: string): Result {
    const here = place(s.at);
    const ps = people(here);
    if (!s.inside) {
      // Outside: someone out walking by here, or an islander indoors (talking to one takes you in).
      const by = passersBy(here);
      const passer = noun ? walkerNamed(noun, by) : !here.interior && by.length === 1 ? by[0] : undefined;
      if (passer) return chat(s, passer);
      if (!noun && !here.interior && by.length > 1) return result(s, [p('Talk to whom? ', ...orList(by.map((v) => walkerSpan(v)), ' or ', '?'))]);
      if (here.interior && (!noun || personAt(here, noun).length)) {
        const r = enter(s);
        const c = noun ? personAt(here, noun)[0] : ps.length === 1 ? ps[0] : null;
        if (!c) return r;
        const t = greet(r.state, c);
        return result(t.state, [...r.out.slice(0, 1), ...t.out], [...r.effects, ...t.effects]);
      }
      const walking = noun ? walkerNamed(noun) : undefined;
      if (walking) return result(s, [whereWalker(here, walking)]);
      const elsewhere = noun ? world.places.find((x) => personAt(x, noun).length) : undefined;
      if (elsewhere) return result(s, [p(`${personAt(elsewhere, noun)[0].name} is inside `, placeSpan(elsewhere), `, ${DIR_NAMES[travel.towards(here, elsewhere)]} of here.`)]);
      return result(s, [say("There's nobody out here to talk to just now but the gulls, and they only want your sandwich. The islanders are indoors, and the people out walking are somewhere else on their rounds.")]);
    }
    if (!noun) return ps.length === 1 ? greet(s, ps[0]) : result(s, [whom(ps, 'Talk to whom? ')]);
    const c = personAt(here, noun)[0];
    if (c) return greet(s, c);
    const t = thingAt(here, noun)[0];
    if (t) return result(s, [say(`You say hello to ${thing(t)}. It doesn't say anything back, which is fair.`)]);
    const walking = walkerNamed(noun);
    if (walking) return result(s, [whereWalker(here, walking, `Not in here. `)]);
    return result(s, [p(`There's nobody called '${noun}' in here. `, ...orList(ps.map((x) => cmd(x.name, talkCmd(x))), ' and ', ps.length > 1 ? ' are here.' : ' is here.'))]);
  }

  function greet(s: EngineState, c: Character): Result {
    return result({ ...s, talking: c.id, pending: null }, [{ kind: 'title', text: c.name, color: c.color, sub: c.role }, p(`“${c.greeting}”`), topicsLine(c)], [{ type: 'sound', name: 'pop' }]);
  }

  /** "ask mabel about the river", "ask about the river", or just "river" mid-conversation. */
  function ask(s: EngineState, rest: string[], noun: string): Result {
    const here = place(s.at);
    const ps = people(here);
    if (!s.inside) return talk(s, '');
    const i = rest.lastIndexOf('about');
    let personNoun = i > 0 ? nounOf(rest.slice(0, i)) : '';
    let topicNoun = i >= 0 ? nounOf(rest.slice(i + 1)) : noun;
    // "ask mabel" on its own is just talking to her.
    if (i < 0 && personAt(here, noun).length) (personNoun = noun), (topicNoun = '');
    const c = (personNoun && personAt(here, personNoun)[0]) || ps.find((x) => x.id === s.talking) || (ps.length === 1 ? ps[0] : null);
    if (!c) return result(s, [whom(ps, 'Ask whom? ')]);
    if (!topicNoun) return greet(s, c);
    const topic = matchNames(topicNoun, c.topics, topicKeys)[0];
    const talking: EngineState = { ...s, talking: c.id };
    if (!topic) {
      const other = ps.find((x) => x !== c && matchNames(topicNoun, x.topics, topicKeys).length);
      const out: Block[] = [p(`${c.name} thinks about it. “${cap(topicNoun)}? Can't help you there, I'm afraid.”`)];
      if (other) out.push(dim(`${other.name} looks like they might know. `, cmd(`Ask ${other.name}`, `ask ${key(other.name)} about ${topicNoun}`), '.'));
      out.push(topicsLine(c, 'You could ask about '));
      return result(talking, out);
    }
    return result(talking, [p({ text: `${c.name}: `, color: c.color, tone: 'em' }, `“${topic.reply}”`, ...linkSpan(topic.link)), topicsLine(c, 'Ask about ')]);
  }

  function bye(s: EngineState): Result {
    const here = place(s.at);
    const c = people(here).find((x) => x.id === s.talking);
    if (!c) return result(s, [say(`Bye! ${openLine(here)}`)]);
    return result({ ...s, talking: null }, [p({ text: `${c.name}: `, color: c.color, tone: 'em' }, `“${c.farewell}”`), { kind: 'p', spans: md(`[LOOK] around, or [LEAVE] when you're ready.`), tone: 'dim' }]);
  }

  function leave(s: EngineState): Result {
    const here = place(s.at);
    if (!s.inside) return result(s, [say(here.interior ? `You're already outside. [ENTER] to go in.` : "You're already outside. Very outside. There's sky in every direction.")]);
    const next: EngineState = { ...s, inside: false, talking: null, pending: null, it: null };
    return result(next, [p(`You step back out of ${ref(here)}, blinking in the light.`), ...describe(next, here)], [{ type: 'sound', name: 'step' }, { type: 'inside', at: null }]);
  }

  /** Inside, looking at something: the room's own things and people, then a nudge for anything outside. */
  function examineInside(s: EngineState, noun: string, searching: boolean): Result | null {
    const here = place(s.at);
    if (!noun) {
      const all = [...things(here).map((t) => cmd(thing(t), `examine ${t.names[0]}`)), ...people(here).map((c) => cmd(c.name, `examine ${key(c.name)}`))];
      return result(s, [p(searching ? 'Search what? ' : 'Examine what? ', 'You could try ', ...orList(all))]);
    }
    const t = thingAt(here, noun)[0];
    if (t) {
      const r = examineThing(s, t);
      return searching ? result(r.state, [...r.out, dim('Nothing hidden in it, though. The lost words are all outdoors, tucked into things around the island.')]) : r;
    }
    const c = personAt(here, noun)[0];
    if (c) return examinePerson(s, c);
    const sc = lex.scenery(here, noun)[0];
    if (sc) return result(s, [say(`The ${sc.names[0]} is outside. [LEAVE] to have a look.`)]);
    if (lex.places(noun).some((x) => x.id === here.id) || ['room', 'around', 'inside'].includes(noun)) return result(s, describeRoom(s, here));
    return null;
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
    const passer = walkerNamed(noun, passersBy(here));
    if (passer) return result(s, [p(`${cap(passer.name)}, ${passer.doing}. ${passer.looks} `, ...md(`[Talk to ${passer.name}](${chatCmd(passer)}).`))]);
    const walking = walkerNamed(noun);
    if (walking && !lex.places(noun).length) return result(s, [whereWalker(here, walking)]);
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
          row('ENTER', 'enter', 'go inside (or open the page, where there’s no door)'),
          row('TALK TO MABEL', 'talk', 'say hello to someone inside'),
          row('ASK ABOUT THE RIVER', 'talk', 'ask what they know'),
          row('LEAVE', 'leave', 'step back outside (OUT works too)'),
          row('OPEN', 'open', 'the page a place stands for'),
          row('MAP', 'map', 'see the whole island'),
          row('HINT', 'hint', 'a nudge toward a lost word'),
          row('INVENTORY', 'inventory', 'the words you’ve found (I)'),
          row('WARDROBE', 'wardrobe', 'things to wear, one from every house (WEAR, TAKE OFF)'),
          row('WORK · WRITING · ABOUT', 'work', 'the plain facts'),
        ],
      },
      dim(...md(`${cap(spell(total))} lost words are hidden on the island, and you can [FISH] off the pier or [RACE] a boat round it all. [PLAY] lists the island's little games. [BACK] retraces your steps.`)),
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
    const sea = games.signal(s, sig);
    if (sea) return sea;
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

  // ---------- The boat ----------

  /** Three places you'd pass on the water, in the order the course goes round (south, west, north, east). */
  function passing() {
    const start = Math.atan2(boat!.at.z, boat!.at.x);
    const along = (pl: Place) => (((Math.atan2(pl.at.z, pl.at.x) - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const round = world.places.filter((pl) => pl.kind !== 'hub' && pl.id !== boat!.place).sort((a, b) => along(a) - along(b));
    if (round.length <= 3) return round;
    return [0.2, 0.5, 0.8].map((f) => round[Math.floor(f * round.length)]);
  }

  /** Take the speedboat out: a lap told in words, or off to race it for real on the 3D island. */
  function race(s: EngineState, noun: string): Result {
    if (!boat) return result(s, [say('There’s no boat to race. You could swim round, but it’s a long way.')]);
    const pier = place(boat.place);
    const best = s.bestLap !== null ? ` Your best lap, raced on the island, is *${formatLap(s.bestLap)}*.` : '';
    if (/\b(3d|island|real|really|properly)\b/.test(noun) || s.at !== pier.id) {
      if (s.at !== pier.id && !/\b(3d|island|real|really|properly)\b/.test(noun)) {
        const there = walk(s, pier.id);
        return result(there.state, [...there.out, p(...md('The speedboat is tied up below, rocking on the swell. [RACE] to take it out.'))], there.effects);
      }
      return result({ ...s, fishing: null }, [p(...md(`You untie the speedboat and climb in. The island fills in around you, all color and spray: this lap is for real.${best}`))], [{ type: 'boat' }]);
    }
    // A lap in words: a time that changes with every telling.
    const time = 31 + random() * 9;
    const out: Block[] = [
      p('You climb down into the little red speedboat, untie it, and pull the cord. The motor coughs twice and catches.'),
      p('Out past the buoys, a ring of gates runs right round the island. Three, two, one, and you open the throttle.'),
      p(`The bow lifts. You weave through the gates and round the island, past ${andList(passing().map((x) => ref(x)), 'and')}, spray in your face all the way, then the long run home to the pier.`),
      p(...md(`You shoot back over the line by the pier. By your own count, that was about *${formatLap(time)}*.${best}`)),
      dim(...md('For a lap that counts, with a real clock and a ghost of your best: [race it on the 3D island](race in 3d).')),
    ];
    return result({ ...s, fishing: null }, out, [{ type: 'sound', name: 'go' }]);
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
    // "go to dad": wherever they're walking by.
    const walking = walkerNamed(noun);
    if (walking) return nearOf(walking).id === s.at ? chat(s, walking) : walk(s, nearOf(walking).id);
    return unknownNoun(s, noun, 'go to');
  }

  /** Through the portal, into the next view (walking to it first if it's elsewhere). */
  function stepThrough(s: EngineState): Result {
    if (!portal) return result(s, [say('You look around for a portal. Nothing. This is a perfectly ordinary island, apart from everything.')]);
    if (s.at !== portal.place) {
      const there = walk(s, portal.place);
      return result(there.state, [...there.out, p(...md('The portal hums in front of you. [Step through](portal)?'))], there.effects);
    }
    return result(
      { ...s, fishing: null },
      [p("You step up to the ring of light. It shimmers, and in it you see the island a few different ways at once. Pick one and step through.")],
      [{ type: 'portal' }],
    );
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
    // Inside a building, and mid-conversation: the room's own words come first.
    if (s.inside) {
      const r = inside(s, c, noun, raw);
      if (r) return r;
    } else if (c.verb === 'talk' || (c.verb === 'hello' && noun && walkerNamed(noun, passersBy(here)))) return talk(s, noun);
    else if (c.verb === 'ask') return ask(s, c.rest, noun);
    else if (c.verb === 'leave') return leave(s);
    else if (c.verb === 'bye') return result(s, [say('Bye for now. The island will be here.')]);
    const next = [...new Set(travel.exits(here.id).map((e) => e.to))].map(place);
    const fun = egg({ world, here, hub, found: s.found, next, goCmd }, c);
    if (fun) return 'instead' in fun ? dispatch(s, parse(fun.instead), fun.instead) : result(s, fun.out, fun.effects);
    switch (c.verb) {
      case null: {
        // A bare noun: someone walking by is talked to, scenery here is examined, a place is walked to.
        if (walkerNamed(noun, passersBy(here))) return talk(s, noun);
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
      case 'portal':
        return stepThrough(s);
      case 'enter':
        if (c.dir) return goDir(s, c.dir, true);
        if (portal && PORTAL_WORDS.includes(noun)) return stepThrough(s);
        if (!noun || lex.places(noun).some((x) => x.id === s.at) || ['door', 'building'].includes(noun)) return enter(s);
        if (lex.scenery(here, noun).length) return result(s, [say(`You can't get into ${thing(lex.scenery(here, noun)[0])}. [ENTER] on its own goes inside.`)]);
        return goNoun(s, noun, true);
      case 'open': {
        if (here.href && ['page', 'website', 'site'].includes(noun)) return openPage(s);
        if (!noun || noun === 'door' || lex.places(noun).some((x) => x.id === s.at)) return enter(s);
        const sc = lex.scenery(here, noun)[0];
        if (sc) return wordIn(here, sc) ? examine(s, noun, true) : here.href || here.interior ? enter(s) : examine(s, noun, false);
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
          ...games.scores(s),
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
      case 'race':
        return race(s, noun);
      case 'fish':
        return fish(s);
      case 'play':
        return games.play(s, noun);
      case 'throw':
        return games.throwStone(s);
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

  /** A turn inside a building, or null to carry on as outdoors. */
  function inside(s: EngineState, c: Command, noun: string, raw: string): Result | null {
    const here = place(s.at);
    const talking = people(here).find((x) => x.id === s.talking);
    switch (c.verb) {
      case 'talk':
      case 'hello':
        return talk(s, noun);
      case 'ask':
        return ask(s, c.rest, noun);
      case 'bye':
        return bye(s);
      case 'leave':
      case 'back':
      case 'undo':
        return leave(s);
      case 'quit':
        return c.words[0] === 'exit' && !noun ? leave(s) : null;
      case 'look':
        if (c.dir) return result(s, [say(`Walls, mostly. [LEAVE] and you can see for miles.`)]);
        if (!noun || noun === 'around' || noun === 'room') return result(s, describeRoom(s, here));
        return examineInside(s, noun, c.closely);
      case 'examine':
        return examineInside(s, noun, false);
      case 'search':
        return examineInside(s, noun, true);
      case 'read':
        if (!noun) return result(s, [say(here.href ? `There's plenty to read in the real thing. ${openLine(here)}` : `Nothing to read in here but the shop signs. ${openLine(here)}`)]);
        return examineInside(s, noun, false);
      case 'open':
        if (!noun || ['page', 'door', 'website', 'site'].includes(noun) || lex.places(noun).some((x) => x.id === here.id)) return openPage(s);
        return examineInside(s, noun, false);
      case 'enter':
        if (!noun || lex.places(noun).some((x) => x.id === here.id) || ['room', 'building', 'door'].includes(noun)) return enter(s);
        return null;
      case 'take':
        if (thingAt(here, noun).length) return result(s, [say(`Better not. ${people(here)[0].name} is watching, and ${thing(thingAt(here, noun)[0])} lives here.`)]);
        return null;
      case 'fish':
        return result(s, [say('Not indoors. The pier is the place for that.')]);
      case 'where':
        return result(s, [p(`You're inside `, { text: ref(here), color: here.color }, '. ', ...md(openLine(here)))]);
      case 'exits':
        return result(s, [say(`One door, the one you came in by. [LEAVE] to go back out.`)]);
      case 'go':
        if (!c.dir && ['in', 'inside', 'indoors'].includes(noun)) return enter(s);
        if (!c.dir && (personAt(here, noun).length || thingAt(here, noun).length)) return result(s, [say(`You cross the room. ${personAt(here, noun).length ? `[Talk to ${personAt(here, noun)[0].name}](${talkCmd(personAt(here, noun)[0])})?` : `[Examine it](examine ${thingAt(here, noun)[0].names[0]})?`}`)]);
        return null;
      case null: {
        // A bare word: a topic mid-conversation, someone here, or something here.
        if (talking && noun && matchNames(noun, talking.topics, topicKeys).length) return ask(s, ['about', ...noun.split(' ')], noun);
        if (noun && personAt(here, noun).length) return talk(s, noun);
        if (noun && thingAt(here, noun).length) return examineThing(s, thingAt(here, noun)[0]);
        if (['door', 'exit'].includes(key(raw))) return leave(s);
        return null;
      }
      default:
        return null;
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
    progress: {
      found?: string[];
      caught?: string[];
      night?: boolean;
      bestLap?: number | null;
      games?: Record<string, { best: number }>;
      wardrobe?: string[];
      worn?: Partial<Record<OutfitSlot, string>>;
      gates?: string[];
    } = {},
    opts: { inside?: boolean } = {},
  ): EngineState {
    const where = byId.has(at) ? at : hub.id;
    return {
      at: where,
      inside: !!opts.inside && !!place(where).interior,
      talking: null,
      chats: {},
      from: null,
      found: progress.found ?? [],
      caught: progress.caught ?? [],
      night: progress.night ?? false,
      bestLap: progress.bestLap ?? null,
      wardrobe: progress.wardrobe ?? [],
      worn: progress.worn ?? {},
      gates: progress.gates ?? [],
      noticed: [],
      it: null,
      fishing: null,
      casts: 0,
      stones: null,
      bests: Object.fromEntries(Object.entries(progress.games ?? {}).map(([id, g]) => [id, g.best])),
      pending: null,
      hints: {},
      last: null,
      turns: 0,
    };
  }

  /** The opening: a title and a look around (or, coming back out of a place, just the look). */
  function start(s: EngineState, { returning = false, portal: through = false } = {}): Result {
    const here = place(s.at);
    if (returning) return result(s, [p(`You step back out of ${ref(here)}, blinking in the light.`), ...describe(s, here)]);
    if (s.inside && !through) return result(s, [{ kind: 'banner', title: 'The Island', lines: [`An interactive portfolio by ${world.person.name}`, RELEASE] }, ...describeRoom(s, here)]);
    if (through)
      return result(s, [
        { kind: 'banner', title: 'The Island', lines: ['The same island, in words', RELEASE] },
        p('You tumble out of the ring of light and land on the cobbles. The colors drain away, and the island is made of words now. Everything is where you left it.'),
        ...describe(s, here),
      ]);
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
    if (s.stones) return s.stones.sea === 'flat' || s.stones.sea === 'ripple' ? [{ label: 'THROW!', cmd: 'throw', tone: 'urgent' }] : [{ label: 'Throw', cmd: 'throw' }, { label: 'Look', cmd: 'look' }];
    const here = place(s.at);
    const chips: Chip[] = [];
    if (s.inside) {
      const talking = people(here).find((x) => x.id === s.talking);
      if (talking) {
        for (const t of talking.topics) chips.push({ label: `Ask about ${t.names[0]}`, cmd: askCmd(talking, t), tone: 'go' });
        chips.push({ label: 'Goodbye', cmd: 'bye' });
      }
      for (const c of people(here)) if (c !== talking) chips.push({ label: `Talk to ${c.name}`, cmd: talkCmd(c), tone: talking ? undefined : 'go' });
      for (const t of things(here)) chips.push({ label: `Examine ${t.names[0]}`, cmd: `examine ${t.names[0]}` });
      chips.push({ label: 'Look', cmd: 'look' }, ...(here.href ? [{ label: 'Open the page', cmd: 'open' }] : []), { label: 'Leave', cmd: 'leave' }, { label: 'Help', cmd: 'help' });
      return chips;
    }
    if (s.fishing) chips.push({ label: 'Wait', cmd: 'wait' }, { label: 'Reel in', cmd: 'reel' });
    if (s.pending?.kind === 'confirm') chips.push({ label: 'Yes', cmd: 'yes', tone: 'go' });
    if (here.href || here.interior) chips.push({ label: here.kind === 'contact' ? 'Open the bottle' : here.interior ? 'Go inside' : 'Enter', cmd: 'enter', tone: 'go' });
    if (here.kind === 'writing') chips.push({ label: 'Read', cmd: 'read' });
    if (fishing?.place === here.id && !s.fishing) chips.push({ label: 'Fish', cmd: 'fish', tone: 'go' });
    if (boat?.place === here.id) chips.push({ label: 'Race the boat', cmd: 'race', tone: 'go' });
    if (portal?.place === here.id) chips.push({ label: 'Step through the portal', cmd: 'portal', tone: 'go' });
    for (const v of passersBy(here)) chips.push({ label: `Talk to ${v.name}`, cmd: chatCmd(v), tone: 'go' });
    const game = games.here(here.id);
    if (game) chips.push({ label: `Play ${game}`, cmd: `play ${game}`, tone: 'go' });
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
    const sceneryNames = s.inside ? [...things(here).map((t) => t.names[0]), ...people(here).map((c) => key(c.name))] : here.scenery.map((sc) => sc.names[0]);
    const placeNames = world.places.map((pl) => lex.handle(pl));
    const dirs = DIRS.map((d) => DIR_NAMES[d]);
    let pool: string[];
    if (!head.trim()) pool = [...VERB_WORDS.filter((w) => w.length > 2), ...dirs, ...sceneryNames, ...placeNames];
    else if (before === 'go' || before === 'enter' || before === 'cd') pool = [...placeNames, ...dirs];
    else if (before === 'view') pool = ['island', 'map', 'list'];
    else if (before === 'talk') pool = s.inside ? people(here).map((c) => key(c.name)) : [...people(here), ...passersBy(here)].map((c) => key(c.name));
    else if (before === 'ask') {
      const c = people(here).find((x) => x.id === s.talking) ?? people(here)[0];
      pool = c ? [...people(here).map((x) => key(x.name)), ...c.topics.map((t) => key(t.names[0]))] : [];
    }
    else if (before === 'wear' || before === 'remove') pool = world.outfits.filter((o) => s.wardrobe.includes(o.id)).map((o) => key(o.name));
    else pool = [...sceneryNames, ...placeNames];
    const out = [...new Set(pool.filter((w) => w.startsWith(part) && w !== part))];
    return out.map((w) => head + w);
  }

  return { initial, start, run, signal, landed, suggest, complete, opened, describe: (s: EngineState) => (s.inside ? describeRoom(s, place(s.at)) : describe(s, place(s.at))), map: mapBlock };
}

export type Engine = ReturnType<typeof createEngine>;
