// How a rider turns one trip into stars and a fare. Pure functions: tested in Node.
//
// Four things are rated, each from 1 to 5 stars:
//   speed    trip time against what the rider expected
//   safety   crashes, pedestrians hit or frightened, things knocked over, skidding
//   rules    red lights run, time on the wrong side of the road or on the pavement
//   chat     how the driver replied in conversation

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PAR_SPEED = 9.5;   // m/s a rider expects you to average, lights included
export const PAR_SLACK = 8;     // seconds of grace for pulling away and stopping

/** Seconds a rider expects the trip to take for a route of `metres`. */
export const parTime = metres => metres / PAR_SPEED + PAR_SLACK;

/** 5 stars at 80% of par or faster, 4 at par, down to 1 at 2.2x par. */
export function speedStars(seconds, par) {
  const r = seconds / par;
  if (r <= 0.8) return 5;
  if (r <= 1) return 5 - (r - 0.8) / 0.2;            // 5 -> 4
  return clamp(4 - (r - 1) / 1.2 * 3, 1, 4);          // 4 -> 1
}

// Stars lost per incident. Crashes are scored by how hard they were (see impactSeverity in car.js).
export const SAFETY_COST = {
  pedestrianHit: 3,
  pedestrianScare: 0.6,
  skidSecond: 0.08,
  curb: 0.12,
};
export const RULES_COST = {
  redLight: 1.2,
  wrongSideSecond: 0.2,
  sidewalkSecond: 0.25,
};
// Dollars taken off the driver's earnings on the spot, with or without a rider on board.
export const FINES = { redLight: 5, pedestrianHit: 40, tow: 25 };
/** Dollars to repair a car with `health` out of 100. */
export const repairCost = health => Math.round((100 - clamp(health, 0, 100)) * 0.12 * 100) / 100;

export const safetyStars = damage => clamp(5 - damage, 1, 5);
export const rulesStars = penalty => clamp(5 - penalty, 1, 5);

/** Average of the per-reply scores (1..5). A silent trip is a neutral 3. */
export const chatStars = scores =>
  scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length, 1, 5) : 3;

export const WEIGHTS = { speed: 0.25, safety: 0.3, rules: 0.2, chat: 0.25 };

/**
 * @param damage      safety stars lost: crash severities plus SAFETY_COST items
 * @param rulePenalty rules stars lost: RULES_COST items
 */
export function rateTrip({ seconds, par, damage, rulePenalty = 0, chatScores }) {
  const speed = speedStars(seconds, par);
  const safety = safetyStars(damage);
  const rules = rulesStars(rulePenalty);
  const chat = chatStars(chatScores);
  const overall = speed * WEIGHTS.speed + safety * WEIGHTS.safety + rules * WEIGHTS.rules + chat * WEIGHTS.chat;
  return { speed, safety, rules, chat, overall: Math.round(overall * 10) / 10 };
}

/** Fare in dollars, plus a tip that grows with the rating from 4 stars up. */
export function fareFor(metres, overall) {
  const fare = 3 + metres * 0.012;
  const tip = overall >= 4 ? fare * (overall - 3.5) * 0.3 : 0;
  return { fare: Math.round(fare * 100) / 100, tip: Math.round(tip * 100) / 100 };
}
