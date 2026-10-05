// Night: the reward for a full word hoard. Everything the day is made of
// eases toward a moonlit palette (sky, fog, lights, sea, clouds), and three
// things that only exist after dark fade in: halos around every lamp and
// window, pools of lamplight on the ground below them, and fireflies drifting
// over the grass. One value, 0 (day) to 1 (night), drives it all, so day is
// exactly the day it always was.
//
// Two things bring the dark. The island keeps real time (src/world/clock.ts):
// after sunset the sky, sea and light go to night and every window and lamp
// lights up. And finding every lost word brings the reward night at any hour.
// The darkness is whichever is deeper, max(clock, reward), but the moon and
// the fireflies belong to the reward alone: an ordinary evening is starry and
// lamplit; the moonlit night with fireflies is something you earn.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
  type Scene,
} from 'three';
import type { Glow } from '../landmarks/builders';
import { heightAt, isOpenGround, pathDist, rockiness } from './shape';
import { MOON_DIR, NIGHT_HORIZON } from './sky';
import { rng, smoothstep } from '../util/math';

export interface NightTargets {
  scene: Scene;
  hemi: HemisphereLight;
  sun: DirectionalLight;
  sky: Mesh;
  water: ShaderMaterial;
  ambient: { night(n: number): void; boatLamp: Mesh };
  landmarks: { night(n: number): void; glows(): { halos: Glow[]; pools: Glow[] }; haloMoves?(): Vector3[] | null }[];
  /** Anything else that changes after dark but has no lamps of its own. */
  extras?: { night(n: number): void }[];
  mobile: boolean;
}

/** How long night takes to fall (or lift), in seconds. */
const FALL = 2.2;

const WARM = new Color('#ffc46b');
const POOL = new Color('#ffb65c');

// Soft additive sprites: a halo is a bright core in a wide glow.
const haloShader = {
  vertexShader: /* glsl */ `
    attribute float size;
    attribute float seed;
    attribute vec3 color;
    uniform float uTime, uNight, uScale;
    varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float flick = 0.93 + 0.07 * sin(uTime * 7.0 + seed * 17.0) * sin(uTime * 2.3 + seed * 5.0);
      gl_PointSize = size * uScale / -mv.z;
      vColor = color * flick * uNight;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord * 2.0 - 1.0);
      if (d > 1.0) discard;
      float a = pow(1.0 - d, 2.4) * 0.55 + pow(1.0 - d, 9.0) * 0.6;
      gl_FragColor = vec4(vColor * a, 1.0);
    }
  `,
};

// Fireflies drift on their own little loops, worked out on the GPU from a seed.
const fireflyShader = {
  vertexShader: /* glsl */ `
    attribute vec4 seed; // phase, speed, loop radius, warmth
    uniform float uTime, uNight, uScale;
    varying vec3 vColor;
    void main() {
      float t = uTime * seed.y + seed.x;
      vec3 p = position + vec3(
        sin(t) * seed.z + sin(t * 2.3) * 0.25,
        0.55 + sin(t * 1.7) * 0.3 + sin(t * 0.45) * 0.25,
        cos(t * 0.8) * seed.z + cos(t * 1.9) * 0.2);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float blink = smoothstep(0.15, 0.95, sin(uTime * (0.7 + seed.y) + seed.x * 3.0) * 0.5 + 0.5);
      gl_PointSize = (0.2 + 0.22 * blink) * uScale / -mv.z;
      vColor = mix(vec3(0.82, 1.0, 0.45), vec3(1.0, 0.85, 0.42), seed.w) * blink * uNight;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord * 2.0 - 1.0);
      if (d > 1.0) discard;
      float a = pow(1.0 - d, 3.0) * 0.7 + smoothstep(0.3, 0.0, d);
      gl_FragColor = vec4(vColor * a, 1.0);
    }
  `,
};

// Lamplight on the ground: a flat disc that adds warm light, brightest in the middle.
const poolShader = {
  vertexShader: /* glsl */ `
    attribute vec2 corner;
    varying vec2 vUv;
    void main() {
      vUv = corner;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uNight;
    varying vec2 vUv;
    void main() {
      float a = smoothstep(1.0, 0.0, length(vUv));
      gl_FragColor = vec4(uColor * a * a * uNight * 0.42, 1.0);
    }
  `,
};

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false } as const;

function haloPoints(halos: Glow[]) {
  const geo = new BufferGeometry();
  const pos = new Float32Array(halos.length * 3);
  const size = new Float32Array(halos.length);
  const seed = new Float32Array(halos.length);
  const color = new Float32Array(halos.length * 3);
  halos.forEach(([x, y, z, s], i) => {
    pos.set([x, y, z], i * 3);
    size[i] = s;
    seed[i] = (i * 0.618) % 1;
    color.set([WARM.r, WARM.g, WARM.b], i * 3);
  });
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('size', new BufferAttribute(size, 1));
  geo.setAttribute('seed', new BufferAttribute(seed, 1));
  geo.setAttribute('color', new BufferAttribute(color, 3));
  return geo;
}

function poolMesh(pools: Glow[], uniforms: { uNight: { value: number } }) {
  const geo = new BufferGeometry();
  const pos = new Float32Array(pools.length * 12);
  const corner = new Float32Array(pools.length * 8);
  const idx: number[] = [];
  pools.forEach(([x, y, z, r], i) => {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    c.forEach(([u, v], k) => {
      pos.set([x + u * r, y + 0.03, z + v * r], (i * 4 + k) * 3);
      corner.set([u, v], (i * 4 + k) * 2);
    });
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('corner', new BufferAttribute(corner, 2));
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    ...poolShader,
    ...additive,
    uniforms: { uColor: { value: POOL.clone() }, uNight: uniforms.uNight },
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

function fireflies(count: number) {
  const rand = rng(77);
  const pos: number[] = [];
  const seed: number[] = [];
  for (let tries = 0; pos.length < count * 3 && tries < count * 60; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 21;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 0.9 || rockiness(x, z) > 0.3 || pathDist(x, z) < 1 || !isOpenGround(x, z, -0.6)) continue;
    pos.push(x, h, z);
    seed.push(rand() * 40, 0.25 + rand() * 0.35, 0.4 + rand() * 0.9, rand());
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('seed', new BufferAttribute(new Float32Array(seed), 4));
  return geo;
}

export function buildNight(o: NightTargets) {
  const group = new Group();
  group.name = 'night';
  group.visible = false;

  const fog = o.scene.fog as Fog;
  const skyU = (o.sky.material as ShaderMaterial).uniforms;
  // The day as it is now, so n = 0 puts every value back exactly.
  const day = {
    background: (o.scene.background as Color).clone(),
    fog: fog.color.clone(),
    sky: o.hemi.color.clone(),
    ground: o.hemi.groundColor.clone(),
    hemi: o.hemi.intensity,
    sunColor: o.sun.color.clone(),
    sun: o.sun.intensity,
    sunPos: o.sun.position.clone(),
    shadow: o.sun.shadow.intensity,
  };
  const night = {
    background: new Color(NIGHT_HORIZON),
    fog: new Color('#1c2a55'),
    sky: new Color('#6a80c4'),
    ground: new Color('#2f3358'),
    hemi: 0.82,
    sunColor: new Color('#b4c4ff'),
    sun: 1.25,
    sunPos: MOON_DIR.clone().multiplyScalar(day.sunPos.length()),
    shadow: 0.6,
  };

  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 800 } };
  // Fireflies only come out for the reward.
  const flyUniforms = { uTime: uniforms.uTime, uNight: { value: 0 }, uScale: uniforms.uScale };
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  // Which halos and pools are whose, to turn one landmark's down (see dim()).
  const owns: { halos: [number, number]; pools: [number, number] }[] = [];
  for (const l of o.landmarks) {
    const g = l.glows();
    owns.push({ halos: [halos.length, g.halos.length], pools: [pools.length, g.pools.length] });
    halos.push(...g.halos);
    pools.push(...g.pools);
  }
  const haloMesh = new Points(haloPoints(halos), new ShaderMaterial({ ...haloShader, ...additive, uniforms }));
  haloMesh.frustumCulled = false;
  haloMesh.renderOrder = 4;
  const flies = new Points(fireflies(o.mobile ? 28 : 52), new ShaderMaterial({ ...fireflyShader, ...additive, uniforms: flyUniforms }));
  flies.frustumCulled = false;
  flies.renderOrder = 4;
  // The boat's lamp moves, so its halo is a sprite of its own riding along.
  const boatHalo = new Points(haloPoints([[0, 0, 0, 2.2]]), new ShaderMaterial({ ...haloShader, ...additive, uniforms }));
  boatHalo.frustumCulled = false;
  boatHalo.renderOrder = 4;
  const pool = poolMesh(pools, uniforms);
  group.add(haloMesh, flies, pool, boatHalo);
  const dimmed = new Map<number, number>();

  let target = 0;
  let p = 0; // progress 0..1, linear in time
  let shown = 0; // the eased reward amount last applied
  let clockWant = 0; // how dark the real clock says it is
  let clock = 0; // ...eased, so dusk never jumps
  let dark = 0; // what's applied: max(clock, reward)
  const lamp = new Vector3();

  function apply(n: number, reward: number) {
    uniforms.uNight.value = n;
    flyUniforms.uNight.value = reward;
    if (skyU.uMoonOn) skyU.uMoonOn.value = reward;
    group.visible = n > 0.001;
    (o.scene.background as Color).lerpColors(day.background, night.background, n);
    fog.color.lerpColors(day.fog, night.fog, n);
    o.hemi.color.lerpColors(day.sky, night.sky, n);
    o.hemi.groundColor.lerpColors(day.ground, night.ground, n);
    o.hemi.intensity = day.hemi + (night.hemi - day.hemi) * n;
    o.sun.color.lerpColors(day.sunColor, night.sunColor, n);
    o.sun.intensity = day.sun + (night.sun - day.sun) * n;
    // The light swings round from the sun to the moon, so shadows wheel as night falls.
    if (n > 0) o.sun.position.lerpVectors(day.sunPos, night.sunPos, n).setLength(day.sunPos.length());
    else o.sun.position.copy(day.sunPos);
    o.sun.shadow.intensity = day.shadow + (night.shadow - day.shadow) * n;
    skyU.uNight.value = n;
    o.water.uniforms.uNight.value = n;
    o.ambient.night(n);
    for (const l of o.landmarks) l.night(n);
    for (const x of o.extras ?? []) x.night(n);
  }

  return {
    group,
    /** Fall into night (true) or back into day. Instant skips the transition (first frame, a restore). */
    set(on: boolean, instant = false) {
      target = on ? 1 : 0;
      if (instant) p = target;
    },
    get on() {
      return target === 1;
    },
    /** 0..1: how far the reward night has fallen right now. */
    get amount() {
      return shown;
    },
    /** 0..1: how dark it is right now, from the clock or the reward, whichever is deeper. */
    get dark() {
      return dark;
    },
    /** How dark the real clock says it is (1 - daylight). Instant skips the easing (the first frame). */
    setClock(d: number, instant = false) {
      clockWant = Math.min(1, Math.max(0, d));
      if (instant) clock = clockWant;
    },
    /**
     * Turn one landmark's halos and pools of light down, 0 (as they are) to 1
     * (gone): its windows and lamps aren't there while it's opened up to show
     * the room inside. `i` is its place in `landmarks`.
     */
    dim(i: number, k: number) {
      const own = owns[i];
      k = Math.min(1, Math.max(0, k));
      if (!own || (dimmed.get(i) ?? 0) === k) return;
      dimmed.set(i, k);
      const size = haloMesh.geometry.getAttribute('size') as BufferAttribute;
      const [h0, hn] = own.halos;
      for (let j = h0; j < h0 + hn; j++) size.setX(j, halos[j][3] * (1 - k));
      size.needsUpdate = true;
      // A pool shrinks to its middle.
      const pos = pool.geometry.getAttribute('position') as BufferAttribute;
      const corner = pool.geometry.getAttribute('corner') as BufferAttribute;
      const [p0, pn] = own.pools;
      for (let j = p0; j < p0 + pn; j++) {
        const [x, , z, r] = pools[j];
        for (let c = j * 4; c < j * 4 + 4; c++) pos.setX(c, x + corner.getX(c) * r * (1 - k)).setZ(c, z + corner.getY(c) * r * (1 - k));
      }
      pos.needsUpdate = true;
    },
    /** Pixel scale for the sprites: drawing-buffer height over the view's height at unit distance. */
    resize(bufferHeight: number, fovDeg: number) {
      uniforms.uScale.value = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },
    update(t: number, dt: number, quick = false) {
      uniforms.uTime.value = t;
      if (p !== target) {
        const step = dt / (quick ? 0.8 : FALL);
        p = target > p ? Math.min(target, p + step) : Math.max(target, p - step);
      }
      // The clock eases at the same pace as the reward, so a ?time= jump or a tab
      // left open over dusk fades rather than snaps.
      if (clock !== clockWant) {
        const step = dt / (quick ? 0.8 : FALL);
        clock = clockWant > clock ? Math.min(clockWant, clock + step) : Math.max(clockWant, clock - step);
      }
      const r = smoothstep(0, 1, p);
      const n = Math.max(r, smoothstep(0, 1, clock));
      if (r !== shown || n !== dark) apply((dark = n), (shown = r));
      if (group.visible) {
        // A building bouncing (hovered, arrived at) takes its halos with it.
        const at = haloMesh.geometry.getAttribute('position') as BufferAttribute;
        o.landmarks.forEach((l, i) => {
          const moved = l.haloMoves?.();
          if (!moved) return;
          const [h0] = owns[i].halos;
          moved.forEach((v, j) => at.setXYZ(h0 + j, v.x, v.y, v.z));
          at.needsUpdate = true;
        });
        o.ambient.boatLamp.getWorldPosition(lamp);
        boatHalo.position.copy(lamp);
      }
    },
  };
}
