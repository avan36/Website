// Skipping stones, on the north beach along from the lighthouse. Five stones a round. Hold to wind up:
// a meter swings up and down, and letting go inside its bright band is a
// perfect throw. Perfect throws in a row skip further (and the meter gets
// quicker and the band narrower, so a streak is worth protecting). The score
// is every skip in the round.

import { backdrop, clamp, drawFloaters, easeOut, lerp, roundRect, stepFloaters, type Floater, type GameEnv, type Point, type Round } from './round';

export const STONES = 5;
/** A press shorter than this is a tap: the meter keeps swinging until the next one. */
export const TAP = 0.16;
/** The most a streak adds to a perfect throw. */
export const MAX_STREAK_BONUS = 5;

export type Zone = { lo: number; hi: number };
export type Throw = { skips: number; perfect: boolean; quality: 'perfect' | 'good' | 'weak' | 'plonk' };

/** Where the meter is, t seconds into a swing: 0 → 1 → 0, over `period` seconds. */
export function meterAt(t: number, period: number) {
  const k = (((t / period) % 1) + 1) % 1;
  return k < 0.5 ? k * 2 : 2 - k * 2;
}

/** How long one swing of the meter takes: a little quicker every stone, and quicker on a streak. */
export const periodFor = (stone: number, streak: number) => Math.max(0.7, 1.35 - stone * 0.08 - streak * 0.05);

/** The bright band for a stone: somewhere high on the meter, narrower as the round (and the streak) goes on. */
export function zoneFor(stone: number, streak: number, random: () => number): Zone {
  const width = Math.max(0.07, 0.16 - stone * 0.015 - streak * 0.01);
  const mid = 0.6 + random() * 0.28;
  return { lo: mid - width / 2, hi: mid + width / 2 };
}

/**
 * How many times a stone skips, let go at `power` (0..1) with this band, after
 * `streak` perfect throws in a row. Inside the band is perfect: 7 to 10 skips
 * (10 dead centre) plus the streak. Outside, it falls away fast.
 */
export function throwStone(power: number, zone: Zone, streak: number): Throw {
  const mid = (zone.lo + zone.hi) / 2;
  const half = (zone.hi - zone.lo) / 2;
  const d = Math.abs(power - mid);
  if (d <= half) return { skips: 7 + Math.round(3 * (1 - d / half)) + Math.min(streak, MAX_STREAK_BONUS), perfect: true, quality: 'perfect' };
  const skips = Math.max(0, Math.round(6 - (d - half) * 22));
  return { skips, perfect: false, quality: skips >= 4 ? 'good' : skips > 0 ? 'weak' : 'plonk' };
}

/** The gaps between skips, as fractions of the whole run (each a little shorter than the last). */
export function hops(skips: number): number[] {
  const gaps = [1];
  for (let i = 0; i < skips; i++) gaps.push(gaps[i] * 0.8);
  const sum = gaps.reduce((a, b) => a + b, 0);
  return gaps.map((g) => g / sum);
}

type Phase = 'ready' | 'aim' | 'fly' | 'result';
type Ring = { x: number; y: number; t: number; big: boolean; s: number };

export function startStones(env: GameEnv): Round {
  const still = env.reducedMotion;
  let phase: Phase = 'ready';
  let stone = 0;
  let streak = 0;
  let score = 0;
  let over = false;
  let zone = zoneFor(0, 0, env.random);
  let period = periodFor(0, 0);
  /** Time into the swing, how long the press has been held, and whether a tap left it swinging. */
  let aimT = 0;
  let held = 0;
  let holding = false;
  let latched = false;
  let power = 0;
  let last: (Throw & { power: number }) | null = null;
  // The flight: time along it, its hops, and the touchdowns so far.
  let flyT = 0;
  let flight: number[] = [];
  let touched = 0;
  let resultT = 0;
  let time = 0;
  const rings: Ring[] = [];
  const floaters: Floater[] = [];
  let W = 1;
  let H = 1;

  /** Seconds a hop takes in the air: long at first, then quicker. */
  const hopTime = (i: number) => Math.max(0.1, 0.36 * 0.86 ** i);
  const flightTime = () => flight.reduce((a, _, i) => a + hopTime(i), 0);

  // Where things are on screen. The stone flies from the thrower's hand out
  // toward the horizon, smaller as it goes.
  const horizon = () => H * 0.36;
  const hand = () => ({ x: Math.max(W * 0.2, 100), y: H * 0.74 });
  /** How far out a run of `skips` reaches, 0..1 of the way to the horizon. */
  const reach = (skips: number) => clamp(0.28 + skips * 0.05, 0, 0.95);
  const along = (s: number, run: number) => {
    const h = hand();
    const k = s * run;
    // Perspective: equal steps out cover less screen the further they go.
    const p = 1 - 1 / (1 + k * 3);
    return { x: lerp(h.x, W * 0.82, p / 0.75), y: lerp(H * 0.8, horizon() + 6, p / 0.75), s: lerp(1, 0.25, p / 0.75) };
  };

  // The sky, the sun, the far island and the sea: painted once per size.
  const sky = backdrop((c, w, h) => {
    const hz = h * 0.36;
    // Sky and sun.
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#a9dcf2');
    g.addColorStop(1, '#eaf7fb');
    c.fillStyle = g;
    c.fillRect(0, 0, w, hz);
    c.fillStyle = '#fff4cf';
    c.beginPath();
    c.arc(w * 0.8, hz * 0.42, Math.min(w, h) * 0.07, 0, Math.PI * 2);
    c.fill();
  });
  const sea = backdrop((c, w, h) => {
    const hz = h * 0.36;

    // A far-off island on the horizon.
    c.fillStyle = '#7fb6a4';
    c.beginPath();
    c.ellipse(w * 0.3, hz, w * 0.08, hz * 0.07, 0, Math.PI, 0);
    c.fill();
    // The sea, with glints.
    const g = c.createLinearGradient(0, hz, 0, h);
    g.addColorStop(0, '#7cc8e0');
    g.addColorStop(1, '#2b8fb8');
    c.fillStyle = g;
    c.fillRect(0, hz, w, h - hz);
  });

  function letGo() {
    if (phase !== 'aim') return;
    power = meterAt(aimT, period);
    const t = throwStone(power, zone, streak);
    last = { ...t, power };
    streak = t.perfect ? streak + 1 : 0;
    score += t.skips;
    flight = hops(t.skips);
    flyT = 0;
    touched = 0;
    phase = 'fly';
    holding = false;
    latched = false;
    env.sound('whoosh');
  }

  function nextStone() {
    if (over) return;
    stone++;
    if (stone >= STONES) {
      over = true;
      env.announce(`Round over: ${score} skips.`);
      return;
    }
    zone = zoneFor(stone, streak, env.random);
    period = periodFor(stone, streak);
    phase = 'ready';
  }

  const round: Round = {
    get score() {
      return score;
    },
    get over() {
      return over;
    },
    hud: () => ({
      score: `${score} ${score === 1 ? 'skip' : 'skips'}`,
      info: `Stone ${Math.min(stone + 1, STONES)} of ${STONES}`,
      streak: streak > 1 ? `Perfect ×${streak}` : undefined,
    }),
    press(_at: Point | null, code?: string) {
      if (over || (code && !['Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'KeyW'].includes(code))) return;
      if (phase === 'ready') {
        phase = 'aim';
        aimT = 0;
        held = 0;
        holding = true;
        latched = false;
        env.sound('tap');
      } else if (phase === 'aim' && latched) letGo();
    },
    release() {
      if (phase !== 'aim' || !holding) return;
      holding = false;
      // A quick tap starts the meter; the next tap throws. A long press throws on release.
      if (held < TAP) latched = true;
      else letGo();
    },
    update(dt: number) {
      time += dt;
      for (const r of rings) r.t += dt;
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t > 1.2) rings.splice(i, 1);
      stepFloaters(floaters, dt);
      if (phase === 'aim') {
        aimT += dt;
        if (holding) held += dt;
      } else if (phase === 'fly') {
        flyT += dt;
        const run = reach(flight.length - 1);
        // Touchdowns: one per hop that has ended.
        let t = 0;
        for (let i = 0; i < flight.length; i++) {
          t += hopTime(i);
          if (flyT >= t && i >= touched) {
            touched = i + 1;
            const s = flight.slice(0, i + 1).reduce((a, b) => a + b, 0);
            const p = along(s, run);
            const sink = i === flight.length - 1;
            rings.push({ x: p.x, y: p.y, t: 0, big: sink, s: p.s });
            env.sound(sink ? 'plonk' : 'skip');
          }
        }
        if (flyT >= flightTime() + 0.15) {
          phase = 'result';
          resultT = 0;
          const l = last!;
          const words = l.perfect ? (streak > 1 ? `Perfect! ×${streak}` : 'Perfect!') : l.quality === 'plonk' ? 'Plonk.' : l.quality === 'good' ? 'Nice' : 'Hmm';
          floaters.push({ text: `${l.skips} ${l.skips === 1 ? 'skip' : 'skips'}`, x: W * 0.55, y: H * 0.5, t: 0, color: '#fff', size: 30 });
          floaters.push({ text: words, x: W * 0.55, y: H * 0.5 + 34, t: -0.1, color: l.perfect ? '#ffd56b' : '#e8f6fb', size: 20 });
          if (l.perfect) env.sound('perfect');
        }
      } else if (phase === 'result' && !over) {
        resultT += dt;
        if (resultT > 0.75) nextStone();
      }
    },
    draw(c: CanvasRenderingContext2D, w: number, h: number) {
      W = w;
      H = h;
      const hz = horizon();
      sky(c, w, h);
      // Clouds drifting by.
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 0.37 + (still ? 0 : time * 0.012 * (1 + i * 0.3))) % 1.3) * w - w * 0.15;
        const cy = hz * (0.25 + i * 0.2);
        const r = Math.min(w, h) * (0.035 + i * 0.006);
        c.beginPath();
        c.ellipse(cx, cy, r * 2.2, r, 0, 0, Math.PI * 2);
        c.ellipse(cx + r * 1.2, cy - r * 0.5, r * 1.3, r * 0.9, 0, 0, Math.PI * 2);
        c.fill();
      }
      sea(c, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const k = (i * 0.618) % 1;
        const y = hz + 6 + (h - hz) * (i / 14) ** 1.6;
        const len = 8 + (y - hz) * 0.12;
        const x = ((k + (still ? 0 : time * 0.02 * ((i % 3) + 1))) % 1) * w;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + len, y);
        c.stroke();
      }
      // Ripples where the stone touched down.
      for (const r of rings) {
        const k = clamp(r.t / 1.2);
        const rad = (r.big ? 26 : 16) * r.s * (0.4 + easeOut(k) * (r.big ? 1.6 : 1.2));
        c.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
        c.lineWidth = r.big ? 2.5 : 2;
        c.beginPath();
        c.ellipse(r.x, r.y, rad, rad * 0.32, 0, 0, Math.PI * 2);
        c.stroke();
        if (!still && r.t < 0.25) {
          // A little splash.
          c.fillStyle = 'rgba(255,255,255,0.9)';
          for (let j = -1; j <= 1; j++) {
            const up = Math.sin((r.t / 0.25) * Math.PI) * 10 * r.s * (r.big ? 1.8 : 1);
            c.fillRect(r.x + j * 5 * r.s - 1, r.y - up - Math.abs(j) * 2, 2.5, 2.5);
          }
        }
      }
      // The beach, bottom left.
      c.fillStyle = '#f2d7a6';
      c.beginPath();
      c.moveTo(0, h * 0.62);
      c.quadraticCurveTo(w * 0.28, h * 0.7, w * 0.42, h);
      c.lineTo(0, h);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, h * 0.62);
      c.quadraticCurveTo(w * 0.28, h * 0.7, w * 0.42, h);
      c.stroke();
      // A few pebbles waiting.
      c.fillStyle = '#9a9088';
      for (let i = 0; i < STONES - stone - (phase === 'ready' || phase === 'aim' ? 1 : 0); i++) {
        c.beginPath();
        c.ellipse(w * 0.05 + i * 13, h * 0.93, 5, 3, 0, 0, Math.PI * 2);
        c.fill();
      }

      // The thrower: a round little explorer, arm back while winding up.
      const hd = hand();
      const bx = hd.x - 26;
      const by = h * 0.84;
      const wind = phase === 'aim' ? meterAt(aimT, period) : phase === 'fly' && flyT < 0.15 ? -1 : 0;
      c.fillStyle = 'rgba(42, 29, 16, 0.18)';
      c.beginPath();
      c.ellipse(bx, by + 26, 20, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3e7bd6';
      roundRect(c, bx - 13, by - 6, 26, 30, 10);
      c.fill();
      c.fillStyle = '#ff5a36';
      c.fillRect(bx - 13, by - 6, 26, 6);
      c.fillStyle = '#f5c9a0';
      c.beginPath();
      c.arc(bx, by - 18, 13, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3a2a24';
      c.fillRect(bx + 3, by - 21, 3, 4);
      // The arm.
      const ang = wind >= 0 ? -0.4 - wind * 1.6 : 0.5;
      c.strokeStyle = '#f5c9a0';
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(bx + 8, by + 2);
      const ax = bx + 8 + Math.cos(ang) * 20;
      const ay = by + 2 + Math.sin(ang) * 20;
      c.lineTo(ax, ay);
      c.stroke();
      if (phase === 'ready' || phase === 'aim') {
        c.fillStyle = '#8f857c';
        c.beginPath();
        c.ellipse(ax, ay, 6, 3.5, ang, 0, Math.PI * 2);
        c.fill();
      }

      // The stone in flight.
      if (phase === 'fly') {
        const run = reach(flight.length - 1);
        let t = flyT;
        let s0 = 0;
        let i = 0;
        while (i < flight.length && t > hopTime(i)) (t -= hopTime(i)), (s0 += flight[i]), i++;
        if (i < flight.length) {
          const k = t / hopTime(i);
          const a = along(s0 + flight[i] * k, run);
          // The first hop is a throw from the hand; the rest are bounces off the water.
          const arc = Math.sin(k * Math.PI) * (i === 0 ? 40 : 60 * flight[i] * 3) * a.s;
          const base = i === 0 ? lerp(hd.y, a.y, k) : a.y;
          const x = i === 0 ? lerp(hd.x, a.x, k) : a.x;
          c.fillStyle = 'rgba(0, 40, 70, 0.25)';
          c.beginPath();
          c.ellipse(x, a.y + 2, 6 * a.s, 2 * a.s, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#7d736a';
          c.beginPath();
          c.ellipse(x, base - arc, 7 * a.s + 1, 4 * a.s + 1, still ? 0 : time * 20, 0, Math.PI * 2);
          c.fill();
        }
      }

      // The meter: a pill on the left with the bright band, and the needle.
      const mx = Math.max(14, w * 0.04);
      const mt = h * 0.2;
      const mh = h * 0.62;
      const mw = 16;
      c.fillStyle = 'rgba(29, 26, 22, 0.55)';
      roundRect(c, mx - 3, mt - 3, mw + 6, mh + 6, 11);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(c, mx, mt, mw, mh, 8);
      c.fill();
      const yOf = (v: number) => mt + mh * (1 - v);
      c.fillStyle = streak > 0 ? '#ffd56b' : '#9ff0b0';
      c.fillRect(mx, yOf(zone.hi), mw, yOf(zone.lo) - yOf(zone.hi));
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.strokeRect(mx + 0.5, yOf(zone.hi) + 0.5, mw - 1, yOf(zone.lo) - yOf(zone.hi) - 1);
      // Where the last stone was let go, faintly.
      if (last && phase !== 'aim') {
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(mx - 4, yOf(last.power) - 1, mw + 8, 2);
      }
      const needle = phase === 'aim' ? meterAt(aimT, period) : phase === 'fly' || phase === 'result' ? power : 0;
      const ny = yOf(needle);
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(mx + mw + 3, ny);
      c.lineTo(mx + mw + 12, ny - 6);
      c.lineTo(mx + mw + 12, ny + 6);
      c.fill();
      c.fillRect(mx - 2, ny - 2, mw + 4, 4);

      // What to do now.
      if (phase === 'ready' || (phase === 'aim' && latched)) {
        c.font = `750 ${w < 420 ? 15 : 17}px ${env.font}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const msg = phase === 'aim' ? (env.touch ? 'Tap again to throw' : 'Press again to throw') : env.touch ? 'Hold to wind up' : 'Hold Space to wind up';
        const tw = c.measureText(msg).width + 28;
        c.fillStyle = 'rgba(29, 26, 22, 0.62)';
        roundRect(c, w / 2 - tw / 2, h * 0.5 - 17, tw, 34, 17);
        c.fill();
        c.fillStyle = '#fff';
        c.fillText(msg, w / 2, h * 0.5 + 1);
      }
      drawFloaters(c, floaters, env.font, still);
    },
  };
  return round;
}
