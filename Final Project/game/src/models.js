// Low-poly models built in code: cars, people and the canvas textures they share.
import * as THREE from 'three';

const materials = new Map();
/** Shared flat-shaded material, one per colour and finish. */
export function mat(color, { rough = 0.75, metal = 0.05, emissive = 0, opacity = 1 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${opacity}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal, flatShading: true,
      emissive, emissiveIntensity: emissive ? 1 : 0,
      transparent: opacity < 1, opacity,
    }));
  }
  return materials.get(key);
}

/** Texture drawn with the 2D canvas API. */
export function canvasTexture(width, height, draw, { repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A sign board texture: text centred on a coloured panel. */
export function signTexture(text, { bg = '#1c2733', fg = '#ffffff', font = 'bold 84px "Helvetica Neue", Arial, sans-serif' } = {}) {
  return canvasTexture(1024, 160, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // shrink long names to fit
    const scale = Math.min(1, (w - 60) / ctx.measureText(text).width);
    ctx.setTransform(scale, 0, 0, 1, w / 2 * (1 - scale), 0);
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Extrude a side-view outline [[z, y], ...] across the car's width. */
function extrudeProfile(points, width) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);          // outline x -> car z (length), extrusion -> car x (width)
  geo.translate(width / 2, 0, 0);
  return geo;
}

// Side-view outlines per body style: painted lower body, glass cabin, and where the roof and axles go.
const BODIES = {
  sedan: {
    lower: [[-2.2, 0.3], [2.2, 0.3], [2.25, 0.62], [2.1, 0.84], [0.95, 0.93], [-1.5, 0.93], [-2.2, 0.88], [-2.25, 0.6]],
    glass: [[1.0, 0.92], [0.35, 1.42], [-1.0, 1.42], [-1.6, 0.92]],
    roof: { z: -0.325, y: 1.45, length: 1.36 },
    axles: [1.38, -1.38],
  },
  van: {
    lower: [[-2.3, 0.3], [2.2, 0.3], [2.25, 0.7], [2.05, 1.0], [-2.3, 1.0]],
    glass: [[1.9, 1.0], [1.45, 1.78], [0.45, 1.78], [0.45, 1.0]],
    box: [[0.45, 1.0], [0.45, 1.84], [-2.3, 1.84], [-2.3, 1.0]],
    roof: { z: 0.95, y: 1.81, length: 1.0 },
    axles: [1.45, -1.45],
  },
  pickup: {
    lower: [[-2.4, 0.34], [2.2, 0.34], [2.25, 0.7], [2.1, 0.95], [0.9, 1.02], [-2.4, 1.02]],
    glass: [[0.9, 1.0], [0.5, 1.6], [-0.45, 1.6], [-0.6, 1.0]],
    roof: { z: 0.02, y: 1.63, length: 0.96 },
    axles: [1.4, -1.5],
  },
};

const WIDTH = 1.86;
const WHEEL_R = 0.36;
const glassMat = () => mat(0x1b2a38, { rough: 0.15, metal: 0.6 });

let taxiTextures;
function taxiDecals() {
  taxiTextures ||= {
    sign: canvasTexture(128, 48, (ctx, w, h) => {
      ctx.fillStyle = '#fff4c2'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', w / 2, h / 2 + 2);
    }),
    checker: canvasTexture(256, 32, (ctx, w, h) => {
      const s = 16;
      for (let x = 0; x < w / s; x++) for (let y = 0; y < h / s; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f4f4f4';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }),
  };
  return taxiTextures;
}

/**
 * @returns the model's group (facing +z) and the parts that move or change: wheels to spin,
 * steerPivots to steer, tailLights to brighten when braking, and paint, bumpers and headlights
 * for showing damage.
 */
export function buildCar({ color = 0xffc21a, type = 'sedan', taxi = false } = {}) {
  const body = BODIES[type];
  const group = new THREE.Group();
  // The taxi gets materials of its own, because damage recolours them.
  const paint = taxi
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.3, flatShading: true })
    : mat(color, { rough: 0.42, metal: 0.3 });

  group.add(mesh(extrudeProfile(body.lower, WIDTH), paint));
  group.add(mesh(extrudeProfile(body.glass, WIDTH - 0.22), glassMat()));
  if (body.box) group.add(mesh(extrudeProfile(body.box, WIDTH), paint));
  group.add(mesh(new THREE.BoxGeometry(WIDTH - 0.3, 0.07, body.roof.length), paint, 0, body.roof.y, body.roof.z));

  // bumpers and lights
  const dark = mat(0x2a2d33, { rough: 0.6 });
  const frontZ = Math.max(...body.lower.map(p => p[0])), rearZ = Math.min(...body.lower.map(p => p[0]));
  const frontBumper = mesh(new THREE.BoxGeometry(WIDTH + 0.06, 0.16, 0.14), dark, 0, 0.4, frontZ - 0.02);
  const rearBumper = mesh(new THREE.BoxGeometry(WIDTH + 0.06, 0.16, 0.14), dark, 0, 0.4, rearZ + 0.02);
  group.add(frontBumper, rearBumper);
  const headMat = taxi
    ? new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff0b0, emissiveIntensity: 1, roughness: 0.3, flatShading: true })
    : mat(0xfff6d5, { emissive: 0xfff0b0, rough: 0.3 });
  const headlights = [];
  const tailLights = new THREE.MeshStandardMaterial({ color: 0x8a1616, emissive: 0xff2a2a, emissiveIntensity: 0.35, flatShading: true });
  for (const side of [-1, 1]) {
    const lamp = mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), taxi ? headMat.clone() : headMat, side * 0.6, 0.7, frontZ - 0.06);
    headlights.push(lamp);
    group.add(lamp);
    group.add(mesh(new THREE.BoxGeometry(0.42, 0.13, 0.06), tailLights, side * 0.6, 0.72, rearZ + 0.03));
  }

  // wheels: front pair hangs off pivots so it can steer
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 14).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.28, 8).rotateZ(Math.PI / 2);
  const tyre = mat(0x17181b, { rough: 0.9 }), hub = mat(0xc9ced6, { rough: 0.35, metal: 0.7 });
  const wheels = [], steerPivots = [];
  body.axles.forEach((z, axle) => {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (WIDTH / 2 - 0.1), WHEEL_R, z);
      const wheel = new THREE.Group();
      wheel.add(mesh(tyreGeo, tyre), mesh(hubGeo, hub));
      pivot.add(wheel);
      group.add(pivot);
      wheels.push(wheel);
      if (axle === 0) steerPivots.push(pivot);
    }
  });

  if (taxi) {
    const { sign, checker } = taxiDecals();
    const signMat = new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffe9a0, emissiveMap: sign, emissiveIntensity: 0.55 });
    group.add(mesh(new THREE.BoxGeometry(0.62, 0.2, 0.24), signMat, 0, body.roof.y + 0.14, body.roof.z));
    const stripe = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const strip = mesh(new THREE.PlaneGeometry(2.4, 0.16), stripe, side * (WIDTH / 2 + 0.006), 0.74, -0.2);
      strip.rotation.y = side * Math.PI / 2;
      strip.castShadow = false;
      group.add(strip);
    }
  }
  return { group, wheels, steerPivots, tailLights, paint, frontBumper, rearBumper, headlights, frontZ, rearZ };
}

const SKIN = [0xf1c9a5, 0xd9a577, 0xa8703f, 0x7a4a2a, 0xf6d7bd];

/** A simple standing figure, about 1.75 m tall, facing +z. `arm` is the one to wave. */
export function buildPerson({ shirt = 0x3e63dd, pants = 0x2b3140, skin = SKIN[0] } = {}) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(0.34, 0.8, 0.22), mat(pants), 0, 0.4, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 8), mat(shirt), 0, 1.1, 0));
  group.add(mesh(new THREE.IcosahedronGeometry(0.17, 1), mat(skin), 0, 1.58, 0));
  const armGeo = new THREE.BoxGeometry(0.1, 0.56, 0.1).translate(0, -0.24, 0);   // pivot at the shoulder
  const left = mesh(armGeo, mat(shirt), -0.27, 1.36, 0);
  const arm = mesh(armGeo, mat(shirt), 0.27, 1.36, 0);
  group.add(left, arm);
  return { group, arm };
}
export const skinTones = SKIN;
