import {
  DT,
  awardPoint,
  createMatch,
  resetMatch,
  setPaused,
  stepMatch,
  type MatchConfig,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
  type Side,
} from '@mobitenis/sim';
import type { InputSource } from '../input/source.ts';

export type PauseReason = 'hidden' | 'manual' | 'disconnect-0' | 'disconnect-1';

/** Longest real time a single frame may advance the simulation (s). */
const MAX_FRAME = 0.25;

/**
 * Owns one match and drives it at a fixed 120 Hz from real elapsed time,
 * independent of the frame rate. Rendering reads `match` directly.
 */
export class GameSession {
  readonly match: MatchState;
  sources: [InputSource, InputSource];
  private acc = 0;
  private readonly pauses = new Set<PauseReason>();
  private readonly listeners = new Set<(events: MatchEvent[], s: GameSession) => void>();
  /** Last inputs fed to the sim, for the renderer and diagnostics. */
  readonly lastInputs: [PlayerInput, PlayerInput];

  constructor(sources: [InputSource, InputSource], seed = Date.now() >>> 0, config: Partial<MatchConfig> = {}) {
    this.sources = sources;
    this.match = createMatch({ seed, config });
    const a = sources[0].next(this.match);
    const b = sources[1].next(this.match);
    this.lastInputs = [a, b];
  }

  get paused(): boolean {
    return this.pauses.size > 0;
  }

  pauseReasons(): PauseReason[] {
    return [...this.pauses];
  }

  setPause(reason: PauseReason, on: boolean): void {
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    setPaused(this.match, this.paused);
    this.acc = 0;
    this.emit([]);
  }

  onChange(fn: (events: MatchEvent[], s: GameSession) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Advances by real elapsed seconds; runs as many fixed steps as fit. */
  advance(dt: number): void {
    if (this.paused) return;
    this.acc += Math.min(Math.max(dt, 0), MAX_FRAME);
    const events: MatchEvent[] = [];
    while (this.acc >= DT) {
      this.acc -= DT;
      this.step(events);
    }
    if (events.length > 0) this.emit(events);
  }

  /** Runs exactly one step (used by advance and by tests). */
  step(collect?: MatchEvent[]): void {
    const m = this.match;
    const a = this.sources[0].next(m);
    const b = this.sources[1].next(m);
    this.lastInputs[0] = a;
    this.lastInputs[1] = b;
    stepMatch(m, [a, b]);
    if (collect) collect.push(...m.events);
    else if (m.events.length > 0) this.emit(m.events);
  }

  /** Test hook: awards a point directly, as if a rally had ended. */
  debugAwardPoint(side: Side): void {
    const m = this.match;
    const events: MatchEvent[] = [{ type: 'point', winner: side, reason: 'not-returned' }];
    awardPoint(m.score, side, m.config, events);
    if (m.score.winner !== null) m.rally.phase = 'matchOver';
    this.emit(events);
  }

  rematch(): void {
    resetMatch(this.match);
    this.emit([]);
  }

  setSource(side: Side, source: InputSource): void {
    this.sources[side] = source;
  }

  private emit(events: MatchEvent[]): void {
    for (const fn of this.listeners) fn(events, this);
  }
}
