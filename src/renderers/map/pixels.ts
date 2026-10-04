// A small pixel painter. Sprites and the terrain are painted pixel by pixel
// into a Uint32Array (one packed RGBA per pixel), then put on a canvas once.
// Colors are packed little-endian (0xAABBGGRR), which is what ImageData
// wants on every browser that matters.

export type Color = number;
/** Fully transparent. */
export const CLEAR = 0;

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const pack = (r: number, g: number, b: number, a = 255): Color => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
export const col = (hex: string, a = 255): Color => pack(...rgb(hex), a);
export const unpack = (c: Color): [number, number, number, number] => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
export const toHex = (c: Color) => '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Lighten (+) or darken (-) a hex color, in HSL lightness, keeping its hue. */
export function shade(hex: string, dl: number, ds = 0): string {
  let [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = Math.min(1, Math.max(0, l + dl));
  s = Math.min(1, Math.max(0, s + ds));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  [r, g, b] = s === 0 ? [l, l, l] : [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  return '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

/** A 4x4 Bayer matrix, 0..1: ordered dithering for soft edges between two colors. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

export class Pix {
  readonly data: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  px(x: number, y: number, c: Color) {
    x |= 0;
    y |= 0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }

  get(x: number, y: number): Color {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : CLEAR;
  }

  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  hline(x0: number, x1: number, y: number, c: Color) {
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: Color) {
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
  }

  /** A filled ellipse centred on (cx, cy), pixel-centre tested so it stays symmetric. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }

  /** Stamp rows of characters, each looked up in `pal` (unknown or ' '/'.' is skipped). */
  map(rows: readonly string[], pal: Record<string, Color>, ox = 0, oy = 0, flip = false) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (c === undefined) continue;
        this.px(flip ? ox + row.length - 1 - x : ox + x, oy + y, c);
      }
    }
  }

  /** Draw a 1px outline around everything opaque (4-neighbours), outside it. */
  outline(c: Color) {
    const src = this.data.slice();
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.data[y * this.w + x] = c;
      }
    }
  }

  /** Copy another painting in at (ox, oy), skipping its transparent pixels. */
  stamp(src: Pix, ox: number, oy: number, flip = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + x];
        if (c) this.px(flip ? ox + src.w - 1 - x : ox + x, oy + y, c);
      }
    }
  }

  canvas(data: Uint32Array = this.data): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(data);
    g.putImageData(img, 0, 0);
    return cv;
  }
}

// ---------- Night ----------

/**
 * The same color by night: darker, cooler and bluer, the way the old games
 * swapped palettes after dark. `lights` maps colors that should glow instead
 * (window glass, lanterns) to their lit color.
 */
export function nightColor(c: Color, lights?: Map<Color, Color>): Color {
  const a = c >>> 24;
  if (!a) return c;
  const lit = lights?.get(c);
  if (lit !== undefined) return lit;
  const r = c & 255;
  const g = (c >>> 8) & 255;
  const b = (c >>> 16) & 255;
  const l = 0.3 * r + 0.55 * g + 0.15 * b;
  const nr = r * 0.24 + l * 0.06 + 12;
  const ng = g * 0.3 + l * 0.08 + 16;
  const nb = b * 0.38 + l * 0.26 + 46;
  return pack(Math.min(255, nr), Math.min(255, ng), Math.min(255, nb), a);
}

export function nightData(src: Uint32Array, lights?: Map<Color, Color>) {
  const out = new Uint32Array(src.length);
  const memo = new Map<Color, Color>();
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    let n = memo.get(c);
    if (n === undefined) memo.set(c, (n = nightColor(c, lights)));
    out[i] = n;
  }
  return out;
}
