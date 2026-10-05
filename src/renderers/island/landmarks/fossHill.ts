// Foss Hill: big standing letters on the slope below the lighthouse, like the
// Hollywood sign, propped up from behind and facing the island; and a small
// pink, purple and blue flag on a short pole on the hilltop, waving gently.
// Where they stand comes from the world (geography.signs and .flags).

import { BufferAttribute, Color, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Kit } from '../world/kit';
import type { Collider } from '../world/nature';
import { FLAGS, heightAt, SIGNS } from '../world/shape';
import { glyph } from '../../map/font';
import { flagColors } from '../../flag';

const LETTER = '#f4efe2';
const PROP = '#8a7f70';

/** A stroke's centreline, as points across (0 left, 1 right) and up (0 bottom, 1 top). */
type Stroke = [number, number][];
const arc = (cu: number, cv: number, ru: number, rv: number, from: number, to: number, n: number): Stroke =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cu + ru * Math.cos(a), cv + rv * Math.sin(a)];
  });

/** Letters drawn as smooth strokes. Any other capital is built from the map's pixel font. */
const STROKES: Record<string, Stroke[]> = {
  F: [[[0, 0], [0, 1], [1, 1]], [[0, 0.52], [0.82, 0.52]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  I: [[[0.5, 0], [0.5, 1]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  O: [arc(0.5, 0.5, 0.5, 0.5, 0, Math.PI * 2, 22)],
  S: [[...arc(0.5, 0.75, 0.5, 0.25, Math.PI * 0.12, Math.PI * 1.5, 10), ...arc(0.5, 0.25, 0.5, 0.25, Math.PI * 0.5, -Math.PI * 0.88, 10).slice(1)]],
};

/** One letter, its foot at the origin, facing +z: `w` wide, `h` tall, strokes `t` thick and `d` deep. */
function letter(k: Kit, ch: string, w: number, h: number) {
  const t = h * 0.2;
  const d = h * 0.09;
  const strokes = STROKES[ch];
  if (strokes) {
    const x = (u: number) => -w / 2 + t / 2 + u * Math.max(0, w - t);
    const y = (v: number) => t / 2 + v * (h - t);
    for (const s of strokes) {
      for (let i = 1; i < s.length; i++) {
        const ax = x(s[i - 1][0]), ay = y(s[i - 1][1]), bx = x(s[i][0]), by = y(s[i][1]);
        const len = Math.hypot(bx - ax, by - ay);
        // A little longer than the gap, so the joints close; square ends at a corner.
        k.box(len + t * (s.length > 3 ? 0.35 : 1), t, d, LETTER, { p: [(ax + bx) / 2, (ay + by) / 2, 0], r: [0, 0, Math.atan2(by - ay, bx - ax)], jitter: 0.02 });
      }
    }
    return;
  }
  const g = glyph(ch);
  if (!g) return;
  const cw = w / g[0].length;
  const chh = h / g.length;
  g.forEach((row, j) => [...row].forEach((c, i) => c === '#' && k.box(cw * 1.02, chh * 1.02, d, LETTER, { p: [-w / 2 + (i + 0.5) * cw, h - (j + 0.5) * chh, 0], jitter: 0.02 })));
}

function flagCloth() {
  const W = 0.95;
  const H = 0.57;
  const g = new PlaneGeometry(W, H, 10, 5).toNonIndexed();
  g.translate(W / 2, 0, 0);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  const stripes = flagColors();
  // Each triangle takes the stripe its middle is in, so the edges between them stay sharp.
  for (let i = 0; i < pos.count; i += 3) {
    const v = 0.5 - (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 / H;
    c.set((stripes.find((s) => v < s.to) ?? stripes[stripes.length - 1]).color);
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  const rest = Float32Array.from(pos.array as Float32Array);
  return { geometry: g, rest, W };
}

export function buildFossHill() {
  const group = new Group();
  group.name = 'foss-hill';
  const colliders: Collider[] = [];
  const k = new Kit(1410);
  const m = new Matrix4();
  const q = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const ONE = new Vector3(1, 1, 1);

  for (const s of SIGNS) {
    for (const l of s.letters) {
      // Set on the lowest ground under it, a little sunk in, so no corner floats on the slope.
      const feet = [-0.5, 0, 0.5].map((f) => ({ x: l.x + l.ax * l.width * f, z: l.z + l.az * l.width * f }));
      const y = Math.min(...feet.map((p) => heightAt(p.x, p.z))) - 0.12;
      m.compose(new Vector3(l.x, y, l.z), q.setFromAxisAngle(UP, l.yaw), ONE);
      k.within(m, () => {
        letter(k, l.ch, l.width, l.height);
        // Two props behind, slanting down into the hillside.
        for (const u of l.width > l.height * 0.4 ? [-0.3, 0.3] : [0]) {
          k.beam([u * l.width, l.height * 0.72, -l.height * 0.06], [u * l.width, -0.25, -l.height * 0.55], 0.07, 0.07, PROP);
        }
      });
      for (const p of feet) colliders.push({ x: p.x, z: p.z, r: Math.max(0.28, l.width * 0.22) });
    }
  }

  // The flags: a pole with a little gold knob, and the cloth on a hinge at its top.
  const cloths: { mesh: Mesh; rest: Float32Array; W: number; seed: number }[] = [];
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: DoubleSide });
  FLAGS.forEach((f, i) => {
    const y = heightAt(f.x, f.z) - 0.05;
    const POLE = 2.1;
    k.add(new CylinderGeometry(0.035, 0.045, POLE, 6), PROP, { p: [f.x, y + POLE / 2, f.z] });
    k.sphere(0.06, '#f2c14e', { p: [f.x, y + POLE + 0.04, f.z] }, 6, 4);
    colliders.push({ x: f.x, z: f.z, r: 0.25 });
    const { geometry, rest, W } = flagCloth();
    const mesh = new Mesh(geometry, material);
    mesh.position.set(f.x + 0.03, y + POLE - 0.3, f.z);
    // Blowing in from the sea: the cloth streams out toward the island's middle.
    mesh.rotation.y = Math.atan2(f.z, -f.x);
    mesh.castShadow = true;
    group.add(mesh);
    cloths.push({ mesh, rest, W, seed: i * 1.9 });
  });

  if (!k.isEmpty()) group.add(k.build());

  return {
    group,
    colliders,
    /** Wave the flags: a soft ripple running out along the cloth, bigger toward the free end. */
    update(t: number) {
      for (const c of cloths) {
        const pos = c.mesh.geometry.getAttribute('position') as BufferAttribute;
        const a = pos.array as Float32Array;
        for (let i = 0; i < a.length; i += 3) {
          const u = c.rest[i] / c.W;
          a[i + 2] = Math.sin(t * 3.1 + c.seed - u * 5.2) * 0.09 * u + Math.sin(t * 1.7 + c.seed + c.rest[i + 1] * 3) * 0.025 * u;
          a[i + 1] = c.rest[i + 1] - 0.04 * u * u;
        }
        pos.needsUpdate = true;
      }
    },
  };
}
