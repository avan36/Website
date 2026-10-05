// The island game: scene, camera rig, input, the intro, entering a place and
// the return reveal, plus what there is to do: finding the lost words, fishing
// off the pier, and the night that falls once every word is found. Loaded with
// a dynamic import() only when WebGL is available and the visitor is playing.

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
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { Explorer, type Water } from './character';
import { Landmark } from './landmarks';
import { Labels, type Rect } from './labels';
import type { RendererContext, SoundName, ViewId } from '../types';
import type { WorldStore } from '../../world/store';
import { Fishing, FISH_RANGE, type FishPhase } from './play/fishing';
import { Prompt, type PromptText } from './play/prompt';
import { LostWords } from './play/words';
import { Portal } from './play/portal';
import { createBoating, type Boating } from './play/boating';
import { isGame, type GameId } from '../games/catalog';
import { PORTAL_NEXT } from '../portal';
import { buildAmbient } from './world/ambient';
import { buildLondonBus } from './world/bus';
import { buildCommute } from './world/commute';
import { buildSkyline } from './world/skyline';
import { daylight, pageClock } from '../../world/clock';
import { resetSharedMaterials } from './world/kit';
import { buildNature, type Collider, type SharedUniforms } from './world/nature';
import { buildNight } from './world/night';
import { Puffs } from './world/particles';
import { Ripples } from './world/ripples';
import { buildBuoys } from './world/buoys';
import { buildBridges } from './world/bridges';
import { Gates } from './play/gate';
import { buildLondon } from './world/london';
import { buildFossHill } from './landmarks/fossHill';
import { ROWBOAT } from './landmarks/builders';
import { ACTIVITIES, GATES, groundAt, heightAt, HUB, isSwimmable, isWalkable, LAND, LAND_OUTLINE, nextStop, PIER, PLACES, placeOf, PLAZA, SPAWN, swimRoom, WANDERERS, WORDS } from './world/shape';
import { Wanderers } from './play/wanderers';
import { fitScale, frameRoom } from './interior/frame';
import { buildInterior, type Interior } from './interior/room';
import { buildHeightTexture, buildTerrain, pressGround, TERRAIN_SIZE } from './world/terrain';
import { buildSky, HORIZON } from './world/sky';
import { buildWater, waveHeight } from './world/water';
import { createPost } from './fx/post';
import { FrameWatch, pickQuality, stepDown, type Effect, type Level } from './fx/quality';
import { holdable } from '../hold';
import { clamp, damp, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, lerp, wrapAngle } from './util/math';

export interface GameOptions {
  stage: HTMLElement;
  /** The page's HUD, so labels can keep out of its way. */
  hud: HTMLElement;
  labelsHost: HTMLElement;
  /** Open a place's page (or `href`, a page that belongs to it), wiping in from (x, y) on screen. */
  go: (id: string, from: { x: number; y: number }, href?: string) => void;
  /** Step through the portal into another view, swirling out from (x, y) on screen. */
  portal: (next: ViewId, from: { x: number; y: number }) => void;
  /** Open the portal's menu of views: resolves with the one picked, or null. */
  choosePortal: () => Promise<ViewId | null>;
  /** Just came through the portal from another view: step out of this one. */
  viaPortal: boolean;
  cover: HTMLElement | null;
  returnTo: string | null;
  reducedMotion: boolean;
  touch: boolean;
  sound: { play(name: SoundName): void };
  /** Progress and presence, shared with every other view. */
  store: WorldStore;
  ui: Pick<RendererContext['ui'], 'announce' | 'toast' | 'showWord' | 'showCatch' | 'room'>;
  /** The first frame is up. `reveal`: where the cover should shrink back to (coming out of the portal). */
  onReady: (reveal?: { x: number; y: number }) => void;
  onFirstMove: () => void;
  onIntroDone: () => void;
  onLost: () => void;
}

export interface GameHandle {
  pause(): void;
  resume(): void;
  destroy(): void;
  /** For tests and debugging. */
  debug: {
    state: () => string;
    /** Where the explorer is; y is its feet's height (up in the air while jumping, under the surface afloat). */
    player: () => { x: number; z: number; y: number; airborne: boolean; water: Water; doubleJumped: boolean; speed: number; flip: number; sprinting: boolean; warp: number };
    /** Hold Shift (true) or let go (false), as the key would. */
    sprint: (on: boolean) => void;
    /** The portal: whether its card is up, and where it is on screen. */
    portal: () => { near: boolean; screen: { x: number; y: number } } | null;
    /** Click the portal (walk up to it and step through). */
    clickPortal: () => void;
    /** Where the explorer stepped through to (once it has). */
    portalled: () => { x: number; y: number } | null;
    /** The sea at a spot (the explorer's, by default): depth, room left to swim out, and the swell's height now. */
    sea: (x?: number, z?: number) => { depth: number; room: number; swimmable: boolean; walkable: boolean; surface: number };
    /** Where the explorer's head is on screen. */
    playerScreen: () => { x: number; y: number };
    /** Draw a frame now (with pause(), for still shots of a moment set up with tick()). */
    render: () => void;
    /** Run the game on for this many seconds at 60 steps a second, without drawing (headless browsers draw slowly). */
    tick: (seconds: number) => void;
    /** Click-to-walk to a spot (as a click on the ground there would); where it will actually go. */
    walkTo: (x: number, z: number) => { x: number; z: number } | null;
    near: () => string | null;
    frames: () => number;
    places: () => { id: string; x: number; z: number; stand: { x: number; z: number } }[];
    teleport: (x: number, z: number) => void;
    /** Look at (x, z) (at height y) from `dist` away, at a pitch and a turn (for still shots: pause() first, then render()). */
    look: (x: number, z: number, dist?: number, pitch?: number, yaw?: number, y?: number) => void;
    screen: (id: string) => { x: number; y: number } | null;
    /** Every lost word: where it lies, whether it's showing, and where it is on screen. */
    words: () => { id: string; x: number; z: number; shown: boolean; screen: { x: number; y: number } }[];
    camera: () => { position: number[]; target: number[]; dist: number; pitch: number; yaw: number; turn: number; zoom: number };
    /** Turn the view round the explorer by this many radians, or zoom it by a factor (as dragging, Q, or a pinch would). */
    turn: (radians: number) => void;
    zoom: (factor: number) => void;
    /** Fishing: the phase, and a press of the fishing key. */
    fishing: () => FishPhase | null;
    fish: () => void;
    /** How far night has fallen, 0..1. */
    night: () => number;
    /** Inside a building: which, where you stand in the room, who's within reach, and whether you're talking. */
    inside: () => { at: string; x: number; z: number; within: string | null; busy: boolean } | null;
    /** In a room: walk over to someone or something and talk to it or look at it, as a tap would. */
    approach: (id: string) => boolean;
    /** In a room: where a room point is on screen. */
    roomScreen: (x: number, z: number) => { x: number; y: number } | null;
    /** Go straight into a building, as if through its door. */
    enter: (id: string) => boolean;
    /** The speedboat and the race round the island (see play/boating.ts). */
    boat: Boating['debug'] | null;
    /** The mini-games: each spot, whether its prompt is up, and playing one (walking over first if need be). */
    games: () => { id: GameId; x: number; z: number; stand: { x: number; z: number }; open: boolean }[];
    gates: () => { id: string; x: number; z: number; open: boolean; swing: number }[];
    play: (id: GameId) => void;
    /** The polish over the picture (see fx/): its level and effects, and changing them as ?fx= would. */
    fx: () => { level: Level; effects: readonly Effect[] };
    setFx: (level: Level, effects?: Effect[]) => void;
    /** People out walking: where each is, whether they're walking, whether their prompt is up, and how many lines they've said. */
    wanderers: () => { id: string; x: number; z: number; moving: boolean; open: boolean; visible: boolean; said: number }[];
    /** Talk to someone out walking (walking over first if need be), as a tap on them would. */
    talk: (id: string) => void;
    /** Island time: how dark the clock and reward make it, and what the train is doing. */
    clock: () => { dark: number; commuting: boolean; train: { s: number; v: number; dwell: number; atStation: boolean } };
    /** The red bus on Little London: where it is, how fast it's going, and whether it's at the stop or waiting for you. */
    bus: () => { s: number; v: number; dwell: number; atStop: boolean; held: boolean; x: number; z: number; yaw: number } | null;
  };
}

/**
 * 'inside': in a building's room; 'door': the house opening up round you on the
 * way in, or closing behind you on the way out.
 * 'boat': out in the speedboat, which has the keys and the camera (play/boating.ts).
 */
type State = 'intro' | 'play' | 'entering' | 'portal' | 'inside' | 'door' | 'boat';

const INTRO = 3.0;
/** How far the view can be zoomed in and out, as a share of the usual distance, and how far Q and E turn it. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.45;
const TURN_STEP = Math.PI / 4;
/** How long being drawn into the portal takes, and stepping back out of one. */
const DRAW_IN = 0.35;
const POP_OUT = 0.5;

export async function createGame(o: GameOptions): Promise<GameHandle> {
  const { stage, touch } = o;
  const mobile = touch || Math.min(window.innerWidth, window.innerHeight) < 600;

  /** The room you're in, when you're inside a building (see "Inside a building" below). */
  let room: Interior | null = null;
  let roomId: string | null = null;

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
  // Shadows over all the land, islets and all: the sun looks at the middle of it, from far enough to see the lot.
  sun.position.copy(sunDir).multiplyScalar(60).add(new Vector3(LAND.x, 0, LAND.z));
  sun.target.position.set(LAND.x, 0, LAND.z);
  sun.castShadow = true;
  const sm = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  // The shadow map is fitted tightly round the land as the sun sees it (and
  // fitted again whenever the light moves, as night swings it round to the
  // moon), so none of it is spent on open sea: the outline of every island,
  // at the shore and a little above it for the hills.
  const landPts = LAND_OUTLINE.flatMap((p) => [new Vector3(p.x, 0, p.z), new Vector3(p.x, 3, p.z)]);
  const fit = { left: 0, right: 0, bottom: 0, top: 0, near: 10, far: 130 };
  const fitFrom = new Vector3(Number.NaN, 0, 0);
  const fitV = new Vector3();
  /** Fit the sun's shadow camera round the land, if the light has moved since it last was. True if it was. */
  function fitShadows() {
    if (fitFrom.equals(sun.position)) return false;
    fitFrom.copy(sun.position);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of landPts) {
      fitV.copy(p).applyMatrix4(sc.matrixWorldInverse);
      if (fitV.x < x0) x0 = fitV.x;
      if (fitV.x > x1) x1 = fitV.x;
      if (fitV.y < y0) y0 = fitV.y;
      if (fitV.y > y1) y1 = fitV.y;
      if (-fitV.z < z0) z0 = -fitV.z;
      if (-fitV.z > z1) z1 = -fitV.z;
    }
    const m = 1.5;
    fit.left = x0 - m;
    fit.right = x1 + m;
    fit.bottom = y0 - m;
    fit.top = y1 + m;
    // Room toward the light for the tallest things (the old tree, the lighthouse, the bridge's towers), and a little beyond the far shore.
    fit.near = Math.max(0.5, z0 - 14);
    fit.far = z1 + 8;
    return true;
  }
  fitShadows();
  sc.left = fit.left;
  sc.right = fit.right;
  sc.top = fit.top;
  sc.bottom = fit.bottom;
  sc.near = fit.near;
  sc.far = fit.far;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.85;
  scene.add(sun, sun.target);

  const sky = buildSky(sunDir);
  scene.add(sky);

  const uniforms: SharedUniforms = { uTime: { value: 0 }, uGrow: { value: 1 } };
  const island = new Group();
  island.name = 'island';
  scene.add(island);
  const terrain = buildTerrain(mobile);
  island.add(terrain);
  const nature = buildNature(uniforms, mobile);
  island.add(nature.group);
  // The seabed's texture reaches a little past the land, so the shallows round the furthest islets are baked in too.
  const height = buildHeightTexture(mobile ? 380 : 448, TERRAIN_SIZE * 1.26);
  const water = buildWater(height, sunDir, mobile);
  scene.add(water.mesh);
  const ambient = buildAmbient();
  scene.add(ambient.group);
  const puffs = new Puffs();
  scene.add(puffs.mesh);
  const ripples = new Ripples();
  scene.add(ripples.mesh);
  const buoys = buildBuoys();
  scene.add(buoys.group);
  // The railway, the train and the quay; and the city across the water.
  const commute = buildCommute();
  island.add(commute.group);
  // The bridges out to the islets (Tower Bridge lands on the quay, whose bollards stand aside for it).
  const bridges = buildBridges();
  island.add(bridges.group);
  // The badge gate on the long bridge out to Synergy Isle: shut until you speak corporate.
  const gates = new Gates(GATES, (id) => o.store.open(id));
  island.add(gates.group);
  // Little London's street furniture, on the way from the bridge to the mall.
  const london = buildLondon();
  island.add(london.group);
  // And the red bus going round it, its road, its stop and the zebra crossing.
  const londonBus = buildLondonBus();
  island.add(londonBus.group);
  // FOSS HILL in big letters below the lighthouse, and the small flag on the hilltop.
  const fossHill = buildFossHill();
  island.add(fossHill.group);
  const skyline = buildSkyline();
  scene.add(skyline.group);

  const landmarks = PLACES.map((p) => new Landmark(p));
  const byId = new Map(landmarks.map((l) => [l.place.id, l]));
  for (const l of landmarks) island.add(l.root);
  const hitMeshes = landmarks.map((l) => l.hit);
  const anchors = new Map(landmarks.map((l) => [l.place.id, l.anchor]));
  const colliders: Collider[] = [
    ...nature.colliders,
    ...landmarks.map((l) => ({ x: l.place.x, z: l.place.z, r: l.place.radius })),
    ...landmarks.flatMap((l) => l.solids()),
    ...commute.colliders,
    ...bridges.colliders,
    ...london.colliders,
    ...londonBus.colliders,
    ...londonBus.body,
    ...fossHill.colliders,
    ...gates.colliders,
  ];

  const player = new Explorer(puffs, ripples);
  scene.add(player.root, player.shadowMesh);
  // Wading, every other step is a soft slosh instead of a footfall.
  let sloshes = 0;
  player.onStep = () => (player.water === 'wade' ? ++sloshes % 2 === 0 && o.sound.play('swim') : o.sound.play('step'));
  player.onLand = (impact) => (impact > 1.1 ? o.sound.play('land') : impact > 0.15 && o.sound.play('step'));
  player.onJump = (second) => o.sound.play(second ? 'jump2' : 'jump');
  player.onSplash = () => o.sound.play('splash');
  // A paddle every other stroke, and every kick.
  let strokes = 0;
  player.onStroke = (kick) => (kick || ++strokes % 2 === 0) && o.sound.play('swim');
  player.lowJumps = o.reducedMotion;
  player.calm = o.reducedMotion;
  // Swimmers go round the pier (their heads would go through its deck) and the rowboat tied to it.
  const boatZ = PIER.end - ROWBOAT.fromEnd;
  const boatX = PIER.x + ROWBOAT.x;
  player.obstacles = [
    { ax: PIER.x, az: PIER.start, bx: PIER.x, bz: PIER.end, r: PIER.width / 2, top: PIER.deck },
    { ax: boatX, az: boatZ - ROWBOAT.halfLength + ROWBOAT.halfWidth, bx: boatX, bz: boatZ + ROWBOAT.halfLength - ROWBOAT.halfWidth, r: ROWBOAT.halfWidth, top: 0.3 },
    ...bridges.obstacles,
  ];
  // Dressed in whatever the visitor picked from the wardrobe (in any view).
  const worn = () => o.store.world.outfits.filter((x) => o.store.state.progress.worn[x.slot] === x.id);
  const dressUp = () => (player.wear(worn()), room?.player.wear(worn()));
  dressUp();
  const hill = PLACES.find((p) => p.kind === 'tree');

  // The portal on the plaza, to the next way of seeing the island.
  const portalSpot = ACTIVITIES.find((a) => a.kind === 'portal');
  const portal = portalSpot ? new Portal(portalSpot, { reducedMotion: o.reducedMotion }) : null;
  if (portal) {
    island.add(portal.group);
    colliders.push(...portal.colliders);
    anchors.set('portal', portal.anchor);
  }

  // ---------- Things to do ----------
  const { store } = o;
  const words = new LostWords(WORDS, uniforms, { reducedMotion: o.reducedMotion, touch, mobile });
  island.add(words.group);
  words.sync(store.has);
  words.onSound = (name) => o.sound.play(name);
  words.onFound = (id) => store.dispatch({ type: 'find', id });
  words.onReveal = (id) => o.ui.showWord(id);

  const fishSpot = ACTIVITIES.find((a) => a.kind === 'fishing');
  const fishing = fishSpot ? new Fishing(fishSpot, player, puffs, { reducedMotion: o.reducedMotion }) : null;
  const fishAnchor = fishSpot ? new Vector3(fishSpot.x, groundAt(fishSpot.x, fishSpot.z) + 2.2, fishSpot.z) : null;
  const fishColor = PLACES.find((p) => p.id === fishSpot?.place)?.color ?? '#2b8fb8';
  const prompt = fishSpot ? new Prompt(o.labelsHost, { name: 'Fishing spot', color: fishColor, key: 'E', onPress: () => fishAction() }) : null;
  // What the prompt says at each step of a cast.
  const kicker = fishSpot?.name ?? '';
  const say = {
    ready: { kicker, blurb: fishSpot?.description ?? '', action: 'Cast a line' },
    soon: { kicker, blurb: 'Too soon! Wait for the float to go under, then reel in.', action: 'Cast a line' },
    wait: { kicker, blurb: 'Watch the float. When it goes under, reel in.', action: 'Reel in', muted: true },
    bite: { kicker, blurb: "Something's biting!", action: 'Reel in!', urgent: true },
    caught: { kicker, blurb: 'Got one!', action: 'Reel in', muted: true },
    away: { kicker, blurb: 'It got away.', action: 'Cast a line', muted: true },
  } satisfies Record<string, PromptText>;
  const promptText = (phase: FishPhase, tooSoon: boolean): PromptText => {
    if (phase === 'ready') return tooSoon ? say.soon : say.ready;
    if (phase === 'bite') return say.bite;
    if (phase === 'catch') return say.caught;
    if (phase === 'miss') return say.away;
    if (phase === 'reel') return tooSoon ? say.soon : say.wait;
    return say.wait;
  };
  if (fishing) {
    scene.add(fishing.group);
    fishing.onSound = (name) => o.sound.play(name);
    fishing.onBite = () => o.ui.announce(touch ? 'Something is biting! Tap to reel in.' : 'Something is biting! Press E to reel in.');
    fishing.onCatch = () => {
      const r = store.fish();
      if (r) o.ui.showCatch(r.post.slug, r.fresh);
    };
    fishing.onMiss = () => o.ui.toast({ title: 'It got away', body: 'Cast again?', color: fishColor });
  }

  // The speedboat at the end of the pier, and the race round the island.
  const boatSpot = ACTIVITIES.find((a) => a.kind === 'boat');
  const boating = boatSpot
    ? createBoating({
        scene,
        camera: () => camera,
        stage,
        labelsHost: o.labelsHost,
        spot: boatSpot,
        player,
        puffs,
        ripples,
        buoys: buoys.spots,
        store,
        sound: o.sound,
        announce: (t) => o.ui.announce(t),
        reducedMotion: o.reducedMotion,
        touch,
        onBoard: () => {
          stopFishing();
          state = 'boat';
          keys.clear();
          walkTarget = null;
          pendingEnter = null;
          pendingPortal = false;
        },
        onLeave: () => void (state = 'play'),
        walkTo: (x, z) => {
          stopFishing();
          walkTarget = new Vector2(x, z);
          pendingEnter = null;
          pendingPortal = false;
          blockedT = 0;
          showMarker(walkTarget);
        },
        walking: () => (walkTarget ? { x: walkTarget.x, z: walkTarget.y } : null),
        firstMove: () => firstMove(),
      })
    : null;
  // The mini-games: a prop and a prompt at each spot; the games run in the shared games card.
  // (Loaded on the side, games card and all, to keep the island's own bundle lean.)
  const { MiniGames, playGame } = await import('./play/minigames');
  const games = new MiniGames(o.labelsHost, {
    reducedMotion: o.reducedMotion,
    best: (id) => store.best(id),
    onPress: (id) => playAt(id),
    // Walk up to a shut gate and its game's prompt opens there too.
    gate: (x, z) => {
      const g = gates.near(x, z);
      return g && isGame(g.game) ? g.game : null;
    },
  });
  island.add(games.group);
  colliders.push(...games.colliders);
  /** Walking over to a game to play it (cancelled if you head somewhere else). */
  let pendingGame: { id: GameId; target: Vector2 } | null = null;
  // People out walking: they stop as you come up, turn to you, and say their lines in turn.
  const walkers = new Wanderers(o.labelsHost, WANDERERS, {
    reducedMotion: o.reducedMotion,
    onPress: (id) => talkTo(id),
    say: (v, line) => {
      o.sound.play('pop');
      o.ui.announce(`${v.name[0].toUpperCase()}${v.name.slice(1)}: ${line}`);
    },
  });
  island.add(walkers.group);
  colliders.push(...walkers.colliders);
  /** Walking over to talk to someone (following them as they go; cancelled if you head somewhere else). */
  let pendingTalk: { id: string; target: Vector2 } | null = null;

  const night = buildNight({ scene, hemi, sun, sky, water: water.material, ambient, landmarks: [...landmarks, commute, bridges, london, londonBus, games, gates], extras: [skyline], mobile });
  scene.add(night.group);
  let nightWant = store.state.progress.night;
  /** Night waits for the last word's card to close, so you see it fall. */
  let nightHold = false;
  night.set(nightWant, true);
  // Island time: the real clock (or ?time=22:00) sets how dark it is and
  // whether the train is running. Checked about once a second.
  const clock = pageClock(location.search);
  let clockAt = -Infinity;
  let commuting = false;
  const tickClock = (instant = false) => {
    const d = clock.date();
    night.setClock(1 - daylight(d), instant);
    commuting = clock.commute(d);
  };
  tickClock(true);
  const dialog = document.getElementById('w-dialog') as HTMLDialogElement | null;
  const unsubscribe = store.subscribe((_, events) => {
    words.sync(store.has);
    dressUp();
    // A gate opened: its flaps swing back and it stands aside for good.
    if (events.some((e) => e.type === 'gate')) for (const c of gates.sync(store.open)) colliders.splice(colliders.indexOf(c) >>> 0, 1);
    for (const e of events) {
      if (e.type === 'hoard-complete') nightHold = true;
      if (e.type === 'night') nightWant = e.on;
    }
  });

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
    /** Where the visitor has turned the view to (radians round the explorer), and zoomed it to. */
    turn: 0,
    zoom: 1,
  };
  const turnBy = (a: number) => {
    rig.turn += a;
  };
  const zoomBy = (k: number) => {
    rig.zoom = clamp(rig.zoom * k, ZOOM_MIN, ZOOM_MAX);
  };
  // The polish over the picture: picked for the device (or ?fx=), and stepped
  // down a level whenever frames run slow for a few seconds (see fx/quality.ts).
  let quality = pickQuality({ search: location.search, mobile, reducedMotion: o.reducedMotion });
  const post = createPost(renderer, scene, camera, quality);
  const frameWatch = new FrameWatch();
  let viewW = 1;
  let viewH = 1;
  let baseDist = 24;
  let basePitch = 0.68;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    viewW = Math.max(1, Math.round(r.width));
    viewH = Math.max(1, Math.round(r.height));
    renderer.setSize(viewW, viewH, false);
    post.setSize(viewW, viewH);
    const aspect = viewW / viewH;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 50 : aspect < 1.2 ? 40 : 32;
    camera.updateProjectionMatrix();
    // Keep a similar amount of island in view whatever the shape of the screen.
    // Portrait looks down more steeply so the narrow view still spans the island.
    baseDist = aspect < 0.8 ? 47 : aspect < 1.2 ? 48 : 47;
    basePitch = aspect < 0.8 ? 0.86 : aspect < 1.2 ? 0.74 : 0.68;
    night.resize(viewH * renderer.getPixelRatio(), camera.fov);
    portal?.resize(viewH * renderer.getPixelRatio(), camera.fov);
    room?.view(camera, viewW, viewH);
  };
  resize();
  // Start leaned in close enough to see the explorer and the place ahead; a
  // narrow portrait view starts a little further out so it still shows the way.
  rig.zoom = viewW / viewH < 0.8 ? 0.8 : 0.68;
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const placeCamera = (target: Vector3, dist: number, pitch: number, yaw: number) => {
    const cp = Math.cos(pitch);
    camera.position.set(
      target.x + Math.sin(yaw) * cp * dist + rig.parallax.x * 1.1,
      target.y + Math.sin(pitch) * dist + rig.parallax.y * 0.7,
      target.z + Math.cos(yaw) * cp * dist,
    );
    // However close it leans in or wherever it's turned, never down to the sea or into a hill.
    camera.position.y = Math.max(camera.position.y, target.y + 1.5, 1.2, heightAt(camera.position.x, camera.position.z) + 1.5);
    camera.lookAt(target);
  };

  // ---------- Labels ----------
  let labelHover: string | null = null;
  let labelFocus: string | null = null;
  // The portal's label reads like a place's: where it leads, and a button to step through.
  const portalLabel = { id: 'portal', color: '#8b5cf6', name: 'The portal', kicker: 'Step through', blurb: 'One island, a few ways to see it. Step through and pick one.', href: `/?view=${PORTAL_NEXT.island}` };
  const labels = new Labels(
    o.labelsHost,
    portal ? [...PLACES, portalLabel] : PLACES,
    {
      activate: (id) => (id === 'portal' ? activatePortal() : activate(id)),
      enter: (id) => (id === 'portal' ? (nearPortal ? stepIn() : activatePortal()) : enter(id)),
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
  let destroyed = false;
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
  /** Walking to the fishing spot to cast from it. */
  let pendingCast = false;
  /** The fishing prompt is up. */
  let fishOpen = false;
  /** Running: Shift held, or heading somewhere double-clicked. */
  let shiftHeld = false;
  let runTo = false;
  /** The last tap on the ground, for telling a double tap. */
  let lastTap = { t: -1, x: 0, y: 0 };
  /** Standing in front of the portal (its card is up), walking to it to go through, how long you've pushed into it. */
  let nearPortal = false;
  let portalDismissed = false;
  let pendingPortal = false;
  let pushT = 0;
  /** How long you've been walking into a building's door (a moment of it and you go in). */
  let doorPushT = 0;
  let portalT = 0;
  let portalled: { x: number; y: number } | null = null;
  /** Stepping out of the portal on arrival (counts up from 0, -1 once done). */
  let arriveT = -1;

  const returning = o.returnTo ? byId.get(o.returnTo) ?? null : null;
  // Switched here from another view: stand where you were standing there.
  const saved = store.state.presence.pos;
  const resume = !returning && saved && (isWalkable(saved.x, saved.z) || isSwimmable(saved.x, saved.z)) ? saved : null;
  // Through the portal from another view: out of this one's, facing south.
  const arriving = !returning && o.viaPortal && !!portal;
  // Inside a building in another view: still inside it here (unless just back from its page, or through the portal).
  const startInside = !returning && !arriving && store.state.presence.inside && placeOf(store.state.presence.inside)?.interior ? store.state.presence.inside : null;
  if (!startInside && store.state.presence.inside) store.dispatch({ type: 'inside', at: null });

  // ---------- Start pose ----------
  if (returning || resume || arriving || startInside || o.reducedMotion) {
    state = 'play';
    const p = returning?.place;
    if (p) player.place(p.stand.x, p.stand.z, Math.atan2(p.x - p.stand.x, p.z - p.stand.z) + Math.PI);
    else if (arriving) {
      player.place(portal!.x, portal!.z + 1.5, 0);
      portalDismissed = true; // don't pop its card the moment you step out
      arriveT = 0;
      player.warp = 0;
    }
    else if (resume) player.place(resume.x, resume.z, 0, o.reducedMotion ? 0 : 2.4);
    else player.place(SPAWN.x, SPAWN.z, 0);
    rig.target.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
    rig.dist = baseDist * rig.zoom;
    rig.pitch = basePitch;
    if (resume && !arriving && !o.reducedMotion) {
      // A short settle instead of the long swoop: start a little high and drift down.
      rig.dist = baseDist * rig.zoom * 1.3;
      rig.pitch = basePitch + 0.12;
    }
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
  let press: { id: string | null; x: number; y: number; ground: boolean; pointerId: number; jump?: boolean } | null = null;

  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  /** What's under the pointer: a lost word (favoured, it's small) or a landmark. */
  const pickTarget = (): { word: string } | { place: string } | null => {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (portal) {
      const ph = raycaster.intersectObject(portal.hit, false);
      if (ph.length && (!hits.length || ph[0].distance < hits[0].distance)) hits.unshift(ph[0]);
    }
    const w = words.raycast(raycaster);
    if (w && (!hits.length || w.distance < hits[0].distance + 3)) return { word: w.id };
    return hits.length ? { place: hits[0].object.userData.place as string } : null;
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
  /** Somewhere the explorer can get to: land, or water a little short of the furthest you can swim. */
  const reachable = (x: number, z: number) => isWalkable(x, z) || (isSwimmable(x, z) && swimRoom(x, z) > 0.6);
  /** Clicked the open sea? Go as far toward it as you can swim. */
  const toShore = (p: Vector2) => {
    if (reachable(p.x, p.y)) return p;
    const from = new Vector2(player.pos.x, player.pos.z);
    const d = p.distanceTo(from);
    for (let s = 0; s < d; s += 0.25) {
      const q = p.clone().lerp(from, s / d);
      if (reachable(q.x, q.y)) return q;
    }
    return null;
  };
  const showMarker = (p: Vector2) => {
    // On the water the ring lies on the surface.
    marker.position.set(p.x, Math.max(groundAt(p.x, p.y), 0.1) + 0.06, p.y);
    markerT = 0;
  };

  const skipIntro = () => {
    if (state === 'intro') introSpeed = 4.5;
  };

  // Turning and zooming the view: right- or middle-drag with a mouse, or two fingers (twist and pinch).
  let turning: { x: number; pointerId: number } | null = null;
  const fingers = new Map<number, { x: number; y: number }>();
  let twist: { angle: number; dist: number; turn: number; zoom: number } | null = null;
  const fingerSpan = () => {
    const [a, b] = [...fingers.values()];
    return { angle: Math.atan2(b.y - a.y, b.x - a.x), dist: Math.hypot(b.x - a.x, b.y - a.y) || 1 };
  };
  const onGestureDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && state !== 'intro') {
        // A second finger: this is a twist or a pinch, not a tap. Forget what the first one started.
        const f = fingerSpan();
        twist = { ...f, turn: rig.turn, zoom: rig.zoom };
        if (press?.ground) (walkTarget = null), (markerT = 1), ((marker.material as MeshBasicMaterial).opacity = 0);
        if (press?.jump) player.releaseJump();
        press = null;
        lastTap.t = -1;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* not capturable */
        }
      }
      return fingers.size > 1;
    }
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      turning = { x: e.clientX, pointerId: e.pointerId };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      return true;
    }
    return false;
  };
  const onGestureMove = (e: PointerEvent) => {
    if (turning && e.pointerId === turning.pointerId) {
      turnBy((turning.x - e.clientX) * 0.005);
      turning.x = e.clientX;
      return true;
    }
    const f = fingers.get(e.pointerId);
    if (!f) return false;
    f.x = e.clientX;
    f.y = e.clientY;
    if (!twist || fingers.size < 2) return !!twist;
    const now = fingerSpan();
    // Twisting the fingers clockwise turns the island clockwise with them.
    let da = now.angle - twist.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    rig.turn = twist.turn + da;
    rig.zoom = clamp((twist.zoom * twist.dist) / now.dist, ZOOM_MIN, ZOOM_MAX);
    return true;
  };
  const onGestureUp = (e: PointerEvent) => {
    if (turning && e.pointerId === turning.pointerId) turning = null;
    fingers.delete(e.pointerId);
    // The gesture's over once a finger lifts (the one left doesn't walk anywhere: its press is gone).
    if (fingers.size < 2) twist = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (state === 'intro' || room || state === 'door') return;
    e.preventDefault();
    // Two fingers swiped sideways on a trackpad turn the view, like dragging it round.
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return turnBy(clamp(e.deltaX, -120, 120) * 0.005);
    // A trackpad pinch comes as a wheel with Ctrl held, in much smaller steps.
    zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0012)));
  };
  // Safari on a Mac reports a real two-finger twist (and pinch) on the trackpad.
  type Gesture = Event & { rotation: number; scale: number };
  let gesture: { rotation: number; scale: number } | null = null;
  const onGestureStart = (e: Event) => {
    if (o.touch || state === 'intro') return;
    e.preventDefault();
    gesture = { rotation: 0, scale: 1 };
  };
  const onGestureChange = (e: Event) => {
    if (!gesture) return;
    e.preventDefault();
    const g = e as Gesture;
    // Twisting clockwise turns the island clockwise with the fingers.
    turnBy(((g.rotation - gesture.rotation) * Math.PI) / 180);
    if (g.scale > 0) zoomBy(gesture.scale / g.scale);
    gesture = { rotation: g.rotation, scale: g.scale };
  };
  const onGestureEnd = () => (gesture = null);
  const onContextMenu = (e: Event) => e.preventDefault();

  const onPointerDown = (e: PointerEvent) => {
    if (room || state === 'door') {
      // In a room: no turning or zooming, just walking over to things.
      if (!e.isPrimary || e.button > 0 || state !== 'inside' || !room) return;
      setNdc(e);
      // A tap on the room while someone's talking says goodbye, then goes where it was meant to.
      if (o.ui.room.busy) o.ui.room.hush();
      room.tap(ndc);
      return;
    }
    if (onGestureDown(e)) return;
    if (!e.isPrimary || e.button > 0) return;
    o.sound.play('tap');
    if (state === 'intro') return skipIntro();
    if (state === 'boat') return void boating?.onPointerDown(e);
    if (state !== 'play') return;
    setNdc(e);
    // Something's biting: a tap anywhere reels it in.
    if (fishing?.phase === 'bite') {
      fishAction();
      return;
    }
    // Tap the explorer to jump (a long press jumps higher, like holding Space).
    if (onPlayer()) {
      jump();
      press = { id: null, x: e.clientX, y: e.clientY, ground: false, pointerId: e.pointerId, jump: true };
      return;
    }
    // Tap the speedboat: walk over and get in.
    raycaster.setFromCamera(ndc, camera);
    if (boating?.tap(raycaster)) return;
    // Tap a game's spot: walk over and play.
    raycaster.setFromCamera(ndc, camera);
    const game = games.pick(raycaster);
    if (game) return playAt(game);
    // Tap someone out walking: walk over and say hello.
    const who = walkers.pick(raycaster);
    if (who) return talkTo(who);
    const target = pickTarget();
    const id = target && 'place' in target ? target.place : null;
    press = { id, x: e.clientX, y: e.clientY, ground: !target, pointerId: e.pointerId };
    // A double click (or double tap) on where to go: run there.
    const now = performance.now();
    const dbl = now - lastTap.t < 360 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40;
    lastTap = dbl ? { t: -1, x: 0, y: 0 } : { t: now, x: e.clientX, y: e.clientY };
    runTo = dbl;
    if (target && 'word' in target) {
      // Tap a scroll: walk over and pick it up.
      const w = words.spot(target.word)!;
      const p = toShore(new Vector2(w.x, w.z));
      if (p) {
        stopFishing();
        walkTarget = p;
        pendingEnter = null;
        pendingPortal = false;
        showMarker(p);
        firstMove();
      }
    } else if (!id) {
      const g = pickGround();
      const p = g && toShore(g);
      if (p) {
        stopFishing();
        walkTarget = p;
        pendingEnter = null;
        pendingPortal = false;
        showMarker(p);
        firstMove();
      }
    } else if (dbl && walkTarget) {
      // Double-clicked a place you're already walking to: run the rest of the way.
      press.id = null;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (room) {
      setNdc(e);
      if (e.pointerType === 'mouse') canvas.style.cursor = room.over(ndc) ? 'pointer' : '';
      return;
    }
    if (onGestureMove(e) || boating?.onPointerMove(e)) return;
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
    onGestureUp(e);
    if (boating?.onPointerUp(e)) return;
    if (!press || e.pointerId !== press.pointerId) return;
    if (press.jump) player.releaseJump();
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.id && moved < 14) (press.id === 'portal' ? activatePortal() : activate(press.id));
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
    if (e.key === 'Shift') shiftHeld = true;
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
    // A card is up: the island waits until it's closed.
    if (dialog?.open) return keys.clear();
    if (room || state === 'door') {
      // In a room: walking and jumping. E, Enter and Escape are the room's (see room.ts).
      if (state !== 'inside' || !room || o.ui.room.busy) return keys.clear();
      if (MOVE_KEYS[e.code]) {
        e.preventDefault();
        keys.add(e.code);
        room.halt();
      } else if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement)) {
        e.preventDefault();
        if (!e.repeat) room.jump();
      }
      return;
    }
    if (state === 'intro') {
      if (e.code !== 'Tab') skipIntro();
      if (MOVE_KEYS[e.code]) e.preventDefault();
      return;
    }
    if (boating?.onKeyDown(e, state)) return;
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      keys.add(e.code);
      walkTarget = null;
      pendingEnter = null;
      pendingPortal = false;
      stopFishing();
      firstMove();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const onControl = !!active && active !== document.body && active !== canvas && (active.tagName === 'A' || active.tagName === 'BUTTON');
    // A game's prompt is up: E or Enter plays it.
    if ((e.code === 'KeyE' || e.key === 'Enter') && !onControl && !e.repeat && state === 'play' && games.open) {
      e.preventDefault();
      return playAt(games.open);
    }
    // Someone out walking has stopped for you: E or Enter says hello (and then chats).
    if ((e.code === 'KeyE' || e.key === 'Enter') && !onControl && !e.repeat && state === 'play' && walkers.open) {
      e.preventDefault();
      return talkTo(walkers.open);
    }
    // Fishing: E or F casts and reels in (E only while there's fishing to do: otherwise it turns the view).
    if ((e.code === 'KeyF' || (e.code === 'KeyE' && (fishOpen || fishing?.active))) && !e.repeat && state === 'play') {
      if (fishAction()) e.preventDefault();
      return;
    }
    // Q and E turn the view round the explorer, an eighth at a time.
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      e.preventDefault();
      turnBy(e.code === 'KeyQ' ? TURN_STEP : -TURN_STEP);
      return;
    }
    // Space jumps, or reels in while the line is out. A focused button or link keeps its own Space.
    if (e.code === 'Space' && !onControl) {
      e.preventDefault();
      if (state !== 'play') return;
      if (fishing?.active) return fishing.reel();
      if (!e.repeat) jump();
      return;
    }
    if (e.key === 'Enter' && !onControl && state === 'play') {
      const id = nearId && nearId !== dismissedId ? nearId : null;
      if (id) {
        e.preventDefault();
        enter(id);
      } else if (nearPortal) {
        e.preventDefault();
        stepIn();
      }
    }
    if (e.key === 'Escape') {
      if (nearId) dismissedId = nearId;
      else if (nearPortal) (portalDismissed = true), (nearPortal = false);
      pendingEnter = null;
      pendingPortal = false;
      if (active && o.labelsHost.contains(active)) active.blur();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    boating?.onKeyUp(e);
    if (e.key === 'Shift') shiftHeld = false;
    if (e.code === 'Space') (player.releaseJump(), room?.releaseJump());
  };
  const onBlur = () => {
    keys.clear();
    boating?.onBlur();
    shiftHeld = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  // On the whole stage, so the labels floating over the island don't swallow it.
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('gesturestart', onGestureStart);
  stage.addEventListener('gesturechange', onGestureChange);
  stage.addEventListener('gestureend', onGestureEnd);
  canvas.addEventListener('contextmenu', onContextMenu);
  // Everything on the canvas is read from pointer events, so its touches can be
  // cancelled: a thumb held on the water (the boat's stick, a long jump) never
  // selects text or brings up the magnifier on a phone.
  const unhold = holdable(canvas, { touch: true });
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

  /** Pick up a lost word: stop, look at it, hop, and let the scroll do its thing. */
  function pickUp(id: string) {
    const w = words.spot(id);
    if (!w) return;
    walkTarget = null;
    pendingEnter = null;
    keys.clear();
    stopFishing();
    player.faceToward(w.x, w.z);
    player.hop(5);
    words.pick(id, player.pos, puffs);
    firstMove();
  }

  /** The fishing key (E or F), the prompt's button, or a tap while it bites. True if it did something. */
  function fishAction() {
    if (!fishing || state !== 'play' || words.picking) return false;
    if (fishing.active) {
      fishing.reel();
      return true;
    }
    if (!fishOpen || player.inWater) return false;
    firstMove();
    // Step up to the spot first, then cast.
    const s = fishing.stand;
    if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > 0.4) {
      walkTarget = new Vector2(s.x, s.z);
      pendingEnter = null;
      pendingCast = true;
      blockedT = 0;
    } else fishing.cast();
    return true;
  }

  /** Jump, unless something else has the explorer's attention: a scroll, a door, a card. */
  function jump() {
    if (state !== 'play' || words.picking || pendingEnter || dialog?.open) return;
    stopFishing();
    player.jump();
    firstMove();
  }

  /** Is the pointer on the explorer? (A ray against a ball round its body.) */
  const onPlayer = () => {
    raycaster.setFromCamera(ndc, camera);
    player.head(tmpV).y -= 0.15;
    return raycaster.ray.distanceSqToPoint(tmpV) < 0.95 * 0.95;
  };

  /** Walking off mid-cast reels the line in and puts the rod away. */
  function stopFishing() {
    pendingCast = false;
    if (fishing && (fishing.active || player.rodOut)) fishing.cancel();
  }

  /** Play a mini-game: walk up to its spot first if it's a way off. */
  function playAt(id: GameId) {
    if (state === 'intro') skipIntro();
    if (state !== 'play' || words.picking || dialog?.open) return;
    stopFishing();
    firstMove();
    const s = games.stand(id);
    if (games.open !== id && Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > 0.6) {
      walkTarget = new Vector2(s.x, s.z);
      pendingEnter = null;
      pendingPortal = false;
      pendingGame = { id, target: walkTarget };
      blockedT = 0;
      showMarker(walkTarget);
      o.sound.play('pop');
      return;
    }
    pendingGame = null;
    walkTarget = null;
    keys.clear();
    const spot = games.spots.find((x) => x.id === id)!;
    player.faceToward(spot.x, spot.z);
    // The island holds still (and stops drawing) while the game has the screen.
    stop();
    playGame(id, {
      store,
      sound: o.sound,
      reducedMotion: o.reducedMotion,
      touch,
      announce: o.ui.announce,
      onClose: () => {
        if (destroyed) return;
        games.refresh();
        if (!document.hidden) start();
      },
    });
  }

  /** Talk to someone out walking: walk over to them first if they're a way off. */
  function talkTo(id: string) {
    if (state === 'intro') skipIntro();
    if (state !== 'play' || words.picking || dialog?.open) return;
    stopFishing();
    firstMove();
    const at = walkers.where(id);
    if (!at) return;
    if (walkers.open === id) {
      pendingTalk = null;
      walkTarget = null;
      keys.clear();
      player.faceToward(at.x, at.z);
      return walkers.talk(id);
    }
    walkTarget = new Vector2();
    aimAt(walkTarget, at);
    pendingEnter = null;
    pendingPortal = false;
    pendingGame = null;
    pendingTalk = { id, target: walkTarget };
    blockedT = 0;
    showMarker(walkTarget);
    o.sound.play('pop');
  }
  /** A step short of someone, on your side of them. */
  function aimAt(out: Vector2, at: { x: number; z: number }) {
    const d = Math.hypot(player.pos.x - at.x, player.pos.z - at.z) || 1;
    return out.set(at.x + ((player.pos.x - at.x) / d) * 1.3, at.z + ((player.pos.z - at.z) / d) * 1.3);
  }

  function activate(id: string) {
    if (state === 'intro') skipIntro();
    if (state !== 'play') return;
    const l = byId.get(id);
    if (!l) return;
    stopFishing();
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

  /** Go into a place: `walking`, you walked into its door (no hop, you just carry on in). */
  function enter(id: string, walking = false) {
    if (state !== 'play' || words.picking) return;
    const l = byId.get(id);
    if (!l) return;
    stopFishing();
    walkTarget = null;
    pendingEnter = null;
    keys.clear();
    player.faceToward(l.place.x, l.place.z);
    if (!walking) player.hop(7);
    l.bounce(1.4);
    o.sound.play('whoosh');
    // A building with a room opens up right here (see "Inside a building"). Anywhere else, on to its page.
    if (placeOf(id)?.interior) return openDoor(l);
    state = 'entering';
    enteringId = id;
    enterT = 0;
    wipeStarted = false;
  }

  /** Click the portal: walk up in front of it and step through. */
  function activatePortal() {
    if (state === 'intro') skipIntro();
    if (state !== 'play' || !portal) return;
    stopFishing();
    firstMove();
    if (nearPortal) return stepIn();
    walkTarget = new Vector2(portal.x, portal.z + 1.05);
    pendingEnter = null;
    pendingPortal = true;
    blockedT = 0;
    showMarker(walkTarget);
    o.sound.play('pop');
  }

  /** Where the portal leads this time: picked from its menu as you step up. */
  let portalTo: ViewId = PORTAL_NEXT.island;
  let choosing = false;
  /** Closed the menu without picking: pushing into the portal again waits until you've stepped back. */
  let portalShy = false;
  /** At the portal: open its menu of views, and step through into the one picked. */
  function stepIn() {
    if (state !== 'play' || !portal || words.picking || player.inWater || choosing) return;
    stopFishing();
    choosing = true;
    walkTarget = null;
    pendingEnter = null;
    pendingPortal = false;
    keys.clear();
    o.sound.play('pop');
    void o.choosePortal().then((next) => {
      choosing = false;
      if (destroyed) return;
      if (next) (portalTo = next), stepThrough();
      else portalShy = true;
    });
  }
  /** Into the portal: drawn into the swirl, shrinking and spinning, then on to the next view. */
  function stepThrough() {
    if (state !== 'play' || !portal || words.picking || player.inWater) return;
    stopFishing();
    state = 'portal';
    portalT = 0;
    walkTarget = null;
    pendingEnter = null;
    pendingPortal = false;
    nearPortal = false;
    keys.clear();
    player.faceToward(portal.x, portal.z - 1);
    player.pullTo.copy(portal.middle);
    o.sound.play('whoosh');
  }

  /** Where a point in the world is on screen, in CSS pixels. */
  const toScreen = (v: Vector3) => {
    tmpV.copy(v).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * viewW, y: (-tmpV.y * 0.5 + 0.5) * viewH };
  };

  const updatePortal = (dt: number) => {
    if (!portal) return;
    portalT += dt;
    const k = clamp(portalT / DRAW_IN);
    // Pulled in and up to the middle of the swirl, shrinking (and spinning, unless motion is reduced).
    player.pull = easeInOutCubic(k);
    player.warp = 1 - easeInOutCubic(k);
    player.spin = o.reducedMotion ? 0 : -k * k * Math.PI * 4;
    portal.flare = Math.sin(Math.PI * clamp(portalT / (DRAW_IN + 0.5))) ;
    if (portalT >= DRAW_IN && !portalled) {
      portalled = toScreen(portal.middle);
      o.portal(portalTo, portalled);
    }
    // The page didn't go (it was already going somewhere): step back out.
    if (portalT > 3) {
      state = 'play';
      player.pull = 0;
      player.warp = 1;
      player.spin = 0;
      portal.flare = 0;
      portalled = null;
      portalDismissed = true;
    }
  };

  const startWipe = (l: Landmark) => {
    const v = l.focus(new Vector3()).project(camera);
    o.go(l.place.id, { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH });
  };

  // ---------- Inside a building ----------
  // A building with a room opens up right where it stands: the camera glides
  // in, the roof lifts off, the walls sink into the ground, and the room
  // (interior/room.ts), set down in the house's own spot and scaled to fit
  // its plot, grows up out of the floor with you in its doorway. Coming out
  // runs it all backwards and leaves you in front of the door you went in by.
  /** How long the house takes to open up round you, and to close behind you. */
  const OPEN = 1.6;
  const CLOSE = 1.3;
  /** How far into opening up the room starts to show (it waits there for its shaders, see warm()). */
  const SHOW = 0.5;
  type Pose = { target: Vector3; dist: number; pitch: number; yaw: number };
  /** Going in (1) or coming out (-1): how far along, where the camera set off from, and where you're walking to. */
  let door: { dir: 1 | -1; t: number; l: Landmark; from: Pose; ready: boolean; popped: boolean; at: Vector2 } | null = null;
  /** The camera leans a little toward wherever you are in the room (world units). */
  const lean = new Vector3();
  const leanTo = new Vector3();
  const UP = new Vector3(0, 1, 0);
  const poseNow = (): Pose => ({ target: rig.target.clone(), dist: rig.dist, pitch: rig.pitch, yaw: rig.yaw });
  /** The rig, part way (k) from one pose to another, turning the short way round. */
  const rigBetween = (a: Pose, b: Pose, k: number) => {
    rig.target.lerpVectors(a.target, b.target, k);
    rig.dist = lerp(a.dist, b.dist, k);
    rig.pitch = lerp(a.pitch, b.pitch, k);
    rig.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
  };
  const rigAt = (p: Pose) => rigBetween(p, p, 1);
  /** Where the camera goes to show the room: in front of its door, the whole room in the space the words leave (frame.ts). */
  const roomPose = (r: Interior, l: Landmark): Pose => {
    const s = r.group.scale.x;
    const at = r.group.getWorldPosition(tmpV);
    const f = frameRoom({ at, yaw: l.place.yaw, size: { w: r.size.w * s, d: r.size.d * s, h: r.size.h * s }, viewW, viewH, fov: camera.fov });
    return { target: new Vector3(f.target.x, f.target.y, f.target.z).add(lean), dist: f.dist, pitch: f.pitch, yaw: f.yaw };
  };
  /** Back out on the island: following you, the way you'd turned it. */
  const followPose = (): Pose => ({ target: new Vector3(player.pos.x, player.pos.y + 0.8, player.pos.z), dist: baseDist * rig.zoom, pitch: basePitch, yaw: rig.turn });

  /** Set the room down in the house's spot: its door to the house's door, on its level ground, as big as the plot allows. */
  function mountRoom(id: string) {
    const l = byId.get(id)!;
    room?.dispose();
    const r = buildInterior({ place: placeOf(id)!, ui: o.ui.room, sound: o.sound, reducedMotion: o.reducedMotion, night: night.dark, wear: worn(), leave: () => leaveRoom() });
    r.group.position.set(l.place.x, l.baseY + 0.03, l.place.z);
    r.group.rotation.y = l.place.yaw;
    r.group.scale.setScalar(fitScale(r.size, Math.min(l.place.clearing - 0.3, l.place.radius + 1.3)));
    island.add(r.group);
    r.view(camera, viewW, viewH);
    room = r;
    roomId = id;
    lean.set(0, 0, 0);
    return r;
  }
  /** The ground under the room pressed flat (so a neighbour's slope doesn't come up through the floor), or let back up. */
  function flatten(on: boolean) {
    const r = room;
    if (!on || !r) return pressGround(terrain, null);
    const s = r.group.scale.x;
    pressGround(terrain, { x: r.group.position.x, z: r.group.position.z, yaw: r.group.rotation.y, hw: (r.size.w / 2) * s + 0.05, hd: (r.size.d / 2) * s + 0.05, y: r.group.position.y - 0.05 });
  }

  // While a room's up, the sun's shadows close in round it and what's on
  // screen near it: the island's whole shadow map spent on a room set down at
  // dollhouse size keeps its shadows crisp, where island-wide they'd blur.
  const shadowAt = new Vector3();
  let shadowK = 0;
  function focusShadows(dt: number) {
    const r = room?.group.visible ? room : null;
    const want = r ? 1 : 0;
    shadowK = o.reducedMotion || Math.abs(want - shadowK) < 0.002 ? want : damp(shadowK, want, 3, dt);
    // The light swings round as night falls: fit the island's shadows round the land again.
    const moved = fitShadows();
    // Where the room is as the sun sees it (kept from the last frame it was up, to ease back out from).
    if (r) {
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
      sun.shadow.updateMatrices(sun);
      r.group.getWorldPosition(shadowAt).applyMatrix4(sc.matrixWorldInverse);
    }
    // From the fit round the land to a square round the room.
    const R = clamp(rig.dist * 0.9, 7, Math.max(fit.right - fit.left, fit.top - fit.bottom) / 2);
    const left = lerp(fit.left, shadowAt.x - R, shadowK);
    const right = lerp(fit.right, shadowAt.x + R, shadowK);
    const bottom = lerp(fit.bottom, shadowAt.y - R, shadowK);
    const top = lerp(fit.top, shadowAt.y + R, shadowK);
    if (!moved && sc.left === left && sc.right === right && sc.bottom === bottom && sc.top === top) return;
    sc.left = left;
    sc.right = right;
    sc.bottom = bottom;
    sc.top = top;
    sc.near = fit.near;
    sc.far = fit.far;
    sc.updateProjectionMatrix();
  }

  // The room's lamp is the only point light the island ever has, and the
  // first time it shines every lit material needs its shaders built for it:
  // do that out of sight while the house opens, so the glide doesn't stutter.
  const warmScene = new Scene();
  warmScene.add(new PointLight('#ffffff', 0));
  let warmed = false;
  function warm(done: () => void) {
    if (warmed) return done();
    warmScene.fog = scene.fog;
    const ok = () => {
      warmed = true;
      if (!destroyed) done();
    };
    renderer.compileAsync(scene, camera, warmScene).then(ok, ok);
  }

  /** In through the door: the house starts opening up round you. */
  function openDoor(l: Landmark) {
    const r = mountRoom(l.place.id);
    // Hidden (lamp and all) until its shaders are ready.
    r.group.visible = false;
    r.reveal(0);
    state = 'door';
    canvas.style.cursor = '';
    prompt?.show(false);
    rig.parallaxT.set(0, 0);
    // You'll walk on into its doorway.
    const reach = (r.size.d / 2) * r.group.scale.x;
    const at = new Vector2(l.place.x + Math.sin(l.place.yaw) * reach, l.place.z + Math.cos(l.place.yaw) * reach);
    door = { dir: 1, t: 0, l, from: poseNow(), ready: false, popped: false, at };
    const d = door;
    warm(() => (d.ready = true));
  }

  /** The house round the room, part way (k) open: the roof lifts off first, then the walls go down. */
  function opening(l: Landmark, k: number) {
    const lid = clamp((k - 0.1) / 0.4);
    const walls = clamp((k - 0.22) / 0.38);
    l.open(lid, walls);
    night.dim(landmarks.indexOf(l), Math.max(lid, walls));
  }

  function updateDoor(dt: number) {
    const d = door;
    const r = room;
    if (!d || !r) return;
    const l = d.l;
    const T = o.reducedMotion ? 0 : d.dir > 0 ? OPEN : CLOSE;
    // Going in, it waits where the room starts to show until the room can be drawn without a hitch.
    d.t = Math.min(d.t + dt, d.dir > 0 && !d.ready ? SHOW * T : Infinity);
    const k = T > 0 ? clamp(d.t / T) : d.dir > 0 && !d.ready ? 0 : 1;
    if (d.dir > 0) {
      rigBetween(d.from, roomPose(r, l), easeInOutCubic(k));
      opening(l, k);
      // A puff as the roof comes off.
      if (!d.popped && k > 0.12) {
        d.popped = true;
        if (!o.reducedMotion) puffs.ring(l.place.x, l.baseY + l.place.eaves, l.place.z, 14, 3.2, '#fbf1dc', 0.32);
        o.sound.play('pop');
      }
      // You walk on into the doorway (the house is going: nothing's in the way), getting smaller as you go:
      // the one inside is you in a moment.
      wish.set(d.at.x - player.pos.x, d.at.y - player.pos.z);
      const far = wish.length();
      player.move(dt, far > 0.12 ? wish.multiplyScalar(clamp(far / 1.2 + 0.3) / far) : wish.set(0, 0), []);
      const step = clamp((k - 0.12) / 0.3);
      player.warp = Math.max(0.001, 1 - easeInCubic(step));
      if (step >= 1) player.root.visible = player.shadowMesh.visible = false;
      // The room grows up out of its floor.
      const show = d.ready && k >= SHOW;
      if (show && !r.group.visible) flatten(true);
      r.group.visible = show;
      r.reveal(show ? (o.reducedMotion ? 1 : easeOutBack(clamp((k - SHOW) / 0.4), 1.4)) : 0);
      if (k >= 1) arriveInside(false);
    } else {
      player.move(dt, wish.set(0, 0), colliders);
      rigBetween(d.from, followPose(), easeInOutCubic(k));
      // The room folds down into its floor, the walls come back up and the roof drops back on.
      r.reveal(1 - easeInCubic(clamp(k / 0.35)));
      if (k >= 0.35 && r.group.visible) (r.group.visible = false), flatten(false);
      opening(l, 1 - clamp((k - 0.05) / 0.7));
      // And there you are, outside the door.
      if (!player.root.visible && k > 0.55) {
        player.root.visible = player.shadowMesh.visible = true;
        player.warp = 0.001;
        if (!o.reducedMotion) player.hop(5);
        o.sound.play('pop');
      }
      if (player.root.visible && player.warp < 1) player.warp = o.reducedMotion ? 1 : Math.min(1, player.warp + dt * 3.2);
      if (k >= 1) stepOut();
    }
  }

  /** All the way in: the room is yours, and its bar and description go up. */
  function arriveInside(quiet: boolean) {
    const r = room;
    const id = roomId;
    const l = id ? byId.get(id) : null;
    if (!r || !id || !l) return;
    door = null;
    state = 'inside';
    enteringId = null;
    walkTarget = null;
    pendingEnter = null;
    keys.clear();
    stopFishing();
    canvas.style.cursor = '';
    prompt?.show(false);
    l.open(1, 1);
    night.dim(landmarks.indexOf(l), 1);
    r.group.visible = true;
    r.reveal(1);
    flatten(true);
    player.warp = 1;
    player.root.visible = player.shadowMesh.visible = false;
    store.dispatch({ type: 'inside', at: id });
    o.ui.room.enter(
      id,
      {
        leave: () => leaveRoom(),
        page: (href) => o.go(id, r.screen(0, r.plan.d / 2), href),
        engage: (t) => r.engage(t),
      },
      { quiet },
    );
  }

  /** Straight in, no glide: for reduced motion, a page that starts inside, and the debug handle. */
  function cutInside(id: string, quiet: boolean) {
    const l = byId.get(id);
    if (!l || !placeOf(id)?.interior) return;
    const r = mountRoom(id);
    arriveInside(quiet);
    rigAt(roomPose(r, l));
    rig.parallax.set(0, 0);
    rig.parallaxT.set(0, 0);
    placeCamera(rig.target, rig.dist, rig.pitch, rig.yaw);
    shadowK = 1;
    focusShadows(0);
  }

  /** Out of the door (walking out, Escape, the Leave button): the house closes up behind you. */
  function leaveRoom() {
    const r = room;
    const id = roomId;
    const l = id ? byId.get(id) : null;
    if (!r || !l || state !== 'inside') return;
    o.sound.play('step');
    o.ui.room.exit();
    store.dispatch({ type: 'inside', at: null });
    r.halt();
    state = 'door';
    keys.clear();
    canvas.style.cursor = '';
    // Back out in front of the door you went in by, facing away from it (you pop out in a moment).
    const p = l.place;
    player.place(p.stand.x, p.stand.z, Math.atan2(p.x - p.stand.x, p.z - p.stand.z) + Math.PI);
    door = { dir: -1, t: 0, l, from: poseNow(), ready: true, popped: false, at: new Vector2(p.stand.x, p.stand.z) };
  }

  /** All the way out: the room's gone, and you're on the island again. */
  function stepOut() {
    const l = door?.l;
    door = null;
    room?.dispose();
    room = null;
    roomId = null;
    flatten(false);
    if (!l) return;
    l.open(0, 0);
    night.dim(landmarks.indexOf(l), 0);
    state = 'play';
    keys.clear();
    player.root.visible = player.shadowMesh.visible = true;
    player.warp = 1;
    dismissedId = l.place.id;
    nearId = l.place.id;
    reportPresence(0, true);
    l.bounce(1);
  }

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
  const focusV = new Vector3();
  let avoidAt = -Infinity;
  const avoidAll: Rect[] = [];
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
    rig.dist = lerp(110, baseDist * rig.zoom, k);
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
    // On the way to a game: play once you're there; heading anywhere else calls it off.
    if (pendingGame) {
      if (walkTarget !== pendingGame.target) pendingGame = null;
      else if (Math.hypot(player.pos.x - walkTarget.x, player.pos.z - walkTarget.y) < 0.6) return playAt(pendingGame.id);
    }
    // On the way to talk to someone: follow them as they walk, and say hello once they've stopped for you.
    if (pendingTalk) {
      const at = walkers.where(pendingTalk.id);
      if (walkTarget !== pendingTalk.target || !at) pendingTalk = null;
      else if (walkers.open === pendingTalk.id) return talkTo(pendingTalk.id);
      else aimAt(walkTarget, at);
    }
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
      // Afloat you glide, so ease off sooner and call it there a little further out.
      const swim = player.water === 'swim';
      const arrived = d < (swim ? 0.5 : 0.3) || (pend && Math.hypot(player.pos.x - pend.place.x, player.pos.z - pend.place.z) < pend.place.enterRange - 0.4);
      if (arrived) {
        walkTarget = null;
        runTo = false;
        if (pendingPortal) (pendingPortal = false), atPortal() && stepIn();
        else if (pend) enter(pend.place.id);
        else if (pendingCast) (pendingCast = false), !player.inWater && fishing?.cast();
      } else {
        // On another island: over the bridge, one landing at a time (at the pace the whole way calls for).
        const stop = nextStop({ x: player.pos.x, z: player.pos.z }, { x: walkTarget.x, z: walkTarget.y });
        const sd = Math.hypot(stop.x - player.pos.x, stop.z - player.pos.z) || 1;
        wish.set((stop.x - player.pos.x) / sd, (stop.z - player.pos.z) / sd).multiplyScalar(swim ? clamp(d / 2.4 + 0.1) : clamp(d / 1.4 + 0.3));
      }
    }
    // Pushing into the portal's face from the front, on foot, with the keys: through you go.
    if (portal && keys.size && player.grounded && !player.inWater) {
      const side = player.pos.x - portal.x;
      const front = player.pos.z - portal.z;
      const into = wish.y < -0.5 && Math.abs(wish.x) <= -wish.y;
      if (front > 1.6 || Math.abs(side) > 1) portalShy = false;
      pushT = !portalShy && into && Math.abs(side) < 0.7 && front > 0 && front < 1.2 ? pushT + dt : 0;
      if (pushT > 0.12) return stepIn();
    } else pushT = 0;
    // Walking into a building's door, on foot (with the keys, or steering with a drag): in you go.
    const doorL = nearId ? byId.get(nearId) : null;
    if (doorL && placeOf(doorL.place.id)?.interior && (keys.size || press?.ground) && player.grounded && !player.inWater && wish.lengthSq() > 0.01) {
      const p = doorL.place;
      // The door's axis: from the middle of the building out to where you stand to go in.
      const ax = p.stand.x - p.x;
      const az = p.stand.z - p.z;
      const len = Math.hypot(ax, az) || 1;
      const rx = player.pos.x - p.x;
      const rz = player.pos.z - p.z;
      const along = (rx * ax + rz * az) / len;
      const side = Math.abs(rx * az - rz * ax) / len;
      const into = -(wish.x * ax + wish.y * az) / (len * wish.length());
      doorPushT = along > 0 && side < 1.1 && along < p.radius + 1.1 && into > 0.6 ? doorPushT + dt : 0;
      if (doorPushT > 0.12) {
        doorPushT = 0;
        return enter(p.id, true);
      }
    } else doorPushT = 0;
    player.sprint = shiftHeld || (!!walkTarget && runTo);
    const blocked = player.move(dt, wish, colliders);
    if (walkTarget && blocked) {
      blockedT += dt;
      if (blockedT > 0.45) {
        const pend = pendingEnter ? byId.get(pendingEnter) : null;
        walkTarget = null;
        runTo = false;
        if (pendingPortal && atPortal()) stepIn();
        else if (pend && Math.hypot(player.pos.x - pend.place.x, player.pos.z - pend.place.z) < pend.place.enterRange + 1.5) enter(pend.place.id);
        else if (pendingCast && !player.inWater) fishing?.cast();
        pendingEnter = null;
        pendingCast = false;
        pendingPortal = false;
      }
    } else blockedT = 0;

    // The hilltop under the ancient tree is a good place for a long, floaty jump.
    player.floaty = !!hill && Math.hypot(player.pos.x - hill.x, player.pos.z - hill.z) < 5.5;

    // A lost word within reach?
    if (!words.picking) {
      const w = words.near(player.pos.x, player.pos.z);
      if (w) pickUp(w.id);
    }

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
    // Right by the speedboat, its prompt is up instead of the pier's card; right beside someone out walking, theirs is.
    if (boating?.claims()) best = null;
    if (best && walkers.claims(player.pos.x, player.pos.z)) best = null;
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

    // In front of the portal, on foot and with no place's card up: its card opens.
    if (portal) {
      const was = nearPortal;
      nearPortal = !nearId && atPortal(2.4) && !player.inWater;
      if (!nearPortal && !atPortal(3)) portalDismissed = false;
      if (portalDismissed) nearPortal = false;
      if (nearPortal && !was) o.sound.play('chime');
    }

    // A game's prompt opens as you walk up to it (unless a place or the portal has your attention).
    if (games.near(player.pos.x, player.pos.z, !nearId && !nearPortal && !player.inWater && !words.picking)) o.sound.play('chime');
    // And someone out walking stops to say hello (unless a place, the portal or a game has your attention).
    if (walkers.near(player.pos.x, player.pos.z, !nearId && !nearPortal && !games.open && !player.inWater && !words.picking)) o.sound.play('chime');

    // Fishing: the prompt is up near the spot (unless the pier's own card is), and
    // stays up while the line is out. Walking off puts the rod away.
    if (fishing && fishSpot) {
      const px = player.pos.x;
      const pz = player.pos.z;
      const pierCard = nearId === fishSpot.place && nearId !== dismissedId;
      // Only from the pier: not from the water underneath it.
      fishOpen = !words.picking && (fishing.active || pendingCast || (fishing.inRange(px, pz) && !pierCard && !player.inWater));
      const far = Math.hypot(px - fishSpot.x, pz - fishSpot.z) > FISH_RANGE + 0.8;
      if ((fishing.active && far) || (!fishing.active && player.rodOut > 0 && !pendingCast && player.speed > 0.6)) fishing.cancel();
    }

    reportPresence(dt);
  };

  /** Standing in front of the portal's face (within `reach` of it). */
  function atPortal(reach = 1.6) {
    if (!portal) return false;
    const side = player.pos.x - portal.x;
    const front = player.pos.z - portal.z;
    return Math.abs(side) < 1.1 && front > 0.4 && front < reach;
  }

  // ---------- Presence ----------
  // Tell the store where you are (a few times a second, and whenever you
  // arrive somewhere) so the map and the text adventure pick up from here.
  let presenceT = 0;
  let lastAt: string | null | undefined;
  let lastX = NaN;
  let lastZ = NaN;
  const hereAt = () => {
    if (nearId) return nearId;
    return Math.hypot(player.pos.x - PLAZA.x, player.pos.z - PLAZA.z) < HUB.radius ? HUB.id : null;
  };
  function reportPresence(dt: number, force = false) {
    if (room) return;
    presenceT += dt;
    const at = hereAt();
    const x = player.pos.x;
    const z = player.pos.z;
    const moved = Math.hypot(x - lastX, z - lastZ) > 0.05 || Number.isNaN(lastX);
    if (!force && at === lastAt && (presenceT < 0.25 || !moved)) return;
    presenceT = 0;
    lastAt = at;
    lastX = x;
    lastZ = z;
    store.dispatch({ type: 'move', pos: { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }, at });
  }

  /** Everything that moves, one step on: the game, the explorer, the effects, the camera. */
  const roomWish = new Vector2();
  const simulate = (dt: number, raw: number) => {
    time += dt;
    uniforms.uTime.value = time;
    water.material.uniforms.uTime.value = time;

    if (state === 'intro') updateIntro(raw);
    else if (state === 'play') updatePlay(dt);
    else if (state === 'entering') player.move(dt, wish.set(0, 0), colliders);
    else if (state === 'portal') updatePortal(dt);
    // In a room (or on the way in or out of one): it runs where the house stood, and the island carries on round it.
    if (room) {
      roomWish.set(0, 0);
      if (state === 'inside') for (const k of keys) {
        const m = MOVE_KEYS[k];
        if (m) (roomWish.x += m[0]), (roomWish.y += m[1]);
      }
      room.night(night.dark);
      room.update(time, dt, roomWish, shiftHeld);
      if (state === 'door') updateDoor(dt);
    }

    // Stepping out of the portal on arrival: a pop, a spin and a hop onto the plaza.
    if (arriveT >= 0 && portal) {
      arriveT += dt;
      const k = clamp((arriveT - 0.15) / POP_OUT);
      player.warp = o.reducedMotion ? (k > 0 ? 1 : 0) : Math.max(0, easeOutBack(k, 2));
      player.spin = o.reducedMotion ? 0 : (1 - easeOutCubic(k)) * Math.PI * 2;
      portal.flare = 1 - k;
      if (k > 0 && arriveT - dt <= 0.15) {
        player.hop(o.reducedMotion ? 3 : 5.5);
        if (!o.reducedMotion) puffs.ring(player.pos.x, player.pos.y + 0.1, player.pos.z, 10, 2.4, '#ddd6fe', 0.2);
        o.sound.play('pop');
      }
      if (k >= 1) {
        arriveT = -1;
        player.warp = 1;
        player.spin = 0;
        portal.flare = 0;
      }
    }

    const hoverId = state === 'play' ? labelHover ?? labelFocus ?? pointerHover : null;
    for (const l of landmarks) {
      l.hover = l.place.id === hoverId || l.place.id === enteringId;
      l.update(time, dt, puffs, state !== 'intro');
    }

    player.update(time, dt);
    boating?.update(time, dt, night.amount, state);
    fishing?.update(time, dt);
    words.update(time, dt, camera, puffs, uniforms.uGrow.value);
    puffs.update(dt);
    ripples.update(time, dt, night.amount);
    buoys.update(time, uniforms.uGrow.value, night.amount);
    portal?.update(time, night.amount);
    games.update(time);
    // Out walking: they stop for you on the island, and keep out of a building's room while it's open.
    const openRoom = roomId ? byId.get(roomId)?.place : null;
    walkers.update(dt, state === 'play' ? { x: player.pos.x, z: player.pos.z } : null, openRoom ? { x: openRoom.x, z: openRoom.z, r: 11 } : null);
    gates.update(dt, o.reducedMotion);
    ambient.update(time);
    fossHill.update(o.reducedMotion ? 0 : time);

    // Night falls (or lifts). After the last word it waits for the card to close.
    if (nightHold && !words.picking && !dialog?.open) nightHold = false;
    if (!nightHold) night.set(nightWant);
    // The real clock (dusk, dawn, the commute) is checked once a second.
    const now = performance.now();
    if (now - clockAt > 1000) (clockAt = now), tickClock();
    night.update(time, dt, o.reducedMotion);
    // The train keeps going behind the intro too, so it's already on its way round when you look.
    commute.update(dt, commuting, player.pos);
    londonBus.update(dt, player.pos);

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
      // Afloat, follow the sea's level rather than every swell.
      camGoal.set(player.pos.x + player.vel.x * 0.18, Math.max(player.pos.y, 0) + 0.8, player.pos.z + player.vel.y * 0.18);
      if (near) camGoal.lerp(near.focus(focusV), 0.25);
      // Lean in on a scroll being unrolled, or on the float while fishing.
      let zoom = near ? 0.74 : 1;
      if (words.picking && !o.reducedMotion) (camGoal.lerp(words.focus, 0.5), (zoom = 0.62));
      else if (fishing?.active && !o.reducedMotion) (camGoal.lerp(fishing.float, 0.3), (zoom = 0.8));
      rig.target.x = damp(rig.target.x, camGoal.x, 3.2, dt);
      rig.target.y = damp(rig.target.y, camGoal.y, 3.2, dt);
      rig.target.z = damp(rig.target.z, camGoal.z, 3.2, dt);
      rig.dist = damp(rig.dist, baseDist * zoom * rig.zoom, 3, dt);
      rig.pitch = damp(rig.pitch, basePitch - (near ? 0.08 : 0), 2.2, dt);
      // Turned by the visitor: eased round (snapped, for reduced motion), plus a touch of parallax.
      const yawGoal = rig.turn + rig.parallax.x * 0.035;
      rig.yaw = o.reducedMotion ? yawGoal : damp(rig.yaw, yawGoal, turning || twist ? 14 : 4, dt);
      if (o.reducedMotion) rig.dist = baseDist * zoom * rig.zoom;
    } else if (state === 'boat' && boating) {
      boating.aim(rig, dt, camera.aspect, camera.fov);
    } else if (state === 'portal' && portal) {
      // Lean in on the swirl as you go through.
      rig.target.lerp(portal.middle, 1 - Math.exp(-dt * 4));
      rig.dist = damp(rig.dist, baseDist * 0.7, 3, dt);
    } else if (state === 'inside' && room && roomId) {
      // The whole room in the space the words leave, leaning a little toward wherever you are in it.
      const r = room;
      leanTo.set(r.player.pos.x * 0.18, 0, r.player.pos.z * 0.12).applyAxisAngle(UP, r.group.rotation.y).multiplyScalar(r.group.scale.x);
      if (o.reducedMotion) lean.copy(leanTo);
      else lean.set(damp(lean.x, leanTo.x, 3, dt), 0, damp(lean.z, leanTo.z, 3, dt));
      rigAt(roomPose(r, byId.get(roomId)!));
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
    focusShadows(dt);
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // A frame stamped before start() (a long first render) must not run time backwards.
    const raw = clamp((now - last) / 1000, 0, 0.1);
    const dt = Math.min(raw, 1 / 20);
    last = now;
    frames++;

    // Hover (mouse) via the hit volumes
    if (pointerMoved && pointerInside && state === 'play' && !touch) {
      const target = pickTarget();
      pointerHover = target && 'place' in target ? target.place : null;
      canvas.style.cursor = target || boating?.hovering(raycaster) ? 'pointer' : '';
      pointerMoved = false;
    }
    simulate(dt, raw);
    post.update({ dark: night.dark, inside: !!room || state === 'door', portrait: viewW < viewH }, dt);
    present(now);
    // Only judged while the island is out and moving: the intro and the doors have their own hitches.
    if (!quality.forced && post.level !== 'off' && (state === 'play' || state === 'boat') && frameWatch.add(raw)) {
      quality = stepDown(quality);
      post.set(quality.level, quality.effects);
    }

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

  /** Draw: the labels over the scene, then the scene. */
  const present = (now: number) => {
    const hoverId = state === 'play' ? labelHover ?? labelFocus ?? pointerHover : null;

    // Labels (kept out of the HUD's way, re-measured a few times a second
    // so the hint fading in or the card folding away are seen promptly)
    if (now - avoidAt > 250) {
      avoidAt = now;
      avoid.length = 0;
      o.hud.querySelectorAll<HTMLElement>('.isl-top > *, .isl-card, .isl-sound-fab, .isl-hoard-fab, .isl-hint').forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width > 0 && cs.display !== 'none' && +cs.opacity > 0.05) avoid.push({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
      });
    }
    let promptRect: Rect | null = null;
    if (prompt && fishing && fishSpot && fishAnchor) {
      prompt.show(fishOpen && state === 'play');
      if (fishOpen) {
        prompt.set(promptText(fishing.phase, fishing.tooSoon));
        promptRect = prompt.place(camera, fishAnchor, viewW, viewH, avoid);
      }
    }
    avoidAll.length = 0;
    avoidAll.push(...avoid);
    // Idle labels also keep clear of the explorer standing under the prompt.
    if (promptRect) avoidAll.push(promptRect, { l: promptRect.l, t: promptRect.b, r: promptRect.r, b: promptRect.b + 90 });
    const boatRect = boating?.present(camera, viewW, viewH, avoid);
    if (boatRect) avoidAll.push(boatRect);
    avoidAll.push(...games.place(camera, viewW, viewH, avoid, state === 'play'));
    avoidAll.push(...walkers.place(camera, viewW, viewH, avoid, state === 'play'));
    labels.update(camera, anchors, viewW, viewH, {
      avoid: avoidAll,
      visible: state === 'play',
      nearId: nearId && nearId !== dismissedId ? nearId : nearPortal ? 'portal' : null,
      hoverId,
      focusId: labelFocus,
      enteringId,
      dist: (id) => {
        const l = byId.get(id);
        const p = l ? l.place : portal!;
        return Math.hypot(rig.target.x - p.x, rig.target.z - p.z);
      },
    });

    post.render();
  };

  // Inside a building in another view: already in here, with the house open round you.
  if (startInside) cutInside(startInside, true);

  // Compile shaders before the first visible frame to avoid a hitch, including
  // the things that only show up later (night, the unrolling scroll, the catch,
  // and the room's lamp, if it's already lit).
  const later = [night.group, ...words.group.children, ...(fishing?.group.children ?? [])].filter((x) => !x.visible);
  later.forEach((x) => (x.visible = true));
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* fall back to compiling on first render */
  }
  later.forEach((x) => (x.visible = false));
  warmed = !!room;
  // Drawn through the effects too, so their shaders compile now rather than on the first frame you see.
  post.update({ dark: night.dark, inside: !!room, portrait: viewW < viewH }, 1);
  post.render();
  o.onReady(arriving ? toScreen(portal!.middle) : undefined);

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    frameWatch.reset();
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

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    room?.dispose();
    room = null;
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    stage.removeEventListener('wheel', onWheel);
    stage.removeEventListener('gesturestart', onGestureStart);
    stage.removeEventListener('gesturechange', onGestureChange);
    stage.removeEventListener('gestureend', onGestureEnd);
    canvas.removeEventListener('contextmenu', onContextMenu);
    unhold();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('webglcontextlost', onLost);
    o.labelsHost.removeEventListener('focusin', onFocusIn);
    // Leave the store knowing exactly where you were standing.
    if (state === 'play' && !room) reportPresence(0, true);
    unsubscribe();
    labels.dispose();
    prompt?.dispose();
    games.dispose();
    walkers.dispose();
    gates.dispose();
    bridges.dispose();
    portal?.dispose();
    words.dispose();
    fishing?.dispose();
    boating?.dispose();
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
    post.dispose();
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
      player: () => ({
        x: player.pos.x,
        z: player.pos.z,
        y: player.root.position.y,
        airborne: player.airborne,
        water: player.water,
        doubleJumped: player.doubleJumped,
        speed: player.speed,
        flip: player.flipAngle,
        sprinting: player.sprinting,
        warp: player.warp,
      }),
      sprint: (on: boolean) => void (shiftHeld = on),
      portal: () => (portal ? { near: nearPortal, screen: toScreen(portal.middle) } : null),
      clickPortal: () => activatePortal(),
      portalled: () => portalled,
      sea: (x?: number, z?: number) => {
        const px = x ?? player.pos.x;
        const pz = z ?? player.pos.z;
        return { depth: Math.max(0, -heightAt(px, pz)), room: swimRoom(px, pz), swimmable: isSwimmable(px, pz), walkable: isWalkable(px, pz), surface: waveHeight(px, pz, time) };
      },
      playerScreen: () => {
        const v = player.head(new Vector3()).project(camera);
        return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
      },
      render: () => present(performance.now()),
      tick: (seconds: number) => {
        for (let t = 0; t < seconds - 1e-6; t += 1 / 60) simulate(1 / 60, 1 / 60);
      },
      walkTo: (x: number, z: number) => {
        const p = toShore(new Vector2(x, z));
        if (p) (walkTarget = p), (pendingEnter = null);
        return p ? { x: p.x, z: p.y } : null;
      },
      near: () => nearId,
      frames: () => frames,
      places: () => PLACES.map((p) => ({ id: p.id, x: p.x, z: p.z, stand: p.stand })),
      /** Look at (x, z) from `dist` away (for still shots: pause() first, then render()). */
      look: (x: number, z: number, dist = 70, pitch = 1.0, yaw = 0, y = 0.5) => {
        rig.target.set(x, y, z);
        rig.dist = dist;
        rig.pitch = pitch;
        rig.yaw = yaw;
        placeCamera(rig.target, dist, pitch, yaw);
      },
      teleport: (x: number, z: number) => {
        player.place(x, z, 0);
        walkTarget = null;
        rig.target.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
      },
      words: () =>
        WORDS.map((w) => {
          const v = new Vector3(w.x, groundAt(w.x, w.z) + 0.15, w.z).project(camera);
          return { id: w.id, x: w.x, z: w.z, shown: !store.has(w.id), screen: { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH } };
        }),
      camera: () => ({ position: camera.position.toArray(), target: rig.target.toArray(), dist: rig.dist, pitch: rig.pitch, yaw: rig.yaw, turn: rig.turn, zoom: rig.zoom }),
      turn: (a: number) => turnBy(a),
      zoom: (k: number) => zoomBy(k),
      fishing: () => fishing?.phase ?? null,
      fish: () => void fishAction(),
      night: () => night.amount,
      fx: () => ({ level: post.level, effects: post.effects }),
      setFx: (level, effects) => {
        quality = { level, effects: level === 'off' ? [] : effects ?? ['bloom', 'tilt', 'grade'], forced: true };
        post.set(quality.level, quality.effects);
      },
      inside: () => (room && roomId && state === 'inside' ? { at: roomId, x: room.at.x, z: room.at.z, within: room.within?.id ?? null, busy: o.ui.room.busy } : null),
      approach: (id: string) => room?.go(id) ?? false,
      roomScreen: (x: number, z: number) => room?.screen(x, z) ?? null,
      enter: (id: string) => {
        if (state !== 'play' || !placeOf(id)?.interior) return false;
        cutInside(id, false);
        return true;
      },
      boat: boating?.debug ?? null,
      games: () => games.list(),
      gates: () => gates.list(),
      play: (id: GameId) => playAt(id),
      wanderers: () => walkers.list(),
      talk: (id: string) => talkTo(id),
      clock: () => ({ dark: night.dark, commuting, train: commute.state() }),
      bus: () => londonBus.state(),
      screen: (id: string) => {
        const l = byId.get(id);
        if (!l) return null;
        const v = l.focus(new Vector3()).project(camera);
        return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
      },
    },
  };
}
