/**
 * Every physics, gameplay and gesture constant lives here.
 * Units are SI (metres, seconds, kilograms, radians) unless noted.
 *
 * World axes: x = across the table (sideways), y = up, z = along the table.
 * Player 1 (side 0) stands at negative z and faces +z; player 2 (side 1)
 * stands at positive z and faces -z. The net is the plane z = 0.
 */

export const SIM_HZ = 120; // fixed simulation rate; the sim never looks at frame rate
export const DT = 1 / SIM_HZ; // seconds per simulation step

export const TABLE = {
  length: 2.74, // regulation table length
  width: 1.525, // regulation table width
  height: 0.76, // height of the playing surface above the floor
  halfLength: 2.74 / 2, // distance from the net to each end line
  halfWidth: 1.525 / 2, // distance from the centre line to each side line
} as const;

export const NET = {
  height: 0.1525, // net height above the playing surface
  halfWidth: 1.83 / 2, // the net overhangs each side line by 15.25 cm
  /** Fraction of vz kept (and reversed) when the ball hits the net body. */
  blockRestitution: 0.15,
  /** Fraction of vx and vy kept after hitting the net body. */
  blockDamping: 0.6,
  /** Fraction of vz kept when the ball clips the top cord and rolls over. */
  cordDamping: 0.7,
  /** Upward speed added when the ball clips the cord (m/s). */
  cordLift: 0.3,
} as const;

export const BALL = {
  radius: 0.02, // 40 mm ball
  mass: 0.0027, // 2.7 g ball
  gravity: 9.81, // m/s^2
  /**
   * Quadratic drag coefficient k in a = -k |v| v.
   * k = 0.5 * rho_air(1.2) * Cd(0.5) * area(pi r^2) / mass ≈ 0.14 1/m.
   */
  drag: 0.14,
  /**
   * Extra downward acceleration per unit of topspin and per m/s of
   * horizontal speed (a simplified Magnus effect). Lets strong shots dip
   * onto the table instead of flying long.
   */
  magnus: 0.8,
  /** Vertical coefficient of restitution on the table (real tables ≈ 0.88–0.93). */
  tableRestitution: 0.88,
  /** Fraction of horizontal speed kept after a table bounce (surface friction). */
  tableFriction: 0.97,
  /** Fraction of topspin kept after a table bounce. */
  spinDecayOnBounce: 0.6,
  /** Ball further than this from the table centre (m) counts as hitting the floor. */
  outOfWorld: 8,
} as const;

export const PADDLE = {
  radius: 0.085, // blade radius used for contact (real blades ≈ 15 × 16 cm)
  halfThickness: 0.01, // half of blade + rubber thickness
  /** Extra lateral tolerance on contact, so near-edge hits still count (m). */
  contactSlack: 0.02,
  /** Distance of the hitting plane behind the end line (m). */
  hitPlaneBehind: 0.28,
  /** How far behind the hitting plane the paddle waits before a swing (m). */
  backswing: 0.3,
  /** How far past the hitting plane the swing follows through (m). */
  followThrough: 0.35,
  /** Paddle speed through the hitting plane at strength 0 (m/s). */
  swingMinSpeed: 3,
  /** Paddle speed through the hitting plane at strength 1 (m/s). */
  swingMaxSpeed: 22,
  /** Pause after a swing ends before the next one can start (s). */
  swingCooldown: 0.15,
  /** Paddle height when idle, above the floor (m). */
  restHeight: 0.95,
  /** Lateral reach of the paddle from the body at lateral input ±1 (m). */
  lateralReach: 0.32,
  /** Max rate the paddle lateral offset follows its target (input units per second). */
  lateralRate: 6,
  /** How far the swing assist may move the paddle sideways to meet the ball (m). */
  assistReachX: 0.35,
  /** How far the swing assist may move the paddle up or down (m). */
  assistReachY: 0.45,
} as const;

export const AVATAR = {
  /** Max sideways walking speed of the auto-moving character (m/s). */
  maxSpeed: 3.2,
  /** Proportional gain toward the target position (1/s). */
  gain: 7,
  /** Characters never leave this |x| range (m). */
  maxX: 1.3,
} as const;

export const SHOT = {
  /**
   * Allowed timing error around the ideal contact moment (s).
   * Inside this window the swing is retimed to meet the ball.
   */
  timingTolerance: 0.12,
  /** Horizontal ball speed after a rally shot at strength 0 (m/s). */
  minSpeed: 5.5,
  /** Horizontal ball speed after a rally shot at strength 1 (m/s). */
  maxSpeed: 15,
  /** Backhand shots are slightly slower than forehands (multiplier). */
  backhandSpeedFactor: 0.92,
  /** Target landing distance past the net at strength 0 (m). */
  minDepth: 0.55,
  /** Target landing distance past the net at strength 1 (m). */
  maxDepth: 1.15,
  /** Sideways aim at swing direction ±1, measured at the target (m). */
  aimSpread: 0.55,
  /** Sideways aim error at maximum timing error (m); early pulls, late pushes. */
  timingSpread: 0.35,
  /** Vertical speed added per radian of open racket face (m/s per rad). */
  pitchToVy: 2,
  /** Topspin applied at strength 1 (dimensionless, see BALL.magnus). */
  maxTopspin: 1,
  /** Minimum clearance over the net the aim solver tries to keep (m). */
  netClearance: 0.02,
} as const;

export const SERVE = {
  /** Toss start height above the table (m). */
  tossHeight: 0.12,
  /** Upward toss speed (m/s); about 25 cm of rise. */
  tossSpeed: 2.2,
  /** Toss position behind the server's end line (m). */
  tossBehind: 0.12,
  /** Toss position to the server's right of the body (m). */
  tossSide: 0.15,
  /** Toss that falls this far below the table surface is retried (m). */
  tossFailDepth: 0.1,
  /** Horizontal serve speed at strength 0 (m/s). */
  minSpeed: 3.6,
  /** Horizontal serve speed at strength 1 (m/s). */
  maxSpeed: 5.2,
  /** First bounce target, distance from the net on the server's own side (m). */
  ownBounceDepth: 0.6,
  /** Sideways aim of a serve at direction ±1 (m). */
  aimSpread: 0.45,
} as const;

export const RULES = {
  pointsToWinSet: 11, // a set is won at 11 points...
  winBy: 2, // ...with a two-point lead
  setsToWin: 2, // best of three sets
  serveSwitchEvery: 2, // serve changes every two points...
  deuceAt: 10, // ...and after every point once both players reach 10
  /** Pause after a point before the next serve is prepared (s). */
  pointPause: 1.2,
} as const;

export const BOT = {
  /** Standard deviation of the bot's swing timing error (s). */
  timingJitter: 0.05,
  /** Chance per shot that the bot swings far outside the tolerance and misses. */
  missChance: 0.06,
  /** Bot strength range for rally shots. */
  minStrength: 0.25,
  maxStrength: 0.75,
  /** Bot delay before it serves (s), min and max. */
  serveDelayMin: 0.6,
  serveDelayMax: 1.4,
} as const;

/**
 * Gesture recognition (packages/sim/src/gesture.ts). Axes are the player's:
 * right, up and forward (toward the table), derived from the phone's
 * gravity direction at calibration. Rotation rates are in deg/s.
 */
export const GESTURE = {
  /** Forward acceleration that starts a swing (m/s²). Sideways moves never count. */
  swingStart: 12,
  /** Longest wait for the acceleration peak before the swing is reported (ms). */
  swingPeakWait: 50,
  /** Forward acceleration mapped to strength 0 (m/s²). */
  swingMinAccel: 12,
  /** Forward acceleration mapped to strength 1 (m/s²). */
  swingMaxAccel: 48,
  /** No new swing and no sideways tracking for this long after a swing (ms). */
  swingRefractory: 350,
  /** Typical sideways/forward acceleration ratio of a straight swing; aim is measured against it. */
  swingSweepRatio: 0.35,
  /** Aim sensitivity: change in sideways/forward ratio for full aim. */
  swingAimRange: 0.5,
  /** Yaw rate that decides forehand vs backhand when it is clear enough (deg/s). */
  strokeYawRate: 120,
  /** Sideways acceleration that starts a paddle shift (m/s²). */
  shiftStart: 1.5,
  /** Shift ends after acceleration stays below this… (m/s²) */
  shiftQuiet: 0.6,
  /** …for this long (ms). */
  shiftQuietTime: 100,
  /** A shift never lasts longer than this (ms). */
  shiftMaxTime: 1000,
  /** Rotation faster than this means a wrist turn, not a whole-arm shift (deg/s). */
  shiftMaxRotation: 120,
  /** Rotation that cancels a shift already in progress (deg/s). */
  shiftAbortRotation: 200,
  /** Sideways distance that moves the paddle one lateral unit (m); range is -1 … 1. */
  shiftMetresPerUnit: 0.25,
  /** Maximum paddle face tilt from the phone's tilt (rad). */
  maxPitch: 0.6,
  /** Fraction of the phone's tilt passed to the paddle face. */
  pitchGain: 0.5,
} as const;
