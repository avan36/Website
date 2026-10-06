// The car: arcade handling as a pure step. Momentum, a top speed that drops
// on the grass, steering that needs speed to bite, and a little slide in the
// turns. Bumping into things is the caller's job (see play.ts and track.ts).

export type Car = {
  x: number;
  z: number;
  /** The way it faces: 0 is +z (south on the map), turning toward +x. */
  heading: number;
  /** Speed along the heading, world units a second (negative is reversing). */
  speed: number;
  /** Sideways speed, which grip wears away: the slide. */
  slip: number;
};

export type Drive = { throttle: number; steer: number };

/** Top speed on the road, world units a second. */
export const TOP_SPEED = 24;
/** On the grass you can only go this fraction as fast. */
export const GRASS = 0.5;
const ACCEL = 14;
const BRAKE = 26;
const REVERSE_TOP = 7;
const COAST = 4;
const TURN = 2.1;
const GRIP = 5;

export function newCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, speed: 0, slip: 0 };
}

export function stepCar(c: Car, d: Drive, dt: number, onRoad: boolean): Car {
  const top = TOP_SPEED * (onRoad ? 1 : GRASS);
  let speed = c.speed;
  const th = Math.max(-1, Math.min(1, d.throttle));
  if (th > 0) speed += (speed < 0 ? BRAKE : ACCEL * (1 - Math.max(0, speed) / top)) * th * dt;
  else if (th < 0) speed += (speed > 0 ? -BRAKE : -ACCEL * 0.6) * -th * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), COAST * dt);
  // Over the top speed (just left the road): slow down to it quickly, not at once.
  if (speed > top) speed = Math.max(top, speed - BRAKE * 1.2 * dt);
  speed = Math.max(-REVERSE_TOP, speed);

  // Steering bites with speed, and reverses when you back up.
  const bite = Math.min(1, Math.abs(speed) / 6) * (1 - 0.35 * Math.min(1, Math.abs(speed) / TOP_SPEED));
  const steer = Math.max(-1, Math.min(1, d.steer));
  const turn = steer * TURN * bite * Math.sign(speed || 1) * dt;
  const heading = c.heading + turn;
  // Turning throws a little speed sideways, which grip then wears away.
  const slip = (c.slip + speed * turn * 0.35) * Math.exp(-GRIP * dt);

  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return {
    x: c.x + (fx * speed + fz * slip) * dt,
    z: c.z + (fz * speed - fx * slip) * dt,
    heading,
    speed,
    slip,
  };
}

/** Hit something with normal n: lose the speed going into it, and some of the rest. */
export function bump(c: Car, x: number, z: number, nx: number, nz: number): Car {
  const fx = Math.sin(c.heading);
  const fz = Math.cos(c.heading);
  const into = fx * nx + fz * nz;
  const speed = into < 0 ? c.speed * (1 + into) * 0.6 : c.speed * 0.85;
  return { ...c, x, z, speed, slip: c.slip * 0.3 };
}
