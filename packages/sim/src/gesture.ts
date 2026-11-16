import { GESTURE } from './config.ts';
import type { SwingIntent } from './types.ts';
import { clamp } from './vec.ts';

type V3 = [number, number, number];

/**
 * Raw phone reading as received from the controller (same shape as the
 * protocol's SensorSample, repeated here so the sim has no dependencies).
 */
export interface MotionSample {
  seq: number;
  /** Phone time in ms. */
  t: number;
  /** Acceleration without gravity, device axes (m/s²). */
  accel: V3 | null;
  /** Acceleration including gravity, device axes (m/s²). */
  accelG: V3 | null;
  /** rotationRate [alpha (about z), beta (about x), gamma (about y)] in deg/s. */
  rot: V3 | null;
  /** deviceorientation [alpha, beta, gamma] in degrees. */
  orient: V3 | null;
}

export interface GestureOutput {
  /** Paddle sideways offset, -1 … 1, player perspective. */
  lateral: number;
  /** Racket face tilt in radians, positive = open. */
  pitch: number;
}

/** What the recogniser is doing right now (diagnostics and tests). */
export type GestureState = 'idle' | 'shift' | 'swing';

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The player's axes expressed in device coordinates, fixed at calibration. */
interface Frame {
  right: V3;
  up: V3;
  forward: V3;
}

/** Default: phone upright like a racket handle, screen facing the player. */
const DEFAULT_FRAME: Frame = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };

/**
 * Builds the player's frame from the gravity direction at calibration. "Up"
 * is opposite to gravity; "forward" is the direction out of the back of the
 * phone, flattened to horizontal (the screen faces the player). If the phone
 * lies flat, the top edge points forward instead.
 */
export function frameFromGravity(g: V3): Frame {
  const up = norm(g); // accelerationIncludingGravity at rest points up
  let fwd: V3 = [0, 0, -1];
  let f = dot(fwd, up);
  let flat: V3 = [fwd[0] - f * up[0], fwd[1] - f * up[1], fwd[2] - f * up[2]];
  if (Math.hypot(...flat) < 0.3) {
    fwd = [0, 1, 0];
    f = dot(fwd, up);
    flat = [fwd[0] - f * up[0], fwd[1] - f * up[1], fwd[2] - f * up[2]];
  }
  const forward = norm(flat);
  return { right: cross(forward, up), up, forward };
}

interface Shift {
  dir: 1 | -1;
  v: number;
  p: number;
  progress: number;
  from: number;
  start: number;
  quietSince: number | null;
}

interface PendingSwing {
  start: number;
  peakForward: number;
  peakAt: number;
  sideAtPeak: number;
  yawSum: number;
  count: number;
}

/**
 * Turns raw phone samples into paddle input:
 *  - **Shift**: a whole-arm sideways move at a constant angle moves the
 *    paddle sideways. Acceleration and the braking at the end are one
 *    gesture, and the paddle only ever moves in the gesture's direction, so
 *    it does not jump back when the arm stops.
 *  - **Wrist turn**: rotation without sideways acceleration does not shift;
 *    fast rotation cancels a shift in progress.
 *  - **Swing**: strong *forward* acceleration. Sideways moves cannot start a
 *    swing however fast they are, so positioning never fires a shot. The
 *    swing is reported at its acceleration peak (at most 50 ms after it
 *    starts) with strength from the peak, forehand/backhand from the yaw
 *    direction and aim from the sideways part of the swing.
 */
export class GestureRecognizer {
  private frame: Frame = DEFAULT_FRAME;
  private lateral = 0;
  private pitch = 0;
  private neutralBeta: number | null = null;
  private lastT: number | null = null;
  private lastSwingT = -Infinity;
  private shift: Shift | null = null;
  private pending: PendingSwing | null = null;
  private readonly swings: SwingIntent[] = [];
  state: GestureState = 'idle';

  push(s: MotionSample): void {
    const dt = this.lastT === null ? 0 : clamp((s.t - this.lastT) / 1000, 0, 0.1);
    this.lastT = s.t;

    if (s.orient) {
      if (this.neutralBeta === null) this.neutralBeta = s.orient[1];
      const tilt = ((s.orient[1] - this.neutralBeta) * Math.PI) / 180;
      this.pitch = clamp(tilt * GESTURE.pitchGain, -GESTURE.maxPitch, GESTURE.maxPitch);
    }
    if (!s.accel) return;

    const a = s.accel;
    const aRight = dot(a, this.frame.right);
    const aForward = dot(a, this.frame.forward);
    // rotationRate is [about z, about x, about y]; as a device-frame vector that is [beta, gamma, alpha].
    const w: V3 = s.rot ? [s.rot[1], s.rot[2], s.rot[0]] : [0, 0, 0];
    const yaw = dot(w, this.frame.up);
    const rotMag = Math.hypot(w[0], w[1], w[2]);

    if (this.trackSwing(s.t, aForward, aRight, yaw)) return;
    if (s.t - this.lastSwingT < GESTURE.swingRefractory) return;
    this.trackShift(s.t, aRight, rotMag, dt);
  }

  /** Returns true while a swing is being measured (shifting is suspended). */
  private trackSwing(t: number, aForward: number, aRight: number, yaw: number): boolean {
    const p = this.pending;
    if (!p) {
      if (aForward > GESTURE.swingStart && t - this.lastSwingT > GESTURE.swingRefractory) {
        this.pending = { start: t, peakForward: aForward, peakAt: t, sideAtPeak: aRight, yawSum: yaw, count: 1 };
        this.shift = null;
        this.state = 'swing';
        return true;
      }
      return false;
    }
    p.yawSum += yaw;
    p.count++;
    if (aForward > p.peakForward) {
      p.peakForward = aForward;
      p.peakAt = t;
      p.sideAtPeak = aRight;
    }
    const pastPeak = aForward < p.peakForward * 0.85;
    if (pastPeak || t - p.start >= GESTURE.swingPeakWait) this.emitSwing(t);
    return true;
  }

  private emitSwing(t: number): void {
    const p = this.pending!;
    this.pending = null;
    this.lastSwingT = t;
    this.state = 'idle';
    const strength = clamp(
      (p.peakForward - GESTURE.swingMinAccel) / (GESTURE.swingMaxAccel - GESTURE.swingMinAccel),
      0,
      1,
    );
    // Forehand (right-handed) sweeps leftwards with positive yaw about "up".
    const ratio = p.sideAtPeak / p.peakForward;
    const yawMean = p.yawSum / p.count;
    const forehand = Math.abs(yawMean) > GESTURE.strokeYawRate ? yawMean > 0 : ratio < 0;
    const base = forehand ? -GESTURE.swingSweepRatio : GESTURE.swingSweepRatio;
    const direction = clamp((ratio - base) / GESTURE.swingAimRange, -1, 1);
    this.swings.push({ strength, direction, stroke: forehand ? 'forehand' : 'backhand' });
  }

  private trackShift(t: number, aRight: number, rotMag: number, dt: number): void {
    const m = this.shift;
    if (!m) {
      if (Math.abs(aRight) > GESTURE.shiftStart && rotMag < GESTURE.shiftMaxRotation) {
        this.shift = { dir: aRight > 0 ? 1 : -1, v: 0, p: 0, progress: 0, from: this.lateral, start: t, quietSince: null };
        this.state = 'shift';
      }
      return;
    }
    if (rotMag > GESTURE.shiftAbortRotation) {
      // A wrist turn, not an arm move: undo and stop.
      this.lateral = m.from;
      this.shift = null;
      this.state = 'idle';
      return;
    }
    m.v += aRight * dt;
    m.p += m.v * dt;
    // Only move in the gesture's direction, so braking cannot pull the paddle back.
    m.progress = Math.max(m.progress, m.dir * m.p);
    this.lateral = clamp(m.from + (m.dir * m.progress) / GESTURE.shiftMetresPerUnit, -1, 1);
    if (Math.abs(aRight) < GESTURE.shiftQuiet) m.quietSince ??= t;
    else m.quietSince = null;
    if ((m.quietSince !== null && t - m.quietSince > GESTURE.shiftQuietTime) || t - m.start > GESTURE.shiftMaxTime) {
      this.shift = null;
      this.state = 'idle';
    }
  }

  /**
   * Stores the neutral pose: the current gravity direction defines the
   * player's axes (so any way of holding the phone works) and the current
   * tilt becomes a flat racket face. The paddle returns to the centre.
   */
  calibrate(latest: MotionSample | null): void {
    this.lateral = 0;
    this.shift = null;
    this.pending = null;
    this.state = 'idle';
    if (!latest) return;
    const g = gravityOf(latest);
    if (g) this.frame = frameFromGravity(g);
    if (latest.orient) this.neutralBeta = latest.orient[1];
  }

  output(): GestureOutput {
    return { lateral: this.lateral, pitch: this.pitch };
  }

  /** Swing intents detected since the last call, oldest first. */
  takeSwing(): SwingIntent | null {
    return this.swings.shift() ?? null;
  }
}

function gravityOf(s: MotionSample): V3 | null {
  if (!s.accelG) return null;
  if (!s.accel) return s.accelG;
  return [s.accelG[0] - s.accel[0], s.accelG[1] - s.accel[1], s.accelG[2] - s.accel[2]];
}
