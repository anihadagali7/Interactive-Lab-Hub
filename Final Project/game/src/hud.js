// Everything drawn over the 3D view: stats, ride request card, trip panel, rider chat,
// rating card, the rotating minimap and the full city map.
import { SIZE, HALF, N, BLOCK, blockMin, PLACES } from './layout.js';

const $ = id => document.getElementById(id);
const MARGIN = 45;                      // metres of beach and sea drawn around the city
const PX = 2;                           // map image pixels per metre
const MINIMAP_ZOOM = 1.45;              // minimap canvas pixels per metre
const toMap = (x, z) => [(x + HALF + MARGIN) * PX, (z + HALF + MARGIN) * PX];

const COLORS = {
  sea: '#1d4f6e', beach: '#6b6650', road: '#55616f', block: '#27313d', building: '#3b4959',
  lawn: '#2f6a46', pond: '#2c7fa8', line: '#7d8997', pickup: '#3ddc84', dropoff: '#ff5fa2', route: '#ffc21a',
};

export const fmtDistance = m => (m < 160 ? `${Math.max(10, Math.round(m * 3.281 / 10) * 10)} ft` : `${(m / 1609).toFixed(1)} mi`);
export const fmtMoney = v => `$${v.toFixed(2)}`;
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Five stars with halves, e.g. stars(3.6) fills three and a half. */
export function stars(value) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const cls = value >= i - 0.25 ? '' : value >= i - 0.75 ? 'star-half' : 'star-off';
    html += `<span class="${cls}">★</span>`;
  }
  return html;
}

function avatar(el, rider) {
  el.textContent = rider.name[0];
  el.style.background = rider.color;
}

export class Hud {
  constructor(world) {
    this.map = this.renderMap(world);
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap-canvas').getContext('2d');
    this.toastLeft = 0;
  }

  /** The whole city drawn once, north up; the minimap and the big map both paint from it. */
  renderMap(world) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = (SIZE + MARGIN * 2) * PX;
    const ctx = canvas.getContext('2d');
    const rect = (minX, minZ, maxX, maxZ) => {
      const [x, y] = toMap(minX, minZ);
      ctx.fillRect(x, y, (maxX - minX) * PX, (maxZ - minZ) * PX);
    };
    ctx.fillStyle = COLORS.sea; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.beach; rect(-HALF - 30, -HALF - 30, HALF + 30, HALF + 30);
    ctx.fillStyle = COLORS.road; rect(-HALF, -HALF, HALF, HALF);
    ctx.fillStyle = COLORS.block;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) rect(blockMin(i), blockMin(j), blockMin(i) + BLOCK, blockMin(j) + BLOCK);
    ctx.fillStyle = COLORS.lawn;
    for (const r of world.lawns) rect(r.minX, r.minZ, r.maxX, r.maxZ);
    ctx.fillStyle = COLORS.building;
    for (const b of world.boxes) if (b.map) rect(b.minX, b.minZ, b.maxX, b.maxZ);
    for (const c of world.circles) if (c.map) { ctx.beginPath(); ctx.arc(...toMap(c.x, c.z), c.r * PX, 0, 7); ctx.fill(); }
    ctx.fillStyle = COLORS.pond;
    for (const p of world.ponds) { ctx.beginPath(); ctx.arc(...toMap(p.x, p.z), p.r * PX, 0, 7); ctx.fill(); }
    // a dot on each named place
    for (const p of PLACES) {
      ctx.fillStyle = p.color; ctx.strokeStyle = '#0d1218'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(...toMap(p.wait.x - p.normal[0] * 6, p.wait.z - p.normal[1] * 6), 9, 0, 7); ctx.fill(); ctx.stroke();
    }
    return canvas;
  }

  // ---------------------------------------------------------------- per-frame

  /**
   * @param nav {car, route, pickup, dropoff, traffic} route is a list of {x, z}; pickup/dropoff are places or null
   */
  drawMaps(nav) {
    this.drawMinimap(nav);
    if (!$('bigmap').hidden) this.drawBigMap(nav);
  }

  drawMinimap({ car, route, pickup, dropoff, traffic }) {
    const ctx = this.mini, size = 440, c = size / 2, radius = c - 4;
    const turn = car.yaw + Math.PI;               // rotate the world so the car's heading points up
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(c, c, radius, 0, 7); ctx.clip();
    ctx.fillStyle = COLORS.sea; ctx.fillRect(0, 0, size, size);
    ctx.translate(c, c); ctx.rotate(turn);
    ctx.scale(MINIMAP_ZOOM / PX, MINIMAP_ZOOM / PX);
    const [mx, my] = toMap(car.x, car.z);
    ctx.translate(-mx, -my);
    ctx.drawImage(this.map, 0, 0);
    this.strokeRoute(ctx, route, pickup ? COLORS.pickup : COLORS.dropoff, 12);
    ctx.fillStyle = '#c3ccd6';
    for (const t of traffic) { ctx.beginPath(); ctx.arc(...toMap(t.x, t.z), 4, 0, 7); ctx.fill(); }
    ctx.restore();

    // blips keep their size and stay on the rim when their target is off the map
    const blip = (p, color, label) => {
      const rx = (p.x - car.x) * MINIMAP_ZOOM, rz = (p.z - car.z) * MINIMAP_ZOOM;
      let x = rx * Math.cos(turn) - rz * Math.sin(turn), y = rx * Math.sin(turn) + rz * Math.cos(turn);
      const d = Math.hypot(x, y), max = radius - 18;
      if (d > max) { x *= max / d; y *= max / d; }
      ctx.fillStyle = color; ctx.strokeStyle = '#0d1218'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(c + x, c + y, 15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0d1218'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, c + x, c + y + 1);
    };
    if (pickup) blip(pickup.stop, COLORS.pickup, 'P');
    if (dropoff) blip(dropoff.stop, COLORS.dropoff, 'D');
    blip({ x: car.x, z: car.z - 1e5 }, '#10161e', '');        // north marker on the rim
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', c + Math.sin(turn) * (radius - 18), c - Math.cos(turn) * (radius - 18) + 1);

    // the player: an arrow at the centre, always pointing up
    ctx.fillStyle = COLORS.route; ctx.strokeStyle = '#0d1218'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(c, c - 20); ctx.lineTo(c + 14, c + 15); ctx.lineTo(c, c + 7); ctx.lineTo(c - 14, c + 15); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  strokeRoute(ctx, route, color, width) {
    if (!route || route.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    route.forEach((p, k) => { const [x, y] = toMap(p.x, p.z); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }

  drawBigMap({ car, route, pickup, dropoff }) {
    const ctx = this.big, size = 1100, k = size / this.map.width;
    ctx.save();
    ctx.scale(k, k);
    ctx.drawImage(this.map, 0, 0);
    this.strokeRoute(ctx, route, pickup ? COLORS.pickup : COLORS.dropoff, 10);
    ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of PLACES) {
      const active = p === pickup || p === dropoff;
      const [x, y] = toMap(p.wait.x - p.normal[0] * 6, p.wait.z - p.normal[1] * 6);
      const w = ctx.measureText(p.name).width + 18;
      ctx.fillStyle = active ? (p === pickup ? COLORS.pickup : COLORS.dropoff) : 'rgba(13,18,24,0.85)';
      ctx.fillRect(x - w / 2, y - 42, w, 28);
      ctx.fillStyle = active ? '#0d1218' : '#e9edf2';
      ctx.fillText(p.name, x, y - 27);
    }
    const [x, y] = toMap(car.x, car.z);
    ctx.translate(x, y); ctx.rotate(-car.yaw + Math.PI);     // arrow drawn pointing up; heading 0 faces down the map
    ctx.fillStyle = COLORS.route; ctx.strokeStyle = '#0d1218'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(16, 18); ctx.lineTo(0, 8); ctx.lineTo(-16, 18); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** @param health the taxi's condition, 0..100 */
  setDash(car, health) {
    $('speed-value').textContent = Math.round(Math.abs(car.forwardSpeed) * 2.237);
    $('nitro').style.transform = `scaleX(${car.nitro})`;
    $('health').style.transform = `scaleX(${health / 100})`;
    $('health').style.background = health > 60 ? '' : health > 30 ? '#ffb224' : '#ff5b5b';
  }

  tick(dt) {
    if (this.toastLeft > 0 && (this.toastLeft -= dt) <= 0) $('toast').hidden = true;
  }

  // ---------------------------------------------------------------- panels

  setStats({ earned, ratings, rides }) {
    $('earned').textContent = (earned < 0 ? '−' : '') + fmtMoney(Math.abs(earned));
    $('rides').textContent = rides;
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    $('rating').textContent = avg === null ? '★ –' : `★ ${avg.toFixed(2)}`;
  }

  toast(text, seconds = 3) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    this.toastLeft = seconds;
  }

  showRequest(req) {
    avatar($('request-avatar'), req.rider);
    $('request-name').textContent = req.rider.name;
    $('request-sub').textContent = `★ ${req.rider.rating.toFixed(1)} · ${fmtDistance(req.toPickup)} away`;
    $('request-fare').textContent = fmtMoney(req.fare);
    $('request-pickup').textContent = req.pickup.name;
    $('request-dropoff').textContent = `${req.dropoff.name} · ${fmtDistance(req.tripLength)}`;
    $('request').hidden = false;
  }
  setRequestTimer(fraction) { $('request-timer').style.transform = `scaleX(${fraction})`; }
  hideRequest() { $('request').hidden = true; }

  /** The banner at the top: where to go next, how far, and an arrow relative to the car's heading. */
  setObjective(objective, car) {
    $('objective').hidden = !objective;
    if (!objective) return;
    $('objective').classList.toggle('dropoff', objective.kind === 'dropoff');
    $('objective-title').textContent = objective.title;
    $('objective-arrow').hidden = !objective.target;
    if (!objective.target) { $('objective-detail').textContent = objective.detail || ''; return; }
    const dx = objective.target.x - car.x, dz = objective.target.z - car.z;
    $('objective-detail').textContent = fmtDistance(Math.hypot(dx, dz));
    const ahead = dx * car.fx + dz * car.fz, right = -dx * car.fz + dz * car.fx;
    $('objective-arrow').style.transform = `rotate(${Math.atan2(right, ahead) * 180 / Math.PI - 90}deg)`;
  }

  showTrip(visible) { $('trip').hidden = !visible; }
  setTrip({ comfort, seconds, par }) {
    $('comfort').style.transform = `scaleX(${comfort})`;
    $('comfort').style.background = comfort > 0.6 ? '' : comfort > 0.3 ? '#ffb224' : '#ff5b5b';
    $('trip-time').textContent = fmtTime(seconds);
    $('trip-par').textContent = par ? `target ${fmtTime(par)}` : 'to pickup';
  }
  setCancel(fraction) {
    $('cancel-wrap').hidden = fraction <= 0;
    $('cancel-timer').style.transform = `scaleX(${fraction})`;
  }

  showChat(rider, text) {
    avatar($('chat-avatar'), rider);
    $('chat-text').textContent = text;
    $('chat').hidden = false;
  }
  setReplies(replies) {
    $('chat-replies').innerHTML = '';
    replies.forEach((text, k) => {
      const row = document.createElement('div');
      const key = document.createElement('kbd');
      key.textContent = k + 1;
      row.append(key, ` ${text}`);
      $('chat-replies').append(row);
    });
    $('chat-timer-wrap').hidden = !replies.length;
  }
  setReplyTimer(fraction) { $('chat-timer').style.transform = `scaleX(${fraction})`; }
  hideChat() { $('chat').hidden = true; }

  showRating({ rider, result, fare, tip, repair, quote, summary, cancelled }) {
    avatar($('rating-avatar'), rider);
    $('rating-title').textContent = cancelled ? `${rider.name} was not happy` : `${rider.name} rated you ${result.overall.toFixed(1)}`;
    $('rating-stars').innerHTML = stars(result.overall);
    $('rating-quote').textContent = `“${quote}”`;
    $('rating-speed').innerHTML = stars(result.speed);
    $('rating-safety').innerHTML = stars(result.safety);
    $('rating-rules').innerHTML = stars(result.rules);
    $('rating-chat').innerHTML = stars(result.chat);
    $('rating-summary').textContent = summary || '';
    const repairs = repair ? ` − ${fmtMoney(repair)} repairs` : '';
    $('rating-fare').textContent = cancelled ? 'No fare' : `Fare ${fmtMoney(fare)}${tip ? ` + ${fmtMoney(tip)} tip` : ''}${repairs}`;
    $('rating-card').hidden = false;
  }
  hideRating() { $('rating-card').hidden = true; }

  toggle(id) { $(id).hidden = !$(id).hidden; return !$(id).hidden; }
}
