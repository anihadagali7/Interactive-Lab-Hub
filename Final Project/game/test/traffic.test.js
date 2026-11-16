import test from 'node:test';
import assert from 'node:assert/strict';
import { Traffic } from '../src/traffic.js';
import { N, ROAD, HALF, roadPos, mulberry32 } from '../src/layout.js';

const onRoad = c => {
  for (let k = 0; k <= N; k++) {
    if (Math.abs(c.x - roadPos(k)) <= ROAD / 2 || Math.abs(c.z - roadPos(k)) <= ROAD / 2) return true;
  }
  return false;
};

test('ten minutes of traffic: cars stay on roads, keep moving and never overlap', () => {
  const parked = { x: HALF + 200, z: HALF + 200 };          // the player, well out of the way
  const traffic = new Traffic(22, mulberry32(42), { x: 0, z: 0 });
  const travelled = new Map(traffic.cars.map(c => [c, 0]));
  let closest = Infinity, longestStop = 0, respawns = 0;
  const original = traffic.respawn.bind(traffic);
  traffic.respawn = (...args) => { respawns++; return original(...args); };

  const dt = 1 / 30;
  for (let t = 0; t < 600; t += dt) {
    const before = traffic.cars.map(c => [c.x, c.z]);
    traffic.update(dt, parked);
    traffic.cars.forEach((c, k) => {
      const moved = Math.hypot(c.x - before[k][0], c.z - before[k][1]);
      assert.ok(moved < 1, `no teleporting (moved ${moved} in one step)`);
      travelled.set(c, travelled.get(c) + moved);
      assert.ok(onRoad(c), `car on a road at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
      longestStop = Math.max(longestStop, c.still);
    });
    for (let a = 0; a < traffic.cars.length; a++) for (let b = a + 1; b < traffic.cars.length; b++) {
      closest = Math.min(closest, Math.hypot(traffic.cars[a].x - traffic.cars[b].x, traffic.cars[a].z - traffic.cars[b].z));
    }
  }
  const least = Math.min(...travelled.values());
  console.log(`closest approach ${closest.toFixed(2)} m, longest stop ${longestStop.toFixed(1)} s, least distance ${least.toFixed(0)} m, respawns ${respawns}`);
  assert.ok(closest > 2.2, `cars never overlap (closest ${closest})`);
  assert.ok(least > 1500, `every car keeps driving (least ${least} m)`);
  assert.equal(respawns, 0, 'no car got stuck long enough to be respawned');
  assert.ok(traffic.locks.size <= 22);
});

test('traffic stops behind a stationary player and reports collision circles', () => {
  const traffic = new Traffic(1, mulberry32(3), { x: 9999, z: 9999 });
  const car = traffic.cars[0];
  // park the player 20 m dead ahead in the same lane
  const player = { x: car.x + Math.sin(car.yaw) * 20, z: car.z + Math.cos(car.yaw) * 20 };
  for (let t = 0; t < 8; t += 1 / 30) traffic.update(1 / 30, player);
  const gap = Math.hypot(player.x - car.x, player.z - car.z);
  assert.equal(car.speed, 0);
  assert.ok(gap > 4.5 && gap < 9, `stopped a car length short (${gap})`);
  assert.equal(traffic.circles.length, 2);
  traffic.bump(car);
  assert.ok(car.stun > 0);
});
