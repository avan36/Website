import { describe, expect, it } from 'vitest';
import { plain } from '../output';
import { engine, play } from './helpers';

const through = () => engine.initial('plaza', { gates: ['badge-gate'] });

describe('the badge gate, in words', () => {
  it('turns you back at the turnstile until you speak corporate, and says how to get through', () => {
    const r = play('plaza', 'go to the glass tower');
    expect(r.state.at).toBe('plaza');
    expect(r.text).toMatch(/as far as the badge gate/);
    expect(r.text).toMatch(/align on vocabulary/);
    expect(r.last.out.flatMap((b) => ('spans' in b ? b.spans : [])).some((x) => typeof x !== 'string' && x.cmd === 'play jargon')).toBe(true);
    // Any way of asking for it: by name, alias or direction.
    for (const said of ['go to synergy tower', 'walk to the skyscraper', 'go to the head of vibes']) expect(play('quizmate', said).state.at, said).toBe('quizmate');
  });

  it('plays the badge desk game in the card from wherever you are', () => {
    const r = play('plaza', 'play jargon');
    expect(r.state.at).toBe('plaza');
    expect(r.text).toMatch(/badge desk/);
    expect(r.last.effects).toContainEqual({ type: 'game', id: 'jargon' });
    expect(play('plaza', 'play corporate').last.effects).toContainEqual({ type: 'game', id: 'jargon' });
    // It's on the list of games, but not offered at the tower it leads to.
    expect(play('plaza', 'play').text).toMatch(/PLAY JARGON/);
    expect(play(through(), 'go to the glass tower').text).not.toMatch(/PLAY JARGON/);
  });

  it('opens for good once passed, and the walk goes over both bridges', () => {
    const r = play(through(), 'go to the glass tower');
    expect(r.state.at).toBe('synergy-tower');
    expect(r.text).toMatch(/through the badge gate and all the way along the long bridge to the glass tower/);
    expect(r.text).toMatch(/Synergy Isle is all business/);
    const back = play(r.state, 'go to the plaza');
    expect(back.text).toMatch(/You walk back over the long bridge and the footbridge/);
    // Inside, the Head of Vibes speaks fluent jargon.
    const talk = play(r.state, 'talk to skye', 'ask about kombucha');
    expect(talk.text).toMatch(/circle back/);
  });

  it('says so when the gate opens, and points the way', () => {
    const r = engine.opened(engine.initial('quizmate'), 'badge-gate');
    expect(r.state.gates).toEqual(['badge-gate']);
    expect(plain(r.out)).toMatch(/blinks green/);
    expect(plain(r.out)).toMatch(/glass tower is waiting/i);
    expect(play(r.state, 'go to the glass tower').state.at).toBe('synergy-tower');
  });
});
