// Walking about inside a building, on the map: the explorer in the room,
// the islanders who live there turning to look at you, and the way into a
// conversation. Arrow keys or WASD walk; a tap walks you over to someone or
// something and starts talking (or looking); the doorway, Escape or the
// Leave button take you back out. The words themselves are room.ts's (the
// shared box), so this only says who's within reach and who's being talked to.

import { BOX_SIDE, boxDocksRight, type RoomTarget, type RoomUI } from '../room';
import type { Spot } from '../roomPlan';
import type { SoundName } from '../types';
import type { ExplorerSprites, Facing } from './explorer';
import { facingFor } from './explorer';
import type { MapRoom } from './room';

/** Room units per second, walking; and how much faster running is. */
const SPEED = 3.4;
const RUN = 1.6;
/** Room units walked per step of the walk cycle. */
const STRIDE = 0.42;
/** CSS pixels kept clear of the HUD and the room's bar along the top, and along the bottom. */
const TOP = 132;
const BOTTOM = 20;

export interface Inside {
  readonly room: MapRoom;
  readonly pos: { x: number; z: number };
  readonly facing: Facing;
  update(dt: number, held: { x: number; z: number }, running: boolean): void;
  /** Draw the room into the screen canvas (device pixels), centred and as big as fits. */
  draw(g: CanvasRenderingContext2D, cw: number, ch: number, dpr: number, time: number, night: boolean): void;
  /** A tap or click at (x, y) in CSS pixels. */
  tap(x: number, y: number): void;
  /** Whether (x, y) is over someone or something (for the pointer cursor). */
  over(x: number, y: number): boolean;
  /** Stop following a tap (the keys took over). */
  halt(): void;
  hop(): void;
  /** A room point in CSS pixels. */
  screen(x: number, z: number): { x: number; y: number };
  /** Someone or something has (or no longer has) the visitor's attention. */
  engage(t: RoomTarget | null): void;
  /** Walk to a spot and talk to it or look at it, as a tap would. For tests and the debug handle. */
  go(id: string): boolean;
  readonly within: Spot | null;
}

export function createInside(o: {
  room: MapRoom;
  hero: ExplorerSprites;
  ui: RoomUI;
  motion: boolean;
  sound: { play(name: SoundName): void };
  /** Walked out of the door. */
  leave(): void;
}): Inside {
  const { room, hero, ui, motion } = o;
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
  let left = false;

  const buf = document.createElement('canvas');
  buf.width = room.w;
  buf.height = room.h;
  const b = buf.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  // Where the room is on screen: set by draw(), used by taps.
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dprNow = 1;

  const toRoom = (x: number, y: number) => ({ px: Math.floor((x * dprNow - ox) / S), py: Math.floor((y * dprNow - oy) / S) });

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
    if (spot.kind === 'person') ui.talk(spot.id);
    else ui.inspect(spot.id);
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
    if (ui.busy) {
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
        if (Math.floor(walked / STRIDE) !== s0 && Math.floor(walked / STRIDE) % 4 === 1 && motion) o.sound.play('step');
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
      if (w) o.sound.play('pop');
    }
    ui.near(within ? { kind: within.kind, id: within.id } : null);
  }

  function draw(g: CanvasRenderingContext2D, cw: number, ch: number, dpr: number, time: number, night: boolean) {
    dprNow = dpr;
    now = time;
    // The room fits in what the HUD and the conversation box leave: beside the
    // box on a wide screen, above it (top-aligned) on a narrow one.
    const side = boxDocksRight(cw / dpr, ch / dpr);
    const availW = cw - (side ? BOX_SIDE : 0) * dpr;
    // Below the box (a bottom sheet up to 46% of the screen), keep the room clear of it.
    const under = side ? BOTTOM * dpr : Math.max(BOTTOM * dpr, ch * 0.46 + 8 * dpr);
    const availH = Math.max(room.h, ch - TOP * dpr - under);
    S = Math.max(1, Math.floor(Math.min((availW - 24 * dpr) / room.w, availH / room.h)));
    ox = Math.floor((availW - room.w * S) / 2);
    oy = Math.floor(TOP * dpr + (availH - room.h * S) / 2);
    if (oy + room.h * S > ch) oy = Math.max(0, ch - room.h * S);

    b.drawImage(night ? room.bg.night : room.bg.day, 0, 0);
    room.animate(b, time, motion);

    // Who and what stands on the floor, back to front, with the explorer among them.
    const order = room.sprites.map((s) => ({ z: s.spot.z + (s.spot.kind === 'person' ? 0 : s.spot.hd), s }));
    order.push({ z: pos.z + 0.01, s: null as never });
    order.sort((a, c) => a.z - c.z);
    for (const it of order) {
      if (!it.s) {
        drawHero(night);
        continue;
      }
      const s = it.s;
      if (s.islander) {
        // Islanders face down until you're near, then look at you (and at you only, while you talk).
        const talkingTo = engaged?.kind === 'person' && engaged.id === s.spot.id;
        const near = Math.hypot(pos.x - s.spot.x, pos.z - s.spot.z) < 2.4;
        const glance = motion && Math.floor(time / 3 + s.spot.x) % 4 === 3 ? (s.spot.x > 0 ? 'left' : 'right') : 'down';
        s.facing = talkingTo || near ? facingFor(pos.x - s.spot.x, pos.z - s.spot.z, s.facing) : glance;
        const frames = night ? s.islander.framesNight[s.facing] : s.islander.frames[s.facing];
        const step = motion && Math.floor(time * 1.4 + s.spot.x * 3) % 3 === 2 ? 4 : 0;
        const img = frames[step];
        const x = room.px(s.spot.x);
        const y = room.py(s.spot.z);
        b.fillStyle = 'rgba(42,29,16,0.22)';
        b.fillRect(x - 5, y - 1, 10, 2);
        // A little hop when they start talking.
        const lift = talkingTo && motion && time - engagedAt < 0.3 ? 2 : 0;
        b.drawImage(img, x - (s.islander.w >> 1), y - s.islander.h + 1 - lift);
      } else if (s.sprite) {
        b.drawImage(night ? s.sprite.night : s.sprite.day, room.px(s.spot.x) - s.sprite.ax, room.py(s.spot.z + s.spot.hd) - s.sprite.ay);
      }
    }

    // A bobbing marker over whoever or whatever is within reach.
    const mark = !ui.busy ? within : null;
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

    g.fillStyle = night ? '#100c14' : '#21170f';
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = false;
    g.drawImage(buf, 0, 0, room.w, room.h, ox, oy, room.w * S, room.h * S);
  }

  const spriteH = (s: Spot) => room.sprites.find((x) => x.spot === s)?.sprite?.h ?? 20;

  function drawHero(night: boolean) {
    const x = room.px(pos.x);
    const y = room.py(pos.z);
    const frames = night ? hero.framesNight[facing] : hero.frames[facing];
    let step = moving ? Math.floor(walked / STRIDE) % 4 : 0;
    if (!moving && motion && idleT > 0.4 && Math.floor(now * 1.6) % 3 === 2) step = 4;
    const lift = hopT >= 0 ? Math.round(Math.sin((hopT / 0.36) * Math.PI) * 5) : 0;
    b.fillStyle = 'rgba(42,29,16,0.22)';
    b.fillRect(x - 5, y - 1, 10, 2);
    b.drawImage(frames[step], x - (hero.w >> 1), y - hero.h + 1 - lift);
  }

  let engagedAt = -1;
  let now = 0;

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
    tap(x, y) {
      if (left || ui.busy) return;
      const { px, py } = toRoom(x, y);
      const hit = room.hit(px, py);
      if (hit) {
        if (aim(hit)) o.sound.play('pop');
        return;
      }
      const to = { x: room.ux(px + 0.5), z: room.uz(py + 0.5) };
      if (to.x < -plan.w / 2 - 0.5 || to.x > plan.w / 2 + 0.5 || to.z < -plan.d / 2 - 0.5 || to.z > plan.d / 2 + 0.8) return;
      const p = plan.path(pos.x, pos.z, to.x, to.z);
      if (p) {
        path = p;
        goal = null;
        o.sound.play('tap');
      }
    },
    over(x, y) {
      const { px, py } = toRoom(x, y);
      return !!room.hit(px, py);
    },
    halt() {
      path = null;
      goal = null;
    },
    hop() {
      if (hopT < 0 && !ui.busy) {
        hopT = 0;
        o.sound.play('jump');
      }
    },
    screen(x, z) {
      return { x: (ox + (room.px(x) + 0.5) * S) / dprNow, y: (oy + room.py(z) * S) / dprNow };
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
