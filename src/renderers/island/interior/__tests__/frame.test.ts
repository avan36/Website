import { describe, expect, it } from 'vitest';
import { BOX_SIDE } from '../../../room';
import { fitScale, frameRoom, roomArea, type Area, type CameraPose, type RoomShot, type V3 } from '../frame';

/** Project a point the way a three.js PerspectiveCamera at `pose` would, to CSS pixels (an independent check). */
function project(p: V3, pose: CameraPose, shot: RoomShot) {
  const f = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z };
  const fl = Math.hypot(f.x, f.y, f.z);
  const fwd = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
  // right = fwd × up(0, 1, 0), up' = right × fwd: what lookAt() builds.
  const r = { x: -fwd.z, y: 0, z: fwd.x };
  const rl = Math.hypot(r.x, r.z);
  const right = { x: r.x / rl, y: 0, z: r.z / rl };
  const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
  const rel = { x: p.x - pose.position.x, y: p.y - pose.position.y, z: p.z - pose.position.z };
  const depth = rel.x * fwd.x + rel.y * fwd.y + rel.z * fwd.z;
  const tanV = Math.tan((shot.fov * Math.PI) / 360);
  const tanH = tanV * (shot.viewW / shot.viewH);
  const ndcX = (rel.x * right.x + rel.y * right.y + rel.z * right.z) / (depth * tanH);
  const ndcY = (rel.x * up.x + rel.y * up.y + rel.z * up.z) / (depth * tanV);
  return { x: (ndcX * 0.5 + 0.5) * shot.viewW, y: (0.5 - ndcY * 0.5) * shot.viewH, depth };
}

function corners(shot: RoomShot) {
  const out: V3[] = [];
  const c = Math.cos(shot.yaw);
  const s = Math.sin(shot.yaw);
  for (const lx of [-shot.size.w / 2, shot.size.w / 2]) for (const lz of [-shot.size.d / 2, shot.size.d / 2]) for (const y of [0, shot.size.h]) {
    out.push({ x: shot.at.x + lx * c + lz * s, y: shot.at.y + y, z: shot.at.z - lx * s + lz * c });
  }
  return out;
}

const within = (p: { x: number; y: number }, a: Area, slack = 0.5) => p.x >= a.x - slack && p.x <= a.x + a.w + slack && p.y >= a.y - slack && p.y <= a.y + a.h + slack;

// A 9 by 7 room at K = 1.5 scene units a room unit, with its walls, scaled down onto a building's spot.
const room = { w: 14.1, d: 11.1, h: 3.2 };
const desk: RoomShot = { at: { x: -13, y: 0.9, z: -3 }, yaw: 0.4, size: { w: room.w * 0.44, d: room.d * 0.44, h: room.h * 0.44 }, viewW: 1440, viewH: 900, fov: 32 };
const phone: RoomShot = { ...desk, viewW: 390, viewH: 844, fov: 50 };

describe('roomArea', () => {
  it('leaves the docked box its side of a wide screen', () => {
    const a = roomArea(1440, 900);
    expect(a.x + a.w).toBeLessThanOrEqual(1440 - BOX_SIDE);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y + a.h).toBeLessThanOrEqual(900);
  });

  it('goes above the box on a phone, across the whole width', () => {
    const a = roomArea(390, 844);
    expect(a.w).toBeGreaterThan(330);
    expect(a.y + a.h).toBeLessThan(844 * 0.54);
    expect(a.y).toBeGreaterThan(100); // under the HUD and the room's bar
  });
});

describe('frameRoom', () => {
  for (const [name, shot] of [['desktop', desk], ['phone', phone]] as const) {
    it(`gets the whole room in its area (${name})`, () => {
      const pose = frameRoom(shot);
      const area = roomArea(shot.viewW, shot.viewH);
      for (const p of corners(shot)) {
        const s = project(p, pose, shot);
        expect(s.depth).toBeGreaterThan(0);
        expect(within(s, area), `${JSON.stringify(s)} in ${JSON.stringify(area)}`).toBe(true);
      }
    });

    it(`comes as close as it can (${name})`, () => {
      const pose = frameRoom(shot);
      const area = roomArea(shot.viewW, shot.viewH);
      // A little closer and something sticks out of the area.
      const k = 0.95;
      const closer: CameraPose = {
        ...pose,
        position: { x: pose.target.x + (pose.position.x - pose.target.x) * k, y: pose.target.y + (pose.position.y - pose.target.y) * k, z: pose.target.z + (pose.position.z - pose.target.z) * k },
      };
      const spill = corners(shot).some((p) => !within(project(p, closer, shot), area, -14));
      expect(spill).toBe(true);
    });

    it(`puts the middle of the room in the middle of its area (${name})`, () => {
      const pose = frameRoom(shot);
      const area = roomArea(shot.viewW, shot.viewH);
      const s = project({ x: shot.at.x, y: shot.at.y + shot.size.h / 2, z: shot.at.z }, pose, shot);
      expect(s.x).toBeCloseTo(area.x + area.w / 2, 3);
      expect(s.y).toBeCloseTo(area.y + area.h / 2, 3);
    });
  }

  it('looks from in front of the door, down at the pitch asked for, whichever way the door faces', () => {
    for (const yaw of [0, 1, 2.5, -2, Math.PI]) {
      const pose = frameRoom({ ...desk, yaw, pitch: 0.8 });
      const door = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const out = { x: pose.position.x - desk.at.x, y: pose.position.y - desk.at.y, z: pose.position.z - desk.at.z };
      expect(out.x * door.x + out.z * door.z, `yaw ${yaw}`).toBeGreaterThan(0);
      const d = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z };
      expect(Math.asin(-d.y / Math.hypot(d.x, d.y, d.z))).toBeCloseTo(0.8, 6);
    }
  });

  it('is a rig: position = target + dist × (sin yaw cos pitch, sin pitch, cos yaw cos pitch)', () => {
    const p = frameRoom(desk);
    const cp = Math.cos(p.pitch);
    expect(p.position.x).toBeCloseTo(p.target.x + Math.sin(p.yaw) * cp * p.dist, 6);
    expect(p.position.y).toBeCloseTo(p.target.y + Math.sin(p.pitch) * p.dist, 6);
    expect(p.position.z).toBeCloseTo(p.target.z + Math.cos(p.yaw) * cp * p.dist, 6);
  });

  it('stands further back for a bigger room', () => {
    const big = frameRoom({ ...desk, size: { w: desk.size.w * 2, d: desk.size.d * 2, h: desk.size.h * 2 } });
    expect(big.dist).toBeGreaterThan(frameRoom(desk).dist * 1.8);
  });
});

describe('fitScale', () => {
  it('fits every corner within the radius', () => {
    const s = fitScale(room, 4);
    expect(Math.hypot((room.w * s) / 2, (room.d * s) / 2)).toBeCloseTo(4, 6);
  });
});
