import test from 'node:test';
import assert from 'node:assert/strict';
import { Traffic } from '../src/traffic.js';
import { N, ROAD, HALF, roadPos, mulberry32 } from '../src/layout.js';
import { signal, hasSignal, axisOf, greenFor, RoadRules, CYCLE, GREEN, YELLOW } from '../src/signals.js';

const onRoad = c => {
  for (let k = 0; k <= N; k++) {
    if (Math.abs(c.x - roadPos(k)) <= ROAD / 2 || Math.abs(c.z - roadPos(k)) <= ROAD / 2) return true;
  }
  return false;
};

test('ten minutes of traffic: cars stay on roads, keep moving, never overlap and wait for red lights', () => {
  const parked = { x: HALF + 200, z: HALF + 200 };          // the player, well out of the way
  const traffic = new Traffic(22, mulberry32(42), { x: 0, z: 0 });
  const travelled = new Map(traffic.cars.map(c => [c, 0]));
  let closest = Infinity, longestStop = 0, respawns = 0, crossings = 0;
  const original = traffic.respawn.bind(traffic);
  traffic.respawn = (...args) => { respawns++; return original(...args); };

  const dt = 1 / 30;
  for (let t = 0; t < 600; t += dt) {
    const before = traffic.cars.map(c => [c.x, c.z]);
    const turning = traffic.cars.map(c => !!c.turn);
    traffic.update(dt, parked);
    traffic.cars.forEach((c, k) => {
      if (!c.turn || turning[k]) return;                    // this car has just driven into an intersection
      crossings++;
      const [i, j] = c.turn.node;
      // its own approach axis: the way it was heading before the turn
      const approach = Math.abs(Math.sin(Math.atan2(c.turn.p1[0] - c.turn.p0[0], c.turn.p1[1] - c.turn.p0[1]))) > 0.7 ? 'ew' : 'ns';
      if (hasSignal(i, j)) assert.notEqual(signal(i, j, approach === 'ew' ? 'ns' : 'ew', traffic.time), 'green', 'never enters while the cross street has green');
    });
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
  console.log(`closest approach ${closest.toFixed(2)} m, longest stop ${longestStop.toFixed(1)} s, least distance ${least.toFixed(0)} m, respawns ${respawns}, intersections crossed ${crossings}`);
  assert.ok(closest > 2.2, `cars never overlap (closest ${closest})`);
  assert.ok(least > 1000, `every car keeps driving (least ${least} m)`);
  assert.ok(crossings > 500);
  assert.equal(respawns, 0, 'no car got stuck long enough to be respawned');
  assert.ok(traffic.boxes.size <= 22);
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

test('signals: each axis gets green, yellow, red in turn and the two never overlap', () => {
  for (const [i, j] of [[3, 3], [0, 2], [5, 4]]) {
    const seen = { ns: new Set(), ew: new Set() };
    for (let t = 0; t < CYCLE * 2; t += 0.1) {
      const ns = signal(i, j, 'ns', t), ew = signal(i, j, 'ew', t);
      seen.ns.add(ns); seen.ew.add(ew);
      assert.ok(ns === 'red' || ew === 'red', 'one axis is always red');
      assert.equal(greenFor(i, j, 'ns', t) >= 0, ns === 'green');
    }
    assert.equal(seen.ns.size, 3); assert.equal(seen.ew.size, 3);
  }
  assert.equal(signal(0, 0, 'ns', 5), 'green', 'corners have no lights');
  assert.ok(!hasSignal(N, 0) && hasSignal(3, 0));
  assert.equal(axisOf([0, 1]), 'ns'); assert.equal(axisOf([-1, 0]), 'ew');
  assert.ok(GREEN > 0 && YELLOW > 0);
});

test('road rules: running a red light and driving on the wrong side are caught', () => {
  // find a moment when north-south is red and one when it is green at intersection (3, 3)
  let red = 0, green = 0;
  while (signal(3, 3, 'ns', red) !== 'red') red += 0.5;
  while (signal(3, 3, 'ns', green) !== 'green') green += 0.5;
  const approach = (time, lane) => {
    const rules = new RoadRules();
    let ran = false, wrong = 0;
    for (let z = roadPos(3) - 30; z < roadPos(3) + 5; z += 0.25) {       // driving south at 15 m/s
      const r = rules.update({ x: roadPos(3) + lane, z, vx: 0, vz: 15 }, time);
      ran ||= r.redLight; wrong += r.wrongSide ? 1 : 0;
    }
    return { ran, wrong };
  };
  assert.deepEqual(approach(red, -5.25), { ran: true, wrong: 0 });       // right-hand lane, red light
  assert.equal(approach(green, -5.25).ran, false);
  assert.ok(approach(green, 3).wrong > 20, 'left of the centre line while heading south');
  // creeping in slowly is not a violation
  const rules = new RoadRules();
  let crept = false;
  for (let z = roadPos(3) - 12; z < roadPos(3); z += 0.05) crept ||= rules.update({ x: roadPos(3) - 5.25, z, vx: 0, vz: 2 }, red).redLight;
  assert.equal(crept, false);
});
