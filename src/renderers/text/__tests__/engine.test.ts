import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distance, closest } from '../fuzzy';
import { plain, type Effect } from '../output';
import { createLexicon } from '../lexicon';
import { engine, play, posts, say, world } from './helpers';

const effects = (r: { effects: Effect[] }, type: Effect['type']) => r.effects.filter((e) => e.type === type);
const lex = createLexicon(world);

describe('starting out', () => {
  it('opens with a title, a hello and a look around', () => {
    const r = engine.start(engine.initial('plaza'));
    expect(r.out[0].kind).toBe('banner');
    const text = plain(r.out);
    expect(text).toMatch(/Hi, I'm Ambrose/);
    expect(text).toMatch(/The plaza/);
    expect(r.out.some((b) => b.kind === 'exits')).toBe(true);
  });

  it('welcomes you back out of a place without the title', () => {
    const r = engine.start(engine.initial('etymon'), { returning: true });
    expect(r.out[0].kind).toBe('p');
    expect(plain(r.out)).toMatch(/step back out of the old library/);
  });

  it('falls back to the hub for a place that does not exist', () => {
    expect(engine.initial('atlantis').at).toBe('plaza');
  });
});

describe('the portal', () => {
  it('stands in the plaza, and stepping through opens its menu of views', () => {
    expect(say('plaza', 'look')).toMatch(/ring of violet light/);
    for (const said of ['portal', 'step through', 'enter the portal', 'go through the portal', 'step into the portal']) {
      const r = play('plaza', said).last;
      expect(effects(r, 'portal'), said).toEqual([{ type: 'portal' }]);
    }
    expect(say('plaza', 'examine the portal')).toMatch(/chunky pixels/);
  });

  it('walks you to the plaza first from anywhere else', () => {
    const r = play('privacy-research', 'portal').last;
    expect(effects(r, 'portal')).toEqual([]);
    expect(r.state.at).toBe('plaza');
    expect(plain(r.out)).toMatch(/Step through/);
  });

  it('greets you on the other side', () => {
    const r = engine.start(engine.initial('plaza'), { portal: true });
    expect(plain(r.out)).toMatch(/tumble out of the ring of light/);
  });
});

describe('looking', () => {
  it('describes the place, its scenery, its way in and its exits', () => {
    const text = say('middle-place', 'look');
    expect(text).toMatch(/snug log cabin/);
    expect(text).toMatch(/examine the journal, the firewood, the chair or the lantern/);
    expect(text).toMatch(/ENTER to step inside and see middle place/);
    expect(text).toMatch(/north: the old library/);
  });

  it('examines scenery by any of its names, with or without a verb', () => {
    expect(say('busy-beer', 'examine the sign')).toMatch(/Know what you'll love/);
    expect(say('busy-beer', 'x swinging sign')).toMatch(/Know what you'll love/);
    expect(say('busy-beer', 'look at the kegs')).toMatch(/Oak barrels/);
    expect(say('busy-beer', 'mugs')).toMatch(/Two mugs/);
  });

  it('says where something is when it is somewhere else', () => {
    expect(say('plaza', 'x journal')).toMatch(/There's no journal here\. The cabin has one, north-west of here/);
    expect(say('plaza', 'examine lighthouse')).toMatch(/The lighthouse: A crawler/);
  });

  it('looks in a direction', () => {
    expect(say('plaza', 'look north')).toMatch(/To the north: the ancient tree/);
  });
});

describe('moving', () => {
  it('follows a compass direction along a route', () => {
    const { state, last } = play('plaza', 'n');
    expect(state.at).toBe('map-of-evolution');
    expect(effects(last, 'move')).toEqual([{ type: 'move', place: 'map-of-evolution' }]);
    expect(plain(last.out)).toMatch(/up the gentle rise to the ancient tree/);
  });

  it("says when you can't go that way, and which ways you can", () => {
    const { state, text } = play('blog', 'south');
    expect(state.at).toBe('blog');
    expect(text).toMatch(/You can't go that way\. Paths lead north/);
  });

  it('asks which one when two exits share a direction, and takes the answer', () => {
    const shared = play('plaza', 'exits').text.split('\n').find((l) => / or /.test(l))!;
    const dir = shared.split(':')[0];
    const ask = play('plaza', dir);
    expect(ask.state.at).toBe('plaza');
    expect(ask.text).toMatch(/Which one\?/);
    expect(play(ask.state, '2').state.at).not.toBe('plaza');
    const named = play(ask.state, 'the lighthouse');
    if (dir === 'north-east') expect(named.state.at).toBe('privacy-research');
  });

  it('walks to a named place by the shortest route, telling you the way', () => {
    const { state, text } = play('contact', 'walk to the library please');
    expect(state.at).toBe('etymon');
    expect(text).toMatch(/^You cut across the grass north to the schoolhouse, carry on north to the cabin, then carry on north to the old library\./);
  });

  it('knows places by title, name, alias or project', () => {
    for (const [said, id] of [
      ['go to the old library', 'etymon'],
      ['go to etymon', 'etymon'],
      ['go to the pub', 'busy-beer'],
      ['visit map of evolution', 'map-of-evolution'],
      ['lighthouse', 'privacy-research'],
      ['take me to the beach', 'contact'],
      ['cd quizmate', 'quizmate'],
    ] as const)
      expect(play('plaza', said).state.at, said).toBe(id);
  });

  it('asks when a name means two places', () => {
    const r = play('plaza', 'go to the tower');
    expect(r.text).toMatch(/Do you mean the old library or the lighthouse\?/);
    expect(play(r.state, 'lighthouse').state.at).toBe('privacy-research');
  });

  it('goes back the way you came', () => {
    const { state } = play('plaza', 'go to the cabin', 'go to the library', 'back');
    expect(state.at).toBe('middle-place');
    expect(say('plaza', 'back')).toMatch(/haven’t been anywhere else yet/);
  });

  it('reels in your line if you walk off while fishing', () => {
    const r = play('blog', 'fish', 'n');
    expect(r.state.fishing).toBeNull();
    expect(r.text).toMatch(/reel in your line/);
  });
});

describe('going in', () => {
  it('opens the page a place stands for', () => {
    for (const said of ['enter', 'go in', 'go inside', 'open door']) {
      const r = play('etymon', said).last;
      expect(effects(r, 'go'), said).toEqual([{ type: 'go', place: 'etymon' }]);
    }
    expect(effects(play('contact', 'open the bottle').last, 'go')).toEqual([{ type: 'go', place: 'contact' }]);
  });

  it('walks there first when you name somewhere else', () => {
    const r = play('plaza', 'enter the taproom').last;
    expect(effects(r, 'move')).toEqual([{ type: 'move', place: 'busy-beer' }]);
    expect(effects(r, 'go')).toEqual([{ type: 'go', place: 'busy-beer' }]);
  });

  it('has nothing to open at the hub', () => {
    const r = play('plaza', 'enter').last;
    expect(effects(r, 'go')).toEqual([]);
    expect(plain(r.out)).toMatch(/all open air/);
  });

  it('opens a post by title', () => {
    expect(effects(play('plaza', 'read the first post').last, 'open')).toEqual([{ type: 'open', href: '/blog/first' }]);
  });
});

describe('lost words', () => {
  it('hints at a hidden word when you examine its hiding place, and finds it when you look again', () => {
    const first = play('busy-beer', 'examine barrels');
    expect(first.text).toMatch(/Something about the barrels catches your eye/);
    expect(effects(first.last, 'find')).toEqual([]);
    const again = play(first.state, 'examine barrels');
    expect(effects(again.last, 'find')).toEqual([{ type: 'find', id: 'crapulous' }]);
    expect(again.last.out.find((b) => b.kind === 'word')).toMatchObject({ word: 'crapulous', first: 1535, died: 1900 });
  });

  it('finds a word straight away when you search, or look closely', () => {
    expect(effects(play('quizmate', 'search the chalkboard').last, 'find')).toEqual([{ type: 'find', id: 'ultracrepidarian' }]);
    expect(effects(play('quizmate', 'examine the chalkboard closely').last, 'find')).toEqual([{ type: 'find', id: 'ultracrepidarian' }]);
    expect(effects(play('quizmate', 'look behind the blackboard').last, 'find')).toEqual([{ type: 'find', id: 'ultracrepidarian' }]);
    expect(effects(play('middle-place', 'read the journal').last, 'find')).toEqual([{ type: 'find', id: 'overmorrow' }]);
    expect(effects(play('blog', 'x boat', 'search it').last, 'find')).toEqual([{ type: 'find', id: 'curglaff' }]);
  });

  it('every one of them can be found from the hub, by typing alone', () => {
    let state = engine.initial('plaza');
    const found: string[] = [];
    for (const lw of world.lostWords) {
      const pl = world.places.find((p) => p.id === lw.place)!;
      const sc = pl.scenery.find((s) => s.id === lw.in)!;
      const r = play(state, `go to ${lex.handle(pl)}`, `search the ${sc.names[0]}`);
      expect(r.results[0].state.at, lw.id).toBe(pl.id);
      expect(effects(r.last, 'find'), lw.id).toEqual([{ type: 'find', id: lw.id }]);
      found.push(lw.id);
      state = r.state;
    }
    expect(state.found).toEqual(found);
    expect(state.night).toBe(true);
    expect(play(state, 'i').text).toMatch(/8 of 8/);
  });

  it('says so when a word was already found there', () => {
    const r = play('eqoscan', 'search bins');
    const again = play({ ...r.state, noticed: [] }, 'search bins');
    expect(effects(again.last, 'find')).toEqual([]);
    expect(play(r.state, 'x bins').text).toMatch(/This is where you found emmet/);
  });

  it('turns up nothing in scenery that hides nothing', () => {
    const r = play('busy-beer', 'search the sign');
    expect(effects(r.last, 'find')).toEqual([]);
    expect(r.text).toMatch(/You search the sign/);
  });

  it('hints toward the nearest unfound word, more plainly each time', () => {
    const r = play('eqoscan', 'hint', 'hint', 'hint');
    const [a, b, c] = r.results.map((x) => plain(x.out));
    expect(a).toMatch(/Follow the ants at the recycling depot\. It’s somewhere right here/);
    expect(b).toMatch(/Try examining the bins/);
    expect(c).toMatch(/Search bins/);
    const after = play(r.state, 'search bins', 'hint').text;
    expect(after).toMatch(/lighthouse/i); // the next nearest
  });

  it('keeps an inventory', () => {
    expect(say('plaza', 'i')).toMatch(/pockets are empty/);
    expect(play('eqoscan', 'search bins', 'inventory').text).toMatch(/emmet {2}an ant/);
  });
});

describe('fishing', () => {
  it("needs the pier", () => {
    const r = play('plaza', 'fish');
    expect(r.text).toMatch(/You'd need to be on the pier\. It's south of here/);
    expect(r.last.effects).toEqual([]);
  });

  it('casts, waits for a bite, and lands a post if you reel in time', () => {
    const cast = play('blog', 'cast a line');
    const timer = effects(cast.last, 'timer')[0] as Extract<Effect, { type: 'timer' }>;
    expect(timer.signal.name).toBe('bite');
    expect(cast.state.fishing).toEqual({ phase: 'waiting', cast: 1 });

    const bite = engine.signal(cast.state, timer.signal);
    expect(plain(bite.out)).toMatch(/Something’s biting! Type REEL/);
    expect(bite.state.fishing?.phase).toBe('biting');
    expect(engine.suggest(bite.state)).toEqual([{ label: 'REEL!', cmd: 'reel', tone: 'urgent' }]);

    const reel = engine.run(bite.state, 'reel');
    expect(reel.effects).toEqual([{ type: 'fish' }]);
    expect(reel.state.fishing).toBeNull();

    const landed = engine.landed(reel.state, posts[0], true);
    expect(landed.state.caught).toEqual(['first']);
    expect(landed.out.find((b) => b.kind === 'catch')).toMatchObject({ title: 'First post', href: '/blog/first', fresh: true });
  });

  it('lets the fish get away if you are too slow', () => {
    const cast = play('blog', 'fish');
    const bite = engine.signal(cast.state, { name: 'bite', cast: 1 });
    const gone = engine.signal(bite.state, { name: 'escape', cast: 1 });
    expect(plain(gone.out)).toMatch(/got away/);
    expect(gone.state.fishing).toBeNull();
    expect(engine.run(gone.state, 'reel').effects).toEqual([]);
  });

  it('comes back empty if you reel in before a bite', () => {
    const r = play('blog', 'fish', 'reel');
    expect(r.text).toMatch(/too soon/);
    expect(r.last.effects).toEqual([]);
  });

  it('ignores timers from an earlier cast', () => {
    const r = play('blog', 'fish', 'reel', 'fish');
    expect(engine.signal(r.state, { name: 'bite', cast: 1 }).out).toEqual([]);
  });
});

describe('the speedboat', () => {
  it('is waiting at the pier, with a chip to race it', () => {
    expect(say('blog', 'look')).toContain('speedboat');
    expect(engine.suggest(engine.initial('blog')).map((c) => c.cmd)).toContain('race');
  });

  it('walks you to the pier first', () => {
    const r = play('plaza', 'take the boat');
    expect(r.state.at).toBe('blog');
    expect(r.text).toContain('RACE');
  });

  it('tells a lap in words at the pier, and offers the real thing', () => {
    const r = play('blog', 'race');
    expect(r.text).toMatch(/0:\d\d\.\d\d/);
    expect(r.text).toContain('race it on the 3D island');
    expect(effects(r.last, 'boat')).toEqual([]);
  });

  it('sends you to the 3D island to race it for real', () => {
    const r = play('blog', 'race in 3d');
    expect(effects(r.last, 'boat')).toEqual([{ type: 'boat' }]);
  });

  it('knows your best lap from the island', () => {
    const s = engine.initial('blog', { bestLap: 41.25 });
    expect(play(s, 'race').text).toContain('0:41.25');
  });

  it('understands the ways of asking', () => {
    for (const c of ['race', 'take the boat', 'get in the boat', 'board the boat', 'race round the island', 'sail']) expect(play('blog', c).text, c).toMatch(/speedboat|motor/);
  });
});

describe('not quite understood', () => {
  it('suggests the place you probably meant, and goes there on yes', () => {
    const r = play('plaza', 'libary');
    expect(r.text).toBe("There's no 'libary' here. Did you mean the library?");
    expect(play(r.state, 'yes').state.at).toBe('etymon');
  });

  it('catches a slip in the verb', () => {
    const r = play('middle-place', 'exmaine jounral');
    expect(r.text).toMatch(/Did you mean/);
    expect(distance('exmaine', 'examine')).toBe(1);
  });

  it('suggests scenery that is here', () => {
    expect(say('busy-beer', 'x barels')).toMatch(/Did you mean the barrels\?/);
  });

  it('admits it does not know a word', () => {
    expect(say('plaza', 'flarb')).toMatch(/flarb/);
    expect(say('plaza', '')).toBe('I beg your pardon?');
  });

  it("doesn't match short words to everything", () => {
    expect(closest('cat', ['crab', 'chair'], (x) => x)).toBeNull();
    expect(closest('lightho', ['lighthouse', 'library'], (x) => x)).toBe('lighthouse');
  });
});

describe('the rest', () => {
  it('lists work, writing and the person', () => {
    expect(say('plaza', 'work')).toMatch(/Etymon {2}An animated history of English/);
    expect(say('plaza', 'writing')).toMatch(/Second post {2}March 4, 2026/);
    expect(say('plaza', 'about')).toMatch(/Ambrose Vannier \(Software developer\)/);
  });

  it('walks you to the bottle when you want to get in touch', () => {
    const r = play('plaza', 'contact');
    expect(r.state.at).toBe('contact');
    expect(r.text).toMatch(/I read every message/);
  });

  it('switches views', () => {
    expect(play('plaza', 'view map').last.effects).toEqual([{ type: 'view', id: 'map' }]);
    expect(play('plaza', 'switch to the island').last.effects).toEqual([{ type: 'view', id: 'island' }]);
    expect(play('plaza', 'map view').last.effects).toEqual([{ type: 'view', id: 'map' }]);
  });

  it('repeats the last command', () => {
    const r = play('plaza', 'n', 'again');
    expect(r.state.at).toBe('map-of-evolution');
    expect(r.text).toMatch(/You can't go that way/);
    expect(say('plaza', 'g')).toMatch(/haven’t done anything yet/);
  });

  it('has a few tasteful secrets', () => {
    expect(say('plaza', 'xyzzy')).toMatch(/hollow voice/);
    expect(say('plaza', 'sudo make me a sandwich')).toMatch(/reported to the crab/);
    expect(say('etymon', 'pwd')).toBe('/island/etymon');
    expect(say('etymon', 'ls')).toMatch(/bookshelf/);
    expect(play('etymon', 'cd ..').state.at).toBe('plaza');
    expect(play('quizmate', 'ring the bell').last.effects).toContainEqual({ type: 'sound', name: 'bell' });
  });

  it('suggests what to tap next', () => {
    const chips = engine.suggest(engine.initial('blog'));
    expect(chips.map((c) => c.cmd)).toEqual(expect.arrayContaining(['enter', 'fish', 'north', 'look', 'examine rowboat', 'map', 'hint']));
  });

  it('completes the word being typed', () => {
    const s = engine.initial('etymon');
    expect(engine.complete(s, 'exam')).toContain('examine');
    expect(engine.complete(s, 'x book')).toContain('x bookshelf');
    expect(engine.complete(s, 'go to light')).toContain('go to lighthouse');
  });
});

describe('the voice', () => {
  it('never uses an em dash, in anything it says', () => {
    const everything = [
      'look', 'help', 'map', 'hint', 'i', 'score', 'about', 'work', 'writing', 'where', 'exits', 'xyzzy', 'plugh', 'zork', 'hello',
      'sudo su', 'ls', 'pwd', 'quit', 'save', 'swim', 'jump', 'dance', 'sing', 'shout', 'sleep', 'wait', 'take apple', 'climb',
      'sit', 'eat apple', 'drink', 'knock', 'ring', 'view', 'view text', 'night', 'flarb', 'libary', 'x me', 'back', 'undo', 'yes', 'no',
    ];
    const lines: string[] = [];
    for (const p of world.places) {
      const r = play(p.id, ...everything, ...p.scenery.flatMap((s) => [`x ${s.names[0]}`, `search ${s.names[0]}`, `x ${s.names[0]}`]), 'fish', 'reel', 'enter');
      lines.push(r.all, plain(engine.start(r.state).out), plain(engine.start(r.state, { returning: true }).out));
    }
    const fishing = play('blog', 'fish');
    const bite = engine.signal(fishing.state, { name: 'bite', cast: 1 });
    lines.push(plain(bite.out), plain(engine.signal(bite.state, { name: 'escape', cast: 1 }).out), plain(engine.landed(bite.state, posts[0], false).out));
    const text = lines.join('\n');
    expect(text.length).toBeGreaterThan(20000);
    expect(text).not.toContain('—');
  });

  it('has no em dash anywhere in its source', () => {
    const dir = join(__dirname, '..');
    for (const f of readdirSync(dir).filter((x) => /\.(ts|css)$/.test(x))) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('—');
  });
});
