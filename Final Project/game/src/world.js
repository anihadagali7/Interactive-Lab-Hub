// Builds the city: ground, roads, blocks, landmarks and scenery, plus the colliders the car hits.
import * as THREE from 'three';
import {
  N, BLOCK, ROAD, PITCH, SIZE, HALF, SIDEWALK, roadPos, blockMin, blockCenter,
  BLOCK_PLAN, PLACES, mulberry32,
} from './layout.js';
import { mat, canvasTexture, signTexture } from './models.js';

export const SIDEWALK_H = 0.2;
const IN = BLOCK / 2 - SIDEWALK;        // half-width of a block's buildable interior (32 m)
const FLOOR = 3.2;

const PASTEL = [0xf4d9c6, 0xe8c9a8, 0xf2e3b6, 0xd4e4c8, 0xc8dce8, 0xe6cfe0, 0xf0c4b8, 0xd8d2c4, 0xbfd8d2, 0xf5e6d3, 0xe2b9a0];
const OFFICE = [0xa9c4d8, 0x9db8c9, 0xc2d0d8, 0x8fb0c4, 0xb8c8d4, 0xd0d8dc];
const HOUSE = [0xf6e7d0, 0xf0d5c0, 0xe4eedb, 0xdfe8f2, 0xf7dcd9, 0xfff0c9];
const ROOFS = [0xb5533c, 0x9a4a3a, 0x6b6f76, 0x8a5a44];
const AWNING = [0xe5484d, 0x30a46c, 0x3e63dd, 0xf76b15, 0xd6409f, 0x00a2c7];
const GRASS = 0x7cc36a, STONE = 0xe9e2cf, CONCRETE = 0xc9c9c4, PATH = 0xe0cfa4, WATER = 0x58b8e0;

// ---- window textures: white wall with one dark window, tiled across each facade and tinted by the wall colour
let windowTextures;
function windows(style) {
  windowTextures ||= {
    res: canvasTexture(64, 64, ctx => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#5a7896'; ctx.fillRect(15, 12, 34, 36);
      ctx.fillStyle = '#86a8c6'; ctx.fillRect(15, 12, 34, 10);
      ctx.fillStyle = '#dcdcdc'; ctx.fillRect(12, 48, 40, 4);
    }, { repeat: true }),
    office: canvasTexture(64, 64, ctx => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#6c98c2'; ctx.fillRect(3, 10, 58, 42);
      ctx.fillStyle = '#a3c8e8'; ctx.fillRect(3, 10, 58, 12);
    }, { repeat: true }),
  };
  return windowTextures[style];
}

const wallMats = new Map();
function wallMat(color, style, glassy) {
  const key = `${color}|${style}|${glassy}`;
  if (!wallMats.has(key)) {
    wallMats.set(key, new THREE.MeshStandardMaterial({
      color, map: style === 'plain' ? null : windows(style), flatShading: true,
      roughness: glassy ? 0.22 : 0.8, metalness: glassy ? 0.55 : 0.02,
    }));
  }
  return wallMats.get(key);
}

/** A box whose side faces tile a whole number of windows per floor. */
function wallGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const across = [d, d, 0, 0, w, w].map(len => Math.max(1, Math.round(len / 3.2)));   // face order: +x -x +y -y +z -z
  const floors = Math.max(1, Math.round(h / FLOOR));
  for (let face = 0; face < 6; face++) {
    if (face === 2 || face === 3) continue;
    for (let k = face * 4; k < face * 4 + 4; k++) uv.setXY(k, uv.getX(k) * across[face], uv.getY(k) * floors);
  }
  return geo;
}

/** One city block. Everything is placed in block-local coordinates with the block's front at +z. */
class Lot {
  constructor(city, i, j, turns) {
    this.city = city;
    this.cx = blockCenter(i); this.cz = blockCenter(j);
    this.turns = ((turns % 4) + 4) % 4;
    this.group = new THREE.Group();
    this.group.position.set(this.cx, SIDEWALK_H, this.cz);
    this.group.rotation.y = this.turns * Math.PI / 2;
    city.root.add(this.group);
  }

  /** Block-local ground position -> world [x, z]. */
  world(lx, lz) {
    const c = [1, 0, -1, 0][this.turns], s = [0, 1, 0, -1][this.turns];
    return [this.cx + lx * c + lz * s, this.cz - lx * s + lz * c];
  }

  solid(lx, lz, w, d) {
    const [x, z] = this.world(lx, lz);
    const [hw, hd] = this.turns % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
    this.city.boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, map: true });
  }

  round(lx, lz, r, onMap = false) {
    const [x, z] = this.world(lx, lz);
    this.city.circles.push({ x, z, r, map: onMap });
  }

  add(object, lx = 0, y = 0, lz = 0, { shadow = true } = {}) {
    object.position.set(lx, y, lz);
    object.traverse(o => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
    this.group.add(object);
    return object;
  }

  /** Plain coloured box sitting on the ground (or at height y). Not solid unless asked. */
  box(lx, lz, w, d, h, color, { y = 0, solid = false, shadow = true, finish } = {}) {
    if (solid) this.solid(lx, lz, w, d);
    const material = typeof color === 'number' ? mat(color, finish) : color;
    return this.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), lx, y + h / 2, lz, { shadow });
  }

  /** A building with windows. Solid by default. */
  building(lx, lz, w, d, h, color, { style = 'res', y = 0, solid = true, roof = 0x8d9199, glassy = false } = {}) {
    if (solid) this.solid(lx, lz, w, d);
    const side = wallMat(color, style, glassy), top = mat(roof);
    const m = new THREE.Mesh(wallGeometry(w, h, d), [side, side, top, top, side, side]);
    return this.add(m, lx, y + h / 2, lz);
  }

  cylinder(lx, lz, rTop, rBottom, h, color, { y = 0, segments = 12, finish, shadow = true } = {}) {
    const material = typeof color === 'number' ? mat(color, finish) : color;
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material), lx, y + h / 2, lz, { shadow });
  }

  /** A sign board. yaw 0 faces the block's front. */
  sign(text, lx, y, lz, width, { yaw = 0, bg = '#1c2733', fg = '#ffffff', glow = 0.4, backToo = false } = {}) {
    const tex = signTexture(text, { bg, fg });
    const material = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow, roughness: 0.6 });
    const geo = new THREE.PlaneGeometry(width, width / 6.4);
    for (const flip of backToo ? [0, Math.PI] : [0]) {
      const m = this.add(new THREE.Mesh(geo, material), lx, y, lz, { shadow: false });
      m.rotation.y = yaw + flip;
    }
  }

  /** A low free-standing name board near the kerb. */
  monument(text, lz, { bg, fg, width = 16 } = {}) {
    this.box(0, lz, width + 1, 0.9, 0.7, STONE, { solid: true });
    this.box(0, lz, width + 0.4, 0.5, width / 6.4 + 0.3, 0x2a2f38, { y: 0.7 });
    this.sign(text, 0, 0.7 + (width / 6.4 + 0.3) / 2, lz + 0.26, width, { bg, fg });
  }

  tree(lx, lz, scale = 1) {
    const [x, z] = this.world(lx, lz);
    this.city.trees.push({ x, z, scale });
    this.city.circles.push({ x, z, r: 0.35 });
  }

  /** Scatter trees in a rectangle, skipping anywhere `blocked(lx, lz)` says no. */
  grove(count, minX, maxX, minZ, maxZ, blocked = () => false) {
    const rng = this.city.rng;
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
      const lx = minX + rng() * (maxX - minX), lz = minZ + rng() * (maxZ - minZ);
      if (blocked(lx, lz)) continue;
      this.tree(lx, lz, 0.8 + rng() * 0.6);
      n++;
    }
  }

  /** Mark part of the block as grass: slows the car and shows green on the map. */
  grass(lx = 0, lz = 0, w = IN * 2, d = IN * 2) {
    this.box(lx, lz, w, d, 0.06, GRASS, { shadow: false });
    const [x, z] = this.world(lx, lz);
    const [hw, hd] = this.turns % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
    this.city.lawns.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  pond(lx, lz, r) {
    this.cylinder(lx, lz, r, r, 0.1, WATER, { y: 0.03, segments: 20, finish: { rough: 0.1, metal: 0.3 }, shadow: false });
    this.cylinder(lx, lz, r + 0.6, r + 0.6, 0.08, PATH, { y: 0.02, segments: 20, shadow: false });
    const [x, z] = this.world(lx, lz);
    this.city.ponds.push({ x, z, r });
  }
}

// ------------------------------------------------------------------ ordinary blocks

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const floorsToHeight = n => Math.round(n) * FLOOR;

function rooftopClutter(lot, lx, lz, w, d, h, rng) {
  for (let n = 0; n < 1 + Math.floor(rng() * 3); n++) {
    const s = 1.5 + rng() * 2.5;
    lot.box(lx + (rng() - 0.5) * (w - s - 2), lz + (rng() - 0.5) * (d - s - 2), s, s, 0.8 + rng() * 1.4, 0xa6abb3, { y: h });
  }
}

function midrise(lot, rng) {
  const cols = 2, rows = rng() < 0.5 ? 2 : 3;
  const cw = IN * 2 / cols, ch = IN * 2 / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const lx = -IN + (c + 0.5) * cw, lz = -IN + (r + 0.5) * ch;
    const w = cw - 3, d = ch - 3, h = floorsToHeight(4 + rng() * 6);
    lot.building(lx, lz, w, d, h, pick(rng, PASTEL));
    rooftopClutter(lot, lx, lz, w, d, h, rng);
  }
}

function offices(lot, rng) {
  const cw = IN;
  for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) {
    const lx = -IN + (c + 0.5) * cw, lz = -IN + (r + 0.5) * cw;
    if (rng() < 0.2) {                                   // a small plaza instead of a tower
      lot.box(lx, lz, cw - 3, cw - 3, 0.08, 0xd8d4c8, { shadow: false });
      lot.grove(4, lx - 10, lx + 10, lz - 10, lz + 10);
      continue;
    }
    const color = pick(rng, OFFICE), h = floorsToHeight(9 + rng() * 12);
    lot.building(lx, lz, cw - 3, cw - 3, FLOOR * 2, color, { style: 'office' });
    lot.building(lx, lz, cw - 9, cw - 9, h, color, { style: 'office', y: FLOOR * 2, solid: false, glassy: rng() < 0.5 });
    rooftopClutter(lot, lx, lz, cw - 9, cw - 9, h + FLOOR * 2, rng);
  }
}

function houses(lot, rng) {
  lot.grass();
  const cw = IN * 2 / 3;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    const lx = -IN + (c + 0.5) * cw, lz = -IN + (r + 0.5) * cw;
    if (c === 1 && r === 1) { lot.grove(5, lx - 8, lx + 8, lz - 8, lz + 8); continue; }
    const w = 11 + rng() * 3, d = 10 + rng() * 3, h = floorsToHeight(2 + (rng() < 0.3 ? 1 : 0));
    lot.building(lx, lz, w, d, h, pick(rng, HOUSE), { roof: 0x9a9a9a });
    // hipped roof: a four-sided cone stretched over the footprint
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), mat(pick(rng, ROOFS)));
    roof.scale.set(w + 1, 3, d + 1);
    lot.add(roof, lx, h + 1.5, lz);
    if (rng() < 0.7) lot.tree(lx + (rng() < 0.5 ? -1 : 1) * (w / 2 + 2), lz + (rng() - 0.5) * 6, 0.7 + rng() * 0.4);
  }
}

function shop(lot, rng, lx, lz, w, d, outX, outZ) {
  const h = 5 + rng() * 3;
  lot.building(lx, lz, w, d, h, pick(rng, PASTEL), { style: 'office' });
  // awning on the street side
  const color = pick(rng, AWNING);
  if (outZ) lot.box(lx, lz + outZ * (d / 2 + 0.8), w - 2, 1.6, 0.25, color, { y: 3.1 });
  else lot.box(lx + outX * (w / 2 + 0.8), lz, 1.6, d - 2, 0.25, color, { y: 3.1 });
}

function shops(lot, rng) {
  const cw = IN * 2 / 3;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    if (c === 1 && r === 1) continue;
    const outZ = r === 0 ? -1 : r === 2 ? 1 : 0, outX = outZ ? 0 : c === 0 ? -1 : 1;
    // push each shop against the street
    const lx = -IN + (c + 0.5) * cw + (outZ ? 0 : outX * 2.5), lz = -IN + (r + 0.5) * cw + outZ * 2.5;
    shop(lot, rng, lx, lz, outZ ? cw - 2 : 15, outZ ? 15 : cw - 2, outX, outZ);
  }
  lot.grove(4, -8, 8, -8, 8);
}

/** Three mid-rises across the back of a block and a small shop either side of the front. */
function backdrop(lot, rng) {
  for (const [lx, w] of [[-22, 18], [0, 20], [22, 18]]) {
    const h = floorsToHeight(4 + rng() * 5);
    lot.building(lx, -15, w, 28, h, pick(rng, PASTEL));
    rooftopClutter(lot, lx, -15, w, 28, h, rng);
  }
  shop(lot, rng, -23, 21, 16, 15, 0, 1);
  shop(lot, rng, 23, 21, 16, 15, 0, 1);
}

// ------------------------------------------------------------------ landmarks (front faces local +z)

const LANDMARKS = {
  hospital(lot) {
    lot.building(0, -6, 46, 26, 24, 0xf4f6f8, { roof: 0xb9c0c8 });
    lot.building(-18, 17, 22, 18, 12.8, 0xeef1f4, { roof: 0xb9c0c8 });
    lot.box(0, -6, 46.3, 26.3, 1, 0xe5484d, { y: 12 });                    // red band
    // ambulance canopy
    lot.box(9, 12.5, 16, 11, 0.4, 0xe5484d, { y: 4.4 });
    for (const lx of [2.5, 15.5]) lot.cylinder(lx, 17, 0.25, 0.25, 4.4, 0xdadde2);
    lot.sign('CITY HOSPITAL', 9, 5.6, 18.05, 13, { bg: '#ffffff', fg: '#d32f37' });
    // red cross high on the front
    const red = mat(0xe5484d, { emissive: 0x7a1418 });
    lot.box(-10, 7.2, 6, 0.4, 1.7, red, { y: 17.2 });
    lot.box(-10, 7.2, 1.7, 0.4, 6, red, { y: 15 });
    // helipad
    const pad = canvasTexture(256, 256, (ctx, w) => {
      ctx.fillStyle = '#5c6570'; ctx.fillRect(0, 0, w, w);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(w / 2, w / 2, 104, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 150px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', w / 2, w / 2 + 8);
    });
    const helipad = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pad, roughness: 0.8 }));
    lot.add(helipad, 8, 24.05, -6, { shadow: false });
    lot.grove(5, 8, 30, 22, 30, (x, z) => Math.abs(x) < 6 && z > 28);
  },

  pizza(lot, rng) {
    backdrop(lot, rng);
    lot.building(0, 21, 22, 15, 6.4, 0xf7e2c0, { style: 'office', roof: 0x9a6b4c });
    // striped awning
    for (let k = 0; k < 10; k++) lot.box(-9 + k * 2, 29.4, 2, 1.8, 0.25, k % 2 ? 0xe5484d : 0xf8f8f8, { y: 3.1 });
    lot.sign('PIXEL PIZZA', 0, 5.1, 28.56, 15, { bg: '#c62828', fg: '#fff3c4' });
    // a giant pizza on the roof, tilted toward the street
    const pie = canvasTexture(256, 256, (ctx, w) => {
      const c = w / 2;
      ctx.fillStyle = '#d9a35a'; ctx.beginPath(); ctx.arc(c, c, 126, 0, 7); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(c, c, 108, 0, 7); ctx.fill();
      ctx.fillStyle = '#f6cf57'; ctx.beginPath(); ctx.arc(c, c, 98, 0, 7); ctx.fill();
      ctx.fillStyle = '#a5281b';
      for (const [x, y] of [[90, 80], [160, 70], [70, 150], [130, 130], [185, 140], [110, 190], [170, 195]]) {
        ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill();
      }
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.5, 24),
      [mat(0xd9a35a), new THREE.MeshStandardMaterial({ map: pie, roughness: 0.7 }), mat(0xd9a35a)]);
    disc.rotation.x = Math.PI / 2 - 0.35;
    lot.add(disc, 0, 12.2, 20);
    lot.cylinder(0, 19, 0.3, 0.3, 4, 0x6b6f76, { y: 6.4 });
  },

  museum(lot) {
    lot.building(0, -5, 54, 30, 13, STONE, { style: 'plain', roof: 0xcfc8b4 });
    lot.box(0, 15, 46, 11, 0.6, 0xd9d2bd, { shadow: false });              // porch and steps
    lot.box(0, 21.5, 40, 2, 0.3, 0xd9d2bd, { shadow: false });
    for (let k = 0; k < 8; k++) lot.cylinder(-17.5 + k * 5, 17, 0.85, 0.95, 10.4, STONE, { y: 0.6, segments: 10 });
    lot.solid(0, 17, 38, 2.4);
    lot.box(0, 14.5, 42, 8, 1.2, STONE, { y: 11 });                        // entablature
    const gable = new THREE.Shape([new THREE.Vector2(-21, 0), new THREE.Vector2(21, 0), new THREE.Vector2(0, 5.5)]);
    lot.add(new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 8, bevelEnabled: false }), mat(STONE)), 0, 12.2, 10.5);
    lot.sign('ART MUSEUM', 0, 11.6, 18.56, 16, { bg: '#e9e2cf', fg: '#4a3f2a', glow: 0.15 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7fb8a4, { rough: 0.5, metal: 0.3 }));
    lot.add(dome, 0, 13, -5);
    for (const [lx, color] of [[-10, 0x8e4ec6], [10, 0xf76b15]]) lot.box(lx, 12, 2.6, 0.15, 6.5, color, { y: 4 });   // banners
    lot.grove(6, -30, 30, 24, 30, x => Math.abs(x) < 22);
  },

  hotel(lot) {
    lot.building(0, -3, 54, 44, 8, 0xead9c8, { style: 'office', roof: 0xb7a996 });
    lot.building(0, -7, 30, 28, 64, 0xf3e4d3, { y: 8, solid: false, roof: 0xb7a996 });
    lot.box(0, -7, 32, 30, 2, 0xcaa24a, { y: 72, finish: { rough: 0.35, metal: 0.7 } });
    lot.box(0, -7, 14, 12, 5, 0xe7d8c6, { y: 74 });
    lot.sign('GRAND HOTEL', 0, 76.6, 7.9, 28, { bg: '#2a1a12', fg: '#f3c969', glow: 0.7, backToo: true });
    lot.box(0, 7.6, 29, 0.5, 5, 0x2a1a12, { y: 74 });
    // entrance canopy and carpet
    lot.box(0, 24, 16, 9, 0.5, 0xb3261e, { y: 4.6 });
    for (const lx of [-7, 7]) lot.cylinder(lx, 27.6, 0.2, 0.2, 4.6, 0xcaa24a, { finish: { rough: 0.3, metal: 0.8 } });
    lot.box(0, 25.5, 5, 13, 0.05, 0xb3261e, { shadow: false });
    lot.sign('GRAND HOTEL', 0, 5.6, 28.56, 12, { bg: '#2a1a12', fg: '#f3c969' });
    for (const lx of [-20, 20]) lot.tree(lx, 26, 0.9);
  },

  cafe(lot, rng) {
    backdrop(lot, rng);
    lot.building(0, 21, 22, 15, 6.4, 0xf3ead8, { style: 'office', roof: 0x7a5c48 });
    lot.box(0, 29.4, 20, 1.8, 0.25, 0x2f7d5b, { y: 3.1 });
    lot.sign('BEAN SCENE CAFE', 0, 5.1, 28.56, 16, { bg: '#2f5d47', fg: '#f7efd9' });
    // giant coffee cup on the roof
    lot.cylinder(0, 21, 2.6, 2.1, 4, 0xfafafa, { y: 6.4, segments: 16 });
    lot.cylinder(0, 21, 2.3, 2.3, 0.1, 0x4b2e1e, { y: 10.3, segments: 16 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.3, 6, 12), mat(0xfafafa));
    lot.add(handle, 2.9, 8.5, 21);
    for (const [lx, y, s] of [[-0.6, 11.6, 0.7], [0.5, 12.9, 0.9], [-0.2, 14.4, 1.1]]) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat(0xffffff, { opacity: 0.7 }));
      lot.add(puff, lx, y, 21, { shadow: false });
    }
    // pavement tables with umbrellas (no collision: they are behind the kerb)
    for (const lx of [-9, -5, 5, 9]) {
      lot.cylinder(lx, 30.6, 0.06, 0.06, 2.3, 0x555b66);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 8), mat(lx % 2 ? 0xf7efd9 : 0x2f7d5b));
      lot.add(shade, lx, 2.5, 30.6);
      lot.cylinder(lx, 30.6, 0.6, 0.6, 0.06, 0xf7efd9, { y: 0.75 });
    }
  },

  apartments(lot) {
    lot.grass();
    for (const [lx, lz, h, color] of [[-21, -8, 46, 0xdfe9f3], [0, -13, 58, 0xcfe0f0], [21, -8, 40, 0xe8eef5]]) {
      lot.building(lx, lz, 18, 18, floorsToHeight(h / FLOOR), color, { roof: 0x9aa7b5 });
      // balcony stacks down the front
      for (let y = FLOOR; y < h - 2; y += FLOOR) lot.box(lx, lz + 9.5, 7, 1.2, 0.25, 0xf7f9fb, { y });
    }
    lot.box(0, 14, 5, 34, 0.08, PATH, { shadow: false });
    lot.monument('RIVERSIDE APARTMENTS', 27, { bg: '#0b62b8', fg: '#ffffff', width: 18 });
    lot.grove(12, -30, 30, 6, 24, x => Math.abs(x) < 5);
  },

  tech(lot) {
    lot.box(0, 0, IN * 2, IN * 2, 0.08, 0xd8d4c8, { shadow: false });     // plaza paving
    const glass = { style: 'office', glassy: true, roof: 0x6f8799 };
    lot.building(0, -5, 36, 36, 41.6, 0x8ec5e8, glass);
    lot.building(0, -5, 29, 29, 35.2, 0x9bd0f0, { ...glass, y: 41.6, solid: false });
    lot.building(0, -5, 21, 21, 28.8, 0xa9dbf7, { ...glass, y: 76.8, solid: false });
    lot.cylinder(0, -5, 0.2, 0.9, 24, 0xdfe6ee, { y: 105.6, segments: 6, finish: { rough: 0.3, metal: 0.8 } });
    lot.monument('TECH TOWER', 24, { bg: '#0a2540', fg: '#7fe0ff', width: 14 });
    // a slowly turning cube out front
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat(0x00c2e0, { emissive: 0x006f85, rough: 0.2, metal: 0.6 }));
    cube.rotation.set(0.62, 0, 0.78);
    lot.add(cube, -18, 4.2, 22);
    lot.cylinder(-18, 22, 0.5, 0.8, 2, 0x5f6b78);
    lot.round(-18, 22, 1.2);
    lot.city.spinners.push(cube);
    for (const [lx, lz] of [[18, 22], [26, 22], [-28, 26], [28, -28], [-28, -28]]) lot.tree(lx, lz, 1);
  },

  stadium(lot) {
    const shell = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, flatShading: true, side: THREE.DoubleSide, roughness: 0.8 });
    const seats = new THREE.MeshStandardMaterial({ color: 0x3e63dd, flatShading: true, side: THREE.DoubleSide, roughness: 0.9 });
    lot.add(new THREE.Mesh(new THREE.CylinderGeometry(31, 27, 15, 28, 1, true), shell), 0, 7.5, 0);
    lot.add(new THREE.Mesh(new THREE.CylinderGeometry(30.5, 17, 13, 28, 1, true), seats), 0, 6.8, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(30.8, 0.8, 6, 28).rotateX(Math.PI / 2), mat(0xf4f6f8));
    lot.add(rim, 0, 15, 0);
    const pitch = canvasTexture(256, 256, (ctx, w) => {
      for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#4fae58' : '#58bb62'; ctx.fillRect(k * 32, 0, 32, w); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      ctx.strokeRect(40, 70, 176, 116);
      ctx.beginPath(); ctx.moveTo(128, 70); ctx.lineTo(128, 186); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 22, 0, 7); ctx.stroke();
    });
    const field = new THREE.Mesh(new THREE.CircleGeometry(17, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pitch, roughness: 0.9 }));
    lot.add(field, 0, 0.3, 0, { shadow: false });
    lot.round(0, 0, 31, true);
    // floodlights at the corners
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      lot.cylinder(sx * 29, sz * 29, 0.3, 0.45, 26, 0x8a919b);
      const head = lot.box(sx * 28.2, sz * 28.2, 5, 0.8, 3, mat(0xffffff, { emissive: 0xfff6cc }), { y: 25 });
      head.rotation.y = Math.atan2(-sx, -sz);
      lot.round(sx * 29, sz * 29, 0.5);
    }
    lot.sign('CITY STADIUM', 0, 11.4, 31.4, 20, { bg: '#1d3aa8', fg: '#ffffff' });
    lot.box(0, 31.1, 21, 0.5, 4, 0x1d3aa8, { y: 9.4 });
  },

  mall(lot) {
    lot.building(0, -8, 60, 38, 12.8, 0xf3e9dc, { style: 'plain', roof: 0xc4b8a6 });
    lot.box(0, -8, 60.4, 38.4, 1.6, 0xf2795b, { y: 9.4 });
    lot.box(0, 13, 20, 5, 10, mat(0x9bd0f0, { rough: 0.15, metal: 0.6 }), { solid: true });      // glass entrance
    lot.box(0, 15.6, 22, 0.6, 5.4, 0xf2795b, { y: 12.4 });
    lot.sign('SUNSET MALL', 0, 15.1, 15.95, 21, { bg: '#f2795b', fg: '#fff7e6', glow: 0.6 });
    // a setting sun behind the sign
    const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 20, 0, Math.PI), mat(0xffc53d, { emissive: 0xb86e00 }));
    lot.add(sun, 0, 17.8, 15.5, { shadow: false });
    for (const lx of [-24, -16, 16, 24]) { lot.box(lx, 27, 3, 3, 0.7, STONE, { solid: true }); lot.tree(lx, 27, 0.9); }
    for (const [lx, s] of [[-18, 4], [10, 3], [22, 5]]) lot.box(lx, -8, s, s, 1.2, 0xb9c0c8, { y: 12.8 });   // skylights
  },

  university(lot) {
    const brick = 0xb9573f;
    lot.grass(0, 12, IN * 2, 40);
    lot.building(0, -16, 54, 20, 16, brick, { roof: 0x6f4a3d });
    lot.box(0, -16, 55, 21, 0.9, 0xf2eadb, { y: 16 });
    for (const lx of [-22, 22]) lot.building(lx, 4, 12, 20, 12.8, brick, { roof: 0x6f4a3d });
    // clock tower
    lot.building(0, -16, 9, 9, 22, brick, { y: 16, solid: false, style: 'plain' });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), mat(0x2f6f5e));
    cap.scale.set(10.5, 9, 10.5);
    lot.add(cap, 0, 42.5, -16);
    const clock = canvasTexture(128, 128, (ctx, w) => {
      ctx.fillStyle = '#f7f1e1'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(64, 64, 58, 0, 7); ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 24); ctx.moveTo(64, 64); ctx.lineTo(90, 76); ctx.stroke();
    });
    const face = new THREE.MeshStandardMaterial({ map: clock, transparent: true, roughness: 0.6 });
    for (let k = 0; k < 4; k++) {
      const m = lot.add(new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), face),
        Math.sin(k * Math.PI / 2) * 4.56, 33, -16 + Math.cos(k * Math.PI / 2) * 4.56, { shadow: false });
      m.rotation.y = k * Math.PI / 2;
    }
    lot.box(0, 10, 4, 36, 0.09, PATH, { shadow: false });
    lot.monument('STATE UNIVERSITY', 28, { bg: '#7a2e22', fg: '#f7e9c8', width: 17 });
    lot.grove(10, -14, 14, -2, 22, x => Math.abs(x) < 4);
  },

  station(lot) {
    lot.building(0, -6, 58, 24, 9.6, 0xe6dccb, { roof: 0x6fa39a });
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 58, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
      mat(0x6fa39a, { rough: 0.5, metal: 0.3 }));
    vault.scale.y = 0.55;
    lot.add(vault, 0, 9.6, -6);
    lot.box(0, 10, 40, 8, 0.4, 0x4d6f69, { y: 5 });                        // front canopy
    for (const lx of [-18, -6, 6, 18]) lot.cylinder(lx, 13.4, 0.22, 0.22, 5, 0x3c4a4d);
    lot.sign('UNION STATION', 0, 7.6, 6.06, 22, { bg: '#2f4f4a', fg: '#f3e9c9' });
    lot.box(0, -6, 6, 25, 6, 0xe6dccb, { y: 9.6 });                        // central gable with a clock
    const dial = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), mat(0xf7f1e1, { emissive: 0x8a8370 }));
    lot.add(dial, 0, 12.6, 6.56, { shadow: false });
    lot.box(0, 24, 50, 9, 0.06, 0x6e727a, { shadow: false });              // drop-off forecourt
    for (const lx of [-26, 26]) lot.tree(lx, 20, 1);
  },

  park(lot) {
    lot.grass();
    lot.box(0, 0, IN * 2, 3.4, 0.09, PATH, { shadow: false });
    lot.box(0, 0, 3.4, IN * 2, 0.09, PATH, { shadow: false });
    // fountain where the paths cross
    lot.cylinder(0, 0, 5, 5.3, 0.7, STONE, { segments: 16 });
    lot.cylinder(0, 0, 4.4, 4.4, 0.1, WATER, { y: 0.66, segments: 16, finish: { rough: 0.1, metal: 0.3 }, shadow: false });
    lot.cylinder(0, 0, 0.5, 0.7, 2.4, STONE, { y: 0.6 });
    lot.cylinder(0, 0, 1.6, 0.4, 0.4, STONE, { y: 3 });
    lot.round(0, 0, 5.3);
    lot.pond(-17, 17, 8);
    for (const lx of [-7, 7]) lot.cylinder(lx, 31, 0.5, 0.6, 5, STONE);       // entrance arch
    lot.box(0, 31, 16, 0.8, 1.2, STONE, { y: 5 });
    lot.sign('CENTRAL PARK', 0, 5.6, 31.45, 13, { bg: '#e9e2cf', fg: '#2f6b3f', glow: 0.15 });
    lot.round(-7, 31, 0.6); lot.round(7, 31, 0.6);
    lot.grove(44, -30, 30, -30, 29,
      (x, z) => Math.abs(x) < 3.5 || Math.abs(z) < 3.5 || Math.hypot(x, z) < 8 || Math.hypot(x + 17, z - 17) < 10 || (Math.abs(x) < 10 && z > 24));
  },

  lakeside(lot) {
    lot.grass();
    lot.pond(-4, -8, 19);
    lot.box(-4, 6, 3, 16, 0.5, 0x9b7653, { solid: false });                    // pier
    lot.building(20, 20, 12, 9, 4.2, 0xf2e3b6, { roof: 0xb5533c });            // boathouse
    lot.box(0, 22, 3.4, 20, 0.09, PATH, { shadow: false });
    for (const lx of [-7, 7]) lot.cylinder(lx, 31, 0.5, 0.6, 5, 0x9b7653);
    lot.box(0, 31, 16, 0.8, 1.2, 0x9b7653, { y: 5 });
    lot.sign('LAKESIDE PARK', 0, 5.6, 31.45, 13, { bg: '#9b7653', fg: '#f7efd9', glow: 0.15 });
    lot.round(-7, 31, 0.6); lot.round(7, 31, 0.6);
    lot.grove(30, -30, 30, -30, 29,
      (x, z) => Math.hypot(x + 4, z + 8) < 22 || (Math.abs(x) < 10 && z > 4) || (x > 12 && z > 13));
  },
};

const GENERIC = { res: houses, mid: midrise, office: offices, shops };
const FRONT_TURNS = { S: 0, E: 1, N: 2, W: 3 };       // quarter turns that point a block's front at each side

// ------------------------------------------------------------------ roads, scenery, sky

function instancedQuads(scene, list, color, y) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, list.length);
  const o = new THREE.Object3D();
  list.forEach(([x, z, sx, sz], k) => {
    o.position.set(x, y, z); o.scale.set(sx, 1, sz); o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
  });
  m.receiveShadow = true;
  scene.add(m);
}

function roadMarkings(scene) {
  const white = [], yellow = [];
  for (let k = 0; k <= N; k++) for (let s = 0; s < N; s++) for (const eastWest of [true, false]) {
    const c = roadPos(k), a = roadPos(s) + ROAD / 2, b = a + BLOCK, mid = (a + b) / 2;
    // (along the road, across it, length along, length across) -> x, z, size x, size z
    const put = (list, along, across, la, lc) =>
      list.push(eastWest ? [along, c + across, la, lc] : [c + across, along, lc, la]);
    for (const side of [-1, 1]) {
      put(yellow, mid, side * 0.2, BLOCK - 11, 0.14);
      put(white, mid, side * 7.2, BLOCK - 11, 0.12);
      for (let d = a + 8; d < b - 9; d += 7.5) put(white, d + 1.5, side * 3.5, 3, 0.14);
    }
    for (let off = -6.6; off <= 6.61; off += 1.2) {            // zebra crossings at both ends
      put(white, a + 2.6, off, 2.6, 0.55);
      put(white, b - 2.6, off, 2.6, 0.55);
    }
    // stop lines, on the side of the road that drives toward that end
    const startSide = eastWest ? -1 : 1;
    put(white, a + 4.7, startSide * 3.75, 0.45, 7.3);
    put(white, b - 4.7, -startSide * 3.75, 0.45, 7.3);
  }
  instancedQuads(scene, white, 0xf2f2ee, 0.02);
  instancedQuads(scene, yellow, 0xf2c230, 0.02);
}

function plantTrees(scene, trees, rng) {
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), mat(0x7a5536), trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 0), mat(0xffffff), trees.length);
  const greens = [0x4f9d4a, 0x5cab52, 0x3f8c46, 0x6bb85a, 0x48a05a];
  const o = new THREE.Object3D(), color = new THREE.Color();
  trees.forEach((t, k) => {
    o.rotation.set(0, rng() * 6.28, 0);
    o.position.set(t.x, SIDEWALK_H + 1.2 * t.scale, t.z); o.scale.setScalar(t.scale); o.updateMatrix();
    trunks.setMatrixAt(k, o.matrix);
    o.position.y = SIDEWALK_H + 3.5 * t.scale; o.scale.set(t.scale, t.scale * (0.9 + rng() * 0.4), t.scale); o.updateMatrix();
    crowns.setMatrixAt(k, o.matrix);
    crowns.setColorAt(k, color.setHex(pick(rng, greens)));
  });
  for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
}

function sky(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f86e0) }, horizon: { value: new THREE.Color(0xd4ecfb) } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying float h;
        void main(){ gl_FragColor = vec4(mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
  dome.renderOrder = -1;
  scene.add(dome);

  const clouds = [];
  const rng = mulberry32(99);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, fog: false });
  for (let n = 0; n < 16; n++) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 4 + Math.floor(rng() * 4); p++) {
      const m = new THREE.Mesh(puff, white);
      m.position.set((rng() - 0.5) * 60, (rng() - 0.5) * 6, (rng() - 0.5) * 24);
      m.scale.set(14 + rng() * 14, 7 + rng() * 5, 12 + rng() * 10);
      cloud.add(m);
    }
    cloud.position.set((rng() - 0.5) * 2200, 170 + rng() * 120, (rng() - 0.5) * 2200);
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function surroundings(scene, boxes) {
  const ground = (size, y, color, finish) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat(color, finish));
    m.position.y = y; m.receiveShadow = true;
    scene.add(m);
  };
  ground(SIZE, 0, 0x41464d, { rough: 0.95 });                      // asphalt: every road is just the gap between blocks
  ground(SIZE + 90, -0.25, 0xead9a8, { rough: 1 });                // beach
  ground(6000, -0.6, 0x3fa9d6, { rough: 0.25, metal: 0.2 });       // sea

  // promenade and sea wall around the edge
  const edge = HALF + 3, wall = HALF + 6.2;
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const long = SIZE + 12.8;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(sx ? 6 : long, SIDEWALK_H, sx ? long : 6), mat(CONCRETE));
    walk.position.set(sx * edge, SIDEWALK_H / 2, sz * edge); walk.receiveShadow = true;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(sx ? 0.5 : long, 0.9, sx ? long : 0.5), mat(0xf1ede2));
    rail.position.set(sx * wall, SIDEWALK_H + 0.45, sz * wall); rail.castShadow = true;
    scene.add(walk, rail);
    const far = wall + 20;
    boxes.push(sx
      ? { minX: sx * far - 20.2, maxX: sx * far + 20.2, minZ: -far - 20, maxZ: far + 20 }
      : { minX: -far - 20, maxX: far + 20, minZ: sz * far - 20.2, maxZ: sz * far + 20.2 });
  }

  // hills on the horizon
  const rng = mulberry32(5);
  for (let n = 0; n < 9; n++) {
    const angle = n / 9 * Math.PI * 2 + rng() * 0.4, dist = 900 + rng() * 350;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(160 + rng() * 140, 60 + rng() * 80, 7), mat(0x7fae84, { rough: 1 }));
    hill.position.set(Math.cos(angle) * dist, 20, Math.sin(angle) * dist);
    hill.rotation.y = rng() * 6;
    scene.add(hill);
  }
}

/**
 * Fold every static mesh under `root` into one mesh per material. The city is a few hundred
 * small boxes; drawing them one by one costs far more than the triangles themselves.
 */
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const merged = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || keep.has(o)) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const { position, normal, uv } = geo.attributes;
    const many = Array.isArray(o.material);
    const groups = many ? geo.groups : [{ start: 0, count: position.count, materialIndex: 0 }];
    for (const g of groups) {
      const material = many ? o.material[g.materialIndex] : o.material;
      const key = material.uuid + (o.castShadow ? '+' : '-');
      if (!buckets.has(key)) buckets.set(key, { material, cast: o.castShadow, position: [], normal: [], uv: [] });
      const b = buckets.get(key);
      for (let k = g.start; k < g.start + g.count; k++) {
        b.position.push(position.getX(k), position.getY(k), position.getZ(k));
        b.normal.push(normal.getX(k), normal.getY(k), normal.getZ(k));
        b.uv.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
      }
    }
    merged.push(o);
  });
  for (const o of merged) o.removeFromParent();
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast; m.receiveShadow = true;
    root.add(m);
  }
}

// ------------------------------------------------------------------ assemble

export function buildWorld(scene) {
  const city = {
    scene, root: new THREE.Group(), rng: mulberry32(20261207),
    boxes: [], circles: [], lawns: [], ponds: [], trees: [], spinners: [],
  };
  surroundings(scene, city.boxes);
  roadMarkings(scene);

  const sidewalk = new THREE.BoxGeometry(BLOCK, SIDEWALK_H, BLOCK);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const base = new THREE.Mesh(sidewalk, mat(CONCRETE));
    base.position.set(blockCenter(i), SIDEWALK_H / 2, blockCenter(j));
    base.receiveShadow = true;
    city.root.add(base);

    const kind = BLOCK_PLAN[j][i];
    const place = PLACES.find(p => p.id === kind);
    if (place) LANDMARKS[kind](new Lot(city, i, j, FRONT_TURNS[place.side]), city.rng);
    else GENERIC[kind](new Lot(city, i, j, Math.floor(city.rng() * 4)), city.rng);
  }
  mergeStatic(city.root, new Set(city.spinners));
  scene.add(city.root);
  plantTrees(scene, city.trees, city.rng);
  const clouds = sky(scene);

  const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  return {
    boxes: city.boxes,
    circles: city.circles,
    lawns: city.lawns,
    ponds: city.ponds,

    /** Ground height and extra drag under a point. */
    surfaceAt(x, z) {
      const i = Math.floor((x - blockMin(0)) / PITCH), j = Math.floor((z - blockMin(0)) / PITCH);
      const onBlock = i >= 0 && i < N && j >= 0 && j < N && x - blockMin(i) <= BLOCK && z - blockMin(j) <= BLOCK;
      const onRoad = !onBlock && Math.abs(x) <= HALF && Math.abs(z) <= HALF;
      if (onRoad) return { height: 0, drag: 0 };
      const grass = onBlock && city.lawns.some(r => inRect(r, x, z));
      return { height: SIDEWALK_H, drag: grass ? 1.3 : 0.2 };
    },

    /** True if a point is inside a building or wall. */
    blocked(x, z) { return city.boxes.some(b => inRect(b, x, z)); },

    update(dt) {
      for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > 1200) c.position.x = -1200; }
      for (const s of city.spinners) s.rotation.y += dt * 0.6;
    },
  };
}
