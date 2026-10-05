// How much polish the island's picture gets: the effects drawn over the scene
// (see post.ts), picked for the device, and stepped down if frames run slow.
// Pure, so it's tested without a GPU.

/** 'high': everything at full quality. 'lite': cheaper versions, for phones. 'off': the scene as drawn, no effects. */
export type Level = 'high' | 'lite' | 'off';
/** bloom: bright things glow. tilt: the top and bottom of the view blur, like a model. grade: the colour of the hour, and a soft vignette. */
export type Effect = 'bloom' | 'tilt' | 'grade';

export const LEVELS: readonly Level[] = ['high', 'lite', 'off'];
export const EFFECTS: readonly Effect[] = ['bloom', 'tilt', 'grade'];

export interface Quality {
  level: Level;
  effects: Effect[];
  /** Set from the address (?fx=): never stepped down, so what you asked for is what you see. */
  forced: boolean;
}

/**
 * The starting quality. Reduced motion and no WebGL 2 get none; phones get
 * lite; everything else gets high. `?fx=high|lite|off`, or a list of effects
 * like `?fx=bloom,grade` (drawn at high), overrides it.
 */
export function pickQuality(o: { search: string; mobile: boolean; reducedMotion: boolean }): Quality {
  const asked = new URLSearchParams(o.search).get('fx')?.trim().toLowerCase();
  if (asked) {
    if ((LEVELS as string[]).includes(asked)) return { level: asked as Level, effects: asked === 'off' ? [] : [...EFFECTS], forced: true };
    const list = asked.split(',').map((x) => x.trim()).filter((x): x is Effect => (EFFECTS as string[]).includes(x));
    if (list.length || asked === 'none') return { level: list.length ? 'high' : 'off', effects: [...new Set(list)], forced: true };
  }
  if (o.reducedMotion) return { level: 'off', effects: [], forced: false };
  return { level: o.mobile ? 'lite' : 'high', effects: [...EFFECTS], forced: false };
}

/** One step cheaper: high to lite, lite to off. */
export function stepDown(q: Quality): Quality {
  if (q.level === 'high') return { ...q, level: 'lite' };
  return { ...q, level: 'off', effects: [] };
}

/**
 * Watches how long frames take. Once the island has settled (`settle`
 * seconds after a reset) it averages frames over `window` seconds, and says
 * so (true from `add`) when that average falls below `minFps`.
 */
export class FrameWatch {
  private settleLeft: number;
  private sum = 0;
  private n = 0;

  constructor(
    private readonly minFps = 40,
    private readonly window = 3,
    private readonly settle = 3,
  ) {
    this.settleLeft = settle;
  }

  /** Start over: after a pause, a level change, or a hitch nobody should be judged on. */
  reset() {
    this.settleLeft = this.settle;
    this.sum = 0;
    this.n = 0;
  }

  /** One frame took `dt` seconds. True if the last window ran too slow (and starts a new one). */
  add(dt: number): boolean {
    if (!(dt > 0)) return false;
    if (this.settleLeft > 0) {
      this.settleLeft -= dt;
      return false;
    }
    this.sum += dt;
    this.n++;
    if (this.sum < this.window) return false;
    const fps = this.n / this.sum;
    this.sum = 0;
    this.n = 0;
    if (fps >= this.minFps) return false;
    this.settleLeft = this.settle;
    return true;
  }
}
