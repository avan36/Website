// Playing a chapter: the loop that drives the car, runs the race, follows
// with the camera and keeps the page's HUD up to date. The page (adventure.astro)
// owns the markup; this finds its parts by data attributes and fills them in.

import { PCFShadowMap, PerspectiveCamera, Vector3, WebGLRenderer, ACESFilmicToneMapping } from 'three';
import { boxes, bounds, course, gates, onRoad } from './campus';
import { bump, newCar, stepCar, type Car } from './car';
import { buildScene } from './scene';
import { clock, distanceToBox, newRace, pushOut, startPose, stepRace, type Race } from './track';
import { andrusField, buildings, fossHill, groundHeight, landmarks, toMap, toWorld } from './wesleyan';
import type { Chapter } from './levels';

const CAR_R = 1.3;
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

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const world = buildScene(chapter.color);
  const camera = new PerspectiveCamera(55, 1, 0.5, 600);

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
    const back = portrait() ? 17 : 13;
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
  const heights = buildings.map((b) => (b.landmark === 'exley' ? 32 : b.h + 4));
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

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 68 : 55;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  reset(true);
  // In development only: put the car anywhere, to look at a place (the screenshots use it).
  if (import.meta.env.DEV) {
    (window as unknown as { __adv: unknown }).__adv = {
      teleport(x: number, z: number, heading: number) { car = newCar(x, z, heading); race = null; snapCamera(); },
    };
  }

  let last = performance.now();
  let raf = 0;
  let running = true;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;
    update(dt);
    renderer.render(world.scene, camera);
  };

  function update(dt: number) {
    const racing = race?.phase === 'racing' || free;
    const drive = racing && !ui.finish?.open ? input() : { throttle: 0, steer: 0 };
    car = stepCar(car, drive, dt, onRoad(car));
    for (const b of boxes) {
      const hit = pushOut(car, CAR_R, b);
      if (hit) car = bump(car, hit.x, hit.z, hit.nx, hit.nz);
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

    const w = camWant();
    const k = 1 - Math.exp(-dt * 4);
    camPos.lerp(w.pos, k);
    look.lerp(w.look, 1 - Math.exp(-dt * 8));
    camera.position.copy(camPos);
    camera.lookAt(look);
    world.sun.position.set(car.x + 40, 80, car.z + 30);
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
      for (const gm of world.gates) {
        const isNext = gm.gate.i === race.next && race.phase !== 'done';
        gm.banner.opacity = isNext ? 1 : 0.25;
        gm.banner.emissive.set(isNext ? chapter.color : '#000000');
        gm.banner.emissiveIntensity = isNext ? 0.5 + 0.3 * Math.sin(performance.now() / 180) : 0;
      }
      if (ui.lap) ui.lap.textContent = `Lap ${Math.min(race.lap, race.laps)}/${race.laps}`;
      if (ui.time) ui.time.textContent = race.phase === 'countdown' ? '0:00.00' : clock(race.t);
      if (ui.next) ui.next.textContent = race.phase === 'done' ? 'Finished' : race.next === 0 ? 'Next: the finish line' : `Next: ${g.name}`;
      if (ui.count) {
        const show = race.phase === 'countdown' || (race.phase === 'racing' && race.t < 0.8);
        ui.count.hidden = !show;
        if (show) ui.count.textContent = race.phase === 'countdown' ? String(Math.ceil(race.t)) : 'Go!';
      }
    } else if (ui.count) ui.count.hidden = true;
  }

  const onVis = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      ro.disconnect();
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
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
