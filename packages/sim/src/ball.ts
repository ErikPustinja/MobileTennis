import { BALL, NET, PADDLE, TABLE } from './config.ts';
import type { BallState, Side } from './types.ts';
import { lerpVec, vec3, type Vec3 } from './vec.ts';

export type BallEvent =
  | { type: 'table'; side: Side }
  | { type: 'net'; cord: boolean }
  | { type: 'floor' }
  | { type: 'paddle'; side: Side };

/**
 * Linear paddle motion over one full simulation step. Contact is found by
 * sweeping the ball and the paddle together, so no swing speed can tunnel
 * through the ball.
 */
export interface PaddleSweep {
  side: Side;
  from: Vec3;
  to: Vec3;
  /** Unit face normal; the swing moves along it. */
  normal: Vec3;
  /** Called at the contact point; must set the ball's new velocity. */
  onContact: (ball: BallState) => void;
}

const BALL_R = BALL.radius;
const TABLE_Y = TABLE.height;
const NET_TOP = TABLE.height + NET.height;
const CONTACT_DIST = BALL.radius + PADDLE.halfThickness;
const CONTACT_RADIUS = PADDLE.radius + PADDLE.contactSlack;
const MAX_SUBSTEPS = 5;

export const sideOfZ = (z: number): Side => (z < 0 ? 0 : 1);

export function cloneBall(b: BallState): BallState {
  return { pos: { ...b.pos }, vel: { ...b.vel }, topspin: b.topspin, active: b.active };
}

/** Acceleration from gravity, quadratic drag and simplified topspin dip. */
function accel(v: Vec3, topspin: number, out: Vec3): Vec3 {
  const speed = Math.hypot(v.x, v.y, v.z);
  const hSpeed = Math.hypot(v.x, v.z);
  out.x = -BALL.drag * speed * v.x;
  out.y = -BALL.gravity - BALL.drag * speed * v.y - BALL.magnus * topspin * hSpeed;
  out.z = -BALL.drag * speed * v.z;
  return out;
}

interface Hit {
  f: number;
  kind: 'table' | 'net' | 'cord' | 'floor' | 'paddle';
  sweep?: PaddleSweep;
}

const tmpA = vec3();
const tmpV = vec3();
const tmpEnd = vec3();
const pa = vec3();

/**
 * Advances the ball by `dt` seconds using semi-implicit Euler, resolving the
 * earliest collision inside the step (table, net, floor, swinging paddle) and
 * continuing with the remaining time. Prediction code calls this with no
 * sweeps, so predicted and simulated flights follow the same code path.
 */
export function stepBall(
  ball: BallState,
  dt: number,
  emit: (e: BallEvent) => void,
  sweeps: readonly PaddleSweep[] = [],
): void {
  if (!ball.active) return;
  const live = sweeps.length > 0 ? [...sweeps] : sweeps;
  let done = 0; // fraction of the full step already simulated
  for (let iter = 0; iter < MAX_SUBSTEPS && done < 1; iter++) {
    const rem = (1 - done) * dt;
    accel(ball.vel, ball.topspin, tmpA);
    tmpV.x = ball.vel.x + tmpA.x * rem;
    tmpV.y = ball.vel.y + tmpA.y * rem;
    tmpV.z = ball.vel.z + tmpA.z * rem;
    const p0 = ball.pos;
    tmpEnd.x = p0.x + tmpV.x * rem;
    tmpEnd.y = p0.y + tmpV.y * rem;
    tmpEnd.z = p0.z + tmpV.z * rem;

    const hit = earliestHit(p0, tmpEnd, tmpV, done, live);
    if (!hit) {
      ball.pos.x = tmpEnd.x;
      ball.pos.y = tmpEnd.y;
      ball.pos.z = tmpEnd.z;
      ball.vel.x = tmpV.x;
      ball.vel.y = tmpV.y;
      ball.vel.z = tmpV.z;
      break;
    }

    const prevZ = p0.z;
    lerpVec(ball.pos, p0, tmpEnd, hit.f);
    ball.vel.x = tmpV.x;
    ball.vel.y = tmpV.y;
    ball.vel.z = tmpV.z;
    done += (1 - done) * hit.f;

    switch (hit.kind) {
      case 'table':
        ball.pos.y = TABLE_Y + BALL_R;
        ball.vel.y = -ball.vel.y * BALL.tableRestitution;
        ball.vel.x *= BALL.tableFriction;
        ball.vel.z *= BALL.tableFriction;
        ball.topspin *= BALL.spinDecayOnBounce;
        emit({ type: 'table', side: sideOfZ(ball.pos.z) });
        break;
      case 'net': {
        const back = prevZ < 0 ? -1 : 1;
        ball.pos.z = back * BALL_R;
        ball.vel.z = -ball.vel.z * NET.blockRestitution;
        ball.vel.x *= NET.blockDamping;
        ball.vel.y *= NET.blockDamping;
        ball.topspin = 0;
        emit({ type: 'net', cord: false });
        break;
      }
      case 'cord': {
        const ahead = prevZ < 0 ? 1 : -1;
        ball.pos.z = ahead * 1e-4;
        ball.vel.z *= NET.cordDamping;
        ball.vel.y += NET.cordLift;
        emit({ type: 'net', cord: true });
        break;
      }
      case 'floor':
        ball.pos.y = Math.max(ball.pos.y, BALL_R);
        ball.vel.x = 0;
        ball.vel.y = 0;
        ball.vel.z = 0;
        ball.active = false;
        emit({ type: 'floor' });
        return;
      case 'paddle':
        hit.sweep!.onContact(ball);
        // A paddle touches the ball at most once per swing.
        (live as PaddleSweep[]).splice(live.indexOf(hit.sweep!), 1);
        emit({ type: 'paddle', side: hit.sweep!.side });
        break;
    }
  }
}

function earliestHit(
  p0: Vec3,
  p1: Vec3,
  v: Vec3,
  done: number,
  sweeps: readonly PaddleSweep[],
): Hit | null {
  let best: Hit | null = null;
  const consider = (f: number, kind: Hit['kind'], sweep?: PaddleSweep) => {
    if (f >= 0 && f <= 1 && (!best || f < best.f)) best = sweep ? { f, kind, sweep } : { f, kind };
  };

  // Table surface, approached from above.
  if (v.y < 0 && p0.y - BALL_R >= TABLE_Y - 1e-9 && p1.y - BALL_R < TABLE_Y) {
    const f = (p0.y - BALL_R - TABLE_Y) / (p0.y - p1.y);
    const x = p0.x + (p1.x - p0.x) * f;
    const z = p0.z + (p1.z - p0.z) * f;
    if (Math.abs(x) <= TABLE.halfWidth && Math.abs(z) <= TABLE.halfLength) consider(f, 'table');
  }

  // Net plane z = 0.
  if (p0.z !== 0 && (p0.z < 0) !== (p1.z < 0)) {
    const f = p0.z / (p0.z - p1.z);
    const x = p0.x + (p1.x - p0.x) * f;
    const y = p0.y + (p1.y - p0.y) * f;
    if (Math.abs(x) <= NET.halfWidth && y > TABLE_Y - BALL_R && y < NET_TOP + BALL_R) {
      consider(f, y < NET_TOP ? 'net' : 'cord');
    }
  }

  // Floor, or leaving the playing area entirely.
  if (p1.y - BALL_R <= 0) {
    consider(p0.y - BALL_R <= 0 ? 0 : (p0.y - BALL_R) / (p0.y - p1.y), 'floor');
  } else if (Math.abs(p1.x) > BALL.outOfWorld || Math.abs(p1.z) > BALL.outOfWorld) {
    consider(1, 'floor');
  }

  // Swinging paddles: solve for the moment the ball centre is CONTACT_DIST
  // in front of the moving paddle face, both moving linearly over the step.
  for (const s of sweeps) {
    lerpVec(pa, s.from, s.to, done);
    const n = s.normal;
    const d0x = p0.x - pa.x;
    const d0y = p0.y - pa.y;
    const d0z = p0.z - pa.z;
    // Relative displacement over the remaining part of the step.
    const rx = p1.x - p0.x - (s.to.x - pa.x);
    const ry = p1.y - p0.y - (s.to.y - pa.y);
    const rz = p1.z - p0.z - (s.to.z - pa.z);
    const s0 = d0x * n.x + d0y * n.y + d0z * n.z;
    const ds = rx * n.x + ry * n.y + rz * n.z;
    if (ds >= 0) continue; // not approaching each other
    let f: number;
    if (s0 > CONTACT_DIST) f = (s0 - CONTACT_DIST) / -ds;
    else if (s0 >= -CONTACT_DIST) f = 0;
    else continue; // ball already behind the paddle
    if (f > 1) continue;
    const dx = d0x + rx * f;
    const dy = d0y + ry * f;
    const dz = d0z + rz * f;
    const sAt = dx * n.x + dy * n.y + dz * n.z;
    const lx = dx - sAt * n.x;
    const ly = dy - sAt * n.y;
    const lz = dz - sAt * n.z;
    if (lx * lx + ly * ly + lz * lz <= CONTACT_RADIUS * CONTACT_RADIUS) consider(f, 'paddle', s);
  }
  return best;
}

export interface FlightResult {
  kind: 'table' | 'net' | 'floor' | 'none';
  pos: Vec3;
  time: number;
  /** The ball clipped the net cord before this result. */
  cord: boolean;
}

/** Flies a copy of the ball until its first table, net-body or floor contact. */
export function firstContact(start: BallState, dt: number, maxTime = 2.5): FlightResult {
  const b = cloneBall(start);
  b.active = true;
  let result: FlightResult | null = null;
  let cord = false;
  const emit = (e: BallEvent) => {
    if (result) return;
    if (e.type === 'net' && e.cord) {
      cord = true;
      return;
    }
    if (e.type === 'table' || e.type === 'net' || e.type === 'floor') {
      result = { kind: e.type, pos: { ...b.pos }, time: 0, cord };
    }
  };
  const steps = Math.ceil(maxTime / dt);
  for (let i = 1; i <= steps; i++) {
    stepBall(b, dt, emit);
    if (result) {
      (result as FlightResult).time = i * dt;
      return result;
    }
  }
  return { kind: 'none', pos: { ...b.pos }, time: maxTime, cord };
}
