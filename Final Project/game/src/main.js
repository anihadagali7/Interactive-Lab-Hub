// Boots the game and runs the frame loop: input -> physics -> traffic -> rides -> camera -> draw.
import * as THREE from 'three';
import { input, attachKeyboard } from './input.js';
import { Car, TOP_SPEED, impactSeverity } from './car.js';
import { buildWorld } from './world.js';
import { buildCar } from './models.js';
import { roadPos, LANE_OUTER, N, PITCH } from './layout.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Chat } from './chat.js';
import { Rides } from './rides.js';
import { Traffic } from './traffic.js';

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
// right-hand lane of a central north-south road, facing south
car.place(roadPos(3) - LANE_OUTER, (roadPos(2) + roadPos(3)) / 2, 0);

// ---- everyone else on the road
const TRAFFIC_COLORS = [0xd9483b, 0x3b7dd9, 0xf2f2f2, 0x2f3542, 0x4caf6e, 0x9b59b6, 0xe08a2e, 0x8fa3b8, 0x1f8a8a, 0xc9b28a];
const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'van', 'pickup'];
const pickFrom = list => list[Math.floor(Math.random() * list.length)];
const traffic = new Traffic(22, Math.random, car, () => {
  const model = buildCar({ color: pickFrom(TRAFFIC_COLORS), type: pickFrom(TRAFFIC_TYPES) });
  scene.add(model.group);
  return model.group;
});

const hud = new Hud(world);
const audio = new Audio();
const chat = new Chat(hud, input, audio);
const rides = new Rides({ scene, car, hud, chat, audio, input });

const game = {
  state: 'menu',              // menu | playing | paused
  manual: false,              // true: the frame loop only draws, and tests call tick() themselves
  time: 0,
  cameraMode: 0,
  cameraYaw: 0,
  groundY: 0,
  lean: 0,
  pitch: 0,
  lastForward: 0,
  impactCooldown: 0,
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
  // pull the camera in if a building would sit between it and the car
  let back = mode.back + Math.abs(car.forwardSpeed) * 0.06;
  while (back > 3.5 && (world.blocked(car.x - sx * back, car.z - sz * back) || world.blocked(car.x - sx * back * 0.6, car.z - sz * back * 0.6))) back -= 0.75;
  camera.position.set(car.x - sx * back, game.groundY + mode.up, car.z - sz * back);
  lookAt.set(car.x + car.fx * mode.ahead, game.groundY + 1.3, car.z + car.fz * mode.ahead);
  camera.lookAt(lookAt);
  const fov = 62 + 5 * Math.min(1, car.speed / TOP_SPEED) + (car.boosting ? 12 : 0);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
  camera.updateProjectionMatrix();
}

// ---- one step of the game
const STEP = 1 / 120;

function stepPhysics(dt, circles) {
  car.update(dt, {
    steer: input.steer,
    drive: input.drive,
    handbrake: input.isDown('handbrake'),
    nitro: input.isDown('nitro'),
  }, world.surfaceAt(car.x, car.z).drag);
  const hit = car.collide(world.boxes, circles);
  if (hit.speed > 0) onImpact(hit);
}

function onImpact(hit) {
  if (hit.circle?.car) traffic.bump(hit.circle.car);
  const severity = impactSeverity(hit.speed);
  if (!severity || game.impactCooldown > 0) return;
  game.impactCooldown = 0.5;
  audio.thud(severity);
  rides.onImpact(severity);
}

function tick(dt) {
  game.time += dt;
  traffic.update(dt, game.state === 'menu' ? { x: 1e6, z: 1e6 } : car);
  if (game.state === 'playing') {
    game.impactCooldown -= dt;
    const circles = world.circles.concat(traffic.circles);
    for (let left = dt; left > 1e-6; left -= STEP) stepPhysics(Math.min(STEP, left), circles);
    rides.update(dt);
    hud.setDash(car);
    hud.setObjective(rides.objective, car);
    hud.drawMaps({ car, route: rides.routePoints, pickup: rides.pickup, dropoff: rides.dropoff, traffic: traffic.cars });
    hud.tick(dt);
    audio.setEngine(Math.min(1.4, car.speed / TOP_SPEED), Math.max(0, input.drive), car.boosting);
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
  if (game.state !== 'paused' && !game.manual) tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---- controls that are not driving
attachKeyboard();
input.onPress('camera', () => { game.cameraMode = (game.cameraMode + 1) % CAMERAS.length; });
input.onPress('reset', () => {
  if (game.state !== 'playing') return;
  // back into the right-hand lane of the nearest north-south road, facing south
  const k = Math.max(0, Math.min(N, Math.round((car.x - roadPos(0)) / PITCH)));
  const j = Math.max(0, Math.min(N - 1, Math.floor((car.z - roadPos(0)) / PITCH)));
  car.place(roadPos(k) - LANE_OUTER, roadPos(j) + PITCH / 2, 0);
  game.cameraYaw = 0;
});
input.onPress('pause', () => {
  if (game.state === 'menu') return;
  game.state = game.state === 'paused' ? 'playing' : 'paused';
  document.getElementById('paused').hidden = game.state !== 'paused';
  if (game.state === 'paused') audio.silenceEngine();
});
input.onPress('map', () => { if (game.state === 'playing') hud.toggle('bigmap'); });
input.onPress('help', () => { if (game.state !== 'menu') hud.toggle('help'); });
input.on('horn', down => audio.horn(down && game.state === 'playing'));
input.onPress('mute', () => hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on', 1.5));

function goOnline() {
  if (game.state !== 'menu') return;
  game.state = 'playing';
  game.cameraYaw = car.yaw;
  document.getElementById('start').hidden = true;
  document.getElementById('hud').hidden = false;
  audio.start();
  rides.start();
}
document.getElementById('go-online').addEventListener('click', goOnline);
input.onPress('accept', goOnline);

// Handles for the browser console and for automated checks.
window.game = { game, car, world, input, scene, camera, renderer, tick, goOnline, rides, traffic, hud, chat, audio };

requestAnimationFrame(frame);
