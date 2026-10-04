// How big the map's pixels are, and where the camera may look. Pure, so the
// rules are tested without a screen.

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Device pixels per map pixel. Always a whole number so every map pixel is
 * the same crisp square. Phones get big chunky pixels (about 130 across the
 * short side, like a Game Boy); a desktop sees most of the island at once
 * (about 330 map pixels, 40 world units, top to bottom).
 */
export function pickScale(cssW: number, cssH: number, dpr: number) {
  const short = Math.max(1, Math.min(cssW, cssH));
  const t = clamp((short - 420) / (900 - 420), 0, 1);
  const across = 132 + t * (330 - 132);
  return Math.max(1, Math.round((short / across) * dpr));
}

/**
 * Keep a view of half-size `half` inside [lo, hi] along one axis. A view
 * bigger than the range is centred on it.
 */
export function clampAxis(c: number, half: number, lo: number, hi: number) {
  if (hi - lo <= half * 2) return (lo + hi) / 2;
  return clamp(c, lo + half, hi - half);
}

/** Frame-rate independent easing toward a target (rate per second). */
export const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);
