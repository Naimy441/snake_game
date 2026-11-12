// Body cross-sections for the skins that are modelled, not just painted.
// A section maps the angle round the body (theta: 0 = the snake's right
// side, PI/2 = its back, -PI/2 = its belly) to a point [x, y] of the outline,
// in units of the body's radius (about 1 for a round snake). The skin's
// colour function gets the same theta, so it can paint each part of the shape.
// No three.js here: the skins (and the tests) use these too.

const TAU = Math.PI * 2;

// Where a ray from the middle at angle theta leaves an ellipse centred at
// (cx, cy) with half axes rx, ry (the middle must be inside it).
function rayEllipse(theta, cx, cy, rx, ry) {
  const dx = Math.cos(theta) / rx;
  const dy = Math.sin(theta) / ry;
  const ox = -cx / rx;
  const oy = -cy / ry;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - 1;
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
}

// A rounded rectangle-ish outline (superellipse): w and h are half sizes,
// n the squareness (2 is an ellipse).
function superellipse(theta, w, h, n) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), h * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

// Hot dog: a sausage sitting in a split bun, the bun wider and lower.
const BUN = [0, -0.22, 1.18, 0.62];
const SAUSAGE = [0, 0.24, 0.58, 0.58];
export function hotdogPart(theta) {
  return rayEllipse(theta, ...SAUSAGE) >= rayEllipse(theta, ...BUN) ? 'sausage' : 'bun';
}

export const SECTIONS = {
  hotdog: (t) => {
    const r = Math.max(rayEllipse(t, ...SAUSAGE), rayEllipse(t, ...BUN));
    return [r * Math.cos(t), r * Math.sin(t)];
  },
  // a steel tape: wide, thin and curved across, lying flat
  tape: (t) => {
    const [x, y] = superellipse(t, 1.35, 0.13, 6);
    return [x, y + 0.16 * (x / 1.35) * (x / 1.35)];
  },
  pickle: (t) => [1.06 * Math.cos(t), 0.96 * Math.sin(t)],
  // a rasher: a flat, wide strip (it ripples along its length, see wave)
  bacon: (t) => superellipse(t, 1.3, 0.2, 5),
  // a slightly squared-off, armoured body
  benny: (t) => superellipse(t, 1.02, 0.94, 3),
};

// Pickle warts: little bumps scattered over the skin (a radius multiplier).
export function pickleBump(d, t) {
  const u = d * 3;
  const v = (t / TAU) * 9;
  const fu = u - Math.floor(u) - 0.5;
  const fv = v - Math.floor(v) - 0.5;
  const h = Math.sin(Math.floor(u) * 127.1 + Math.floor(v) * 311.7) * 43758.5453;
  const on = h - Math.floor(h) > 0.55;
  const q = fu * fu + fv * fv;
  return 1 + (on ? 0.22 * Math.max(0, 1 - q / 0.12) : 0) + 0.04 * Math.sin(d * 2.1 + t * 3);
}
