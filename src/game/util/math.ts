// Small math helpers shared by the island. No three.js in here so the shape
// module (and anything else pure) stays testable and cheap.

export const TAU = Math.PI * 2;

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOutCubic = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t: number, s = 1.70158) => {
  t = clamp(t) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};
export const easeInCubic = (t: number) => clamp(t) ** 3;

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A damped spring, good for squash, wobble and springy pops. */
export class Spring {
  value: number;
  target: number;
  vel = 0;
  constructor(value = 0, public stiffness = 220, public damping = 14) {
    this.value = value;
    this.target = value;
  }
  update(dt: number) {
    // Two substeps keep stiff springs stable on slow frames.
    const h = Math.min(dt, 1 / 20) / 2;
    for (let i = 0; i < 2; i++) {
      const f = -this.stiffness * (this.value - this.target) - this.damping * this.vel;
      this.vel += f * h;
      this.value += this.vel * h;
    }
    return this.value;
  }
  kick(v: number) {
    this.vel += v;
  }
  snap(v: number) {
    this.value = this.target = v;
    this.vel = 0;
  }
}
