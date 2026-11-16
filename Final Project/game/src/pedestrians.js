// People on foot. They walk the pavements from block corner to block corner, wait at the
// kerb, and cross on the zebra crossing when the traffic on that road has a red light.
// No rendering code: runs in Node for tests (pedestrianView.js draws them).
import { N, BLOCK, ROAD, blockMin } from './layout.js';
import { greenFor } from './signals.js';
import { PROBES, PROBE_RADIUS } from './car.js';

const INSET = 1.8;                  // how far inside the block edge people walk
const WALK = [1.1, 1.6];            // m/s
const CROSS_SPEED = 2.1;            // people hurry across the road
const STEP_OFF_WINDOW = 2.5;        // only start crossing in the first seconds of the walk signal
const GIVE_UP_AFTER = 14;           // seconds waiting before walking somewhere else
const DOWN_SECONDS = 7;
const HIT_SPEED = 3;                // m/s: slower than this, the car just nudges past
const SCARE_SPEED = 8, SCARE_RANGE = 3.2;

const cornerPos = c => ({
  x: blockMin(c.i) + (c.cx ? BLOCK - INSET : INSET),
  z: blockMin(c.j) + (c.cz ? BLOCK - INSET : INSET),
});
const same = (a, b) => a && b && a.i === b.i && a.j === b.j && a.cx === b.cx && a.cz === b.cz;

/**
 * Where a person standing at a block corner can go next.
 * A `cross` option carries the intersection it is beside and the axis of traffic that runs
 * parallel to the crossing: when that axis is green, the road being crossed is on red.
 */
export function optionsFrom(c) {
  const out = [
    { to: { ...c, cx: 1 - c.cx }, cross: null },
    { to: { ...c, cz: 1 - c.cz }, cross: null },
  ];
  const ni = c.i + (c.cx ? 1 : -1);
  if (ni >= 0 && ni < N) out.push({ to: { i: ni, j: c.j, cx: 1 - c.cx, cz: c.cz }, cross: { node: [c.cx ? c.i + 1 : c.i, c.j + c.cz], walkAxis: 'ew' } });
  const nj = c.j + (c.cz ? 1 : -1);
  if (nj >= 0 && nj < N) out.push({ to: { i: c.i, j: nj, cx: c.cx, cz: 1 - c.cz }, cross: { node: [c.i + c.cx, c.cz ? c.j + 1 : c.j], walkAxis: 'ns' } });
  return out;
}

export class Pedestrians {
  constructor(count, rng) {
    this.rng = rng;
    this.time = 0;
    this.people = [];
    for (let n = 0; n < count; n++) {
      const p = { speed: WALK[0] + rng() * (WALK[1] - WALK[0]), ox: (rng() - 0.5) * 0.9, oz: (rng() - 0.5) * 0.9, phase: rng() * 6, look: n };
      this.spawn(p);
      this.people.push(p);
    }
  }

  spawn(p, avoid = null) {
    for (let tries = 0; tries < 50; tries++) {
      const at = { i: Math.floor(this.rng() * N), j: Math.floor(this.rng() * N), cx: this.rng() < 0.5 ? 0 : 1, cz: this.rng() < 0.5 ? 0 : 1 };
      const pos = cornerPos(at);
      if (avoid && Math.hypot(pos.x - avoid.x, pos.z - avoid.z) < 70) continue;
      Object.assign(p, { at, from: null, x: pos.x + p.ox, z: pos.z + p.oz, y: 0, vy: 0, yaw: 0, tumble: 0, state: 'walk', scared: 0, waited: 0 });
      this.choose(p);
      // start part-way along, so people are spread over the pavements rather than bunched at corners
      const goal = this.goal(p), f = this.rng();
      if (!p.next.cross) { p.x += (goal.x - p.x) * f; p.z += (goal.z - p.z) * f; }
      return;
    }
  }

  goal(p) { const g = cornerPos(p.next.to); return { x: g.x + p.ox, z: g.z + p.oz }; }

  /** Pick where to go from the corner the person is standing at. Prefers not to turn straight back. */
  choose(p, walkOnly = false) {
    let options = optionsFrom(p.at).filter(o => !same(o.to, p.from) && !(walkOnly && o.cross));
    if (!options.length) options = optionsFrom(p.at).filter(o => !o.cross);
    p.next = options[Math.floor(this.rng() * options.length)];
    p.waited = 0;
    p.state = p.next.cross ? 'wait' : 'walk';
  }

  mayCross(cross) {
    const g = greenFor(cross.node[0], cross.node[1], cross.walkAxis, this.time);
    return g >= 0 && g <= STEP_OFF_WINDOW;
  }

  /** People currently on the road: traffic brakes for these. */
  get onRoad() { return this.people.filter(p => p.state === 'cross'); }

  update(dt, player = null) {
    this.time += dt;
    for (const p of this.people) {
      p.scared = Math.max(0, p.scared - dt);
      if (p.state === 'down') {
        if (p.y > 0 || p.vy > 0) {                                  // still in the air
          p.vy -= 18 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.tumble += 9 * dt;
          if (p.y <= 0) { p.y = 0; p.vy = 0; p.tumble = Math.PI / 2; }       // lands flat
        }
        if ((p.downFor += dt) > DOWN_SECONDS) this.spawn(p, player);
        continue;
      }
      if (p.y > 0 || p.vy > 0) {                                    // a startled hop
        p.vy -= 18 * dt; p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = 0; }
      }
      const goal = this.goal(p);
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.01) p.yaw = Math.atan2(dx, dz);
      if (p.state === 'wait') {
        if (this.mayCross(p.next.cross)) p.state = 'cross';
        else if ((p.waited += dt) > GIVE_UP_AFTER) this.choose(p, true);
        continue;
      }
      const step = (p.state === 'cross' ? CROSS_SPEED : p.speed) * dt;
      p.phase += step * 2.4;
      if (d <= step) {
        p.x = goal.x; p.z = goal.z;
        p.from = p.at; p.at = p.next.to;
        this.choose(p);
      } else { p.x += dx / d * step; p.z += dz / d * step; }
    }
  }

  /**
   * What the player's car does to the people near it.
   * @returns {hits, scares}: counts for this step
   */
  checkCar(car) {
    let hits = 0, scares = 0;
    const speed = car.speed;
    if (speed < 1) return { hits, scares };
    for (const p of this.people) {
      if (p.state === 'down') continue;
      const dx = p.x - car.x, dz = p.z - car.z;
      if (dx > 6 || dx < -6 || dz > 6 || dz < -6) continue;
      let struck = false;
      for (const offset of PROBES) {
        if (Math.hypot(car.x + car.fx * offset - p.x, car.z + car.fz * offset - p.z) < PROBE_RADIUS + 0.3) { struck = true; break; }
      }
      if (struck && speed > HIT_SPEED) {
        Object.assign(p, { state: 'down', downFor: 0, vx: car.vx * 0.7, vz: car.vz * 0.7, vy: 4 + speed * 0.25, y: 0.01 });
        hits++;
      } else if (!struck && speed > SCARE_SPEED && !p.scared && Math.hypot(dx, dz) < SCARE_RANGE) {
        p.scared = 6;
        p.vy = 3.2; p.y = 0.01;                                     // jumps
        scares++;
      }
    }
    return { hits, scares };
  }
}
