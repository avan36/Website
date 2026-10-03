// The sea: faceted vertex waves, turquoise shallows over the sand, deep blue
// further out, and animated foam that laps at the shoreline.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type DataTexture,
} from 'three';

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
        uShallow: { value: new Color('#5fe0d0') },
        uMid: { value: new Color('#2fa6c9') },
        uSea: { value: new Color('#2b8fb8') },
        uDeep: { value: new Color('#135a7a') },
        uSun: { value: sunDir.clone().normalize() },
        uRise: { value: 0 },
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
      uniform float uRise;
      uniform vec3 uShallow, uMid, uSea, uDeep, uSun;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }

      void main() {
        vec2 uv = vWorld.xz / uExtent + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float h = mix(-8.0, texture2D(uHeight, uv).r * 12.0 - 8.0, inside);
        // While the island rises out of the sea the seabed comes up with it.
        h -= uRise;
        float depth = max(-h, 0.0) + max(vWorld.y, 0.0) * 0.5;

        vec3 col = mix(uShallow, uMid, smoothstep(0.05, 1.3, depth));
        col = mix(col, uSea, smoothstep(1.0, 2.8, depth));
        col = mix(col, uDeep, smoothstep(2.8, 7.5, depth));

        // Faceted lighting from screen-space derivatives.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        vec3 v = normalize(cameraPosition - vWorld);
        float diff = 0.82 + 0.18 * max(dot(n, uSun), 0.0);
        col *= diff;
        float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 90.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 0.55;
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        col = mix(col, vec3(0.85, 0.93, 1.0), fres * 0.25);

        // Foam: a bright line at the waterline plus rings that roll in and fade.
        float wob = vnoise(vWorld.xz * 0.45 + uTime * 0.15) * 0.5;
        float edge = 1.0 - smoothstep(0.0, 0.16 + wob * 0.12, depth);
        float rings = sin(depth * 7.0 - uTime * 2.1 + wob * 5.0);
        float lap = smoothstep(0.82, 0.97, rings) * (1.0 - smoothstep(0.15, 0.95, depth));
        float speck = step(0.86, vnoise(vWorld.xz * 2.2 + uTime * 0.3)) * (1.0 - smoothstep(0.1, 0.6, depth)) * 0.5;
        float foam = clamp(max(edge, lap * 0.8) + speck, 0.0, 1.0);
        col = mix(col, vec3(1.0, 0.99, 0.96), foam);

        float alpha = mix(0.62, 0.97, smoothstep(0.1, 2.6, depth));
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
