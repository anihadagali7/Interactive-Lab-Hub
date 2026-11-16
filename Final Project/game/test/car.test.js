import test from 'node:test';
import assert from 'node:assert/strict';
import { Car, TOP_SPEED, NITRO_SPEED, impactSeverity } from '../src/car.js';

const idle = { steer: 0, drive: 0, handbrake: false, nitro: false };
const run = (car, seconds, controls, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) car.update(dt, { ...idle, ...controls });
};

test('accelerates to top speed and no further', () => {
  const car = new Car();
  run(car, 3, { drive: 1 });
  assert.ok(car.forwardSpeed > 15, `reaches a useful speed in 3 s (${car.forwardSpeed})`);
  run(car, 20, { drive: 1 });
  assert.ok(car.forwardSpeed <= TOP_SPEED + 0.01 && car.forwardSpeed > TOP_SPEED - 2);
  assert.ok(Math.abs(car.x) < 1e-6 && car.z > 100, 'heading 0 drives along +z');
});

test('nitro goes faster, drains the tank, then eases back and refills', () => {
  const car = new Car();
  run(car, 2.5, { drive: 1, nitro: true });
  assert.ok(car.boosting && car.forwardSpeed > TOP_SPEED);
  assert.ok(car.forwardSpeed <= NITRO_SPEED + 0.01);
  run(car, 3, { drive: 1, nitro: true });
  assert.ok(!car.boosting && car.nitro < 0.12, 'tank runs dry');
  run(car, 6, { drive: 1 });
  assert.ok(car.forwardSpeed <= TOP_SPEED + 0.5, 'speed eases back to normal');
  assert.ok(car.nitro > 0.3, 'tank refills');
});

test('brakes to a stop, then reverses', () => {
  const car = new Car();
  run(car, 5, { drive: 1 });
  run(car, 1.5, { drive: -1 });
  assert.ok(Math.abs(car.forwardSpeed) < 9.01, 'has stopped or is backing up');
  run(car, 4, { drive: -1 });
  assert.ok(car.forwardSpeed < -5 && car.forwardSpeed >= -9.01);
});

test('coasts to a complete stop', () => {
  const car = new Car();
  run(car, 2, { drive: 1 });
  run(car, 30, {});
  assert.equal(car.speed, 0);
});

test('steering right turns toward the car\'s right-hand side', () => {
  const car = new Car();            // heading +z, so its right is -x
  run(car, 1.5, { drive: 1 });
  run(car, 1, { drive: 1, steer: 1 });
  assert.ok(car.x < -1, `moved right (x=${car.x})`);
  assert.ok(car.yaw < 0);
});

test('a wall stops the car and reports the impact', () => {
  const car = new Car();
  const wall = [{ minX: -50, maxX: 50, minZ: 40, maxZ: 60 }];
  let hardest = 0;
  for (let t = 0; t < 6; t += 1 / 120) {
    car.update(1 / 120, { ...idle, drive: 1 });
    hardest = Math.max(hardest, car.collide(wall, []).speed);
  }
  assert.ok(car.z + 1.45 + 0.95 <= 40 + 0.05, `nose stays out of the wall (z=${car.z})`);
  assert.ok(hardest > 10, `felt the crash (${hardest})`);
  assert.ok(impactSeverity(hardest) > 0.8);
  assert.equal(impactSeverity(1), 0);
});

test('a glancing hit slides along the wall instead of sticking', () => {
  const car = new Car();
  car.place(0, 0, 0.35);            // heading mostly +z, drifting toward +x
  const wall = [{ minX: 6, maxX: 20, minZ: -100, maxZ: 400 }];
  for (let t = 0; t < 5; t += 1 / 120) {
    car.update(1 / 120, { ...idle, drive: 1 });
    car.collide(wall, []);
  }
  assert.ok(car.z > 40, `kept moving along the wall (z=${car.z})`);
  assert.ok(car.x <= 6 - 0.95 + 0.3, 'stayed outside the wall');
});

test('a post pushes the car aside', () => {
  const car = new Car();
  const post = { x: 0.4, z: 20, r: 0.3 };
  for (let t = 0; t < 4; t += 1 / 120) {
    car.update(1 / 120, { ...idle, drive: 0.5 });
    car.collide([], [post]);
  }
  for (const o of [1.45, 0, -1.45]) {
    const d = Math.hypot(car.x + car.fx * o - post.x, car.z + car.fz * o - post.z);
    assert.ok(d >= 0.95 + 0.3 - 0.05, 'no probe overlaps the post');
  }
});
