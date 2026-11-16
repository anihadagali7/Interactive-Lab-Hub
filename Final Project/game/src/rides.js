// The taxi job: a request comes in, you accept or decline, drive to the pickup, carry the
// rider to the drop-off, and get rated.
//
//   idle -> request -> toPickup -> boarding -> inRide -> alighting -> rating -> idle
//            decline/timeout -> idle        cancel (hold X) -> idle
import * as THREE from 'three';
import { PLACES, route, routeLength } from './layout.js';
import { rateTrip, fareFor, parTime } from './scoring.js';
import { RIDERS, farewell } from './chat.js';
import { buildPerson, skinTones } from './models.js';
import { SIDEWALK_H } from './world.js';

const REQUEST_SECONDS = 14;
const ARRIVE_RADIUS = 9;          // metres from the kerb stop
const ARRIVE_SPEED = 1.2;         // m/s: the car has to be all but stopped
const BOARD_SECONDS = 1.6;
const CANCEL_HOLD = 1;            // seconds X must be held
const RATING_SECONDS = 10;
const MAX_DAMAGE = 4;             // damage that empties the comfort bar

const pick = list => list[Math.floor(Math.random() * list.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** A glowing ring, light beam and bobbing gem that marks where to stop. */
function buildMarker(color) {
  const group = new THREE.Group();
  const glow = extra => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 6, 28).rotateX(Math.PI / 2), glow({ opacity: 0.95 }));
  ring.position.y = 0.15;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 26, 24, 1, true), glow({ opacity: 0.16, side: THREE.DoubleSide }));
  beam.position.y = 13;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), glow({ opacity: 0.95 }));
  group.add(ring, beam, gem);
  group.visible = false;
  return { group, gem, ring };
}

export class Rides {
  constructor({ scene, car, hud, chat, audio, input }) {
    Object.assign(this, { scene, car, hud, chat, audio, input });
    this.state = 'offline';
    this.stats = { earned: 0, ratings: [], rides: 0 };
    this.request = null;
    this.routePoints = null;
    this.figure = null;            // the rider standing on the pavement
    this.time = 0;
    this.pickupMarker = buildMarker(0x3ddc84);
    this.dropoffMarker = buildMarker(0xff5fa2);
    scene.add(this.pickupMarker.group, this.dropoffMarker.group);
    input.onPress('accept', () => this.accept());
    input.onPress('decline', () => this.decline(false));
  }

  start() {
    this.state = 'idle';
    this.timer = 2.5;
    this.hud.setStats(this.stats);
  }

  // ---------------------------------------------------------------- what the HUD and map show

  get pickup() { return ['toPickup', 'boarding'].includes(this.state) ? this.request.pickup : null; }
  get dropoff() { return this.state === 'inRide' ? this.request.dropoff : null; }

  get objective() {
    const r = this.request;
    switch (this.state) {
      case 'idle': return { title: 'Waiting for a ride request', detail: 'Drive around. A request will come in.' };
      case 'request': return { title: 'New ride request', detail: 'Accept or decline it on the right.' };
      case 'toPickup': return { kind: 'pickup', title: `Pick up ${r.rider.name} at ${r.pickup.name}`, target: r.pickup.stop };
      case 'boarding': return { kind: 'pickup', title: `${r.rider.name} is getting in`, detail: 'Hold still.' };
      case 'inRide': return { kind: 'dropoff', title: `Drop ${r.rider.name} at ${r.dropoff.name}`, target: r.dropoff.stop };
      case 'alighting': return { kind: 'dropoff', title: `${r.rider.name} is getting out`, detail: 'Hold still.' };
      default: return null;
    }
  }

  // ---------------------------------------------------------------- requests

  offer() {
    const from = { x: this.car.x, z: this.car.z };
    // far enough away to be a drive, and a trip long enough to talk on
    const pickups = PLACES.filter(p => routeLength(route(from, p)) > 90);
    const pickup = pick(pickups);
    const dropoffs = PLACES.filter(p => p !== pickup && routeLength(route(pickup.stop, p)) > 230);
    const dropoff = pick(dropoffs);
    const rider = pick(RIDERS.filter(r => r !== this.lastRider));
    const tripLength = routeLength(route(pickup.stop, dropoff));
    this.request = {
      rider, pickup, dropoff, tripLength,
      toPickup: routeLength(route(from, pickup)),
      fare: fareFor(tripLength, 0).fare,
    };
    this.state = 'request';
    this.timer = REQUEST_SECONDS;
    this.removeFigure();
    this.hud.showRequest(this.request);
    this.audio.chime('request');
  }

  accept() {
    if (this.state === 'rating') return this.closeRating();
    if (this.state !== 'request') return;
    this.state = 'toPickup';
    this.lastRider = this.request.rider;
    this.hold = 0;
    this.waitSeconds = 0;
    this.hud.hideRequest();
    this.hud.showTrip(true);
    this.hud.toast(`Ride accepted. Head to ${this.request.pickup.name}.`);
    this.audio.chime('accept');
    this.placeFigure(this.request.pickup);
    this.showMarker(this.pickupMarker, this.request.pickup.stop);
  }

  decline(timedOut) {
    if (this.state !== 'request') return;
    this.hud.hideRequest();
    this.hud.toast(timedOut ? 'Request missed.' : 'Request declined.');
    this.audio.chime('decline');
    this.backToIdle(3 + Math.random() * 3);
  }

  /** The driver gave up on an accepted ride. Before pickup it is only a cancellation; with a rider on board it costs a 1-star rating. */
  cancel() {
    const r = this.request, onBoard = this.state === 'inRide';
    this.chat.stop();
    this.clearTrip();
    this.audio.chime('bad');
    if (onBoard) {
      this.stats.ratings.push(1);
      this.stats.rides++;
      this.hud.setStats(this.stats);
      this.hud.showRating({ rider: r.rider, cancelled: true, result: { overall: 1, speed: 1, safety: 1, chat: 1 }, quote: 'You are leaving me HERE?' });
      this.state = 'rating';
      this.timer = RATING_SECONDS;
    } else {
      this.hud.toast('Ride cancelled.');
      this.backToIdle(4);
    }
  }

  backToIdle(wait) {
    this.state = 'idle';
    this.timer = wait;
    this.request = null;
    this.routePoints = null;
  }

  clearTrip() {
    this.pickupMarker.group.visible = this.dropoffMarker.group.visible = false;
    this.hud.showTrip(false);
    this.hud.setCancel(0);
    this.removeFigure();
    this.routePoints = null;
  }

  closeRating() {
    this.hud.hideRating();
    this.backToIdle(2.5 + Math.random() * 3);
  }

  // ---------------------------------------------------------------- the rider on the pavement

  placeFigure(place) {
    this.removeFigure();
    const rider = this.request.rider;
    const person = buildPerson({ shirt: rider.shirt, skin: pick(skinTones) });
    person.group.position.set(place.wait.x, SIDEWALK_H, place.wait.z);
    person.group.rotation.y = Math.atan2(place.normal[0], place.normal[1]);     // face the road
    this.scene.add(person.group);
    this.figure = person;
  }
  removeFigure() {
    if (this.figure) this.scene.remove(this.figure.group);
    this.figure = null;
  }
  showMarker(marker, at) {
    marker.group.position.set(at.x, 0, at.z);
    marker.group.visible = true;
  }

  // ---------------------------------------------------------------- per frame

  /** A rider-relevant crash. @param severity see impactSeverity() */
  onImpact(severity) {
    if (this.state !== 'inRide') return;
    this.damage += severity;
    this.chat.react(severity >= 0.8 ? 'crash' : 'bump');
  }

  arrived(place) {
    return dist(this.car, place.stop) < ARRIVE_RADIUS && this.car.speed < ARRIVE_SPEED;
  }

  update(dt) {
    this.time += dt;
    const r = this.request, car = this.car;
    for (const m of [this.pickupMarker, this.dropoffMarker]) {
      m.gem.position.y = 4.2 + Math.sin(this.time * 3) * 0.5;
      m.gem.rotation.y += dt * 2;
      m.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
    }
    if (this.figure && this.state === 'toPickup') this.figure.arm.rotation.z = 2.5 + Math.sin(this.time * 9) * 0.35;   // wave

    switch (this.state) {
      case 'idle':
        if ((this.timer -= dt) <= 0) this.offer();
        break;

      case 'request':
        this.timer -= dt;
        this.hud.setRequestTimer(Math.max(0, this.timer / REQUEST_SECONDS));
        if (this.timer <= 0) this.decline(true);
        break;

      case 'toPickup':
        this.waitSeconds += dt;
        this.routePoints = route(car, r.pickup);
        this.hud.setTrip({ comfort: 1, seconds: this.waitSeconds, par: 0 });
        if (this.arrived(r.pickup)) {
          this.state = 'boarding';
          this.timer = BOARD_SECONDS;
          this.figure.arm.rotation.z = 0;
          this.audio.chime('pickup');
        }
        break;

      case 'boarding': {
        if (dist(car, r.pickup.stop) > ARRIVE_RADIUS + 5) {       // drove off before they got in
          this.placeFigure(r.pickup);
          this.state = 'toPickup';
          break;
        }
        this.timer -= dt;
        const t = 1 - Math.max(0, this.timer / BOARD_SECONDS);
        this.figure.group.position.set(
          r.pickup.wait.x + (car.x - r.pickup.wait.x) * t, SIDEWALK_H * (1 - t), r.pickup.wait.z + (car.z - r.pickup.wait.z) * t);
        if (this.timer <= 0) {
          this.removeFigure();
          this.pickupMarker.group.visible = false;
          this.showMarker(this.dropoffMarker, r.dropoff.stop);
          this.state = 'inRide';
          this.tripSeconds = 0;
          this.damage = 0;
          this.par = parTime(r.tripLength);
          this.chat.start(r.rider);
          this.hud.toast(`${r.rider.name} is on board. Go to ${r.dropoff.name}.`);
        }
        break;
      }

      case 'inRide':
        this.tripSeconds += dt;
        this.routePoints = route(car, r.dropoff);
        this.chat.update(dt);
        if (car.boosting) this.chat.react('nitro');
        this.hud.setTrip({ comfort: Math.max(0, 1 - this.damage / MAX_DAMAGE), seconds: this.tripSeconds, par: this.par });
        if (this.arrived(r.dropoff)) {
          this.state = 'alighting';
          this.timer = BOARD_SECONDS;
          this.chatScores = this.chat.stop();
          this.placeFigure(r.dropoff);
          this.figure.group.position.set(car.x, 0, car.z);
          this.dropoffMarker.group.visible = false;
          this.routePoints = null;
        }
        break;

      case 'alighting': {
        this.timer -= dt;
        const t = 1 - Math.max(0, this.timer / BOARD_SECONDS), w = r.dropoff.wait, from = this.figure.group.position;
        if (t < 1) from.set(from.x + (w.x - from.x) * Math.min(1, dt * 4), SIDEWALK_H * t, from.z + (w.z - from.z) * Math.min(1, dt * 4));
        if (this.timer <= 0) this.finishTrip();
        break;
      }

      case 'rating':
        if ((this.timer -= dt) <= 0) this.closeRating();
        break;
    }

    // hold X to cancel an accepted ride
    if (['toPickup', 'boarding', 'inRide'].includes(this.state)) {
      this.hold = this.input.isDown('cancel') ? this.hold + dt : 0;
      this.hud.setCancel(this.hold / CANCEL_HOLD);
      if (this.hold >= CANCEL_HOLD) this.cancel();
    }
  }

  finishTrip() {
    const r = this.request;
    const result = rateTrip({ seconds: this.tripSeconds, par: this.par, damage: this.damage, chatScores: this.chatScores });
    const { fare, tip } = fareFor(r.tripLength, result.overall);
    this.stats.earned += fare + tip;
    this.stats.ratings.push(result.overall);
    this.stats.rides++;
    this.lastResult = result;
    this.figure.group.position.set(r.dropoff.wait.x, SIDEWALK_H, r.dropoff.wait.z);
    this.figure.arm.rotation.z = 2.6;                             // a goodbye wave
    const keep = this.figure;
    this.figure = null;
    this.clearTrip();
    this.figure = keep;                                           // stays on the pavement until the next request
    this.hud.setStats(this.stats);
    this.hud.showRating({ rider: r.rider, result, fare, tip, quote: farewell(result.overall) });
    this.audio.chime(result.overall >= 3 ? 'rating' : 'bad');
    this.state = 'rating';
    this.timer = RATING_SECONDS;
  }
}
