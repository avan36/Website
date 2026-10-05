// The things in a room (interior/room.ts), one builder per prop: a desk, a
// hearth with a fire in it, a frame on the wall, the lighthouse's lens. Each
// is built from the kit, standing at its own origin facing +z (toward the
// door), in scene units, K per room unit. Some of them move (the fire, the
// globe, the lens): those add a step to `animated`.

import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type Material } from 'three';
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
  return { desk: 1.4, hearth: 2.8, frame: 1.2, board: 1.5, counter: 1.5, bookshelf: 3, cabinet: 2.2, lens: 2.8, cat: 0.7, globe: 1.5, scanner: 1.5, crates: 1.9, grill: 3.0, sacks: 1.0, escalator: 3.2, shopfront: 2.8, pingpong: 1.1 }[p];
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
      if (place.archetype === 'skyscraper') {
        // A reception desk in pale stone, with a kombucha tap where the bell would be: three handles, three jars.
        kit.rbox(hw * 2, 1.0, hd * 2, 0.08, '#f4f2ee', { p: [0, 0.5, 0] });
        kit.box(hw * 2 + 0.1, 0.08, hd * 2 + 0.15, '#dcd8d0', { p: [0, 1.04, 0] });
        kit.box(hw * 2 - 0.3, 0.08, 0.04, accent, { p: [0, 0.3, hd + 0.01], jitter: 0 });
        kit.box(0.9, 0.5, 0.3, '#c9ced3', { p: [0.6, 1.33, -hd + 0.25] });
        ['#f2c14e', '#9bd36a', accent].forEach((c, i) => {
          const x = 0.32 + i * 0.28;
          kit.cyl(0.03, 0.03, 0.22, '#8b9198', { p: [x, 1.65, -hd + 0.25] });
          kit.cyl(0.045, 0.035, 0.18, c, { p: [x, 1.85, -hd + 0.25] });
          kit.cyl(0.09, 0.08, 0.22, shade(c, 0.15), { p: [x - 1.2, 1.2, 0.05] }, 8);
        });
        // A laptop nobody is using, and a little sign: VISITORS.
        kit.box(0.5, 0.03, 0.34, '#8b9198', { p: [-0.6, 1.1, 0.05] });
        kit.box(0.5, 0.32, 0.03, '#3d4248', { p: [-0.6, 1.26, -0.12], r: [-0.25, 0, 0] });
        kit.box(0.42, 0.14, 0.04, accent, { p: [hw - 0.35, 1.16, hd - 0.05] });
        break;
      }
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
      } else if (place.archetype === 'skyscraper') {
        // A motivational poster: a lone rowboat on a misty lake at dawn, and a word underneath.
        kit.box(hw * 2 - 0.3, 0.32, 0.03, '#c9dcea', { p: [0, 2.38, wallZ + 0.07], jitter: 0 });
        kit.box(hw * 2 - 0.3, 0.3, 0.03, '#f3d6b8', { p: [0, 2.08, wallZ + 0.07], jitter: 0 });
        kit.box(0.34, 0.06, 0.03, '#6b4228', { p: [0.1, 2.0, wallZ + 0.09], jitter: 0 });
        kit.box(0.02, 0.14, 0.02, '#6b4228', { p: [0.15, 2.08, wallZ + 0.1], r: [0, 0, 0.5], jitter: 0 });
        kit.box(0.7, 0.06, 0.03, IRON, { p: [0, 1.76, wallZ + 0.08], jitter: 0 });
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
      if (place.archetype === 'mall') {
        // The centre's directory: a lit map, floor by floor, in a steel frame, with a red YOU ARE HERE dot that pulses.
        const fw = hw * 2 - 0.5;
        kit.box(fw + 0.16, 1.62, 0.12, '#41464d', { p: [0, 2.0, wallZ] });
        kit.addGlow(new BoxGeometry(fw - 0.1, 1.38, 0.02), '#f7f5f0', { p: [0, 1.98, wallZ + 0.07] });
        // A dark header with a line of white "lettering", and a legend down the side.
        kit.addGlow(new BoxGeometry(fw - 0.1, 0.22, 0.02), '#2f3338', { p: [0, 2.58, wallZ + 0.08] });
        for (let i = 0; i < 5; i++) kit.addGlow(new BoxGeometry(0.18 + (i % 2) * 0.12, 0.07, 0.02), '#ffffff', { p: [-fw / 2 + 0.3 + i * 0.36, 2.58, wallZ + 0.09] });
        const UNITS = ['#ff8fab', '#3a86ff', '#ffbe0b', '#2e9c8f', '#c49bff', '#ff9f6b', '#7fd3b0', accent];
        for (let i = 0; i < 5; i++) {
          kit.addGlow(new BoxGeometry(0.14, 0.14, 0.02), UNITS[i], { p: [fw / 2 - 0.38, 2.3 - i * 0.2, wallZ + 0.09] });
          kit.addGlow(new BoxGeometry(0.26, 0.05, 0.02), '#8a8f96', { p: [fw / 2 - 0.16, 2.3 - i * 0.2, wallZ + 0.09] });
        }
        // The plan: shop units in colours either side of a white mall, round a court in the middle.
        const mx0 = -fw / 2 + 0.15;
        const mx1 = fw / 2 - 0.62;
        const cols = 6;
        const uw = (mx1 - mx0) / cols;
        for (let c = 0; c < cols; c++) {
          for (const [y, h] of [[2.25, 0.32], [1.62, 0.36]] as const) {
            const k2 = (c * 3 + (y > 2 ? 1 : 4)) % UNITS.length;
            if (c === 2 && y < 2) continue;
            kit.addGlow(new BoxGeometry(uw - 0.05, h, 0.02), shade(UNITS[k2], 0.12), { p: [mx0 + (c + 0.5) * uw, y, wallZ + 0.09] });
          }
        }
        kit.addGlow(new BoxGeometry(mx1 - mx0, 0.16, 0.02), '#ffffff', { p: [(mx0 + mx1) / 2, 1.97, wallZ + 0.095] });
        kit.addGlow(new BoxGeometry(uw - 0.05, 0.36, 0.02), '#ffffff', { p: [mx0 + 2.5 * uw, 1.62, wallZ + 0.095] });
        kit.addGlow(new CylinderGeometry(0.17, 0.17, 0.02, 14), '#e8f4fb', { p: [mx0 + 2.5 * uw, 1.7, wallZ + 0.1], r: [Math.PI / 2, 0, 0] });
        // You are here: a red dot in a white ring, on the mall near the court.
        const dot = new Mesh(new CylinderGeometry(0.07, 0.07, 0.03, 14), mat(new MeshBasicMaterial({ color: '#e5202e' })));
        dot.rotation.x = Math.PI / 2;
        dot.position.set(mx0 + 3.2 * uw, 1.97, wallZ + 0.12);
        const ringM = new Mesh(new CylinderGeometry(0.11, 0.11, 0.02, 16), mat(new MeshBasicMaterial({ color: '#ffffff' })));
        ringM.rotation.x = Math.PI / 2;
        ringM.position.set(mx0 + 3.2 * uw, 1.97, wallZ + 0.105);
        group.add(dot, ringM);
        animated.push((t) => {
          if (!calm) dot.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(t * 4)));
        });
        // A little red tag beside it, where the words would be.
        kit.addGlow(new BoxGeometry(0.34, 0.1, 0.02), '#e5202e', { p: [mx0 + 3.2 * uw + 0.3, 2.12, wallZ + 0.1] });
        break;
      }
      if (place.archetype === 'skyscraper') {
        // A rack of visitor lanyards on brass hooks, each with its badge.
        kit.box(hw * 2, 0.12, 0.1, '#c9ced3', { p: [0, 2.55, wallZ] });
        const colors = [accent, '#b8508a', '#f2c14e', '#2e9c8f', accent, '#e5484d', '#9bd36a'];
        colors.forEach((c, i) => {
          const x = -hw + 0.35 + (i * (hw * 2 - 0.7)) / (colors.length - 1);
          kit.cyl(0.025, 0.025, 0.12, GOLD, { p: [x, 2.5, wallZ + 0.08], r: [Math.PI / 2, 0, 0] }, 6);
          for (const s of [-1, 1]) kit.box(0.035, 0.6, 0.02, c, { p: [x + s * 0.07, 2.2, wallZ + 0.1], r: [0, 0, s * 0.1], jitter: 0 });
          kit.box(0.24, 0.3, 0.02, '#fbfaf7', { p: [x, 1.8, wallZ + 0.11], jitter: 0 });
          kit.box(0.18, 0.05, 0.02, c, { p: [x, 1.9, wallZ + 0.12], jitter: 0 });
        });
        break;
      }
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
    case 'grill': {
      // Five Guys: a counter in red and white checked tiles with a steel top, the grill and the fryer behind it, and the menu board over it all.
      const RED = '#d22630';
      const STEEL = '#c9ced3';
      const cz = hd - 0.36;
      kit.box(hw * 2, 1.0, 0.72, '#f4f2ee', { p: [0, 0.5, cz] });
      const tile = 0.25;
      const cols = Math.floor((hw * 2 - 0.1) / tile);
      const x0 = -(cols * tile) / 2;
      for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) kit.box(tile - 0.02, tile - 0.02, 0.03, (r + c) % 2 ? RED : '#ffffff', { p: [x0 + (c + 0.5) * tile, 0.06 + (r + 0.5) * tile, hd + 0.005], jitter: 0.01 });
      kit.box(hw * 2 + 0.12, 0.08, 0.84, STEEL, { p: [0, 1.04, cz] });
      kit.box(hw * 2 + 0.12, 0.05, 0.05, '#9aa1a8', { p: [0, 1.0, hd + 0.04], jitter: 0 });
      // On the counter: a burger in foil, a cup of fries spilling over, a shake, and the till.
      kit.cyl(0.17, 0.17, 0.12, '#d9dde1', { p: [-1.1, 1.14, cz + 0.05] }, 10);
      kit.sphere(0.17, '#c8cdd2', { p: [-1.1, 1.2, cz + 0.05], s: [1, 0.45, 1] }, 10, 6);
      kit.cyl(0.13, 0.1, 0.26, RED, { p: [-0.5, 1.21, cz + 0.12] }, 10);
      for (let i = 0; i < 9; i++) kit.box(0.035, 0.18, 0.035, '#f2c14e', { p: [-0.5 + ((i * 37) % 7 - 3) * 0.03, 1.38, cz + 0.12 + ((i * 53) % 5 - 2) * 0.03], r: [((i * 13) % 5 - 2) * 0.12, 0, ((i * 7) % 5 - 2) * 0.12], jitter: 0.05 });
      kit.cyl(0.1, 0.08, 0.32, '#ffffff', { p: [0.05, 1.24, cz + 0.1] }, 10);
      kit.cyl(0.02, 0.02, 0.22, RED, { p: [0.09, 1.44, cz + 0.1], r: [0, 0, -0.25] }, 5);
      kit.box(0.42, 0.24, 0.32, '#3d4248', { p: [hw - 0.55, 1.2, cz - 0.05], r: [-0.2, 0, 0] });
      // Behind: the grill (patties sizzling on it) and the fryer (two baskets of chips).
      const bz = -hd + 0.32;
      kit.box(1.5, 0.92, 0.6, STEEL, { p: [-0.75, 0.46, bz] });
      kit.box(1.44, 0.05, 0.54, '#2b2a28', { p: [-0.75, 0.95, bz], jitter: 0 });
      for (let i = 0; i < 4; i++) kit.cyl(0.11, 0.11, 0.05, '#7a4a2a', { p: [-1.2 + i * 0.3, 1.0, bz + ((i % 2) - 0.5) * 0.16] }, 10);
      kit.box(1.2, 0.95, 0.6, STEEL, { p: [0.9, 0.47, bz] });
      for (const x of [0.62, 1.18]) {
        kit.box(0.42, 0.06, 0.4, '#5a5f66', { p: [x, 0.97, bz], jitter: 0 });
        kit.box(0.36, 0.06, 0.34, '#f2c14e', { p: [x, 1.02, bz], jitter: 0.06 });
        kit.box(0.04, 0.04, 0.3, '#2b2f33', { p: [x, 1.08, bz + 0.3], jitter: 0 });
      }
      kit.box(hw * 2 - 0.2, 0.3, 0.2, '#9aa1a8', { p: [0, 2.0, -hd + 0.12] });
      // The menu board, on two posts: a red header with white lettering, the menu in lines on white.
      for (const x of [-hw + 0.3, hw - 0.3]) kit.box(0.07, 2.9, 0.07, '#6b7178', { p: [x, 1.45, -hd + 0.06] });
      const mw = hw * 2 - 0.4;
      kit.box(mw + 0.1, 0.95, 0.08, '#2b2f33', { p: [0, 2.62, -hd + 0.06] });
      kit.addGlow(new BoxGeometry(mw - 0.04, 0.26, 0.02), RED, { p: [0, 2.94, -hd + 0.11] });
      for (let i = 0; i < 4; i++) kit.addGlow(new BoxGeometry(0.2 + (i % 2) * 0.08, 0.08, 0.02), '#ffffff', { p: [-0.5 + i * 0.34, 2.94, -hd + 0.12] });
      kit.addGlow(new BoxGeometry(mw - 0.04, 0.6, 0.02), '#fbf8f2', { p: [0, 2.48, -hd + 0.11] });
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 4; r++) {
          const lx = -mw / 2 + 0.25 + c * (mw / 3);
          kit.addGlow(new BoxGeometry(mw / 3 - 0.6 - (r % 2) * 0.2, 0.05, 0.02), '#55504a', { p: [lx + (mw / 3 - 0.6) / 2, 2.68 - r * 0.12, -hd + 0.12] });
          kit.addGlow(new BoxGeometry(0.14, 0.05, 0.02), RED, { p: [lx + mw / 3 - 0.32, 2.68 - r * 0.12, -hd + 0.12] });
        }
      }
      // A wisp of steam off the grill now and then.
      const steam = new Mesh(new SphereGeometry(0.12, 8, 6), mat(new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })));
      group.add(steam);
      steam.visible = !calm;
      animated.push((t) => {
        if (calm) return;
        const k = (t * 0.6) % 1;
        steam.position.set(-0.9 + Math.sin(t * 2) * 0.05, 1.1 + k * 0.9, bz);
        steam.scale.setScalar(0.6 + k * 1.4);
        (steam.material as MeshBasicMaterial).opacity = 0.45 * (1 - k);
      });
      break;
    }
    case 'sacks': {
      // Sacks of potatoes, stacked, and one left open with potatoes heaped in its mouth.
      const BURLAP = ['#c9a66b', '#bf9a5c', '#d1b07a'];
      const sack = (x: number, y: number, z: number, ry: number, i: number) => {
        kit.rbox(0.62, 0.42, 0.4, 0.16, BURLAP[i % 3], { p: [x, y + 0.21, z], r: [0, ry, 0], jitter: 0.05 });
        kit.box(0.5, 0.08, 0.41, '#b0402e', { p: [x, y + 0.24, z], r: [0, ry, 0], jitter: 0.02 });
      };
      sack(-0.33, 0, -0.18, 0.08, 0);
      sack(0.32, 0, -0.2, -0.1, 1);
      sack(0, 0.4, -0.2, 0.15, 2);
      sack(-0.42, 0, 0.3, -0.25, 1);
      // The open one: a sack standing up with its neck rolled down and potatoes in it, a few spilled.
      kit.cyl(0.22, 0.27, 0.5, BURLAP[0], { p: [0.38, 0.25, 0.32] }, 9);
      kit.torus(0.22, 0.05, '#b8945a', { p: [0.38, 0.5, 0.32], r: [Math.PI / 2, 0, 0] }, 5, 12);
      for (let i = 0; i < 7; i++) kit.ico(0.075, i % 2 ? '#a8784a' : '#b98352', { p: [0.38 + Math.cos(i * 2.4) * 0.11 * (i % 3), 0.52 + (i % 2) * 0.05, 0.32 + Math.sin(i * 2.4) * 0.11 * (i % 3)], s: [1.2, 0.9, 1] });
      for (const [x, z] of [[0.66, 0.5], [0.12, 0.58], [0.7, 0.18]]) kit.ico(0.07, '#a8784a', { p: [x, 0.06, z], s: [1.25, 0.85, 1] });
      break;
    }
    case 'escalator': {
      // An escalator rising to the next floor against the back wall: steel sides, black handrails, and steps that keep on coming.
      const H = 2.75;
      const z0 = hd - 0.3;
      const z1 = -hd + 0.25;
      const slope = Math.atan2(H, z0 - z1);
      const run = Math.hypot(H, z0 - z1);
      const STEEL = '#bcc3ca';
      // The truss under it, and the landings top and bottom.
      kit.beam([0, 0.35, z0], [0, H - 0.2, z1], hw * 2 - 0.3, 0.5, '#8f969e');
      kit.box(hw * 2 - 0.2, 0.06, 0.6, '#9aa1a8', { p: [0, 0.03, z0 + 0.1], jitter: 0 });
      kit.box(hw * 2 + 0.1, 0.12, 0.5, '#9aa1a8', { p: [0, H - 0.06, -hd + 0.25] });
      kit.box(hw * 2 + 0.3, 0.3, 0.3, '#e8e4dc', { p: [0, H + 0.1, -hd + 0.15] });
      for (const s of [-1, 1]) {
        const x = s * (hw - 0.12);
        // Side panels following the slope, with a level run at each end.
        kit.beam([x, 0.55, z0 - 0.1], [x, H + 0.2, z1 + 0.05], 0.12, 0.85, STEEL);
        kit.box(0.12, 0.85, 0.5, STEEL, { p: [x, 0.43, z0 + 0.1] });
        // The handrail: black, along the top of the side and round the ends.
        kit.beam([x, 1.05, z0 - 0.1], [x, H + 0.68, z1 + 0.05], 0.1, 0.07, '#1d1f22', 0);
        kit.box(0.1, 0.07, 0.5, '#1d1f22', { p: [x, 0.93, z0 + 0.12], jitter: 0 });
        kit.cyl(0.19, 0.19, 0.1, '#1d1f22', { p: [x, 0.76, z0 + 0.37], r: [0, 0, Math.PI / 2] }, 12);
      }
      // The steps: one long run of them that slides up a step at a time, round and round.
      const steps = new Group();
      const sk = new Kit(77);
      const STEP = 0.32;
      const n = Math.ceil(run / STEP) - 1;
      for (let i = 0; i < n; i++) {
        sk.box(hw * 2 - 0.44, 0.06, STEP - 0.03, '#4a4f56', { p: [0, 0, -i * STEP], jitter: 0.01 });
        sk.box(hw * 2 - 0.44, 0.02, 0.03, '#f2c14e', { p: [0, 0.04, -i * STEP + STEP / 2 - 0.03], jitter: 0 });
      }
      steps.add(sk.build({ castShadow: false, receiveShadow: true }));
      // Laid along the slope: each step stays level as the run slides.
      const lane = new Group();
      lane.position.set(0, 0.62, z0 - 0.15);
      lane.rotation.x = slope;
      lane.add(steps);
      group.add(lane);
      animated.push((t) => {
        if (!calm) steps.position.z = -((t * 0.45) % STEP);
      });
      break;
    }
    case 'pingpong': {
      // A ping-pong table in perfect condition: the net taut, the paddles still in their wrapper.
      const top = 0.76;
      kit.box(hw * 2, 0.06, hd * 2, '#2f6e5a', { p: [0, top, 0] });
      kit.box(hw * 2, 0.065, 0.03, '#f4f1ea', { p: [0, top + 0.001, hd - 0.02], jitter: 0 });
      kit.box(hw * 2, 0.065, 0.03, '#f4f1ea', { p: [0, top + 0.001, -hd + 0.02], jitter: 0 });
      for (const x of [-hw + 0.02, hw - 0.02]) kit.box(0.03, 0.065, hd * 2, '#f4f1ea', { p: [x, top + 0.001, 0], jitter: 0 });
      kit.box(0.02, 0.065, hd * 2, '#f4f1ea', { p: [0, top + 0.002, 0], jitter: 0 });
      // The net, across the middle.
      kit.box(0.03, 0.16, hd * 2 + 0.12, '#f4f1ea', { p: [0, top + 0.1, 0] });
      for (const z of [-hd - 0.06, hd + 0.06]) kit.cyl(0.02, 0.02, 0.2, IRON, { p: [0, top + 0.08, z] }, 6);
      for (const x of [-hw + 0.2, hw - 0.2]) for (const z of [-hd + 0.2, hd - 0.2]) kit.box(0.06, top, 0.06, IRON, { p: [x, top / 2, z] });
      // Two paddles, still in their plastic, and the ball nobody has hit.
      for (const [x, c] of [[-0.55, '#e5484d'], [0.6, '#1f2a44']] as const) {
        kit.cyl(0.13, 0.13, 0.025, c, { p: [x, top + 0.05, 0.15] }, 12);
        kit.box(0.05, 0.025, 0.16, WOOD_LIGHT, { p: [x, top + 0.05, 0.33] });
        kit.box(0.3, 0.01, 0.42, '#e8f2f6', { p: [x, top + 0.07, 0.22], jitter: 0 });
      }
      kit.sphere(0.035, '#fbf6ec', { p: [0.25, top + 0.07, -0.3] }, 8, 6);
      break;
    }
    case 'shopfront': {
      // A row of three shops along the back wall: lit windows with something on show, an awning each in a different colour, and a fascia over it.
      const SHOPS = [
        { awning: '#e5484d', fascia: '#2f3338', glow: '#fff3dc', show: 'dress' },
        { awning: '#2e9c8f', fascia: '#f4efe6', glow: '#eaf6ff', show: 'shoes' },
        { awning: '#ffbe0b', fascia: '#3a4a66', glow: '#fff0f3', show: 'boxes' },
      ] as const;
      const sw = (hw * 2) / SHOPS.length;
      SHOPS.forEach((shop, i) => {
        const cx = -hw + (i + 0.5) * sw;
        const z = wallZ + 0.04;
        for (const s of [-1, 1]) kit.box(0.16, 2.7, 0.2, '#e8e4dc', { p: [cx + s * (sw / 2 - 0.08), 1.35, z] });
        kit.box(sw - 0.3, 0.32, 0.1, '#d8d2c8', { p: [cx, 0.16, z + 0.04] });
        // The window, and a door beside it.
        const ww = sw * 0.62;
        const wx = cx - sw * 0.14;
        kit.addGlow(new BoxGeometry(ww, 1.45, 0.02), shop.glow, { p: [wx, 1.05, z + 0.02] });
        kit.box(ww + 0.08, 0.06, 0.08, '#8b9198', { p: [wx, 1.8, z + 0.05], jitter: 0 });
        kit.box(ww + 0.08, 0.06, 0.08, '#8b9198', { p: [wx, 0.32, z + 0.05], jitter: 0 });
        const dx = cx + sw * 0.32;
        kit.addGlow(new BoxGeometry(sw * 0.24, 1.6, 0.02), shade(shop.glow, -0.08), { p: [dx, 1.12, z + 0.02] });
        kit.box(0.05, 1.62, 0.07, '#8b9198', { p: [dx - sw * 0.12, 1.12, z + 0.05], jitter: 0 });
        // What's on show.
        if (shop.show === 'dress') {
          for (const [x, c] of [[-0.35, '#ff8fab'], [0.35, '#c49bff']] as const) {
            kit.cyl(0.03, 0.03, 0.45, '#8b9198', { p: [wx + x, 0.62, z + 0.18] }, 5);
            kit.cyl(0.12, 0.28, 0.6, c, { p: [wx + x, 1.12, z + 0.18] }, 8);
            kit.sphere(0.1, '#f1e4d4', { p: [wx + x, 1.52, z + 0.18] }, 8, 6);
          }
        } else if (shop.show === 'shoes') {
          for (let r = 0; r < 2; r++) {
            kit.box(ww - 0.2, 0.04, 0.22, '#ffffff', { p: [wx, 0.62 + r * 0.45, z + 0.15], jitter: 0 });
            for (let j = 0; j < 3; j++) kit.rbox(0.24, 0.1, 0.12, 0.04, ['#e5484d', '#3a86ff', '#2b2f33'][(j + r) % 3], { p: [wx - 0.36 + j * 0.36, 0.7 + r * 0.45, z + 0.16] });
          }
        } else {
          for (const [x, y, s, c] of [[-0.3, 0.55, 0.3, '#ff8fab'], [0.1, 0.5, 0.22, '#7fd3b0'], [0.38, 0.52, 0.26, '#3a86ff'], [-0.1, 0.83, 0.24, '#ffbe0b']] as const) kit.box(s, s, s, c, { p: [wx + x, y + s / 2 - 0.1, z + 0.18], r: [0, x, 0] });
        }
        // The awning: stripes sloping out over the window, with a scalloped edge; the fascia over it.
        const stripes = 6;
        for (let j = 0; j < stripes; j++) {
          const x = cx - sw / 2 + 0.2 + (j + 0.5) * ((sw - 0.4) / stripes);
          kit.box((sw - 0.4) / stripes, 0.04, 0.6, j % 2 ? '#ffffff' : shop.awning, { p: [x, 2.05, z + 0.32], r: [0.42, 0, 0], jitter: 0.02 });
          kit.cyl(0.11, 0.11, 0.03, j % 2 ? '#ffffff' : shop.awning, { p: [x, 1.9, z + 0.6], r: [Math.PI / 2, 0, 0] }, 8);
        }
        kit.box(sw - 0.2, 0.36, 0.12, shop.fascia, { p: [cx, 2.45, z + 0.04] });
        kit.addGlow(new BoxGeometry(sw * 0.4, 0.1, 0.02), shop.fascia === '#f4efe6' ? '#2e9c8f' : '#ffffff', { p: [cx, 2.45, z + 0.11] });
      });
      break;
    }
  }
  if (!kit.isEmpty()) group.add(kit.build({ castShadow: true, receiveShadow: true }));
  return group;
}
