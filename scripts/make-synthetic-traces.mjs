// Generates synthetic sensor traces until real recordings from a phone exist.
// Model: phone held upright like a racket handle, screen facing the player.
// Device axes (W3C): x = right edge of the screen, y = top of the phone,
// z = out of the screen toward the player. Forward toward the table = -z.
// rotationRate: alpha about z, beta about x, gamma about y (deg/s).
import { mkdirSync, writeFileSync } from 'node:fs';

const HZ = 60;
const G = 9.81;
let seed = 12345;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
const noise = (amp) => rand() * 2 * amp;

/** Smooth bump: integral 0 over [0, T], used for "accelerate then brake". */
const pulse = (t, T) => (t < 0 || t > T ? 0 : Math.sin((2 * Math.PI * t) / T));
/** Single positive hump over [0, T]. */
const hump = (t, T) => (t < 0 || t > T ? 0 : Math.sin((Math.PI * t) / T));

function trace(label, seconds, fn, notes) {
  const samples = [];
  let orientGamma = 0;
  for (let i = 0; i < seconds * HZ; i++) {
    const t = i / HZ;
    const m = fn(t);
    orientGamma += ((m.rot?.[2] ?? 0) / HZ) * 1;
    const accel = [m.ax + noise(0.08), m.ay + noise(0.08), m.az + noise(0.08)];
    samples.push({
      seq: i,
      t: 1000 + t * 1000,
      accel,
      accelG: [accel[0], accel[1] + G, accel[2]],
      rot: [(m.rot?.[0] ?? 0) + noise(0.6), (m.rot?.[1] ?? 0) + noise(0.6), (m.rot?.[2] ?? 0) + noise(0.6)],
      orient: [0, 88 + (m.beta ?? 0) + noise(0.2), orientGamma + noise(0.2)],
    });
  }
  return {
    format: 'mobitenis-trace',
    version: 1,
    label,
    recordedAt: '2026-11-17T00:00:00.000Z',
    device: 'synthetic',
    synthetic: true,
    notes,
    samples,
  };
}

const still = () => ({ ax: 0, ay: 0, az: 0 });
const START = 0.5;

/** Whole-arm sideways move of `d` metres in `T` seconds, angle unchanged. */
const lateral = (d, T) => (t) => ({ ax: ((2 * Math.PI * d) / (T * T)) * pulse(t - START, T), ay: 0, az: 0 });

/** Wrist twist about the long axis, no translation. */
const twist = (t) => {
  const T = 0.35;
  const w = 380 * pulse(t - START, T); // turn and turn back
  return { ax: noise(0.3), ay: noise(0.3), az: noise(0.3), rot: [0, 0, w] };
};

/** Forward swing; side = +1 forehand (sweeps leftwards), -1 backhand. */
const swing = (side, power) => (t) => {
  const T = 0.16;
  const h = hump(t - START, T);
  const brake = hump(t - START - T, 0.12);
  return {
    ax: -side * 0.35 * power * h + side * 0.2 * power * brake,
    ay: 0.1 * power * h,
    az: -power * h + 0.5 * power * brake,
    rot: [0, 0, side * 900 * (power / 50) * h],
  };
};

const traces = [
  trace('mirovanje', 2, still, 'Phone held still in the calibration pose.'),
  trace('bocni-lijevo', 1.5, lateral(-0.25, 0.4), 'Whole arm moves 25 cm to the left in 0.4 s, same angle.'),
  trace('bocni-desno', 1.5, lateral(0.25, 0.4), 'Whole arm moves 25 cm to the right in 0.4 s, same angle.'),
  trace('zakret-zapesca', 1.5, twist, 'Wrist twists about the long axis and back, no arm movement.'),
  trace('forehand-lagani', 1.5, swing(1, 18), 'Gentle forehand: peak forward acceleration 18 m/s².'),
  trace('forehand-jaki', 1.5, swing(1, 50), 'Strong forehand: peak forward acceleration 50 m/s².'),
  trace('backhand-lagani', 1.5, swing(-1, 18), 'Gentle backhand: peak forward acceleration 18 m/s².'),
  trace('backhand-jaki', 1.5, swing(-1, 50), 'Strong backhand: peak forward acceleration 50 m/s².'),
];

mkdirSync('fixtures/traces/synthetic', { recursive: true });
for (const tr of traces) {
  writeFileSync(`fixtures/traces/synthetic/${tr.label}.json`, `${JSON.stringify(tr)}\n`);
}
console.log(`Wrote ${traces.length} synthetic traces to fixtures/traces/synthetic/`);
