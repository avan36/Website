// Small shared helpers for the project-page toys.

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Run `cb` once, the first time `el` scrolls into view. */
export function whenVisible(el: Element, cb: () => void, threshold = 0.35): void {
  if (!('IntersectionObserver' in window)) {
    cb();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { threshold },
  );
  io.observe(el);
}

/** Resolved value of a CSS custom property on `el` (var() references substituted). */
export const cssVar = (el: Element, name: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim();

/** Calls `cb` when the OS color scheme flips, so canvases can repaint. */
export function onSchemeChange(cb: () => void): void {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Sets up a hi-DPI canvas that fills its parent's width at a fixed CSS height. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
