// Boots the game and runs the frame loop: input -> physics -> world -> camera -> draw.
import * as THREE from 'three';
import { input, attachKeyboard } from './input.js';
import { Car, TOP_SPEED, NITRO_SPEED, impactSeverity } from './car.js';
import { buildWorld } from './world.js';
import { buildCar } from './models.js';
import { roadPos, LANE_OUTER } from './layout.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;      // keeps the low-poly colours saturated
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe6f7, 260, 1700);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

scene.add(new THREE.HemisphereLight(0xdcefff, 0xb0a48c, 1.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
const SUN_OFFSET = new THREE.Vector3(90, 150, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 420 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);

const world = buildWorld(scene);

// ---- the player's taxi
const car = new Car();
const taxi = buildCar({ taxi: true });
const taxiRoot = new THREE.Group();        // position and heading; the model inside leans and pitches
taxiRoot.add(taxi.group);
scene.add(taxiRoot);

function spawn() {
  // right-hand lane of a central north-south road, facing south
  car.place(roadPos(3) - LANE_OUTER, (roadPos(2) + roadPos(3)) / 2, 0);
}
spawn();

const game = {
  state: 'menu',              // menu | playing | paused
  time: 0,
  cameraMode: 0,
  cameraYaw: 0,
  groundY: 0,
  lean: 0,
  pitch: 0,
  lastForward: 0,
};

// ---- camera
const CAMERAS = [
  { back: 9.5, up: 4.3, ahead: 4 },       // chase
  { back: 16, up: 9, ahead: 6 },          // far chase
  { back: 0.5, up: 46, ahead: 6 },        // overhead
];
const lookAt = new THREE.Vector3();
const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function updateCamera(dt) {
  if (game.state === 'menu') {
    // slow orbit over the city behind the start screen
    const a = game.time * 0.05;
    camera.position.set(Math.cos(a) * 330, 150, Math.sin(a) * 330);
    camera.lookAt(0, 20, 0);
    return;
  }
  const mode = CAMERAS[game.cameraMode];
  game.cameraYaw += angleDelta(car.yaw, game.cameraYaw) * (1 - Math.exp(-5 * dt));
  const sx = Math.sin(game.cameraYaw), sz = Math.cos(game.cameraYaw);
  const boost = car.boosting ? 1 : 0;
  // pull the camera in if a building would sit between it and the car
  let back = mode.back + Math.abs(car.forwardSpeed) * 0.06;
  while (back > 3.5 && (world.blocked(car.x - sx * back, car.z - sz * back) || world.blocked(car.x - sx * back * 0.6, car.z - sz * back * 0.6))) back -= 0.75;
  camera.position.set(car.x - sx * back, game.groundY + mode.up, car.z - sz * back);
  lookAt.set(car.x + car.fx * mode.ahead, game.groundY + 1.3, car.z + car.fz * mode.ahead);
  camera.lookAt(lookAt);
  const fov = 62 + 5 * Math.min(1, car.speed / TOP_SPEED) + 12 * boost;
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
  camera.updateProjectionMatrix();
}

// ---- one step of the game
const STEP = 1 / 120;
function stepPhysics(dt) {
  const surface = world.surfaceAt(car.x, car.z);
  car.update(dt, {
    steer: input.steer,
    drive: input.drive,
    handbrake: input.isDown('handbrake'),
    nitro: input.isDown('nitro'),
  }, surface.drag);
  const hit = car.collide(world.boxes, world.circles);
  if (hit.speed > 0) onImpact(hit);
}

let impactCooldown = 0;
function onImpact(hit) {
  const severity = impactSeverity(hit.speed);
  if (!severity || impactCooldown > 0) return;
  impactCooldown = 0.5;
  for (const fn of impactListeners) fn(severity, hit);
}
const impactListeners = [];

function tick(dt) {
  game.time += dt;
  if (game.state === 'playing') {
    impactCooldown -= dt;
    for (let left = dt; left > 1e-6; left -= STEP) stepPhysics(Math.min(STEP, left));
    for (const fn of tickListeners) fn(dt);
  }
  world.update(dt);

  // place and dress the taxi model
  const surface = world.surfaceAt(car.x, car.z);
  game.groundY += (surface.height - game.groundY) * (1 - Math.exp(-18 * dt));
  taxiRoot.position.set(car.x, game.groundY, car.z);
  taxiRoot.rotation.y = car.yaw;
  const fwd = car.forwardSpeed;
  const accel = dt > 0 ? (fwd - game.lastForward) / dt : 0;
  game.lastForward = fwd;
  const smooth = 1 - Math.exp(-8 * dt);
  game.lean += (car.steer * Math.min(1, Math.abs(fwd) / 14) * 0.07 - game.lean) * smooth;
  game.pitch += (Math.max(-0.05, Math.min(0.04, -accel * 0.0022)) - game.pitch) * smooth;
  taxi.group.rotation.set(game.pitch, 0, game.lean);
  for (const wheel of taxi.wheels) wheel.rotation.x += fwd * dt / 0.36;
  for (const pivot of taxi.steerPivots) pivot.rotation.y = -car.steer * 0.42;
  taxi.tailLights.emissiveIntensity = car.braking ? 2.4 : 0.35;

  sun.position.set(car.x, 0, car.z).add(SUN_OFFSET);
  sun.target.position.set(car.x, 0, car.z);
  updateCamera(dt);
}
const tickListeners = [];

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state !== 'paused') tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---- controls that are not driving
attachKeyboard();
input.onPress('camera', () => { game.cameraMode = (game.cameraMode + 1) % CAMERAS.length; });
input.onPress('reset', () => {
  if (game.state !== 'playing') return;
  // back onto the nearest lane, facing the way the road runs
  const k = Math.round((car.x - roadPos(0)) / (roadPos(1) - roadPos(0)));
  car.place(roadPos(Math.max(0, Math.min(6, k))) - LANE_OUTER, car.z, 0);
});
input.onPress('pause', () => {
  if (game.state === 'menu') return;
  game.state = game.state === 'paused' ? 'playing' : 'paused';
  document.getElementById('paused').hidden = game.state !== 'paused';
});

function goOnline() {
  if (game.state !== 'menu') return;
  game.state = 'playing';
  game.cameraYaw = car.yaw;
  document.getElementById('start').hidden = true;
  document.getElementById('hud').hidden = false;
  for (const fn of startListeners) fn();
}
const startListeners = [];
document.getElementById('go-online').addEventListener('click', goOnline);
input.onPress('accept', goOnline);

// Handles for the browser console and for automated checks.
window.game = { game, car, world, input, scene, camera, renderer, tick, goOnline, impactListeners, tickListeners, startListeners };

requestAnimationFrame(frame);
