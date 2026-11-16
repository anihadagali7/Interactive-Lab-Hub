// Low-poly models built in code: cars, people and the canvas textures they share.
import * as THREE from 'three';
import { mulberry32 } from './layout.js';

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
/**
 * Extrude a side-view outline [[z, y], ...] across the car's width, with chamfered side edges.
 * @param taper share of the width lost at the top: a cabin leans in toward its roof
 */
function extrudeProfile(points, width, taper = 0) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const edge = 0.06;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - edge * 2, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelOffset: -edge, bevelSegments: 1 });
  geo.rotateY(-Math.PI / 2);          // outline x -> car z (length), extrusion -> car x (width)
  geo.translate(width / 2 - edge, 0, 0);
  if (taper) {
    const ys = points.map(p => p[1]), low = Math.min(...ys), high = Math.max(...ys), at = geo.attributes.position;
    for (let k = 0; k < at.count; k++) at.setX(k, at.getX(k) * (1 - taper * (at.getY(k) - low) / (high - low)));
    geo.computeVertexNormals();
  }
  return geo;
}

// Side-view outlines per body style: painted lower body, glass cabin, and where the roof and axles go.
const BODIES = {
  sedan: {
    lower: [[-2.2, 0.3], [2.2, 0.3], [2.25, 0.62], [2.1, 0.84], [0.95, 0.93], [-1.5, 0.93], [-2.2, 0.88], [-2.25, 0.6]],
    glass: [[1.0, 0.92], [0.35, 1.42], [-1.0, 1.42], [-1.6, 0.92]],
    roof: { z: -0.325, y: 1.45, length: 1.36 },
    axles: [1.38, -1.38],
    taper: 0.16, pillars: [-0.3], seams: [0.72, -0.3, -1.3], mirrors: 0.8,
  },
  van: {
    lower: [[-2.3, 0.3], [2.2, 0.3], [2.25, 0.7], [2.05, 1.0], [-2.3, 1.0]],
    glass: [[1.9, 1.0], [1.45, 1.78], [0.45, 1.78], [0.45, 1.0]],
    box: [[0.45, 1.0], [0.45, 1.84], [-2.3, 1.84], [-2.3, 1.0]],
    roof: { z: 0.95, y: 1.81, length: 1.0 },
    axles: [1.45, -1.45],
    taper: 0, pillars: [], seams: [1.5, 0.45, -0.9], mirrors: 1.6,
  },
  pickup: {
    lower: [[-2.4, 0.34], [2.2, 0.34], [2.25, 0.7], [2.1, 0.95], [0.9, 1.02], [-2.4, 1.02]],
    glass: [[0.9, 1.0], [0.5, 1.6], [-0.45, 1.6], [-0.6, 1.0]],
    roof: { z: 0.02, y: 1.63, length: 0.96 },
    axles: [1.4, -1.5],
    taper: 0.12, pillars: [], seams: [0.7, -0.6], mirrors: 0.75,
  },
};

const WIDTH = 1.86;
const WHEEL_R = 0.36;
const glassMat = () => mat(0x4d6279, { rough: 0.08, metal: 0.9 });
// Car paint: a clear coat over the colour, so it picks up the sky.
const paints = new Map();
const newPaint = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: true });
function paintMat(color) {
  if (!paints.has(color)) paints.set(color, newPaint(color));
  return paints.get(color);
}

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
    // scraped paint: dark gouges with bare metal showing through
    scratches: canvasTexture(256, 64, (ctx, w, h) => {
      const rng = mulberry32(9);
      for (let n = 0; n < 34; n++) {
        const x = rng() * w * 0.8, y = 6 + rng() * (h - 12), len = 30 + rng() * 90;
        ctx.strokeStyle = n % 3 ? 'rgba(30,28,26,0.85)' : 'rgba(190,195,200,0.9)';
        ctx.lineWidth = 1 + rng() * 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rng() - 0.5) * 10); ctx.stroke();
      }
    }),
    // a crumpled panel: dark creases round a dent
    dent: canvasTexture(128, 128, (ctx, w, h) => {
      const rng = mulberry32(4);
      const shade = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      shade.addColorStop(0, 'rgba(20,18,16,0.6)'); shade.addColorStop(1, 'rgba(20,18,16,0)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(15,14,13,0.85)'; ctx.lineWidth = 2.5;
      for (let n = 0; n < 7; n++) {
        const a = rng() * 6.3;
        ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30);
        ctx.lineTo(w / 2 + Math.cos(a + 0.4) * 56, h / 2 + Math.sin(a + 0.4) * 56); ctx.stroke();
      }
    }),
    // a starred windscreen
    crack: canvasTexture(256, 128, (ctx, w, h) => {
      const rng = mulberry32(2), cx = w * 0.32, cy = h * 0.45;
      ctx.strokeStyle = 'rgba(235,245,255,0.9)';
      for (let n = 0; n < 13; n++) {
        let a = n / 13 * 6.3 + rng() * 0.3, x = cx, y = cy;
        ctx.lineWidth = 0.8 + rng() * 1.4; ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { a += (rng() - 0.5) * 0.5; x += Math.cos(a) * 22; y += Math.sin(a) * 22; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (const r of [10, 24, 44]) {                      // rings round the point of impact
        ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k <= 12; k++) ctx.lineTo(cx + Math.cos(k / 12 * 6.3) * r * (0.8 + rng() * 0.4), cy + Math.sin(k / 12 * 6.3) * r * (0.8 + rng() * 0.4));
        ctx.stroke();
      }
    }),
  };
  return taxiTextures;
}

/**
 * @returns the model's group (facing +z) and the parts that move or change: wheels to spin,
 * steerPivots to steer, tailLights to brighten when braking, and paint, bumpers, headlights and
 * scars (taxi only: [{mesh, from}], shown once that share of health is gone) for showing damage.
 * The taxi also gets doors: {'-1': pivot, '1': pivot}, its rear doors (-1 is the car's right),
 * hinged at the front edge. Turn a pivot by -side * angle to swing it open.
 */
export const CAR_WIDTH = WIDTH;

export function buildCar({ color = 0xffc21a, type = 'sedan', taxi = false } = {}) {
  const body = BODIES[type];
  const group = new THREE.Group();
  // The taxi gets materials of its own, because damage recolours them.
  const paint = taxi ? newPaint(color) : paintMat(color);
  const dark = mat(0x2a2d33, { rough: 0.6 }), chrome = mat(0xd5dae0, { rough: 0.2, metal: 0.9 });
  const frontZ = Math.max(...body.lower.map(p => p[0])), rearZ = Math.min(...body.lower.map(p => p[0]));
  const cabinW = WIDTH - 0.22, topW = cabinW * (1 - body.taper);
  const glassYs = body.glass.map(p => p[1]), sill = Math.min(...glassYs), top = Math.max(...glassYs);

  group.add(mesh(extrudeProfile(body.lower, WIDTH), paint));
  group.add(mesh(extrudeProfile(body.glass, cabinW, body.taper), glassMat()));
  if (body.box) group.add(mesh(extrudeProfile(body.box, WIDTH), paint));
  group.add(mesh(new THREE.BoxGeometry(topW + 0.06, 0.07, body.roof.length), paint, 0, body.roof.y, body.roof.z));

  for (const side of [-1, 1]) {
    // pillars between the side windows, leaning in with the cabin
    for (const z of body.pillars) {
      const pillar = mesh(new THREE.BoxGeometry(0.05, top - sill + 0.04, 0.13), paint, side * ((cabinW + topW) / 4 + 0.005), (sill + top) / 2, z);
      pillar.rotation.z = side * Math.atan((cabinW - topW) / 2 / (top - sill));
      group.add(pillar);
    }
    // door seams and handles
    body.seams.forEach((z, k) => {
      group.add(mesh(new THREE.BoxGeometry(0.012, sill - 0.42, 0.025), dark, side * (WIDTH / 2 + 0.002), (sill + 0.42) / 2, z));
      if (k && !(taxi && k === 2)) group.add(mesh(new THREE.BoxGeometry(0.03, 0.035, 0.16), chrome, side * (WIDTH / 2 + 0.008), sill - 0.1, z + 0.22));
    });
    // wing mirrors
    group.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.09), paint, side * (WIDTH / 2 + 0.07), sill + 0.06, body.mirrors));
    // dark sill along the bottom, and a wheel well behind each wheel
    group.add(mesh(new THREE.BoxGeometry(0.03, 0.1, frontZ - rearZ - 0.3), dark, side * (WIDTH / 2 - 0.005), 0.35, (frontZ + rearZ) / 2));
    for (const z of body.axles) {
      const well = mesh(new THREE.CircleGeometry(WHEEL_R + 0.1, 14, 0, Math.PI), mat(0x101114, { rough: 1 }), side * (WIDTH / 2 + 0.004), WHEEL_R - 0.02, z);
      well.rotation.y = side * Math.PI / 2; well.castShadow = false;
      group.add(well);
    }
  }
  // grille and number plates
  group.add(mesh(new THREE.BoxGeometry(0.66, 0.16, 0.05), dark, 0, 0.69, frontZ - 0.04));
  const plate = mat(0xf2f2ee, { rough: 0.5 });
  group.add(mesh(new THREE.BoxGeometry(0.42, 0.13, 0.03), plate, 0, 0.5, frontZ + 0.02), mesh(new THREE.BoxGeometry(0.42, 0.13, 0.03), plate, 0, 0.56, rearZ - 0.015));

  // bumpers and lights
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
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.62, WHEEL_R * 0.62, 0.28, 10).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.3, WHEEL_R * 1.2, 0.07);
  const tyre = mat(0x17181b, { rough: 0.9 }), hub = mat(0xc9ced6, { rough: 0.35, metal: 0.7 });
  const wheels = [], steerPivots = [];
  body.axles.forEach((z, axle) => {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (WIDTH / 2 - 0.08), WHEEL_R, z);
      const wheel = new THREE.Group();
      wheel.add(mesh(tyreGeo, tyre), mesh(hubGeo, hub), mesh(spokeGeo, tyre), mesh(spokeGeo.clone().rotateX(Math.PI / 2), tyre));
      pivot.add(wheel);
      group.add(pivot);
      wheels.push(wheel);
      if (axle === 0) steerPivots.push(pivot);
    }
  });

  const scars = [], doors = {};
  if (taxi) {
    const { sign, checker, scratches, dent, crack } = taxiDecals();
    const signMat = new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffe9a0, emissiveMap: sign, emissiveIntensity: 0.55 });
    group.add(mesh(new THREE.BoxGeometry(0.62, 0.2, 0.24), signMat, 0, body.roof.y + 0.14, body.roof.z));
    // checker stripe: one piece on the front door and wing, one on each rear door
    const stripe = length => {
      const map = checker.clone();
      map.repeat.x = length / 2.4;
      map.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map, roughness: 0.5 });
    };
    const [, hinge, latch] = body.seams, doorLen = hinge - latch - 0.02;
    const frontStripe = stripe(1.0 - hinge), doorStripe = stripe(doorLen), cabin = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 1 });
    const lean = Math.atan((cabinW - topW) / 2 / (top - sill));
    for (const side of [-1, 1]) {
      const flat = (w, h, material, x, y, z, parent) => {
        const m = mesh(new THREE.PlaneGeometry(w, h), material, x, y, z);
        m.rotation.y = side * Math.PI / 2; m.castShadow = false;
        parent.add(m);
      };
      flat(1.0 - hinge, 0.16, frontStripe, side * (WIDTH / 2 + 0.006), 0.74, (1.0 + hinge) / 2, group);
      flat(doorLen - 0.06, sill - 0.5, cabin, side * (WIDTH / 2 + 0.003), (sill + 0.44) / 2, (hinge + latch) / 2, group);   // the dark inside, seen when the door is open

      const door = new THREE.Group();
      door.position.set(side * WIDTH / 2, 0, hinge - 0.01);
      door.add(mesh(new THREE.BoxGeometry(0.02, sill - 0.43, doorLen), paint, side * 0.012, (sill + 0.43) / 2, -doorLen / 2));
      const pane = mesh(new THREE.BoxGeometry(0.02, (top - sill) / Math.cos(lean) - 0.06, doorLen * 0.7), glassMat(), side * ((cabinW + topW) / 4 - WIDTH / 2 + 0.014), (sill + top) / 2, -doorLen * 0.37);
      pane.rotation.z = side * lean;
      door.add(pane);
      door.add(mesh(new THREE.BoxGeometry(0.03, 0.035, 0.16), chrome, side * 0.03, sill - 0.1, -doorLen + 0.22));
      flat(doorLen, 0.16, doorStripe, side * 0.024, 0.74, -doorLen / 2, door);
      group.add(door);
      doors[side] = door;
    }
    // damage decals, laid just proud of the panels and switched on by vehicle.js as health drops
    const scar = (from, map, w, h, x, y, z, rx, ry) => {
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.7 }), x, y, z);
      m.rotation.set(rx, ry, 0); m.castShadow = false; m.visible = false;
      group.add(m);
      scars.push({ mesh: m, from });
    };
    const side = WIDTH / 2 + 0.012, quarter = Math.PI / 2;
    scar(0.1, scratches, 1.7, 0.36, side, 0.56, 1.1, 0, quarter);              // right front wing
    scar(0.25, dent, 1.2, 1.0, 0, 0.9, 1.52, -quarter + 0.078, 0);             // bonnet
    scar(0.4, crack, 1.36, 0.74, 0, 1.18, 0.685, -0.915, 0);                    // windscreen
    scar(0.5, scratches, 0.95, 0.36, -side, 0.58, 0.2, 0, -quarter);           // left front door
    scar(0.65, dent, 0.9, 0.5, -side, 0.6, 1.3, 0, -quarter);                  // left front wing
    scar(0.75, scratches, 0.8, 0.3, side, 0.6, -1.75, 0, quarter);             // right rear wing
  }
  return { group, wheels, steerPivots, tailLights, paint, frontBumper, rearBumper, headlights, scars, doors, frontZ, rearZ };
}

const SKIN = [0xf1c9a5, 0xd9a577, 0xa8703f, 0x7a4a2a, 0xf6d7bd];

/**
 * A simple figure, about 1.75 m tall, facing +z. `arm` is the one to wave; `legs` pivot at the hip
 * (turn them about x to stride, or both to -PI/2 to sit).
 */
export function buildPerson({ shirt = 0x3e63dd, pants = 0x2b3140, skin = SKIN[0], hair = 0x2a211c } = {}) {
  const group = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.2).translate(0, -0.4, 0);    // pivot at the hip
  const shoeGeo = new THREE.BoxGeometry(0.15, 0.09, 0.28).translate(0, -0.76, 0.05);
  const legs = [-1, 1].map(side => {
    const leg = mesh(legGeo, mat(pants), side * 0.095, 0.8, 0);
    leg.add(mesh(shoeGeo, mat(0x1c1c1f)));
    return leg;
  });
  group.add(...legs);
  group.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 8), mat(shirt), 0, 1.1, 0));
  group.add(mesh(new THREE.IcosahedronGeometry(0.17, 1), mat(skin), 0, 1.58, 0));
  group.add(mesh(new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hair), 0, 1.6, -0.02));
  const armGeo = new THREE.BoxGeometry(0.1, 0.56, 0.1).translate(0, -0.24, 0);   // pivot at the shoulder
  const left = mesh(armGeo, mat(shirt), -0.27, 1.36, 0);
  const arm = mesh(armGeo, mat(shirt), 0.27, 1.36, 0);
  group.add(left, arm);
  return { group, arm, left, legs };
}
export const skinTones = SKIN;
