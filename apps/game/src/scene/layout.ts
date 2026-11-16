import { PADDLE, TABLE, forward, rightSign, type Side } from '@mobitenis/sim';

export interface View {
  side: Side;
  /** Pixel rectangle in CSS pixels, origin bottom-left (WebGL convention). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Split screen: player 1 left, player 2 right. Single view fills the screen. */
export function viewLayout(width: number, height: number, sides: readonly Side[]): View[] {
  if (sides.length === 1) return [{ side: sides[0]!, x: 0, y: 0, width, height }];
  const half = Math.floor(width / 2);
  return [
    { side: 0, x: 0, y: 0, width: half, height },
    { side: 1, x: half, y: 0, width: width - half, height },
  ];
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view in degrees. */
  fov: number;
}

/** Camera distance behind the player's end line (m). */
const BACK = 2.8;
/** Camera height (m): a little above the shoulder. */
const HEIGHT = 2.05;
/** How much the camera follows the player sideways (0 = fixed, 1 = fully). */
const FOLLOW = 0.45;
/** Camera offset to the player's left, so it looks over the left shoulder (m). */
const SHOULDER = 0.42;

/**
 * Over-the-shoulder camera behind each player. The vertical FOV widens on
 * narrow (split-screen) viewports so the whole table width stays in view.
 */
export function cameraPose(side: Side, avatarX: number, aspect: number): CameraPose {
  const f = forward(side);
  const camZ = -f * (TABLE.halfLength + BACK);
  const left = -rightSign(side) * SHOULDER;
  const position: [number, number, number] = [avatarX * FOLLOW + left, HEIGHT, camZ];
  const target: [number, number, number] = [avatarX * FOLLOW * 0.4 + left * 0.35, TABLE.height + 0.05, f * 0.35];
  // Fit the near end of the table (plus margin) horizontally.
  const nearDist = Math.hypot(BACK - PADDLE.hitPlaneBehind, HEIGHT - TABLE.height);
  const halfWidthNeeded = TABLE.halfWidth * 1.35;
  const hFov = 2 * Math.atan(halfWidthNeeded / nearDist);
  const vFov = 2 * Math.atan(Math.tan(hFov / 2) / Math.max(aspect, 0.1));
  const fov = Math.min(80, Math.max(42, (vFov * 180) / Math.PI));
  return { position, target, fov };
}
