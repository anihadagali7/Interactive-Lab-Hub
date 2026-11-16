// Things that fly, smoke and smear: particles, tyre marks, and knocked-over objects.
import * as THREE from 'three';

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** A fixed pool of low-poly puffs drawn in one call. Old puffs are reused when the pool is full. */
export class Particles {
  constructor(scene, max = 600) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), material, max);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: max }, () => ({ life: 0 }));
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    for (let k = 0; k < max; k++) { this.mesh.setMatrixAt(k, HIDDEN); this.mesh.setColorAt(k, this.color.setHex(0xffffff)); }
    scene.add(this.mesh);
  }

  /** @param p {x, y, z, vx, vy, vz, life, size, grow, color, gravity, drag} */
  emit(p) {
    Object.assign(this.items[this.next], { vx: 0, vy: 0, vz: 0, grow: 0, gravity: 0, drag: 0 }, p, { age: 0 });
    this.mesh.setColorAt(this.next, this.color.setHex(p.color));
    this.mesh.instanceColor.needsUpdate = true;
    this.next = (this.next + 1) % this.items.length;
  }

  update(dt) {
    const d = this.dummy;
    this.items.forEach((p, k) => {
      if (p.life <= 0) return;
      p.age += dt;
      if (p.age >= p.life) { p.life = 0; this.mesh.setMatrixAt(k, HIDDEN); return; }
      p.vy += p.gravity * dt;
      const keep = Math.exp(-p.drag * dt);
      p.vx *= keep; p.vz *= keep;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.gravity) { p.y = 0.05; p.vy *= -0.3; }
      const fade = Math.min(1, (p.life - p.age) / (p.life * 0.4));          // shrink away at the end
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.age * 2, p.age * 3, 0);
      d.scale.setScalar(Math.max(0.001, (p.size + p.grow * p.age) * fade));
      d.updateMatrix();
      this.mesh.setMatrixAt(k, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  smoke(x, y, z, color = 0xe2e2e2, size = 0.4) {
    this.emit({ x: x + rand(-0.2, 0.2), y, z: z + rand(-0.2, 0.2), vx: rand(-0.4, 0.4), vy: rand(0.7, 1.6), vz: rand(-0.4, 0.4), life: rand(0.8, 1.5), size, grow: 1.1, color, drag: 1 });
  }
  sparks(x, y, z, count = 10) {
    for (let n = 0; n < count; n++) {
      this.emit({ x, y, z, vx: rand(-6, 6), vy: rand(2, 7), vz: rand(-6, 6), life: rand(0.3, 0.6), size: 0.16, color: n % 3 ? 0xffc94d : 0xfff3c0, gravity: -16 });
    }
  }
  water(x, y, z) {
    this.emit({ x, y, z, vx: rand(-1.6, 1.6), vy: rand(8, 12), vz: rand(-1.6, 1.6), life: rand(1, 1.5), size: 0.26, color: 0x8fd6ff, gravity: -15 });
  }
  flame(x, y, z, vx, vz) {
    this.emit({ x, y, z, vx, vy: rand(0, 0.6), vz, life: rand(0.15, 0.3), size: 0.34, grow: -0.6, color: Math.random() < 0.5 ? 0xff9a2e : 0x6fd3ff });
  }
}

/** Dark strips left where tyres slide. A fixed number of segments; the oldest are overwritten. */
export class SkidMarks {
  constructor(scene, max = 2000) {
    this.max = max;
    this.positions = new Float32Array(max * 18);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x0b0b0c, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.mesh.frustumCulled = false;
    this.next = 0;
    this.last = {};
    scene.add(this.mesh);
  }

  /** Extend the mark for one tyre. `wheel` is any name; call lift(wheel) when it stops sliding. */
  mark(wheel, x, y, z, yaw, width = 0.24) {
    const rx = -Math.cos(yaw) * width / 2, rz = Math.sin(yaw) * width / 2;
    const cur = [x - rx, z - rz, x + rx, z + rz, y];
    const prev = this.last[wheel];
    if (prev) {
      if (Math.hypot(x - (prev[0] + prev[2]) / 2, z - (prev[1] + prev[3]) / 2) < 0.3) return;
      const quad = [prev[0], prev[4], prev[1], cur[0], cur[4], cur[1], prev[2], prev[4], prev[3],
        prev[2], prev[4], prev[3], cur[0], cur[4], cur[1], cur[2], cur[4], cur[3]];
      this.positions.set(quad, this.next * 18);
      this.next = (this.next + 1) % this.max;
      this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    this.last[wheel] = cur;
  }
  lift(wheel) { this.last[wheel] = null; }
}

/** Objects that have been knocked loose: they fly or fall over, lie there a while, then vanish. */
export class Debris {
  constructor(scene) { this.scene = scene; this.bodies = []; }

  /** Send a mesh flying with the given velocity. `radius` is how high its centre rests above the ground. */
  fling(mesh, vx, vy, vz, { radius = 0.3, life = 8 } = {}) {
    this.scene.add(mesh);
    this.bodies.push({ mesh, vx, vy, vz, radius, life, spin: new THREE.Vector3(rand(-7, 7), rand(-4, 4), rand(-7, 7)), floor: mesh.position.y });
  }

  /** Tip a mesh over about its base, falling toward (dx, dz). */
  topple(mesh, dx, dz, speed, life = 10) {
    const len = Math.hypot(dx, dz) || 1;
    this.scene.add(mesh);
    this.bodies.push({ mesh, topple: true, axis: new THREE.Vector3(dz / len, 0, -dx / len), dx: dx / len, dz: dz / len, angle: 0, rate: 0.6 + speed * 0.22, slide: speed * 0.25, life });
  }

  update(dt) {
    this.bodies = this.bodies.filter(b => {
      b.life -= dt;
      if (b.life <= 0) { this.scene.remove(b.mesh); return false; }
      if (b.topple) {
        if (b.rate !== 0) {
          b.rate += (2 + 7 * Math.sin(b.angle)) * dt;                // gravity pulls harder the further it leans
          b.angle += b.rate * dt;
          if (b.angle >= Math.PI / 2) {                              // hit the ground: one small bounce, then rest
            b.angle = Math.PI / 2;
            b.rate = b.rate > 1.5 ? -b.rate * 0.2 : 0;
          }
          b.mesh.quaternion.setFromAxisAngle(b.axis, b.angle);
        }
        b.slide *= Math.exp(-3 * dt);
        b.mesh.position.x += b.dx * b.slide * dt; b.mesh.position.z += b.dz * b.slide * dt;
      } else {
        b.vy -= 18 * dt;
        const p = b.mesh.position;
        p.x += b.vx * dt; p.y += b.vy * dt; p.z += b.vz * dt;
        if (p.y < b.floor + b.radius * 0.2) {
          p.y = b.floor + b.radius * 0.2;
          b.vy = Math.abs(b.vy) > 2 ? -b.vy * 0.35 : 0;
          b.vx *= 0.6; b.vz *= 0.6; b.spin.multiplyScalar(0.5);
        }
        b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
      }
      if (b.life < 1) b.mesh.scale.setScalar(Math.max(0.01, b.life));   // shrink away
      return true;
    });
  }
}
