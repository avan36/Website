import { describe, expect, it } from 'vitest';
import { LINES, ROUNDS, deal, fluency, pick, reply } from '../jargon';
import { makeRng } from '../rng';

describe('speak corporate', () => {
  it('has lines with one corporate answer and three different wrong ones, no em dashes', () => {
    const ids = LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LINES.length).toBeGreaterThanOrEqual(ROUNDS * 3);
    for (const l of LINES) {
      const all = [l.corporate, ...l.others];
      expect(new Set(all).size, l.id).toBe(4);
      // The plain line is one of the wrong answers: saying it plainly never gets you through.
      expect(l.others, l.id).toContain(l.plain);
      for (const s of [l.plain, ...all]) expect(s, l.id).not.toContain('—');
    }
  });

  it('deals different lines each round, with the corporate answer where it says', () => {
    const desk = deal(makeRng(7));
    expect(desk.questions).toHaveLength(ROUNDS);
    expect(new Set(desk.questions.map((q) => q.line.id)).size).toBe(ROUNDS);
    for (const q of desk.questions) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices[q.answer]).toBe(q.line.corporate);
    }
    // Same seed, same deal; another seed, another.
    expect(deal(makeRng(7))).toEqual(desk);
    expect(deal(makeRng(8)).questions.map((q) => q.line.id)).not.toEqual(desk.questions.map((q) => q.line.id));
  });

  it('counts the corporate picks, and is over after the last round', () => {
    let desk = deal(makeRng(3));
    const first = pick(desk, desk.questions[0].answer);
    expect(first).toMatchObject({ right: true, over: false });
    expect(desk.index).toBe(0); // the old desk is left alone
    desk = first.desk;
    const wrong = (desk.questions[1].answer + 1) % 4;
    const second = pick(desk, wrong);
    expect(second).toMatchObject({ right: false, over: false });
    const third = pick(second.desk, second.desk.questions[2].answer);
    expect(third.over).toBe(true);
    expect(third.desk.right).toBe(2);
    expect(third.desk.picks).toEqual([desk.questions[0].answer, wrong, desk.questions[2].answer]);
    // Nothing left to pick.
    expect(pick(third.desk, 0)).toEqual({ desk: third.desk, right: false, over: true });
  });

  it('says how fluent you were, and what the greeter would have said', () => {
    expect(fluency(3)).toMatch(/fluent/i);
    expect(fluency(2)).toMatch(/lanyard/);
    expect(fluency(1)).toMatch(/plain-spoken/);
    expect(fluency(0)).toMatch(/clear/);
    const q = deal(makeRng(1)).questions[0];
    expect(reply(false, q)).toContain(q.line.corporate);
    expect(reply(true, q)).toContain(q.line.corporate);
  });
});
