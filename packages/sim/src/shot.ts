import { firstContact, stepBall, type FlightResult } from './ball.ts';
import { DT, SERVE, SHOT, TABLE } from './config.ts';
import { forward, rightSign } from './geometry.ts';
import type { BallState, Side } from './types.ts';
import { clamp, lerp, type Vec3 } from './vec.ts';

export interface ShotParams {
  side: Side;
  /** Ball centre at contact. */
  contact: Vec3;
  strength: number;
  /** Swing direction from the player's perspective, -1 … 1. */
  direction: number;
  /** -1 … 1, positive = swung early. */
  timingError: number;
  /** Racket face tilt (rad), positive = open. */
  pitch: number;
  /** True when the paddle is on the player's right side (forehand). */
  forehand: boolean;
}

export interface ShotResult {
  vel: Vec3;
  topspin: number;
}

const flight = (contact: Vec3, vel: Vec3, topspin: number): FlightResult =>
  firstContact({ pos: { ...contact }, vel, topspin, active: true }, DT);

/**
 * Distance along the player's forward axis to the first contact. Balls that
 * hit the net or land before it count as short, so searches treat them as
 * "too low".
 */
function progress(contact: Vec3, r: FlightResult, side: Side): number {
  const f = forward(side);
  const toNet = -f * contact.z;
  if (r.kind === 'net') return toNet - 0.05;
  if (r.kind === 'table' && f * r.pos.z < 0) return toNet - 0.05;
  return f * (r.pos.z - contact.z);
}

const clearsNet = (contact: Vec3, vel: Vec3, topspin: number, side: Side): boolean => {
  const r = flight(contact, vel, topspin);
  return r.kind !== 'net' && !(r.kind === 'table' && forward(side) * r.pos.z < 0);
};

/** Bisects `fn(vy)` (monotonic increasing in vy) for the value `target`. */
function bisect(lo: number, hi: number, iterations: number, below: (vy: number) => boolean): number {
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (below(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Rally shot. Strength sets ball speed and target depth; swing direction and
 * timing set the sideways aim; the racket face angle adds launch-angle error.
 * The solver aims at a point on the opponent's half, so a clean swing lands,
 * while timing, face angle or hitting hard from a low ball can still send it
 * wide, long or into the net.
 */
export function rallyShot(p: ShotParams): ShotResult {
  const f = forward(p.side);
  const rs = rightSign(p.side);
  const s = clamp(p.strength, 0, 1);
  const speed = lerp(SHOT.minSpeed, SHOT.maxSpeed, s) * (p.forehand ? 1 : SHOT.backhandSpeedFactor);
  const depth = lerp(SHOT.minDepth, SHOT.maxDepth, s);
  // Early swings pull the ball across the body, late swings push it away.
  const pull = (p.forehand ? -1 : 1) * clamp(p.timingError, -1, 1) * SHOT.timingSpread;
  const aimX = (clamp(p.direction, -1, 1) * SHOT.aimSpread + pull) * rs;
  const dx = aimX - p.contact.x;
  const dz = f * depth - p.contact.z;
  const len = Math.hypot(dx, dz);
  const hx = (dx / len) * speed;
  const hz = (dz / len) * speed;
  const topspin = s * SHOT.maxTopspin;
  const want = Math.abs(dz);

  let vy = bisect(-4, 7, 22, (v) => progress(p.contact, flight(p.contact, { x: hx, y: v, z: hz }, topspin), p.side) < want);
  if (!clearsNet(p.contact, { x: hx, y: vy - SHOT.netClearance, z: hz }, topspin, p.side)) {
    // Lift the ball just enough to clear the net; it may now land long.
    vy = bisect(vy, 7, 18, (v) => !clearsNet(p.contact, { x: hx, y: v, z: hz }, topspin, p.side)) + SHOT.netClearance;
  }
  vy += p.pitch * SHOT.pitchToVy;
  return { vel: { x: hx, y: vy, z: hz }, topspin };
}

/**
 * Serve: the first bounce lands on the server's own half, then the ball
 * crosses the net. Speed is adjusted if the predicted second bounce would go
 * long or into the net.
 */
export function serveShot(p: ShotParams): ShotResult {
  const f = forward(p.side);
  const rs = rightSign(p.side);
  const s = clamp(p.strength, 0, 1);
  let speed = lerp(SERVE.minSpeed, SERVE.maxSpeed, s);
  const aimX = clamp(p.direction, -1, 1) * SERVE.aimSpread * rs;
  const ownZ = -f * SERVE.ownBounceDepth;
  const farZ = f * TABLE.halfLength * 0.6;
  const dx = aimX - p.contact.x;
  const dz = farZ - p.contact.z;
  const len = Math.hypot(dx, dz);
  const want = f * (ownZ - p.contact.z);
  let vel: Vec3 = { x: 0, y: 0, z: 0 };
  for (let attempt = 0; attempt < 10; attempt++) {
    const hx = (dx / len) * speed;
    const hz = (dz / len) * speed;
    const vy = bisect(-6, 3, 22, (v) => {
      const r = flight(p.contact, { x: hx, y: v, z: hz }, 0);
      return (r.kind === 'table' ? f * (r.pos.z - p.contact.z) : 99) < want;
    });
    vel = { x: hx, y: vy, z: hz };
    const second = secondContact(p.contact, vel);
    if (second.kind === 'table' && f * second.pos.z > 0) break;
    speed *= second.kind === 'net' ? 1.06 : 0.92;
  }
  vel.y += p.pitch * SHOT.pitchToVy;
  return { vel, topspin: 0 };
}

/** The contact after the first bounce (used to check a serve lands in). */
function secondContact(contact: Vec3, vel: Vec3): FlightResult {
  const b: BallState = { pos: { ...contact }, vel: { ...vel }, topspin: 0, active: true };
  let bounces = 0;
  let out: FlightResult | null = null;
  const steps = Math.ceil(2.5 / DT);
  for (let i = 1; i <= steps && !out; i++) {
    stepBall(b, DT, (e) => {
      if (out) return;
      if (e.type === 'table') {
        bounces++;
        if (bounces === 2) out = { kind: 'table', pos: { ...b.pos }, time: i * DT, cord: false };
      } else if (e.type === 'net' && !e.cord) {
        out = { kind: 'net', pos: { ...b.pos }, time: i * DT, cord: false };
      } else if (e.type === 'floor') {
        out = { kind: 'floor', pos: { ...b.pos }, time: i * DT, cord: false };
      }
    });
  }
  return out ?? { kind: 'none', pos: b.pos, time: 2.5, cord: false };
}
