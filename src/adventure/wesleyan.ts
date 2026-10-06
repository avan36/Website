// Chapter 3: Wesleyan's campus as data, traced from the university's visitor
// map. Everything is in that map's pixels (it is 1700 square, north up), so a
// street or a building here can be checked against the map by eye; toWorld()
// turns them into world units for the 3D scene and the race.
//
// The layout is simplified: streets are straightened, and the buildings are
// footprints where the map draws them, not surveyed. Only the places named
// below have their own models; the rest are plain campus buildings.

import type { Vec } from './track';

/** World units per map pixel. */
export const SCALE = 0.2;
/** The map pixel at the middle of the world. */
const CX = 850;
const CZ = 850;

export const toWorld = ([px, py]: readonly [number, number]): Vec => ({ x: (px - CX) * SCALE, z: (py - CZ) * SCALE });
export const toMap = (v: Vec): [number, number] => [v.x / SCALE + CX, v.z / SCALE + CZ];

/** The edge of the drivable world, in map pixels. */
export const BOUNDS = { x0: 40, y0: 30, x1: 1660, y1: 1660 };

/** Half a road's width, in map pixels (4 world units). */
export const ROAD_HALF = 20;

export type Street = { id: string; name: string; pts: [number, number][] };

export const streets: Street[] = [
  { id: 'washington', name: 'Washington Street', pts: [[40, 100], [600, 90], [1340, 60], [1660, 42]] },
  { id: 'terrace', name: 'Washington Terrace', pts: [[600, 140], [1000, 128], [1340, 110]] },
  { id: 'mount-vernon', name: 'Mount Vernon Street', pts: [[790, 140], [790, 500], [800, 515]] },
  { id: 'wyllys', name: 'Wyllys Avenue', pts: [[800, 515], [1050, 480], [1320, 440]] },
  { id: 'high', name: 'High Street', pts: [[1345, 30], [1320, 440], [1305, 780], [1290, 1010], [1290, 1660]] },
  { id: 'church', name: 'Church Street', pts: [[700, 985], [1000, 1000], [1290, 1010], [1660, 950]] },
  { id: 'cross', name: 'Cross Street', pts: [[40, 1190], [480, 1060], [700, 985]] },
  { id: 'vine', name: 'Vine Street', pts: [[600, 90], [600, 140], [560, 380], [520, 700], [480, 1060]] },
  { id: 'knowles', name: 'Knowles Avenue', pts: [[250, 1125], [420, 800], [522, 680]] },
  { id: 'court', name: 'Court Street', pts: [[1340, 330], [1660, 280]] },
  { id: 'college', name: 'College Street', pts: [[1314, 600], [1660, 520]] },
  { id: 'williams', name: 'Williams Street', pts: [[1305, 790], [1660, 730]] },
  { id: 'pearl', name: 'Pearl Street', pts: [[1585, 60], [1605, 960]] },
  { id: 'lawn', name: 'Lawn Avenue', pts: [[640, 1265], [1000, 1200], [1290, 1140]] },
  { id: 'pine', name: 'Pine Street', pts: [[700, 985], [640, 1265], [590, 1660]] },
  { id: 'home', name: 'Home Avenue', pts: [[905, 1206], [910, 1660]] },
];

/**
 * The race course: a closed loop along the streets, clockwise on the map.
 * Wyllys past Usdan, down High, along Church past Olin and Exley, out Cross,
 * up Vine, along the Terrace and down Mount Vernon back to Wyllys.
 */
export const course: [number, number][] = [
  [800, 515], [1050, 480], [1320, 440], [1305, 780], [1290, 1010], [1000, 1000], [700, 985],
  [480, 1060], [520, 700], [560, 380], [600, 140], [790, 140], [790, 500],
];

export type Landmark = {
  id: string;
  name: string;
  /** What it is, in a sentence. Only plain facts about the building. */
  note: string;
};

export const landmarks: Landmark[] = [
  { id: 'usdan', name: 'Usdan University Center', note: 'The campus center on Wyllys Avenue, with the big dining hall inside.' },
  { id: 'fayerweather', name: 'Fayerweather', note: 'Red brick and two pointed turrets, right next to Usdan.' },
  { id: 'olin', name: 'Olin Memorial Library', note: 'The main library, on Church Street.' },
  { id: 'exley', name: 'Exley Science Center', note: 'The tall concrete tower of the sciences, on Church Street.' },
  { id: 'foss-hill', name: 'Foss Hill', note: 'The grassy hill in the middle of campus, looking down over Andrus Field.' },
  { id: 'andrus', name: 'Andrus Field', note: 'The big green at the heart of campus.' },
];

/** Gates round the course, in race order. The first is the start and finish. Points are snapped onto the course. */
export const gates: { at: [number, number]; name: string; landmark?: string }[] = [
  { at: [880, 504], name: 'Wyllys Avenue' },
  { at: [1060, 479], name: 'Usdan', landmark: 'usdan' },
  { at: [1312, 600], name: 'High Street' },
  { at: [1296, 900], name: 'High Street' },
  { at: [1160, 1005], name: 'Olin', landmark: 'olin' },
  { at: [890, 994], name: 'Exley', landmark: 'exley' },
  { at: [560, 1032], name: 'Cross Street' },
  { at: [520, 700], name: 'Vine Street' },
  { at: [580, 260], name: 'Vine Street' },
  { at: [790, 320], name: 'Mount Vernon Street' },
];

export type Style = 'brick' | 'brownstone' | 'stone' | 'white';

export type Building = {
  /** Center, in map pixels. */
  at: [number, number];
  /** Footprint, in map pixels, before turning. */
  w: number;
  d: number;
  /** Turned this many degrees clockwise on the map. */
  turn: number;
  /** Height in world units. */
  h: number;
  style: Style;
  /** A named place with its own model. */
  landmark?: string;
};

export const buildings: Building[] = [
  // The named ones.
  { at: [1050, 562], w: 130, d: 64, turn: -8, h: 7, style: 'brick', landmark: 'usdan' },
  { at: [1142, 548], w: 40, d: 92, turn: -8, h: 9, style: 'brick', landmark: 'fayerweather' },
  { at: [1170, 930], w: 110, d: 56, turn: 2, h: 8, style: 'brick', landmark: 'olin' },
  { at: [880, 1070], w: 200, d: 90, turn: 3, h: 4, style: 'stone', landmark: 'exley' },
  // North of Wyllys.
  { at: [900, 440], w: 60, d: 40, turn: -6, h: 6, style: 'brick' },
  { at: [1050, 410], w: 80, d: 40, turn: -6, h: 7, style: 'brownstone' },
  { at: [1210, 380], w: 60, d: 60, turn: -4, h: 6, style: 'brick' },
  { at: [1180, 270], w: 50, d: 90, turn: -4, h: 6, style: 'stone' },
  { at: [1060, 240], w: 50, d: 44, turn: -4, h: 5, style: 'white' },
  { at: [930, 200], w: 150, d: 70, turn: -2, h: 8, style: 'stone' },
  { at: [680, 230], w: 60, d: 70, turn: 0, h: 5, style: 'white' },
  // College Row, along High Street.
  { at: [1255, 620], w: 30, d: 80, turn: 0, h: 9, style: 'brownstone' },
  { at: [1250, 735], w: 30, d: 70, turn: 0, h: 10, style: 'brownstone' },
  { at: [1245, 860], w: 36, d: 70, turn: 0, h: 9, style: 'brownstone' },
  // In the middle.
  { at: [1120, 700], w: 40, d: 80, turn: 0, h: 6, style: 'brick' },
  { at: [1110, 820], w: 60, d: 40, turn: 0, h: 6, style: 'stone' },
  { at: [1010, 880], w: 50, d: 80, turn: 2, h: 7, style: 'brick' },
  { at: [890, 890], w: 100, d: 56, turn: 2, h: 6, style: 'brownstone' },
  // West of the hill.
  { at: [640, 880], w: 60, d: 44, turn: 0, h: 5, style: 'brick' },
  { at: [380, 640], w: 70, d: 50, turn: 0, h: 4, style: 'white' },
  // East of High Street.
  { at: [1420, 470], w: 50, d: 50, turn: 0, h: 5, style: 'white' },
  { at: [1400, 400], w: 50, d: 60, turn: 0, h: 5, style: 'white' },
  { at: [1430, 830], w: 60, d: 50, turn: 0, h: 5, style: 'brick' },
  { at: [1500, 840], w: 70, d: 40, turn: -6, h: 6, style: 'stone' },
  { at: [1350, 1190], w: 40, d: 60, turn: 0, h: 5, style: 'white' },
  // South of Church.
  { at: [1110, 1085], w: 100, d: 50, turn: -4, h: 6, style: 'brick' },
  { at: [1180, 1270], w: 80, d: 60, turn: 0, h: 5, style: 'brick' },
  { at: [760, 1180], w: 60, d: 50, turn: 0, h: 4, style: 'white' },
  // The gym, down in the southwest corner.
  { at: [310, 1330], w: 160, d: 150, turn: 0, h: 9, style: 'stone' },
];

/** Foss Hill: a round grassy hill, in map pixels, and its height in world units. */
export const fossHill = { at: [690, 660] as [number, number], r: 110, h: 5 };
/** Andrus Field: the green, in map pixels. */
export const andrusField = { at: [950, 700] as [number, number], w: 180, d: 190, turn: 0 };

/** How high the ground is here (world units), for the hill. Flat everywhere else. */
export function groundHeight(x: number, z: number): number {
  const c = toWorld(fossHill.at);
  const r = fossHill.r * SCALE;
  const d = Math.hypot(x - c.x, z - c.z) / r;
  if (d >= 1) return 0;
  const t = 1 - d * d;
  return fossHill.h * t * t;
}
