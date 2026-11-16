import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type MotionSample } from './gesture.ts';
import type { SwingIntent } from './types.ts';
import idle from '../../../fixtures/traces/synthetic/mirovanje.json';
import shiftLeft from '../../../fixtures/traces/synthetic/bocni-lijevo.json';
import shiftRight from '../../../fixtures/traces/synthetic/bocni-desno.json';
import twist from '../../../fixtures/traces/synthetic/zakret-zapesca.json';
import fhLight from '../../../fixtures/traces/synthetic/forehand-lagani.json';
import fhStrong from '../../../fixtures/traces/synthetic/forehand-jaki.json';
import bhLight from '../../../fixtures/traces/synthetic/backhand-lagani.json';
import bhStrong from '../../../fixtures/traces/synthetic/backhand-jaki.json';

// When real recordings land in fixtures/traces/ (issue "Snimi senzore"),
// import them here next to the synthetic ones with the same expectations.

interface Trace {
  label: string;
  samples: MotionSample[];
}

interface Run {
  lateral: number[];
  swings: SwingIntent[];
}

/** Calibrates on the first sample (phone held still) and plays the rest. */
function play(trace: Trace, transform: (s: MotionSample) => MotionSample = (s) => s): Run {
  const g = new GestureRecognizer();
  const samples = trace.samples.map(transform);
  g.push(samples[0]!);
  g.calibrate(samples[0]!);
  const run: Run = { lateral: [], swings: [] };
  for (const s of samples.slice(1)) {
    g.push(s);
    run.lateral.push(g.output().lateral);
    let sw: SwingIntent | null;
    while ((sw = g.takeSwing())) run.swings.push(sw);
  }
  return run;
}

/** Largest move against `dir` after the paddle has started moving (a rebound). */
function rebound(lateral: number[], dir: 1 | -1): number {
  let best = 0;
  let worst = 0;
  for (const l of lateral) {
    best = Math.max(best, dir * l);
    worst = Math.max(worst, best - dir * l);
  }
  return worst;
}

const T = (x: unknown) => x as Trace;

describe('paddle shift (bočni pomak)', () => {
  it('moves right for a rightward arm move at the same angle, without a rebound', () => {
    const r = play(T(shiftRight));
    expect(r.lateral.at(-1)!).toBeGreaterThan(0.5);
    expect(rebound(r.lateral, 1)).toBeLessThan(0.01);
    expect(r.swings).toEqual([]);
  });

  it('moves left for a leftward arm move, without a rebound', () => {
    const r = play(T(shiftLeft));
    expect(r.lateral.at(-1)!).toBeLessThan(-0.5);
    expect(rebound(r.lateral, -1)).toBeLessThan(0.01);
    expect(r.swings).toEqual([]);
  });

  it('starts moving within 100 ms of the arm starting to move', () => {
    const r = play(T(shiftRight));
    const startIdx = T(shiftRight).samples.findIndex((s) => s.t - 1000 >= 500); // motion starts at 0.5 s
    const firstMove = r.lateral.findIndex((l) => l > 0.02);
    expect(firstMove).toBeGreaterThan(0);
    expect(((firstMove + 1 - startIdx) * 1000) / 60).toBeLessThan(100);
  });

  it('a wrist twist does not move the paddle sideways', () => {
    const r = play(T(twist));
    expect(Math.max(...r.lateral.map(Math.abs))).toBeLessThan(0.05);
    expect(r.swings).toEqual([]);
  });

  it('holding still does nothing', () => {
    const r = play(T(idle));
    expect(Math.max(...r.lateral.map(Math.abs))).toBeLessThan(0.02);
    expect(r.swings).toEqual([]);
  });
});

describe('swings', () => {
  it.each([
    ['forehand-lagani', fhLight, 'forehand'],
    ['forehand-jaki', fhStrong, 'forehand'],
    ['backhand-lagani', bhLight, 'backhand'],
    ['backhand-jaki', bhStrong, 'backhand'],
  ] as const)('%s is one %s swing', (_label, trace, stroke) => {
    const r = play(T(trace));
    expect(r.swings).toHaveLength(1);
    expect(r.swings[0]!.stroke).toBe(stroke);
    expect(Math.abs(r.swings[0]!.direction)).toBeLessThan(0.3); // straight swing, straight aim
  });

  it('a strong swing is stronger than a light one', () => {
    const light = play(T(fhLight)).swings[0]!.strength;
    const strong = play(T(fhStrong)).swings[0]!.strength;
    expect(light).toBeLessThan(0.4);
    expect(strong).toBeGreaterThan(0.8);
  });

  it('positioning never fires a shot, even a fast shift', () => {
    const fast = T(shiftRight);
    const scaled = (s: MotionSample): MotionSample => ({
      ...s,
      accel: s.accel ? [s.accel[0] * 3, s.accel[1], s.accel[2]] : null,
    });
    expect(play(fast, scaled).swings).toEqual([]);
  });
});

describe('calibration adapts to how the phone is held', () => {
  // Phone turned 90° (landscape): device x now points up, device -y is the player's right.
  const landscape = (s: MotionSample): MotionSample => {
    const r = (v: [number, number, number] | null): [number, number, number] | null => (v ? [v[1], -v[0], v[2]] : null);
    const w = s.rot ? r([s.rot[1], s.rot[2], s.rot[0]]) : null; // as a device-frame vector
    return { ...s, accel: r(s.accel), accelG: r(s.accelG), rot: w ? [w[2], w[0], w[1]] : null };
  };

  it('a shift to the right still moves the paddle right', () => {
    expect(play(T(shiftRight), landscape).lateral.at(-1)!).toBeGreaterThan(0.5);
  });

  it('a forehand is still a forehand', () => {
    const r = play(T(fhStrong), landscape);
    expect(r.swings).toHaveLength(1);
    expect(r.swings[0]!.stroke).toBe('forehand');
  });
});
