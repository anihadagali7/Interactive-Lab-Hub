// City grid math, named places and GPS routing. No rendering code: runs in Node for tests.
//
// World axes: x = east, z = south, y = up. A heading (yaw) of 0 faces +z; forward is
// (sin yaw, cos yaw), and the car's right-hand side is (-cos yaw, sin yaw).

export const N = 6;                  // blocks per side
export const BLOCK = 70;             // block edge length, metres
export const ROAD = 16;              // road width: 4 lanes of 3.5 m plus gutters
export const PITCH = BLOCK + ROAD;
export const SIZE = N * BLOCK + (N + 1) * ROAD;
export const HALF = SIZE / 2;
export const LANE_INNER = 1.75;      // lane centre offsets from the road centreline
export const LANE_OUTER = 5.25;
export const SIDEWALK = 3;           // sidewalk ring inside each block edge
export const CURB = ROAD / 2 - LANE_OUTER;   // kerb-lane centre, measured from the block edge

/** Centreline coordinate of road k (0..N). The same formula serves x and z. */
export const roadPos = k => -HALF + ROAD / 2 + k * PITCH;
/** Minimum coordinate of block b (0..N-1). */
export const blockMin = b => -HALF + ROAD + b * PITCH;
export const blockCenter = b => blockMin(b) + BLOCK / 2;

/** Right-hand side of a direction of travel (dx, dz). */
export const rightOf = (dx, dz) => [-dz, dx];

/** Deterministic random numbers, so the city is the same on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What stands on each block: BLOCK_PLAN[j][i], j = row (north to south), i = column (west to east).
export const BLOCK_PLAN = [
  ['res',      'shops',   'mid',    'mid',    'res',   'lakeside'],
  ['hospital', 'pizza',   'office', 'museum', 'mid',   'res'],
  ['res',      'mid',     'park',   'hotel',  'cafe',  'apartments'],
  ['mid',      'office',  'office', 'tech',   'office', 'mid'],
  ['stadium',  'mid',     'shops',  'mid',    'mall',  'university'],
  ['res',      'station', 'mid',    'res',    'shops', 'res'],
];

// Named pickup and drop-off places. `side` is the block edge the kerb stop is on.
const PLACE_DEFS = [
  { id: 'hospital',   name: 'City Hospital',        side: 'E', color: '#e5484d' },
  { id: 'pizza',      name: 'Pixel Pizza',          side: 'S', color: '#f76b15' },
  { id: 'museum',     name: 'Art Museum',           side: 'N', color: '#8e4ec6' },
  { id: 'lakeside',   name: 'Lakeside Park',        side: 'S', color: '#30a46c' },
  { id: 'park',       name: 'Central Park',         side: 'W', color: '#30a46c' },
  { id: 'hotel',      name: 'Grand Hotel',          side: 'S', color: '#d6409f' },
  { id: 'cafe',       name: 'Bean Scene Cafe',      side: 'E', color: '#a18072' },
  { id: 'apartments', name: 'Riverside Apartments', side: 'N', color: '#0090ff' },
  { id: 'tech',       name: 'Tech Tower',           side: 'E', color: '#00a2c7' },
  { id: 'stadium',    name: 'City Stadium',         side: 'N', color: '#3e63dd' },
  { id: 'mall',       name: 'Sunset Mall',          side: 'N', color: '#e54666' },
  { id: 'university', name: 'State University',     side: 'S', color: '#ad7f58' },
  { id: 'station',    name: 'Union Station',        side: 'N', color: '#6e56cf' },
];

const SIDES = {
  // outward normal of the block edge, and the two intersections that bound the road segment there
  N: { nx: 0, nz: -1, nodes: (i, j) => [[i, j], [i + 1, j]] },
  S: { nx: 0, nz: 1, nodes: (i, j) => [[i, j + 1], [i + 1, j + 1]] },
  W: { nx: -1, nz: 0, nodes: (i, j) => [[i, j], [i, j + 1]] },
  E: { nx: 1, nz: 0, nodes: (i, j) => [[i + 1, j], [i + 1, j + 1]] },
};

export const PLACES = PLACE_DEFS.map(def => {
  const j = BLOCK_PLAN.findIndex(row => row.includes(def.id));
  const i = BLOCK_PLAN[j].indexOf(def.id);
  const s = SIDES[def.side];
  const edge = BLOCK / 2;
  const cx = blockCenter(i), cz = blockCenter(j);
  return {
    ...def,
    block: [i, j],
    normal: [s.nx, s.nz],
    // where the car should stop: the kerb lane beside the block
    stop: { x: cx + s.nx * (edge + CURB), z: cz + s.nz * (edge + CURB) },
    // where the rider waits: on the sidewalk
    wait: { x: cx + s.nx * (edge - 1.5), z: cz + s.nz * (edge - 1.5) },
    nodes: s.nodes(i, j),
  };
});

export const nodePos = ([i, j]) => ({ x: roadPos(i), z: roadPos(j) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The intersections you can head for from a point: one if you are in an intersection, else the two ends of the nearest road segment. */
export function nearestNodes(p) {
  const ix = clamp(Math.round((p.x - roadPos(0)) / PITCH), 0, N);
  const iz = clamp(Math.round((p.z - roadPos(0)) / PITCH), 0, N);
  const dx = Math.abs(p.x - roadPos(ix)), dz = Math.abs(p.z - roadPos(iz));
  if (dx <= ROAD / 2 && dz <= ROAD / 2) return [[ix, iz]];
  if (dx <= dz) {                       // nearest road runs north-south
    const j = clamp(Math.floor((p.z - roadPos(0)) / PITCH), 0, N - 1);
    return [[ix, j], [ix, j + 1]];
  }
  const i = clamp(Math.floor((p.x - roadPos(0)) / PITCH), 0, N - 1);
  return [[i, iz], [i + 1, iz]];
}

const sameNodes = (a, b) => a.length === 2 && b.length === 2 &&
  a.every(n => b.some(m => m[0] === n[0] && m[1] === n[1]));

/**
 * GPS route from a point to a place's kerb stop, as a list of {x, z} points along road
 * centrelines. Every road in the grid is open, so the shortest path between two
 * intersections is an L shape; this picks the best pair of end intersections.
 */
export function route(from, place) {
  const to = place.stop;
  const fromNodes = nearestNodes(from);
  if (sameNodes(fromNodes, place.nodes)) return [from, to];
  let best = null;
  for (const a of fromNodes) {
    for (const b of place.nodes) {
      const pa = nodePos(a), pb = nodePos(b);
      const cost = dist(from, pa) + Math.abs(pa.x - pb.x) + Math.abs(pa.z - pb.z) + dist(pb, to);
      if (!best || cost < best.cost) best = { cost, a, b };
    }
  }
  const { a, b } = best;
  // Keep going the way the car's road already runs before turning, to save a turn.
  const onNorthSouthRoad = fromNodes.length === 2 && fromNodes[0][0] === fromNodes[1][0];
  const corner = onNorthSouthRoad ? [a[0], b[1]] : [b[0], a[1]];
  const points = [from, nodePos(a), nodePos(corner), nodePos(b), to];
  return points.filter((p, k) => k === 0 || dist(p, points[k - 1]) > 0.01);
}

export const routeLength = points =>
  points.slice(1).reduce((sum, p, k) => sum + dist(p, points[k]), 0);

/** Directions (dx, dz) you can leave intersection (i, j) by. */
export function exitsFrom(i, j) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) =>
    i + dx >= 0 && i + dx <= N && j + dz >= 0 && j + dz <= N);
}
