// Traffic light timing, and the road rules the player can break. No rendering code:
// runs in Node for tests.
//
// Every intersection with three or four roads has lights. North-south traffic gets green,
// then yellow, then everyone waits on red for a moment, then east-west gets its turn.
import { N, ROAD, PITCH, roadPos, exitsFrom } from './layout.js';

export const GREEN = 10, YELLOW = 2.5, ALL_RED = 1.5;
const HALF_CYCLE = GREEN + YELLOW + ALL_RED;
export const CYCLE = HALF_CYCLE * 2;
const H = ROAD / 2;

export const hasSignal = (i, j) => exitsFrom(i, j).length > 2;
/** Lights are staggered from one intersection to the next so they do not all change together. */
const offset = (i, j) => ((i * 3 + j * 5) % 7) * 4;
/** 'ns' for a car travelling north or south, 'ew' for east or west. dir is (dx, dz). */
export const axisOf = dir => (dir[0] ? 'ew' : 'ns');

/** Seconds into this axis's own green-yellow-red half of the cycle; HALF_CYCLE or more means the other axis has it. */
function phase(i, j, axis, time) {
  const t = (((time + offset(i, j)) % CYCLE) + CYCLE) % CYCLE;
  return axis === 'ns' ? t : (t + HALF_CYCLE) % CYCLE;
}

/** 'green' | 'yellow' | 'red' for traffic on `axis` arriving at intersection (i, j). */
export function signal(i, j, axis, time) {
  if (!hasSignal(i, j)) return 'green';
  const t = phase(i, j, axis, time);
  return t < GREEN ? 'green' : t < GREEN + YELLOW ? 'yellow' : 'red';
}

/** Seconds since this axis turned green, or -1 if it is not green. Pedestrians use it to decide whether there is time to cross. */
export function greenFor(i, j, axis, time) {
  if (!hasSignal(i, j)) return 0;
  const t = phase(i, j, axis, time);
  return t < GREEN ? t : -1;
}

/**
 * Watches the player's car for broken road rules.
 * Call update() every frame; it returns what happened in that frame:
 *   redLight   true once, as the car enters an intersection against a red light
 *   wrongSide  true while driving on the left of the centre line
 */
export class RoadRules {
  constructor() { this.wasInside = true; }      // true so that spawning inside an intersection is not a violation

  update(car, time) {
    const speed = Math.hypot(car.vx, car.vz);
    const i = Math.max(0, Math.min(N, Math.round((car.x - roadPos(0)) / PITCH)));
    const j = Math.max(0, Math.min(N, Math.round((car.z - roadPos(0)) / PITCH)));
    const offX = car.x - roadPos(i), offZ = car.z - roadPos(j);
    const onNS = Math.abs(offX) < H, onEW = Math.abs(offZ) < H;
    const inside = onNS && onEW;

    let redLight = false;
    if (inside && !this.wasInside && speed > 4) {
      const axis = Math.abs(car.vx) > Math.abs(car.vz) ? 'ew' : 'ns';
      redLight = signal(i, j, axis, time) === 'red';
    }
    this.wasInside = inside;

    // On a road between intersections: which side of the centre line, given the way the car is moving?
    let wrongSide = false;
    if (!inside && speed > 4) {
      if (onNS && Math.abs(car.vz) > Math.abs(car.vx)) wrongSide = offX * -Math.sign(car.vz) < -0.7;
      else if (onEW && Math.abs(car.vx) > Math.abs(car.vz)) wrongSide = offZ * Math.sign(car.vx) < -0.7;
    }
    return { redLight, wrongSide };
  }
}
