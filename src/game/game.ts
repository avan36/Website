// The island game: scene, camera rig, input, the intro, entering a place and
// the return reveal. Loaded with a dynamic import() only when WebGL is
// available and the visitor is playing.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { Explorer } from './character';
import { Landmark } from './landmarks';
import { Labels } from './labels';
import type { Sound } from './audio';
import { buildAmbient } from './world/ambient';
import { resetSharedMaterials } from './world/kit';
import { buildNature, type Collider, type SharedUniforms } from './world/nature';
import { Puffs } from './world/particles';
import { groundAt, isWalkable, PLACES, SPAWN } from './world/shape';
import { buildHeightTexture, buildTerrain } from './world/terrain';
import { buildSky, HORIZON } from './world/sky';
import { buildWater } from './world/water';
import { clamp, damp, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from './util/math';

export interface GameOptions {
  stage: HTMLElement;
  labelsHost: HTMLElement;
  wipe: HTMLElement;
  cover: HTMLElement | null;
  returnTo: string | null;
  reducedMotion: boolean;
  touch: boolean;
  sound: Sound;
  onReady: () => void;
  onFirstMove: () => void;
  onIntroDone: () => void;
  onLost: () => void;
}

export interface GameHandle {
  pause(): void;
  resume(): void;
  destroy(): void;
  /** For tests and debugging. */
  debug: { state: () => string; player: () => { x: number; z: number }; near: () => string | null; frames: () => number; places: () => { id: string; x: number; z: number; stand: { x: number; z: number } }[]; teleport: (x: number, z: number) => void; screen: (id: string) => { x: number; y: number } | null };
}

type State = 'intro' | 'play' | 'entering';

const INTRO = 3.0;

export async function createGame(o: GameOptions): Promise<GameHandle> {
  const { stage, touch } = o;
  const mobile = touch || Math.min(window.innerWidth, window.innerHeight) < 600;

  // ---------- Renderer ----------
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'isl-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  // ---------- Scene ----------
  const scene = new Scene();
  scene.background = new Color(HORIZON);
  scene.fog = new Fog(HORIZON, 75, 230);
  const sunDir = new Vector3(0.55, 0.78, 0.42).normalize();

  const hemi = new HemisphereLight('#cfe8ff', '#e8c48e', 1.05);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff1dc', 3.1);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  const sm = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -36;
  sc.right = 36;
  sc.top = 36;
  sc.bottom = -36;
  sc.near = 10;
  sc.far = 130;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.85;
  scene.add(sun, sun.target);

  scene.add(buildSky(sunDir));

  const uniforms: SharedUniforms = { uTime: { value: 0 }, uGrow: { value: 1 } };
  const island = new Group();
  island.name = 'island';
  scene.add(island);
  island.add(buildTerrain());
  const nature = buildNature(uniforms, mobile);
  island.add(nature.group);
  const height = buildHeightTexture();
  const water = buildWater(height, sunDir);
  scene.add(water.mesh);
  const ambient = buildAmbient();
  scene.add(ambient.group);
  const puffs = new Puffs();
  scene.add(puffs.mesh);

  const landmarks = PLACES.map((p) => new Landmark(p));
  const byId = new Map(landmarks.map((l) => [l.place.id, l]));
  for (const l of landmarks) island.add(l.root);
  const hitMeshes = landmarks.map((l) => l.hit);
  const anchors = new Map(landmarks.map((l) => [l.place.id, l.anchor]));
  const colliders: Collider[] = [
    ...nature.colliders,
    ...landmarks.map((l) => ({ x: l.place.x, z: l.place.z, r: l.place.radius })),
  ];

  const player = new Explorer();
  scene.add(player.root, player.shadowMesh);
  player.onStep = () => o.sound.play('step');
  player.onLand = (impact) => impact > 0.5 && o.sound.play('land');

  // Click marker
  const marker = new Mesh(
    new RingGeometry(0.3, 0.42, 28),
    new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 2;
  scene.add(marker);
  let markerT = 1;

  // ---------- Camera ----------
  const camera = new PerspectiveCamera(36, 1, 0.5, 1500);
  const rig = {
    target: new Vector3(SPAWN.x, 1, SPAWN.z),
    dist: 24,
    pitch: 0.62,
    yaw: 0,
    parallax: new Vector2(),
    parallaxT: new Vector2(),
  };
  let viewW = 1;
  let viewH = 1;
  let baseDist = 24;
  let basePitch = 0.68;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    viewW = Math.max(1, Math.round(r.width));
    viewH = Math.max(1, Math.round(r.height));
    renderer.setSize(viewW, viewH, false);
    const aspect = viewW / viewH;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 50 : aspect < 1.2 ? 40 : 32;
    camera.updateProjectionMatrix();
    // Keep a similar amount of island in view whatever the shape of the screen.
    // Portrait looks down more steeply so the narrow view still spans the island.
    baseDist = aspect < 0.8 ? 47 : aspect < 1.2 ? 48 : 47;
    basePitch = aspect < 0.8 ? 0.86 : aspect < 1.2 ? 0.74 : 0.68;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const placeCamera = (target: Vector3, dist: number, pitch: number, yaw: number) => {
    const cp = Math.cos(pitch);
    camera.position.set(
      target.x + Math.sin(yaw) * cp * dist + rig.parallax.x * 1.1,
      target.y + Math.sin(pitch) * dist + rig.parallax.y * 0.7,
      target.z + Math.cos(yaw) * cp * dist,
    );
    camera.lookAt(target);
  };

  // ---------- Labels ----------
  let labelHover: string | null = null;
  let labelFocus: string | null = null;
  const labels = new Labels(
    o.labelsHost,
    PLACES,
    {
      activate: (id) => activate(id),
      enter: (id) => enter(id),
      hover: (id) => {
        labelHover = id;
      },
    },
    touch,
  );
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest?.('.isl-label') as HTMLElement | null;
    labelFocus = el?.dataset.id ?? null;
  };
  o.labelsHost.addEventListener('focusin', onFocusIn);
  o.labelsHost.addEventListener('focusout', () => (labelFocus = null));

  // ---------- State ----------
  let state: State = 'intro';
  let introT = 0;
  let introSpeed = 1;
  let nearId: string | null = null;
  let dismissedId: string | null = null;
  let pointerHover: string | null = null;
  let walkTarget: Vector2 | null = null;
  let pendingEnter: string | null = null;
  let blockedT = 0;
  let enteringId: string | null = null;
  let enterT = 0;
  let wipeStarted = false;
  let movedOnce = false;
  let time = 0;
  const keys = new Set<string>();

  const returning = o.returnTo ? byId.get(o.returnTo) ?? null : null;

  // ---------- Start pose ----------
  if (returning || o.reducedMotion) {
    state = 'play';
    const p = returning?.place;
    if (p) player.place(p.stand.x, p.stand.z, Math.atan2(p.x - p.stand.x, p.z - p.stand.z) + Math.PI);
    else player.place(SPAWN.x, SPAWN.z, 0);
    rig.target.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
    rig.dist = baseDist;
    rig.pitch = basePitch;
    if (p) {
      dismissedId = p.id; // don't pop the prompt the moment you come back out
    }
  } else {
    island.position.y = -7;
    uniforms.uGrow.value = 0;
    for (const l of landmarks) l.hideForIntro();
    player.place(SPAWN.x, SPAWN.z, 0, 40);
    player.root.visible = false;
    player.shadowMesh.visible = false;
  }
  placeCamera(rig.target, rig.dist, rig.pitch, rig.yaw);

  // ---------- Input ----------
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let pointerInside = false;
  let pointerMoved = false;
  let press: { id: string | null; x: number; y: number; ground: boolean; pointerId: number } | null = null;

  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const pickLandmark = (): string | null => {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits.length ? (hits[0].object.userData.place as string) : null;
  };
  const tmpV = new Vector3();
  const pickGround = (): Vector2 | null => {
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    let prev = 0;
    for (let t = 1; t < 260; t += 0.6) {
      tmpV.copy(direction).multiplyScalar(t).add(origin);
      const g = Math.max(groundAt(tmpV.x, tmpV.z), 0);
      if (tmpV.y <= g) {
        let a = prev;
        let b = t;
        for (let i = 0; i < 10; i++) {
          const m = (a + b) / 2;
          tmpV.copy(direction).multiplyScalar(m).add(origin);
          if (tmpV.y <= Math.max(groundAt(tmpV.x, tmpV.z), 0)) b = m;
          else a = m;
        }
        tmpV.copy(direction).multiplyScalar(b).add(origin);
        return new Vector2(tmpV.x, tmpV.z);
      }
      prev = t;
    }
    return null;
  };
  /** Clicked the sea? Walk to the nearest bit of shore along the way. */
  const toShore = (p: Vector2) => {
    if (isWalkable(p.x, p.y)) return p;
    const from = new Vector2(player.pos.x, player.pos.z);
    const d = p.distanceTo(from);
    for (let s = 0; s < d; s += 0.25) {
      const q = p.clone().lerp(from, s / d);
      if (isWalkable(q.x, q.y)) return q;
    }
    return null;
  };
  const showMarker = (p: Vector2) => {
    marker.position.set(p.x, groundAt(p.x, p.y) + 0.06, p.y);
    markerT = 0;
  };

  const skipIntro = () => {
    if (state === 'intro') introSpeed = 4.5;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0) return;
    o.sound.play('tap');
    if (state === 'intro') return skipIntro();
    if (state !== 'play') return;
    setNdc(e);
    const id = pickLandmark();
    press = { id, x: e.clientX, y: e.clientY, ground: !id, pointerId: e.pointerId };
    if (!id) {
      const g = pickGround();
      const p = g && toShore(g);
      if (p) {
        walkTarget = p;
        pendingEnter = null;
        showMarker(p);
        firstMove();
      }
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    setNdc(e);
    pointerInside = true;
    pointerMoved = true;
    if (e.pointerType === 'mouse') rig.parallaxT.set(ndc.x, ndc.y);
    // Hold and drag on the ground to steer.
    if (press && press.ground && state === 'play' && e.pointerId === press.pointerId) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) {
        const g = pickGround();
        const p = g && toShore(g);
        if (p) walkTarget = p;
      }
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.id && moved < 14) activate(press.id);
    press = null;
  };
  const onPointerLeave = () => {
    pointerInside = false;
    pointerHover = null;
    rig.parallaxT.set(0, 0);
  };

  const MOVE_KEYS: Record<string, [number, number]> = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };
  const isTyping = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
    if (state === 'intro') {
      if (e.code !== 'Tab') skipIntro();
      if (MOVE_KEYS[e.code]) e.preventDefault();
      return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      walkTarget = null;
      pendingEnter = null;
      firstMove();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const onControl = !!active && active !== document.body && active !== canvas && (active.tagName === 'A' || active.tagName === 'BUTTON');
    if ((e.key === 'Enter' || e.key === ' ') && !onControl && state === 'play') {
      const id = nearId && nearId !== dismissedId ? nearId : null;
      if (id) {
        e.preventDefault();
        enter(id);
      }
    }
    if (e.key === 'Escape') {
      if (nearId) dismissedId = nearId;
      pendingEnter = null;
      if (active && o.labelsHost.contains(active)) active.blur();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const onLost = (e: Event) => {
    e.preventDefault();
    o.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  function firstMove() {
    if (movedOnce) return;
    movedOnce = true;
    o.onFirstMove();
  }

  function activate(id: string) {
    if (state === 'intro') skipIntro();
    if (state !== 'play') return;
    const l = byId.get(id);
    if (!l) return;
    firstMove();
    const p = l.place;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < p.enterRange + 0.3) return enter(id);
    walkTarget = new Vector2(p.stand.x, p.stand.z);
    pendingEnter = id;
    blockedT = 0;
    showMarker(walkTarget);
    l.bounce(0.5);
    o.sound.play('pop');
  }

  function enter(id: string) {
    if (state !== 'play') return;
    const l = byId.get(id);
    if (!l) return;
    state = 'entering';
    enteringId = id;
    enterT = 0;
    wipeStarted = false;
    walkTarget = null;
    pendingEnter = null;
    keys.clear();
    player.faceToward(l.place.x, l.place.z);
    player.hop(7);
    l.bounce(1.4);
    o.sound.play('whoosh');
    try {
      sessionStorage.setItem('island:wipe', JSON.stringify({ slug: id, color: l.place.color }));
      sessionStorage.setItem('island:return', id);
    } catch {
      /* storage blocked: the destination just won't animate */
    }
  }

  const startWipe = (l: Landmark) => {
    const v = l.focus(new Vector3()).project(camera);
    const x = (v.x * 0.5 + 0.5) * viewW;
    const y = (-v.y * 0.5 + 0.5) * viewH;
    const R = Math.hypot(Math.max(x, viewW - x), Math.max(y, viewH - y)) + 20;
    const el = o.wipe;
    el.style.background = l.place.color;
    el.hidden = false;
    const anim = el.animate(
      [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }],
      { duration: o.reducedMotion ? 10 : 620, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      window.location.assign(l.place.href);
    };
  };

  // ---------- Return reveal ----------
  let revealT = returning ? 0 : -1;
  const startReveal = () => {
    const cover = o.cover;
    if (!returning || !cover) return;
    const v = returning.focus(new Vector3()).project(camera);
    const x = (v.x * 0.5 + 0.5) * viewW;
    const y = (-v.y * 0.5 + 0.5) * viewH;
    const R = Math.hypot(Math.max(x, viewW - x), Math.max(y, viewH - y)) + 20;
    const anim = cover.animate(
      [{ clipPath: `circle(${R}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }],
      { duration: o.reducedMotion ? 10 : 700, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      document.documentElement.classList.remove('isl-returning');
      anim.cancel();
    };
  };

  // ---------- Frame ----------
  const wish = new Vector2();
  const camGoal = new Vector3();
  let raf = 0;
  let last = performance.now();
  let running = false;
  let frames = 0;
  const avoid: { l: number; t: number; r: number; b: number }[] = [];

  const updateIntro = (dt: number) => {
    introT += dt * introSpeed;
    const t = introT;
    island.position.y = lerp(-7, 0, easeOutBack(clamp(t / 1.35), 1.2));
    water.material.uniforms.uRise.value = -island.position.y;
    uniforms.uGrow.value = clamp((t - 0.55) / 1.3);
    landmarks.forEach((l, i) => {
      const at = 0.85 + i * 0.14;
      if (t >= at && !l.userPopped) {
        l.userPopped = true;
        l.popIn();
        o.sound.play('pop');
        puffs.ring(l.place.x, l.baseY, l.place.z, 12, 4, '#fbf1dc', 0.3);
      }
    });
    if (t >= 2.0 && !player.root.visible) {
      player.root.visible = true;
      player.shadowMesh.visible = true;
      player.place(SPAWN.x, SPAWN.z, 0, 9);
    }
    // Camera: a wide, high orbit swooping down into the follow view.
    const k = easeInOutCubic(clamp(t / (INTRO - 0.1)));
    const tgt = camGoal.set(lerp(0, player.pos.x, k), lerp(0.5, player.pos.y + 0.8, k), lerp(-2, player.pos.z, k));
    rig.target.copy(tgt);
    rig.dist = lerp(110, baseDist, k);
    rig.pitch = lerp(1.0, basePitch, k);
    rig.yaw = lerp(-0.85, 0, k);
    if (t >= INTRO) {
      state = 'play';
      introSpeed = 1;
      landmarks.forEach((l) => (l.userPopped = true));
      o.onIntroDone();
    }
  };

  const updatePlay = (dt: number) => {
    // Desired movement
    wish.set(0, 0);
    for (const k of keys) {
      const m = MOVE_KEYS[k];
      if (m) wish.x += m[0], wish.y += m[1];
    }
    if (wish.lengthSq() > 0) {
      wish.normalize().rotateAround(new Vector2(), -rig.yaw);
    } else if (walkTarget) {
      const dx = walkTarget.x - player.pos.x;
      const dz = walkTarget.y - player.pos.z;
      const d = Math.hypot(dx, dz);
      const pend = pendingEnter ? byId.get(pendingEnter) : null;
      const arrived = d < 0.3 || (pend && Math.hypot(player.pos.x - pend.place.x, player.pos.z - pend.place.z) < pend.place.enterRange - 0.4);
      if (arrived) {
        walkTarget = null;
        if (pend) enter(pend.place.id);
      } else {
        wish.set(dx / d, dz / d).multiplyScalar(clamp(d / 1.4 + 0.3, 0, 1));
      }
    }
    const blocked = player.move(dt, wish, colliders);
    if (walkTarget && blocked) {
      blockedT += dt;
      if (blockedT > 0.45) {
        const pend = pendingEnter ? byId.get(pendingEnter) : null;
        walkTarget = null;
        if (pend && Math.hypot(player.pos.x - pend.place.x, player.pos.z - pend.place.z) < pend.place.enterRange + 1.5) enter(pend.place.id);
        pendingEnter = null;
      }
    } else blockedT = 0;

    // Who's near?
    let best: string | null = null;
    let bestD = Infinity;
    for (const l of landmarks) {
      const d = Math.hypot(player.pos.x - l.place.x, player.pos.z - l.place.z);
      if (d < l.place.enterRange && d < bestD) {
        best = l.place.id;
        bestD = d;
      }
    }
    if (best !== nearId) {
      if (nearId) byId.get(nearId)!.near = false;
      nearId = best;
      if (dismissedId && dismissedId !== nearId) dismissedId = null;
      if (nearId && nearId !== dismissedId) {
        const l = byId.get(nearId)!;
        l.near = true;
        const sfx = l.arrive();
        o.sound.play(sfx === 'bell' ? 'bell' : 'chime');
        player.hop(4.2);
      }
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const raw = Math.min((now - last) / 1000, 0.1);
    const dt = Math.min(raw, 1 / 20);
    last = now;
    frames++;
    time += dt;
    uniforms.uTime.value = time;
    water.material.uniforms.uTime.value = time;

    if (state === 'intro') updateIntro(raw);
    else if (state === 'play') updatePlay(dt);
    else if (state === 'entering') player.move(dt, wish.set(0, 0), colliders);

    // Hover (mouse) via the hit volumes
    if (pointerMoved && pointerInside && state === 'play' && !touch) {
      pointerHover = pickLandmark();
      canvas.style.cursor = pointerHover ? 'pointer' : '';
      pointerMoved = false;
    }
    const hoverId = state === 'play' ? labelHover ?? labelFocus ?? pointerHover : null;
    for (const l of landmarks) {
      l.hover = l.place.id === hoverId || l.place.id === enteringId;
      l.update(time, dt, puffs, state !== 'intro');
    }

    player.update(time, dt, puffs);
    puffs.update(dt);
    ambient.update(time);

    // Click marker
    if (markerT < 1) {
      markerT = Math.min(1, markerT + dt * 1.8);
      const m = marker.material as MeshBasicMaterial;
      m.opacity = (1 - markerT) * 0.9;
      marker.scale.setScalar(0.6 + easeOutCubic(markerT) * 0.9);
    }

    // Camera
    if (state === 'play') {
      const near = nearId && nearId !== dismissedId ? byId.get(nearId)! : null;
      camGoal.set(player.pos.x + player.vel.x * 0.18, player.pos.y + 0.8, player.pos.z + player.vel.y * 0.18);
      if (near) camGoal.lerp(near.focus(new Vector3()), 0.25);
      rig.target.x = damp(rig.target.x, camGoal.x, 3.2, dt);
      rig.target.y = damp(rig.target.y, camGoal.y, 3.2, dt);
      rig.target.z = damp(rig.target.z, camGoal.z, 3.2, dt);
      rig.dist = damp(rig.dist, baseDist * (near ? 0.74 : 1), 2.2, dt);
      rig.pitch = damp(rig.pitch, basePitch - (near ? 0.08 : 0), 2.2, dt);
      rig.yaw = damp(rig.yaw, rig.parallax.x * 0.035, 3, dt);
    } else if (state === 'entering' && enteringId) {
      const l = byId.get(enteringId)!;
      enterT += dt;
      const k = easeInOutCubic(clamp(enterT / 1.0));
      l.focus(camGoal);
      rig.target.lerp(camGoal, 1 - Math.exp(-dt * 5));
      rig.dist = damp(rig.dist, baseDist * 0.42, 3.2 * (0.3 + k), dt);
      rig.pitch = damp(rig.pitch, 0.42, 3, dt);
      if (!wipeStarted && enterT > (o.reducedMotion ? 0.05 : 0.5)) {
        wipeStarted = true;
        startWipe(l);
      }
    }
    if (!o.reducedMotion) {
      rig.parallax.x = damp(rig.parallax.x, rig.parallaxT.x, 2, dt);
      rig.parallax.y = damp(rig.parallax.y, rig.parallaxT.y, 2, dt);
    }
    placeCamera(rig.target, rig.dist, rig.pitch, rig.yaw);

    // Labels (kept out of the HUD's way)
    if (frames % 15 === 1) {
      avoid.length = 0;
      o.stage.querySelectorAll<HTMLElement>('.isl-top > *, .isl-card, .isl-sound-fab, .isl-hint').forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width > 0 && cs.display !== 'none' && +cs.opacity > 0.05) avoid.push({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
      });
    }
    labels.update(camera, anchors, viewW, viewH, {
      avoid,
      visible: state === 'play',
      nearId: nearId && nearId !== dismissedId ? nearId : null,
      hoverId,
      focusId: labelFocus,
      enteringId,
      dist: (id) => {
        const l = byId.get(id)!;
        return Math.hypot(rig.target.x - l.place.x, rig.target.z - l.place.z);
      },
    });

    renderer.render(scene, camera);

    if (revealT >= 0) {
      if (revealT === 0) startReveal();
      revealT += dt;
      if (revealT > 0.3 && revealT - dt <= 0.3) {
        player.hop(6);
        returning?.bounce(1);
        o.sound.play('pop');
      }
      if (revealT > 1) revealT = -1;
    }
  };

  // Compile shaders before the first visible frame to avoid a hitch.
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* fall back to compiling on first render */
  }
  renderer.render(scene, camera);
  o.onReady();

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  start();
  if (state === 'play' && !returning) o.onIntroDone();
  if (returning) o.onIntroDone();

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('webglcontextlost', onLost);
    o.labelsHost.removeEventListener('focusin', onFocusIn);
    labels.dispose();
    const mats = new Set<Material>();
    scene.traverse((obj) => {
      const m = obj as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mm = m.material as Material | Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
      else if (mm) mats.add(mm);
    });
    mats.forEach((m) => m.dispose());
    landmarks.forEach((l) => l.dispose());
    player.dispose();
    height.tex.dispose();
    resetSharedMaterials();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };

  return {
    pause: stop,
    resume: () => {
      if (!document.hidden) start();
    },
    destroy,
    debug: {
      state: () => state,
      player: () => ({ x: player.pos.x, z: player.pos.z }),
      near: () => nearId,
      frames: () => frames,
      places: () => PLACES.map((p) => ({ id: p.id, x: p.x, z: p.z, stand: p.stand })),
      teleport: (x: number, z: number) => {
        player.place(x, z, 0);
        walkTarget = null;
      },
      screen: (id: string) => {
        const l = byId.get(id);
        if (!l) return null;
        const v = l.focus(new Vector3()).project(camera);
        return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
      },
    },
  };
}
