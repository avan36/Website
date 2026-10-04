// Build-time helpers for the island's blueprint (/blueprint): the drawing,
// worked out from the same geometry every renderer uses, and a generic way
// to show any piece of the world as friendly fields or as highlighted JSON.
//
// Everything here is pure and returns strings, so it's easy to test, and so a
// field nobody has taught the page about yet still shows up instead of
// breaking the build.

import type { World } from '../../world/schema';
import { createGeo, SWIM_REACH, type Vec2 } from '../../world/geo';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "lostWords" → "Lost words", "first-seen" → "First seen". */
export function humanize(key: string): string {
  const words = key
    .replace(/^\$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** A number as a person would write it: at most two decimals, no trailing zeros. */
export const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isVec = (v: unknown): v is Vec2 =>
  isObj(v) && Object.keys(v).length === 2 && typeof v.x === 'number' && typeof v.z === 'number';

// ---------- JSON ----------

/** JSON the way a person would lay it out: short arrays and objects stay on one line. */
export function prettyJson(v: unknown, width = 52, indent = ''): string {
  const flat = (x: unknown): string =>
    Array.isArray(x)
      ? `[${x.map(flat).join(', ')}]`
      : isObj(x)
        ? `{ ${Object.entries(x)
            .filter(([, y]) => y !== undefined)
            .map(([k, y]) => `${JSON.stringify(k)}: ${flat(y)}`)
            .join(', ')} }`.replace('{  }', '{}')
        : (JSON.stringify(x) ?? 'null');
  const one = flat(v);
  if (typeof v !== 'object' || v === null || one.length + indent.length <= width) return one;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + prettyJson(x, width, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(v).filter(([, y]) => y !== undefined);
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${prettyJson(x, width, inner)}`).join(',\n')}\n${indent}}`;
}

/** Pretty JSON as HTML, with spans for keys, strings, numbers and literals. */
export function highlightJson(v: unknown, width?: number): string {
  const src = prettyJson(v, width);
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = '';
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += m[2] ? `<span class="j-k">${esc(m[1])}</span>${m[2]}` : `<span class="j-s">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="j-b">${m[3]}</span>`;
    else out += `<span class="j-n">${m[0]}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

// ---------- Friendly fields ----------

/** Any value as readable HTML: swatches for colors, links for paths, chips for lists. */
export function renderValue(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return '<span class="bp-none">none</span>';
  if (typeof v === 'boolean') return `<span class="bp-pill">${v ? 'yes' : 'no'}</span>`;
  if (typeof v === 'number') return `<span class="bp-num">${num(v)}</span>`;
  if (typeof v === 'string') {
    if (isHex(v)) return `<span class="bp-swatch" style="--sw:${v}"></span><code>${esc(v)}</code>`;
    if (/^\/(?!\/)\S*$/.test(v) || /^https?:\/\/\S+$/.test(v)) return `<a class="bp-link" href="${esc(v)}">${esc(v)}</a>`;
    return v ? esc(v) : '<span class="bp-none">empty</span>';
  }
  if (isVec(v)) return `<span class="bp-num">x ${num(v.x)}, z ${num(v.z)}</span>`;
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="bp-none">none</span>';
    if (v.every((x) => x === null || typeof x !== 'object'))
      return `<span class="bp-chips">${v.map((x) => `<span class="bp-chip">${renderValue(x, depth + 1)}</span>`).join('')}</span>`;
    if (depth > 2) return `<code class="bp-inline">${esc(prettyJson(v, 9999))}</code>`;
    return `<ol class="bp-nest">${v.map((x) => `<li>${renderValue(x, depth + 1)}</li>`).join('')}</ol>`;
  }
  if (isObj(v)) {
    if (depth > 2) return `<code class="bp-inline">${esc(prettyJson(v, 9999))}</code>`;
    return renderFields(v, [], depth + 1);
  }
  return esc(String(v));
}

/** A <dl> of an object's fields, leaving out the ones already shown elsewhere. Empty if nothing's left. */
export function renderFields(obj: object, skip: readonly string[] = [], depth = 0): string {
  const rows = Object.entries(obj)
    .filter(([k, v]) => !skip.includes(k) && v !== undefined)
    .map(([k, v]) => `<div class="bp-field"><dt>${esc(humanize(k))}</dt><dd>${renderValue(v, depth)}</dd></div>`);
  return rows.length ? `<dl class="bp-fields">${rows.join('')}</dl>` : '';
}

// ---------- The drawing ----------

const r1 = (n: number) => String(Math.round(n * 10) / 10);
const pt = (p: Vec2) => `${r1(p.x)} ${r1(p.z)}`;

/** Lines of equal height, by marching squares over a function. One path per level. */
export function contours(f: (x: number, z: number) => number, box: { x0: number; z0: number; x1: number; z1: number }, step: number, level: number): string {
  const nx = Math.ceil((box.x1 - box.x0) / step);
  const nz = Math.ceil((box.z1 - box.z0) / step);
  const v: number[][] = [];
  for (let j = 0; j <= nz; j++) {
    v.push([]);
    for (let i = 0; i <= nx; i++) v[j].push(f(box.x0 + i * step, box.z0 + j * step) - level);
  }
  const at = (i: number, j: number) => ({ x: box.x0 + i * step, z: box.z0 + j * step });
  const mix = (a: Vec2, b: Vec2, va: number, vb: number): Vec2 => {
    const t = va / (va - vb);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  let d = '';
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const c = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
      const p = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const cross: Vec2[] = [];
      for (let e = 0; e < 4; e++) {
        const a = c[e];
        const b = c[(e + 1) % 4];
        if (a > 0 !== b > 0) cross.push(mix(p[e], p[(e + 1) % 4], a, b));
      }
      for (let k = 0; k + 1 < cross.length; k += 2) d += `M${pt(cross[k])}L${pt(cross[k + 1])}`;
    }
  }
  return d;
}

export type Drawing = ReturnType<typeof drawIsland>;

/** Everything the blueprint draws, in world units (SVG x = world x, SVG y = world z, so north is up). */
export function drawIsland(world: World) {
  const geo = createGeo(world);
  const ring = (extra: number, n = 180) => {
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const r = geo.coastRadius(th) + extra;
      pts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
    }
    return pts;
  };
  const coastPts = ring(0);
  const swimPts = ring(SWIM_REACH);
  const poly = (pts: Vec2[]) => `M${pts.map(pt).join('L')}Z`;

  const pier = geo.pier;
  const xs = [...swimPts.map((p) => p.x), pier.x - pier.width, pier.x + pier.width];
  const zs = [...swimPts.map((p) => p.z), pier.end];
  for (const p of world.places) xs.push(p.at.x), zs.push(p.at.z);
  const pad = 3;
  const box = { x0: Math.min(...xs) - pad, z0: Math.min(...zs) - pad, x1: Math.max(...xs) + pad, z1: Math.max(...zs) + pad };

  const landBox = { x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1 };
  const levels = [0.9, 1.7, 2.3].map((h) => ({ h, d: contours(geo.heightAt, landBox, 0.9, h) })).filter((l) => l.d);

  const anchor = (id: string): Vec2 | null => {
    const p = geo.place(id);
    if (!p) return null;
    return p === geo.hub ? p.at : geo.door(p);
  };

  const routes = world.routes.map((r, i) => {
    const drawn = r.paved ? geo.paths.find((p) => p.from === r.from && p.to === r.to) : undefined;
    let d = '';
    let length = 0;
    if (drawn) {
      d = `M${drawn.points.map(pt).join('L')}`;
      for (let k = 1; k < drawn.points.length; k++)
        length += Math.hypot(drawn.points[k].x - drawn.points[k - 1].x, drawn.points[k].z - drawn.points[k - 1].z);
    } else {
      const a = anchor(r.from);
      const b = anchor(r.to);
      if (a && b) {
        d = `M${pt(a)}L${pt(b)}`;
        length = Math.hypot(b.x - a.x, b.z - a.z);
      }
    }
    return { i, from: r.from, to: r.to, paved: !!r.paved, d, length };
  });

  // Labels go below a place, or above, right or left of it: wherever they
  // first miss every other label, place, hidden word and the arrival mark.
  type Box = { x0: number; z0: number; x1: number; z1: number };
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  const around = (c: Vec2, r: number): Box => ({ x0: c.x - r, z0: c.z - r, x1: c.x + r, z1: c.z + r });
  const taken: Box[] = [
    ...world.places.map((p) => around(p.at, Math.max(p.footprint, 0.9))),
    ...world.lostWords.map((w) => around(w.at, 1.1)),
    around(geo.spawn, 0.8),
  ];
  const LABEL = 1.45;
  const labels = new Map<string, { x: number; y: number; anchor: 'middle' | 'start' | 'end' }>();
  world.places.forEach((p, idx) => {
    const r = Math.max(p.footprint, 0.9);
    const w = p.name.length * LABEL * 0.56 + 0.4;
    const h = LABEL * 1.1;
    const tries = [
      { x: p.at.x, y: p.at.z + r + 0.4 + LABEL, anchor: 'middle' as const, box: { x0: p.at.x - w / 2, z0: p.at.z + r + 0.3, x1: p.at.x + w / 2, z1: p.at.z + r + 0.3 + h } },
      { x: p.at.x, y: p.at.z - r - 0.6, anchor: 'middle' as const, box: { x0: p.at.x - w / 2, z0: p.at.z - r - 0.4 - h, x1: p.at.x + w / 2, z1: p.at.z - r - 0.4 } },
      { x: p.at.x + r + 0.5, y: p.at.z + LABEL * 0.35, anchor: 'start' as const, box: { x0: p.at.x + r + 0.4, z0: p.at.z - h / 2, x1: p.at.x + r + 0.4 + w, z1: p.at.z + h / 2 } },
      { x: p.at.x - r - 0.5, y: p.at.z + LABEL * 0.35, anchor: 'end' as const, box: { x0: p.at.x - r - 0.4 - w, z0: p.at.z - h / 2, x1: p.at.x - r - 0.4, z1: p.at.z + h / 2 } },
    ];
    const pick = tries.find((t) => !taken.some((b, j) => j !== idx && hits(t.box, b))) ?? tries[0];
    taken.push(pick.box);
    labels.set(p.id, { x: pick.x, y: pick.y, anchor: pick.anchor });
  });

  const places = world.places.map((p) => {
    const door = geo.door(p);
    const fromHub = Math.hypot(p.at.x - geo.hub.at.x, p.at.z - geo.hub.at.z);
    return {
      label: labels.get(p.id)!,
      id: p.id,
      at: p.at,
      door,
      doorAuthored: !!p.door,
      facing: geo.facing(p),
      bearing: geo.bearing(geo.hub.at, p.at),
      fromHub,
      // Small things still need something to tap.
      r: Math.max(p.footprint, 0.9),
    };
  });

  return {
    viewBox: `${r1(box.x0)} ${r1(box.z0)} ${r1(box.x1 - box.x0)} ${r1(box.z1 - box.z0)}`,
    box,
    coast: poly(coastPts),
    swim: poly(swimPts),
    contours: levels,
    routes,
    places,
    pier,
    spawn: geo.spawn,
    hills: world.geography.hills.map((h) => ({ ...h, pos: geo.place(h.at)?.at })),
    headlands: world.geography.headlands.map((h) => {
      const p = geo.place(h.toward);
      const th = p ? Math.atan2(p.at.z, p.at.x) : 0;
      const r = geo.coastRadius(th);
      return { ...h, tip: { x: Math.cos(th) * r, z: Math.sin(th) * r } };
    }),
    /** The coast's radius all the way round, for a little profile chart. */
    profile: Array.from({ length: 73 }, (_, i) => geo.coastRadius((i / 72) * Math.PI * 2)),
  };
}
