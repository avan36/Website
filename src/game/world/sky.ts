// A warm gradient sky dome: peach at the horizon into a clear sky blue, with
// a soft sun glow. Fog uses the horizon color so the sea melts into it.

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

export const HORIZON = '#ffd7b5';

export function buildSky(sunDir: Vector3) {
  const mat = new ShaderMaterial({
    uniforms: {
      uHorizon: { value: new Color(HORIZON) },
      uMid: { value: new Color('#bfe4f1') },
      uTop: { value: new Color('#79c3ea') },
      uSun: { value: sunDir.clone().normalize() },
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
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, y));
        col = mix(col, uTop, smoothstep(0.2, 0.75, y));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.18 + pow(s, 200.0) * 0.6);
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
