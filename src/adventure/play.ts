// Playing a chapter: the loop that drives the car, runs the race, follows
// with the camera and keeps the page's HUD up to date. The page (adventure.astro)
// owns the markup; this finds its parts by data attributes and fills them in.

import { PCFShadowMap, PerspectiveCamera, SRGBColorSpace, Vector3, WebGLRenderer, ACESFilmicToneMapping } from 'three';
import { createPost } from '../renderers/island/fx/post';
import { FrameWatch, pickQuality, stepDown } from '../renderers/island/fx/quality';
import { boxes, bounds, course, gates, onRoad } from './campus';
import { bump, newCar, stepCar, type Car } from './car';
import { buildScene } from './scene';
import { Leaves, pointer } from './effects';
import { Puffs } from '../renderers/island/world/particles';
import { clock, distanceToBox, newRace, pushOut, startPose, stepRace, type Race } from './track';
import { andrusField, buildings, fossHill, groundHeight, landmarks, toMap, toWorld } from './wesleyan';
import type { Chapter } from './levels';

const CAR_R = 1.3;
// The stage: a held finger on a pad must never start a text selection or the long-press menu.
const noSelect = (e: Event) => e.preventDefault();
const LAPS = 2;

export type Session = { destroy(): void };

const $ = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T | null;

export function play(stage: HTMLElement, chapter: Chapter, onExit: () => void): Session {
  const host = $<HTMLElement>(stage, '[data-adv-canvas]')!;
  const ui = {
    lap: $<HTMLElement>(stage, '[data-adv-lap]'),
    time: $<HTMLElement>(stage, '[data-adv-time]'),
    next: $<HTMLElement>(stage, '[data-adv-next]'),
    count: $<HTMLElement>(stage, '[data-adv-count]'),
    toast: $<HTMLElement>(stage, '[data-adv-toast]'),
    finish: $<HTMLDialogElement>(stage, '[data-adv-finish]'),
    result: $<HTMLElement>(stage, '[data-adv-result]'),
    car: $<SVGCircleElement>(stage, '[data-adv-car]'),
    nextDot: $<SVGCircleElement>(stage, '[data-adv-gate]'),
    raceBits: stage.querySelectorAll<HTMLElement>('[data-adv-race]'),
  };

  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const world = buildScene(chapter.color, renderer, mobile ? 2048 : 4096);
  const leaves = new Leaves(mobile ? 140 : 280);
  const dust = new Puffs(160);
  const arrow = pointer(chapter.color);
  world.scene.add(leaves.mesh, dust.mesh, arrow);
  let shake = 0;
  let puffT = 0;
  let clockT = 0;
  const camera = new PerspectiveCamera(55, 1, 0.5, 900);
  // The island's polish: bloom and a warm grade (no tilt-shift: this is a chase camera, not a model on a table).
  // Phones start lighter, and anything that can't keep up steps itself down. ?fx= overrides, as on the island.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let quality = pickQuality({ search: location.search, mobile, reducedMotion: reduced });
  if (!quality.forced) quality = { ...quality, effects: quality.effects.filter((e) => e !== 'tilt') };
  const post = createPost(renderer, world.scene, camera, quality);
  const frameWatch = new FrameWatch();

  // Landmarks you pass get a card, once each drive.
  const spots = landmarks.map((l) => {
    const b = buildings.find((x) => x.landmark === l.id);
    const at = l.id === 'foss-hill' ? fossHill.at : l.id === 'andrus' ? andrusField.at : b!.at;
    return { ...l, p: toWorld(at), r: l.id === 'foss-hill' ? 26 : l.id === 'andrus' ? 24 : 22 };
  });
  let seen = new Set<string>();

  let car: Car;
  let race: Race | null;
  let free = false;
  const reset = (asRace: boolean) => {
    const s = startPose(course, gates);
    car = newCar(s.x, s.z, s.heading);
    race = asRace ? newRace(LAPS) : null;
    free = !asRace;
    seen = new Set();
    for (const el of ui.raceBits) el.hidden = !asRace;
    for (const g of world.gates) g.group.visible = asRace;
    snapCamera();
  };

  // Controls: arrows or WASD, and the on-screen pads for a finger.
  const keys = new Set<string>();
  const pads = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k)) {
      if (e.type === 'keydown') keys.add(k);
      else keys.delete(k);
      if (!ui.finish?.open) e.preventDefault();
    }
    if (k === 'escape' && e.type === 'keydown' && !ui.finish?.open) onExit();
  };
  stage.addEventListener('selectstart', noSelect);
  stage.addEventListener('contextmenu', noSelect);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const padEls = stage.querySelectorAll<HTMLElement>('[data-pad]');
  const padOff: (() => void)[] = [];
  for (const el of padEls) {
    const id = el.dataset.pad!;
    const down = (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); pads.add(id); el.classList.add('is-down'); };
    const up = () => { pads.delete(id); el.classList.remove('is-down'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    padOff.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); });
  }
  const input = () => {
    const on = (...k: string[]) => k.some((x) => keys.has(x) || pads.has(x));
    return {
      throttle: (on('arrowup', 'w', 'gas') ? 1 : 0) - (on('arrowdown', 's', ' ', 'brake') ? 1 : 0),
      steer: (on('arrowright', 'd', 'right') ? 1 : 0) - (on('arrowleft', 'a', 'left') ? 1 : 0),
    };
  };

  // The camera rides behind and above the car, a little lazily.
  const camPos = new Vector3();
  const look = new Vector3();
  const portrait = () => host.clientHeight > host.clientWidth;
  const camWant = () => {
    const back = portrait() ? 16 : 12.5;
    const up = portrait() ? 9.5 : 7;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const y = groundHeight(car.x, car.z);
    // Don't let a wall come between the camera and the car: move in in front of it.
    let t = 1;
    for (let i = 1; i <= 16; i++) {
      const f = i / 16;
      const p = { x: car.x - fx * back * f, z: car.z - fz * back * f };
      if (blocked(p, y + up * f)) {
        t = Math.max(0.25, (i - 1.5) / 16);
        break;
      }
    }
    return {
      pos: new Vector3(car.x - fx * back * t, y + up * Math.max(t, 0.6), car.z - fz * back * t),
      look: new Vector3(car.x + fx * 6, y + 1.2, car.z + fz * 6),
    };
  };
  const heights = buildings.map((b) => (b.landmark === 'exley' ? 40 : b.h + 5));
  const blocked = (p: { x: number; z: number }, y: number) =>
    boxes.some((b, i) => y < heights[i] && distanceToBox(p, b) < 1);
  function snapCamera() {
    const w = camWant();
    camPos.copy(w.pos);
    look.copy(w.look);
  }

  let toastTimer = 0;
  const toast = (title: string, body: string) => {
    if (!ui.toast) return;
    ui.toast.innerHTML = '';
    const t = document.createElement('strong');
    t.textContent = title;
    const b = document.createElement('span');
    b.textContent = body;
    ui.toast.append(t, b);
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { if (ui.toast) ui.toast.hidden = true; }, 3800);
  };

  const bestKey = `adventure:${chapter.id}:best`;
  const best = (): number | null => {
    try { const v = Number(localStorage.getItem(bestKey)); return v > 0 ? v : null; } catch { return null; }
  };

  const finish = (time: number, splits: number[]) => {
    const prev = best();
    const record = prev === null || time < prev;
    if (record) { try { localStorage.setItem(bestKey, String(time)); } catch { /* private window */ } }
    if (ui.result) {
      ui.result.innerHTML = '';
      const big = document.createElement('p');
      big.className = 'adv-finish__time';
      big.textContent = clock(time);
      const laps = document.createElement('p');
      laps.textContent = splits.map((s, i) => `Lap ${i + 1}: ${clock(s)}`).join(' · ');
      const note = document.createElement('p');
      note.textContent = record ? (prev === null ? 'Your first time round. That is the one to beat.' : 'A new best. Nicely driven.') : `Your best is ${clock(prev!)}.`;
      ui.result.append(big, laps, note);
    }
    keys.clear();
    ui.finish?.showModal();
  };

  const onFinishClick = (e: Event) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-adv-act]')?.dataset.advAct;
    if (!act) return;
    ui.finish?.close();
    if (act === 'again') reset(true);
    else if (act === 'drive') reset(false);
    else if (act === 'exit') onExit();
  };
  ui.finish?.addEventListener('click', onFinishClick);
  const raceAgain = stage.querySelector<HTMLElement>('[data-adv-restart]');
  const onRestart = () => reset(true);
  raceAgain?.addEventListener('click', onRestart);

  let baseFov = 55;
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    camera.aspect = w / h;
    baseFov = w < h ? 68 : 55;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  reset(true);
  // In development only: put the car anywhere, to look at a place (the screenshots use it).
  if (import.meta.env.DEV) {
    (window as unknown as { __adv: unknown }).__adv = {
      teleport(x: number, z: number, heading: number) { car = newCar(x, z, heading); race = null; free = true; snapCamera(); },
    };
  }

  let last = performance.now();
  let raf = 0;
  let running = true;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // rAF times can sit a little before the last reset (the scene builds in between): never run time backwards.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!running) return;
    update(dt);
    post.update({ dark: 0, inside: false, portrait: host.clientHeight > host.clientWidth }, dt);
    if (!quality.forced && post.level !== 'off' && frameWatch.add(dt)) {
      quality = stepDown(quality);
      post.set(quality.level, quality.effects);
      frameWatch.reset();
    }
    post.render(dt);
  };

  function update(dt: number) {
    const racing = race?.phase === 'racing' || free;
    const drive = racing && !ui.finish?.open ? input() : { throttle: 0, steer: 0 };
    car = stepCar(car, drive, dt, onRoad(car));
    for (const b of boxes) {
      const hit = pushOut(car, CAR_R, b);
      if (hit) {
        if (Math.abs(car.speed) > 6) {
          shake = Math.min(1, Math.abs(car.speed) / 20);
          dust.ring(hit.x - hit.nx * CAR_R, 0.6, hit.z - hit.nz * CAR_R, 8, 3, '#e8dcc4', 0.35);
        }
        car = bump(car, hit.x, hit.z, hit.nx, hit.nz);
      }
    }
    const cx = Math.max(bounds.x0, Math.min(bounds.x1, car.x));
    const cz = Math.max(bounds.z0, Math.min(bounds.z1, car.z));
    if (cx !== car.x || cz !== car.z) car = { ...car, x: cx, z: cz, speed: car.speed * 0.5 };

    if (race) {
      const out = stepRace(race, car, dt, gates);
      race = out.race;
      for (const e of out.events) {
        if (e.type === 'go') toast('Go!', `${LAPS} laps. Through every gate, in order.`);
        if (e.type === 'lap' && race.phase !== 'done') toast(`Lap ${e.lap}: ${clock(e.time)}`, 'One more to go.');
        if (e.type === 'finish') finish(e.time, race.splits);
      }
    }
    for (const s of spots) {
      if (seen.has(s.id)) continue;
      if (Math.hypot(car.x - s.p.x, car.z - s.p.z) < s.r) {
        seen.add(s.id);
        toast(s.name, s.note);
      }
    }

    // The car sits on the ground and leans into the hill.
    const y = groundHeight(car.x, car.z);
    const ahead = groundHeight(car.x + Math.sin(car.heading) * 1.8, car.z + Math.cos(car.heading) * 1.8);
    world.car.position.set(car.x, y, car.z);
    world.car.rotation.set(0, car.heading, 0);
    world.car.rotateX(-Math.atan2(ahead - y, 1.8));
    world.car.rotateZ(-car.slip * 0.03);
    for (const w of world.wheels) w.rotation.x += (car.speed * dt) / 0.42;
    for (const f of world.front) f.rotation.y = drive.steer * 0.45;
    const braking = drive.throttle < 0 && car.speed > 1;
    world.tail.color.set(braking ? '#ff5a52' : '#a3282c').multiplyScalar(braking ? 3 : 1);

    // Dust off the back wheels on the grass, and tyre smoke when the car slides.
    clockT += dt;
    puffT -= dt;
    const grass = !onRoad(car);
    const sliding = Math.abs(car.slip) > 2.2 || (braking && car.speed > 12);
    if (puffT <= 0 && Math.abs(car.speed) > 5 && (grass || sliding)) {
      puffT = 0.045;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      for (const side of [-1, 1]) {
        const px = car.x - fx * 1.6 + fz * 0.9 * side;
        const pz = car.z - fz * 1.6 - fx * 0.9 * side;
        dust.spawn(px, y + 0.3, pz, {
          vx: -fx * 1.5 + (Math.random() - 0.5), vy: 0.8 + Math.random(), vz: -fz * 1.5 + (Math.random() - 0.5),
          size: grass ? 0.45 : 0.55, life: grass ? 0.8 : 1.1, grow: 2.2, drag: 2, gravity: -0.3,
          color: grass ? '#c8b48a' : '#e9e4dc',
        });
      }
    }
    dust.update(dt);
    leaves.update(dt, clockT, car.x, car.z, groundHeight);

    const w = camWant();
    const k = 1 - Math.exp(-dt * 4);
    camPos.lerp(w.pos, k);
    look.lerp(w.look, 1 - Math.exp(-dt * 8));
    camera.position.copy(camPos);
    // A little shake when you hit something, dying away quickly.
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      shake *= Math.exp(-dt * 7);
    }
    camera.lookAt(look);
    // The view widens a touch with speed.
    const fov = baseFov + Math.max(0, car.speed) * 0.35;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    world.sun.position.set(car.x + 70, 55, car.z + 45);
    world.sun.target.position.set(car.x, 0, car.z);

    // The HUD.
    const m = toMap(car);
    ui.car?.setAttribute('cx', m[0].toFixed(0));
    ui.car?.setAttribute('cy', m[1].toFixed(0));
    if (race) {
      const g = gates[race.next];
      const gm = toMap(g);
      ui.nextDot?.setAttribute('cx', gm[0].toFixed(0));
      ui.nextDot?.setAttribute('cy', gm[1].toFixed(0));
      arrow.visible = race.phase !== 'done';
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      arrow.position.set(car.x + fx * 4.5, y + 3.2 + Math.sin(clockT * 3) * 0.15, car.z + fz * 4.5);
      arrow.rotation.set(0, Math.atan2(g.x - arrow.position.x, g.z - arrow.position.z), 0);
      for (const gm of world.gates) {
        const isNext = gm.gate.i === race.next && race.phase !== 'done';
        gm.banner.opacity = isNext ? 1 : 0.25;
        gm.banner.emissive.set(isNext ? chapter.color : '#000000');
        gm.banner.emissiveIntensity = isNext ? 1.6 + 0.8 * Math.sin(performance.now() / 180) : 0;
      }
      if (ui.lap) ui.lap.textContent = `Lap ${Math.min(race.lap, race.laps)}/${race.laps}`;
      if (ui.time) ui.time.textContent = race.phase === 'countdown' ? '0:00.00' : clock(race.t);
      if (ui.next) ui.next.textContent = race.phase === 'done' ? 'Finished' : race.next === 0 ? 'Next: the finish line' : `Next: ${g.name}`;
      if (ui.count) {
        const show = race.phase === 'countdown' || (race.phase === 'racing' && race.t < 0.8);
        ui.count.hidden = !show;
        if (show) ui.count.textContent = race.phase === 'countdown' ? String(Math.ceil(race.t)) : 'Go!';
      }
    } else {
      arrow.visible = false;
      if (ui.count) ui.count.hidden = true;
    }
  }

  const onVis = () => {
    running = !document.hidden;
    last = performance.now();
    frameWatch.reset();
  };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      ro.disconnect();
      stage.removeEventListener('selectstart', noSelect);
      stage.removeEventListener('contextmenu', noSelect);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onVis);
      ui.finish?.removeEventListener('click', onFinishClick);
      raceAgain?.removeEventListener('click', onRestart);
      padOff.forEach((f) => f());
      if (ui.finish?.open) ui.finish.close();
      if (ui.toast) ui.toast.hidden = true;
      world.scene.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
      });
      post.dispose();
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
