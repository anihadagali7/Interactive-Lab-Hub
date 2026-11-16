// Time of day and weather. The clock runs through a whole day in about 16 minutes: the sky,
// sun and fog change colour, windows and street lamps light up at night, and the taxi's
// headlights come on. Rain comes and goes: it darkens the sky, wets the road, and makes the
// tyres slip, so the same driving earns more skids and crashes.
import * as THREE from 'three';

const SECONDS_PER_HOUR = 40;
export const START_HOUR = 9;

// hour, sky top, sky horizon, sun colour, sun strength, ambient strength
const DAY = [
  [0, 0x060a1a, 0x162040, 0x8fa6ff, 0.3, 0.68],
  [5, 0x0b1230, 0x2a3560, 0x8fa6ff, 0.3, 0.68],
  [6.5, 0x3a5fae, 0xffa972, 0xffb27a, 1.2, 1.0],
  [8.5, 0x2f86e0, 0xd4ecfb, 0xfff1d6, 2.3, 1.9],
  [16.5, 0x2f86e0, 0xd4ecfb, 0xfff1d6, 2.3, 1.9],
  [18.5, 0x35407a, 0xff9460, 0xff9a5c, 1.1, 0.95],
  [20, 0x0b1230, 0x2a3560, 0x8fa6ff, 0.3, 0.68],
  [24, 0x060a1a, 0x162040, 0x8fa6ff, 0.3, 0.68],
];
const OVERCAST_TOP = new THREE.Color(0x6f7b88), OVERCAST_HORIZON = new THREE.Color(0xaeb8c2);
const DRY_ROAD = new THREE.Color(0x41464d), WET_ROAD = new THREE.Color(0x2a2e34);
const RAIN_DROPS = 1500, RAIN_BOX = 56, RAIN_HEIGHT = 26, RAIN_SPEED = 32;
const clamp01 = v => Math.max(0, Math.min(1, v));

export class Atmosphere {
  /**
   * @param world  what buildWorld() returned
   * @param lamps  [{x, y, z, alive}] street lamps, for their glow at night
   * @param headlights a THREE.SpotLight on the taxi
   */
  constructor({ scene, world, sun, ambient, lamps, headlights }) {
    Object.assign(this, { scene, world, sun, ambient, lamps, headlights });
    this.hour = START_HOUR;
    this.rain = 0;                 // 0 dry .. 1 pouring, eased toward rainTarget
    this.rainTarget = 0;
    this.nextChange = 150 + Math.random() * 120;     // seconds until the weather turns on its own
    this.night = 0;                // 0 day .. 1 full night
    this.sunOffset = new THREE.Vector3(90, 150, 60);
    this.a = new THREE.Color(); this.b = new THREE.Color();

    // falling streaks kept in a box around the camera
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.9, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xd6e6f5, transparent: true, opacity: 0.45, depthWrite: false, fog: false }), RAIN_DROPS);
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    this.drops = new Float32Array(RAIN_DROPS * 3);
    const identity = new THREE.Matrix4();
    for (let k = 0; k < RAIN_DROPS; k++) {
      this.drops.set([Math.random() * RAIN_BOX, Math.random() * RAIN_HEIGHT, Math.random() * RAIN_BOX], k * 3);
      this.streaks.setMatrixAt(k, identity);
    }
    scene.add(this.streaks);

    // one glowing ball per street lamp, faded in after dark
    this.glow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.46, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), lamps.length);
    this.glowClock = 0;
    this.placeGlow();
    scene.add(this.glow);
  }

  placeGlow() {
    const o = new THREE.Object3D();
    this.lamps.forEach((lamp, k) => {
      o.position.set(lamp.x, lamp.y + 5.2, lamp.z);
      o.scale.setScalar(lamp.alive ? 1 : 0);          // a lamp that has been knocked over goes dark
      o.updateMatrix();
      this.glow.setMatrixAt(k, o.matrix);
    });
    this.glow.instanceMatrix.needsUpdate = true;
  }

  /** Jump the clock forward. */
  skip(hours) { this.hour = (this.hour + hours) % 24; }
  toggleRain() { this.rainTarget = this.rainTarget ? 0 : 1; this.nextChange = 150 + Math.random() * 150; return this.rainTarget > 0; }

  /** "9:05 AM" */
  get clock() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  get icon() { return this.rain > 0.3 ? '🌧' : this.night > 0.6 ? '🌙' : '☀️'; }
  /** Tyre grip multiplier for the car. */
  get grip() { return 1 - 0.45 * this.rain; }
  /** Riders allow more time in the rain and in the dark. */
  get patience() { return 1 + 0.2 * this.rain + 0.1 * this.night; }

  update(dt, camera) {
    this.hour = (this.hour + dt / SECONDS_PER_HOUR) % 24;
    if ((this.nextChange -= dt) <= 0) this.toggleRain();
    this.rain += Math.max(-dt / 8, Math.min(dt / 8, this.rainTarget - this.rain));      // eight seconds to set in or clear

    // where the clock sits between two rows of DAY
    let k = 0;
    while (DAY[k + 1][0] <= this.hour) k++;
    const from = DAY[k], to = DAY[k + 1], t = (this.hour - from[0]) / (to[0] - from[0]);
    const mix = (i, out) => out.setHex(from[i]).lerp(this.b.setHex(to[i]), t);
    const lerp = i => from[i] + (to[i] - from[i]) * t;
    const sunStrength = lerp(4);
    this.night = clamp01(1 - (sunStrength - 0.3) / 1.2);

    const sky = this.world.sky.uniforms, grey = this.rain * 0.85 * (1 - this.night * 0.6);
    mix(1, sky.top.value).lerp(OVERCAST_TOP, grey);
    mix(2, sky.horizon.value).lerp(OVERCAST_HORIZON, grey);
    this.scene.fog.color.copy(sky.horizon.value);
    this.scene.fog.near = 260 - 150 * this.rain;
    this.scene.fog.far = 1700 - 1050 * this.rain;
    mix(3, this.sun.color);
    this.sun.intensity = sunStrength * (1 - 0.55 * this.rain);
    this.ambient.intensity = lerp(5) * (1 - 0.25 * this.rain);
    this.ambient.color.setHex(0xdcefff).lerp(this.a.setHex(0x6f86c9), this.night);

    // the sun crosses the sky from six to six; after dark the same light stands in for the moon
    const arc = ((this.hour - 6) / 12) * Math.PI, up = Math.sin(arc);
    const high = Math.max(0.3, Math.abs(up)), along = Math.cos(arc) * (up >= 0 ? 1 : -1);
    this.sunOffset.set(along * 150, high * 170, 70).normalize().multiplyScalar(190);

    this.world.sky.stars.opacity = this.night * (1 - this.rain);
    this.world.sky.cloudMaterial.color.setScalar(1 - 0.72 * this.night - 0.3 * this.rain * (1 - this.night));
    for (const wall of this.world.wallMaterials) wall.emissiveIntensity = this.night * 0.9;
    this.glow.material.opacity = this.night;
    this.headlights.intensity = this.night * 320 + this.rain * 60;
    if ((this.glowClock += dt) > 0.5) { this.glowClock = 0; this.placeGlow(); }

    // wet road: darker and shinier
    const road = this.world.asphalt;
    road.color.copy(DRY_ROAD).lerp(WET_ROAD, this.rain);
    road.roughness = 0.95 - 0.6 * this.rain;
    road.metalness = 0.05 + 0.25 * this.rain;

    this.fall(dt, camera);
  }

  /** Move the rain streaks, wrapped into a box that follows the camera. */
  fall(dt, camera) {
    const count = Math.floor(RAIN_DROPS * this.rain);
    this.streaks.count = count;
    if (!count) return;
    const m = this.streaks.instanceMatrix.array, d = this.drops;
    const cx = camera.position.x, cz = camera.position.z, half = RAIN_BOX / 2;
    const wrap = v => ((v % RAIN_BOX) + RAIN_BOX) % RAIN_BOX;
    for (let k = 0; k < count; k++) {
      d[k * 3 + 1] -= RAIN_SPEED * dt;
      if (d[k * 3 + 1] < 0) d[k * 3 + 1] += RAIN_HEIGHT;
      // each drop has a fixed place in the world, repeated every RAIN_BOX metres
      m[k * 16 + 12] = cx - half + wrap(d[k * 3] - cx);
      m[k * 16 + 13] = d[k * 3 + 1];
      m[k * 16 + 14] = cz - half + wrap(d[k * 3 + 2] - cz);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
}
