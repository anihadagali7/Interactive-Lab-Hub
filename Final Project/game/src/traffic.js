// Other cars. Each one follows lane centrelines around the grid: along a road segment, then
// through an intersection on a curve, choosing a new direction at random. An intersection
// lets one car through at a time, and every car brakes for whatever is in front of it,
// including the player.
//
// The movement logic takes no rendering imports so it can be tested in Node; pass a
// `makeMesh` function to give each car something to draw.
import { N, ROAD, PITCH, LANE_INNER, LANE_OUTER, roadPos, rightOf, exitsFrom } from './layout.js';

const H = ROAD / 2;                 // half an intersection: segments run from H to PITCH - H
const CRUISE = [8.5, 12.5];         // m/s range that cars pick from
const TURN_SPEED = 6.5;
const ACCEL = 3.5, DECEL = 10;
const GAP = 6.5;                    // metres kept to the car in front when stopped
const STUCK_SECONDS = 25;

const isLeft = (d, nd) => nd[0] === d[1] && nd[1] === -d[0];
const isStraight = (d, nd) => nd[0] === d[0] && nd[1] === d[1];

/** Pick the next direction at intersection (i, j) when arriving heading `dir`. No U-turns. */
function chooseExit(i, j, dir, rng) {
  const options = exitsFrom(i, j).filter(e => !(e[0] === -dir[0] && e[1] === -dir[1]));
  const weights = options.map(e => (isStraight(dir, e) ? 3 : isLeft(dir, e) ? 1.2 : 2));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < options.length; k++) if ((roll -= weights[k]) <= 0) return options[k];
  return options[options.length - 1];
}

/** Left turns are made from the inner lane, everything else from the outer one. */
const laneFor = (dir, nextDir) => (isLeft(dir, nextDir) ? LANE_INNER : LANE_OUTER);

function lanePoint(node, dir, along, lane) {
  const [rx, rz] = rightOf(dir[0], dir[1]);
  return [roadPos(node[0]) + dir[0] * along + rx * lane, roadPos(node[1]) + dir[1] * along + rz * lane];
}

export class Traffic {
  /**
   * @param count how many cars
   * @param rng   random source, 0..1
   * @param keepClear {x, z} cars are not spawned near here (the player's start)
   * @param makeMesh optional () => object with .position and .rotation
   */
  constructor(count, rng, keepClear, makeMesh = null) {
    this.rng = rng;
    this.locks = new Map();        // "i,j" -> the car allowed in that intersection
    this.cars = [];
    for (let n = 0; n < count; n++) {
      const car = { mesh: makeMesh ? makeMesh() : null, speed: 0, stun: 0, still: 0, cruise: CRUISE[0] + rng() * (CRUISE[1] - CRUISE[0]) };
      this.respawn(car, keepClear, 45);
      this.cars.push(car);
    }
  }

  /** Put a car on a random stretch of road, clear of other cars and of `avoid`. */
  respawn(car, avoid, clearance) {
    this.release(car);
    for (let tries = 0; tries < 200; tries++) {
      const from = [Math.floor(this.rng() * (N + 1)), Math.floor(this.rng() * (N + 1))];
      const exits = exitsFrom(from[0], from[1]);
      const dir = exits[Math.floor(this.rng() * exits.length)];
      const to = [from[0] + dir[0], from[1] + dir[1]];
      const nextDir = chooseExit(to[0], to[1], dir, this.rng);
      const lane = laneFor(dir, nextDir);
      const s = H + 6 + this.rng() * (PITCH - 2 * H - 18);
      const [x, z] = lanePoint(from, dir, s, lane);
      if (Math.hypot(x - avoid.x, z - avoid.z) < clearance) continue;
      if (this.cars.some(o => o !== car && Math.hypot(o.x - x, o.z - z) < 16)) continue;
      Object.assign(car, { from, dir, nextDir, lane, s, turn: null, x, z, yaw: Math.atan2(dir[0], dir[1]), speed: car.cruise, still: 0, holding: null, leaving: null });
      return;
    }
  }

  release(car) {
    for (const key of [car.holding, car.leaving]) if (key && this.locks.get(key) === car) this.locks.delete(key);
    car.holding = car.leaving = null;
  }

  /** The player ran into this car: it stops for a moment. */
  bump(car) { car.stun = 2; car.speed = 0; }

  /** Two circles per car, for the player's collision test. */
  get circles() {
    const list = [];
    for (const c of this.cars) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      list.push({ x: c.x + fx * 1.15, z: c.z + fz * 1.15, r: 1.0, car: c }, { x: c.x - fx * 1.15, z: c.z - fz * 1.15, r: 1.0, car: c });
    }
    return list;
  }

  update(dt, player) {
    for (const car of this.cars) this.drive(car, dt, player);
  }

  drive(car, dt, player) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let target = car.turn ? TURN_SPEED : car.cruise;

    // --- keep a gap to whatever is ahead in this car's path
    const look = 9 + car.speed * 1.4;
    const mind = (ox, oz) => {
      const dx = ox - car.x, dz = oz - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0.5 || ahead > look || Math.abs(dx * fz - dz * fx) > 2.3) return;
      target = Math.min(target, Math.max(0, (ahead - GAP) * 1.3));
    };
    for (const other of this.cars) if (other !== car) mind(other.x, other.z);
    mind(player.x, player.z);
    if (car.stun > 0) { car.stun -= dt; target = 0; }

    // --- the intersection ahead: take its lock if it is free, otherwise wait at the stop line
    if (!car.turn) {
      const to = [car.from[0] + car.dir[0], car.from[1] + car.dir[1]];
      const key = `${to[0]},${to[1]}`;
      const toLine = PITCH - H - 2.5 - car.s;                    // distance to the stop line
      if (toLine < 14 && car.holding !== key) {
        // A car queued behind this one on the same road must not hold the lock, or both wait forever.
        const holder = this.locks.get(key);
        const behind = holder && !holder.turn && holder.s < car.s &&
          holder.from[0] === car.from[0] && holder.from[1] === car.from[1] && holder.dir[0] === car.dir[0] && holder.dir[1] === car.dir[1];
        if (!holder || behind) {
          if (behind) holder.holding = null;
          this.locks.set(key, car); car.holding = key;
        } else target = Math.min(target, Math.max(0, toLine) * 0.9);
      }
      if (car.holding === key && !isStraight(car.dir, car.nextDir)) target = Math.min(target, TURN_SPEED + Math.max(0, toLine) * 0.5);
    }

    car.speed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, target - car.speed));
    if (car.speed < 0.08 && target < 0.1) car.speed = 0;
    const step = car.speed * dt;

    if (car.turn) {
      const t = car.turn;
      t.u = Math.min(1, t.u + step / t.length);
      const a = 1 - t.u, b = t.u;                                // quadratic Bezier and its tangent
      car.x = a * a * t.p0[0] + 2 * a * b * t.p1[0] + b * b * t.p2[0];
      car.z = a * a * t.p0[1] + 2 * a * b * t.p1[1] + b * b * t.p2[1];
      const tx = a * (t.p1[0] - t.p0[0]) + b * (t.p2[0] - t.p1[0]), tz = a * (t.p1[1] - t.p0[1]) + b * (t.p2[1] - t.p1[1]);
      if (tx || tz) car.yaw = Math.atan2(tx, tz);
      if (t.u >= 1) {                                            // out the far side: now on the next road
        car.from = t.node; car.dir = t.dir; car.nextDir = t.afterDir; car.lane = t.lane;
        car.s = H; car.turn = null;
        car.leaving = car.holding; car.holding = null;
      }
    } else {
      car.s += step;
      [car.x, car.z] = lanePoint(car.from, car.dir, car.s, car.lane);
      car.yaw = Math.atan2(car.dir[0], car.dir[1]);
      if (car.leaving && car.s > H + 4) {                        // tail is clear of the intersection
        if (this.locks.get(car.leaving) === car) this.locks.delete(car.leaving);
        car.leaving = null;
      }
      const to = [car.from[0] + car.dir[0], car.from[1] + car.dir[1]];
      if (car.s >= PITCH - H && car.holding === `${to[0]},${to[1]}`) this.beginTurn(car, to);
      else if (car.s > PITCH - H) car.s = PITCH - H;             // never roll in without the lock
    }

    // --- a car that has not moved for a long time, far from the player, starts again somewhere else
    car.still = car.speed < 0.3 ? car.still + dt : 0;
    if (car.still > STUCK_SECONDS && Math.hypot(car.x - player.x, car.z - player.z) > 90) this.respawn(car, player, 90);

    if (car.mesh) {
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
    }
  }

  beginTurn(car, node) {
    const dir = car.nextDir;
    const afterDir = chooseExit(node[0] + dir[0], node[1] + dir[1], dir, this.rng);
    const lane = laneFor(dir, afterDir);
    const p0 = lanePoint(node, car.dir, -H, car.lane);
    const p2 = lanePoint(node, dir, H, lane);
    let p1;
    if (isStraight(car.dir, dir)) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else {
      // where the incoming lane line meets the outgoing one
      const [rx, rz] = rightOf(car.dir[0], car.dir[1]), [qx, qz] = rightOf(dir[0], dir[1]);
      p1 = [roadPos(node[0]) + rx * car.lane + qx * lane, roadPos(node[1]) + rz * car.lane + qz * lane];
    }
    const length = (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p2[0] - p0[0], p2[1] - p0[1])) / 2;
    car.turn = { p0, p1, p2, length, u: 0, node, dir, afterDir, lane };
  }
}
