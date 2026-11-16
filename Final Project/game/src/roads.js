// Road variety on top of the plain grid: two palm-lined boulevards with a central median,
// brick streets around the old town, lane arrows, roadworks cones, manhole covers, asphalt
// patches, and palms along the seafront.
import * as THREE from 'three';
import { N, BLOCK, ROAD, HALF, roadPos, rightOf, BLOCK_PLAN, blockCenter } from './layout.js';
import { mat, canvasTexture } from './models.js';
import { colored } from './props.js';
import { SIDEWALK_H } from './world.js';

export const BOULEVARDS = [3];              // road indices, both north-south and east-west, that get a median
const OLD_TOWN = [1, 1];                    // block whose four surrounding streets are paved in brick
const H = ROAD / 2;

function instanced(scene, geometry, material, transforms, { shadow = false, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const o = new THREE.Object3D();
  transforms.forEach(({ x, y = 0, z, yaw = 0, sx = 1, sy = 1, sz = 1 }, k) => {
    o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(sx, sy, sz); o.updateMatrix();
    mesh.setMatrixAt(k, o.matrix);
  });
  mesh.castShadow = shadow; mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

/** Every stretch of road between two intersections: its centre line, start, and which way it runs. */
function* segments() {
  for (let k = 0; k <= N; k++) for (let s = 0; s < N; s++) for (const eastWest of [true, false]) {
    const c = roadPos(k), a = roadPos(s) + H;
    // point(along, across): `along` metres from the segment's start, `across` metres toward +z (east-west roads) or +x
    yield { k, s, eastWest, point: (along, across = 0) => (eastWest ? { x: a + along, z: c + across } : { x: c + across, z: a + along }) };
  }
}

function palmGeometry() {
  const parts = [[new THREE.CylinderGeometry(0.14, 0.24, 6.4, 6).translate(0, 3.2, 0), 0x9a7b55]];
  for (let k = 0; k < 7; k++) {
    // a frond: a thin blade that reaches out and droops
    parts.push([new THREE.BoxGeometry(0.55, 0.07, 3.1).translate(0, 0, 1.55).rotateX(0.5).rotateY(k * Math.PI * 2 / 7).translate(0, 6.5, 0), k % 2 ? 0x3f9a4a : 0x4fae58]);
  }
  parts.push([new THREE.IcosahedronGeometry(0.3, 0).translate(0, 6.35, 0), 0x6b4a2b]);
  return colored(parts);
}

function arrowTexture(kind) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.strokeStyle = ctx.fillStyle = '#f2f2ee'; ctx.lineWidth = 18; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    const head = (x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(30, 14); ctx.lineTo(-30, 14); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    // a straight-ahead shaft with a head, plus a branch to the left or right
    ctx.beginPath(); ctx.moveTo(w / 2, h - 16); ctx.lineTo(w / 2, 62); ctx.stroke();
    head(w / 2, 48, 0);
    const side = kind === 'left' ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(w / 2, 170); ctx.lineTo(w / 2 + side * 34, 130); ctx.stroke();
    head(w / 2 + side * 44, 118, side * 0.9);
  });
}

/**
 * @param circles the world's collision circles (palm trunks are solid)
 * @param props   cones are added to this; call props.build() afterwards
 */
export function decorateRoads(scene, circles, props, rng) {
  const palms = [], medians = [], bricks = [], manholes = [], patches = [], arrows = { left: [], right: [] };

  for (const seg of segments()) {
    const { k, s, eastWest, point } = seg;
    const yawAlong = eastWest ? Math.PI / 2 : 0;            // turns a north-south shape to run east-west

    if (BOULEVARDS.includes(k)) {
      medians.push({ ...point(BLOCK / 2), y: 0.06, yaw: yawAlong });
      for (const along of [15, 28, 42, 55]) {
        const p = point(along);
        palms.push({ ...p, y: 0.1, yaw: rng() * 6.28, sy: 0.85 + rng() * 0.3 });
        circles.push({ x: p.x, z: p.z, r: 0.26 });
      }
    }

    const [oi, oj] = OLD_TOWN;                              // the four streets that touch the old-town block
    const touchesOldTown = eastWest ? (s === oi && (k === oj || k === oj + 1)) : (s === oj && (k === oi || k === oi + 1));
    if (touchesOldTown) bricks.push({ ...point(BLOCK / 2), y: 0.012, yaw: yawAlong });

    // lane arrows before each end, for the traffic driving toward it
    for (const [along, sign] of [[BLOCK - 13, 1], [13, -1]]) {
      const d = eastWest ? [sign, 0] : [0, sign];
      const [rx, rz] = rightOf(d[0], d[1]);
      const across = lane => (eastWest ? rz : rx) * lane;
      const yaw = Math.atan2(-d[0], -d[1]);
      arrows.left.push({ ...point(along, across(1.75)), y: 0.024, yaw });
      arrows.right.push({ ...point(along, across(5.25)), y: 0.024, yaw });
    }

    if (rng() < 0.75) manholes.push({ ...point(10 + rng() * (BLOCK - 20), (rng() < 0.5 ? -1 : 1) * (1.75 + (rng() < 0.5 ? 3.5 : 0))), y: 0.016 });
    if (rng() < 0.6) {
      const long = 2 + rng() * 5, wide = 1.4 + rng() * 1.6;
      patches.push({ ...point(8 + rng() * (BLOCK - 16), (rng() - 0.5) * 11), y: 0.014, yaw: yawAlong, sx: wide, sz: long });
    }

    // roadworks: a line of cones along the lane divider on about one street in twelve
    if (rng() < 0.085 && !touchesOldTown) {
      const side = rng() < 0.5 ? -1 : 1, start = 14 + rng() * 14;
      for (let n = 0; n < 9; n++) { const p = point(start + n * 3, side * 3.5); props.add('cone', p.x, p.z, 0); }
    }
  }

  // palms along the seafront promenade
  for (let t = -HALF + 9; t <= HALF - 9; t += 19) {
    for (const [x, z] of [[t, -HALF - 4.2], [t, HALF + 4.2], [-HALF - 4.2, t], [HALF + 4.2, t]]) {
      palms.push({ x, y: SIDEWALK_H, z, yaw: rng() * 6.28, sy: 0.9 + rng() * 0.35 });
      circles.push({ x, z, r: 0.26 });
    }
  }

  // planters outside shops and offices
  const edge = BLOCK / 2 - 2.5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!['shops', 'office', 'pizza', 'cafe', 'hotel', 'mall'].includes(BLOCK_PLAN[j][i])) continue;
    const cx = blockCenter(i), cz = blockCenter(j);
    for (const [x, z] of [[cx - 27, cz - edge], [cx + 27, cz + edge], [cx - edge, cz + 27], [cx + edge, cz - 27]]) {
      if (rng() < 0.7) props.add('planter', x, z, SIDEWALK_H, rng() * 6.28);
    }
  }

  const flat = (w, l) => new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
  const offset = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...extra });

  instanced(scene, palmGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), palms, { shadow: true });
  // median: a low kerbed strip with grass on top (drivable, but the palms on it are not)
  instanced(scene, new THREE.BoxGeometry(1.1, 0.12, BLOCK - 18), mat(0xc9c9c4), medians);
  instanced(scene, new THREE.BoxGeometry(0.7, 0.14, BLOCK - 19), mat(0x7cc36a), medians);

  const brick = canvasTexture(128, 128, (ctx, w) => {
    ctx.fillStyle = '#8f5f4e'; ctx.fillRect(0, 0, w, w);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
      ctx.fillStyle = ['#a06a57', '#96624f', '#aa735e', '#8c5a49'][(row * 3 + col + 8) % 4];
      ctx.fillRect(col * 32 + (row % 2 ? 16 : 0) + 1, row * 16 + 1, 30, 14);
    }
  }, { repeat: true });
  brick.repeat.set(ROAD / 4, BLOCK / 4);
  instanced(scene, flat(ROAD, BLOCK), offset(0xffffff, { map: brick }), bricks);

  instanced(scene, new THREE.CircleGeometry(0.46, 12).rotateX(-Math.PI / 2), offset(0x2c2f34, { polygonOffsetFactor: -1.5 }), manholes);
  instanced(scene, flat(1, 1), offset(0x383c42, { polygonOffsetFactor: -1.2 }), patches);
  for (const kind of ['left', 'right']) {
    const tex = arrowTexture(kind);
    instanced(scene, flat(1.5, 3.6), offset(0xffffff, { map: tex, transparent: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), arrows[kind]);
  }
}
