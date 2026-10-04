// Taking the speedboat out, and racing it round the island. Walk up beside it
// at the end of the pier (or swim up to it) and press E, tap it or click it to
// get in. Then it's yours: W/S or the arrows to go and slow, A/D to steer, a
// pad and a thumbstick on touch screens. R races a lap: the boat lines up
// behind the start line, 3, 2, 1, go, through every gate in order and back
// over the line. Your best lap is kept in the store (so every view knows it),
// and the lap itself is kept as a ghost boat to race against next time. E gets
// you out, back on the pier, whenever you like.
//
// game.ts hands over to this while you're in the boat (its state is 'boat'):
// the keys, the pointer and the camera. Everything else here is self-contained.

import { ConeGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Material, type PerspectiveCamera, type Raycaster, type Scene } from 'three';
import type { Explorer } from '../character';
import type { Rect } from '../labels';
import type { Puffs } from '../world/particles';
import type { Ripples } from '../world/ripples';
import { PIER, type ActivitySpot } from '../world/shape';
import { ROWBOAT } from '../landmarks/builders';
import { Boat, buildGhost, HALF_LENGTH, HALF_WIDTH, TOP_SPEED, type Bumper } from './boat';
import { BoatHud, type HudMode } from './boat-hud';
import { CourseView } from './course';
import { Prompt } from './prompt';
import { readGeo } from '../../../world/client';
import { formatGap, formatLap, ghostAt, GHOST_DT, Lap, OPEN_SEA, raceCourse, readGhost, type Ghost } from '../../../world/race';
import type { WorldStore } from '../../../world/store';
import type { SoundName } from '../../types';
import { takeBoatWish } from '../../boat';
import { clamp, damp, dampAngle, wrapAngle } from '../util/math';

/** What the camera rig in game.ts looks like, as far as the boat is concerned. */
export interface Rig {
  target: Vector3;
  dist: number;
  pitch: number;
  yaw: number;
  zoom: number;
}

export interface BoatingOptions {
  scene: Scene;
  /** The camera (made after this is), for fading things out of its way. */
  camera: () => PerspectiveCamera;
  /** Where the HUD goes (the renderer's own element, over the canvas). */
  stage: HTMLElement;
  labelsHost: HTMLElement;
  spot: ActivitySpot;
  player: Explorer;
  puffs: Puffs;
  ripples: Ripples;
  /** The buoys round the swimming water, to steer round. */
  buoys: { x: number; z: number }[];
  store: WorldStore;
  sound: { play(name: SoundName): void };
  announce(text: string): void;
  reducedMotion: boolean;
  touch: boolean;
  /** game.ts: you're in the boat now (stop walking, hand over the keys and the camera), and out again. */
  onBoard(): void;
  onLeave(): void;
  /** game.ts: walk the explorer somewhere, as a click on the ground would, and where it's walking to. */
  walkTo(x: number, z: number): void;
  walking(): { x: number; z: number } | null;
  firstMove(): void;
}

type Phase = 'moored' | 'free' | 'countdown' | 'racing' | 'finished';

const GHOST_KEY = 'world:boat-ghost:v1';
/** Stand this close to the boat (on the pier beside it, or in the water) to get in. */
const BOARD_RANGE = 1.6;
/** How far along the pier from the stand the prompt stays up (it mustn't reach the fishing spot). */
const STAND_REACH = 0.6;
const COUNTDOWN = 3;
const THROTTLE_KEYS: Record<string, number> = { KeyW: 1, ArrowUp: 1, KeyS: -1, ArrowDown: -1 };
const STEER_KEYS: Record<string, number> = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
/** How far the thumbstick reaches, in CSS pixels. */
const STICK = 52;

const loadGhost = (sig: string): Ghost | null => {
  try {
    return readGhost(JSON.parse(localStorage.getItem(GHOST_KEY) ?? 'null'), sig);
  } catch {
    return null;
  }
};
const saveGhost = (g: Ghost) => {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(g));
  } catch {
    /* full or blocked: the record is still in the store, just without its ghost */
  }
};

export function createBoating(o: BoatingOptions) {
  const geo = readGeo();
  const { player, store } = o;
  const course = raceCourse(geo, { at: { x: o.spot.x, z: o.spot.z } });
  const moor = { x: o.spot.x, z: o.spot.z, yaw: 0 };
  /** Where you stand on the pier to get in, and step back out: beside the boat's stern, short of the post box. */
  const side = Math.sign(o.spot.x - PIER.x) || -1;
  const stand = { x: PIER.x + side * (PIER.width / 2 - 0.5), z: Math.min(o.spot.z - 1.8, PIER.end - 2.5) };
  const faceBoat = Math.atan2(o.spot.x - stand.x, 0);
  const promptAnchor = new Vector3(o.spot.x, 1.7, o.spot.z);

  const boat = new Boat(o.puffs, o.ripples);
  boat.calm = o.reducedMotion;
  boat.place(moor.x, moor.z, moor.yaw);
  boat.limit = (th) => course.radius(th) + OPEN_SEA;
  const rowX = PIER.x + ROWBOAT.x;
  const rowZ = PIER.end - ROWBOAT.fromEnd;
  const gatePosts: Bumper[] = course.gates.flatMap((g) => [-1, 1].map((s) => ({ x: g.x - g.tz * g.half * s, z: g.z + g.tx * g.half * s, r: 0.42 })));
  boat.bumpers = [
    { ax: PIER.x, az: PIER.start, bx: PIER.x, bz: PIER.end, r: PIER.width / 2 },
    { ax: rowX, az: rowZ - ROWBOAT.halfLength + ROWBOAT.halfWidth, bx: rowX, bz: rowZ + ROWBOAT.halfLength - ROWBOAT.halfWidth, r: ROWBOAT.halfWidth },
    ...o.buoys.map((b) => ({ x: b.x, z: b.z, r: 0.32 })),
    ...gatePosts,
  ];
  // Swimmers go round it while it's tied up, as they do the rowboat.
  const moored = { ax: moor.x, az: moor.z - HALF_LENGTH + HALF_WIDTH, bx: moor.x, bz: moor.z + HALF_LENGTH - HALF_WIDTH, r: HALF_WIDTH, top: 0.35 };
  const tieUp = (on: boolean) => {
    player.obstacles = player.obstacles.filter((x) => x !== moored);
    if (on) player.obstacles.push(moored);
  };
  tieUp(true);
  boat.onSound = (name) => o.sound.play(name);
  let shake = 0;
  boat.onBump = (p) => {
    if (!o.reducedMotion) shake = Math.max(shake, p * 0.35);
  };
  o.scene.add(boat.root, boat.wake.mesh);

  const view = new CourseView(course, { reducedMotion: o.reducedMotion });
  view.glow(false);
  o.scene.add(view.group);

  const ghostMesh = buildGhost();
  o.scene.add(ghostMesh);

  // The arrow over the boat that points to the next gate.
  const arrow = new Group();
  const arrowMat = new MeshStandardMaterial({ color: '#ffd84a', emissive: '#7a5a00', flatShading: true, roughness: 0.6 });
  // A flat arrowhead, pointing along +z, tipped toward the camera a little so it reads from behind.
  const head = new Mesh(new ConeGeometry(0.55, 0.9, 3), arrowMat);
  head.rotation.set(Math.PI / 2, 0, 0);
  head.scale.set(1, 1, 0.3);
  head.position.z = 0.25;
  arrow.add(head);
  arrow.visible = false;
  o.scene.add(arrow);

  const prompt = new Prompt(o.labelsHost, { name: 'Speedboat', color: '#e5484d', key: 'E', onPress: () => board() });
  const promptText = { kicker: o.spot.name, blurb: o.spot.description, action: 'Take the boat out' };
  prompt.set(promptText);
  let promptState: 'off' | 'idle' | 'near' = 'off';
  const setPrompt = (s: 'off' | 'idle' | 'near') => {
    if (s === promptState) return;
    promptState = s;
    prompt.show(s !== 'off');
    if (s !== 'off') prompt.root.className = `isl-label is-${s}`;
  };

  const hud = new BoatHud(o.stage, {
    reducedMotion: o.reducedMotion,
    onRace: () => startRace(),
    onExit: () => leave(),
    onCruise: () => cruise(),
  });

  // ---------- State ----------
  let phase: Phase = 'moored';
  let lap: Lap | null = null;
  let countT = 0;
  let raceT = 0;
  let lastCount = -1;
  let ghost: Ghost | null = null;
  let rec: { x: number[]; z: number[]; yaw: number[] } | null = null;
  let recNext = 0;
  let snapCam = false;
  let pendingBoard = false;
  let missedWarned = -1;
  const keys = new Set<string>();
  let stick: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  /** Debug steering: a fixed input, or the autopilot round the course. */
  let forced: { throttle: number; steer: number } | null = null;
  let autopilot = false;
  const prev = new Vector3();
  const tmp = new Vector3();
  let wish = takeBoatWish();

  const active = () => phase !== 'moored';
  const best = () => store.state.progress.bestLap;

  /** Standing by the boat (on the pier beside it, or in the water next to it). */
  function byBoat() {
    const p = player.pos;
    if (player.inWater) return Math.hypot(p.x - boat.pos.x, p.z - boat.pos.z) < BOARD_RANGE + HALF_LENGTH * 0.6;
    return Math.abs(p.x - stand.x) < 0.7 && Math.abs(p.z - stand.z) < STAND_REACH;
  }

  // ---------- Getting in and out ----------

  /** Take the boat out: get in if you're by it, or walk over first. */
  function board(force = false) {
    if (active()) return;
    if (!force && !byBoat()) {
      o.walkTo(stand.x, stand.z);
      pendingBoard = true;
      o.firstMove();
      o.sound.play('pop');
      return;
    }
    pendingBoard = false;
    phase = 'free';
    o.onBoard();
    o.firstMove();
    keys.clear();
    boat.locked = false;
    tieUp(false);
    player.root.rotation.order = 'YXZ';
    player.shadowMesh.visible = false;
    hud.show(true);
    view.set(null, []);
    snapCam = o.reducedMotion;
    setPrompt('off');
    paintHud();
    o.sound.play('splash');
    o.puffs.ring(boat.pos.x, boat.pos.y + 0.2, boat.pos.z, 10, 2.2, '#ffffff', 0.16);
    o.ripples.spawn(boat.pos.x, boat.pos.z, { from: 0.6, to: 3, life: 1.2, width: 0.12, alpha: 0.6 });
    o.announce(
      o.touch
        ? "You're in the speedboat. Use the arrows at the bottom, or drag anywhere, to drive. Race a lap round the island, or get out at the top."
        : "You're in the speedboat. W and S to go and slow, A and D to steer. R races a lap round the island, E gets you out.",
    );
  }

  /** Back to the pier: the boat is tied up again, and you step out onto the deck. */
  function leave() {
    if (!active()) return;
    phase = 'moored';
    lap = null;
    rec = null;
    keys.clear();
    stick = null;
    boat.place(moor.x, moor.z, moor.yaw);
    boat.locked = true;
    tieUp(true);
    ghostMesh.visible = false;
    arrow.visible = false;
    view.set(null, []);
    view.glow(false);
    hud.show(false);
    player.root.rotation.order = 'XYZ';
    player.root.rotation.x = 0;
    player.root.rotation.z = 0;
    player.shadowMesh.visible = true;
    player.place(stand.x, stand.z, faceBoat);
    player.hop(5);
    o.onLeave();
    o.sound.play('pop');
    o.announce('You tie the boat up and step back onto the pier.');
  }

  /** Close the finish card and potter about. */
  function cruise() {
    hud.hideCard();
    if (phase === 'finished') phase = 'free';
    paintHud();
  }

  // ---------- The race ----------

  function startRace() {
    if (!active()) return;
    hud.hideCard();
    phase = 'countdown';
    countT = COUNTDOWN;
    lastCount = -1;
    raceT = 0;
    lap = new Lap(course);
    rec = { x: [], z: [], yaw: [] };
    recNext = 0;
    missedWarned = -1;
    boat.place(course.start.x, course.start.z, course.start.yaw);
    boat.locked = true;
    snapCam = true;
    ghost = best() !== null ? loadGhost(course.sig) : null;
    view.set(1, []);
    view.glow(true);
    o.puffs.ring(boat.pos.x, 0.2, boat.pos.z, 10, 2.4, '#ffffff', 0.16);
    paintHud();
  }

  function finish(time: number, splits: number[]) {
    phase = 'finished';
    hud.setTime(time, formatLap(time));
    const events = store.dispatch({ type: 'lap', time });
    const e = events.find((x) => x.type === 'lap');
    const isBest = !!e && e.type === 'lap' && e.best;
    const previous = e && e.type === 'lap' ? e.previous : null;
    if (isBest && rec) saveGhost({ v: 1, sig: course.sig, time, dt: GHOST_DT, splits, x: rec.x, z: rec.z, yaw: rec.yaw });
    rec = null;
    ghostMesh.visible = false;
    arrow.visible = false;
    view.set(null, course.gates.map((g) => g.i));
    view.glow(false);
    o.sound.play('bell');
    const record = best();
    const note = isBest
      ? previous === null
        ? "Your first lap. That's the time to beat."
        : `A new best, ${formatGap(time - previous).slice(1)} seconds faster.`
      : `Your best is ${formatLap(record ?? time)}, ${formatGap(time - (record ?? time)).slice(1)} seconds quicker.`;
    hud.showCard(formatLap(time), note, isBest);
    o.announce(`Lap finished in ${formatLap(time)}. ${note}`);
    paintHud();
  }

  function paintHud() {
    const total = course.gates.length;
    const mode: HudMode = phase === 'countdown' ? 'countdown' : phase === 'racing' ? 'racing' : phase === 'finished' ? 'finished' : 'free';
    hud.mode(mode);
    const b = best();
    if (phase === 'countdown' || phase === 'racing') {
      const done = lap?.splits.length ?? 0;
      hud.setGates(total, done, lap?.next ?? null);
      hud.setSub(b !== null ? `Best ${formatLap(b)}` : `${total} gates, then the line`);
    } else {
      hud.setGates(total, 0, null);
      hud.setSub(b !== null ? `Best lap ${formatLap(b)}` : 'Race a lap round the island');
      if (phase === 'free') hud.setTime(null, '');
    }
  }

  // ---------- Input ----------

  function readInput() {
    if (forced) return forced;
    if (autopilot) return steerFor();
    let throttle = 0;
    let steer = 0;
    for (const k of keys) {
      throttle += THROTTLE_KEYS[k] ?? 0;
      steer += STEER_KEYS[k] ?? 0;
    }
    throttle += hud.pad.throttle;
    steer += hud.pad.steer;
    if (stick) {
      // Up is ahead: push up to go, down to slow; left and right steer.
      const mag = Math.hypot(stick.dx, stick.dy);
      if (mag > 8) {
        throttle += clamp(-stick.dy / STICK, -1, 1);
        steer += clamp(stick.dx / STICK, -1, 1);
      }
    }
    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1) };
  }

  /** The autopilot (debug): full speed for the next gate, aiming a little past its middle. */
  function steerFor() {
    const g = phase === 'racing' || phase === 'countdown' ? course.gates[lap?.next ?? 0] : course.gates[0];
    const tx = g.x + g.tx * 3;
    const tz = g.z + g.tz * 3;
    const want = Math.atan2(tx - boat.pos.x, tz - boat.pos.z);
    const diff = wrapAngle(want - boat.yaw);
    return { throttle: Math.abs(diff) > 1.2 ? 0.5 : 1, steer: clamp(-diff * 2.2, -1, 1) };
  }

  const isTyping = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

  /** A key, while walking about (E by the boat gets in) or in the boat (everything). True if it was ours. */
  function onKeyDown(e: KeyboardEvent, state: string) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return false;
    if (!active()) {
      if (state === 'play' && promptState === 'near' && !e.repeat && (e.code === 'KeyE' || e.key === 'Enter')) {
        e.preventDefault();
        board();
        return true;
      }
      return false;
    }
    const onButton = (document.activeElement as HTMLElement | null)?.tagName === 'BUTTON';
    if (THROTTLE_KEYS[e.code] !== undefined || STEER_KEYS[e.code] !== undefined) {
      e.preventDefault();
      keys.add(e.code);
      if (phase === 'finished' && THROTTLE_KEYS[e.code]) cruise();
      return true;
    }
    if (e.repeat) return true;
    if (e.code === 'KeyE') {
      e.preventDefault();
      leave();
    } else if (e.code === 'KeyR' || (e.key === 'Enter' && !onButton)) {
      e.preventDefault();
      startRace();
    } else if (e.key === 'Escape') {
      if (hud.cardOpen) cruise();
    } else if (e.code === 'Space' && !onButton) e.preventDefault();
    // Tab, Space on a button and the like carry on as usual.
    return e.code !== 'Tab' && !(onButton && (e.code === 'Space' || e.key === 'Enter'));
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    stick = null;
    hud.stickOff();
  }

  /** In the boat, a press on the water is a thumbstick (touch) or a joystick drag (mouse). */
  function onPointerDown(e: PointerEvent) {
    if (!active() || !e.isPrimary || e.button > 0) return false;
    stick = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    if (o.touch || e.pointerType === 'touch') hud.stickAt(e.clientX, e.clientY, 0, 0);
    if (phase === 'finished' && !hud.cardOpen) phase = 'free';
    return true;
  }
  function onPointerMove(e: PointerEvent) {
    if (!stick || e.pointerId !== stick.id) return false;
    let dx = e.clientX - stick.x;
    let dy = e.clientY - stick.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK) (dx *= STICK / d), (dy *= STICK / d);
    stick.dx = dx;
    stick.dy = dy;
    if (o.touch || e.pointerType === 'touch') hud.stickAt(stick.x, stick.y, dx, dy);
    return true;
  }
  function onPointerUp(e: PointerEvent) {
    if (!stick || e.pointerId !== stick.id) return false;
    stick = null;
    hud.stickOff();
    return true;
  }

  /** A click or tap on the boat, while walking about: go and get in. True if it hit. */
  function tap(raycaster: Raycaster) {
    if (active()) return false;
    if (!raycaster.intersectObjects(boat.hits, false).length) return false;
    board();
    return true;
  }
  function hovering(raycaster: Raycaster) {
    return !active() && raycaster.intersectObjects(boat.hits, false).length > 0;
  }

  // ---------- Every frame ----------

  /** After the explorer's own update: the boat, the race, and the explorer at the helm. */
  function update(time: number, dt: number, night: number, state: string) {
    if (wish && state === 'play') {
      // Sent here from another view to race: straight into the boat.
      wish = false;
      player.place(stand.x, stand.z, faceBoat);
      board(true);
    }

    // Walking over to get in: in once you're there; the walk was changed, and it's off.
    if (pendingBoard && !active()) {
      const w = o.walking();
      if (byBoat() && state === 'play') board();
      else if (!w || Math.hypot(w.x - stand.x, w.z - stand.z) > 0.3) pendingBoard = false;
    }

    // The board prompt: right by the boat it opens; nearby on the pier, just its name.
    if (!active()) {
      const near = state === 'play' && byBoat();
      const around = state === 'play' && !player.inWater && Math.hypot(player.pos.x - boat.pos.x, player.pos.z - boat.pos.z) < 6.5;
      setPrompt(near ? 'near' : around ? 'idle' : 'off');
    }

    prev.copy(boat.pos);
    if (active()) {
      const input = readInput();
      boat.input.throttle = input.throttle;
      boat.input.steer = input.steer;
    }
    boat.update(time, dt, night, active());
    view.update(time, dt, o.camera().position, boat.pos);

    if (phase === 'countdown') {
      countT -= dt;
      const n = Math.ceil(countT);
      if (n !== lastCount && n > 0) {
        lastCount = n;
        hud.count(String(n));
        o.sound.play('beep');
        o.announce(String(n));
      }
      // Rev up on the line: the throttle is yours, the boat isn't yet.
      if (countT <= 0) {
        phase = 'racing';
        boat.locked = false;
        raceT = 0;
        hud.count('Go!');
        o.sound.play('go');
        o.announce('Go!');
        window.setTimeout(() => phase === 'racing' && hud.count(''), 700);
      }
    } else if (phase === 'racing' && lap) {
      raceT += dt;
      // The ghost track: where the boat is every tenth of a second.
      if (rec && raceT >= recNext) {
        rec.x.push(Math.round(boat.pos.x * 100) / 100);
        rec.z.push(Math.round(boat.pos.z * 100) / 100);
        rec.yaw.push(Math.round(boat.yaw * 1000) / 1000);
        recNext += GHOST_DT;
      }
      const ev = lap.step(prev.x, prev.z, boat.pos.x, boat.pos.z, raceT);
      if (ev?.type === 'gate') {
        view.flash(ev.gate);
        view.set(lap.next, lap.splits.map((_, i) => i + 1));
        o.sound.play('chime');
        const split = ghost?.splits[ev.done - 1];
        const gap = split !== undefined ? { text: formatGap(ev.time - split), good: ev.time <= split } : undefined;
        hud.flash(`Gate ${ev.done} of ${course.gates.length}`, gap);
        o.announce(`Gate ${ev.done} of ${course.gates.length}${gap ? `, ${gap.text}` : ''}.`);
        missedWarned = -1;
        paintHud();
      } else if (ev?.type === 'finish') {
        view.flash(0);
        finish(ev.time, ev.splits);
      } else {
        // Gone past the next gate without going through it: say so once.
        const g = course.gates[lap.next];
        const ahead = (boat.pos.x - g.x) * g.tx + (boat.pos.z - g.z) * g.tz;
        const across = Math.abs((boat.pos.x - g.x) * -g.tz + (boat.pos.z - g.z) * g.tx);
        if (ahead > 8 && across < 30 && missedWarned !== lap.next) {
          missedWarned = lap.next;
          hud.flash(`Missed gate ${lap.splits.length + 1}: follow the arrow back`);
          o.announce(`You missed gate ${lap.splits.length + 1}. Turn back for it.`);
        }
      }
    }
    if (phase === 'countdown' || phase === 'racing') hud.setTime(raceT, formatLap(raceT));

    // The ghost of the best lap, racing alongside.
    const gp = ghost && (phase === 'racing' || phase === 'countdown') ? ghostAt(ghost, phase === 'countdown' ? 0 : raceT) : null;
    ghostMesh.visible = !!gp;
    if (gp) {
      ghostMesh.position.set(gp.x, 0.05, gp.z);
      ghostMesh.rotation.set(0, gp.yaw, 0);
    }

    // The arrow to the next gate.
    arrow.visible = phase === 'racing' || phase === 'countdown';
    if (arrow.visible) {
      const g = course.gates[lap?.next ?? 0];
      arrow.position.set(boat.pos.x, boat.pos.y + 3.3 + (o.reducedMotion ? 0 : Math.sin(time * 4) * 0.1), boat.pos.z);
      arrow.rotation.y = Math.atan2(g.x - boat.pos.x, g.z - boat.pos.z);
    }

    // The explorer at the helm, riding with the boat.
    if (active()) {
      boat.helm(tmp);
      player.root.position.copy(tmp);
      const t = boat.tilt;
      player.root.rotation.set(t.pitch, boat.yaw, t.roll);
    }
    shake = damp(shake, 0, 6, dt);
  }

  /** The chase camera: behind the boat, looking a little ahead, wider at speed. */
  function aim(rig: Rig, dt: number, aspect: number, fov: number) {
    const sp = Math.abs(boat.speed);
    const f = { x: Math.sin(boat.yaw), z: Math.cos(boat.yaw) };
    const lead = 1.6 + sp * 0.2;
    const tx = boat.pos.x + f.x * lead + (shake ? (Math.random() - 0.5) * shake : 0);
    const tz = boat.pos.z + f.z * lead + (shake ? (Math.random() - 0.5) * shake : 0);
    const tan = Math.tan(((fov / 2) * Math.PI) / 180);
    // Enough sea in view either way: a few units above and below, and either side on a narrow screen.
    const dist = Math.max(5.4 / tan, 5.6 / (tan * aspect)) * (1 + 0.14 * clamp(sp / TOP_SPEED)) * rig.zoom;
    const portrait = aspect < 0.8;
    let pitch = portrait ? 0.56 : 0.42;
    // Looking back over the land? Look down more steeply, so the island never gets in the way.
    const yaw = boat.yaw + Math.PI;
    for (let k = 0; k < 6; k++) {
      const cp = Math.cos(pitch);
      const cx = tx + Math.sin(yaw) * cp * dist;
      const cz = tz + Math.cos(yaw) * cp * dist;
      if (geo.heightAt(cx, cz) < -0.3) break;
      pitch += 0.09;
    }
    const snap = snapCam || o.reducedMotion;
    if (snapCam) {
      rig.yaw = yaw;
      snapCam = false;
    } else rig.yaw = dampAngle(rig.yaw, yaw, o.reducedMotion ? 10 : 2.4, dt);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    rig.target.x += (tx - rig.target.x) * k;
    rig.target.y += (boat.pos.y + 0.9 - rig.target.y) * k;
    rig.target.z += (tz - rig.target.z) * k;
    rig.dist = snap ? dist : damp(rig.dist, dist, 2.5, dt);
    rig.pitch = snap ? pitch : damp(rig.pitch, pitch, 2.5, dt);
  }

  /** Float the board prompt over the boat. Returns the screen area it covers, for labels to avoid. */
  function present(camera: PerspectiveCamera, w: number, h: number, avoid: Rect[]): Rect | null {
    if (promptState === 'off') return null;
    return prompt.place(camera, promptAnchor, w, h, avoid);
  }

  function dispose() {
    hud.dispose();
    prompt.dispose();
    boat.dispose();
    view.dispose();
    ghostMesh.geometry.dispose();
    (ghostMesh.material as Material).dispose();
    head.geometry.dispose();
    arrowMat.dispose();
  }

  return {
    get active() {
      return active();
    },
    /** Standing right by the boat, its prompt up: the pier's own card waits. */
    claims: () => promptState === 'near',
    board,
    leave,
    onKeyDown,
    onKeyUp,
    onBlur,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    tap,
    hovering,
    update,
    aim,
    present,
    dispose,
    debug: {
      /** Where the boat is and what the race is doing. */
      info: () => ({
        phase,
        x: boat.pos.x,
        z: boat.pos.z,
        y: boat.pos.y,
        yaw: boat.yaw,
        speed: boat.speed,
        next: lap?.next ?? null,
        gatesDone: lap?.splits.length ?? 0,
        time: raceT,
        best: best(),
        ghost: !!ghost,
        ghostShown: ghostMesh.visible,
        cardOpen: hud.cardOpen,
        prompt: promptState,
        player: { x: player.root.position.x, y: player.root.position.y, z: player.root.position.z },
      }),
      course: () => ({ gates: course.gates.map((g) => ({ x: g.x, z: g.z })), start: course.start, length: course.length, moor, stand }),
      board: () => board(true),
      leave,
      race: startRace,
      cruise,
      /** Hold the controls (null lets go), or let the autopilot drive round the course. */
      steer: (throttle: number | null, steer = 0) => void (forced = throttle === null ? null : { throttle, steer }),
      autopilot: (on: boolean) => void (autopilot = on),
      /** Put the boat somewhere, facing somewhere. */
      place: (x: number, z: number, yaw = 0) => boat.place(x, z, yaw),
    },
  };
}

export type Boating = ReturnType<typeof createBoating>;
