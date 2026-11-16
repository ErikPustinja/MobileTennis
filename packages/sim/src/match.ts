import { cloneBall, stepBall, type BallEvent, type PaddleSweep } from './ball.ts';
import { AVATAR, BALL, DT, PADDLE, RULES, SERVE, SHOT, TABLE } from './config.ts';
import { forward, hitPlaneZ, opponent, rightSign } from './geometry.ts';
import { awardPoint, currentServer, newScore } from './score.ts';
import { rallyShot, serveShot } from './shot.ts';
import type {
  BallState,
  MatchConfig,
  MatchState,
  PlayerInput,
  PlayerState,
  PointReason,
  Prediction,
  Side,
  SwingIntent,
} from './types.ts';
import { clamp, lerp, smoothstep, vec3 } from './vec.ts';

export const defaultConfig = (): MatchConfig => ({
  pointsToWinSet: RULES.pointsToWinSet,
  winBy: RULES.winBy,
  setsToWin: RULES.setsToWin,
  serveSwitchEvery: RULES.serveSwitchEvery,
  deuceAt: RULES.deuceAt,
  pointPause: RULES.pointPause,
  timingTolerance: SHOT.timingTolerance,
  firstServer: 0,
});

function newPlayer(side: Side): PlayerState {
  return {
    side,
    avatarX: 0,
    avatarVx: 0,
    lateral: 0,
    lateralTarget: 0,
    pitch: 0,
    paddle: { pos: vec3(0, PADDLE.restHeight, hitPlaneZ(side) - forward(side) * PADDLE.backswing), vel: vec3() },
    swing: null,
    cooldownUntil: 0,
  };
}

export interface CreateMatchOptions {
  seed?: number;
  config?: Partial<MatchConfig>;
}

export function createMatch(opts: CreateMatchOptions = {}): MatchState {
  const config = { ...defaultConfig(), ...opts.config };
  const state: MatchState = {
    seed: opts.seed ?? 1,
    tick: 0,
    time: 0,
    paused: false,
    config,
    ball: { pos: vec3(), vel: vec3(), topspin: 0, active: false },
    players: [newPlayer(0), newPlayer(1)],
    rally: {
      phase: 'serveReady',
      server: config.firstServer,
      lastHitter: null,
      serveStage: null,
      bounced: false,
      netTouched: false,
      phaseUntil: 0,
      rallyHits: 0,
    },
    score: newScore(config.firstServer),
    prediction: null,
    events: [],
  };
  holdBall(state);
  state.events.push({ type: 'serveReady', server: state.rally.server });
  return state;
}

/** Starts a rematch with the same configuration, keeping time running. */
export function resetMatch(state: MatchState): void {
  const fresh = createMatch({ seed: state.seed, config: state.config });
  const { tick, time } = state;
  Object.assign(state, fresh, { tick, time });
}

export function setPaused(state: MatchState, paused: boolean): void {
  state.paused = paused;
}

/** Paddle position when not swinging. */
function restPaddle(state: MatchState, p: PlayerState): { x: number; y: number; z: number } {
  const pred = state.prediction && state.prediction.side === p.side ? state.prediction : null;
  return {
    x: p.avatarX + p.lateral * PADDLE.lateralReach * rightSign(p.side),
    y: pred ? clamp(pred.y, TABLE.height + 0.05, 1.45) : PADDLE.restHeight,
    z: hitPlaneZ(p.side) - forward(p.side) * PADDLE.backswing,
  };
}

/** Paddle position at absolute time `t`. */
function paddleAt(state: MatchState, p: PlayerState, t: number): { x: number; y: number; z: number } {
  const sw = p.swing;
  if (!sw) return restPaddle(state, p);
  const f = forward(p.side);
  const along = clamp(sw.speed * (t - sw.contactTime), -PADDLE.backswing, PADDLE.followThrough);
  const windup = smoothstep((t - sw.startTime) / Math.max(sw.contactTime - sw.startTime, DT));
  return {
    x: lerp(sw.fromX, sw.targetX, windup),
    y: lerp(sw.fromY, sw.targetY, windup),
    z: sw.planeZ + f * along,
  };
}

function holdBall(state: MatchState): void {
  const server = state.players[state.rally.server];
  const f = forward(server.side);
  const b = state.ball;
  b.active = false;
  b.topspin = 0;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.pos.x = server.avatarX + rightSign(server.side) * SERVE.tossSide;
  b.pos.y = TABLE.height + SERVE.tossHeight;
  b.pos.z = -f * (TABLE.halfLength + SERVE.tossBehind);
}

/** Ballistic look-ahead of where and when the ball crosses a side's hitting plane. */
export function predictCrossing(ball: BallState, side: Side, now: number, maxTime = 3): Prediction | null {
  if (!ball.active) return null;
  const b = cloneBall(ball);
  const plane = hitPlaneZ(side);
  const f = forward(side);
  let floor = false;
  const emit = (e: BallEvent) => {
    if (e.type === 'floor') floor = true;
  };
  const steps = Math.ceil(maxTime / DT);
  for (let i = 1; i <= steps; i++) {
    const px = b.pos.x;
    const py = b.pos.y;
    const pz = b.pos.z;
    stepBall(b, DT, emit);
    if (floor) return null;
    const movingTo = f * b.vel.z < 0;
    if (movingTo && (pz - plane) * (b.pos.z - plane) <= 0 && pz !== b.pos.z) {
      const u = (pz - plane) / (pz - b.pos.z);
      return {
        side,
        time: now + (i - 1 + u) * DT,
        x: px + (b.pos.x - px) * u,
        y: py + (b.pos.y - py) * u,
      };
    }
  }
  return null;
}

/** Ball position `dt` seconds ahead, following the same physics. */
function ballAt(ball: BallState, dt: number): { x: number; y: number; z: number } {
  const b = cloneBall(ball);
  const n = Math.max(0, Math.round(dt / DT));
  for (let i = 0; i < n && b.active; i++) stepBall(b, DT, () => {});
  return { ...b.pos };
}

function startSwing(state: MatchState, p: PlayerState, intent: SwingIntent): void {
  const now = state.time;
  if (p.swing || now < p.cooldownUntil) return;
  const phase = state.rally.phase;
  const strength = clamp(intent.strength, 0, 1);
  const speed = lerp(PADDLE.swingMinSpeed, PADDLE.swingMaxSpeed, strength);
  const natural = now + PADDLE.backswing / speed;
  const rest = restPaddle(state, p);
  const tol = state.config.timingTolerance;

  let planeZ = hitPlaneZ(p.side);
  let contactTime = natural;
  let timingError = 0;
  let target: { x: number; y: number } | null = null;

  if (phase === 'toss' && state.rally.server === p.side) {
    // Serving: the tossed ball hangs in the paddle's path, so timing is free.
    planeZ = state.ball.pos.z;
    const at = ballAt(state.ball, natural - now);
    target = { x: at.x, y: at.y };
  } else if (phase === 'inPlay' && state.prediction && state.prediction.side === p.side) {
    const pred = state.prediction;
    const err = pred.time - natural;
    if (Math.abs(err) <= tol) {
      timingError = err / tol;
      if (err >= 0) {
        // Swung early: hold the paddle back and meet the ball at the hitting plane.
        contactTime = pred.time;
        target = { x: pred.x, y: pred.y };
      } else {
        // Swung late: meet the ball where it will be at the natural contact
        // moment, a little behind the hitting plane.
        const at = ballAt(state.ball, natural - now);
        planeZ = at.z;
        target = { x: at.x, y: at.y };
      }
    }
  }

  const tx = target ? clamp(target.x, rest.x - PADDLE.assistReachX, rest.x + PADDLE.assistReachX) : rest.x;
  const ty = target ? clamp(target.y, rest.y - PADDLE.assistReachY, rest.y + PADDLE.assistReachY) : rest.y;
  p.swing = {
    startTime: now,
    contactTime,
    speed,
    strength,
    direction: clamp(intent.direction, -1, 1),
    timingError,
    fromX: rest.x,
    fromY: rest.y,
    targetX: tx,
    targetY: ty,
    planeZ,
    endTime: contactTime + PADDLE.followThrough / speed,
    hit: false,
  };
}

function startToss(state: MatchState): void {
  const b = state.ball;
  holdBall(state);
  b.active = true;
  b.vel.y = SERVE.tossSpeed;
  state.rally.phase = 'toss';
  state.prediction = null;
  state.events.push({ type: 'toss', side: state.rally.server });
}

function endPoint(state: MatchState, winner: Side | null, reason: PointReason | 'let'): void {
  const r = state.rally;
  if (r.phase !== 'inPlay' && r.phase !== 'toss') return;
  r.phase = 'pointOver';
  r.phaseUntil = state.time + state.config.pointPause;
  state.prediction = null;
  if (winner === null) {
    state.events.push({ type: 'let' });
    return;
  }
  state.events.push({ type: 'point', winner, reason: reason as PointReason });
  awardPoint(state.score, winner, state.config, state.events);
}

function prepareNextPoint(state: MatchState): void {
  const r = state.rally;
  if (state.score.winner !== null) {
    r.phase = 'matchOver';
    return;
  }
  r.phase = 'serveReady';
  r.server = currentServer(state.score, state.config);
  r.lastHitter = null;
  r.serveStage = null;
  r.bounced = false;
  r.netTouched = false;
  r.rallyHits = 0;
  for (const p of state.players) p.swing = null;
  holdBall(state);
  state.events.push({ type: 'serveReady', server: r.server });
}

/** Applies the rules to one physical event. */
function onBallEvent(state: MatchState, e: BallEvent): void {
  const r = state.rally;
  if (r.phase === 'toss') {
    if (e.type === 'paddle' && e.side === r.server) {
      r.phase = 'inPlay';
      r.serveStage = 0;
      r.lastHitter = r.server;
      r.bounced = false;
      r.netTouched = false;
      r.rallyHits = 1;
    } else if (e.type === 'table' || e.type === 'floor') {
      // Missed toss: no penalty, the server simply tries again.
      r.phase = 'serveReady';
      holdBall(state);
      state.events.push({ type: 'serveReady', server: r.server });
    }
    return;
  }
  if (r.phase !== 'inPlay' || r.lastHitter === null) return;
  const server = r.server;
  const receiver = opponent(server);
  const hitter = r.lastHitter;
  const next = opponent(hitter);

  switch (e.type) {
    case 'net':
      if (r.serveStage !== null && e.cord) r.netTouched = true;
      return;
    case 'table':
      if (r.serveStage === 0) {
        if (e.side === server) r.serveStage = 1;
        else endPoint(state, receiver, 'serve-own-side');
      } else if (r.serveStage === 1) {
        if (e.side !== receiver) endPoint(state, receiver, 'serve-not-over');
        else if (r.netTouched) endPoint(state, null, 'let');
        else {
          r.serveStage = null;
          r.bounced = true;
        }
      } else if (!r.bounced) {
        if (e.side === next) r.bounced = true;
        else endPoint(state, next, 'own-side');
      } else {
        endPoint(state, hitter, e.side === next ? 'double-bounce' : 'not-returned');
      }
      return;
    case 'floor':
      if (r.serveStage !== null) endPoint(state, receiver, 'serve-out');
      else if (r.bounced) endPoint(state, hitter, 'not-returned');
      else endPoint(state, next, 'out');
      return;
    case 'paddle': {
      if (e.side === hitter) {
        endPoint(state, next, 'double-hit');
        return;
      }
      if (!r.bounced || r.serveStage !== null) {
        // Hit before the ball bounced on this side: if it was already past the
        // end line it would have been out anyway.
        const beyond = Math.abs(state.ball.pos.z) > TABLE.halfLength;
        endPoint(state, beyond ? e.side : hitter, beyond ? 'out' : 'volley');
        return;
      }
      r.lastHitter = e.side;
      r.bounced = false;
      r.rallyHits++;
      return;
    }
  }
}

function updateAvatar(state: MatchState, p: PlayerState): void {
  const pred = state.prediction && state.prediction.side === p.side ? state.prediction : null;
  const offset = p.lateral * PADDLE.lateralReach * rightSign(p.side);
  let target = 0;
  if (pred) target = pred.x - offset;
  if (p.swing) target = p.avatarX; // stay planted during a swing
  const desired = clamp((target - p.avatarX) * AVATAR.gain, -AVATAR.maxSpeed, AVATAR.maxSpeed);
  p.avatarVx = desired;
  p.avatarX = clamp(p.avatarX + desired * DT, -AVATAR.maxX, AVATAR.maxX);
}

/**
 * Advances the match by one fixed step (1/120 s). Inputs are per player, in
 * each player's own perspective. The step never reads clocks or frame rates.
 */
export function stepMatch(state: MatchState, inputs: readonly [PlayerInput, PlayerInput]): void {
  state.events = [];
  if (state.paused || state.rally.phase === 'matchOver') return;
  const r = state.rally;

  for (const p of state.players) {
    const input = inputs[p.side];
    p.lateralTarget = clamp(input.lateral, -1, 1);
    p.pitch = clamp(input.pitch, -1, 1);
    const maxDelta = PADDLE.lateralRate * DT;
    p.lateral += clamp(p.lateralTarget - p.lateral, -maxDelta, maxDelta);
    if (input.serve && r.phase === 'serveReady' && r.server === p.side) startToss(state);
    if (input.swing && (r.phase === 'toss' || r.phase === 'inPlay')) startSwing(state, p, input.swing);
  }

  if (r.phase === 'pointOver' && state.time >= r.phaseUntil) prepareNextPoint(state);

  for (const p of state.players) updateAvatar(state, p);

  const tEnd = state.time + DT;
  const sweeps: PaddleSweep[] = [];
  const hitBy: Side[] = [];
  for (const p of state.players) {
    const from = { ...p.paddle.pos };
    const to = paddleAt(state, p, tEnd);
    p.paddle.vel.x = (to.x - from.x) / DT;
    p.paddle.vel.y = (to.y - from.y) / DT;
    p.paddle.vel.z = (to.z - from.z) / DT;
    p.paddle.pos.x = to.x;
    p.paddle.pos.y = to.y;
    p.paddle.pos.z = to.z;
    const sw = p.swing;
    if (sw && !sw.hit && (r.phase === 'toss' || r.phase === 'inPlay')) {
      sweeps.push({
        side: p.side,
        from,
        to,
        normal: { x: 0, y: 0, z: forward(p.side) },
        onContact: (ball) => {
          sw.hit = true;
          const params = {
            side: p.side,
            contact: { ...ball.pos },
            strength: sw.strength,
            direction: sw.direction,
            timingError: sw.timingError,
            pitch: p.pitch,
            forehand: p.lateral >= 0,
          };
          const shot = r.phase === 'toss' ? serveShot(params) : rallyShot(params);
          ball.vel.x = shot.vel.x;
          ball.vel.y = shot.vel.y;
          ball.vel.z = shot.vel.z;
          ball.topspin = shot.topspin;
          hitBy.push(p.side);
          state.events.push({ type: 'hit', side: p.side, strength: sw.strength });
        },
      });
    }
  }

  if (r.phase === 'serveReady') {
    holdBall(state);
  } else {
    const ballEvents: BallEvent[] = [];
    stepBall(state.ball, DT, (e) => ballEvents.push(e), sweeps);
    for (const e of ballEvents) {
      if (e.type === 'table') state.events.push({ type: 'bounce', side: e.side });
      else if (e.type === 'net') state.events.push({ type: 'net', cord: e.cord });
      else if (e.type === 'floor') state.events.push({ type: 'floor' });
      onBallEvent(state, e);
    }
    if (r.phase === 'toss' && state.ball.pos.y < TABLE.height - SERVE.tossFailDepth) {
      r.phase = 'serveReady';
      holdBall(state);
      state.events.push({ type: 'serveReady', server: r.server });
    }
    if (hitBy.length > 0 && r.phase === 'inPlay' && r.lastHitter !== null) {
      state.prediction = predictCrossing(state.ball, opponent(r.lastHitter), tEnd);
    } else if (state.prediction && tEnd > state.prediction.time + 0.5) {
      state.prediction = null;
    }
  }

  for (const p of state.players) {
    if (p.swing && tEnd >= p.swing.endTime) {
      p.cooldownUntil = p.swing.endTime + PADDLE.swingCooldown;
      p.swing = null;
    }
  }

  state.tick++;
  state.time = state.tick * DT;
}

/** Ball radius re-exported for renderers. */
export const BALL_RADIUS = BALL.radius;
