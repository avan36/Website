// Crate stack, by the recycling depot. A crane swings a crate back and forth
// over the stack; drop it and whatever hangs over the edge falls away, so the
// next crate is narrower. Drop it square (near enough) for a perfect: nothing
// lost, and three perfects in a row win a little width back. It gets quicker
// with every crate, and it's over the moment one misses the stack entirely.
// The score is how many crates you stacked.

import { clamp, drawFloaters, easeOut, lerp, roundRect, stepFloaters, type Floater, type GameEnv, type Point, type Round } from './round';

/** A crate's span: its middle and its width, in crate widths (the first crate is 1 wide, at 0). */
export type Span = { x: number; w: number };

/** How far either side of the middle the crane swings. */
export const SWING = 1.1;
/** How close to square counts as perfect, in crate widths. */
export const PERFECT = 0.045;
/** What three perfects in a row win back, and the widest a crate can get. */
export const REGROW = 0.12;
export const WIDEST = 1;

/** How fast the crane swings at this height, in crate widths a second. */
export const speedFor = (level: number) => Math.min(3.4, 1.15 + level * 0.075);

/**
 * Drop `cur` onto `prev`. Perfect (within PERFECT) snaps it square and loses
 * nothing; otherwise the overlap stays and the rest falls; no overlap at all
 * and the whole crate falls.
 */
export function drop(prev: Span, cur: Span): { placed: Span | null; fell: Span | null; perfect: boolean } {
  if (Math.abs(cur.x - prev.x) <= PERFECT) return { placed: { x: prev.x, w: Math.min(cur.w, prev.w) }, fell: null, perfect: true };
  const l = Math.max(prev.x - prev.w / 2, cur.x - cur.w / 2);
  const r = Math.min(prev.x + prev.w / 2, cur.x + cur.w / 2);
  if (r - l <= 0.001) return { placed: null, fell: cur, perfect: false };
  const placed = { x: (l + r) / 2, w: r - l };
  // The piece hanging over the side.
  const fell = cur.x > prev.x ? { x: (r + cur.x + cur.w / 2) / 2, w: cur.x + cur.w / 2 - r } : { x: (cur.x - cur.w / 2 + l) / 2, w: l - (cur.x - cur.w / 2) };
  return { placed, fell, perfect: false };
}

/** Where the crane's crate is, t seconds into a swing at `speed`, starting from one side. */
export function swingAt(t: number, speed: number, fromLeft: boolean) {
  const span = SWING * 2;
  const d = (t * speed) % (span * 2);
  const k = d < span ? d : span * 2 - d;
  return fromLeft ? -SWING + k : SWING - k;
}

const COLORS = ['#3f9b5f', '#2b8fb8', '#f2c14e', '#e5484d', '#8b5cf6', '#ff9f43'];
/** A crate's height, in crate widths. */
const CRATE_H = 0.34;

type Fall = { x: number; w: number; y: number; vy: number; vx: number; rot: number; spin: number; color: string };

export function startCrates(env: GameEnv): Round {
  const still = env.reducedMotion;
  const stack: (Span & { color: string; land: number })[] = [{ x: 0, w: 1, color: '#c9a36b', land: 1 }];
  let cur: Span = { x: -SWING, w: 1 };
  let swingT = 0;
  let fromLeft = true;
  let perfects = 0;
  let score = 0;
  let over = false;
  let overT = 0;
  /** A crate on its way down: from the crane to the top of the stack. */
  let dropping: { span: Span; t: number } | null = null;
  const falls: Fall[] = [];
  const floaters: Floater[] = [];
  let cam = 0;
  let time = 0;
  let flash = 0;
  let W = 1;
  let H = 1;

  const colorOf = (i: number) => COLORS[i % COLORS.length];
  const level = () => stack.length - 1;

  function release() {
    if (over || dropping) return;
    dropping = { span: { ...cur }, t: 0 };
  }

  function land() {
    const d = dropping!;
    dropping = null;
    const top = stack[stack.length - 1];
    const r = drop(top, d.span);
    const color = colorOf(stack.length);
    if (r.fell) falls.push({ ...r.fell, y: level() + 1, vy: 0, vx: r.fell.x > top.x ? 0.6 : -0.6, rot: 0, spin: r.fell.x > top.x ? 2.5 : -2.5, color });
    if (!r.placed) {
      over = true;
      perfects = 0;
      env.sound('miss');
      env.announce(`The crate fell. ${score} crates stacked.`);
      return;
    }
    let w = r.placed.w;
    if (r.perfect) {
      perfects++;
      if (perfects % 3 === 0) w = Math.min(WIDEST, w + REGROW);
      env.sound('perfect');
      flash = 1;
    } else perfects = 0;
    stack.push({ x: r.placed.x, w, color, land: 0 });
    score++;
    env.sound('thud');
    const sx = W / 2 + r.placed.x * unit();
    const sy = yOf(level() + 0.5);
    if (r.perfect) floaters.push({ text: perfects % 3 === 0 ? 'Perfect! Wider!' : perfects > 1 ? `Perfect ×${perfects}` : 'Perfect!', x: sx, y: sy - 30, t: 0, color: '#ffd56b', size: 20 });
    // The next crate comes in from the other side, as wide as the top of the stack.
    fromLeft = !fromLeft;
    swingT = 0;
    cur = { x: fromLeft ? -SWING : SWING, w };
  }

  // Screen: crate widths to pixels, and a level's height on screen given the camera.
  const unit = () => Math.min(W / 3.1, H / 3.2);
  const ground = () => H - 26;
  const yOf = (lv: number) => ground() - (lv - cam) * CRATE_H * unit();

  function drawCrate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
    c.fillStyle = color;
    roundRect(c, x - w / 2, y - h, w, h, 4);
    c.fill();
    c.strokeStyle = 'rgba(29, 26, 22, 0.55)';
    c.lineWidth = 2;
    c.stroke();
    // Slats and a brace.
    c.strokeStyle = 'rgba(29, 26, 22, 0.22)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x - w / 2 + 3, y - h / 2);
    c.lineTo(x + w / 2 - 3, y - h / 2);
    if (w > h * 0.9) {
      c.moveTo(x - w / 2 + 4, y - 4);
      c.lineTo(x - w / 2 + Math.min(w - 8, h * 1.6), y - h + 4);
    }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(x - w / 2 + 3, y - h + 3, Math.max(0, w - 6), 3);
  }

  return {
    get score() {
      return score;
    },
    get over() {
      return over && overT > 0.9;
    },
    hud: () => ({
      score: `${score} ${score === 1 ? 'crate' : 'crates'}`,
      info: `Height ${score}`,
      streak: perfects > 1 ? `Perfect ×${perfects}` : undefined,
    }),
    press(_at: Point | null, code?: string) {
      if (code && !['Space', 'Enter', 'NumpadEnter', 'ArrowDown', 'KeyS'].includes(code)) return;
      release();
    },
    release() {},
    update(dt: number) {
      time += dt;
      flash = Math.max(0, flash - dt * 3);
      if (over) overT += dt;
      stepFloaters(floaters, dt);
      for (const s of stack) s.land = Math.min(1, s.land + dt * 6);
      if (!over && !dropping) {
        swingT += dt;
        cur.x = swingAt(swingT, speedFor(level()), fromLeft);
      }
      if (dropping) {
        dropping.t += dt;
        if (dropping.t >= 0.16) land();
      }
      for (const f of falls) {
        f.vy -= 9 * dt;
        f.y += f.vy * dt;
        f.x += f.vx * dt;
        f.rot += f.spin * dt;
      }
      for (let i = falls.length - 1; i >= 0; i--) if (falls[i].y < cam - 12) falls.splice(i, 1);
      // Keep the top of the stack a little below the middle of the screen.
      const want = Math.max(0, level() - 2.5);
      cam = still ? want : lerp(cam, want, 1 - Math.exp(-dt * 5));
    },
    draw(c: CanvasRenderingContext2D, w: number, h: number) {
      W = w;
      H = h;
      const u = unit();
      const ch = CRATE_H * u;
      // The sky deepens as the tower climbs.
      const up = clamp(cam / 30);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgb(${Math.round(lerp(150, 70, up))}, ${Math.round(lerp(212, 120, up))}, ${Math.round(lerp(240, 200, up))})`);
      g.addColorStop(1, '#eaf7fb');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Far hills and the depot's shed, sliding down out of view as you climb.
      const gy = ground() + cam * ch;
      c.fillStyle = '#9fd18b';
      c.beginPath();
      c.ellipse(w * 0.2, gy + 10, w * 0.45, 60, 0, Math.PI, 0);
      c.ellipse(w * 0.85, gy + 14, w * 0.4, 46, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#7d6a58';
      c.fillRect(w * 0.68, gy - 70, w * 0.26, 70);
      c.fillStyle = '#3f9b5f';
      c.beginPath();
      c.moveTo(w * 0.66, gy - 66);
      c.lineTo(w * 0.81, gy - 96);
      c.lineTo(w * 0.96, gy - 66);
      c.fill();
      c.fillStyle = '#4a3b2e';
      c.fillRect(w * 0.73, gy - 48, w * 0.1, 48);
      c.fillStyle = '#c8b28f';
      c.fillRect(0, gy, w, h - gy + 40);
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(0, gy, w, 4);

      // Bits that fell off.
      for (const f of falls) {
        const fy = yOf(f.y);
        if (fy > h + 80) continue;
        c.save();
        c.translate(w / 2 + f.x * u, fy - ch / 2);
        c.rotate(still ? 0 : f.rot);
        drawCrate(c, 0, ch / 2, f.w * u, ch, f.color);
        c.restore();
      }
      // The stack (only what's on screen).
      for (let i = 0; i < stack.length; i++) {
        const s = stack[i];
        const y = yOf(i) + (still ? 0 : (1 - easeOut(s.land)) * -4);
        if (y - ch > h || y < -ch) continue;
        drawCrate(c, w / 2 + s.x * u, y, s.w * u, ch, s.color);
      }
      if (flash > 0) {
        const top = stack[stack.length - 1];
        c.strokeStyle = `rgba(255, 213, 107, ${flash})`;
        c.lineWidth = 4;
        roundRect(c, w / 2 + (top.x - top.w / 2) * u - 4, yOf(level()) - ch - 4, top.w * u + 8, ch + 8, 6);
        c.stroke();
      }

      // The crane: a rope from the top of the screen, and the crate on its hook (or dropping).
      const hookY = Math.min(yOf(level() + 1) - ch - u * 0.7, h * 0.32);
      if (!over) {
        const span = dropping ? dropping.span : cur;
        const x = w / 2 + span.x * u;
        const fall = dropping ? easeOut(clamp(dropping.t / 0.16)) : 0;
        const y = lerp(hookY + ch, yOf(level() + 1), fall);
        c.strokeStyle = '#4a4540';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(dropping ? w / 2 + dropping.span.x * u : x, 0);
        c.lineTo(dropping ? w / 2 + dropping.span.x * u : x, hookY - 4);
        c.stroke();
        c.fillStyle = '#4a4540';
        c.fillRect((dropping ? w / 2 + dropping.span.x * u : x) - 6, hookY - 6, 12, 5);
        drawCrate(c, x, y, span.w * u, ch, colorOf(stack.length));
        // A guide: a faint shadow where it would land.
        if (!dropping) {
          c.fillStyle = 'rgba(29, 26, 22, 0.12)';
          c.fillRect(x - (span.w * u) / 2, yOf(level()) - ch - 3, span.w * u, 3);
        }
      }
      drawFloaters(c, floaters, env.font, still);
      if (level() === 0 && !dropping && !over) {
        const msg = env.touch ? 'Tap to drop' : 'Space to drop';
        c.font = `750 16px ${env.font}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const tw = c.measureText(msg).width + 28;
        c.fillStyle = 'rgba(29, 26, 22, 0.62)';
        roundRect(c, w / 2 - tw / 2, h * 0.56 - 17, tw, 34, 17);
        c.fill();
        c.fillStyle = '#fff';
        c.fillText(msg, w / 2, h * 0.56 + 1);
      }
    },
  };
}
