import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N, ROAD, BLOCK, SIZE, PLACES, BLOCK_PLAN, roadPos, blockMin, nearestNodes, nodePos,
  route, routeLength, exitsFrom, mulberry32,
} from '../src/layout.js';
import { speedStars, safetyStars, chatStars, rateTrip, fareFor, parTime } from '../src/scoring.js';

const onARoad = p => {
  for (let k = 0; k <= N; k++) {
    if (Math.abs(p.x - roadPos(k)) <= ROAD / 2 + 1e-6 || Math.abs(p.z - roadPos(k)) <= ROAD / 2 + 1e-6) return true;
  }
  return false;
};

test('grid geometry is consistent', () => {
  assert.equal(SIZE, N * BLOCK + (N + 1) * ROAD);
  assert.equal(roadPos(0), -SIZE / 2 + ROAD / 2);
  assert.equal(roadPos(N), SIZE / 2 - ROAD / 2);
  assert.equal(blockMin(0), roadPos(0) + ROAD / 2);
  assert.equal(BLOCK_PLAN.length, N);
  assert.ok(BLOCK_PLAN.every(row => row.length === N));
});

test('every place has a kerb stop on a road and a wait spot on its block', () => {
  assert.equal(new Set(PLACES.map(p => p.id)).size, PLACES.length);
  const segments = new Set();
  for (const p of PLACES) {
    assert.ok(onARoad(p.stop), `${p.id} stop is on a road`);
    assert.ok(!onARoad(p.wait), `${p.id} rider waits off the road`);
    const key = JSON.stringify(p.nodes);
    assert.ok(!segments.has(key), `${p.id} does not share its road segment with another place`);
    segments.add(key);
    // the stop lies between its two intersections
    const [a, b] = p.nodes.map(nodePos);
    assert.ok(Math.abs(Math.hypot(p.stop.x - a.x, p.stop.z - a.z) - Math.hypot(p.stop.x - b.x, p.stop.z - b.z)) < 1e-6);
  }
});

test('nearestNodes: one node inside an intersection, two along a road', () => {
  assert.deepEqual(nearestNodes({ x: roadPos(2) + 3, z: roadPos(4) - 2 }), [[2, 4]]);
  assert.deepEqual(nearestNodes({ x: roadPos(2) + 3, z: roadPos(4) + 30 }), [[2, 4], [2, 5]]);
  assert.deepEqual(nearestNodes({ x: roadPos(1) + 30, z: roadPos(0) - 2 }), [[1, 0], [2, 0]]);
});

test('routes follow roads, start and end where asked, and are shortest', () => {
  const rng = mulberry32(7);
  for (let n = 0; n < 300; n++) {
    // a random point on a random road
    const k = Math.floor(rng() * (N + 1));
    const along = -SIZE / 2 + rng() * SIZE, across = roadPos(k) + (rng() - 0.5) * (ROAD - 2);
    const from = rng() < 0.5 ? { x: across, z: along } : { x: along, z: across };
    const place = PLACES[Math.floor(rng() * PLACES.length)];
    const pts = route(from, place);
    assert.deepEqual(pts[0], from);
    assert.deepEqual(pts.at(-1), place.stop);
    // interior points are intersections, and each leg between them is axis-aligned
    for (let s = 1; s < pts.length - 2; s++) {
      assert.ok(pts[s].x === pts[s + 1].x || pts[s].z === pts[s + 1].z, 'legs between intersections follow the grid');
    }
    // no shorter choice of end intersections exists
    let best = Infinity;
    for (const a of nearestNodes(from)) for (const b of place.nodes) {
      const pa = nodePos(a), pb = nodePos(b);
      best = Math.min(best, Math.hypot(from.x - pa.x, from.z - pa.z) + Math.abs(pa.x - pb.x) + Math.abs(pa.z - pb.z) +
        Math.hypot(place.stop.x - pb.x, place.stop.z - pb.z));
    }
    assert.ok(routeLength(pts) <= best + 1e-6, `route ${routeLength(pts)} vs best ${best}`);
  }
});

test('a car already on the place\'s road segment is routed straight to it', () => {
  const place = PLACES[0];
  const [a] = place.nodes.map(nodePos);
  const from = { x: (a.x + place.stop.x) / 2, z: (a.z + place.stop.z) / 2 };
  assert.equal(route(from, place).length, 2);
});

test('intersections offer 2 exits at corners, 3 on edges, 4 inside', () => {
  assert.equal(exitsFrom(0, 0).length, 2);
  assert.equal(exitsFrom(3, 0).length, 3);
  assert.equal(exitsFrom(3, 3).length, 4);
  assert.equal(exitsFrom(N, N).length, 2);
});

test('scoring: stars stay in 1..5 and move the right way', () => {
  const par = parTime(400);
  assert.equal(speedStars(par * 0.5, par), 5);
  assert.equal(speedStars(par, par), 4);
  assert.ok(speedStars(par * 1.5, par) < 4 && speedStars(par * 1.5, par) > 1);
  assert.equal(speedStars(par * 5, par), 1);
  assert.equal(safetyStars(0), 5);
  assert.equal(safetyStars(1.5), 3.5);
  assert.equal(safetyStars(99), 1);
  assert.equal(chatStars([]), 3);
  assert.equal(chatStars([5, 3, 1]), 3);
  const perfect = rateTrip({ seconds: par * 0.5, par, damage: 0, chatScores: [5, 5] });
  assert.equal(perfect.overall, 5);
  const awful = rateTrip({ seconds: par * 5, par, damage: 9, chatScores: [1] });
  assert.equal(awful.overall, 1);
  assert.ok(fareFor(400, 5).tip > fareFor(400, 4.2).tip);
  assert.equal(fareFor(400, 3.9).tip, 0);
});
