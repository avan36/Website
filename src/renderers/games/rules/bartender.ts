// Rules for "Ask the bartender" (busy beer's island game, played in
// ../bartender.ts). Pick three vibes; each vibe nudges the same five flavor
// axes the Taste match toy on the busy beer page uses, and a small menu is
// scored against the sum. Pure functions only, so it can be unit tested.
import { AXES, type Palate } from '../../../components/work/toys/taste';

export { AXES };
export const MAX_VIBES = 3;

export type Vibe = {
  id: string;
  label: string;
  /** How this vibe leans on each axis, -3..+3, in AXES order. */
  weights: Palate;
};

export const VIBES: Vibe[] = [
  { id: 'cozy', label: 'cozy', weights: [-1, 2, 1, -1, 2] },
  { id: 'crisp', label: 'crisp', weights: [1, -1, -2, -1, -2] },
  { id: 'adventurous', label: 'adventurous', weights: [1, 0, -1, 3, 0] },
  { id: 'fruity', label: 'fruity', weights: [0, -1, 2, 2, -2] },
  { id: 'rainy', label: 'rainy day', weights: [-1, 2, 1, -1, 3] },
  { id: 'patio', label: 'patio', weights: [1, -1, 0, 1, -2] },
  { id: 'bitter', label: 'bitter is fine', weights: [3, 0, -1, 0, 1] },
  { id: 'sweet', label: 'sweet tooth', weights: [-1, 1, 3, 0, 1] },
  { id: 'nightcap', label: 'nightcap', weights: [0, 3, 2, -1, 1] },
  { id: 'thirsty', label: 'just thirsty', weights: [0, 0, -1, 0, -2] },
];

export type MenuDrink = {
  id: string;
  name: string;
  notes: string;
  hue: string;
  /** 0–10 on each axis, in AXES order. Rough, for illustration. */
  taste: Palate;
  /** What the bartender says when sliding this one across. */
  pour: string;
};

export const MENU: MenuDrink[] = [
  { id: 'wcipa', name: 'West Coast IPA', notes: 'Piney, bitter, bone-dry', hue: '#e0a12e', taste: [9, 4, 2, 1, 1], pour: "Piney and dry. It bites back, and you said that's fine." },
  { id: 'hazy', name: 'Hazy IPA', notes: 'Juicy, soft, tropical', hue: '#f5b942', taste: [6, 3, 6, 3, 0], pour: 'Cloudy as a lazy afternoon. Smells like a fruit stand.' },
  { id: 'pils', name: 'Czech Pilsner', notes: 'Crisp, bready, spicy hops', hue: '#f2c94c', taste: [5, 5, 3, 1, 0], pour: 'Poured properly, with a thick cap of foam. Clean and cold.' },
  { id: 'wit', name: 'Belgian Witbier', notes: 'Hazy, orange peel, coriander', hue: '#f6dc8e', taste: [2, 3, 5, 3, 0], pour: 'A little orange peel, a little spice. Sunshine in a glass.' },
  { id: 'gose', name: 'Gose', notes: 'Tart, a little salty', hue: '#efd77a', taste: [1, 2, 3, 8, 0], pour: "Tart, a pinch of salt, a little strange. You asked for it." },
  { id: 'cider', name: 'Dry Cider', notes: 'Apple-sharp, sparkling', hue: '#e8cf6a', taste: [0, 1, 4, 6, 0], pour: 'Sharp as a green apple. No hops anywhere near it.' },
  { id: 'stout', name: 'Oatmeal Stout', notes: 'Silky, coffee, chocolate', hue: '#2a1a12', taste: [2, 7, 5, 1, 9], pour: 'Pull up a stool. This one takes its time.' },
  { id: 'barley', name: 'Barleywine', notes: 'Rich, toffee, warming', hue: '#8c3a14', taste: [6, 9, 8, 1, 3], pour: 'In the small glass. Sip it slowly, it sips back.' },
];

const byId = new Map(VIBES.map((v) => [v.id, v]));
export const vibe = (id: string): Vibe | undefined => byId.get(id);

/** Toggle a vibe in or out of the pick, never holding more than MAX_VIBES. */
export function toggleVibe(picked: readonly string[], id: string): string[] {
  if (!byId.has(id)) return [...picked];
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= MAX_VIBES) return [...picked];
  return [...picked, id];
}

/** The summed axis weights of the picked vibes. */
export function preference(picked: readonly string[]): Palate {
  const out: Palate = [0, 0, 0, 0, 0];
  for (const id of picked) {
    const v = byId.get(id);
    if (!v) continue;
    v.weights.forEach((w, i) => (out[i] += w));
  }
  return out;
}

/**
 * Per-axis contribution: preference × how far the drink sits from the middle
 * (5). A drink low on an axis you lean away from scores as well as one high on
 * an axis you lean toward.
 */
export function contributions(pref: readonly number[], taste: readonly number[]): number[] {
  return pref.map((p, i) => p * (taste[i] - 5));
}

/** 0–100. 50 is "no opinion", 100 is the best a drink could possibly do for this preference. */
export function score(pref: readonly number[], taste: readonly number[]): number {
  const max = pref.reduce((s, p) => s + Math.abs(p) * 5, 0);
  if (max === 0) return 50;
  const raw = contributions(pref, taste).reduce((s, c) => s + c, 0);
  return Math.max(0, Math.min(100, 50 + (50 * raw) / max));
}

export type Ranked = MenuDrink & { score: number };

/** The menu, best first. Ties keep menu order. */
export function rank(picked: readonly string[]): Ranked[] {
  const pref = preference(picked);
  return MENU.map((d) => ({ ...d, score: score(pref, d.taste) })).sort((a, b) => b.score - a.score);
}

export type Reason = {
  axis: (typeof AXES)[number];
  value: number;
  direction: 'high' | 'low';
  because: string[];
};

/** Why the drink fits: its two strongest axes and the vibes that asked for them. */
export function explain(picked: readonly string[], drink: MenuDrink): Reason[] {
  const pref = preference(picked);
  const c = contributions(pref, drink.taste);
  return c
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .map(({ i }) => {
      const sign = Math.sign(pref[i]);
      const because = picked
        .map((id) => byId.get(id)!)
        .filter((v) => v && Math.sign(v.weights[i]) === sign)
        .sort((a, b) => Math.abs(b.weights[i]) - Math.abs(a.weights[i]))
        .map((v) => v.label);
      return { axis: AXES[i], value: drink.taste[i], direction: drink.taste[i] > 5 ? 'high' : 'low', because };
    });
}

/** "a", "a and b", "a, b and c" */
export const listJoin = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function reasonText(r: Reason): string {
  return `${r.direction === 'high' ? 'High' : 'Low'} on ${r.axis.toLowerCase()} (${r.value}/10) because you chose ${listJoin(r.because.map((b) => `“${b}”`))}.`;
}

/** "+2", "−1", "0" with a real minus sign. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
