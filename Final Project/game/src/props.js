// Street furniture the taxi can knock over: lamp posts, hydrants, bins, cones, mailboxes,
// planters. Hit one slowly and it is a solid obstacle; hit it fast enough and it breaks off,
// slows the car, damages it, and costs the driver.
import * as THREE from 'three';
import { N, BLOCK, blockCenter } from './layout.js';
import { PROBES, PROBE_RADIUS } from './car.js';
import { SIDEWALK_H } from './world.js';

// r: collision radius. breakSpeed: m/s needed to knock it over. slow: share of speed the car loses.
// harm: car health lost. penalty: safety stars lost with a rider on board. fine: dollars.
export const PROP_TYPES = {
  lamp:    { name: 'lamp post',    r: 0.16, breakSpeed: 6,   slow: 0.22, harm: 9,   penalty: 0.4,  fine: 8, topple: true },
  hydrant: { name: 'fire hydrant', r: 0.3,  breakSpeed: 5,   slow: 0.15, harm: 6,   penalty: 0.3,  fine: 6, spray: true },
  mailbox: { name: 'mailbox',      r: 0.32, breakSpeed: 4,   slow: 0.1,  harm: 4,   penalty: 0.25, fine: 5 },
  bin:     { name: 'trash can',    r: 0.35, breakSpeed: 3,   slow: 0.06, harm: 1.5, penalty: 0.15, fine: 2 },
  planter: { name: 'planter',      r: 0.6,  breakSpeed: 3,   slow: 0.08, harm: 2,   penalty: 0.15, fine: 3 },
  cone:    { name: 'traffic cone', r: 0.25, breakSpeed: 1.5, slow: 0.02, harm: 0.3, penalty: 0.08, fine: 0 },
};

/** Merge [geometry, colour] parts into one geometry with per-vertex colours. */
export function colored(parts) {
  const position = [], normal = [], color = [], c = new THREE.Color();
  for (const [geometry, hex] of parts) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    c.setHex(hex);
    for (let k = 0; k < geo.attributes.position.count; k++) {
      position.push(geo.attributes.position.getX(k), geo.attributes.position.getY(k), geo.attributes.position.getZ(k));
      normal.push(geo.attributes.normal.getX(k), geo.attributes.normal.getY(k), geo.attributes.normal.getZ(k));
      color.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return out;
}

const box = (w, h, d, y, x = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, y, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y, 0);

// Each model stands on y = 0 with its base at the origin.
const SHAPES = {
  lamp: () => colored([
    [cyl(0.2, 0.24, 0.3, 0.15), 0x3d4450],
    [cyl(0.08, 0.12, 5, 2.5, 6), 0x3d4450],
    [new THREE.IcosahedronGeometry(0.34, 1).translate(0, 5.2, 0), 0xfff3c4],
  ]),
  hydrant: () => colored([
    [cyl(0.2, 0.25, 0.7, 0.35), 0xd93a2b],
    [new THREE.SphereGeometry(0.2, 8, 5).translate(0, 0.72, 0), 0xd93a2b],
    [box(0.56, 0.15, 0.15, 0.45), 0xb02a1e],
    [cyl(0.08, 0.08, 0.14, 0.92, 6), 0xb02a1e],
  ]),
  mailbox: () => colored([
    [box(0.4, 0.3, 0.34, 0.15), 0x1d3f73],
    [box(0.52, 0.72, 0.46, 0.66), 0x2b5fa8],
    [new THREE.CylinderGeometry(0.23, 0.23, 0.52, 10).rotateZ(Math.PI / 2).translate(0, 1.02, 0), 0x2b5fa8],   // rounded top
  ]),
  bin: () => colored([
    [cyl(0.33, 0.27, 0.9, 0.45), 0x2f6b4f],
    [cyl(0.36, 0.36, 0.08, 0.94), 0x1f4a36],
  ]),
  planter: () => colored([
    [box(1.1, 0.5, 1.1, 0.25), 0xb86b4b],
    [new THREE.IcosahedronGeometry(0.62, 0).translate(0, 0.95, 0), 0x4f9d4a],
    [new THREE.IcosahedronGeometry(0.2, 0).translate(0.3, 1.3, 0.1), 0xf06292],
    [new THREE.IcosahedronGeometry(0.18, 0).translate(-0.25, 1.25, -0.2), 0xffd54f],
  ]),
  cone: () => colored([
    [box(0.5, 0.06, 0.5, 0.03), 0xd9631e],
    [new THREE.ConeGeometry(0.2, 0.7, 8).translate(0, 0.41, 0), 0xf5822a],
    [cyl(0.105, 0.14, 0.12, 0.4), 0xf4f4f4],
  ]),
};

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const RESPAWN_SECONDS = 75;

export class Props {
  /**
   * @param circles the world's collision circles; each standing prop adds one
   * @param debris, particles see effects.js
   */
  constructor(scene, circles, debris, particles) {
    Object.assign(this, { scene, circles, debris, particles });
    this.list = [];
    this.sprays = [];
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 });
  }

  /** Stand a prop at (x, z). y is the ground height there. Call build() after adding them all. */
  add(type, x, z, y = SIDEWALK_H, yaw = 0) {
    this.list.push({ type, x, z, y, yaw, alive: true, down: 0 });
  }

  build() {
    this.meshes = {};
    const dummy = new THREE.Object3D();
    for (const type of Object.keys(PROP_TYPES)) {
      const items = this.list.filter(p => p.type === type);
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(SHAPES[type](), this.material, items.length);
      items.forEach((p, k) => {
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.updateMatrix();
        p.index = k; p.matrix = dummy.matrix.clone();
        mesh.setMatrixAt(k, p.matrix);
        p.circle = { x: p.x, z: p.z, r: PROP_TYPES[type].r, prop: p };
        this.circles.push(p.circle);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes[type] = mesh;
    }
  }

  /**
   * Break every prop the car is driving through fast enough. Call before the car's own collision
   * test, so that a broken prop no longer stops it.
   * @returns the props broken this step
   */
  hit(car) {
    const speed = car.speed, broken = [];
    if (speed < 1.5) return broken;
    for (const p of this.list) {
      if (!p.alive) continue;
      const dx = p.x - car.x, dz = p.z - car.z;
      if (dx > 4 || dx < -4 || dz > 4 || dz < -4) continue;
      const type = PROP_TYPES[p.type];
      if (speed < type.breakSpeed) continue;
      const reach = PROBE_RADIUS + type.r + 0.05;
      for (const offset of PROBES) {
        const px = car.x + car.fx * offset - p.x, pz = car.z + car.fz * offset - p.z;
        if (px * px + pz * pz < reach * reach) { this.knock(p, car, type); broken.push(p); break; }
      }
    }
    return broken;
  }

  knock(p, car, type) {
    p.alive = false; p.down = 0;
    p.circle.x = 1e9;                                   // out of the way of collision tests
    const mesh = this.meshes[p.type];
    mesh.setMatrixAt(p.index, HIDDEN); mesh.instanceMatrix.needsUpdate = true;

    const loose = new THREE.Mesh(mesh.geometry, this.material);
    loose.position.set(p.x, p.y, p.z); loose.rotation.y = p.yaw; loose.castShadow = true;
    const speed = car.speed;
    if (type.topple) this.debris.topple(loose, car.vx, car.vz, speed);
    else this.debris.fling(loose, car.vx * 0.9 + (Math.random() - 0.5) * 3, 3 + speed * 0.3, car.vz * 0.9 + (Math.random() - 0.5) * 3, { radius: type.r });
    this.particles.sparks(p.x, p.y + 0.5, p.z, type.topple ? 14 : 6);
    if (type.spray) this.sprays.push({ x: p.x, y: p.y, z: p.z, left: 8 });
    car.vx *= 1 - type.slow; car.vz *= 1 - type.slow;
  }

  /** Run hydrant fountains, and put broken props back once the player is far away. */
  update(dt, car) {
    this.sprays = this.sprays.filter(s => {
      for (let n = 0; n < 3; n++) this.particles.water(s.x, s.y + 0.2, s.z);
      return (s.left -= dt) > 0;
    });
    for (const p of this.list) {
      if (p.alive) continue;
      p.down += dt;
      if (p.down > RESPAWN_SECONDS && Math.hypot(p.x - car.x, p.z - car.z) > 80) {
        p.alive = true; p.circle.x = p.x;
        const mesh = this.meshes[p.type];
        mesh.setMatrixAt(p.index, p.matrix); mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

/** Lamp posts, hydrants, bins and mailboxes along every block's pavement. */
export function placeStreetFurniture(props, rng) {
  const edge = BLOCK / 2;
  // a point on a block's pavement: `side` 0..3 = N, E, S, W; `along` from the edge's middle; `inset` from the kerb
  const spot = (i, j, side, along, inset) => {
    const d = edge - inset, cx = blockCenter(i), cz = blockCenter(j);
    return [[cx + along, cz - d], [cx + d, cz + along], [cx - along, cz + d], [cx - d, cz - along]][side];
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    for (let side = 0; side < 4; side++) {
      for (const along of [-13, 13]) props.add('lamp', ...spot(i, j, side, along, 1));
      // keep the middle of each edge clear: riders wait there
      const free = () => (rng() < 0.5 ? -1 : 1) * (7 + rng() * 4 + (rng() < 0.5 ? 0 : 12));
      if (rng() < 0.45) props.add('hydrant', ...spot(i, j, side, free(), 0.7), SIDEWALK_H, rng() * 6.28);
      if (rng() < 0.55) props.add('bin', ...spot(i, j, side, free(), 1.7));
      if (rng() < 0.2) props.add('mailbox', ...spot(i, j, side, free(), 1.8), SIDEWALK_H, [Math.PI, -Math.PI / 2, 0, Math.PI / 2][side]);
    }
  }
}
