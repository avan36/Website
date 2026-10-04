// The portal in the middle of the plaza: a stone ring hanging just above a
// little plinth, with a slow violet swirl inside it and motes of light
// drifting in. Step into it from the front (or click it) and you're drawn
// through to the next way of seeing the island. After dark it glows brighter
// and casts a violet light on the cobbles.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Kit } from '../world/kit';
import type { Collider } from '../world/nature';
import { groundAt, type ActivitySpot } from '../world/shape';
import { rng } from '../util/math';

/** The ring's size: a little taller than the explorer. */
const RING = 1.18;
const DISC = 1.0;
/** How high the ring's middle hangs above the ground. */
const MIDDLE = 1.62;
const MOTES = 14;

const swirlShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime, uNight, uFlare;
    uniform vec3 uViolet, uMagenta, uCyan, uDeep;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      // Two spirals turning against each other, drawn in toward the middle.
      float lr = log(r + 0.06);
      float s1 = sin(a * 3.0 + lr * 5.5 - uTime * 1.9);
      float s2 = sin(a * 5.0 - lr * 8.0 + uTime * 1.1);
      vec3 col = mix(uDeep, uViolet, smoothstep(-0.4, 0.9, s1));
      col = mix(col, uMagenta, smoothstep(0.55, 1.0, s2) * 0.55);
      // A bright eye in the middle and a cyan rim round the edge.
      col = mix(col, vec3(1.0, 0.93, 1.0), (1.0 - smoothstep(0.0, 0.32, r)) * 0.8);
      col = mix(col, uCyan, smoothstep(0.7, 0.98, r) * 0.85);
      col *= 0.95 + 0.35 * uNight + 0.9 * uFlare;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
};

// Motes spiral in from in front of the ring and vanish into the swirl, worked out on the GPU from a seed.
const moteShader = {
  vertexShader: /* glsl */ `
    attribute vec3 seed; // phase, speed, side
    uniform float uTime, uScale, uNight;
    varying float vGlow;
    varying float vTint;
    void main() {
      float t = fract(uTime * seed.y + seed.x);
      float k = t * t;
      float r = mix(1.7, 0.05, k);
      float a = seed.x * 6.283 + t * 3.5 * seed.z;
      vec3 p = vec3(cos(a) * r, sin(a) * r * 0.85, (1.0 - k) * 1.3 + 0.05);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      vGlow = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t)) * (0.75 + 0.6 * uNight);
      vTint = seed.z * 0.5 + 0.5;
      gl_PointSize = (0.16 + 0.1 * (1.0 - k)) * uScale / -mv.z;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vGlow;
    varying float vTint;
    void main() {
      float d = length(gl_PointCoord * 2.0 - 1.0);
      if (d > 1.0) discard;
      float a = pow(1.0 - d, 2.2);
      vec3 c = mix(vec3(0.75, 0.6, 1.0), vec3(0.55, 0.95, 1.0), vTint);
      gl_FragColor = vec4(c * a * vGlow, 1.0);
    }
  `,
};

// Violet light on the cobbles: brightest under the ring, fading out.
const poolShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv * 2.0 - 1.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      float a = smoothstep(1.0, 0.0, length(vUv));
      gl_FragColor = vec4(uColor * a * a * uAmount, 1.0);
    }
  `,
};

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false } as const;

function frameGeometry() {
  const k = new Kit(611);
  const stone = '#b9b0a4';
  const dark = '#9a9187';
  // A low plinth of two worn steps.
  k.rbox(2.8, 0.18, 1.05, 0.06, dark, { p: [0, 0.09, 0] });
  k.rbox(2.3, 0.14, 0.78, 0.05, stone, { p: [0, 0.25, 0] });
  // Two stubs the ring floats between.
  for (const s of [-1, 1]) {
    k.rbox(0.36, 0.34, 0.42, 0.06, stone, { p: [s * 0.98, 0.45, 0] });
    k.sphere(0.07, '#c4b5fd', { p: [s * 0.98, 0.66, 0] }, 6, 4);
  }
  return k.build();
}

function ringGeometry() {
  const k = new Kit(612);
  // Chunky carved stone, faceted, with glowing studs set round the front.
  k.torus(RING, 0.17, '#a59d93', { s: [1, 1, 1.25], jitter: 0.05 }, 6, 22);
  k.torus(RING - 0.16, 0.05, '#8f877d', { p: [0, 0, 0.12] }, 4, 30);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    k.addGlow(new CylinderGeometry(0.06, 0.06, 0.05, 6), '#e9d5ff', { p: [Math.cos(a) * RING, Math.sin(a) * RING, 0.21], r: [Math.PI / 2, 0, 0] });
  }
  return k.build();
}

export class Portal {
  readonly group = new Group();
  /** For clicking and tapping it. */
  readonly hit: Mesh;
  /** Where its label floats. */
  readonly anchor: Vector3;
  /** The middle of the swirl, for the explorer to vanish into and the wipe to start from. */
  readonly middle: Vector3;
  readonly colliders: Collider[];
  readonly x: number;
  readonly z: number;
  /** 0..1: brighter while someone goes through. */
  flare = 0;
  private ring = new Group();
  private swirl: ShaderMaterial;
  private motes: ShaderMaterial;
  private pool: ShaderMaterial;
  private glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  constructor(
    spot: ActivitySpot,
    private opts: { reducedMotion: boolean },
  ) {
    this.x = spot.x;
    this.z = spot.z;
    const y = groundAt(spot.x, spot.z);
    this.group.name = 'portal';
    this.group.position.set(spot.x, y, spot.z);
    this.middle = new Vector3(spot.x, y + MIDDLE, spot.z);
    this.anchor = new Vector3(spot.x, y + MIDDLE + RING + 0.75, spot.z);

    this.group.add(frameGeometry());
    this.ring.position.y = MIDDLE;
    const ring = ringGeometry();
    ring.children.forEach((m) => {
      const mesh = m as Mesh;
      if (!mesh.castShadow) mesh.material = this.glowMat;
    });
    this.ring.add(ring);

    const C = (hex: string) => new Color(hex);
    this.swirl = new ShaderMaterial({
      ...swirlShader,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uFlare: { value: 0 },
        uViolet: { value: C('#8b5cf6') },
        uMagenta: { value: C('#e879f9') },
        uCyan: { value: C('#67e8f9') },
        uDeep: { value: C('#3b1d8f') },
      },
      side: DoubleSide,
      toneMapped: false,
    });
    const disc = new Mesh(new CircleGeometry(DISC, 48), this.swirl);
    this.ring.add(disc);
    this.group.add(this.ring);

    // Motes, in the ring's frame (so they drift in from the front, the south).
    const seeds = new Float32Array(MOTES * 3);
    const rand = rng(613);
    for (let i = 0; i < MOTES; i++) seeds.set([rand(), 0.12 + rand() * 0.14, rand() > 0.5 ? 1 : -1], i * 3);
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(new Float32Array(MOTES * 3), 3));
    mg.setAttribute('seed', new BufferAttribute(seeds, 3));
    this.motes = new ShaderMaterial({ ...moteShader, ...additive, uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uNight: { value: 0 } } });
    const motes = new Points(mg, this.motes);
    motes.frustumCulled = false;
    motes.renderOrder = 4;
    motes.visible = !opts.reducedMotion;
    this.ring.add(motes);

    this.pool = new ShaderMaterial({ ...poolShader, ...additive, uniforms: { uColor: { value: C('#a78bfa') }, uAmount: { value: 0 } }, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const pool = new Mesh(new PlaneGeometry(6, 6), this.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.04, 0.9);
    pool.renderOrder = 2;
    this.group.add(pool);

    this.hit = new Mesh(new CylinderGeometry(1.4, 1.4, 3.2, 10), new MeshBasicMaterial({ visible: false }));
    this.hit.position.set(spot.x, y + 1.6, spot.z);
    this.hit.userData.place = 'portal';
    this.hit.updateMatrixWorld(true);

    // The plinth and ring are a thin slab across x: three circles hold you off it,
    // and in front, the middle one lets you right up to the swirl.
    this.colliders = [-0.95, 0, 0.95].map((dx) => ({ x: spot.x + dx, z: spot.z, r: 0.5 }));
  }

  /** Pixel scale for the motes (see night.ts). */
  resize(bufferHeight: number, fovDeg: number) {
    this.motes.uniforms.uScale.value = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  update(t: number, night: number) {
    const still = this.opts.reducedMotion;
    // The swirl turns (it stands still for reduced motion); the ring hangs and sways a touch.
    this.swirl.uniforms.uTime.value = still ? 4 : t;
    this.swirl.uniforms.uNight.value = night;
    this.swirl.uniforms.uFlare.value = this.flare;
    this.motes.uniforms.uTime.value = t;
    this.motes.uniforms.uNight.value = night;
    this.pool.uniforms.uAmount.value = 0.1 + night * 0.55 + this.flare * 0.4;
    this.glowMat.color.setScalar(1 + night * 0.6 + this.flare);
    if (!still) {
      this.ring.position.y = MIDDLE + Math.sin(t * 1.3) * 0.05;
      this.ring.rotation.y = Math.sin(t * 0.45) * 0.06;
    }
  }

  /**
   * Where the explorer is relative to the ring's face: `side` across it and
   * `front` out from it (toward the south, where you step in from).
   */
  local(x: number, z: number) {
    return { side: x - this.x, front: z - this.z };
  }

  dispose() {
    this.hit.geometry.dispose();
    (this.hit.material as MeshBasicMaterial).dispose();
  }
}
