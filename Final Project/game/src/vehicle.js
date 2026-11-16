// The taxi's condition. Crashes take health off; the damage shows on the model (soot, a
// crooked then missing bumper, dead headlights, smoke, flames) and slows the car down.
import * as THREE from 'three';
import { repairCost } from './scoring.js';

const SOOT = new THREE.Color(0x3a3530);

export class Vehicle {
  /** @param model what buildCar() returned for the taxi */
  constructor(model, particles, debris) {
    Object.assign(this, { model, particles, debris });
    this.health = 100;
    this.cleanPaint = model.paint.color.clone();
    this.smokeClock = 0;
    this.bumperShed = false;
  }

  /** Top-speed multiplier: a badly damaged engine is slower. */
  get power() { return this.health > 50 ? 1 : this.health > 25 ? 0.85 : 0.7; }

  /** @returns true if this blow wrecked the car */
  hurt(points) {
    if (this.health <= 0 || points <= 0) return false;
    this.health = Math.max(0, this.health - points);
    this.look();
    return this.health === 0;
  }

  /** Fix everything. @returns the bill in dollars */
  repair() {
    const cost = repairCost(this.health);
    this.health = 100;
    this.look();
    return cost;
  }

  /** Make the model match the current health. */
  look() {
    const wear = 1 - this.health / 100, m = this.model;
    m.paint.color.copy(this.cleanPaint).lerp(SOOT, wear * 0.55);
    m.frontBumper.rotation.z = wear > 0.2 ? 0.1 : 0;
    m.frontBumper.position.y = wear > 0.2 ? 0.34 : 0.4;
    m.frontBumper.visible = wear <= 0.55;
    m.rearBumper.rotation.z = wear > 0.4 ? -0.09 : 0;
    m.headlights.forEach((lamp, k) => {
      const dead = wear > (k ? 0.7 : 0.35);
      lamp.material.emissiveIntensity = dead ? 0 : 1;
      lamp.material.color.setHex(dead ? 0x4a4a4a : 0xfff6d5);
    });
    if (m.frontBumper.visible) this.bumperShed = false;
  }

  /** Smoke, flames and the bumper falling off. Call every frame. */
  update(dt, car, groundY) {
    const wear = 1 - this.health / 100, m = this.model;
    if (!m.frontBumper.visible && !this.bumperShed) {
      this.bumperShed = true;
      const loose = new THREE.Mesh(m.frontBumper.geometry, m.frontBumper.material);
      loose.position.set(car.x + car.fx * m.frontZ, groundY + 0.4, car.z + car.fz * m.frontZ);
      loose.rotation.y = car.yaw;
      loose.castShadow = true;
      this.debris.fling(loose, car.vx * 0.6, 2.5, car.vz * 0.6, { radius: 0.12 });
    }
    if (wear < 0.4) return;
    this.smokeClock += dt * (2 + wear * 16);
    for (; this.smokeClock > 1; this.smokeClock -= 1) {
      const x = car.x + car.fx * 1.5, z = car.z + car.fz * 1.5;
      this.particles.smoke(x, groundY + 1, z, wear > 0.7 ? 0x2e2c2a : 0xb9b9b9, 0.35 + wear * 0.35);
      if (wear > 0.85 && Math.random() < 0.5) this.particles.flame(x, groundY + 1, z, car.vx * 0.5, car.vz * 0.5);
    }
  }
}
