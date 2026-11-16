import { GestureRecognizer, type MatchState, type MotionSample, type PlayerInput, type Side } from '@mobitenis/sim';
import { paddleOverrides } from '../scene/overrides.ts';
import type { InputSource } from './source.ts';

/** A phone controlling one player: raw samples in, PlayerInput out. */
export class PhoneInput implements InputSource {
  readonly kind = 'phone' as const;
  readonly side: Side;
  recognizer = new GestureRecognizer();
  swings = 0;
  private serveQueued = false;
  private latest: MotionSample | null = null;
  /** Whether this input is currently driving the match (controls the render override). */
  active = false;

  constructor(side: Side) {
    this.side = side;
  }

  push(sample: MotionSample): void {
    this.recognizer.push(sample);
    this.latest = sample;
    // Show the newest paddle pose right away, before the next sim step.
    if (this.active) paddleOverrides[this.side] = this.recognizer.output();
  }

  calibrate(): void {
    this.recognizer.calibrate(this.latest);
  }

  queueServe(): void {
    this.serveQueued = true;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) paddleOverrides[this.side] = null;
  }

  next(_state: MatchState): PlayerInput {
    const out = this.recognizer.output();
    const swing = this.recognizer.takeSwing();
    if (swing) this.swings++;
    const serve = this.serveQueued;
    this.serveQueued = false;
    return { lateral: out.lateral, pitch: out.pitch, serve, swing };
  }
}
