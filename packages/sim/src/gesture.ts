import { clamp } from './vec.ts';
import type { SwingIntent } from './types.ts';

/**
 * Raw phone reading as received from the controller (same shape as the
 * protocol's SensorSample, repeated here so the sim has no dependencies).
 */
export interface MotionSample {
  seq: number;
  /** Phone time in ms. */
  t: number;
  accel: [number, number, number] | null;
  accelG: [number, number, number] | null;
  rot: [number, number, number] | null;
  orient: [number, number, number] | null;
}

/** What the recogniser currently says about one player's paddle. */
export interface GestureOutput {
  /** -1 … 1 from the player's perspective. */
  lateral: number;
  /** Face tilt in radians, positive = open. */
  pitch: number;
}

/**
 * Turns raw phone samples into paddle input. This first version is simple
 * (threshold swing, integrated sideways motion); phase 5 replaces the
 * internals with the full gesture model while keeping this interface.
 */
export class GestureRecognizer {
  private lateral = 0;
  private lastT: number | null = null;
  private neutralBeta = 0;
  private pitch = 0;
  private lastSwingT = -Infinity;
  private readonly swings: SwingIntent[] = [];
  /** Sideways move in progress: accelerate + brake are handled as one gesture. */
  private move: { dir: 1 | -1; v: number; p: number; progress: number; from: number; quietSince: number | null; start: number } | null = null;

  push(s: MotionSample): void {
    const dt = this.lastT === null ? 0 : clamp((s.t - this.lastT) / 1000, 0, 0.1);
    this.lastT = s.t;
    if (s.orient) this.pitch = clamp(((s.orient[1] - this.neutralBeta) * Math.PI) / 180, -0.6, 0.6);
    if (!s.accel) return;
    const [ax, ay, az] = s.accel;
    const mag = Math.hypot(ax, ay, az);
    if (mag > 15 && s.t - this.lastSwingT > 350) {
      this.lastSwingT = s.t;
      this.move = null;
      this.swings.push({ strength: clamp((mag - 10) / 40, 0, 1), direction: clamp(-ax / 30, -1, 1) });
      return;
    }
    if (s.t - this.lastSwingT < 350) return;
    this.trackSideways(s.t, ax, dt);
  }

  private trackSideways(t: number, ax: number, dt: number): void {
    const m = this.move;
    if (!m) {
      if (Math.abs(ax) > 1.5) this.move = { dir: ax > 0 ? 1 : -1, v: 0, p: 0, progress: 0, from: this.lateral, quietSince: null, start: t };
      return;
    }
    m.v += ax * dt;
    m.p += m.v * dt;
    // Only ever move in the gesture's direction, so braking cannot pull the paddle back.
    m.progress = Math.max(m.progress, m.dir * m.p);
    this.lateral = clamp(m.from + (m.dir * m.progress) / 0.25, -1, 1);
    if (Math.abs(ax) < 0.6) m.quietSince ??= t;
    else m.quietSince = null;
    if ((m.quietSince !== null && t - m.quietSince > 100) || t - m.start > 1000) this.move = null;
  }

  calibrate(latest: MotionSample | null): void {
    this.lateral = 0;
    this.move = null;
    if (latest?.orient) this.neutralBeta = latest.orient[1];
  }

  output(): GestureOutput {
    return { lateral: this.lateral, pitch: this.pitch };
  }

  /** Swing intents detected since the last call. */
  takeSwing(): SwingIntent | null {
    return this.swings.shift() ?? null;
  }
}
