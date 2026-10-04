// Crab boop, on the beach by the bottle. Nine holes in the sand; crabs pop
// up and wait a moment before scuttling off. Boop one (tap it, or press its
// key) and it ducks back down. Thirty seconds, and the crabs get quicker the
// whole way. Boops in a row are worth more; a gold crab is worth three; a
// sleepy starfish costs you, and breaks the streak.

import { backdrop, clamp, drawFloaters, easeOut, lerp, roundRect, stepFloaters, type Floater, type GameEnv, type Point, type Round } from './round';

export const ROUND = 30;
export const HOLES = 9;
/** How long a booped crab or a crab going home takes to disappear. */
const HIDE = 0.16;
const RISE = 0.12;

export type Kind = 'crab' | 'gold' | 'star';
export type Critter = { kind: Kind; age: number; up: number; booped: boolean };

/** Keys for the holes, in reading order: 1 to 9, and the letter block Q W E / A S D / Z X C. */
export const HOLE_KEYS: Record<string, number> = {};
['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((k, i) => ((HOLE_KEYS[`Digit${k}`] = i), (HOLE_KEYS[`Numpad${k}`] = i)));
['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC'].forEach((k, i) => (HOLE_KEYS[k] = i));
// The number pad is laid out bottom-up: 7 8 9 on top.
['7', '8', '9', '4', '5', '6', '1', '2', '3'].forEach((k, i) => (HOLE_KEYS[`Numpad${k}`] = i));

/** How hard it is `elapsed` seconds in: how often a crab appears, how long it stays up, how many at once. */
export function pace(elapsed: number) {
  const k = clamp(elapsed / ROUND);
  return { every: lerp(0.85, 0.33, k), up: lerp(1.35, 0.6, k), most: k < 0.25 ? 2 : k < 0.6 ? 3 : 4 };
}

/** What a boop is worth: one, plus one more for every five in a row; a gold crab triples it; a starfish costs three. */
export function boopPoints(kind: Kind, streak: number) {
  if (kind === 'star') return -3;
  const each = 1 + Math.floor(streak / 5);
  return kind === 'gold' ? each * 3 : each;
}

/** The rules, with no clock or paint: step it, boop holes, read the score. */
export class CrabField {
  holes: (Critter | null)[] = Array(HOLES).fill(null);
  elapsed = 0;
  score = 0;
  streak = 0;
  best = 0;
  boops = 0;
  private wait = 0.5;
  constructor(private random: () => number) {}

  get over() {
    return this.elapsed >= ROUND;
  }

  /** Move time on. Returns what happened: who appeared, and who got away. */
  step(dt: number) {
    const events: { type: 'up' | 'away'; hole: number; kind: Kind }[] = [];
    if (this.over) return events;
    this.elapsed = Math.min(ROUND, this.elapsed + dt);
    this.holes.forEach((c, i) => {
      if (!c) return;
      c.age += dt;
      if (c.booped ? c.age > HIDE : c.age > c.up + HIDE) {
        // A crab that went home without a boop breaks the streak; a starfish is just gone.
        if (!c.booped && c.kind !== 'star') (this.streak = 0), events.push({ type: 'away', hole: i, kind: c.kind });
        this.holes[i] = null;
      }
    });
    const p = pace(this.elapsed);
    this.wait -= dt;
    const showing = this.holes.filter((c) => c && !c.booped).length;
    if (this.wait <= 0 && showing < p.most && this.elapsed < ROUND - 0.4) {
      const free = this.holes.flatMap((c, i) => (c ? [] : [i]));
      if (free.length) {
        const hole = free[Math.floor(this.random() * free.length) % free.length];
        const roll = this.random();
        const kind: Kind = roll < 0.08 ? 'gold' : roll < 0.2 && this.elapsed > 4 ? 'star' : 'crab';
        this.holes[hole] = { kind, age: 0, up: kind === 'gold' ? p.up * 0.8 : p.up, booped: false };
        events.push({ type: 'up', hole, kind });
      }
      this.wait = p.every * (0.75 + this.random() * 0.5);
    }
    return events;
  }

  /** Boop a hole. Returns the points it scored (0 for an empty hole or one already booped). */
  boop(hole: number): { points: number; kind: Kind } | null {
    const c = this.holes[hole];
    if (this.over || !c || c.booped || c.age > c.up + HIDE * 0.5) return null;
    const points = boopPoints(c.kind, this.streak);
    c.booped = true;
    c.age = 0;
    if (c.kind === 'star') this.streak = 0;
    else (this.streak++, this.boops++, (this.best = Math.max(this.best, this.streak)));
    this.score = Math.max(0, this.score + points);
    return { points, kind: c.kind };
  }
}

export function startCrabs(env: GameEnv): Round {
  const still = env.reducedMotion;
  const field = new CrabField(env.random);
  const floaters: Floater[] = [];
  const bonks: { hole: number; t: number }[] = [];
  let time = 0;
  let lastTick = ROUND;
  let announced = false;
  let W = 1;
  let H = 1;
  let shake = 0;

  // The 3 × 3 grid of holes, fitted under the HUD.
  const grid = () => {
    const top = 52;
    const gw = W * 0.9;
    const gh = H - top - 14;
    const cell = Math.max(12, Math.min(gw / 3, gh / 3));
    const x0 = W / 2 - cell * 1.5;
    const y0 = top + (gh - cell * 3) / 2;
    return { cell, x0, y0 };
  };
  const holeAt = (i: number) => {
    const { cell, x0, y0 } = grid();
    return { x: x0 + cell * ((i % 3) + 0.5), y: y0 + cell * (Math.floor(i / 3) + 0.62), r: cell * 0.38 };
  };

  const sand = backdrop((c, w, h) => {
    c.fillStyle = '#f4dcae';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(180, 140, 90, 0.25)';
    for (let i = 0; i < 70; i++) c.fillRect(((i * 0.618) % 1) * w, 40 + ((i * 53.7) % Math.max(1, h - 40)), 2, 2);
    for (let i = 0; i < HOLES; i++) {
      const hp = holeAt(i);
      c.fillStyle = '#d9b47c';
      c.beginPath();
      c.ellipse(hp.x, hp.y + 2, hp.r * 1.12, hp.r * 0.42, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5c4126';
      c.beginPath();
      c.ellipse(hp.x, hp.y, hp.r, hp.r * 0.34, 0, 0, Math.PI * 2);
      c.fill();
      // Its key, small, for keyboards.
      if (!env.touch) {
        c.font = `700 ${Math.max(11, grid().cell * 0.11)}px ${env.font}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(92, 65, 38, 0.55)';
        c.fillText(String(i + 1), hp.x, hp.y + hp.r * 0.62);
      }
    }
  });

  function boop(i: number) {
    const r = field.boop(i);
    const h = holeAt(i);
    if (!r) {
      bonks.push({ hole: i, t: 0 });
      return;
    }
    if (r.kind === 'star') {
      env.sound('miss');
      floaters.push({ text: '−3', x: h.x, y: h.y - h.r, t: 0, color: '#ffb4a8', size: 22 });
      if (!still) shake = 0.25;
    } else {
      env.sound(r.kind === 'gold' ? 'perfect' : 'boop');
      floaters.push({ text: `+${r.points}`, x: h.x, y: h.y - h.r, t: 0, color: r.kind === 'gold' ? '#ffd56b' : '#fff', size: r.points > 1 ? 24 : 20 });
    }
  }

  function drawCrab(c: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Kind, squish: number, wave: number) {
    if (kind === 'star') {
      // A sleepy starfish: five soft arms and closed eyes.
      c.fillStyle = '#ff9f7a';
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.42 : r * 0.95;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (1 - squish * 0.5));
      }
      c.closePath();
      c.fill();
      c.strokeStyle = '#3a2a24';
      c.lineWidth = 2;
      c.lineCap = 'round';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(x + s * r * 0.18, y - r * 0.05, r * 0.09, 0.2, Math.PI - 0.2);
        c.stroke();
      }
      return;
    }
    const body = kind === 'gold' ? '#ffc93c' : '#ff6b5b';
    const dark = kind === 'gold' ? '#e0a10f' : '#e5484d';
    const sy = 1 - squish * 0.45;
    // Claws, waving.
    c.fillStyle = body;
    for (const s of [-1, 1]) {
      const cx = x + s * r * 0.95;
      const cy = y - r * 0.35 - wave * r * 0.18;
      c.beginPath();
      c.ellipse(cx, cy, r * 0.28, r * 0.24, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = dark;
      c.fillRect(cx - (s > 0 ? 0 : r * 0.3), cy - r * 0.04, r * 0.3, r * 0.08);
      c.fillStyle = body;
    }
    c.beginPath();
    c.ellipse(x, y, r * 0.78, r * 0.55 * sy, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = dark;
    c.beginPath();
    c.ellipse(x, y + r * 0.2 * sy, r * 0.6, r * 0.22 * sy, 0, 0, Math.PI);
    c.fill();
    // Eyes on stalks (squeezed shut when booped).
    for (const s of [-1, 1]) {
      const ex = x + s * r * 0.26;
      const ey = y - r * 0.62 * sy;
      c.strokeStyle = dark;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(ex, y - r * 0.3 * sy);
      c.lineTo(ex, ey);
      c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(ex, ey, r * 0.15, 0, Math.PI * 2);
      c.fill();
      if (squish > 0) {
        c.strokeStyle = '#1d1a16';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(ex - r * 0.08, ey - r * 0.04 * s);
        c.lineTo(ex + r * 0.08, ey + r * 0.04 * s);
        c.stroke();
      } else {
        c.fillStyle = '#1d1a16';
        c.beginPath();
        c.arc(ex, ey + 1, r * 0.07, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (kind === 'gold' && !still) {
      c.fillStyle = '#fffbe6';
      const tw = (time * 3) % 1;
      c.globalAlpha = 1 - tw;
      c.fillRect(x + r * 0.5, y - r * 0.9 - tw * 6, 3, 3);
      c.globalAlpha = 1;
    }
  }

  return {
    get score() {
      return field.score;
    },
    get over() {
      return field.over;
    },
    hud: () => ({
      score: `${field.score} ${field.score === 1 ? 'boop' : 'boops'}`,
      info: `0:${String(Math.ceil(ROUND - field.elapsed)).padStart(2, '0')}`,
      streak: field.streak >= 5 ? `Streak ${field.streak} · ×${1 + Math.floor(field.streak / 5)}` : field.streak >= 2 ? `Streak ${field.streak}` : undefined,
    }),
    press(at: Point | null, code?: string) {
      if (field.over) return;
      if (code) {
        const i = HOLE_KEYS[code];
        if (i !== undefined) boop(i);
        return;
      }
      if (!at) return;
      // The nearest hole within reach of the tap (generous: fingers are big).
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < HOLES; i++) {
        const h = holeAt(i);
        const d = Math.hypot(at.x - h.x, (at.y - (h.y - h.r * 0.4)) * 0.9);
        if (d < bestD) (bestD = d), (best = i);
      }
      if (best >= 0 && bestD < grid().cell * 0.62) boop(best);
    },
    release() {},
    update(dt: number) {
      time += dt;
      shake = Math.max(0, shake - dt);
      for (const e of field.step(dt)) if (e.type === 'up' && e.kind === 'gold') env.sound('tap');
      for (const b of bonks) b.t += dt;
      for (let i = bonks.length - 1; i >= 0; i--) if (bonks[i].t > 0.25) bonks.splice(i, 1);
      stepFloaters(floaters, dt);
      const left = Math.ceil(ROUND - field.elapsed);
      if (left < lastTick && left <= 5 && left > 0) env.sound('tick');
      lastTick = left;
      if (field.over && !announced) {
        announced = true;
        env.announce(`Time! ${field.score} boops.`);
      }
    },
    draw(c: CanvasRenderingContext2D, w: number, h: number) {
      W = w;
      H = h;
      c.save();
      if (shake > 0) c.translate(Math.sin(time * 90) * shake * 14, 0);
      // Sand and holes (painted once), with the tide's edge along the top.
      sand(c, w, h);
      c.fillStyle = '#7cc8e0';
      c.beginPath();
      c.moveTo(-20, 0);
      c.lineTo(w + 20, 0);
      c.lineTo(w + 20, 26);
      for (let x = w + 20; x >= -20; x -= 20) c.lineTo(x, 26 + Math.sin(x * 0.05 + (still ? 0 : time * 1.5)) * 5);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let x = -20; x <= w + 20; x += 20) c.fillRect(x, 27 + Math.sin(x * 0.05 + (still ? 0 : time * 1.5)) * 5, 12, 2);

      const { cell } = grid();
      for (let i = 0; i < HOLES; i++) {
        const hp = holeAt(i);
        const cr = field.holes[i];
        // A wrong press: the sand puffs.
        const bonk = bonks.find((b) => b.hole === i);
        if (bonk && !still) {
          c.fillStyle = `rgba(244, 220, 174, ${1 - bonk.t / 0.25})`;
          for (let k = -2; k <= 2; k++) c.fillRect(hp.x + k * hp.r * 0.35, hp.y - bonk.t * 40 - Math.abs(k) * 3, 4, 4);
        }
        if (cr) {
          // How far out of the hole: rising, up, then sinking back (quickly, if booped).
          let out: number;
          if (cr.booped) out = 1 - clamp(cr.age / HIDE);
          else if (cr.age < RISE) out = easeOut(cr.age / RISE);
          else if (cr.age > cr.up) out = 1 - clamp((cr.age - cr.up) / HIDE);
          else out = 1;
          if (still) out = out > 0.05 ? 1 : 0;
          const r = hp.r * 0.95;
          // Clip to above the hole's far lip so the crab comes up out of it.
          c.save();
          c.beginPath();
          c.rect(hp.x - cell / 2, hp.y - cell, cell, cell);
          c.ellipse(hp.x, hp.y, hp.r, hp.r * 0.34, 0, 0, Math.PI);
          c.clip();
          const y = hp.y + r * 0.4 - out * r * 0.95;
          drawCrab(c, hp.x, y, r, cr.kind, cr.booped ? 1 : 0, still ? 0 : Math.sin(time * 9 + i));
          c.restore();
        }
      }
      c.restore();
      // The last few seconds: the clock pulses.
      const left = ROUND - field.elapsed;
      if (left < 5 && !field.over) {
        c.fillStyle = `rgba(255, 90, 54, ${0.12 + 0.1 * Math.sin(time * 12)})`;
        roundRect(c, 4, 4, w - 8, h - 8, 18);
        c.lineWidth = 4;
        c.strokeStyle = c.fillStyle;
        c.stroke();
      }
      drawFloaters(c, floaters, env.font, still);
    },
  };
}
