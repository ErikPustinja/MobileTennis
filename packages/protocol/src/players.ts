import type { Slot } from './messages.ts';

/** Player colours, identical in the game and on the phone. */
export const PLAYER_COLORS: Record<Slot, string> = {
  0: '#ff7a1a',
  1: '#2f9bff',
};

export const PLAYER_NAMES: Record<Slot, string> = {
  0: 'Igrač 1',
  1: 'Igrač 2',
};
