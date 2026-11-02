// Solid boxes that turn and move: the bus and each car of the train, for the
// explorer to bump into in every view that lets you walk. Pure geometry. A box
// is its middle, which way it faces (0 = south, π/2 = east, as everywhere on
// the island) and how far it reaches along that way and across it. The
// explorer is a circle, and gets pushed out to the nearest side, so a box that
// drives into you nudges you aside and you can never walk through one.

export interface Box {
  x: number;
  z: number;
  yaw: number;
  /** Half its length, along the way it faces. */
  along: number;
  /** Half its width. */
  across: number;
}

/** A box round a vehicle at this pose. */
export function boxAt(p: { x: number; z: number; yaw: number }, length: number, width: number): Box {
  return { x: p.x, z: p.z, yaw: p.yaw, along: length / 2, across: width / 2 };
}

/**
 * Where a circle of radius r at (x, z) ends up once it's out of the box, or
 * null if it isn't touching it. Inside, it goes out the nearest side.
 */
export function pushOut(x: number, z: number, b: Box, r: number): { x: number; z: number } | null {
  const ux = Math.sin(b.yaw);
  const uz = Math.cos(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  // Along the box (u) and across it (w = u turned a quarter, to the right).
  const a = dx * ux + dz * uz;
  const c = dx * uz - dz * ux;
  const ca = Math.max(-b.along, Math.min(b.along, a));
  const cc = Math.max(-b.across, Math.min(b.across, c));
  let na: number;
  let nc: number;
  if (ca !== a || cc !== c) {
    // Outside: push away from the nearest point on the box until just touching.
    const ea = a - ca;
    const ec = c - cc;
    const d = Math.hypot(ea, ec);
    if (d >= r) return null;
    na = ca + (ea / d) * r;
    nc = cc + (ec / d) * r;
  } else {
    // Inside: out through whichever side is nearest.
    const outA = b.along - Math.abs(a);
    const outC = b.across - Math.abs(c);
    if (outA < outC) (na = (a < 0 ? -1 : 1) * (b.along + r)), (nc = c);
    else (na = a), (nc = (c < 0 ? -1 : 1) * (b.across + r));
  }
  return { x: b.x + na * ux + nc * uz, z: b.z + na * uz - nc * ux };
}

/** Is a circle of radius r at (x, z) overlapping the box? */
export function touches(x: number, z: number, b: Box, r: number) {
  return pushOut(x, z, b, r) !== null;
}
