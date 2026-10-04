// Rings on the water: ripples round the explorer's legs as it wades, the wake
// it leaves swimming, the splash of jumping in, and the puff of air under a
// double jump. One small mesh draws them all. Each ring is a strip that the
// vertex shader places, sizes and fades from a table of uniforms, riding the
// same swell as the sea, so there's nothing to allocate or upload per ring.

import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { easeOutCubic } from '../util/math';

const MAX = 24;
const SEG = 40;

export interface RippleOpts {
  /** Radius it starts at and spreads out to. */
  from?: number;
  to?: number;
  life?: number;
  /** Line width, in world units. */
  width?: number;
  alpha?: number;
  /** Height to draw it at; on the water (riding the swell) if not given. */
  y?: number;
  /** Seconds to wait before it shows. */
  delay?: number;
}

interface Ring {
  x: number;
  z: number;
  y: number;
  wave: number;
  from: number;
  to: number;
  width: number;
  alpha: number;
  age: number;
  life: number;
}

export class Ripples {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** x, z, radius, width for each ring. */
  private shape = new Float32Array(MAX * 4);
  /** alpha, height, on the water (0 or 1), unused. */
  private look = new Float32Array(MAX * 4);
  private rings: Ring[] = [];
  private next = 0;

  constructor() {
    // Ring index, angle and side (0 inside, 1 outside) for every vertex; the shader does the rest.
    const n = MAX * (SEG + 1) * 2;
    const idx = new Float32Array(n);
    const ang = new Float32Array(n);
    const side = new Float32Array(n);
    const index: number[] = [];
    let v = 0;
    for (let r = 0; r < MAX; r++) {
      const base = v;
      for (let s = 0; s <= SEG; s++) {
        for (const k of [0, 1]) {
          idx[v] = r;
          ang[v] = (s / SEG) * Math.PI * 2;
          side[v] = k;
          v++;
        }
        if (s < SEG) {
          const a = base + s * 2;
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      this.rings.push({ x: 0, z: 0, y: 0, wave: 1, from: 0, to: 0, width: 0, alpha: 0, age: 1, life: 1 });
    }
    const geo = new BufferGeometry();
    // Positions are worked out in the shader; this is only here to satisfy three.
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aRing', new BufferAttribute(idx, 1));
    geo.setAttribute('aAngle', new BufferAttribute(ang, 1));
    geo.setAttribute('aSide', new BufferAttribute(side, 1));
    geo.setIndex(index);

    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uNight: { value: 0 },
          uDay: { value: new Color('#ffffff') },
          uDark: { value: new Color('#a9bde6') },
          uShape: { value: this.shape },
          uLook: { value: this.look },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aRing;
        attribute float aAngle;
        attribute float aSide;
        uniform vec4 uShape[${MAX}];
        uniform vec4 uLook[${MAX}];
        uniform float uTime;
        varying float vAlpha;
        varying float vSide;
        #include <fog_pars_vertex>
        void main() {
          int i = int(aRing + 0.5);
          vec4 s = uShape[i];
          vec4 l = uLook[i];
          float r = max(s.z + (aSide - 0.5) * s.w, 0.0);
          vec3 p = vec3(s.x + cos(aAngle) * r, l.y, s.y + sin(aAngle) * r);
          // The sea's swell (see waveHeight in water.ts), for rings on the water.
          float amp = 0.13 * (1.0 - smoothstep(70.0, 160.0, length(p.xz)));
          float w = sin(p.x * 0.33 + uTime * 1.05) * 0.5 + sin(p.z * 0.41 - uTime * 0.85) * 0.5 + sin((p.x + p.z) * 0.77 + uTime * 1.7) * 0.22;
          p.y += w * amp * l.z;
          vAlpha = l.x;
          vSide = aSide;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDay, uDark;
        uniform float uNight;
        varying float vAlpha;
        varying float vSide;
        #include <fog_pars_fragment>
        void main() {
          // Soft on both rims, so a thin line stays smooth.
          float a = vAlpha * smoothstep(0.0, 0.55, 1.0 - abs(vSide * 2.0 - 1.0));
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(uDay, uDark, uNight), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // merge() copies what it's given: point the table back at the arrays updated each frame.
    this.material.uniforms.uShape.value = this.shape;
    this.material.uniforms.uLook.value = this.look;
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    // After the sea (which is drawn at 1), so the rings lie on top of it.
    this.mesh.renderOrder = 2;
    this.mesh.name = 'ripples';
  }

  spawn(x: number, z: number, o: RippleOpts = {}) {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % MAX;
    r.x = x;
    r.z = z;
    r.wave = o.y === undefined ? 1 : 0;
    r.y = o.y ?? 0.03;
    r.from = o.from ?? 0.2;
    r.to = o.to ?? 1.4;
    r.width = o.width ?? 0.09;
    r.alpha = o.alpha ?? 0.6;
    r.life = o.life ?? 1;
    r.age = -(o.delay ?? 0);
  }

  update(t: number, dt: number, night: number) {
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uNight.value = night;
    for (let i = 0; i < MAX; i++) {
      const r = this.rings[i];
      const k = i * 4;
      if (r.age < r.life) r.age += dt;
      const live = r.age >= 0 && r.age < r.life;
      if (!live) {
        // Out of sight: a ring of no size draws nothing.
        this.shape[k + 2] = 0;
        this.shape[k + 3] = 0;
        this.look[k] = 0;
        continue;
      }
      const f = r.age / r.life;
      this.shape[k] = r.x;
      this.shape[k + 1] = r.z;
      this.shape[k + 2] = r.from + (r.to - r.from) * easeOutCubic(f);
      // Lines thin out as they spread, and fade in fast and out slowly.
      this.shape[k + 3] = r.width * (1 - f * 0.5);
      this.look[k] = r.alpha * Math.min(1, f * 10) * (1 - f) * (1 - f);
      this.look[k + 1] = r.y;
      this.look[k + 2] = r.wave;
    }
  }
}
