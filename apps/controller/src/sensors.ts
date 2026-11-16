import type { SensorSample, Vec3Tuple } from '@mobitenis/protocol';

export type RawSample = Omit<SensorSample, 'seq'>;

const vec = (o: { x: number | null; y: number | null; z: number | null } | null | undefined): Vec3Tuple | null =>
  o && o.x !== null && o.y !== null && o.z !== null ? [o.x, o.y, o.z] : null;

/**
 * Reads devicemotion and deviceorientation and emits one raw sample per
 * motion event, with the latest orientation attached.
 */
export class Sensors {
  private orient: Vec3Tuple | null = null;
  private running = false;
  onSample: ((s: RawSample) => void) | null = null;

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    this.orient = e.alpha === null || e.beta === null || e.gamma === null ? null : [e.alpha, e.beta, e.gamma];
  };

  private readonly onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate;
    this.onSample?.({
      t: performance.now(),
      accel: vec(e.acceleration),
      accelG: vec(e.accelerationIncludingGravity),
      rot: r && r.alpha !== null && r.beta !== null && r.gamma !== null ? [r.alpha, r.beta, r.gamma] : null,
      orient: this.orient,
    });
  };

  get active(): boolean {
    return this.running;
  }

  /** Must be called from a user gesture (button tap). */
  async start(): Promise<'ok' | 'denied' | 'unsupported'> {
    if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
    const withPermission = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof withPermission.requestPermission === 'function') {
      try {
        if ((await withPermission.requestPermission()) !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('deviceorientation', this.onOrientation);
    this.running = true;
    return 'ok';
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.onMotion);
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.running = false;
  }
}

/** Rolling sample-rate and per-axis range measurement for the diagnostics. */
export class SensorStats {
  rate = 0;
  ranges: Record<string, [number, number]> = {};
  missing: string[] = [];
  private count = 0;
  private windowStart = performance.now();
  private acc: Record<string, [number, number]> = {};
  private miss = new Set<string>();

  add(s: RawSample): void {
    this.count++;
    for (const k of ['accel', 'accelG', 'rot', 'orient'] as const) {
      const v = s[k];
      if (!v) {
        this.miss.add(k);
        continue;
      }
      v.forEach((x, i) => {
        const name = `${k}.${'xyz'[i]}`;
        const r = (this.acc[name] ??= [Infinity, -Infinity]);
        r[0] = Math.min(r[0], x);
        r[1] = Math.max(r[1], x);
      });
    }
    this.roll();
  }

  /** Closes the current one-second window if it is over. */
  roll(): void {
    const now = performance.now();
    if (now - this.windowStart < 1000) return;
    this.rate = (this.count * 1000) / (now - this.windowStart);
    this.ranges = this.acc;
    this.missing = [...this.miss];
    this.count = 0;
    this.acc = {};
    this.miss = new Set();
    this.windowStart = now;
  }
}
