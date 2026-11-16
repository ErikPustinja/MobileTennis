import { BOT, PADDLE } from './config.ts';
import { lerp } from './vec.ts';
import { Rng } from './rng.ts';
import { idleInput, type MatchState, type PlayerInput, type Side } from './types.ts';

export interface BotOptions {
  timingJitter?: number;
  missChance?: number;
}

/**
 * Simple deterministic opponent. It produces the same PlayerInput a human
 * would, so it exercises exactly the same code paths as real play.
 */
export class Bot {
  private rng: Rng;
  private serveAt: number | null = null;
  private plannedFor: number | null = null;
  private swingAt = 0;
  private strength = 0.5;
  private direction = 0;
  private lateral = 0.6;
  private tossSwung = false;
  private readonly jitter: number;
  private readonly miss: number;

  readonly side: Side;

  constructor(side: Side, seed: number, opts: BotOptions = {}) {
    this.side = side;
    this.rng = new Rng(seed ^ (side === 0 ? 0x9e3779b9 : 0x85ebca6b));
    this.jitter = opts.timingJitter ?? BOT.timingJitter;
    this.miss = opts.missChance ?? BOT.missChance;
  }

  next(state: MatchState): PlayerInput {
    const input = idleInput();
    const r = state.rally;
    const now = state.time;
    const me = state.players[this.side];
    input.lateral = this.lateral;

    if (r.phase === 'serveReady' && r.server === this.side) {
      this.tossSwung = false;
      if (this.serveAt === null) this.serveAt = now + this.rng.range(BOT.serveDelayMin, BOT.serveDelayMax);
      if (now >= this.serveAt) {
        input.serve = true;
        this.serveAt = null;
      }
      return input;
    }

    if (r.phase === 'toss' && r.server === this.side) {
      if (!this.tossSwung && !me.swing && state.ball.vel.y < 0.4) {
        this.tossSwung = true;
        input.swing = { strength: this.rng.range(0.3, 0.7), direction: this.rng.range(-0.7, 0.7) };
      }
      return input;
    }

    const pred = state.prediction;
    if (r.phase === 'inPlay' && pred && pred.side === this.side) {
      if (this.plannedFor !== pred.time) {
        this.plannedFor = pred.time;
        this.strength = this.rng.range(BOT.minStrength, BOT.maxStrength);
        this.direction = this.rng.range(-0.8, 0.8);
        this.lateral = this.rng.next() < 0.5 ? 0.6 : -0.6;
        const tol = state.config.timingTolerance;
        let err = this.rng.normal() * this.jitter;
        if (this.rng.next() < this.miss) err = (this.rng.next() < 0.5 ? -1 : 1) * (tol + this.rng.range(0.05, 0.15));
        const speed = lerp(PADDLE.swingMinSpeed, PADDLE.swingMaxSpeed, this.strength);
        // Natural contact = swing start + backswing / speed; aim it at pred.time - err.
        this.swingAt = pred.time - err - PADDLE.backswing / speed;
      }
      input.lateral = this.lateral;
      if (!me.swing && now >= this.swingAt && now < pred.time + 0.3) {
        input.swing = { strength: this.strength, direction: this.direction };
        this.swingAt = Infinity;
      }
    }
    return input;
  }
}
