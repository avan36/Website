// The polish over the island's picture, drawn after the scene in one pass:
// tilt-shift (the top and bottom of the view soften, like a model on a
// table), bloom (the sun on the water, lit windows, lanterns and fireflies
// glow), tone mapping, and a grade (warm by day, cool by night) with a soft
// vignette. How much of it runs is up to quality.ts; at 'off' the scene is
// drawn straight to the screen, exactly as it was before any of this.

import { ACESFilmicToneMapping, HalfFloatType, NoToneMapping, Uniform, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';
import { BloomEffect, Effect, EffectComposer, EffectPass, KernelSize, RenderPass, TiltShiftEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import type { Effect as EffectName, Level } from './quality';

/** Everything worth tuning by eye, in one place. Day and night values are blended by how dark it is. */
export const FX = {
  bloom: {
    /** How bright (before tone mapping) something must be to glow, and how softly that starts. */
    threshold: { day: 0.95, night: 0.8 },
    smoothing: 0.35,
    intensity: { day: 0.55, night: 0.85 },
    radius: 0.72,
    /** Blur levels: more spreads the glow wider, and costs a little more. */
    levels: { high: 6, lite: 4 },
  },
  tilt: {
    /** The band in focus, as a share of the screen's height, and how gently it gives way to blur. */
    focus: 0.56,
    feather: 0.36,
    /** Phones in portrait see more of the island top to bottom, so keep more of it sharp. */
    focusPortrait: 0.62,
    /** Strength: 0 is none, 1 full. Inside a building there's no table-top look. */
    strength: 0.75,
  },
  grade: {
    /** Saturation and a gentle S-curve, by day and by night. */
    saturation: { day: 1.08, night: 0.9 },
    contrast: { day: 0.1, night: 0.06 },
    /** Tints multiplied in: warm by day, cool by night (warm neutrals, never pure white). */
    warm: [1.03, 1.0, 0.955] as const,
    cool: [0.93, 0.98, 1.07] as const,
    /** How dark the corners go (0 none), tinted toward the hour. */
    vignette: { day: 0.18, night: 0.32 },
  },
  /** Antialiasing samples for the scene, which the renderer's own antialiasing can't do once effects are on. */
  samples: { high: 4, lite: 2 },
};

const gradeShader = /* glsl */ `
  uniform float uNight;
  uniform float uSat;
  uniform float uContrast;
  uniform vec3 uTint;
  uniform float uVignette;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Graded in a rough perceptual space, so the curve bends where the eye sees it.
    vec3 c = sqrt(max(inputColor.rgb, 0.0));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
    c *= uTint;
    // An oval vignette that follows the screen's shape, darkening toward the hour's own colour.
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
    float v = smoothstep(0.32, 0.85, length(d) * 1.25);
    c *= mix(vec3(1.0), uTint * vec3(0.78, 0.74, 0.8), v * uVignette);
    outputColor = vec4(c * c, inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeShader, {
      uniforms: new Map<string, Uniform>([
        ['uNight', new Uniform(0)],
        ['uSat', new Uniform(1)],
        ['uContrast', new Uniform(0)],
        ['uTint', new Uniform(new Vector3(1, 1, 1))],
        ['uVignette', new Uniform(0)],
      ]),
    });
  }
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export interface Post {
  /** Draw the scene (and the effects, if any are on). */
  render(dt?: number): void;
  setSize(w: number, h: number): void;
  /** Change the level or the effects (rebuilt from scratch: it's rare). */
  set(level: Level, effects: readonly EffectName[]): void;
  /** How dark it is (0 day, 1 night), and whether you're inside a building. */
  update(o: { dark: number; inside: boolean; portrait: boolean }, dt: number): void;
  readonly level: Level;
  readonly effects: readonly EffectName[];
  dispose(): void;
}

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, start: { level: Level; effects: readonly EffectName[] }): Post {
  let level: Level = 'off';
  let effects: readonly EffectName[] = [];
  let composer: EffectComposer | null = null;
  let bloom: BloomEffect | null = null;
  let tilt: TiltShiftEffect | null = null;
  let grade: GradeEffect | null = null;
  let w = 1;
  let h = 1;
  let tiltK = 1;

  function teardown() {
    composer?.dispose();
    composer = bloom = tilt = grade = null;
    renderer.toneMapping = ACESFilmicToneMapping;
  }

  function build() {
    teardown();
    if (level === 'off' || !effects.length) return;
    // The scene is drawn to a float buffer untouched; tone mapping happens here, after the glow is added.
    renderer.toneMapping = NoToneMapping;
    composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: FX.samples[level] });
    composer.addPass(new RenderPass(scene, camera));
    const lite = level === 'lite';
    const list: Effect[] = [];
    // Tilt-shift first: it blurs the scene itself, so it has to come before anything is added on top.
    if (effects.includes('tilt')) {
      tilt = new TiltShiftEffect({ focusArea: FX.tilt.focus, feather: FX.tilt.feather, kernelSize: lite ? KernelSize.SMALL : KernelSize.MEDIUM, resolutionScale: lite ? 0.35 : 0.5 });
      list.push(tilt);
    }
    if (effects.includes('bloom')) {
      bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: FX.bloom.threshold.day, luminanceSmoothing: FX.bloom.smoothing, intensity: FX.bloom.intensity.day, radius: FX.bloom.radius, levels: FX.bloom.levels[level] });
      list.push(bloom);
    }
    list.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (effects.includes('grade')) {
      grade = new GradeEffect();
      list.push(grade);
    }
    composer.addPass(new EffectPass(camera, ...list));
    composer.setSize(w, h, false);
  }

  const post: Post = {
    render(dt) {
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    setSize(nw, nh) {
      w = nw;
      h = nh;
      composer?.setSize(w, h, false);
    },
    set(nextLevel, nextEffects) {
      if (nextLevel === level && nextEffects.length === effects.length && nextEffects.every((e) => effects.includes(e))) return;
      level = nextLevel;
      effects = [...nextEffects];
      build();
    },
    update({ dark, inside, portrait }, dt) {
      if (bloom) {
        bloom.luminanceMaterial.threshold = mix(FX.bloom.threshold.day, FX.bloom.threshold.night, dark);
        bloom.intensity = mix(FX.bloom.intensity.day, FX.bloom.intensity.night, dark);
      }
      if (tilt) {
        // Eases off as you go into a building, and back as you come out.
        tiltK += ((inside ? 0 : 1) - tiltK) * Math.min(1, dt * 4);
        tilt.blendMode.opacity.value = FX.tilt.strength * tiltK;
        tilt.focusArea = portrait ? FX.tilt.focusPortrait : FX.tilt.focus;
      }
      if (grade) {
        const g = FX.grade;
        const u = grade.uniforms;
        u.get('uNight')!.value = dark;
        u.get('uSat')!.value = mix(g.saturation.day, g.saturation.night, dark);
        u.get('uContrast')!.value = mix(g.contrast.day, g.contrast.night, dark);
        (u.get('uTint')!.value as Vector3).set(mix(g.warm[0], g.cool[0], dark), mix(g.warm[1], g.cool[1], dark), mix(g.warm[2], g.cool[2], dark));
        u.get('uVignette')!.value = mix(g.vignette.day, g.vignette.night, dark);
      }
    },
    get level() {
      return level;
    },
    get effects() {
      return effects;
    },
    dispose: teardown,
  };
  post.set(start.level, start.effects);
  return post;
}
