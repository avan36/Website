// Life around the island: drifting clouds (with soft shadows), gulls circling
// overhead, and a little sailboat out at sea.

import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, ConeGeometry } from 'three';
import { Kit } from './kit';
import { rng } from '../util/math';

export function buildAmbient() {
  const group = new Group();
  group.name = 'ambient';
  const rand = rng(99);

  // Clouds: clusters of puffs with a cool underside.
  const cloudMat = new MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#fff4ea', emissiveIntensity: 0.35 });
  const clouds: { g: Group; r: number; a: number; s: number; y: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const k = new Kit(900 + i);
    const n = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const r = 1.2 + rand() * 1.3;
      k.add(new IcosahedronGeometry(r, 1), j % 2 ? '#ffffff' : '#f7f9fc', { p: [(j - n / 2) * 1.5 + rand(), rand() * 0.6, (rand() - 0.5) * 1.4], s: [1, 0.72, 0.9], jitter: 0.02 });
    }
    const g = new Group();
    const m = new Mesh(k.geometry(), cloudMat);
    m.castShadow = i < 4;
    g.add(m);
    const s = 0.9 + rand() * 0.8;
    g.scale.setScalar(s);
    group.add(g);
    clouds.push({ g, r: i < 4 ? 14 + rand() * 18 : 38 + rand() * 40, a: rand() * Math.PI * 2, s: 0.012 + rand() * 0.012, y: 17 + rand() * 9 });
  }

  // Gulls: a body and two wings that flap.
  const gullMat = new MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.8 });
  const tipMat = new MeshStandardMaterial({ color: '#4a4f57', flatShading: true });
  const gulls: { g: Group; wl: Group; wr: Group; r: number; a: number; s: number; y: number; ph: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new Group();
    const body = new Mesh(new IcosahedronGeometry(0.22, 0), gullMat);
    body.scale.set(0.7, 0.6, 1.6);
    const beak = new Mesh(new ConeGeometry(0.05, 0.16, 4), new MeshStandardMaterial({ color: '#ffb347' }));
    beak.rotation.x = Math.PI / 2;
    beak.position.z = 0.38;
    g.add(body, beak);
    const mkWing = (s: number) => {
      const w = new Group();
      const wm = new Mesh(new IcosahedronGeometry(0.3, 0), gullMat);
      wm.scale.set(2.2, 0.12, 0.8);
      wm.position.x = s * 0.6;
      const tip = new Mesh(new IcosahedronGeometry(0.16, 0), tipMat);
      tip.scale.set(1.8, 0.12, 0.8);
      tip.position.x = s * 1.18;
      w.add(wm, tip);
      g.add(w);
      return w;
    };
    const wl = mkWing(-1);
    const wr = mkWing(1);
    g.scale.setScalar(0.9);
    group.add(g);
    gulls.push({ g, wl, wr, r: 9 + rand() * 16, a: rand() * Math.PI * 2, s: (0.18 + rand() * 0.12) * (i % 2 ? 1 : -1), y: 9 + rand() * 5, ph: rand() * 6 });
  }

  // Sailboat far out
  const boat = new Group();
  const bk = new Kit(950);
  bk.lathe([[0, -0.6], [0.7, -0.5], [0.95, 0], [1.0, 0.35], [0, 0.35]], '#fffaf0', { s: [1, 1, 2.8] }, 12);
  bk.torus(1.0, 0.09, '#ff5a36', { p: [0, 0.35, 0], r: [Math.PI / 2, 0, 0], s: [1, 2.8, 1] }, 4, 18);
  bk.cyl(0.07, 0.07, 4.2, '#8a5a3b', { p: [0, 2.3, 0.2] }, 6);
  bk.add(new ConeGeometry(1.6, 3.6, 3), '#fffdf7', { p: [0.0, 2.6, -0.5], s: [0.06, 1, 1] });
  bk.add(new ConeGeometry(0.4, 0.6, 3), '#ff5a36', { p: [0, 4.55, 0.2], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1] });
  boat.add(bk.build({ castShadow: false }));
  group.add(boat);

  return {
    group,
    update(t: number) {
      for (const c of clouds) {
        const a = c.a + t * c.s;
        c.g.position.set(Math.cos(a) * c.r, c.y + Math.sin(t * 0.2 + c.a) * 0.4, Math.sin(a) * c.r);
      }
      for (const gl of gulls) {
        const a = gl.a + t * gl.s;
        gl.g.position.set(Math.cos(a) * gl.r, gl.y + Math.sin(t * 0.8 + gl.ph) * 0.8, Math.sin(a) * gl.r);
        gl.g.rotation.y = -a + (gl.s > 0 ? 0 : Math.PI);
        gl.g.rotation.z = (gl.s > 0 ? 1 : -1) * 0.25;
        const flap = Math.sin(t * 7 + gl.ph);
        const glide = Math.sin(t * 0.5 + gl.ph) > 0.3 ? 0.15 : 1;
        gl.wl.rotation.z = -flap * 0.55 * glide;
        gl.wr.rotation.z = flap * 0.55 * glide;
      }
      const ba = t * 0.018 + 2.2;
      boat.position.set(Math.cos(ba) * 50, Math.sin(t * 1.1) * 0.12, Math.sin(ba) * 50);
      boat.rotation.y = -ba;
      boat.rotation.z = Math.sin(t * 0.9) * 0.06;
    },
  };
}
