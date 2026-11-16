import type { MatchState, PlayerInput } from '@mobitenis/sim';

/** Anything that can drive one player: keyboard, bot or a phone. */
export interface InputSource {
  readonly kind: 'keyboard' | 'bot' | 'phone';
  /** Called once per simulation step. */
  next(state: MatchState): PlayerInput;
}
