// The sea: faceted vertex waves, turquoise shallows over the sand, deep blue
// further out, and animated foam that laps at the shoreline. At night (uNight
// → 1) it turns ink blue, the moon lays a glittering path across it and the
// stars show in the calm water further out.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  type DataTexture,
} from 'three';
import { smoothstep } from '../util/math';
import { MOON_DIR } from './sky';

/** The swell's height at (x, z): the same waves the vertex shader makes, for things that float. */
export function waveHeight(x: number, z: number, t: number) {
  const amp = 0.13 * (1 - smoothstep(70, 160, Math.hypot(x, z)));
  const w = Math.sin(x * 0.33 + t * 1.05) * 0.5 + Math.sin(z * 0.41 - t * 0.85) * 0.5 + Math.sin((x + z) * 0.77 + t * 1.7) * 0.22;
  return w * amp;
}

export function buildWater(height: { tex: DataTexture; extent: number }, sunDir: Vector3) {
  // A polar grid: fine near the island, coarse toward the horizon.
  const radii: number[] = [];
  for (let r = 0; r <= 64; r += 0.8) radii.push(r);
  let r = 64;
  while (r < 700) {
    r *= 1.09;
    radii.push(r);
  }
  const seg = 168;
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2 + (i % 2) * (Math.PI / seg);
      pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
    }
  }
  const ring = (i: number, s: number) => 1 + (i - 1) * seg + (((s % seg) + seg) % seg);
  for (let s = 0; s < seg; s++) idx.push(0, ring(1, s + 1), ring(1, s));
  for (let i = 1; i < radii.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = ring(i, s);
      const b = ring(i, s + 1);
      const c = ring(i + 1, s);
      const d = ring(i + 1, s + 1);
      if (i % 2) {
        idx.push(a, b, c, b, d, c);
      } else {
        idx.push(a, b, d, a, d, c);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);

  const mat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uHeight: { value: null },
        uExtent: { value: height.extent },
        // Where the baked seabed hands over to the open sea: past the furthest
        // anyone can swim, and inside the texture's square (half of the extent).
        uFar: { value: new Vector2(height.extent * 0.39, height.extent * 0.48) },
        uShallow: { value: new Color('#5fe0d0') },
        uMid: { value: new Color('#2fa6c9') },
        uSea: { value: new Color('#2b8fb8') },
        uDeep: { value: new Color('#135a7a') },
        uSun: { value: sunDir.clone().normalize() },
        uRise: { value: 0 },
        uNight: { value: 0 },
        uMoon: { value: MOON_DIR.clone() },
        uNightShallow: { value: new Color('#1d566e') },
        uNightMid: { value: new Color('#1e537a') },
        uNightSea: { value: new Color('#173f68') },
        uNightDeep: { value: new Color('#0c2142') },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float d = length(wp.xz);
        float amp = 0.13 * (1.0 - smoothstep(70.0, 160.0, d));
        float w = sin(wp.x * 0.33 + uTime * 1.05) * 0.5
                + sin(wp.z * 0.41 - uTime * 0.85) * 0.5
                + sin((wp.x + wp.z) * 0.77 + uTime * 1.7) * 0.22;
        wp.y += w * amp;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uHeight;
      uniform float uExtent;
      uniform vec2 uFar;
      uniform float uRise;
      uniform vec3 uShallow, uMid, uSea, uDeep, uSun;
      uniform float uNight;
      uniform vec3 uMoon, uNightShallow, uNightMid, uNightSea, uNightDeep;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }

      void main() {
        // The seabed is baked into a square texture. Well inside its edges it
        // fades into open-sea depth along a circle, so no straight edge shows
        // (the headland's rocky shelf would otherwise run right up to one).
        vec2 uv = vWorld.xz / uExtent + 0.5;
        float far = smoothstep(uFar.x, uFar.y, length(vWorld.xz));
        float h = mix(texture2D(uHeight, uv).r * 12.0 - 8.0, -8.0, far);
        // While the island rises out of the sea the seabed comes up with it.
        h -= uRise;
        float depth = max(-h, 0.0) + max(vWorld.y, 0.0) * 0.5;

        vec3 shallow = mix(uShallow, uNightShallow, uNight);
        vec3 col = mix(shallow, mix(uMid, uNightMid, uNight), smoothstep(0.05, 1.3, depth));
        col = mix(col, mix(uSea, uNightSea, uNight), smoothstep(1.0, 2.8, depth));
        col = mix(col, mix(uDeep, uNightDeep, uNight), smoothstep(2.8, 7.5, depth));

        // Faceted lighting from screen-space derivatives, lit by the sun or the moon.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 L = normalize(mix(uSun, uMoon, uNight));
        float diff = 0.82 + 0.18 * max(dot(n, L), 0.0);
        col *= diff;
        float rl = max(dot(reflect(-L, n), v), 0.0);
        // By night: a glittering path of moonlight (tight highlights on the facets) and a faint sheen.
        float spec = mix(pow(rl, 90.0) * 0.55, pow(rl, 400.0) * 0.95 + pow(rl, 40.0) * 0.08, uNight);
        col += mix(vec3(1.0, 0.95, 0.85), vec3(0.8, 0.88, 1.0), uNight) * spec;
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        col = mix(col, mix(vec3(0.85, 0.93, 1.0), vec3(0.22, 0.3, 0.55), uNight), fres * 0.25);
        if (uNight > 0.0) {
          // Stars in the calm water further out, twinkling as the facets tilt.
          vec2 cell = floor(vWorld.xz * 0.8);
          float tw = 0.45 + 0.55 * sin(uTime * 2.3 + hash(cell + 3.1) * 40.0);
          float star = step(0.955, hash(cell)) * smoothstep(0.11, 0.0, length(fract(vWorld.xz * 0.8) - 0.5)) * tw;
          col += vec3(0.82, 0.88, 1.0) * star * smoothstep(1.2, 3.5, depth) * uNight * 0.85;
        }

        // Foam: a bright line at the waterline plus rings that roll in and fade.
        float wob = vnoise(vWorld.xz * 0.45 + uTime * 0.15) * 0.5;
        float edge = 1.0 - smoothstep(0.0, 0.16 + wob * 0.12, depth);
        float rings = sin(depth * 7.0 - uTime * 2.1 + wob * 5.0);
        float lap = smoothstep(0.82, 0.97, rings) * (1.0 - smoothstep(0.15, 0.95, depth));
        float speck = step(0.86, vnoise(vWorld.xz * 2.2 + uTime * 0.3)) * (1.0 - smoothstep(0.1, 0.6, depth)) * 0.5;
        float foam = clamp(max(edge, lap * 0.8) + speck, 0.0, 1.0);
        col = mix(col, mix(vec3(1.0, 0.99, 0.96), vec3(0.36, 0.45, 0.64), uNight), foam);

        // See-through in the shallows; deep water is opaque, so the edges of the seabed never show.
        float alpha = mix(0.62, 0.97, smoothstep(0.1, 2.6, depth));
        alpha = mix(alpha, 1.0, smoothstep(2.6, 4.5, depth));
        alpha = max(alpha, foam);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  mat.uniforms.uHeight.value = height.tex;
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return { mesh, material: mat };
}
