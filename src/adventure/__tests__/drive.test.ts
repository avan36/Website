// A whole race on the real campus, driven by a simple autopilot that steers
// for a point a little way up the course. If this can't finish, a gate is out
// of reach or a building is in the road.
import { expect, it } from 'vitest';
import { boxes, course, gates, onRoad } from '../campus';
import { newCar, stepCar, bump } from '../car';
import { newRace, pushOut, startPose, stepRace } from '../track';

it('can be driven round, two laps, through every gate', () => {
  const s = startPose(course, gates);
  let car = newCar(s.x, s.z, s.heading);
  let race = newRace(2);
  const dt = 1 / 60;
  let gatesPassed = 0;
  for (let i = 0; i < 60 * 400 && race.phase !== 'done'; i++) {
    const here = course.project(car);
    const aim = course.pointAt(here.s + 14);
    const want = Math.atan2(aim.x - car.x, aim.z - car.z);
    let diff = want - car.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    const throttle = Math.abs(diff) > 0.6 && car.speed > 12 ? -1 : 1;
    car = stepCar(car, { throttle, steer }, dt, onRoad(car));
    for (const b of boxes) {
      const hit = pushOut(car, 1.3, b);
      if (hit) car = bump(car, hit.x, hit.z, hit.nx, hit.nz);
    }
    const out = stepRace(race, car, dt, gates);
    race = out.race;
    gatesPassed += out.events.filter((e) => e.type === 'gate' || e.type === 'lap').length;
  }
  expect(race.phase).toBe('done');
  expect(gatesPassed).toBe(gates.length * 2);
  // A lap should take a sensible time: long enough to feel like a drive, short enough for a phone.
  for (const lap of race.splits) {
    expect(lap).toBeGreaterThan(25);
    expect(lap).toBeLessThan(90);
  }
});
