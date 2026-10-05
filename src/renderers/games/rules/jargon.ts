// Rules for "Speak corporate", the badge desk's game at the gate out to
// Synergy Isle (played in ../jargon.ts). Each round shows something plain and
// four ways to say it; one of them is the corporate way, and that's the one
// the turnstile wants. All made up, all gentle: the joke is on the words.
// Pure functions only.

import { shuffle, type Rng } from './rng';

/** A plain thing to say, the corporate way to say it, and three ways the turnstile won't take. */
export type Line = {
  id: string;
  plain: string;
  corporate: string;
  /** Wrong answers: the plain way again, too casual, too old-fashioned. */
  others: [string, string, string];
};

export const LINES: Line[] = [
  { id: 'later', plain: "Let's talk later.", corporate: "Let's circle back and take this offline.", others: ["Let's talk later.", 'Laters!', 'Anon, we shall converse.'] },
  { id: 'busy', plain: "I'm busy.", corporate: "I don't have the bandwidth right now.", others: ["I'm busy.", 'Swamped, sorry!', 'I am much occupied, good sir.'] },
  { id: 'idea', plain: 'Good idea.', corporate: "Love that. Let's double-click on it.", others: ['Good idea.', 'Ooh, nice one.', 'A capital notion, old bean.'] },
  { id: 'meet', plain: "Let's meet.", corporate: "Let's find time to sync.", others: ["Let's meet.", 'Coffee?', 'Let us convene at the tavern.'] },
  { id: 'easy', plain: "It's easy.", corporate: "It's low-hanging fruit.", others: ["It's easy.", 'Piece of cake.', 'Tis a trifle.'] },
  { id: 'who', plain: "Who's doing this?", corporate: 'Who owns this end to end?', others: ["Who's doing this?", 'Not it!', 'Who shall undertake this task?'] },
  { id: 'agree', plain: 'I agree.', corporate: 'Plus one to that.', others: ['I agree.', 'Yep.', 'Verily, I concur.'] },
  { id: 'help', plain: 'Can you help?', corporate: 'Could you lend some cycles to this?', others: ['Can you help?', 'Help me out?', 'Wilt thou aid me?'] },
  { id: 'point', plain: "That's the main thing.", corporate: "That's our North Star.", others: ["That's the main thing.", "That's the big one.", 'Therein lies the crux.'] },
  { id: 'better', plain: "Let's make it better.", corporate: "Let's move the needle on this.", others: ["Let's make it better.", "Let's fix it up.", 'Let us improve upon it.'] },
  { id: 'news', plain: "Here's what happened.", corporate: 'Quick update on learnings.', others: ["Here's what happened.", 'So, funny story.', 'Hear ye, hear ye.'] },
  { id: 'stop', plain: "Let's stop for today.", corporate: "Let's park this and pick it up at the next touchpoint.", others: ["Let's stop for today.", "I'm done, bye!", 'Let us adjourn.'] },
];

/** Rounds in a go at the desk. */
export const ROUNDS = 3;

/** One round: the plain line, and four choices in a shuffled order. `answer` is the corporate one's index. */
export type Question = { line: Line; choices: string[]; answer: number };

/** A go at the desk: its rounds, which one you're on, and how many you got right. */
export type Desk = { questions: Question[]; index: number; right: number; picks: (number | null)[] };

/** Deal a go: `n` different lines, each with its choices shuffled. */
export function deal(rng: Rng, n = ROUNDS, lines: readonly Line[] = LINES): Desk {
  const questions = shuffle(lines, rng)
    .slice(0, n)
    .map((line) => {
      const choices = shuffle([line.corporate, ...line.others], rng);
      return { line, choices, answer: choices.indexOf(line.corporate) };
    });
  return { questions, index: 0, right: 0, picks: [] };
}

/** Pick a choice for the current round. Returns the next desk and whether it was the corporate one. Picking after the last round changes nothing. */
export function pick(desk: Desk, choice: number): { desk: Desk; right: boolean; over: boolean } {
  const q = desk.questions[desk.index];
  if (!q) return { desk, right: false, over: true };
  const right = choice === q.answer;
  const next: Desk = { ...desk, index: desk.index + 1, right: desk.right + (right ? 1 : 0), picks: [...desk.picks, choice] };
  return { desk: next, right, over: next.index >= desk.questions.length };
}

/** How fluent that was, by how many of `total` you got right. */
export function fluency(right: number, total = ROUNDS): string {
  if (right >= total) return 'Fully fluent. You could run an offsite';
  if (right >= total - 1) return 'Conversational corporate. Good enough for a lanyard';
  if (right > 0) return 'A little too plain-spoken for the turnstile';
  return 'Refreshingly clear. The turnstile is not a fan';
}

/** What the greeter says after each pick. */
export function reply(right: boolean, q: Question): string {
  return right ? `“Love it. ${q.line.corporate}” The greeter nods, very slowly.` : `The greeter winces kindly. “Close! We'd say: ${q.line.corporate}”`;
}
