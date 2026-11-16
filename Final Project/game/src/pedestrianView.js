// Draws every pedestrian with six instanced meshes (two legs, torso, head, two arms), so a
// whole crowd costs six draw calls. Movement lives in pedestrians.js.
import * as THREE from 'three';
import { skinTones } from './models.js';

const SHIRTS = [0xe5484d, 0x3e63dd, 0x30a46c, 0xf76b15, 0x8e4ec6, 0xffc53d, 0x00a2c7, 0xf2f2f2, 0xd6409f, 0x5b5bd6, 0x2f3542];
const PANTS = [0x2b3140, 0x3b4a6b, 0x5a4a3a, 0x1f2328, 0x6b7280, 0x7a5c48];

const limb = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);     // pivot at the top, so it can swing
// name -> [geometry, where its pivot sits on the body, which colour list it takes, swing direction]
const PARTS = {
  legL: [limb(0.15, 0.8, 0.18), [-0.09, 0.8, 0], 'pants', 1],
  legR: [limb(0.15, 0.8, 0.18), [0.09, 0.8, 0], 'pants', -1],
  torso: [new THREE.CylinderGeometry(0.2, 0.24, 0.62, 8), [0, 1.11, 0], 'shirt', 0],
  head: [new THREE.IcosahedronGeometry(0.17, 1), [0, 1.58, 0], 'skin', 0],
  armL: [limb(0.1, 0.56, 0.1), [-0.27, 1.38, 0], 'shirt', -1],
  armR: [limb(0.1, 0.56, 0.1), [0.27, 1.38, 0], 'shirt', 1],
};

export class PedestrianView {
  constructor(scene, people) {
    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
    const color = new THREE.Color();
    const looks = people.map((_, k) => ({ shirt: SHIRTS[(k * 7) % SHIRTS.length], pants: PANTS[(k * 5) % PANTS.length], skin: skinTones[(k * 3) % skinTones.length] }));
    this.meshes = {};
    for (const [name, [geometry, , paint]] of Object.entries(PARTS)) {
      const mesh = new THREE.InstancedMesh(geometry, material, people.length);
      looks.forEach((look, k) => mesh.setColorAt(k, color.setHex(look[paint])));
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes[name] = mesh;
    }
    this.base = new THREE.Matrix4(); this.local = new THREE.Matrix4(); this.out = new THREE.Matrix4();
    this.position = new THREE.Vector3(); this.quaternion = new THREE.Quaternion(); this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.one = new THREE.Vector3(1, 1, 1);
  }

  /** @param groundAt (x, z) => height of the ground there */
  update(people, groundAt) {
    people.forEach((p, k) => {
      const lying = p.state === 'down' && p.y === 0;
      this.position.set(p.x, groundAt(p.x, p.z) + p.y + (lying ? 0.12 : 0), p.z);
      this.euler.set(p.state === 'down' ? p.tumble : 0, p.yaw, 0);          // tumble pitches the body forward about its feet
      this.quaternion.setFromEuler(this.euler);
      this.base.compose(this.position, this.quaternion, this.one);
      const walking = p.state === 'walk' || p.state === 'cross';
      const swing = walking ? Math.sin(p.phase) * 0.55 : 0;
      const armsUp = p.scared > 5 || (p.state === 'down' && !lying);        // startled or flying
      for (const [name, [, offset, , dir]] of Object.entries(PARTS)) {
        const angle = armsUp && name.startsWith('arm') ? Math.PI : swing * dir;
        this.local.makeRotationX(angle).setPosition(offset[0], offset[1], offset[2]);
        this.meshes[name].setMatrixAt(k, this.out.multiplyMatrices(this.base, this.local));
      }
    });
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }
}
