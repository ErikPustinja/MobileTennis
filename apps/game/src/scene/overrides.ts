import type { Side } from '@mobitenis/sim';

export interface PaddlePose {
  lateral: number;
  pitch: number;
}

/**
 * Newest paddle pose received from a phone, applied to the renderer on the
 * next frame without waiting for a simulation step. Null for keyboard/bot.
 */
export const paddleOverrides: Record<Side, PaddlePose | null> = { 0: null, 1: null };
