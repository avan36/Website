// The edge of the swimming water: a loose ring of buoys bobbing just past the
// furthest anyone can swim, so the current that turns you back has something
// to point to. After dark each one shows a small red lamp.

import { Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, SphereGeometry } from 'three';
import { Kit, litMaterial } from './kit';
import { coastRadius, PIER, SWIM_REACH } from './shape';
import { waveHeight } from './water';

/** Roughly how far apart they float, along the edge. */
const SPACING = 10.5;
/** Just past the limit, so a swimmer stops short of them. */
const OUT = 0.7;
const MAST = 0.62;

function buoyGeometry() {
  const k = new Kit(81);
  k.add(new SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#e5484d', { s: [1, 0.85, 1], jitter: 0.03 });
  k.add(new SphereGeometry(0.3, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#fffaf0', { s: [1, 0.7, 1], jitter: 0.03 });
  k.torus(0.29, 0.045, '#fffaf0', { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] }, 4, 14);
  k.cyl(0.028, 0.034, 0.42, '#3d3a36', { p: [0, 0.42, 0] }, 5);
  k.sphere(0.075, '#e5484d', { p: [0, MAST, 0] }, 7, 5);
  return k.geometry();
}

export function buildBuoys() {
  const group = new Group();
  group.name = 'buoys';

  // Walk round the edge and drop one every SPACING, starting off the end of
  // the pier (it reaches nearest the edge, so a buoy there reads as the limit).
  const spots: { x: number; z: number; seed: number }[] = [];
  const start = Math.atan2(PIER.end, PIER.x);
  const N = 900;
  let run = SPACING; // so the first one lands at the start
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= N; i++) {
    const th = start + (i / N) * Math.PI * 2;
    const r = coastRadius(th) + SWIM_REACH + OUT;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (i > 0) run += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
    if (run >= SPACING && i < N - 20) {
      run = 0;
      spots.push({ x, z, seed: spots.length * 1.7 });
    }
  }

  const body = new InstancedMesh(buoyGeometry(), litMaterial(), spots.length);
  body.castShadow = false;
  body.receiveShadow = false;
  body.frustumCulled = false;
  const lampMat = new MeshBasicMaterial({ color: '#ff6a52', toneMapped: false });
  const lamps = new InstancedMesh(new IcosahedronGeometry(0.1, 1), lampMat, spots.length);
  lamps.frustumCulled = false;
  lamps.visible = false;
  group.add(body, lamps);

  const o = new Object3D();
  const top = new Matrix4().makeTranslation(0, MAST, 0);
  const lamp = new Matrix4();
  const hide = new Matrix4().makeScale(0, 0, 0);

  return {
    group,
    spots,
    /** Bob on the swell; grow (0..1) pops them in with the island, night (0..1) lights the lamps. */
    update(t: number, grow: number, night: number) {
      lamps.visible = night > 0.02;
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        o.position.set(s.x, waveHeight(s.x, s.z, t) - 0.06, s.z);
        o.rotation.set(Math.sin(t * 0.9 + s.seed) * 0.09, s.seed, Math.cos(t * 1.13 + s.seed * 1.3) * 0.09);
        o.scale.setScalar(Math.max(grow, 0.0001));
        o.updateMatrix();
        body.setMatrixAt(i, o.matrix);
        if (lamps.visible) {
          // A slow blink, each buoy in its own time.
          const on = Math.sin(t * 1.6 + s.seed * 2.3) > -0.2 ? night : night * 0.25;
          lamp.multiplyMatrices(o.matrix, top);
          lamps.setMatrixAt(i, on > 0.01 ? lamp.scale(o.scale.set(on, on, on)) : hide);
        }
      }
      body.instanceMatrix.needsUpdate = true;
      if (lamps.visible) lamps.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      body.geometry.dispose();
      lamps.geometry.dispose();
      lampMat.dispose();
    },
  };
}
