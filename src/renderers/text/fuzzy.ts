// Near misses: "libary" is the library, "exmaine" is examine. Edit distance
// with transpositions (optimal string alignment), and a tolerance that grows
// with the length of the word, so short words don't match everything.

export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How many slips a word of this length is allowed. */
export const tolerance = (word: string) => (word.length <= 3 ? 0 : word.length <= 5 ? 1 : word.length <= 9 ? 2 : 3);

/**
 * The closest candidate within tolerance, or null. Ties go to the earlier
 * candidate, so callers list what they'd rather suggest first.
 */
export function closest<T>(word: string, candidates: T[], text: (c: T) => string): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  const tol = tolerance(word);
  for (const c of candidates) {
    const t = text(c);
    // A long, unique prefix counts too: "lightho" is the lighthouse.
    const d = word.length >= 4 && t.startsWith(word) ? 0.5 : distance(word, t);
    if (d <= tol && d < bestD) (best = c), (bestD = d);
  }
  return best;
}
