// How a rider turns one trip into stars and a fare. Pure functions: tested in Node.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PAR_SPEED = 14;    // m/s a rider expects you to average
export const PAR_SLACK = 6;     // seconds of grace for pulling away and stopping

/** Seconds a rider expects the trip to take for a route of `metres`. */
export const parTime = metres => metres / PAR_SPEED + PAR_SLACK;

/** 5 stars at 80% of par or faster, 4 at par, down to 1 at 2.2x par. */
export function speedStars(seconds, par) {
  const r = seconds / par;
  if (r <= 0.8) return 5;
  if (r <= 1) return 5 - (r - 0.8) / 0.2;            // 5 -> 4
  return clamp(4 - (r - 1) / 1.2 * 3, 1, 4);          // 4 -> 1
}

/** `damage` is the sum of impact severities this trip (a light bump is about 0.5, a hard crash 1.5). */
export const safetyStars = damage => clamp(5 - damage, 1, 5);

/** Average of the per-reply scores (1..5). A silent trip is a neutral 3. */
export const chatStars = scores =>
  scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length, 1, 5) : 3;

export const WEIGHTS = { speed: 0.3, safety: 0.4, chat: 0.3 };

export function rateTrip({ seconds, par, damage, chatScores }) {
  const speed = speedStars(seconds, par);
  const safety = safetyStars(damage);
  const chat = chatStars(chatScores);
  const overall = speed * WEIGHTS.speed + safety * WEIGHTS.safety + chat * WEIGHTS.chat;
  return { speed, safety, chat, overall: Math.round(overall * 10) / 10 };
}

/** Fare in dollars, plus a tip that grows with the rating from 4 stars up. */
export function fareFor(metres, overall) {
  const fare = 3 + metres * 0.012;
  const tip = overall >= 4 ? fare * (overall - 3.5) * 0.3 : 0;
  return { fare: Math.round(fare * 100) / 100, tip: Math.round(tip * 100) / 100 };
}
