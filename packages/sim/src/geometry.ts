import { PADDLE, TABLE } from './config.ts';
import type { Side } from './types.ts';

/** +1 if the side faces +z (player 1), -1 if it faces -z (player 2). */
export const forward = (side: Side): 1 | -1 => (side === 0 ? 1 : -1);

/**
 * World x direction of the player's right hand. Player 1 faces +z, so their
 * right is -x; player 2 faces -z, so their right is +x. Every "left/right"
 * input is in the player's own perspective and converted here.
 */
export const rightSign = (side: Side): 1 | -1 => (side === 0 ? -1 : 1);

/** z of the plane where a player meets the ball during a rally. */
export const hitPlaneZ = (side: Side): number => -forward(side) * (TABLE.halfLength + PADDLE.hitPlaneBehind);

export const opponent = (side: Side): Side => (side === 0 ? 1 : 0);
