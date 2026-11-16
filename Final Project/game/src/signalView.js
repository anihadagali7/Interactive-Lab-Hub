// Draws the traffic lights: a pole on the far right corner of each approach, with an arm
// over the road and a three-lamp head facing the oncoming traffic. Timing lives in signals.js.
import * as THREE from 'three';
import { N, ROAD, roadPos, rightOf } from './layout.js';
import { signal, hasSignal, axisOf } from './signals.js';
import { mat } from './models.js';
import { SIDEWALK_H } from './world.js';

const H = ROAD / 2;
const LIT = { red: 0xff3b30, yellow: 0xffcc00, green: 0x34d058 };
const DARK = { red: 0x3b1614, yellow: 0x3a3112, green: 0x13351d };
const ORDER = ['red', 'yellow', 'green'];       // top to bottom

export class SignalView {
  /** @param circles the world's collision circles: each pole adds one */
  constructor(scene, circles) {
    this.heads = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (!hasSignal(i, j)) continue;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const fromI = i - d[0], fromJ = j - d[1];
        if (fromI < 0 || fromI > N || fromJ < 0 || fromJ > N) continue;      // no road arrives from that side
        const [rx, rz] = rightOf(d[0], d[1]);
        const corner = [roadPos(i) + (d[0] + rx) * (H + 1.3), roadPos(j) + (d[1] + rz) * (H + 1.3)];
        this.heads.push({ i, j, axis: axisOf(d), d, r: [rx, rz], corner, state: null });
        circles.push({ x: corner[0], z: corner[1], r: 0.2 });
      }
    }

    const count = this.heads.length, metal = mat(0x2c3138, { rough: 0.6 }), o = new THREE.Object3D();
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.17, 6.6, 6), metal, count);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(5.6, 0.14, 0.14), metal, count);
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 1.56, 0.4), mat(0x1c1f24, { rough: 0.5 }), count);
    this.lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.18, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), count * 3);
    this.heads.forEach((h, k) => {
      const [cx, cz] = h.corner, [rx, rz] = h.r, [dx, dz] = h.d;
      o.rotation.set(0, 0, 0); o.position.set(cx, SIDEWALK_H + 3.3, cz); o.updateMatrix(); poles.setMatrixAt(k, o.matrix);
      // the arm reaches from the pole back over the lanes it controls
      o.rotation.y = Math.atan2(rz, -rx); o.position.set(cx - rx * 2.8, SIDEWALK_H + 6.3, cz - rz * 2.8); o.updateMatrix(); arms.setMatrixAt(k, o.matrix);
      const hx = cx - rx * 5.4, hz = cz - rz * 5.4, facing = Math.atan2(-dx, -dz);
      o.rotation.y = facing; o.position.set(hx, SIDEWALK_H + 5.55, hz); o.updateMatrix(); boxes.setMatrixAt(k, o.matrix);
      ORDER.forEach((_, n) => {
        o.position.set(hx - dx * 0.21, SIDEWALK_H + 5.55 + (1 - n) * 0.48, hz - dz * 0.21); o.updateMatrix();
        this.lamps.setMatrixAt(k * 3 + n, o.matrix);
      });
    });
    for (const m of [poles, arms, boxes]) m.castShadow = true;
    this.color = new THREE.Color();
    scene.add(poles, arms, boxes, this.lamps);
    this.update(0);
  }

  update(time) {
    let changed = false;
    this.heads.forEach((h, k) => {
      const state = signal(h.i, h.j, h.axis, time);
      if (state === h.state) return;
      h.state = state; changed = true;
      ORDER.forEach((name, n) => this.lamps.setColorAt(k * 3 + n, this.color.setHex(name === state ? LIT[name] : DARK[name])));
    });
    if (changed) this.lamps.instanceColor.needsUpdate = true;
  }
}
