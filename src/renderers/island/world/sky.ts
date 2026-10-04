// A warm gradient sky dome: peach at the horizon into a clear sky blue, with
// a soft sun glow. Fog uses the horizon color so the sea melts into it. At
// night (uNight → 1) the same dome deepens to ink blue, with a moon and stars.

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

export const HORIZON = '#ffd7b5';
export const NIGHT_HORIZON = '#24305c';

/** Where the moon hangs: high in the north, so its path glitters on the sea in front of the camera. */
export const MOON_DIR = new Vector3(-0.3, 0.95, -1).normalize();

export function buildSky(sunDir: Vector3) {
  const mat = new ShaderMaterial({
    uniforms: {
      uHorizon: { value: new Color(HORIZON) },
      uMid: { value: new Color('#bfe4f1') },
      uTop: { value: new Color('#79c3ea') },
      uSun: { value: sunDir.clone().normalize() },
      uNight: { value: 0 },
      uNightHorizon: { value: new Color(NIGHT_HORIZON) },
      uNightMid: { value: new Color('#16204a') },
      uNightTop: { value: new Color('#0a1030') },
      uMoon: { value: MOON_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon, uMid, uTop, uSun;
      uniform float uNight;
      uniform vec3 uNightHorizon, uNightMid, uNightTop, uMoon;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, y));
        col = mix(col, uTop, smoothstep(0.2, 0.75, y));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.18 + pow(s, 200.0) * 0.6);
        if (uNight > 0.0) {
          vec3 night = mix(uNightHorizon, uNightMid, smoothstep(-0.02, 0.25, y));
          night = mix(night, uNightTop, smoothstep(0.25, 0.8, y));
          // Stars: one maybe-star per cell of a sphere grid, brighter toward the zenith.
          vec2 g = vec2(atan(d.z, d.x) * 60.0, asin(clamp(y, -1.0, 1.0)) * 60.0);
          vec2 c = floor(g);
          float h = hash(c);
          vec2 o = vec2(hash(c + 7.1), hash(c + 3.7)) * 0.6 + 0.2;
          float star = step(0.93, h) * smoothstep(0.16, 0.0, length(fract(g) - o)) * smoothstep(0.05, 0.3, y);
          night += vec3(0.85, 0.9, 1.0) * star * (0.5 + 0.5 * fract(h * 91.0));
          // The moon, with a soft halo.
          float m = max(dot(d, uMoon), 0.0);
          night += vec3(0.75, 0.82, 1.0) * (pow(m, 12.0) * 0.12 + pow(m, 90.0) * 0.25);
          night = mix(night, vec3(0.97, 0.96, 0.9), smoothstep(0.9993, 0.9996, m));
          col = mix(col, night, uNight);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new SphereGeometry(800, 32, 16), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}
