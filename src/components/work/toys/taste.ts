// Data and scoring for the busy beer "Taste match" demo. Shared by the
// server render (initial ranking) and the client script (live ranking).

export const AXES = ['Hoppy', 'Malty', 'Sweet', 'Sour', 'Roasty'] as const;
export type Palate = [number, number, number, number, number];

export type Drink = {
  id: string;
  name: string;
  notes: string;
  /** Beer color for the little glass. */
  hue: string;
  /** 0–10 on each axis, in AXES order. Approximate, for illustration. */
  taste: Palate;
};

export const DRINKS: Drink[] = [
  { id: 'wcipa', name: 'West Coast IPA', notes: 'Piney, bitter, bone-dry', hue: '#e0a12e', taste: [9, 4, 2, 1, 1] },
  { id: 'pils', name: 'Czech Pilsner', notes: 'Crisp, bready, spicy hops', hue: '#f2c94c', taste: [5, 5, 3, 1, 0] },
  { id: 'wit', name: 'Belgian Witbier', notes: 'Hazy, orange peel, coriander', hue: '#f6dc8e', taste: [2, 3, 5, 3, 0] },
  { id: 'gose', name: 'Gose', notes: 'Tart, a little salty', hue: '#efd77a', taste: [1, 2, 3, 8, 0] },
  { id: 'stout', name: 'Oatmeal Stout', notes: 'Silky, coffee, chocolate', hue: '#2a1a12', taste: [2, 7, 5, 1, 9] },
  { id: 'barley', name: 'Barleywine', notes: 'Rich, toffee, warming', hue: '#8c3a14', taste: [6, 9, 8, 1, 3] },
];

export const START: Palate = [7, 4, 3, 2, 2];

export const PRESETS: { label: string; palate: Palate }[] = [
  { label: 'Hop head', palate: [9, 3, 2, 1, 1] },
  { label: 'Dark & cozy', palate: [2, 7, 6, 1, 9] },
  { label: 'Sour fan', palate: [1, 2, 3, 9, 0] },
];

/** 0–100. A Gaussian falloff on distance, so close tastes score high and far ones drop away fast. */
export function match(a: readonly number[], b: readonly number[]): number {
  let d2 = 0;
  for (let i = 0; i < a.length; i++) d2 += (a[i] - b[i]) ** 2;
  return Math.max(1, 100 * Math.exp(-d2 / 72));
}

export const RADIUS = 110;

export function point(axis: number, value: number, r = RADIUS): [number, number] {
  const a = ((-90 + axis * 72) * Math.PI) / 180;
  return [Math.cos(a) * (r * value) / 10, Math.sin(a) * (r * value) / 10];
}

export const polygon = (values: readonly number[]) =>
  values.map((v, i) => point(i, v).map((n) => n.toFixed(2)).join(',')).join(' ');
