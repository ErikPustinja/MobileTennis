/**
 * Estimates the offset between phone time and game time from ping/pong
 * round trips. Uses the sample with the smallest round-trip time among the
 * recent ones, which has the least queuing error.
 */
export class ClockSync {
  private samples: Array<{ rtt: number; offset: number }> = [];
  private readonly keep: number;

  constructor(keep = 10) {
    this.keep = keep;
  }

  /** `sentAt` and `receivedAt` are game times; `phoneTime` is the phone's clock at reply. */
  add(sentAt: number, receivedAt: number, phoneTime: number): number {
    const rtt = receivedAt - sentAt;
    const offset = phoneTime - (sentAt + rtt / 2);
    this.samples.push({ rtt, offset });
    if (this.samples.length > this.keep) this.samples.shift();
    return rtt;
  }

  /** phone time − game time, or null before the first round trip. */
  get offset(): number | null {
    if (this.samples.length === 0) return null;
    let best = this.samples[0]!;
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    return best.offset;
  }

  get lastRtt(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1]!.rtt : null;
  }

  reset(): void {
    this.samples = [];
  }
}

/** Why a sample was not used. */
export type DropReason = 'stale' | 'order';

/**
 * Drops samples older than `maxAgeMs` (once the clock offset is known) and
 * samples whose sequence number is not newer than the last accepted one.
 */
export class SampleGate {
  private lastSeq = -1;
  readonly maxAgeMs: number;

  constructor(maxAgeMs = 100) {
    this.maxAgeMs = maxAgeMs;
  }

  check(seq: number, phoneTime: number, now: number, offset: number | null): DropReason | null {
    if (seq <= this.lastSeq) return 'order';
    if (offset !== null && now - (phoneTime - offset) > this.maxAgeMs) {
      this.lastSeq = seq;
      return 'stale';
    }
    this.lastSeq = seq;
    return null;
  }

  /** Called when a phone reconnects: its sequence numbers start again. */
  reset(): void {
    this.lastSeq = -1;
  }
}
