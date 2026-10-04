// Rules for "Spot the dark pattern" (Global Privacy Control's island game,
// played in ../patterns.ts). The mock site and every trick in it are made up;
// the GPC notes describe what the signal does and doesn't do. Pure functions only.

export type Place = 'banner' | 'signup';

/**
 * How Global Privacy Control bears on a trick:
 * - 'covers'  the sale/share opt-out the trick fights over is decided by GPC
 * - 'partly'  GPC handles the sale/share part, but not the rest of the trick
 * - 'no'      GPC has nothing to say about it
 */
export type GpcVerdict = 'covers' | 'partly' | 'no';

export type Trick = {
  id: string;
  place: Place;
  name: string;
  /** One line, shown on the annotation pin. */
  what: string;
  gpc: GpcVerdict;
  gpcNote: string;
};

export const TRICKS: Trick[] = [
  {
    id: 'tiny-manage',
    place: 'banner',
    name: 'Lopsided buttons',
    what: '“Accept all” is a big bright button; “Manage options” is tiny gray text you could miss.',
    gpc: 'partly',
    gpcNote: 'With GPC on, the opt-out of selling or sharing is already sent, so you never need to dig through “Manage options” for it. Other cookies (analytics, “functional”) still sit behind that link.',
  },
  {
    id: 'hidden-reject',
    place: 'banner',
    name: 'Buried reject',
    what: 'The way to say no is a plain-text phrase tucked into the paragraph, not a button.',
    gpc: 'partly',
    gpcNote: 'GPC says “don’t sell or share my data” on every request, whether or not you find the hidden link. It isn’t a general “reject all cookies”, though.',
  },
  {
    id: 'flip-toggle',
    place: 'banner',
    name: 'Misleading toggle',
    what: 'The “Do not sell” switch looks on, but the status says sharing is enabled. Which way is off?',
    gpc: 'covers',
    gpcNote: 'This is exactly the setting GPC speaks to. Under California’s rules a site has to treat GPC as an opt-out of sale and sharing even if its own toggle says otherwise. It may ask you to confirm, but it can’t just leave the switch as it was.',
  },
  {
    id: 'prechecked',
    place: 'signup',
    name: 'Pre-checked box',
    what: '“Share my profile with trusted partners” arrives already ticked.',
    gpc: 'partly',
    gpcNote: 'Handing your profile to partners is a sale or share, so GPC opts you out of it. The site’s own marketing emails are another matter, and GPC doesn’t unsubscribe you.',
  },
  {
    id: 'bundled',
    place: 'signup',
    name: 'Bundled consent',
    what: 'One required checkbox agrees to the Terms and to selling your data for ads.',
    gpc: 'covers',
    gpcNote: 'GPC opts you out of the sale and sharing part, whatever the checkbox says. California also says agreement obtained through dark patterns doesn’t count as consent.',
  },
  {
    id: 'confirmshame',
    place: 'signup',
    name: 'Confirmshaming',
    what: 'The decline link guilt-trips you: “No thanks, I like wasting food.”',
    gpc: 'no',
    gpcNote: 'GPC can’t change what a page says to you. It only settles whether your data gets sold or shared.',
  },
  {
    id: 'countdown',
    place: 'signup',
    name: 'Fake countdown',
    what: 'The “offer ends” timer quietly starts over when it hits zero.',
    gpc: 'no',
    gpcNote: 'Fake urgency is a consumer-protection problem, not a data-sharing one. GPC doesn’t touch it.',
  },
  {
    id: 'scarcity',
    place: 'signup',
    name: 'Fake scarcity',
    what: '“Only 3 free spots left today!” on a newsletter that can have unlimited readers.',
    gpc: 'no',
    gpcNote: 'Same as the timer: pressure, not data collection. Outside what GPC does.',
  },
];

/** Honest bits of the mock page: clicking them earns a "looks fine" instead of a point. */
export const DECOYS: { id: string; why: string }[] = [
  { id: 'email', why: 'An email field on a signup form is fair. They do need it to send a newsletter.' },
  { id: 'policy', why: 'A visible link to the privacy policy is good practice.' },
  { id: 'submit', why: 'A clearly labeled submit button. Nothing sneaky there.' },
  { id: 'brand', why: 'Just the logo.' },
];

const trickById = new Map(TRICKS.map((t) => [t.id, t]));
const decoyById = new Map(DECOYS.map((d) => [d.id, d]));
export const trick = (id: string) => trickById.get(id);

export type FlagResult =
  | { kind: 'found'; trick: Trick }
  | { kind: 'again'; trick: Trick }
  | { kind: 'decoy'; why: string }
  | { kind: 'unknown' };

/** Flag a spot. Returns the new found-set (never mutated in place) and what happened. */
export function flag(found: ReadonlySet<string>, id: string): { found: Set<string>; result: FlagResult } {
  const next = new Set(found);
  const t = trickById.get(id);
  if (t) {
    if (found.has(id)) return { found: next, result: { kind: 'again', trick: t } };
    next.add(id);
    return { found: next, result: { kind: 'found', trick: t } };
  }
  const d = decoyById.get(id);
  if (d) return { found: next, result: { kind: 'decoy', why: d.why } };
  return { found: next, result: { kind: 'unknown' } };
}

export const total = TRICKS.length;
export const isComplete = (found: ReadonlySet<string>) => TRICKS.every((t) => found.has(t.id));
export const progressText = (found: ReadonlySet<string>) => `${found.size} of ${total} found`;

/** A light grade line for the reveal. */
export function verdict(n: number): string {
  if (n >= total) return 'Every last one. You’d make a good crawler.';
  if (n >= total - 2) return 'Sharp eyes. Here are the ones that got away.';
  if (n >= total / 2) return 'Not bad. These designs are built to slide past you.';
  return 'Don’t feel bad. These are designed so you won’t notice them.';
}

export const countBy = (v: GpcVerdict) => TRICKS.filter((t) => t.gpc === v).length;

/**
 * The fake timer: one second down, and back to the start when it runs out.
 * That reset is the giveaway.
 */
export const COUNTDOWN_START = 4 * 60 + 59;
export const tick = (s: number): number => (s <= 0 ? COUNTDOWN_START : s - 1);
export const mmss = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export type GpcState = 'on' | 'off' | 'unsupported';

/** Reads navigator.globalPrivacyControl. Browsers that don't know about GPC leave it undefined. */
export function gpcState(nav: { globalPrivacyControl?: unknown } | undefined): GpcState {
  if (!nav || !('globalPrivacyControl' in nav) || nav.globalPrivacyControl === undefined) return 'unsupported';
  return nav.globalPrivacyControl === true ? 'on' : 'off';
}
