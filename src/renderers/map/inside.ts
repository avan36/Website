// Walking about inside a building, in pixels: the room ./room.ts paints, the
// explorer in it, the islanders who live there turning to look at you, and
// the way into a conversation. It's a piece any page can host. It has no
// loop, no clock and no screen of its own: the host calls update() every
// frame with the keys held, and draw() with where the room should go, into
// any 2D canvas, at any position and size. The words are someone else's
// (on this site the shared box in ../room.ts) behind a small `Talk`
// interface, so this only says who's within reach and who's being talked to.
//
//   const inside = createInside({ room: paintRoom(place), talk, leave });
//   inside.update(dt, { x, z }, running);                // every frame
//   inside.draw(c, { x: 40, y: 80, scale: 4 }, { time, night });
//   inside.tap(px, py, frame);                           // a click, in the frame's units
//
// A frame is where the room's top-left pixel lands and how many units one of
// its pixels spans. A whole scale at a whole position keeps it crisp;
// fitFrame() finds the biggest whole scale that fits a rect. The map draws
// it into its own buffer at a scale of 1, so the room's pixels are the
// island's, and zooms the lot. With `clip` only part of the room is drawn,
// walls and all round the cut: openRect() grows one rect into another, for a
// room opening up out of something smaller (on the map, its building).
//
// Arrows or WASD walk (the host passes them in), hop() hops, a tap walks you
// over to someone or something and starts talking (or looking), and walking
// out of the doorway calls leave(). The room is lamp-lit: at night only the
// windows and the doorway go dark.

import type { RoomTarget } from '../room';
import type { Spot } from '../roomPlan';
import type { SoundName } from '../types';
import { facingFor, paintExplorer, type ExplorerSprites, type Facing } from './explorer';
import { HEX } from './palette';
import type { MapRoom } from './room';

/** Room units per second, walking; and how much faster running is. */
const SPEED = 3.4;
const RUN = 1.6;
/** Room units walked per step of the walk cycle. */
const STRIDE = 0.42;
/** How thick the walls are drawn round a part-open room, in room pixels (the side walls' thickness). */
const RIM = 6;

/** Where a room goes: its top-left pixel at (x, y), each of its pixels `scale` units across. */
export interface Frame {
  x: number;
  y: number;
  scale: number;
}

/** A rect: in room pixels for a clip, or in whatever units the host works in. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whoever does the talking: the shared conversation box on this site (RoomUI fits). */
export interface Talk {
  /** A conversation (or a look at something) is open: the explorer stands still. */
  readonly busy: boolean;
  talk(personId: string): void;
  inspect(thingId: string): void;
  /** What's within reach now, for a nudge. */
  near(t: RoomTarget | null): void;
}

export interface Inside {
  readonly room: MapRoom;
  /** Where the explorer stands, in room units. */
  readonly pos: { x: number; z: number };
  readonly facing: Facing;
  /** Whoever or whatever is within reach. */
  readonly within: Spot | null;
  /** A step of the game: walk by the keys held (x, z from -1 to 1), or along a tap's path. */
  update(dt: number, held: { x: number; z: number }, running: boolean): void;
  /**
   * Draw the room at `at`. `clip` (room pixels) draws only that part of it,
   * with walls round the cut; `hero: false` leaves the explorer out (and the
   * marker over what's in reach), while the host shows them coming or going.
   */
  draw(c: CanvasRenderingContext2D, at: Frame, o: { time: number; night: boolean; clip?: Box; hero?: boolean }): void;
  /** A tap or click at (x, y), in the same units as `at`. */
  tap(x: number, y: number, at: Frame): void;
  /** Whether (x, y) is over someone or something (for the pointer cursor). */
  over(x: number, y: number, at: Frame): boolean;
  /** Where a room point is, in the units of `at`. */
  point(x: number, z: number, at: Frame): { x: number; y: number };
  /** Stop following a tap (the keys took over). */
  halt(): void;
  hop(): void;
  /** Someone or something has (or no longer has) the visitor's attention. */
  engage(t: RoomTarget | null): void;
  /** Walk to a spot and talk to it or look at it, as a tap would. For tests and debug handles. */
  go(id: string): boolean;
}

/** The biggest whole scale at which a w by h room fits in `r`, centred on whole units. */
export function fitFrame(w: number, h: number, r: Box): Frame {
  const scale = Math.max(1, Math.floor(Math.min(r.w / w, r.h / h)));
  return { x: Math.floor(r.x + (r.w - w * scale) / 2), y: Math.floor(r.y + (r.h - h * scale) / 2), scale };
}

/** Part way (k from 0 to 1) from one rect to another, edge by edge, on whole pixels. */
export function openRect(k: number, from: Box, to: Box): Box {
  const t = k < 0 ? 0 : k > 1 ? 1 : k;
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const x = lerp(from.x, to.x);
  const y = lerp(from.y, to.y);
  return { x, y, w: lerp(from.x + from.w, to.x + to.w) - x, h: lerp(from.y + from.h, to.y + to.h) - y };
}

export function createInside(o: {
  room: MapRoom;
  /** The explorer's sprites (in whatever they're wearing); plain if left out. */
  hero?: ExplorerSprites;
  talk: Talk;
  /** False for reduced motion: no glances, no bobbing, no idle breathing. */
  motion?: boolean;
  sound?: { play(name: SoundName): void };
  /** Walked out of the door. */
  leave(): void;
}): Inside {
  const { room, talk } = o;
  const hero = o.hero ?? paintExplorer();
  const motion = o.motion ?? true;
  const play = (name: SoundName) => o.sound?.play(name);
  const plan = room.plan;
  const pos = { ...plan.entry };
  let facing: Facing = 'up';
  let walked = 0;
  let moving = false;
  let idleT = 0;
  let hopT = -1;
  let path: { x: number; z: number }[] | null = null;
  /** Where a tap is taking you: to someone, something, or out of the door. */
  let goal: Spot | 'door' | null = null;
  let stuckT = 0;
  let within: Spot | null = null;
  let engaged: RoomTarget | null = null;
  let engagedAt = -1;
  let now = 0;
  let left = false;

  // The room is drawn here at its own pixels, then copied to wherever the host says.
  const buf = document.createElement('canvas');
  buf.width = room.w;
  buf.height = room.h;
  const b = buf.getContext('2d')!;
  b.imageSmoothingEnabled = false;

  /** A point in the frame's units, as a room pixel. */
  const toRoom = (x: number, y: number, at: Frame) => ({ px: Math.floor((x - at.x) / at.scale), py: Math.floor((y - at.y) / at.scale) });

  function aim(spot: Spot | 'door') {
    const to = spot === 'door' ? { x: 0, z: plan.d / 2 + 0.35 } : plan.approach(spot, pos.x, pos.z);
    if (!to) return false;
    // Already there: no walking needed.
    if (spot !== 'door' && plan.within(pos.x, pos.z) === spot) {
      path = null;
      goal = null;
      act(spot);
      return true;
    }
    const p = plan.path(pos.x, pos.z, to.x, to.z) ?? (spot === 'door' ? [to] : null);
    if (!p) return false;
    path = p;
    goal = spot;
    stuckT = 0;
    return true;
  }

  function act(spot: Spot) {
    face(spot.x, spot.z);
    if (spot.kind === 'person') talk.talk(spot.id);
    else talk.inspect(spot.id);
  }

  function face(x: number, z: number) {
    facing = facingFor(x - pos.x, z - pos.z, facing);
  }

  function arrive() {
    const g = goal;
    path = null;
    goal = null;
    if (g === 'door') return out();
    if (g && plan.within(pos.x, pos.z) === g) act(g);
    else if (g && plan.reach(g, pos.x, pos.z) < 1.6) act(g);
  }

  function out() {
    if (left) return;
    left = true;
    o.leave();
  }

  function update(dt: number, held: { x: number; z: number }, running: boolean) {
    if (hopT >= 0 && (hopT += dt) > 0.36) hopT = -1;
    moving = false;
    if (left) return;
    if (talk.busy) {
      // Mid-conversation: stand still, facing whoever (or whatever) it is.
      path = null;
      idleT += dt;
      return;
    }
    let wx = held.x;
    let wz = held.z;
    const speed = SPEED * (running ? RUN : 1);
    let step = speed * dt;
    if (wx || wz) {
      path = null;
      goal = null;
      const l = Math.hypot(wx, wz);
      wx /= l;
      wz /= l;
    } else if (path) {
      const p = path[0];
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < 0.06) {
        path.shift();
        if (!path.length) arrive();
      } else {
        wx = (p.x - pos.x) / d;
        wz = (p.z - pos.z) / d;
        step = Math.min(step, d);
      }
    }
    if (wx || wz) {
      const before = { x: pos.x, z: pos.z };
      const next = plan.slide(pos.x, pos.z, wx * step, wz * step);
      pos.x = next.x;
      pos.z = next.z;
      const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
      if (moved > 1e-4) {
        moving = true;
        const s0 = Math.floor(walked / STRIDE);
        walked += moved;
        if (Math.floor(walked / STRIDE) !== s0 && Math.floor(walked / STRIDE) % 4 === 1 && motion) play('step');
        facing = facingFor(wx, wz, facing);
        stuckT = 0;
      } else if (path) {
        // Bumped into something on the way: try the next point, or give up there.
        stuckT += dt;
        if (stuckT > 0.3) {
          path.shift();
          stuckT = 0;
          if (!path.length) arrive();
        }
      }
    }
    idleT = moving ? 0 : idleT + dt;
    // Out of the door.
    if (plan.atDoor(pos.x, pos.z) && (held.z > 0 || goal === 'door')) return out();
    const w = plan.within(pos.x, pos.z);
    if (w !== within) {
      within = w;
      if (w) play('pop');
    }
    talk.near(within ? { kind: within.kind, id: within.id } : null);
  }

  function draw(c: CanvasRenderingContext2D, at: Frame, d: { time: number; night: boolean; clip?: Box; hero?: boolean }) {
    const { time, night } = d;
    const showHero = d.hero ?? true;
    now = time;
    b.drawImage(night ? room.bg.night : room.bg.day, 0, 0);
    room.animate(b, time, motion);

    // Who and what stands on the floor, back to front, with the explorer among them.
    const order = room.sprites.map((s) => ({ z: s.spot.z + (s.spot.kind === 'person' ? 0 : s.spot.hd), s }));
    if (showHero) order.push({ z: pos.z + 0.01, s: null as never });
    order.sort((a, c) => a.z - c.z);
    for (const it of order) {
      if (!it.s) {
        drawHero();
        continue;
      }
      const s = it.s;
      if (s.islander) {
        // Islanders face down until you're near, then look at you (and at you only, while you talk).
        const talkingTo = engaged?.kind === 'person' && engaged.id === s.spot.id;
        const near = showHero && Math.hypot(pos.x - s.spot.x, pos.z - s.spot.z) < 2.4;
        const glance = motion && Math.floor(time / 3 + s.spot.x) % 4 === 3 ? (s.spot.x > 0 ? 'left' : 'right') : 'down';
        s.facing = talkingTo || near ? facingFor(pos.x - s.spot.x, pos.z - s.spot.z, s.facing) : glance;
        const step = motion && Math.floor(time * 1.4 + s.spot.x * 3) % 3 === 2 ? 4 : 0;
        const img = s.islander.frames[s.facing][step];
        const x = room.px(s.spot.x);
        const y = room.py(s.spot.z);
        b.fillStyle = 'rgba(42,29,16,0.22)';
        b.fillRect(x - 5, y - 1, 10, 2);
        // A little hop when they start talking.
        const lift = talkingTo && motion && time - engagedAt < 0.3 ? 2 : 0;
        b.drawImage(img, x - (s.islander.w >> 1), y - s.islander.h + 1 - lift);
      } else if (s.sprite) {
        b.drawImage(s.sprite.day, room.px(s.spot.x) - s.sprite.ax, room.py(s.spot.z + s.spot.hd) - s.sprite.ay);
      }
    }

    // A bobbing marker over whoever or whatever is within reach.
    const mark = showHero && !talk.busy ? within : null;
    if (mark) {
      const x = room.px(mark.x);
      const top = mark.kind === 'person' ? room.py(mark.z) - 22 : mark.hang ? 2 : room.py(mark.z + mark.hd) - spriteH(mark) - 6;
      const bob = motion ? Math.round(Math.sin(time * 5) * 1.5) : 0;
      b.fillStyle = '#3a2a24';
      b.fillRect(x - 3, top + bob - 1, 7, 1);
      b.fillRect(x - 2, top + bob, 5, 2);
      b.fillRect(x - 1, top + bob + 2, 3, 1);
      b.fillStyle = mark.color ?? room.place.color;
      b.fillRect(x - 2, top + bob, 5, 1);
      b.fillRect(x - 1, top + bob + 1, 3, 1);
    }

    // Onto the host's canvas: all of it, or the part in the clip with walls round the cut.
    const full = { x: 0, y: 0, w: room.w, h: room.h };
    const r = d.clip ? clipTo(d.clip, full) : full;
    if (r.w <= 0 || r.h <= 0) return;
    const smooth = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    const s = at.scale;
    c.drawImage(buf, r.x, r.y, r.w, r.h, at.x + r.x * s, at.y + r.y * s, r.w * s, r.h * s);
    if (r.x > 0 || r.y > 0 || r.x + r.w < room.w) rim(c, at, r);
    c.imageSmoothingEnabled = smooth;
  }

  /**
   * Walls round a part-open room: the tops of the side walls (and the back
   * one) along the cut, as thick as the real ones, so it reads as the same
   * room with its walls not yet all the way out.
   */
  function rim(c: CanvasRenderingContext2D, at: Frame, r: Box) {
    const s = at.scale;
    const t = Math.min(RIM, r.w >> 2, r.h >> 2);
    if (t < 2) return;
    const box = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(at.x + x * s, at.y + y * s, w * s, h * s);
    };
    const { x, y, w, h } = r;
    if (x > 0) (box(x, y, t, h, room.rim.top), box(x + t - 1, y + t - 1, 1, h - t + 1, room.rim.edge), box(x, y, 1, h, HEX.ink));
    if (x + w < room.w) (box(x + w - t, y, t, h, room.rim.top), box(x + w - t, y + t - 1, 1, h - t + 1, room.rim.edge), box(x + w - 1, y, 1, h, HEX.ink));
    if (y > 0) (box(x, y, w, t, room.rim.top), box(x + (x > 0 ? t - 1 : 0), y + t - 1, w - (x > 0 ? t - 1 : 0) - (x + w < room.w ? t - 1 : 0), 1, room.rim.edge), box(x, y, w, 1, HEX.ink));
  }

  const spriteH = (s: Spot) => room.sprites.find((x) => x.spot === s)?.sprite?.h ?? 20;

  function drawHero() {
    const x = room.px(pos.x);
    const y = room.py(pos.z);
    let step = moving ? Math.floor(walked / STRIDE) % 4 : 0;
    if (!moving && motion && idleT > 0.4 && Math.floor(now * 1.6) % 3 === 2) step = 4;
    const lift = hopT >= 0 ? Math.round(Math.sin((hopT / 0.36) * Math.PI) * 5) : 0;
    b.fillStyle = 'rgba(42,29,16,0.22)';
    b.fillRect(x - 5, y - 1, 10, 2);
    b.drawImage(hero.frames[facing][step], x - (hero.w >> 1), y - hero.h + 1 - lift);
  }

  return {
    room,
    pos,
    get facing() {
      return facing;
    },
    get within() {
      return within;
    },
    update,
    draw,
    tap(x, y, at) {
      if (left || talk.busy) return;
      const { px, py } = toRoom(x, y, at);
      const hit = room.hit(px, py);
      if (hit) {
        if (aim(hit)) play('pop');
        return;
      }
      const to = { x: room.ux(px + 0.5), z: room.uz(py + 0.5) };
      if (to.x < -plan.w / 2 - 0.5 || to.x > plan.w / 2 + 0.5 || to.z < -plan.d / 2 - 0.5 || to.z > plan.d / 2 + 0.8) return;
      const p = plan.path(pos.x, pos.z, to.x, to.z);
      if (p) {
        path = p;
        goal = null;
        play('tap');
      }
    },
    over(x, y, at) {
      const { px, py } = toRoom(x, y, at);
      return !!room.hit(px, py);
    },
    point(x, z, at) {
      return { x: at.x + (room.px(x) + 0.5) * at.scale, y: at.y + room.py(z) * at.scale };
    },
    halt() {
      path = null;
      goal = null;
    },
    hop() {
      if (hopT < 0 && !talk.busy) {
        hopT = 0;
        play('jump');
      }
    },
    engage(t) {
      engaged = t;
      engagedAt = now;
      if (t) {
        const s = plan.spots.find((x) => x.id === t.id);
        if (s) face(s.x, s.z);
      }
    },
    go(id) {
      const s = plan.spots.find((x) => x.id === id);
      return s ? aim(s) : false;
    },
  };
}

/** The part of `a` inside `b`. */
function clipTo(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
}
