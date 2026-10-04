// Framing a room: where a camera should sit, and where it should look, to
// show a building's room (interior/room.ts) in the part of the screen the
// room's words leave free: beside the box on a wide screen, above it on a
// narrow one (see BOX_SIDE in renderers/room.ts). Pure math, no three.js, so
// any host can zoom in on a room with it, and it's tested without a screen.
//
//   const pose = frameRoom({ at, yaw, size, viewW, viewH, fov });
//   camera.position.copy(pose.position);
//   camera.lookAt(pose.target);
//
// The pose looks at the room from in front of its door, down at `pitch`, as
// close as it can get with the whole room (floor, walls and all) still in the
// area, and with the room's middle in the middle of the area.

import { BOX_SIDE, boxDocksRight } from '../../room';

export type V3 = { x: number; y: number; z: number };
export type Area = { x: number; y: number; w: number; h: number };

/** How steeply the camera looks down at a room, by default (radians). */
export const ROOM_PITCH = 0.9;

/**
 * The part of the screen a room should fill, in CSS pixels: under the HUD
 * and the room's bar, and beside the conversation box on a wide screen (it
 * docks right) or above it on a narrow one (it comes up from the bottom).
 */
export function roomArea(w: number, h: number): Area {
  const side = boxDocksRight(w, h);
  const top = 132;
  const under = side ? 24 : Math.max(24, h * 0.46 + 8);
  const aw = Math.max(200, w - (side ? BOX_SIDE : 0) - 24);
  const ah = Math.max(160, h - top - under);
  const cx = side ? (w - BOX_SIDE) / 2 : w / 2;
  return { x: cx - aw / 2, y: top, w: aw, h: ah };
}

/** How much to scale a room (its outer size, in its own units) so all of it stands within `radius` of its middle. */
export function fitScale(size: { w: number; d: number }, radius: number) {
  return radius / Math.hypot(size.w / 2, size.d / 2);
}

export interface RoomShot {
  /** The middle of the room's floor, in world space. */
  at: V3;
  /** Which way its door faces: radians about +y, 0 is +z (like a place's `faces`). */
  yaw: number;
  /** Its outer size in world units: across (w), front to back (d), and the walls' height (h). */
  size: { w: number; d: number; h: number };
  /** The canvas, in CSS pixels, and the camera's vertical field of view in degrees. */
  viewW: number;
  viewH: number;
  fov: number;
  /** How steeply to look down, in radians: 0 level, π/2 straight down. */
  pitch?: number;
  /** Where on screen to fit it, in CSS pixels (roomArea() by default), and how much to keep clear inside that. */
  area?: Area;
  margin?: number;
}

export interface CameraPose {
  /** What the camera looks at, and where it is. */
  target: V3;
  position: V3;
  /** The same thing as a rig: distance from the target, and how it's turned (position = target + dist × (sin yaw cos pitch, sin pitch, cos yaw cos pitch)). */
  dist: number;
  pitch: number;
  yaw: number;
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Where a camera should be to show a room: see the top of this file. */
export function frameRoom(o: RoomShot): CameraPose {
  const pitch = o.pitch ?? ROOM_PITCH;
  const { yaw, at, size, viewW: W, viewH: H } = o;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // The camera's axes: back toward it from what it looks at, right, and up.
  const back = { x: Math.sin(yaw) * cp, y: sp, z: Math.cos(yaw) * cp };
  const fwd = { x: -back.x, y: -back.y, z: -back.z };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
  const tanV = Math.tan((o.fov * Math.PI) / 360);
  const tanH = tanV * (W / H);
  const area = o.area ?? roomArea(W, H);
  const m = o.margin ?? 16;

  // The box's corners, turned to face the way the door does.
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: V3[] = [];
  for (const lx of [-size.w / 2, size.w / 2]) for (const lz of [-size.d / 2, size.d / 2]) for (const y of [0, size.h]) {
    corners.push({ x: at.x + lx * c + lz * s, y: at.y + y, z: at.z - lx * s + lz * c });
  }
  // The middle of the box lands in the middle of the area: so far off the axis, in normalised device coordinates.
  const mid = { x: at.x, y: at.y + size.h / 2, z: at.z };
  const nx = ((area.x + area.w / 2) / W) * 2 - 1;
  const ny = 1 - ((area.y + area.h / 2) / H) * 2;

  const pose = (d: number) => {
    const u = nx * d * tanH;
    const v = ny * d * tanV;
    const target = { x: mid.x - right.x * u - up.x * v, y: mid.y - right.y * u - up.y * v, z: mid.z - right.z * u - up.z * v };
    const position = { x: target.x + back.x * d, y: target.y + back.y * d, z: target.z + back.z * d };
    return { target, position };
  };
  const fits = (d: number) => {
    const { position } = pose(d);
    for (const p of corners) {
      const rel = { x: p.x - position.x, y: p.y - position.y, z: p.z - position.z };
      const depth = dot(rel, fwd);
      if (depth < 0.5) return false;
      const sx = ((dot(rel, right) / (depth * tanH)) * 0.5 + 0.5) * W;
      const sy = (0.5 - (dot(rel, up) / (depth * tanV)) * 0.5) * H;
      if (sx < area.x + m || sx > area.x + area.w - m || sy < area.y + m || sy > area.y + area.h - m) return false;
    }
    return true;
  };

  // The nearest distance it all fits at: it fits from some distance on, so halve the gap until it's found.
  let hi = Math.hypot(size.w, size.d, size.h);
  while (!fits(hi) && hi < 1e4) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 32; i++) {
    const d = (lo + hi) / 2;
    if (fits(d)) hi = d;
    else lo = d;
  }
  return { ...pose(hi), dist: hi, pitch, yaw };
}
