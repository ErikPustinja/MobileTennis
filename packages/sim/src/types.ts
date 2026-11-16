import type { Vec3 } from './vec.ts';

/** 0 = player 1 (negative z, faces +z), 1 = player 2 (positive z, faces -z). */
export type Side = 0 | 1;

export interface SwingIntent {
  /** 0 = gentle, 1 = as hard as possible. */
  strength: number;
  /** Sideways swing direction from the player's own perspective, -1 (left) … 1 (right). */
  direction: number;
  /** Forehand or backhand; when omitted the paddle side decides (right = forehand). */
  stroke?: 'forehand' | 'backhand';
}

/**
 * Everything a player can do in one simulation step. `lateral` and `pitch`
 * are continuous; `serve` and `swing` are edge-triggered (set for one step).
 */
export interface PlayerInput {
  /** Target sideways paddle offset from the player's perspective, -1 (left) … 1 (right). */
  lateral: number;
  /** Racket face tilt in radians; positive opens the face (ball goes higher). */
  pitch: number;
  serve: boolean;
  swing: SwingIntent | null;
}

export const idleInput = (): PlayerInput => ({ lateral: 0, pitch: 0, serve: false, swing: null });

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  /** Topspin amount (0 … 1), see BALL.magnus. */
  topspin: number;
  /** False while the server holds the ball or after it hit the floor. */
  active: boolean;
}

export interface Swing {
  startTime: number;
  /** Moment the paddle passes the hitting plane. */
  contactTime: number;
  speed: number;
  strength: number;
  direction: number;
  /** -1 … 1: negative = swung late, positive = swung early (relative to the ball). */
  timingError: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  planeZ: number;
  endTime: number;
  hit: boolean;
  forehand: boolean;
}

export interface PaddleState {
  pos: Vec3;
  vel: Vec3;
}

export interface PlayerState {
  side: Side;
  avatarX: number;
  avatarVx: number;
  /** Smoothed lateral offset, player perspective, -1 … 1. */
  lateral: number;
  lateralTarget: number;
  pitch: number;
  paddle: PaddleState;
  swing: Swing | null;
  cooldownUntil: number;
}

export type Phase = 'serveReady' | 'toss' | 'inPlay' | 'pointOver' | 'matchOver';

export interface RallyState {
  phase: Phase;
  server: Side;
  lastHitter: Side | null;
  /** 0: serve must bounce on server's side, 1: then on receiver's side, null: normal rally. */
  serveStage: 0 | 1 | null;
  /** The ball has bounced on the side of the player who must hit it next. */
  bounced: boolean;
  /** The served ball touched the net (a let if it still lands correctly). */
  netTouched: boolean;
  phaseUntil: number;
  rallyHits: number;
}

export interface ScoreState {
  points: [number, number];
  sets: [number, number];
  /** Final points of each finished set. */
  history: Array<[number, number]>;
  firstServerOfSet: Side;
  winner: Side | null;
}

/** Where and when the ball will cross a player's hitting plane. Times are absolute. */
export interface Prediction {
  side: Side;
  time: number;
  x: number;
  y: number;
}

export type PointReason =
  | 'serve-own-side'
  | 'serve-not-over'
  | 'serve-out'
  | 'own-side'
  | 'double-bounce'
  | 'not-returned'
  | 'out'
  | 'volley'
  | 'double-hit';

export type MatchEvent =
  | { type: 'toss'; side: Side }
  | { type: 'hit'; side: Side; strength: number }
  | { type: 'bounce'; side: Side }
  | { type: 'net'; cord: boolean }
  | { type: 'floor' }
  | { type: 'point'; winner: Side; reason: PointReason }
  | { type: 'let' }
  | { type: 'serveReady'; server: Side }
  | { type: 'set'; winner: Side }
  | { type: 'match'; winner: Side };

export interface MatchConfig {
  pointsToWinSet: number;
  winBy: number;
  setsToWin: number;
  serveSwitchEvery: number;
  deuceAt: number;
  pointPause: number;
  timingTolerance: number;
  firstServer: Side;
}

export interface MatchState {
  seed: number;
  tick: number;
  time: number;
  paused: boolean;
  config: MatchConfig;
  ball: BallState;
  players: [PlayerState, PlayerState];
  rally: RallyState;
  score: ScoreState;
  prediction: Prediction | null;
  /** Events produced by the most recent step only. */
  events: MatchEvent[];
}
