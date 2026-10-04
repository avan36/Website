// The things in a room (interior/room.ts), one builder per prop: a desk, a
// hearth with a fire in it, a frame on the wall, the lighthouse's lens. Each
// is built from the kit, standing at its own origin facing +z (toward the
// door), in scene units, K per room unit. Some of them move (the fire, the
// globe, the lens): those add a step to `animated`.

import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';
import type { Place, Prop } from '../../../world/schema';
import type { Spot } from '../../roomPlan';
import { Kit } from '../world/kit';

/** Scene units per room unit: the explorer is big, so rooms are a little roomier in 3D. */
export const K = 1.5;

export const shade = (hex: string, k: number) => {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return '#' + c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + k))).getHexString();
};

/** About how tall each kind of thing is, for its click box. */
export function propHeight(p: Prop) {
  return { desk: 1.4, hearth: 2.8, frame: 1.2, board: 1.5, counter: 1.5, bookshelf: 3, cabinet: 2.2, lens: 2.8, cat: 0.7, globe: 1.5, scanner: 1.5, crates: 1.9, grill: 2.4, sacks: 0.9, escalator: 2.8, shopfront: 2.8 }[p];
}

/** One thing, built from the kit, standing at the origin facing +z. */
export function buildProp(prop: Prop, place: Place, s: Spot, mat: <T extends Material>(m: T) => T, animated: ((t: number, dt: number) => void)[], calm: boolean): Group {
  const kit = new Kit(s.id.length * 13 + 1);
  const accent = place.color;
  const hw = s.hw * K;
  const hd = s.hd * K;
  const WOOD = '#b98352';
  const WOOD_LIGHT = '#d2a06a';
  const WOOD_DARK = '#8a5a36';
  const GOLD = '#f2c14e';
  const IRON = '#4a4540';
  const CREAM = '#fff3df';
  const group = new Group();
  // Wall things sit against the back wall: their z is the middle of their footprint.
  const wallZ = -hd + 0.05;
  switch (prop) {
    case 'desk': {
      if (place.archetype === 'schoolhouse') {
        for (const [x, z] of [[-1.3, -0.45], [0, -0.45], [1.3, -0.45], [-1.3, 0.75], [0, 0.75], [1.3, 0.75]]) {
          kit.box(1.0, 0.08, 0.6, WOOD_LIGHT, { p: [x, 0.72, z] });
          for (const lx of [-0.42, 0.42]) kit.box(0.07, 0.72, 0.07, WOOD_DARK, { p: [x + lx, 0.36, z + 0.2] });
          kit.box(0.5, 0.36, 0.04, IRON, { p: [x, 0.95, z - 0.15], r: [-0.3, 0, 0] });
          kit.addGlow(new BoxGeometry(0.42, 0.28, 0.02), (x + z) % 2 ? '#9cd2e8' : shade(accent, 0.2), { p: [x, 0.96, z - 0.12], r: [-0.3, 0, 0] });
        }
        break;
      }
      kit.box(hw * 2, 0.12, hd * 2, WOOD_LIGHT, { p: [0, 1.0, 0] });
      kit.box(hw * 2 - 0.1, 0.4, hd * 2 - 0.2, WOOD, { p: [0, 0.75, -0.05] });
      for (const x of [-hw + 0.12, hw - 0.12]) for (const z of [-hd + 0.12, hd - 0.12]) kit.box(0.1, 0.95, 0.1, WOOD_DARK, { p: [x, 0.47, z] });
      if (place.archetype === 'lighthouse') {
        kit.box(1.1, 0.06, 0.75, CREAM, { p: [-0.2, 1.09, 0], r: [0, 0.1, 0] });
        kit.box(0.04, 0.07, 0.75, '#e0d0b0', { p: [-0.2, 1.1, 0], r: [0, 0.1, 0] });
        kit.cyl(0.12, 0.16, 0.08, GOLD, { p: [0.8, 1.1, -0.1] });
        kit.addGlow(new CylinderGeometry(0.1, 0.1, 0.25, 8), '#ffe7a6', { p: [0.8, 1.26, -0.1] });
      } else {
        kit.box(0.8, 0.06, 0.55, accent, { p: [-0.1, 1.09, 0.05], r: [0, -0.15, 0] });
        kit.box(0.7, 0.07, 0.48, CREAM, { p: [-0.1, 1.11, 0.05], r: [0, -0.15, 0] });
        kit.cyl(0.025, 0.025, 0.6, GOLD, { p: [0.55, 1.1, 0.1], r: [0, 0, Math.PI / 2] });
        kit.cyl(0.1, 0.1, 0.14, IRON, { p: [0.9, 1.13, -0.2] });
        kit.cyl(0.06, 0.07, 0.3, CREAM, { p: [-0.9, 1.2, -0.25] });
        kit.addGlow(new CylinderGeometry(0.02, 0.04, 0.1, 6), '#ffd166', { p: [-0.9, 1.4, -0.25] });
      }
      break;
    }
    case 'counter': {
      kit.box(hw * 2, 1.0, hd * 2, WOOD_DARK, { p: [0, 0.5, 0] });
      kit.box(hw * 2 + 0.15, 0.1, hd * 2 + 0.2, WOOD_LIGHT, { p: [0, 1.05, 0] });
      for (let x = -hw + 0.3; x < hw - 0.1; x += 0.45) kit.box(0.05, 0.9, 0.04, '#6b4228', { p: [x, 0.5, hd + 0.01] });
      for (let x = -hw + 0.5; x < hw - 0.3; x += 0.55) {
        kit.cyl(0.04, 0.04, 0.4, GOLD, { p: [x, 1.3, -hd + 0.2] });
        kit.box(0.07, 0.07, 0.2, GOLD, { p: [x, 1.45, -hd + 0.3] });
        kit.cyl(0.05, 0.04, 0.2, x > 0 ? accent : IRON, { p: [x, 1.6, -hd + 0.2] });
      }
      kit.cyl(0.11, 0.1, 0.22, CREAM, { p: [-0.6, 1.21, 0.1] });
      kit.cyl(0.11, 0.1, 0.22, GOLD, { p: [0.7, 1.21, 0.15] });
      break;
    }
    case 'hearth': {
      const h = 2.6;
      kit.box(hw * 2, h, hd * 2, '#bdb5a8', { p: [0, h / 2, wallZ], jitter: 0.08 });
      kit.box(hw * 2 + 0.3, 0.14, hd * 2 + 0.25, WOOD_DARK, { p: [0, 1.55, wallZ + 0.1] });
      kit.box(hw * 1.1, 1.05, 0.1, '#2b1d17', { p: [0, 0.55, wallZ + hd + 0.01] });
      kit.box(hw * 2 + 0.2, 0.12, hd * 2 + 0.4, '#958c80', { p: [0, 0.06, wallZ + 0.15] });
      kit.sphere(0.2, IRON, { p: [0.25, 0.75, wallZ + hd - 0.2] });
      kit.cyl(0.02, 0.02, 0.4, IRON, { p: [0.25, 1.05, wallZ + hd - 0.2] });
      for (const x of [-0.3, 0, 0.3]) kit.cyl(0.07, 0.07, 0.7, '#6b4228', { p: [x, 0.12, wallZ + hd - 0.1], r: [0, 0.5, Math.PI / 2] });
      // The fire: two glowing cones that flicker.
      const fireMat = mat(new MeshBasicMaterial({ color: '#ff9f43' }));
      const fireCore = mat(new MeshBasicMaterial({ color: '#ffe27a' }));
      const f1 = new Mesh(new CylinderGeometry(0, 0.28, 0.6, 6), fireMat);
      const f2 = new Mesh(new CylinderGeometry(0, 0.16, 0.4, 6), fireCore);
      f1.position.set(-0.05, 0.45, wallZ + hd - 0.15);
      f2.position.set(0.05, 0.38, wallZ + hd - 0.1);
      group.add(f1, f2);
      animated.push((t) => {
        if (calm) return;
        const k = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08;
        f1.scale.set(1, k, 1);
        f2.scale.set(1, 2 - k, 1);
      });
      break;
    }
    case 'frame': {
      kit.box(hw * 2, 1.1, 0.08, GOLD, { p: [0, 2.1, wallZ] });
      kit.box(hw * 2 - 0.2, 0.9, 0.06, place.archetype === 'cabin' ? '#efe4cf' : CREAM, { p: [0, 2.1, wallZ + 0.03] });
      if (place.archetype === 'cabin') {
        kit.box(0.42, 0.78, 0.04, IRON, { p: [0, 2.1, wallZ + 0.06] });
        kit.box(0.34, 0.66, 0.04, CREAM, { p: [0, 2.1, wallZ + 0.07] });
        for (let i = 0; i < 5; i++) kit.box(0.16, 0.06, 0.03, i % 2 ? '#bdb5a8' : accent, { p: [i % 2 ? -0.06 : 0.06, 2.34 - i * 0.12, wallZ + 0.09] });
      } else if (place.archetype === 'depot') {
        kit.cyl(0.22, 0.22, 0.05, '#3f7fd6', { p: [0, 2.25, wallZ + 0.07], r: [Math.PI / 2, 0, 0] });
        kit.cyl(0.08, 0.08, 0.06, GOLD, { p: [0, 2.25, wallZ + 0.09], r: [Math.PI / 2, 0, 0] });
        for (const x of [-0.1, 0.1]) kit.box(0.09, 0.4, 0.03, '#3f7fd6', { p: [x, 1.9, wallZ + 0.07], r: [0, 0, x * 2] });
      } else {
        kit.box(0.04, 0.7, 0.03, IRON, { p: [-hw + 0.3, 2.1, wallZ + 0.07] });
        kit.box(hw * 2 - 0.5, 0.04, 0.03, IRON, { p: [0.05, 1.77, wallZ + 0.07] });
        for (let i = 0; i < 8; i++) kit.box(0.07, 0.07, 0.03, i % 3 ? accent : '#e5484d', { p: [-hw + 0.45 + ((i * 0.37) % (hw * 2 - 0.7)), 1.85 + ((i * 0.23) % 0.6), wallZ + 0.08] });
      }
      break;
    }
    case 'board': {
      kit.box(hw * 2, 1.45, 0.1, WOOD_DARK, { p: [0, 2.0, wallZ] });
      if (place.archetype === 'library') {
        kit.box(hw * 2 - 0.2, 1.25, 0.06, '#f6e7c4', { p: [0, 2.0, wallZ + 0.04] });
        kit.box(0.9, 0.5, 0.03, '#cfe0c0', { p: [-0.6, 2.0, wallZ + 0.07] });
        kit.box(1.0, 0.6, 0.03, '#cfe0c0', { p: [0.7, 1.95, wallZ + 0.07] });
        const pins = [[-1.8, 1.7], [-1.0, 2.3], [-0.2, 1.85], [0.6, 2.35], [1.6, 1.9]];
        for (let i = 0; i < pins.length - 1; i++) {
          const [ax, ay] = pins[i];
          const [bx, by] = pins[i + 1];
          const len = Math.hypot(bx - ax, by - ay);
          kit.box(len, 0.035, 0.02, '#e5484d', { p: [(ax + bx) / 2, (ay + by) / 2, wallZ + 0.1], r: [0, 0, Math.atan2(by - ay, bx - ax)] });
        }
        for (const [x, y] of pins) kit.sphere(0.06, GOLD, { p: [x, y, wallZ + 0.12] }, 6, 4);
      } else {
        kit.box(hw * 2 - 0.2, 1.25, 0.06, '#2f4a3c', { p: [0, 2.0, wallZ + 0.04] });
        for (let i = 0; i < 6; i++) {
          const len = (hw * 2 - 0.8) * (0.5 + ((i * 37) % 10) / 25);
          kit.box(len, 0.045, 0.02, '#eef3e8', { p: [-hw + 0.3 + len / 2, 2.5 - i * 0.18, wallZ + 0.08], jitter: 0 });
          if (place.archetype === 'taproom') kit.box(0.25 + (i % 3) * 0.08, 0.06, 0.02, i % 2 ? GOLD : accent, { p: [hw - 0.4, 2.5 - i * 0.18, wallZ + 0.08], jitter: 0 });
        }
        kit.box(hw * 2 - 0.2, 0.06, 0.15, WOOD_LIGHT, { p: [0, 1.32, wallZ + 0.08] });
      }
      break;
    }
    case 'bookshelf': {
      const h = 3.0;
      kit.box(hw * 2, h, hd * 2, WOOD_DARK, { p: [0, h / 2, wallZ] });
      kit.box(hw * 2 - 0.16, h - 0.16, 0.05, '#4a2f1e', { p: [0, h / 2, wallZ + hd - 0.05] });
      const SPINES = ['#c0392b', '#3a6fd8', '#2e9c8f', '#e9b949', '#7a4e2d', '#8e7cc3', '#4caf6a', '#f3e2c4'];
      let k = 0;
      for (let y = 0.25, row = 0; y < h - 0.4; y += 0.65, row++) {
        kit.box(hw * 2 - 0.1, 0.06, hd * 2 - 0.05, WOOD_LIGHT, { p: [0, y, wallZ] });
        // The shelf of lost words: mostly empty.
        const until = row === 2 ? -hw + 0.6 : hw - 0.15;
        for (let x = -hw + 0.15; x < until; ) {
          const bw = 0.09 + ((k * 7) % 5) * 0.025;
          const bh = 0.38 + ((k * 13) % 4) * 0.05;
          kit.box(bw, bh, hd * 2 - 0.3, SPINES[k % SPINES.length], { p: [x + bw / 2, y + 0.03 + bh / 2, wallZ + 0.05] });
          x += bw + 0.01;
          k++;
        }
      }
      break;
    }
    case 'cabinet': {
      const h = 2.0;
      kit.box(hw * 2, h, hd * 2, WOOD, { p: [0, h / 2, wallZ] });
      kit.box(hw * 2 + 0.1, 0.1, hd * 2 + 0.1, WOOD_DARK, { p: [0, h + 0.05, wallZ] });
      for (let y = 0.25; y < h - 0.1; y += 0.3) {
        for (let x = -hw + 0.22; x < hw - 0.1; x += 0.34) {
          kit.box(0.28, 0.24, 0.04, WOOD_LIGHT, { p: [x + 0.06, y + 0.06, wallZ + hd + 0.01] });
          kit.box(0.08, 0.03, 0.04, GOLD, { p: [x + 0.06, y + 0.06, wallZ + hd + 0.04] });
        }
      }
      break;
    }
    case 'lens': {
      kit.cyl(0.55, 0.7, 0.4, GOLD, { p: [0, 0.2, 0] });
      kit.cyl(0.3, 0.4, 0.6, '#c8952e', { p: [0, 0.7, 0] });
      kit.cyl(0.45, 0.45, 0.12, IRON, { p: [0, 2.75, 0] });
      kit.cone(0.3, 0.3, GOLD, { p: [0, 2.95, 0] });
      const lensMat = mat(new MeshStandardMaterial({ color: '#cfeefa', emissive: '#fff1b8', emissiveIntensity: 0.5, transparent: true, opacity: 0.8, roughness: 0.1, flatShading: true }));
      const glassG = new Group();
      for (let i = 0; i < 7; i++) {
        const y = 1.05 + i * 0.24;
        const r = 0.55 + Math.sin(((i + 0.5) / 7) * Math.PI) * 0.35;
        const m = new Mesh(new CylinderGeometry(r * 0.96, r, 0.2, 12), lensMat);
        m.position.y = y;
        glassG.add(m);
      }
      group.add(glassG);
      const glow = new Mesh(new CylinderGeometry(0.2, 0.2, 0.5, 8), mat(new MeshBasicMaterial({ color: '#fffbe6' })));
      glow.position.y = 1.75;
      group.add(glow);
      animated.push((t) => {
        if (!calm) glassG.rotation.y = t * 0.6;
      });
      break;
    }
    case 'cat': {
      kit.torus(0.42, 0.14, '#d9b77a', { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0] }, 6, 18);
      kit.cyl(0.36, 0.4, 0.1, '#c9a46c', { p: [0, 0.08, 0] });
      kit.sphere(0.36, '#f0913a', { p: [-0.05, 0.38, 0], s: [1.2, 0.75, 1] });
      kit.sphere(0.2, '#f0913a', { p: [0.32, 0.5, 0.15] });
      for (const z of [0.06, 0.24]) kit.cone(0.07, 0.15, '#f0913a', { p: [0.36, 0.7, z] }, 4);
      kit.box(0.04, 0.05, 0.12, '#3f7fd6', { p: [0.26, 0.38, 0.22] });
      kit.cyl(0.05, 0.06, 0.5, '#c46a24', { p: [-0.35, 0.3, 0.3], r: [0, 0.6, Math.PI / 2.3] });
      break;
    }
    case 'globe': {
      kit.cyl(0.3, 0.38, 0.08, WOOD_DARK, { p: [0, 0.04, 0] });
      kit.cyl(0.05, 0.05, 0.8, WOOD, { p: [0, 0.45, 0] });
      kit.torus(0.42, 0.03, GOLD, { p: [0, 1.15, 0], r: [0, 0, 0.4] }, 4, 20);
      const ball = new Group();
      const k2 = new Kit(5);
      k2.sphere(0.38, '#3f7fd6', {}, 12, 10);
      k2.ico(0.16, '#5cb85a', { p: [0.2, 0.12, 0.24] });
      k2.ico(0.14, '#5cb85a', { p: [-0.25, -0.05, 0.22] });
      k2.ico(0.12, '#5cb85a', { p: [0.05, 0.2, -0.3] });
      ball.add(k2.build({ castShadow: true }));
      ball.position.y = 1.15;
      ball.rotation.z = 0.4;
      group.add(ball);
      animated.push((t) => {
        if (!calm) ball.rotation.y = t * 0.4;
      });
      break;
    }
    case 'scanner': {
      kit.box(hw * 2, 0.1, hd * 2, WOOD_LIGHT, { p: [0, 0.95, 0] });
      for (const x of [-hw + 0.1, hw - 0.1]) for (const z of [-hd + 0.1, hd - 0.1]) kit.box(0.08, 0.95, 0.08, IRON, { p: [x, 0.47, z] });
      kit.box(hw * 2 - 0.2, 0.06, hd * 2 - 0.2, '#6d665e', { p: [0, 0.3, 0] });
      kit.box(0.5, 0.4, 0.4, '#d7a768', { p: [-0.9, 1.2, 0] });
      kit.box(0.35, 0.3, 0.3, '#7fb6d8', { p: [-0.35, 1.15, 0.05] });
      kit.box(0.45, 0.35, 0.35, '#d7a768', { p: [0.15, 1.17, -0.05] });
      kit.box(0.35, 0.18, 0.18, IRON, { p: [0.85, 1.3, 0] });
      kit.box(0.1, 0.3, 0.12, '#6d665e', { p: [0.78, 1.1, 0] });
      const dot = new Mesh(new BoxGeometry(0.05, 0.08, 0.1), mat(new MeshBasicMaterial({ color: '#ff3b30' })));
      dot.position.set(1.03, 1.3, 0);
      group.add(dot);
      animated.push((t) => {
        dot.visible = calm || Math.floor(t * 2) % 3 !== 0;
      });
      break;
    }
    case 'crates': {
      const bale = (x: number, y: number, z: number, w: number, h: number, d: number) => {
        kit.box(w, h, d, '#d7a768', { p: [x, y + h / 2, z], jitter: 0.05 });
        kit.box(0.03, h + 0.01, d + 0.01, '#8a6a3e', { p: [x, y + h / 2, z] });
      };
      bale(-0.45, 0, 0, 0.85, 0.6, hd * 2 - 0.1);
      bale(0.45, 0, 0.05, 0.85, 0.6, hd * 2 - 0.2);
      bale(-0.3, 0.6, 0, 0.8, 0.55, hd * 2 - 0.3);
      bale(0.5, 0.6, -0.05, 0.7, 0.5, hd * 2 - 0.3);
      bale(0.05, 1.15, 0, 0.8, 0.5, hd * 2 - 0.4);
      break;
    }
  }
  if (!kit.isEmpty()) group.add(kit.build({ castShadow: true, receiveShadow: true }));
  return group;
}
