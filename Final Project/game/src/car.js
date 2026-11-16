// Arcade driving physics for the player's taxi. No rendering code: runs in Node for tests.
//
// The car keeps a world-space velocity. Each step the engine pushes it along its heading and
// tyre grip bleeds off whatever part of the velocity points sideways, so hard turns and the
// handbrake slide a little before the car straightens up.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const TOP_SPEED = 26;        // m/s, about 58 mph
export const NITRO_SPEED = 38;      // m/s, about 85 mph
const REVERSE_SPEED = 9;
const ENGINE = 11;                  // m/s^2 at a standstill
const NITRO_ENGINE = 20;
const BRAKE = 24;
const HANDBRAKE = 9;
const ROLLING = 1.2;                // m/s^2 lost when coasting
const WHEELBASE = 2.7;
const GRIP = 9;                     // 1/s: how fast sideways velocity dies
const HANDBRAKE_GRIP = 2;
const STEER_RATE = 5.5;             // how fast the wheels follow the stick
const NITRO_DRAIN = 0.34;           // tank per second: about 3 s of boost
const NITRO_REFILL = 0.07;          // about 14 s to refill

// Three circles along the car's length stand in for its body in collisions.
export const PROBES = [1.45, 0, -1.45];
export const PROBE_RADIUS = 0.95;

export class Car {
  constructor() {
    this.x = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0;            // current wheel position, -1..1
    this.nitro = 1;            // tank, 0..1
    this.boosting = false;
    this.braking = false;
    this.slip = 0;             // sideways speed before the tyres bite, m/s: how hard the car is sliding
    this.power = 1;            // top-speed multiplier: a damaged engine is slower
    this.grip = 1;             // tyre grip multiplier: a wet road or grass is slippery
    this.pull = 0;             // steering bias, -1..1: a bent wheel drags the car to one side
  }

  get fx() { return Math.sin(this.yaw); }
  get fz() { return Math.cos(this.yaw); }
  /** Signed speed along the heading, m/s. */
  get forwardSpeed() { return this.vx * this.fx + this.vz * this.fz; }
  get speed() { return Math.hypot(this.vx, this.vz); }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.steer = 0;
  }

  /**
   * @param controls {steer, drive, handbrake, nitro}: steer and drive in -1..1
   * @param drag extra drag from the surface: 0 on asphalt, about 1.5 on grass
   */
  update(dt, controls, drag = 0) {
    const { steer, drive, handbrake, nitro } = controls;
    let fwd = this.forwardSpeed;
    let side = -this.vx * this.fz + this.vz * this.fx;      // velocity toward the car's right

    // --- nitro tank: needs a little in the tank to light, then burns until empty or released
    const wantsBoost = nitro && drive > 0 && this.nitro > (this.boosting ? 0 : 0.12);
    this.boosting = wantsBoost;
    this.nitro = clamp(this.nitro + (wantsBoost ? -NITRO_DRAIN : NITRO_REFILL) * dt, 0, 1);

    // --- engine, brakes and drag along the heading
    const top = (this.boosting ? NITRO_SPEED : TOP_SPEED) * this.power;
    this.braking = false;
    if (drive > 0) {
      if (fwd < -0.5) { fwd += BRAKE * drive * dt; this.braking = true; }
      else {
        const pull = (this.boosting ? NITRO_ENGINE : ENGINE) * drive * Math.max(0, 1 - (fwd / top) ** 2);
        fwd += pull * dt;
        if (fwd > top) fwd = Math.max(top, fwd - 6 * dt);          // ease back after a boost ends
      }
    } else if (drive < 0) {
      if (fwd > 0.5) { fwd = Math.max(0, fwd + BRAKE * drive * dt); this.braking = true; }
      else fwd = Math.max(-REVERSE_SPEED, fwd + ENGINE * 0.7 * drive * dt);
    }
    const slow = (ROLLING + drag * (2 + Math.abs(fwd) * 0.35) + (handbrake ? HANDBRAKE : 0)) * dt;
    fwd = Math.abs(fwd) <= slow ? 0 : fwd - Math.sign(fwd) * slow;
    if (handbrake) this.braking = true;

    // --- steering: the faster the car, the less the wheels are allowed to turn
    this.steer += clamp(clamp(steer + this.pull, -1, 1) - this.steer, -STEER_RATE * dt, STEER_RATE * dt);
    const lock = 0.55 / (1 + (Math.abs(fwd) / 9) ** 1.5);
    // A right turn lowers the yaw (see layout.js for the axes).
    const wasX = this.fx, wasZ = this.fz;
    this.yaw -= fwd / WHEELBASE * Math.tan(this.steer * lock) * dt;

    // --- grip: the heading has turned but the velocity has not, so part of it now points
    // sideways. The tyres bleed that off; the less grip, the wider the car slides.
    const fx = this.fx, fz = this.fz;
    const wx = wasX * fwd - wasZ * side, wz = wasZ * fwd + wasX * side;
    fwd = wx * fx + wz * fz;
    side = -wx * fz + wz * fx;
    this.slip = Math.abs(side);
    side *= Math.exp(-(handbrake ? HANDBRAKE_GRIP : GRIP) * this.grip * dt);
    this.vx = fx * fwd - fz * side;
    this.vz = fz * fwd + fx * side;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  /**
   * Push the car out of anything it overlaps and take the bounce.
   * @param boxes   [{minX, maxX, minZ, maxZ}] buildings and walls
   * @param circles [{x, z, r}] trees, lamp posts, other cars
   * @returns the hardest impact this step, as closing speed in m/s (0 if none), and the circle hit
   */
  collide(boxes, circles) {
    let hardest = 0, hitCircle = null;
    const hit = (nx, nz, depth, offset, circle) => {
      this.x += nx * depth; this.z += nz * depth;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        if (-vn > hardest) { hardest = -vn; hitCircle = circle || null; }
        this.vx -= 1.25 * vn * nx; this.vz -= 1.25 * vn * nz;      // bounce off with a little spring
      }
      // A hit at the nose or tail swings the car round, so it slides along walls instead of sticking.
      this.yaw += 0.35 * offset * (this.fz * nx - this.fx * nz) * Math.min(depth, 0.4);
    };
    for (const offset of PROBES) {
      for (const b of boxes) {
        const px = this.x + this.fx * offset, pz = this.z + this.fz * offset;
        const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
        const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 >= PROBE_RADIUS * PROBE_RADIUS) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          hit(dx / d, dz / d, PROBE_RADIUS - d, offset);
        } else {
          // The probe centre is inside the box: leave through the nearest face.
          const faces = [[px - b.minX, -1, 0], [b.maxX - px, 1, 0], [pz - b.minZ, 0, -1], [b.maxZ - pz, 0, 1]];
          const [depth, nx, nz] = faces.reduce((a, f) => (f[0] < a[0] ? f : a));
          hit(nx, nz, depth + PROBE_RADIUS, offset);
        }
      }
      for (const c of circles) {
        const px = this.x + this.fx * offset, pz = this.z + this.fz * offset;
        const dx = px - c.x, dz = pz - c.z, reach = PROBE_RADIUS + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        hit(dx / d, dz / d, reach - d, offset, c);
      }
    }
    return { speed: hardest, circle: hitCircle };
  }
}

/**
 * What damage does to the driving. Nothing until a fifth of the health is gone, then the engine
 * weakens, the tyres hold less, and the steering pulls harder to one side.
 * @param health 100 (new) to 0 (wrecked)
 * @returns power and grip multipliers, and pull as a share of full steering lock
 */
export function damageHandling(health) {
  const wear = clamp((80 - health) / 80, 0, 1);
  return { power: 1 - 0.4 * wear, grip: 1 - 0.3 * wear, pull: 0.24 * wear };
}

/**
 * Driving up or down a curb. Free at a crawl, so pulling over to a rider costs nothing.
 * @returns null, or the health points lost and the share of speed lost
 */
export const curbJolt = speed =>
  speed < 3 ? null : { damage: Math.min(4, 0.6 + speed * 0.12), slow: 0.06 };

/** How much a rider minds an impact: nothing for a scrape, about 0.5 for a bump, 1.5 for a crash. */
export const impactSeverity = closingSpeed =>
  closingSpeed < 2.5 ? 0 : clamp((closingSpeed - 2.5) / 9, 0.15, 1.5);
